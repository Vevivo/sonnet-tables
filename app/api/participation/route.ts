import {database} from "@/lib/sonnet-db";
import {readRoom} from "@/lib/sonnet-sync";
import {DID_PATTERN,verifyEnvelope} from "@/lib/signatures";
import {ROOM,REFEREE,type Message} from "@/lib/sonnet-types";
import {actionRecords,packet,roleFrom} from "@/lib/participation";
import {activityWithEvidence} from "@/lib/voting";
import {readIdentityHistory} from "@/lib/identity-history";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"};
export async function GET(req:Request){
 try{
  const query=new URL(req.url).searchParams,did=query.get("did")??"",room=query.get("room")??ROOM.registration;
  if(!DID_PATTERN.test(did)||(!Object.values(ROOM).includes(room)&&!/^d-sonnet-2-team-[a-z0-9][a-z0-9_-]{0,15}$/.test(room)))return Response.json({error:"Choose a valid DID and contest room."},{status:400,headers});
  const db=database();let warning="";
  const now=Date.now(),cacheKey=`participation:${did}:${room}`;
  const cached=await db.prepare("SELECT value FROM sonnet_cache WHERE key=? AND expires>?").bind(cacheKey,now).first<{value:string}>();
  if(cached)return Response.json(JSON.parse(cached.value),{headers});
  // A voting-room read alone cannot confirm registration. Shared leases bound live reads.
  await Promise.all([...new Set([ROOM.registration,room])].map(async checkRoom=>{
   const lease=await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE sonnet_cache.expires < ? RETURNING key").bind(`action-room:${checkRoom}`,"reading",now+10000,now).first();
   if(lease)try{
    const data=await readRoom(checkRoom);
    const messages=await Promise.all(data.messages.map(async(m:Message)=>({...m,room:checkRoom,generation:data.generation,signatureValid:await verifyEnvelope(checkRoom,m)})));
    const valid=messages.filter(m=>m.signatureValid&&packet(m).contest_id==="sonnet-2");
    for(let i=0;i<valid.length;i+=40)await db.batch(valid.slice(i,i+40).map(m=>db.prepare("INSERT OR IGNORE INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)").bind(`${checkRoom}:${data.generation}:${m.seq}`,checkRoom,data.generation,m.seq,JSON.stringify({...m,payload:packet(m)}),m.ts)));
    await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(`action-room-checked:${checkRoom}`,new Date().toISOString(),Date.now()+120000).run();
   }catch{warning="Live receipt check is temporarily unavailable. Previously verified records are shown; do not assume an uncertain action failed.";}
  }));
  const registrationCheck=await db.prepare("SELECT value FROM sonnet_cache WHERE key=? AND expires>?").bind(`action-room-checked:${ROOM.registration}`,now).first<{value:string}>();
  const rows=await readIdentityHistory(db,did,{limit:200});
  const launch=await db.prepare("SELECT body FROM sonnet_records WHERE room=? AND json_extract(body,'$.from')=?").bind(ROOM.rules,REFEREE).all<{body:string}>();
  const messages:Message[]=[...rows,...launch.results.map(r=>JSON.parse(r.body))];
  // Keep registration and ballot evidence when later room messages age them out.
  const registry=await readIdentityHistory(db,did,{rooms:[ROOM.registration,ROOM.votes]});
  const records=actionRecords([...messages,...registry],did);
  const tickets=await db.prepare("SELECT value FROM sonnet_cache WHERE key>=? AND key<? AND expires>? ORDER BY expires DESC LIMIT 15").bind(`action:${did}:`,`action:${did};`,now).all<{value:string}>();
  const result={participant:roleFrom(records)??null,actions:activityWithEvidence(records,did),pending:tickets.results.map(r=>JSON.parse(r.value)).filter(t=>!records.some(r=>packet(r.request).request_id===t.requestId)),checkedAt:new Date().toISOString(),registrationCheckedAt:registrationCheck?.value??"",warning};
  await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(cacheKey,JSON.stringify(result),Date.now()+8000).run();
  return Response.json(result,{headers});
 }catch(error){console.error("participation read failed",error instanceof Error?error.message:String(error));return Response.json({error:"Your activity could not be checked. No action was sent."},{status:503,headers});}
}
