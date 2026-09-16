import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {actionRecords,actionProblem,lineProgress,roleFrom}=await import(sourceUrl('lib/participation.ts'));
const {projectMessages}=await import(sourceUrl('lib/sonnet-projector.ts'));
const {ROOM,REFEREE,MANIFEST_HASH}=await import(sourceUrl('lib/sonnet-types.ts'));
const did='did:key:z6MkomW7khvZMAndeL1JevjuRgUe9rbrgjd7evysvdeUHfpX';
const other='did:key:z6MkvNexFbxQ2bP3utGe2W5DdCWeZgMdp7o4gSyvx5Wj53kh';
let seq=0;
const row=(from,p,room=ROOM.discovery,generation=1)=>({from,room,generation,seq:++seq,ts:new Date(1789140000000+seq*1000).toISOString(),signatureValid:true,text:JSON.stringify({contest_id:'sonnet-2',...p})});
const launch=()=>row(REFEREE,{type:'sonnet.launch.v1',configuration:{contest_id:'sonnet-2',referee:REFEREE},package:{sha256:MANIFEST_HASH}},ROOM.rules);
const receipt=(r,fields={})=>row(REFEREE,{type:'sonnet.receipt.v1',request_id:JSON.parse(r.text).request_id,sender_did:r.from,intake_seq:seq+1,status:'accepted',...fields},r.room,r.generation);
test('delivery, notes, rejection and launch-anchored acceptance remain distinct',()=>{
 const r=row(did,{type:'sonnet.word.v1',request_id:'word',word:'night'},'d-sonnet-2-team-a');
 assert.equal(actionRecords([r],did)[0].status,'pending');
 assert.equal(actionRecords([r,receipt(r)],did)[0].status,'pending');
 assert.equal(actionRecords([launch(),r,receipt(r,{status:'rejected',reason:'stale version'})],did)[0].status,'rejected');
 const note=row(did,{type:'sonnet.note.v1',request_id:'note',text:'Invitation only'});
 assert.equal(actionRecords([note],did)[0].status,'recorded');
});
test('another DID, room or generation cannot supply an action receipt',()=>{
 const r=row(did,{type:'sonnet.ballot.v1',request_id:'vote'},ROOM.votes),base=receipt(r);
 for(const wrong of [{...base,from:other},{...base,room:ROOM.discovery},{...base,generation:2},{...base,signatureValid:false}])assert.equal(actionRecords([launch(),r,wrong],did)[0].status,'pending');
 assert.equal(actionRecords([launch(),r,base],did)[0].status,'accepted');
});
test('accepted voter registration remains fixed after a conflicting rejected writer registration',()=>{
 const first=row(did,{type:'sonnet.register.v1',role:'voter',request_id:'reg'},ROOM.registration),later=row(did,{type:'sonnet.register.v1',role:'writer',request_id:'switch'},ROOM.registration);
 const records=actionRecords([launch(),first,receipt(first,{participant_did:did,role:'voter'}),later,receipt(later,{status:'rejected'})],did);
 assert.equal(roleFrom(records).role,'voter');assert.equal(roleFrom(records).registration,'confirmed');
});
test('a public DID and writer registration do not grant a vote',()=>{
 const team={id:'a',status:'submitted',entryId:'a'},now=Date.parse('2026-09-13T00:00:00Z');
 assert.match(actionProblem('vote',did,undefined,team,[],now),/Register/);
 assert.match(actionProblem('vote',did,{role:'writer',registration:'confirmed'},team,[],now),/Only registered voters/);
 assert.equal(actionProblem('vote',did,{role:'voter',registration:'confirmed'},team,[],now),null);
 assert.match(actionProblem('vote',did,{role:'voter',registration:'confirmed'},{...team,entryId:null},[],now),/accepted submission/);
});
test('same writer cannot go twice and an unsubmitted frozen team blocks another seat',()=>{
 const person={role:'writer',registration:'confirmed'},now=Date.parse('2026-09-13T00:00:00Z');
 const team={id:'a',members:[did],confirmed:true,ledgerComplete:true,stateHash:'a'.repeat(64),lastCheckedAt:new Date(now).toISOString(),lastWriter:did,status:'writing',frozen:true};
 assert.match(actionProblem('word',did,person,team,[team],now),/Another teammate/);
 assert.match(actionProblem('roster',did,person,{id:'b'},[team],now),/committed to a/);
 assert.match(actionProblem('withdraw',did,person,team,[team],now),/before the first/);
});
test('line progression uses exact dictionary syllables and rejects overflow',()=>{
 const lex=new Map([['light',1],['beautiful',3]]);
 assert.deepEqual(lineProgress([...Array(10).fill('light'),'beautiful'],lex),{completed:1,syllables:3,remaining:7,current:'beautiful',line:2});
 assert.throws(()=>lineProgress([...Array(8).fill('light'),'beautiful'],lex),/reconciliation/);
});
test('latest accepted ballot replaces an old vote; invalid replacement does not erase it',()=>{
 const rows=[launch()];
 for(const id of ['a','b']){const r=row(did,{type:'sonnet.submit.v1',game_id:id,room_generation:1,request_id:'submit-'+id},ROOM.submissions);rows.push(row(REFEREE,{type:'sonnet.setup.v1',game_id:id,poem_room:'d-sonnet-2-team-'+id,room_generation:1},ROOM.results),r,receipt(r,{entry_id:id}));}
 const a=row(other,{type:'sonnet.ballot.v1',voter_did:other,entry_id:'a',request_id:'vote-a'},ROOM.votes),b=row(other,{type:'sonnet.ballot.v1',voter_did:other,entry_id:'b',request_id:'vote-b'},ROOM.votes),invalid=row(other,{type:'sonnet.ballot.v1',voter_did:other,entry_id:'a',request_id:'bad'},ROOM.votes);
 rows.push(a,receipt(a),b,receipt(b),invalid,receipt(invalid,{status:'rejected'}));
 const s=projectMessages(rows,REFEREE);assert.equal(s.teams.find(t=>t.id==='a').validVotes,0);assert.equal(s.teams.find(t=>t.id==='b').validVotes,1);
});
test('host roster proposals do not seat writers or establish referee approval',()=>{
 const members=[did,other,'did:key:z6Mkvr2RNSXhJeYtqxmGuD6oe9Jv7QopS3BD8mNb3nPKRC7j','did:key:z6MkiaXbLah55hwZioUtNRosjxsokpA8TYTQSWFPsyJNnspr'];
 const rows=[launch(),row(did,{type:'sonnet.team-request.v1',request_id:'create',game_id:'a'}),row(REFEREE,{type:'sonnet.setup.v1',game_id:'a',poem_room:'d-sonnet-2-team-a',room_generation:1},ROOM.results),row(did,{type:'sonnet.note.v1',request_id:'plan',game_id:'a',coordination:'roster_proposal',members,room_generation:1,text:'Review this roster.'})];
 const t=projectMessages(rows,REFEREE).teams[0];assert.ok(t.hostPlan);assert.equal(t.confirmed,false);assert.equal(t.members.length,0);
});
