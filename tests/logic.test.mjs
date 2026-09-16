import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceUrl} from './source-loader.mjs';
const {verifyEnvelope,parseTransport}=await import(sourceUrl('lib/signatures.ts'));
const {projectMessages}=await import(sourceUrl('lib/sonnet-projector.ts'));
const {validateAction}=await import(sourceUrl('lib/protocol.ts'));
const {parseLexicon,checkWord,checkPoem}=await import(sourceUrl('lib/word-check.ts'));
const {importSigner,signAction}=await import(sourceUrl('lib/local-signer.ts'));
const {ROOM}=await import(sourceUrl('lib/sonnet-types.ts'));
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function didFor(raw){let n=0n;for(const b of [237,1,...raw])n=n*256n+BigInt(b);let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}return 'did:key:z'+s;}
const keys=await Promise.all(Array.from({length:5},()=>crypto.subtle.generateKey('Ed25519',true,['sign','verify'])));
const dids=await Promise.all(keys.map(async k=>didFor(new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey)))));
let seq=0;
const msg=(from,p,room=ROOM.discovery)=>({from,text:JSON.stringify({contest_id:'sonnet-2',request_id:'r'+(++seq),...p}),room,generation:0,seq,ts:new Date(1789128010000+seq*1000).toISOString(),signatureValid:true});
test('real Ed25519 signatures bind room, exact payload and 19-digit string nonce',async()=>{
 const envelope=await signAction(keys[0].privateKey,dids[0],ROOM.discovery,'{"text":"hello"}');
 assert.equal(typeof envelope.nonce,'string');assert.equal(envelope.nonce.length,19);
 assert.equal(await verifyEnvelope(ROOM.discovery,envelope),true);
 assert.equal(await verifyEnvelope(ROOM.registration,envelope),false);
 assert.equal(await verifyEnvelope(ROOM.discovery,{...envelope,text:'hello'}),false);
 assert.equal(await verifyEnvelope(ROOM.discovery,{...envelope,nonce:Number(envelope.nonce)}),false);
 const raw=JSON.stringify(envelope).replace('"nonce":"'+envelope.nonce+'"','"nonce":'+envelope.nonce);
 assert.equal(parseTransport(raw).nonce,envelope.nonce);
 assert.equal(await verifyEnvelope(ROOM.discovery,parseTransport(raw)),true);
});
test('watching a DID is not key control; local import rejects a different key',async()=>{
 const jwk=await crypto.subtle.exportKey('jwk',keys[0].privateKey);
 const f=new File([JSON.stringify(jwk)],'ephemeral-test-key.json');
 const loaded=await importSigner(f,dids[0]);assert.equal(loaded.did,dids[0]);
 await assert.rejects(()=>importSigner(f,dids[1]),/does not match/);
});
test('mentions and self-declared full tables do not become roster members',()=>{
 const m=msg(dids[0],{type:'sonnet.note.v1',game_id:'alpha',text:`We are full. ${dids.join(' ')} https://x.com/someone_else`});
 const s=projectMessages([m],null);assert.equal(s.teams[0].members.length,0);assert.equal(s.teams[0].referenced.length,5);assert.equal(s.teams[0].confirmed,false);
 assert.equal(s.writers[0].x,undefined);
});
test('only matching signed four-to-eight-member rosters count as consent',()=>{
 const roster={type:'sonnet.roster.v1',game_id:'alpha',poem_room:'d-sonnet-2-team-alpha',room_generation:0,members:dids.slice(0,4)};
 const rows=dids.slice(0,4).map(d=>msg(d,roster));const s=projectMessages(rows,null);
 assert.equal(s.teams[0].consents.length,4);assert.equal(s.teams[0].confirmed,false);assert.equal(s.teams[0].status,'forming');
 const duplicate=projectMessages([msg(dids[0],{...roster,members:[dids[0],dids[0],dids[1],dids[2]]})],null);assert.equal(duplicate.teams[0].members.length,0);
 const withdraw=projectMessages([...rows,msg(dids[1],{type:'sonnet.withdraw.v1',game_id:'alpha'})],null);assert.equal(withdraw.teams[0].consents.length,3);
});
test('forged or unspecified receipt shapes cannot assert official acceptance',()=>{
 const request=msg(dids[0],{type:'sonnet.team-request.v1',game_id:'alpha'});
 const fake=msg(dids[1],{type:'sonnet.receipt.v1',game_id:'alpha',status:'accepted',version:10,lines:['fake accepted poem'],entry_id:'fake'});
 for(const pin of [null,dids[1]]){const s=projectMessages([request,fake],pin);assert.equal(s.teams[0].confirmed,false);assert.equal(s.teams[0].lines.length,0);}
});
test('source text stays byte-for-byte intact including submission requests',()=>{
 const m=msg(dids[0],{type:'sonnet.submit.v1',game_id:'alpha',poem_sha256:'0'.repeat(64)},ROOM.submissions);
 const s=projectMessages([m],null);assert.equal(s.teams[0].notes.length,1);assert.equal(s.teams[0].notes[0].text,m.text);
});
test('cross-team proposals are flagged, not silently treated as available seats',()=>{
 const roster={type:'sonnet.roster.v1',members:dids.slice(0,4),room_generation:0};
 const s=projectMessages(['alpha','beta'].map(id=>msg(dids[0],{...roster,game_id:id,poem_room:'d-sonnet-2-team-'+id})),null);
 assert.equal(s.teams.length,2);assert.equal(s.teams[0].conflicts.length,4);
});
test('protocol rejects wrong room, malformed roster and guessed word state',()=>{
 const p={type:'sonnet.register.v1',contest_id:'sonnet-2',request_id:'r',role:'writer',x_account_url:'https://x.com/writer'};
 assert.doesNotThrow(()=>validateAction(ROOM.registration,p,dids[0]));
 assert.throws(()=>validateAction(ROOM.discovery,p,dids[0]),/different contest room/);
 assert.throws(()=>validateAction(ROOM.discovery,{...p,type:'sonnet.roster.v1',game_id:'alpha',members:[dids[0]]},dids[0]),/4–8/);
 assert.throws(()=>validateAction('d-sonnet-2-team-alpha',{...p,type:'sonnet.word.v1',game_id:'alpha',word:'The'},dids[0]),/verified current referee state/);
});
test('frozen dictionary integrity and deterministic max-pronunciation counts',()=>{
 const bytes=readFileSync('public/cmudict.dict');assert.equal(createHash('sha256').update(bytes).digest('hex'),'81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22');
 const lex=parseLexicon(bytes.toString());assert.ok(lex.size>100000);assert.equal(lex.get('the'),1);assert.equal(lex.get('poetry'),3);
 assert.equal(parseLexicon('fire F AY1 R\nfire(2) F AY1 ER0\n').get('fire'),2);
 const did='did:key:z6MkomW7khvZMAndeL1JevjuRgUe9rbrgjd7evysvdeUHfpX';assert.equal(checkWord('key.',did,lex),1);assert.throws(()=>checkWord('The',did,lex),/does not contain: T/);
 assert.throws(()=>checkWord('two words',did,lex));assert.throws(()=>checkWord('word-',did,lex));assert.throws(()=>checkWord('qqqq',did,lex));
});
test('mechanical poem checks preserve canonical bytes and reject overflow',async()=>{
 const lex=parseLexicon('the DH AH0\n');const line=Array(10).fill('the').join(' ');const poem=Array(14).fill(line).join('\n');
 const result=await checkPoem(poem,lex);assert.equal(result.counts.length,14);assert.ok(result.counts.every(n=>n===10));assert.equal(result.canonical.split('\n\n').map(s=>s.split('\n').length).join(','),'4,4,4,2');assert.equal(result.canonical.endsWith('\n'),false);
 assert.equal(result.hash,createHash('sha256').update(result.canonical).digest('hex'));
 await assert.rejects(()=>checkPoem(poem+' the',lex),/11 dictionary syllables/);
 await assert.rejects(()=>checkPoem(poem.replace('the the','the  the'),lex),/one ASCII space/);
});
