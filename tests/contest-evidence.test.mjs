import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {contestEvidence,contestPhase,recentCheck}=await import(sourceUrl('lib/contest-evidence.ts'));
const {projectMessages}=await import(sourceUrl('lib/sonnet-projector.ts'));
const {REFEREE,MANIFEST_HASH,ROOM}=await import(sourceUrl('lib/sonnet-types.ts'));
const {needsRetainedHistory,assertExportGeneration,readRetainedHistory}=await import(sourceUrl('lib/room-history.ts'));
const opening=Date.parse('2026-09-11T12:00:00Z')/1000,deadline=Date.parse('2026-09-18T12:00:00Z')/1000;
const row=(seq,p,changes={})=>({seq,room:ROOM.rules,generation:1,ts:'2026-09-16T12:00:00Z',from:REFEREE,signatureValid:true,text:JSON.stringify(p),...changes});
const launch=()=>row(1,{type:'sonnet.launch.v1',configuration:{contest_id:'sonnet-2',referee:REFEREE,opening,deadline},package:{sha256:MANIFEST_HASH}});
const notice=(seq=2,changes={})=>row(seq,{type:'sonnet.notice.v1',contest_id:'sonnet-2',referee:REFEREE,subject:'referee status',teams:3,participants:{writer:12,voter:40,organizer:2},...changes});

test('official status is derived from launch-anchored signed notices, separate from observed tables',()=>{
 const snapshot=projectMessages([launch(),notice()],REFEREE);
 assert.equal(snapshot.contestEvidence.statusReport.teams,3);
 assert.equal(snapshot.teams.length,0);
 for(const bad of [{...notice(),signatureValid:false},{...notice(),from:'someone else'},{...notice(),room:ROOM.discovery},{...notice(),generation:2},notice(2,{contest_id:'sonnet-1'}),notice(2,{participants:{writer:12,voter:-1,organizer:2}})]){
  assert.equal(contestEvidence([launch(),bad],REFEREE).statusReport,null);
 }
 assert.equal(contestEvidence([notice()],REFEREE),null);
 assert.equal(contestEvidence([launch(),notice()],'untrusted referee'),null);
});
test('rules-room order selects a report without treating mutable transport time as authority',()=>{
 const older={...notice(2),ts:'2099-01-01T00:00:00Z'},newer=notice(3,{teams:4});
 assert.equal(contestEvidence([launch(),newer,older],REFEREE).statusReport.teams,4);
 const forged={...notice(4),text:'not JSON',payload:{...JSON.parse(notice().text),teams:999}};
 assert.equal(contestEvidence([launch(),newer,forged],REFEREE).statusReport.teams,4);
});
test('closing the intake period never infers a shortlist or winner',()=>{
 const evidence=contestEvidence([launch(),notice()],REFEREE);
 assert.equal(contestPhase(null,opening*1000),'unknown');
 assert.equal(contestPhase(evidence,opening*1000-1),'upcoming');
 assert.equal(contestPhase(evidence,opening*1000),'open');
 assert.equal(contestPhase(evidence,deadline*1000),'open');
 assert.equal(contestPhase(evidence,deadline*1000+1),'closed');
 assert.equal(contestEvidence([row(1,{...JSON.parse(launch().text),configuration:{...JSON.parse(launch().text).configuration,deadline:1e30}})],REFEREE),null);
});
test('saved and future timestamps cannot present a fresh connection',()=>{
 const now=Date.parse('2026-09-16T12:00:00Z');
 assert.equal(recentCheck(new Date(now-89999).toISOString(),now),true);
 for(const time of [null,'bad',new Date(now-90000).toISOString(),new Date(now+1).toISOString()])assert.equal(recentCheck(time,now),false);
});
test('skipped windows require an archive read even when a cursor already exists',()=>{
 const cursor={generation:1,seq:250};
 const tail={generation:1,last_seq:600,messages:[{seq:401},{seq:600}]};
 assert.equal(needsRetainedHistory(cursor,tail),true);
 assert.equal(needsRetainedHistory(cursor,{...tail,messages:[{seq:251}]}),false);
 assert.equal(needsRetainedHistory(cursor,{...tail,messages:[]}),false);
 assert.equal(needsRetainedHistory(cursor,{generation:2,last_seq:10,messages:[{seq:1}]}),false);
 assert.equal(needsRetainedHistory(undefined,tail),true);
 assert.equal(needsRetainedHistory({...cursor,generation:0},tail),true);
});
test('archive generation must match the metadata before assigning messages to a generation',()=>{
 assert.doesNotThrow(()=>assertExportGeneration(new Headers({'x-room-generation':'2'}),2));
 for(const value of [null,'1','garbage',''])assert.throws(()=>assertExportGeneration(new Headers(value===null?{}:{'x-room-generation':value}),2));
});
test('recovery scans retained coverage but only reprocesses the missing range',async t=>{
 const records=Array.from({length:205},(_,i)=>({seq:i+1,text:'a signed payload',nonce:'1234567890123456789'}));
 const body=records.map(m=>JSON.stringify(m)).join('\n');
 t.mock.method(globalThis,'fetch',async()=>new Response(body,{headers:{'x-room-generation':'1'}}));
 let inspected=0;
 const result=await readRetainedHistory(ROOM.rules,1,()=>{inspected++;return true;},200);
 assert.equal(result.first,1);assert.equal(result.last,205);assert.equal(result.truncated,false);
 assert.deepEqual(result.messages.map(m=>m.seq),[201,202,203,204,205]);
 assert.equal(inspected,5);
 assert.equal(result.messages[0].nonce,'1234567890123456789');
 await assert.rejects(()=>readRetainedHistory(ROOM.rules,2,()=>true),/generation/);
});
test('a malformed archive remains incomplete instead of certifying full coverage',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{broken json}\n'+JSON.stringify({seq:10,text:'valid envelope'})+'\n',{headers:{'x-room-generation':'1'}}));
 const result=await readRetainedHistory(ROOM.rules,1,()=>true);
 assert.equal(result.truncated,true);assert.equal(result.messages.length,1);
});
