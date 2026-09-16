import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sourceUrl} from './source-loader.mjs';
const {readVoteLedger,tallyEvidence}=await import(sourceUrl('lib/vote-ledger.ts'));
const {withVoteTally,displayedVotes,tallyStale}=await import(sourceUrl('lib/vote-tally.ts'));
const {ROOM,REFEREE,emptySnapshot}=await import(sourceUrl('lib/sonnet-types.ts'));
const did='did:key:z6Mk'+'A'.repeat(44),other='did:key:z6Mk'+'B'.repeat(44);
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0000_panoramic_smasher','0001_grey_cardiac','0002_broad_ogun'])sql.exec(readFileSync(`drizzle/${name}.sql`,'utf8'));
 let seq=0;
 const add=(payload,{from=REFEREE,room=ROOM.votes,generation=1,valid=true}={})=>{
  const m={from,room,generation,seq:++seq,ts:'2026-09-16T00:00:00Z',signatureValid:valid,payload:{contest_id:'sonnet-2',...payload}};m.text=JSON.stringify(m.payload);
  sql.prepare('INSERT INTO sonnet_records VALUES(?,?,?,?,?,?)').run(`${room}:${generation}:${seq}`,room,generation,seq,JSON.stringify(m),m.ts);
 };
 const db={prepare(query){return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)};}};}};}};
 return {sql,db,add};
}
const receipt=(entry,order,id='r'+order,sender=did)=>({type:'sonnet.receipt.v1',status:'accepted',sender_did:sender,request_id:id,intake_seq:order,...(entry===null?{}:{entry_id:entry})});
test('recovered signed acceptances count without original ballots; last intake wins across generations',async()=>{
 const {db,add,sql}=database();
 add(receipt('new',20),{generation:2});add(receipt('old',10));
 add(receipt('second',15,'second',other));
 add({...receipt('bad',30),status:'rejected'});
 add({type:'sonnet.receipts.v1',status:'accepted',note:'ballot unchanged',receipts:[{sender_did:did,request_id:'repeat'}]});
 const result=await readVoteLedger(db);
 assert.deepEqual([...result.counts].sort(),[['new',1],['second',1]]);assert.equal(result.unresolved,0);sql.close();
});
test('forged, unsigned, other-room, other-contest and malformed evidence never adds votes',async()=>{
 const {db,add,sql}=database();
 add(receipt('valid',1));
 add(receipt('forged',100),{from:other});add(receipt('unsigned',101),{valid:false});
 add(receipt('other-room',102),{room:ROOM.results});add({...receipt('other-contest',103),contest_id:'sonnet-1'});
 add(receipt('bad-order',1.5));add(receipt('bad-did',104,'bad','not-a-DID'));
 assert.deepEqual([...((await readVoteLedger(db)).counts)],[['valid',1]]);sql.close();
});
test('old receipt format can use its exact signed ballot, but a missing newer choice cannot restore an older vote',async()=>{
 const {db,add,sql}=database();
 add({type:'sonnet.ballot.v1',request_id:'legacy',voter_did:did,entry_id:'old'},{from:did});
 add(receipt(null,1,'legacy'));
 assert.equal((await readVoteLedger(db)).counts.get('old'),1);
 add(receipt(null,2,'missing'));
 const result=await readVoteLedger(db);assert.equal(result.counts.size,0);assert.equal(result.unresolved,1);sql.close();
});
test('duplicate request acknowledgements cannot reorder the effective vote; ambiguous orders remain uncounted',()=>{
 const row=(entry,intake,requestId)=>({id:requestId,did,entry,intake,requestId});
 const result=tallyEvidence([row('old',90,'same'),row('new',20,'change'),row('old',10,'same')]);
 assert.deepEqual([...result.counts],[['new',1]]);
 const conflict=tallyEvidence([row('a',10,'a'),row('b',10,'b')]);
 assert.equal(conflict.counts.size,0);assert.equal(conflict.unresolved,1);
});
test('unknown counts render as unknown; delayed responses do not replace a newer tally or reset saved counts',()=>{
 const base={...emptySnapshot,teams:[{id:'a',entryId:'a',validVotes:99}]};
 assert.equal(displayedVotes(withVoteTally(base).teams[0]),'—');
 const tally={counts:{a:3},checkedAt:'2026-09-16T01:00:00Z',coverage:'partial',status:'ready',warning:'',receiptCount:3,unresolved:0};
 const ready=withVoteTally(base,tally);assert.equal(displayedVotes(ready.teams[0]),'3');
 assert.equal(withVoteTally(ready,{...tally,counts:{a:1},checkedAt:'2026-09-16T00:00:00Z'}).teams[0].validVotes,3);
 const failed=withVoteTally(ready,{...tally,counts:{},checkedAt:null,status:'unavailable'});
 assert.equal(displayedVotes(failed.teams[0]),'3');assert.equal(tallyStale(failed.voteTally),true);
 assert.equal(tallyStale(tally,Date.parse('2026-09-16T01:03:00Z')),true);
});
