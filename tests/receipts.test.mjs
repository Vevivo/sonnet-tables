import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {projectMessages,recruitmentHints}=await import(sourceUrl('lib/sonnet-projector.ts'));
const {ROOM,REFEREE,MANIFEST_HASH}=await import(sourceUrl('lib/sonnet-types.ts'));
const {teamFit,routeWords}=await import(sourceUrl('lib/team-fit.ts'));
const {tableWaiting}=await import(sourceUrl('lib/membership-status.ts'));
const dids=['did:key:z6MkomW7khvZMAndeL1JevjuRgUe9rbrgjd7evysvdeUHfpX','did:key:z6Mkvr2RNSXhJeYtqxmGuD6oe9Jv7QopS3BD8mNb3nPKRC7j','did:key:z6MkiaXbLah55hwZioUtNRosjxsokpA8TYTQSWFPsyJNnspr','did:key:z6MkgXnKEkaTt6Hrir3KQzE1JGy7eiPBbwJypBYvW4v9ue6Q'];
let seq=0;const row=(from,p,room=ROOM.discovery)=>({from,room,generation:1,seq:++seq,ts:new Date(1789140000000+seq*1000).toISOString(),signatureValid:true,text:JSON.stringify({contest_id:'sonnet-2',...p})});
const launch=()=>row(REFEREE,{type:'sonnet.launch.v1',configuration:{contest_id:'sonnet-2',referee:REFEREE},package:{sha256:MANIFEST_HASH}},ROOM.rules);
function receipt(m,fields={}){return row(REFEREE,{type:'sonnet.receipt.v1',request_id:JSON.parse(m.text).request_id,sender_did:m.from,intake_seq:seq+1,status:'accepted',...fields},m.room);}
function fixture(){const rows=[launch(),row(REFEREE,{type:'sonnet.setup.v1',game_id:'alpha',poem_room:'d-sonnet-2-team-alpha',room_generation:1},ROOM.results)];for(const d of dids){const r=row(d,{type:'sonnet.register.v1',request_id:'reg-'+d,role:'writer',x_account_url:'https://x.com/writer'},ROOM.registration);rows.push(r,receipt(r,{participant_did:d,role:'writer',x_account_url:'https://x.com/writer'}));}for(const d of dids){const r=row(d,{type:'sonnet.roster.v1',request_id:'roster-'+d,game_id:'alpha',poem_room:'d-sonnet-2-team-alpha',room_generation:1,members:dids});rows.push(r,receipt(r,{roster_ready:d===dids[3],state_hash:'a'.repeat(64)}));}return rows;}
test('only launch-anchored, sender/request-correlated receipts establish membership',()=>{const rows=fixture(),s=projectMessages(rows,REFEREE);assert.equal(s.launchSeen,true);assert.equal(s.writers.filter(w=>w.registration==='confirmed').length,4);assert.equal(s.teams[0].confirmed,true);assert.equal(s.teams[0].acceptedConsents.length,4);assert.equal(s.teams[0].version,0);assert.equal(projectMessages(rows.filter(m=>m.room!==ROOM.rules),REFEREE).teams[0].confirmed,false);});
test('same request ID from a different DID cannot steal registration or roster approval',()=>{const rows=fixture(),r=row(dids[0],{type:'sonnet.register.v1',request_id:'collision',role:'writer',x_account_url:'https://x.com/a'},ROOM.registration);const fake=receipt(r,{sender_did:dids[1],participant_did:dids[0],role:'writer',x_account_url:'https://x.com/a'});const s=projectMessages([launch(),r,fake],REFEREE);assert.notEqual(s.writers[0].registration,'confirmed');});
test('changing the room generation prevents old consent from becoming ready',()=>{const rows=fixture();rows.push(row(REFEREE,{type:'sonnet.resetup.v1',game_id:'alpha',poem_room:'d-sonnet-2-team-alpha',room_generation:2},ROOM.results));const t=projectMessages(rows,REFEREE).teams[0];assert.equal(t.generation,2);assert.equal(t.confirmed,false);assert.equal(t.members.length,0);});
test('accepted words require an unbroken request/hash/version chain; proposals and false completion do not count',()=>{const rows=fixture();const r=row(dids[0],{type:'sonnet.word.v1',request_id:'word1',game_id:'alpha',room_generation:1,version:0,previous_state_hash:'a'.repeat(64),word:'love'},'d-sonnet-2-team-alpha');rows.push(r,receipt(r,{state_hash:'b'.repeat(64),version:1,complete:false}));let t=projectMessages(rows,REFEREE).teams[0];assert.deepEqual(t.words,['love']);assert.equal(t.frozen,true);assert.equal(t.status,'writing');assert.equal(t.version,1);rows.push(row(dids[1],{type:'sonnet.poem-complete.v1',game_id:'alpha',poem:'fake'}));assert.notEqual(projectMessages(rows,REFEREE).teams[0].status,'completed');const broken=row(dids[1],{type:'sonnet.word.v1',request_id:'word3',game_id:'alpha',room_generation:1,version:2,previous_state_hash:'c'.repeat(64),word:'night'},'d-sonnet-2-team-alpha');rows.push(broken,receipt(broken,{state_hash:'d'.repeat(64),version:3,complete:false}));t=projectMessages(rows,REFEREE).teams[0];assert.equal(t.ledgerComplete,false);assert.equal(t.stateHash,null);});
test('DID fit checks one signer per word and detects alternating-writer dead ends',()=>{const t=projectMessages(fixture(),REFEREE).teams[0];t.members=[dids[1]];t.requestedLetters='aflw';const fit=teamFit(dids[0],t);assert.equal(fit.requested,'aflw');assert.equal(routeWords('love love',[dids[0]]).feasible,false);assert.equal(routeWords('love love',[dids[0],dids[1]]).rows.length,2);});
test('recruitment needs are explicitly labelled, participant claims cannot close another host table',()=>{const m=row(dids[1],{type:'sonnet.note.v1',game_id:'bae-2',text:'Open seats. My alphabet misses a/f/l/w; yours cover all four.'});assert.equal(recruitmentHints(m).requested,'aflw');const request=row(dids[1],{type:'sonnet.team-request.v1',game_id:'bae-2',request_id:'room'});const other=row(dids[0],{type:'sonnet.note.v1',game_id:'bae-2',text:'recruitment closed'});const t=projectMessages([request,m,other],null).teams[0];assert.equal(t.closed,false);assert.equal(t.availableRequest,true);});

test('three accepted consents name the missing writer without claiming a confirmed team',()=>{
 const rows=fixture().slice(0,-2),s=projectMessages(rows,REFEREE),t=s.teams[0];
 assert.equal(t.confirmed,false);
 assert.deepEqual(t.memberStates.map(m=>m.status),['consent_accepted','consent_accepted','consent_accepted','signature_pending']);
 assert.equal(s.writers.some(w=>w.confirmedTeams.length),false);
 assert.equal(tableWaiting(t,[{did:dids[3],name:'Missing writer'}]),'Needs signature: Missing writer');
});
test('an observed signature, a rejected receipt and full roster confirmation remain distinct',()=>{
 const rows=fixture(),lastSignature=rows.at(-2);
 let t=projectMessages(rows.slice(0,-1),REFEREE).teams[0];
 assert.equal(t.memberStates[3].status,'referee_pending');
 assert.equal(t.memberStates[3].signature.seq,lastSignature.seq);
 const rejected=receipt(lastSignature,{status:'rejected',reason:'registration required'});
 t=projectMessages([...rows.slice(0,-1),rejected],REFEREE).teams[0];
 assert.equal(t.memberStates[3].status,'rejected');
 assert.equal(t.memberStates[3].reason,'registration required');
 assert.equal(t.memberStates[3].receipt.seq,rejected.seq);
 t=projectMessages(rows,REFEREE).teams[0];
 assert.deepEqual(t.memberStates.map(m=>m.status),Array(4).fill('confirmed'));
});
test('accepted consent retains its acceptance evidence after a rejected repeat',()=>{
 const rows=fixture().slice(0,-2);
 const repeat=row(dids[0],{type:'sonnet.roster.v1',request_id:'repeat',game_id:'alpha',poem_room:'d-sonnet-2-team-alpha',room_generation:1,members:dids});
 rows.push(repeat,receipt(repeat,{status:'rejected',reason:'duplicate'}));
 const member=projectMessages(rows,REFEREE).teams[0].memberStates[0];
 assert.equal(member.status,'consent_accepted');
 assert.equal(JSON.parse(member.receipt.text).status,'accepted');
 assert.notEqual(member.signature.seq,repeat.seq);
});
test('pending and accepted withdrawals are not presented as accepted seats',()=>{
 const rows=fixture().slice(0,-2);
 const withdraw=row(dids[0],{type:'sonnet.withdraw.v1',request_id:'withdraw',game_id:'alpha',room_generation:1});
 let member=projectMessages([...rows,withdraw],REFEREE).teams[0].memberStates[0];
 assert.equal(member.status,'withdrawal_pending');
 assert.equal(member.signature.seq,withdraw.seq);
 assert.equal(member.receipt,null);
 const acceptedWithdrawal=receipt(withdraw);
 member=projectMessages([...rows,withdraw,acceptedWithdrawal],REFEREE).teams[0].memberStates[0];
 assert.equal(member.status,'withdrawn');
 assert.equal(member.receipt.seq,acceptedWithdrawal.seq);
});
test('partial word history cannot assert a confirmed roster',()=>{
 const rows=fixture().slice(0,-2);
 const word=row(dids[0],{type:'sonnet.word.v1',request_id:'partial-word',game_id:'alpha',room_generation:1,version:0,previous_state_hash:'a'.repeat(64),word:'love'},'d-sonnet-2-team-alpha');
 const s=projectMessages([...rows,word,receipt(word,{state_hash:'b'.repeat(64),version:1})],REFEREE);
 assert.equal(s.teams[0].frozen,true);
 assert.equal(s.teams[0].confirmed,false);
 assert.equal(s.writers.some(w=>w.confirmedTeams.length),false);
});

test('voting and campaign messages do not create phantom writers',()=>{
 const rows=fixture();
 const voter='did:key:z6MkvNexFbxQ2bP3utGe2W5DdCWeZgMdp7o4gSyvx5Wj53kh';
 const ballot=row(voter,{type:'sonnet.ballot.v1',request_id:'ballot',voter_did:voter,entry_id:'entry'},ROOM.votes);
 rows.push(ballot,receipt(ballot),row(voter,{type:'sonnet.note.v1',text:'Vote for us'},'d-sonnet-2-campaign'));
 assert.equal(projectMessages(rows,REFEREE).writers.some(w=>w.did===voter),false);
});
test('team-room word requests can infer their game from the signed room',()=>{
 const rows=fixture();
 const word=row(dids[0],{type:'sonnet.word.v1',request_id:'word-no-game',room_generation:1,version:0,previous_state_hash:'a'.repeat(64),word:'love'},'d-sonnet-2-team-alpha');
 rows.push(word,receipt(word,{version:1,state_hash:'b'.repeat(64)}));
 assert.deepEqual(projectMessages(rows,REFEREE).teams[0].words,['love']);
});
test('accepted submission closes seating and takes precedence over recruitment notices',async()=>{
 const {tableLifecycle,tableStatusLabel,seatsClosed}=await import(sourceUrl('lib/table-lifecycle.ts'));
 const rows=fixture();
 const submit=row(dids[0],{type:'sonnet.submit.v1',request_id:'submit',game_id:'alpha',room_generation:1,poem_sha256:'c'.repeat(64)},ROOM.submissions);
 rows.push(submit,receipt(submit,{entry_id:'accepted-entry'}));
 const t=projectMessages(rows,REFEREE).teams[0];
 assert.equal(t.status,'submitted');assert.equal(t.frozen,true);assert.equal(t.availableRequest,false);
 t.closed=true;
 assert.equal(tableLifecycle(t),'submitted');assert.equal(tableStatusLabel(t),'Submission accepted');
 assert.equal(seatsClosed(t),true);assert.equal(teamFit(dids[0],t).eligible,false);
 assert.match(tableWaiting(t,[]),/Submission accepted/);
 t.status='completed';t.frozen=false;
 assert.equal(seatsClosed(t),true);assert.match(tableWaiting(t,[]),/pending/);
});

test('lobby JSON removes duplicate parsed payload but preserves signed message bytes',async()=>{
 const {lobbyJson}=await import(sourceUrl('lib/lobby-json.ts'));
 const m=row(dids[0],{type:'sonnet.note.v1',text:'Exact  spacing\nand unicode: ü'});
 m.payload=JSON.parse(m.text);m.nonce='1234567890123456789';m.sig='signature';
 const wire=JSON.parse(lobbyJson({notes:[m]})).notes[0];
 assert.equal(wire.text,m.text);assert.equal(wire.sig,m.sig);assert.equal(wire.nonce,m.nonce);
 assert.equal(wire.payload,undefined);assert.deepEqual(JSON.parse(wire.text),m.payload);
});

const {writerAchievements,verifiedPoemMembers,matchesTableFilter,NEW_ROOM_WINDOW}=await import(sourceUrl('lib/table-discovery.ts'));
function submittedTeam(id='alpha') {
 const rows=fixture().map(m=>({...m,text:m.text.replaceAll('alpha',id)}));
 const submit=row(dids[0],{type:'sonnet.submit.v1',request_id:'submit-'+id,game_id:id,room_generation:1,poem_sha256:'c'.repeat(64)},ROOM.submissions);
 rows.push(submit,receipt(submit,{entry_id:id}));
 return projectMessages(rows,REFEREE).teams[0];
}
test('past accepted submissions credit the verified roster despite missing word history',()=>{
 const t=submittedTeam();t.ledgerComplete=false;t.contributors=[];t.canonicalPoem=null;
 assert.deepEqual(verifiedPoemMembers(t),dids);
 assert.equal(writerAchievements([t]).get(dids[0]).length,1);
});
test('one star per poem, two poems give two stars, applications and display names do not earn credit',()=>{
 const a=submittedTeam(),b=submittedTeam('beta');a.applicants=['an outsider'];
 const credit=writerAchievements([a,a,{...a,status:'completed',completionAccepted:true,ledgerComplete:true,canonicalPoem:'poem',lines:Array(14).fill('line'),contributors:dids},b]);
 assert.equal(credit.get(dids[0]).length,2);assert.equal(credit.has('an outsider'),false);
 assert.equal(credit.size,4);
});
test('unmatched, rejected or forged referee evidence cannot earn a star',()=>{
 const t=submittedTeam();
 for(const bad of [{...t,lastReceipt:{...t.lastReceipt,from:dids[0]}},{...t,rosterProposal:null},{...t,lastReceipt:{...t.lastReceipt,signatureValid:false}},{...t,rosterReceipt:{...t.rosterReceipt,text:t.rosterReceipt.text.replace('accepted','rejected')}}])assert.equal(writerAchievements([bad]).size,0);
});
test('accepted submission without roster remains finished and blocks incomplete achievement ranking',()=>{
 const rows=fixture().filter(m=>m.room!==ROOM.discovery);
 const submit=row(dids[0],{type:'sonnet.submit.v1',request_id:'without-roster',game_id:'alpha',room_generation:1},ROOM.submissions);
 const s=projectMessages([...rows,submit,receipt(submit,{entry_id:'alpha'})],REFEREE);
 assert.equal(s.teams[0].status,'submitted');assert.equal(s.submissionAudit.accepted,1);assert.equal(s.submissionAudit.matched,0);assert.deepEqual(s.submissionAudit.unresolved,['alpha']);
});
test('new room filter uses official allocation time; terminal and full tables cannot advertise seats',()=>{
 const now=Date.parse('2026-09-12T18:00:00Z');
 const t=submittedTeam();t.setupReceipt={...t.setupReceipt,ts:new Date(now-NEW_ROOM_WINDOW-1).toISOString()};t.lastSeen=new Date(now).toISOString();t.availableRequest=true;
 assert.equal(matchesTableFilter(t,'new',now),false);assert.equal(matchesTableFilter(t,'recruiting',now),false);assert.equal(matchesTableFilter(t,'full',now),false);assert.equal(matchesTableFilter(t,'completed',now),true);
 t.status='forming';t.frozen=false;t.confirmed=false;t.members=Array(8).fill('member');
 assert.equal(matchesTableFilter(t,'recruiting',now),false);assert.equal(matchesTableFilter(t,'full',now),true);
 t.setupReceipt={...t.setupReceipt,ts:new Date(now-1000).toISOString()};assert.equal(matchesTableFilter(t,'new',now),true);
});
test('only referee-accepted rosters can omit their redundant poem-room field',()=>{
 const rows=fixture().map(m=>{const p=JSON.parse(m.text);if(p.type==='sonnet.roster.v1')delete p.poem_room;return {...m,text:JSON.stringify(p)};});
 assert.equal(projectMessages(rows,REFEREE).teams[0].confirmed,true);
 assert.equal(projectMessages(rows.filter(m=>m.from!==REFEREE||m.room!==ROOM.discovery),REFEREE).teams[0].members.length,0);
});

test('only accepted poem submissions earn stars: a full roster and a completed unsubmitted poem do not',()=>{
 const t=submittedTeam();
 const ready={...t,status:'ready',entryId:null,lastReceipt:t.rosterReceipt};
 const complete={...t,status:'completed',entryId:null,ledgerComplete:true,completionAccepted:true,canonicalPoem:'finished poem',lines:Array(14).fill('line'),contributors:dids};
 assert.equal(writerAchievements([ready,complete]).size,0);
 assert.equal(writerAchievements([t]).get(dids[0]).length,1);
});

const {buildMemberProfile,profileTier}=await import(sourceUrl('lib/member-profile.ts'));
test('personal profile deduplicates poem credits and separates current seats from completed teams',()=>{
 const first=submittedTeam(),second=submittedTeam('beta'),active={...submittedTeam('gamma'),status:'writing',entryId:null,frozen:true};
 const state={teams:[first,first,second,active],launchSeen:true,refereeDid:REFEREE,submissionAudit:{unresolved:[]},updatedAt:'2026-09-13T00:00:00Z'};
 const p=buildMemberProfile(state,dids[0],null,[],'2026-09-13T00:01:00Z');
 assert.equal(p.completed.length,2);assert.equal(profileTier(p),'gold');assert.deepEqual(p.active.map(t=>t.id),['gamma']);
 assert.equal(buildMemberProfile(state,'an outsider',null,[],p.checkedAt).completed.length,0);
 const partial=buildMemberProfile({...state,submissionAudit:{unresolved:['missing']}},dids[0],null,[],p.checkedAt);
 assert.equal(profileTier(partial),'gold');assert.equal(partial.historyReady,false);assert.equal(partial.completed.length,2);
 assert.equal(profileTier({...partial,completed:[]}), 'unverified');
 assert.equal(buildMemberProfile({...state,launchSeen:false},dids[0],null,[],p.checkedAt).completed.length,0);
});

test('a roster-ready receipt copied into the allocated room can anchor lost discovery acceptance',()=>{
 const rows=fixture().filter(m=>!(m.room===ROOM.discovery&&JSON.parse(m.text).type==='sonnet.receipt.v1'));
 const roster=rows.at(-1);
 const copied={...receipt(roster,{roster_ready:true,state_hash:'a'.repeat(64)}),room:'d-sonnet-2-team-alpha'};
 const word=row(dids[0],{type:'sonnet.word.v1',request_id:'first-recovered',game_id:'alpha',room_generation:1,version:0,previous_state_hash:'a'.repeat(64),word:'light'},'d-sonnet-2-team-alpha');
 const acceptedWord=receipt(word,{version:1,state_hash:'b'.repeat(64)});
 const t=projectMessages([...rows,copied,word,acceptedWord],REFEREE).teams[0];
 assert.equal(t.ledgerComplete,true);assert.deepEqual(t.words,['light']);
 for(const bad of [{...copied,signatureValid:false},{...copied,generation:2},{...copied,from:dids[0]},{...copied,text:copied.text.replace(JSON.parse(roster.text).request_id,'unrelated')}]){
  assert.equal(projectMessages([...rows,bad,word,acceptedWord],REFEREE).teams[0].ledgerComplete,false);
 }
});
test('only accepted submissions supply safe publication links and an explicit receipt',()=>{
 const rows=fixture();
 const submit=row(dids[0],{type:'sonnet.submit.v1',request_id:'publication',game_id:'alpha',room_generation:1,poem_sha256:'c'.repeat(64),x_post_ids:['2099446507334479961','javascript:alert(1)','https://untrusted.example']},ROOM.submissions);
 const accepted=receipt(submit,{entry_id:'alpha',eligibility:'pending'});
 const t=projectMessages([...rows,submit,accepted],REFEREE).teams[0];
 assert.deepEqual(t.publicationUrls,['https://x.com/i/status/2099446507334479961']);
 assert.equal(t.submissionReceipt.seq,accepted.seq);
 assert.equal(projectMessages([...rows,submit,receipt(submit,{status:'rejected'})],REFEREE).teams[0].publicationUrls,undefined);
});
