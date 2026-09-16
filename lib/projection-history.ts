import {REFEREE,ROOM,type Message} from "./sonnet-types";
import {packet} from "./participation";

// Registration and voting traffic is much larger than table history. Read the
// evidence needed for the current registry and tally without loading that traffic
// into the lobby's object graph. Full signed records stay in the shared archive.
export async function readProjectionHistory(db:D1Database){
 const records:Message[]=[],notes=new Map<string,Message[]>();let after="";
 for(;;){
  // Batch four bounded pages over one keyset. Every row remains available;
  // only the number of network round trips changes.
  const pages=await db.batch<{id:string;body:string}>([0,500,1000,1500].map(offset=>db.prepare("SELECT r.id,r.body FROM sonnet_records r JOIN sonnet_cursors c ON r.room=c.room AND r.generation=c.generation WHERE r.id>? AND r.room NOT IN (?,?,?) ORDER BY r.id LIMIT 500 OFFSET ?").bind(after,ROOM.registration,ROOM.votes,ROOM.campaign,offset)));
  const rows=pages.flatMap(p=>p.results);
  for(const row of rows){const m=JSON.parse(row.body) as Message,p=packet(m);if(["sonnet.note.v1","sonnet.recruit.v1"].includes(p.type)||!p.type){const key=p.coordination==="roster_proposal"?`plan:${m.room}|${p.game_id}|${m.from}`:`${m.room}|${p.game_id??m.from}`;const group=notes.get(key)??[];group.push(m);group.sort((a,b)=>b.seq-a.seq);if(group.length>30)group.length=30;notes.set(key,group);}else records.push(m);}
  if(rows.length<2000)break;after=rows.at(-1)!.id;
 }
 for(const group of notes.values())records.push(...group);
 const registry=await db.prepare("SELECT generation FROM sonnet_cursors WHERE room=?").bind(ROOM.registration).first<{generation:number}>();
 if(registry){let offset=0;for(;;){
  const page=await db.prepare(`WITH accepted AS (
   SELECT id,json_extract(body,'$.payload.sender_did') AS did,json_extract(body,'$.payload.request_id') AS request_id,
   ROW_NUMBER() OVER (PARTITION BY json_extract(body,'$.payload.sender_did') ORDER BY json_extract(body,'$.payload.intake_seq'),seq) AS position
   FROM sonnet_records WHERE room=? AND generation=? AND json_extract(body,'$.from')=? AND json_extract(body,'$.signatureValid')=1
   AND json_extract(body,'$.payload.type')='sonnet.receipt.v1' AND json_extract(body,'$.payload.status')='accepted' AND json_extract(body,'$.payload.role')='writer'
  ) SELECT q.body AS request,r.body AS receipt FROM accepted a JOIN sonnet_records r ON r.id=a.id
  JOIN sonnet_records q ON q.room=? AND q.generation=? AND json_extract(q.body,'$.from')=a.did AND json_extract(q.body,'$.payload.request_id')=a.request_id
  WHERE a.position=1 AND json_extract(q.body,'$.payload.type')='sonnet.register.v1' AND json_extract(q.body,'$.signatureValid')=1
  ORDER BY a.id,q.seq LIMIT 150 OFFSET ?`).bind(ROOM.registration,registry.generation,REFEREE,ROOM.registration,registry.generation,offset).all<{request:string;receipt:string}>();
  for(const r of page.results)records.push(JSON.parse(r.request),JSON.parse(r.receipt));
  if(page.results.length<150)break;offset+=150;
 }}
 return records;
}
// The referee's signed entry_id is sufficient evidence even when the ballot
// itself has aged out of the transport ring.
export {readVoteCounts} from './vote-ledger';
