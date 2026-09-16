import {database} from '@/lib/sonnet-db';
import {decodeSnapshot} from '@/lib/snapshot-cache';
import {DID_PATTERN} from '@/lib/signatures';
import {ROOM,REFEREE,emptySnapshot,type Snapshot,type Message} from '@/lib/sonnet-types';
import {actionRecords,type ActionRecord} from '@/lib/participation';
import {buildMemberProfile} from '@/lib/member-profile';
import {GET as readParticipation} from '../participation/route';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
export async function GET(req:Request){
 try{
  const did=new URL(req.url).searchParams.get('did')??'';
  if(!DID_PATTERN.test(did))return Response.json({error:'Enter a complete Ed25519 DID.'},{status:400,headers});
  const db=database(),cacheKey=`profile:${did}`,now=Date.now();
  const previous=await db.prepare('SELECT value,expires FROM sonnet_cache WHERE key=?').bind(cacheKey).first<{value:string;expires:number}>();
  if(previous&&previous.expires>now)return Response.json(JSON.parse(previous.value),{headers});
  const activityUrl=new URL(req.url);activityUrl.searchParams.set('room',ROOM.votes);
  const activityResponse=await readParticipation(new Request(activityUrl));
  if(!activityResponse.ok)return Response.json({error:'The profile could not be verified. Please try again.'},{status:503,headers});
  const activity=await activityResponse.json() as {participant:any;actions:ActionRecord[];checkedAt:string;warning:string};
  const cached=await db.prepare('SELECT value FROM sonnet_cache WHERE key=?').bind('sonnet-2:snapshot:participation-v3').first<{value:string}>();
  const snapshot=cached?await decodeSnapshot<Snapshot>(cached.value):emptySnapshot;
  // Dedicated ballot history prevents busy conversations from hiding the effective vote.
  const query=(acceptedOnly:boolean)=>db.prepare(`SELECT q.body AS request,r.body AS receipt FROM sonnet_records r INDEXED BY idx_sonnet_records_receipt_sender
   JOIN sonnet_cursors c ON c.room=r.room AND c.generation=r.generation
   JOIN sonnet_records q ON q.room=r.room AND q.generation=r.generation AND json_extract(q.body,'$.from')=json_extract(r.body,'$.payload.sender_did') AND json_extract(q.body,'$.payload.request_id')=json_extract(r.body,'$.payload.request_id')
   WHERE r.room=? AND json_extract(r.body,'$.payload.sender_did')=? AND json_extract(r.body,'$.from')=?
   AND json_extract(r.body,'$.payload.type')='sonnet.receipt.v1' AND json_extract(q.body,'$.payload.type')='sonnet.ballot.v1'
   ${acceptedOnly?"AND json_extract(r.body,'$.payload.status')='accepted'":''}
   ORDER BY json_extract(r.body,'$.payload.intake_seq') DESC LIMIT ${acceptedOnly?1:30}`).bind(ROOM.votes,did,REFEREE).all<{request:string;receipt:string}>();
  const [recent,effective,launch]=await Promise.all([query(false),query(true),db.prepare("SELECT body FROM sonnet_records WHERE room=? AND json_extract(body,'$.from')=?").bind(ROOM.rules,REFEREE).all<{body:string}>()]);
  const messages:Message[]=[...launch.results.map(r=>JSON.parse(r.body)),...[...recent.results,...effective.results].flatMap(r=>[JSON.parse(r.request),JSON.parse(r.receipt)])];
  const ballotRecords=actionRecords(messages,did);
  const records=[...new Map([...activity.actions,...ballotRecords].map(r=>[`${r.request.room}:${r.request.generation}:${r.request.seq}`,r])).values()];
  const profile=buildMemberProfile(snapshot,did,activity.participant,records,activity.checkedAt,activity.warning);
  await db.prepare('INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(cacheKey,JSON.stringify(profile),Date.now()+15000).run();
  return Response.json(profile,{headers});
 }catch(e){console.error('member profile failed',e instanceof Error?e.message:String(e));return Response.json({error:'Your profile could not be refreshed. Previously verified information is preserved.'},{status:503,headers});}
}
