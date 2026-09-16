import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {profileBallots,buildMemberProfile}=await import(sourceUrl('lib/member-profile.ts'));
const {importSigner}=await import(sourceUrl('lib/local-signer.ts'));
const {ROOM,REFEREE}=await import(sourceUrl('lib/sonnet-types.ts'));
const did='did:key:z6MkomW7khvZMAndeL1JevjuRgUe9rbrgjd7evysvdeUHfpX';
const ballot=(entry,status,order,voter=did)=>({request:{from:did,room:ROOM.votes,seq:order,ts:'2026-09-13T00:00:00Z',text:JSON.stringify({type:'sonnet.ballot.v1',voter_did:voter,entry_id:entry})},receipt:{room:ROOM.votes,seq:order+1,text:JSON.stringify({intake_seq:order})},status,reason:''});
test('profile keeps the latest accepted ballot when later attempts are rejected or still pending',()=>{
 const records=[ballot('alpha','accepted',1),ballot('beta','accepted',2),ballot('gamma','rejected',3),{...ballot('delta','pending',4),receipt:null},ballot('forged','accepted',99,'another DID')];
 const profile=buildMemberProfile({teams:[],launchSeen:true,refereeDid:REFEREE,submissionAudit:{unresolved:[]}},did,null,records,'now');
 assert.equal(profile.currentVote.entry,'beta');assert.equal(profile.ballots.length,4);assert.equal(profileBallots(records,did).some(b=>b.entry==='forged'),false);
});
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function didFor(raw){let n=0n;for(const b of [237,1,...raw])n=n*256n+BigInt(b);let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}return 'did:key:z'+s;}
test('import proves control of the matching key and refuses a different public DID',async()=>{
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const own=didFor(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));
 const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 const file=new File([JSON.stringify(jwk)],'local-key.json',{type:'application/json'});
 assert.equal((await importSigner(file,own)).did,own);
 await assert.rejects(importSigner(file,did),/does not match/);
 const publicOnly={...jwk};delete publicOnly.d;
 await assert.rejects(importSigner(new File([JSON.stringify(publicOnly)],'public.json'),own),/not supported/);
});
