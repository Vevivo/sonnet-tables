import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sourceUrl} from './source-loader.mjs';
const {readProjectionHistory,readVoteCounts}=await import(sourceUrl('lib/projection-history.ts'));
const {ROOM,REFEREE}=await import(sourceUrl('lib/sonnet-types.ts'));
test('large ballot history is tallied in bounded pages and only the accepted registry enters the lobby',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_panoramic_smasher.sql','utf8'));sql.exec(readFileSync('drizzle/0001_grey_cardiac.sql','utf8'));sql.exec(readFileSync('drizzle/0002_broad_ogun.sql','utf8'));
 const db={async batch(statements){return Promise.all(statements.map(s=>s.all()));},prepare(query){return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)??null;}};}};}};
 let seq=0;const add=(from,p,room)=>{const m={from,room,seq:++seq,generation:1,ts:'2026-09-13T00:00:00Z',signatureValid:true,text:JSON.stringify({contest_id:'sonnet-2',...p}),payload:{contest_id:'sonnet-2',...p}};sql.prepare('INSERT INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)').run(`${room}:1:${m.seq}`,room,1,m.seq,JSON.stringify(m),m.ts);return m;};
 for(const room of [ROOM.registration,ROOM.votes])sql.prepare('INSERT INTO sonnet_cursors VALUES(?,?,?,?,?)').run(room,1,0,1,'2026-09-13T00:00:00Z');
 for(let n=0;n<620;n++){
  const did='did:key:z6Mk'+String(n).replace(/0/g,'A').padStart(44,'A');for(const [i,entry,status] of [[0,'old','accepted'],[1,'new','accepted'],[2,'invalid','rejected']]){const request_id=`${did}-${i}`;add(did,{type:'sonnet.ballot.v1',voter_did:did,entry_id:entry,request_id},ROOM.votes);add(REFEREE,{type:'sonnet.receipt.v1',sender_did:did,request_id,status,intake_seq:seq+1},ROOM.votes);}
  add(did,{type:'sonnet.register.v1',request_id:'reg-'+did,role:'voter'},ROOM.registration);
 }
 add('writer',{type:'sonnet.register.v1',request_id:'writer-reg',role:'writer'},ROOM.registration);add(REFEREE,{type:'sonnet.receipt.v1',sender_did:'writer',request_id:'writer-reg',role:'writer',status:'accepted',intake_seq:seq+1},ROOM.registration);
 const counts=await readVoteCounts(db);assert.equal(counts.get('new'),620);assert.equal(counts.has('old'),false);assert.equal(counts.has('invalid'),false);
 const history=await readProjectionHistory(db);assert.equal(history.length,2);assert.equal(history.some(m=>m.room===ROOM.votes),false);
 sql.close();
});

test('batched history crosses page boundaries without dropping or duplicating signed records',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_panoramic_smasher.sql','utf8'));sql.exec(readFileSync('drizzle/0001_grey_cardiac.sql','utf8'));sql.exec(readFileSync('drizzle/0002_broad_ogun.sql','utf8'));
 let batches=0;
 const db={async batch(statements){batches++;assert.equal(statements.length,4);return Promise.all(statements.map(s=>s.all()));},prepare(query){return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)??null;}};}};}};
 const room='d-sonnet-2-team-load';sql.prepare('INSERT INTO sonnet_cursors VALUES(?,?,?,?,?)').run(room,2,2305,1,'2026-09-14T00:00:00Z');
 const insert=sql.prepare('INSERT INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)');
 for(let seq=1;seq<=2305;seq++){
  const m={room,seq,generation:2,from:'writer',signatureValid:true,nonce:'1234567890123456789',ts:'2026-09-14T00:00:00Z',text:JSON.stringify({contest_id:'sonnet-2',type:'sonnet.word.v1',request_id:'w-'+seq,word:'light'})};
  insert.run(`${room}:2:${seq}`,room,2,seq,JSON.stringify(m),m.ts);
 }
 insert.run(`${room}:1:1`,room,1,1,JSON.stringify({room,generation:1,seq:1,text:'old generation'}),'2026-09-13T00:00:00Z');
 const history=await readProjectionHistory(db);
 assert.equal(history.length,2305);assert.equal(new Set(history.map(m=>m.seq)).size,2305);assert.equal(history.every(m=>m.generation===2&&m.nonce==='1234567890123456789'),true);assert.equal(batches,2);
 sql.close();
});
