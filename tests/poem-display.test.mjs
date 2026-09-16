import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceUrl} from './source-loader.mjs';
const {poemDisplay}=await import(sourceUrl('lib/poem-display.ts'));
const {enrichAcceptedPoems}=await import(sourceUrl('lib/accepted-poem.ts'));
const base={id:'sample',status:'forming',lines:[],words:[],members:['a','b'],contributors:['a','b'],canonicalPoem:null,poemHash:null,ledgerComplete:true,frozen:false,blockers:[]};
test('a submitted poem with missing text never claims the team has not started',()=>{
 const state=poemDisplay({...base,status:'submitted',frozen:true,proposals:100,ledgerComplete:false});
 assert.equal(state.finished,true);assert.equal(state.recovering,true);assert.equal(state.textReady,false);
 assert.match(state.title,/Poem complete/);assert.doesNotMatch(state.title,/Waiting for the first/);
});
test('accepted but unreconciled turns remain distinct from an empty new table',()=>{
 assert.equal(poemDisplay(base).recovering,false);
 assert.equal(poemDisplay({...base,status:'writing',frozen:true}).recovering,true);
});
test('recovery requires a complete accepted ledger, every contributor and the submission hash',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(readFileSync('public/cmudict.dict'));
 try{
  const make=()=>({...base,blockers:[],status:'writing',frozen:true,completionAccepted:true,words:Array(140).fill('light')});
  const t=make();await enrichAcceptedPoems({teams:[t]});assert.equal(t.lines.length,14);assert.equal(t.status,'completed');assert.equal(t.canonicalPoem.split('\n\n').map(s=>s.split('\n').length).join(','),'4,4,4,2');
  const wrong={...make(),status:'submitted',poemHash:'a'.repeat(64)};await enrichAcceptedPoems({teams:[wrong]});assert.equal(wrong.canonicalPoem,null);assert.equal(wrong.poemHash,'a'.repeat(64));assert.equal(wrong.status,'submitted');
  const submitted={...make(),status:'submitted',poemHash:t.poemHash};await enrichAcceptedPoems({teams:[submitted]});assert.equal(submitted.canonicalPoem,t.canonicalPoem);
  for(const incomplete of [{...make(),ledgerComplete:false},{...make(),completionAccepted:false},{...make(),contributors:['a']}]){await enrichAcceptedPoems({teams:[incomplete]});assert.equal(incomplete.canonicalPoem,null);}
 }finally{globalThis.fetch=original;}
});
