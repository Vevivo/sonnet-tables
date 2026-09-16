import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUrl} from './source-loader.mjs';

const {configuredOrigins,relayHeaders:headersFor,relayPreflight:preflightFor}=await import(sourceUrl('lib/relay-cors.ts'));
const {apiUrl,assetUrl}=await import(sourceUrl('lib/client-urls.ts'));
const endpoint='https://api.example.com/api/relay';
const ARNS_ORIGIN='https://poems.example.com';
const allowed=configuredOrigins(ARNS_ORIGIN+',https://archive.example.com');
const relayHeaders=req=>headersFor(req,allowed);
const relayPreflight=req=>preflightFor(req,allowed);

test('only the exact ArNS origin and hosted origin can use the signed relay',()=>{
 for(const origin of [ARNS_ORIGIN,'https://archive.example.com',new URL(endpoint).origin]){
  const headers=relayHeaders(new Request(endpoint,{headers:{origin}}));
  assert.equal(headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(headers.get('Access-Control-Allow-Credentials'),null);
 }
 for(const origin of ['null','http://poems.example.com',ARNS_ORIGIN+'.evil.example','https://other.ar.io','']){
  assert.equal(relayHeaders(new Request(endpoint,{headers:{origin}})),null);
 }
});
test('ArNS preflight permits JSON POST and refuses other requested methods or headers',()=>{
 const request=(method,headers='content-type',origin=ARNS_ORIGIN)=>new Request(endpoint,{method:'OPTIONS',headers:{origin,'access-control-request-method':method,'access-control-request-headers':headers}});
 const allowed=relayPreflight(request('POST'));
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),ARNS_ORIGIN);
 for(const req of [request('DELETE'),request('POST','authorization'),request('POST','content-type','https://other.ar.io')]){
  const response=relayPreflight(req);
  assert.equal(response.status,403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 }
});
test('hosted build keeps same-origin API and asset paths',()=>{
 assert.equal(apiUrl('/api/lobby'),'/api/lobby');
 assert.equal(assetUrl('/cmudict.dict'),'/cmudict.dict');
});

test("relay configuration rejects wildcards, credentials and non-origin URLs",()=>{
 assert.deepEqual(configuredOrigins("https://poems.example.com, *, https://u:p@example.com, https://example.com/path, null"),["https://poems.example.com"]);
 assert.equal(headersFor(new Request(endpoint,{headers:{origin:ARNS_ORIGIN}})),null);
});
