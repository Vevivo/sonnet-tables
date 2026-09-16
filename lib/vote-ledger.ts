import {CONTEST, REFEREE, ROOM} from './sonnet-types';
import {DID_PATTERN} from './signatures';

export type VoteEvidence={id:string;did:string;requestId:string;intake:number;entry:string|null;ts?:string};
export function tallyEvidence(rows:VoteEvidence[]){
 const requests=new Map<string,VoteEvidence>();
 const conflicts=new Set<string>();
 for(const row of rows){
  if(!DID_PATTERN.test(row.did)||!row.requestId||!Number.isSafeInteger(row.intake)||row.intake<1)continue;
  const key=`${row.did}|${row.requestId}`,old=requests.get(key);
  if(old&&old.entry!==row.entry)conflicts.add(key);
  // An identical request replay cannot acquire a new position in vote order.
  if(!old||row.intake<old.intake)requests.set(key,row);
 }
 const latest=new Map<string,VoteEvidence>();
 for(const [key,row] of requests){
  const choice=conflicts.has(key)?{...row,entry:null}:row,old=latest.get(row.did);
  if(!old||old.intake<choice.intake)latest.set(row.did,choice);
  else if(old.intake===choice.intake&&old.entry!==choice.entry)latest.set(row.did,{...old,entry:null});
 }
 const counts=new Map<string,number>();let unresolved=0;
 for(const row of latest.values()){
  if(typeof row.entry!=='string'||!row.entry.trim()||row.entry.length>256){unresolved++;continue;}
  counts.set(row.entry,(counts.get(row.entry)??0)+1);
 }
 return {counts,receiptCount:requests.size,unresolved};
}

export async function readVoteLedger(db:D1Database){
 const evidence:VoteEvidence[]=[];let after='';
 for(;;){
  const page=await db.prepare(`SELECT r.id,r.ts,
   json_extract(r.body,'$.payload.sender_did') AS did,
   json_extract(r.body,'$.payload.request_id') AS requestId,
   json_extract(r.body,'$.payload.intake_seq') AS intake,
   COALESCE(json_extract(r.body,'$.payload.entry_id'),(
    SELECT json_extract(q.body,'$.payload.entry_id') FROM sonnet_records q
    WHERE q.room=r.room AND q.generation=r.generation
    AND json_extract(q.body,'$.from')=json_extract(r.body,'$.payload.sender_did')
    AND json_extract(q.body,'$.payload.request_id')=json_extract(r.body,'$.payload.request_id')
    AND json_extract(q.body,'$.signatureValid')=1
    AND json_extract(q.body,'$.payload.type')='sonnet.ballot.v1'
    AND json_extract(q.body,'$.payload.contest_id')=?
    AND json_extract(q.body,'$.payload.voter_did')=json_extract(q.body,'$.from')
    ORDER BY q.seq LIMIT 1
   )) AS entry
   FROM sonnet_records r INDEXED BY idx_sonnet_records_vote_receipts
   WHERE json_extract(r.body,'$.from')=? AND r.room=? AND r.id>?
   AND json_extract(r.body,'$.signatureValid')=1
   AND json_extract(r.body,'$.payload.contest_id')=?
   AND json_extract(r.body,'$.payload.type')='sonnet.receipt.v1'
   AND json_extract(r.body,'$.payload.status')='accepted'
   ORDER BY r.id LIMIT 500`).bind(CONTEST,REFEREE,ROOM.votes,after,CONTEST).all<VoteEvidence>();
  evidence.push(...page.results);
  if(page.results.length<500)break;after=page.results.at(-1)!.id;
 }
 // Keep past generations: a transport reset does not erase a voter's ballot.
 // Grouped "unchanged" acknowledgements have no new intake order or choice.
 return {...tallyEvidence(evidence),lastReceiptAt:evidence.filter(r=>DID_PATTERN.test(r.did)&&Number.isSafeInteger(r.intake)&&r.intake>0).map(r=>r.ts??'').sort().at(-1)||null};
}
export async function readVoteCounts(db:D1Database){return (await readVoteLedger(db)).counts;}
