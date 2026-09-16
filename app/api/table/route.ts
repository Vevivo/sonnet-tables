import {database} from "@/lib/sonnet-db";
import {readRoom,backfillTeamHistory} from "@/lib/sonnet-sync";
import {projectMessages} from "@/lib/sonnet-projector";
import {packet} from "@/lib/participation";
import {verifyEnvelope} from "@/lib/signatures";
import {enrichAcceptedPoems} from "@/lib/accepted-poem";
import {encodeSnapshot,decodeSnapshot} from "@/lib/snapshot-cache";
import {REFEREE,ROOM,type Message} from "@/lib/sonnet-types";
import {readIdentityHistory} from "@/lib/identity-history";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"};
export async function GET(req:Request){
 try{
  const id=new URL(req.url).searchParams.get("team")??"";if(!/^[a-z0-9][a-z0-9_-]{0,15}$/.test(id))return Response.json({error:"Choose a valid table."},{status:400,headers});
  const db=database(),room=`d-sonnet-2-team-${id}`,cacheKey=`focus:${id}`,now=Date.now();
  const cached=await db.prepare("SELECT value,expires FROM sonnet_cache WHERE key=?").bind(cacheKey).first<{value:string;expires:number}>();
  if(cached&&cached.expires>now)return Response.json(await decodeSnapshot(cached.value),{headers});
  const data=await readRoom(room);const live:Message[]=await Promise.all(data.messages.map(async(m:Message)=>({...m,room,generation:data.generation,signatureValid:await verifyEnvelope(room,m)})));
  const valid=live.filter(m=>m.signatureValid);
  for(let i=0;i<valid.length;i+=40)await db.batch(valid.slice(i,i+40).map(m=>db.prepare("INSERT OR IGNORE INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)").bind(`${room}:${data.generation}:${m.seq}`,room,data.generation,m.seq,JSON.stringify({...m,payload:packet(m)}),m.ts)));
  const queries=[
   db.prepare("SELECT body FROM sonnet_records WHERE room=? AND json_extract(body,'$.from')=?").bind(ROOM.rules,REFEREE),
   db.prepare("SELECT body FROM sonnet_records WHERE room=? AND generation=? ORDER BY seq").bind(room,data.generation),
   db.prepare("SELECT r.body FROM sonnet_records r JOIN sonnet_cursors c ON c.room=r.room AND c.generation=r.generation WHERE r.room IN (?,?,?) AND json_extract(r.body,'$.payload.game_id')=?").bind(ROOM.results,ROOM.discovery,ROOM.submissions,id),
   db.prepare(`SELECT DISTINCT r.body FROM sonnet_records q JOIN sonnet_cursors c ON c.room=q.room AND c.generation=q.generation JOIN sonnet_records r ON r.room=q.room AND r.generation=q.generation
    AND json_extract(r.body,'$.payload.sender_did')=json_extract(q.body,'$.from') AND json_extract(r.body,'$.payload.request_id')=json_extract(q.body,'$.payload.request_id')
    WHERE q.room IN (?,?) AND json_extract(q.body,'$.payload.game_id')=? AND json_extract(r.body,'$.from')=? AND json_extract(r.body,'$.payload.type')='sonnet.receipt.v1'`).bind(ROOM.discovery,ROOM.submissions,id,REFEREE)
  ];
  const parts=await Promise.all(queries.map(q=>q.all<{body:string}>()));const records:Message[]=parts.flatMap(p=>p.results.map(r=>JSON.parse(r.body)));
  const dids=[...new Set(records.filter(m=>packet(m).type==="sonnet.roster.v1").flatMap(m=>Array.isArray(packet(m).members)?packet(m).members:[]))].filter(d=>typeof d==="string").slice(0,64);
  for(const did of dids)records.push(...await readIdentityHistory(db,did,{rooms:[ROOM.registration]}));
  const unique=[...new Map(records.map(m=>[`${m.room}:${m.generation}:${m.seq}`,m])).values()];
  let state=projectMessages(unique,REFEREE),team=state.teams.find(t=>t.id===id);
  let historyWarning:string|undefined;
  if(team?.frozen&&!team.ledgerComplete){
   try{if(await backfillTeamHistory(room,data.generation)){
    const recovered=await db.prepare("SELECT body FROM sonnet_records WHERE room=? AND generation=? ORDER BY seq").bind(room,data.generation).all<{body:string}>();
    state=projectMessages([...unique.filter(m=>m.room!==room),...recovered.results.map(r=>JSON.parse(r.body))],REFEREE);team=state.teams.find(t=>t.id===id);
   }}catch{historyWarning="Earlier poem history is temporarily unavailable. The accepted submission remains valid.";}
  }
  try{await enrichAcceptedPoems(state);}catch{historyWarning="Accepted turns are saved. Poem text is waiting for the frozen dictionary.";}
  if(!team||!state.launchSeen)return Response.json({error:"The table's referee evidence is not yet available.",messages:live},{status:409,headers});
  team.lastCheckedAt=new Date().toISOString();const result={team,messages:live,connected:true,checkedAt:team.lastCheckedAt,...(historyWarning?{warning:historyWarning}:{})};
  await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(cacheKey,await encodeSnapshot(result),Date.now()+12000).run();
  return Response.json(result,{headers});
 }catch(error){console.error("focused table read failed",error instanceof Error?error.message:String(error));return Response.json({error:"This table could not be refreshed. The last verified state remains visible; no action was sent."},{status:503,headers});}
}
