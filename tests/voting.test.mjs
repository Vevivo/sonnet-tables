import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {participantFrom,registrationFresh,voterState,votingWindow,ballotHistory,activityWithEvidence,hasAcceptedSubmission,tableVotingState}=await import(sourceUrl('lib/voting.ts'));
const {matchesTableFilter}=await import(sourceUrl('lib/table-discovery.ts'));
const {actionRecords,actionProblem,explainRejection,packet}=await import(sourceUrl('lib/participation.ts'));
const {validateAction,START,DEADLINE}=await import(sourceUrl('lib/protocol.ts'));
const {ROOM,REFEREE,MANIFEST_HASH}=await import(sourceUrl('lib/sonnet-types.ts'));
const did='did:key:z6MkomW7khvZMAndeL1JevjuRgUe9rbrgjd7evysvdeUHfpX';
const other='did:key:z6MkvNexFbxQ2bP3utGe2W5DdCWeZgMdp7o4gSyvx5Wj53kh';
const now=Date.parse('2026-09-14T12:00:00Z'),fresh={registrationCheckedAt:new Date(now).toISOString(),warning:''};
const voter={did,role:'voter',registration:'confirmed'},team={id:'poem-a',entryId:'entry-a',status:'submitted'};
let seq=0;
function message(from,p,room=ROOM.votes){return {from,room,generation:1,seq:++seq,ts:new Date(START+seq*1000).toISOString(),signatureValid:true,text:JSON.stringify({contest_id:'sonnet-2',...p})};}
const launch=()=>message(REFEREE,{type:'sonnet.launch.v1',configuration:{contest_id:'sonnet-2',referee:REFEREE},package:{sha256:MANIFEST_HASH}},ROOM.rules);
const ballot=(entry,id)=>message(did,{type:'sonnet.ballot.v1',voter_did:did,entry_id:entry,request_id:id});
const receipt=(request,order,status='accepted')=>message(REFEREE,{type:'sonnet.receipt.v1',sender_did:did,request_id:packet(request).request_id,intake_seq:order,status,reason:status==='rejected'?'entry not eligible':''},request.room);

test('an unknown, stale or failed lookup does not recommend immediate registration',()=>{
 for(const check of [{warning:''},{...fresh,warning:'offline'},{...fresh,registrationCheckedAt:new Date(now-120000).toISOString()},{...fresh,registrationCheckedAt:new Date(now+1).toISOString()}]){
  assert.equal(registrationFresh(check,now),false);
  assert.equal(voterState(did,undefined,check,false,now).kind,'unknown');
 }
 assert.equal(voterState(did,undefined,fresh,false,now).kind,'unconfirmed');
 assert.equal(voterState('',undefined,fresh,false,now).kind,'disconnected');
});
test('pending and rejected registrations keep distinct next steps',()=>{
 assert.equal(voterState(did,undefined,fresh,true,now).kind,'pending');
 assert.equal(voterState(did,{registration:'requested'},fresh,false,now).kind,'pending');
 assert.equal(voterState(did,{registration:'rejected'},fresh,false,now).kind,'rejected');
});
test('a stale registration lookup is not presented as proof that the referee has not replied',()=>{
 const person={did,registration:'requested',role:'voter'};
 for(const check of [{warning:'database unavailable'},{registrationCheckedAt:new Date(now-120000).toISOString(),warning:''}]){
  const state=voterState(did,person,check,false,now);
  assert.equal(state.kind,'pending');
  assert.match(state.title,/temporarily unavailable/);
  assert.match(state.text,/cannot confirm whether the referee has answered/);
 }
 assert.match(actionProblem('register',did,person,null,[],now),/original registration/);
 assert.equal(actionProblem('register',did,{...person,registration:'rejected'},null,[],now),null);
});
test('a known accepted role survives incomplete and conflicting newer observations',()=>{
 for(const role of ['writer','organizer']){
  const fixed={did,registration:'confirmed',role};
  const person=participantFrom({did,registration:'rejected',role:'voter'},fixed);
  assert.equal(person,fixed);
  assert.equal(voterState(did,person,{warning:'offline'},false,now).kind,'excluded');
  assert.match(actionProblem('vote',did,person,team,[],now),/Only registered voters/);
 }
 assert.equal(voterState(did,voter,fresh,false,now).kind,'voter');
 assert.equal(voterState(REFEREE,{...voter,did:REFEREE},fresh,false,now).kind,'excluded');
 assert.match(actionProblem('vote',REFEREE,voter,team,[],now),/referee cannot vote/);
});
test('the single contest window includes both exact endpoints',()=>{
 for(const time of [START,now,DEADLINE]){
  assert.equal(votingWindow(time),null);
  assert.equal(actionProblem('vote',did,voter,team,[],time),null);
 }
 for(const time of [START-1,DEADLINE+1]){
  assert.ok(votingWindow(time));
  assert.match(actionProblem('vote',did,voter,team,[],time),/contest window/);
 }
});
test('ballot uses exact authenticated DID and entry ID in the official voting room',()=>{
 const p={type:'sonnet.ballot.v1',contest_id:'sonnet-2',voter_did:did,entry_id:team.entryId,request_id:'vote'};
 assert.doesNotThrow(()=>validateAction(ROOM.votes,p,did));
 assert.throws(()=>validateAction(ROOM.discovery,p,did),/different contest room/);
 assert.throws(()=>validateAction(ROOM.votes,{...p,voter_did:other},did),/your DID/);
 assert.throws(()=>validateAction(ROOM.votes,{...p,entry_id:''},did),/submitted entry/);
 assert.throws(()=>validateAction(ROOM.votes,{...p,contest_id:'sonnet-1'},did),/contest/);
 assert.doesNotThrow(()=>validateAction(ROOM.registration,{type:'sonnet.register.v1',contest_id:'sonnet-2',role:'voter',request_id:'register'},did));
});
test('accepted submission remains votable during eligibility review; completion alone does not',()=>{
 assert.equal(actionProblem('vote',did,voter,team,[],now),null);
 assert.match(actionProblem('vote',did,voter,{...team,status:'completed'},[],now),/accepted submission/);
});
test('completed poem discovery includes pending submissions but a full roster does not qualify',()=>{
 const complete={...team,status:'completed',entryId:null};
 const full={...team,status:'ready',entryId:null,members:Array.from({length:8},(_,i)=>String(i)),confirmed:true};
 assert.equal(matchesTableFilter(complete,'completed',now),true);
 assert.equal(matchesTableFilter(complete,'awaiting-submission',now),true);
 assert.equal(matchesTableFilter(complete,'voting',now),false);
 assert.equal(tableVotingState(complete,now).kind,'awaiting_submission');
 assert.equal(matchesTableFilter(full,'completed',now),false);
 assert.equal(matchesTableFilter(full,'voting',now),false);
 assert.equal(matchesTableFilter(team,'completed',now),true);
 assert.equal(matchesTableFilter(team,'awaiting-submission',now),false);
});
test('all voting entry points require an accepted entry ID and the same contest window',()=>{
 for(const time of [START,now,DEADLINE]){
  assert.equal(tableVotingState(team,time).canVote,true);
  assert.equal(matchesTableFilter(team,'voting',time),true);
 }
 for(const time of [START-1,DEADLINE+1]){
  assert.equal(tableVotingState(team,time).canVote,false);
  assert.equal(matchesTableFilter(team,'voting',time),false);
  assert.equal(matchesTableFilter(team,'completed',time),true);
  assert.equal(matchesTableFilter(team,'submitted',time),true);
 }
 for(const entryId of [null,'']){
  const missing={...team,entryId};
  assert.equal(hasAcceptedSubmission(missing),false);
  assert.equal(matchesTableFilter(missing,'voting',now),false);
  assert.equal(tableVotingState(missing,now).kind,'awaiting_entry');
 }
 assert.equal(tableVotingState({...team,status:'forming',entryId:null,closed:true},now).kind,'room_closed');
});
test('last valid choice uses referee intake rather than message or display order',()=>{
 const a=ballot('a','a'),b=ballot('b','b'),bad=ballot('c','bad');
 const records=actionRecords([launch(),a,b,bad,receipt(a,20),receipt(b,10),receipt(bad,30,'rejected')],did);
 const history=ballotHistory(records,did);
 assert.equal(packet(history.accepted.request).entry_id,'a');
 assert.equal(history.latest.status,'rejected');
 assert.equal(ballotHistory(records,other).accepted,null);
});
test('effective ballot and last rejection survive hundreds of later conversation messages',()=>{
 const a=ballot('a','a'),bad=ballot('b','bad');
 const reg=message(did,{type:'sonnet.register.v1',role:'voter',request_id:'reg'},ROOM.registration);
 const rows=[launch(),a,bad,reg,receipt(a,10),receipt(bad,11,'rejected'),receipt(reg,12,'rejected')];
 for(let i=0;i<210;i++)rows.push(message(did,{type:'sonnet.note.v1',request_id:'note-'+i,text:'later discussion'},ROOM.discovery));
 const records=actionRecords(rows,did),visible=activityWithEvidence(records,did);
 assert.equal(ballotHistory(records.slice(0,35),did).accepted,null);
 assert.equal(packet(ballotHistory(visible,did).accepted.request).entry_id,'a');
 assert.equal(ballotHistory(visible,did).latest.status,'rejected');
 assert.ok(visible.some(r=>packet(r.request).request_id==='reg'));
 assert.equal(new Set(visible.map(r=>r.request.seq)).size,visible.length);
});
test('unreceipted requests and untrusted receipts never become accepted votes',()=>{
 const a=ballot('a','a');
 for(const r of [{...receipt(a,1),from:other},{...receipt(a,1),signatureValid:false},{...receipt(a,1),generation:99}]){
  const history=ballotHistory(actionRecords([launch(),a,r],did),did);
  assert.equal(history.accepted,null);assert.equal(history.pending.length,1);
 }
});
test('ballot and registration failures never suggest word, roster or X publication repairs',()=>{
 for(const reason of ['entry eligibility','missing alphabet letters','invalid generation','publication post mismatch','nonce','unknown']){
  const text=explainRejection(reason,'sonnet.ballot.v1');
  assert.match(text,/exact reason/);
  assert.doesNotMatch(text,/final contributor|publish|syllable|choose a word|Review the exact roster/i);
  assert.doesNotMatch(explainRejection(reason,'sonnet.register.v1'),/final contributor|syllable|choose a word/i);
 }
});
