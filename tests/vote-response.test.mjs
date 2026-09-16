import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';
const {voteResponse}=await import(sourceUrl('lib/vote-response.ts'));
const sample={counts:{a:7},checkedAt:'2026-09-16T01:00:00Z',status:'ready',coverage:'partial',receiptCount:8,unresolved:0,warning:''};
test('an empty new cache serves restored receipts without waiting for a stalled live export',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const held=[];
 const value=await voteResponse({readCache:async()=>null,refresh:()=>pending,restore:async()=>({...sample,source:'stored',status:'refreshing'})},p=>held.push(p));
 assert.equal(value.counts.a,7);assert.equal(value.source,'stored');assert.equal(held.length,2);
 // A hosting execution-context reference outlives the browser response.
 finish({...sample,counts:{a:8}});assert.equal((await held[0]).counts.a,8);
});
test('expired saved counts are returned immediately and held refresh errors do not erase them',async()=>{
 const held=[];let restored=false;
 const value=await voteResponse({readCache:async()=>({value:sample,expires:0}),refresh:async()=>{throw Error('offline');},restore:async()=>{restored=true;return sample;}},p=>held.push(p));
 assert.equal(value.counts.a,7);assert.equal(restored,false);assert.equal(value.status,'refreshing');
 assert.equal((await held[0]).counts.a,7);
});
test('fresh durable counts do not launch a second collector',async()=>{
 const value=await voteResponse({readCache:async()=>({value:sample,expires:200}),refresh:async()=>assert.fail(),restore:async()=>assert.fail()},()=>assert.fail(),100);
 assert.equal(value,sample);
});
test('a failed stored read can still return a successful live count',async()=>{
 const held=[];
 const value=await voteResponse({readCache:async()=>null,refresh:async()=>sample,restore:async()=>{throw Error('archive unavailable');}},p=>held.push(p));
 assert.equal(value.counts.a,7);await Promise.all(held);
});
