import {assertExportGeneration} from './room-history';
import {CONTEST,MANIFEST_HASH,REFEREE,ROOM,type Message} from './sonnet-types';
import {parseTransport,verifyEnvelope} from './signatures';
import {readVoteLedger} from './vote-ledger';
import {emptyVoteTally,type VoteTally} from './vote-tally';
import {voteResponse} from './vote-response';

export const VOTE_CACHE='sonnet-2:vote-tally:v2';
const CURSOR='sonnet-2:vote-cursor:v2',LEASE='sonnet-2:vote-lease:v3';
const origin='https://technocore.chat';
type Progress={generation:number;last:number;exportedAt:number};
async function roomRead(room:string,since?:number,signal?:AbortSignal){
 const q=new URLSearchParams({format:'json',limit:'200'});if(since!==undefined)q.set('since',String(since));
 const r=await fetch(`${origin}/r/${room}?${q}`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),redirect:'manual'});
 if(!r.ok)throw Error('The official vote room is temporarily unavailable.');
 const text=await r.text();if(text.length>2_000_000)throw Error('Unexpected room response.');
 const data=parseTransport(text);
 if(data.room!==room||!Number.isSafeInteger(data.generation)||!Array.isArray(data.messages))throw Error('Unexpected room response.');
 return data;
}
async function save(db:D1Database,messages:Message[]){
 for(let i=0;i<messages.length;i+=40){
  const group=messages.slice(i,i+40);
  await db.batch(group.map(m=>db.prepare('INSERT OR IGNORE INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)')
   .bind(`${m.room}:${m.generation}:${m.seq}`,m.room,m.generation,m.seq,JSON.stringify(m),m.ts)));
 }
}
async function verifyLaunch(db:D1Database,signal?:AbortSignal){
 const stored=await db.prepare("SELECT body FROM sonnet_records WHERE room=? AND json_extract(body,'$.from')=? AND json_extract(body,'$.payload.type')='sonnet.launch.v1'").bind(ROOM.rules,REFEREE).all<{body:string}>();
 const valid=async(m:Message)=>{
  const p=JSON.parse(m.text);
  return m.from===REFEREE&&p.type==='sonnet.launch.v1'&&p.configuration?.contest_id===CONTEST&&p.configuration?.referee===REFEREE&&p.package?.sha256===MANIFEST_HASH&&await verifyEnvelope(ROOM.rules,m);
 };
 for(const row of stored.results){try{if(await valid(JSON.parse(row.body)))return;}catch{}}
 const data=await roomRead(ROOM.rules,undefined,signal);
 for(const raw of data.messages){try{
  const m={...raw,room:ROOM.rules,generation:data.generation} as Message;
  if(await valid(m)){m.signatureValid=true;m.payload=JSON.parse(m.text);await save(db,[m]);return;}
 }catch{}}
 throw Error('The official launch signature could not be verified. Vote totals remain unverified.');
}

export async function getVoteTally(db:D1Database,keepAlive:(work:Promise<unknown>)=>void){
 const result=await voteResponse({
  readCache:async()=>{
   const row=await db.prepare('SELECT value,expires FROM sonnet_cache WHERE key=?').bind(VOTE_CACHE).first<{value:string;expires:number}>();
   return row?{value:JSON.parse(row.value) as VoteTally,expires:row.expires}:null;
  },
  refresh:()=>syncVoteTally(db),
  restore:async()=>{
   await verifyLaunch(db);
   const ledger=await readVoteLedger(db);
   const stored:VoteTally={counts:Object.fromEntries(ledger.counts),checkedAt:ledger.lastReceiptAt,source:'stored',status:'refreshing',coverage:'partial',receiptCount:ledger.receiptCount,unresolved:ledger.unresolved,
    warning:'Showing saved, signature-verified vote choices while live history is recovered. These observations are incomplete, not certified totals.'};
   // Never replace a completed live refresh with an older restoration.
   if(stored.checkedAt)await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=0 WHERE json_extract(sonnet_cache.value,'$.checkedAt') IS NULL").bind(VOTE_CACHE,JSON.stringify(stored)).run();
   return stored;
  },
 },keepAlive);
 console.info('vote tally served',{source:result.source??'none',status:result.status,receipts:result.receiptCount,choices:Object.values(result.counts).reduce((a,b)=>a+b,0),entries:Object.keys(result.counts).length,checkedAt:result.checkedAt});
 return result;
}

/** Read the retained ring completely; keep only acceptance evidence, not ballot spam. */
async function retainedReceipts(generation:number,signal?:AbortSignal){
 const r=await fetch(`${origin}/r/${ROOM.votes}/export`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),redirect:'manual'});
 if(!r.ok||!r.body)throw Error('Earlier vote receipts could not be recovered.');
 assertExportGeneration(r.headers,generation);
 const reader=r.body.getReader(),decoder=new TextDecoder(),rows:Message[]=[];
 let buffer='',bytes=0,last=0;
 const line=(raw:string)=>{
  if(!raw.trim())return;
  const m=parseTransport(raw) as Message;
  if(!Number.isSafeInteger(m.seq)||typeof m.text!=='string')return;
  last=Math.max(last,m.seq);
  if(m.from!==REFEREE)return;
  let p;try{p=JSON.parse(m.text);}catch{return;}
  if(p.contest_id===CONTEST&&p.type==='sonnet.receipt.v1'&&p.status==='accepted')rows.push({...m,room:ROOM.votes,generation,payload:p});
 };
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
   if(bytes>12_000_000)throw Error('Vote history exceeded the bounded read. Counts are not up to date.');
   buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const raw of lines)line(raw);
  }
  buffer+=decoder.decode();if(buffer.trim())line(buffer);
 }finally{await reader.cancel();}
 return {rows,last};
}

export async function syncVoteTally(db:D1Database):Promise<VoteTally>{
 const now=Date.now();
 const cached=await db.prepare('SELECT value,expires FROM sonnet_cache WHERE key=?').bind(VOTE_CACHE).first<{value:string;expires:number}>();
 const previous:VoteTally=cached?JSON.parse(cached.value):emptyVoteTally;
 if(cached&&cached.expires>now)return previous;
 const token=crypto.randomUUID();
 const lease=await db.prepare('INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE sonnet_cache.expires < ?')
  .bind(LEASE,token,now+60000,now).run();
 if(lease.meta.changes!==1)return {...previous,status:'refreshing',warning:'Checking official vote receipts. Saved observations are shown while this check finishes.'};
 try{
  const signal=AbortSignal.timeout(23000);
  await verifyLaunch(db,signal);
  const saved=await db.prepare('SELECT value FROM sonnet_cache WHERE key=?').bind(CURSOR).first<{value:string}>();
  const cursor:Progress|null=saved?JSON.parse(saved.value):null;
  const data=await roomRead(ROOM.votes,cursor?.last,signal);
  let rows:Message[]=data.messages.map((m:Message)=>({...m,room:ROOM.votes,generation:data.generation}));
  let last=Math.max(cursor&&cursor.generation===data.generation?cursor.last:0,...rows.map(m=>m.seq));
  let exportedAt=cursor?.exportedAt??0;
  if(!cursor||cursor.generation!==data.generation||now-exportedAt>300000||(rows.length&&rows[0].seq>cursor.last+1)){
   const history=await retainedReceipts(data.generation,signal);
   const check=await roomRead(ROOM.votes,history.last,signal);
   if(check.generation!==data.generation)throw Error('The vote room changed during recovery. Retrying on the next check.');
   rows=history.rows;last=history.last;exportedAt=Date.now();
  }
  const accepted:Message[]=[];
  for(let i=0;i<rows.length;i+=40){
   const group=await Promise.all(rows.slice(i,i+40).map(async m=>{
    try{const p=JSON.parse(m.text);
     if(m.from!==REFEREE||p.contest_id!==CONTEST||p.type!=='sonnet.receipt.v1'||p.status!=='accepted'||!await verifyEnvelope(ROOM.votes,m))return null;
     return {...m,signatureValid:true,payload:p};
    }catch{return null;}
   }));
   accepted.push(...group.filter((m):m is NonNullable<typeof m>=>m!==null));
  }
  await save(db,accepted);
  const ledger=await readVoteLedger(db);
  const result:VoteTally={counts:Object.fromEntries(ledger.counts),checkedAt:new Date().toISOString(),status:'ready',coverage:'partial',source:'live',receiptCount:ledger.receiptCount,unresolved:ledger.unresolved,
   warning:'Incomplete vote history: these are observed choices, not certified totals. Missing ballots, recovered choices and final eligibility decisions can change counts and rankings.'};
  await db.batch([
   db.prepare('INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(VOTE_CACHE,JSON.stringify(result),Date.now()+45000),
   db.prepare('INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires').bind(CURSOR,JSON.stringify({generation:data.generation,last,exportedAt}),Date.now()+31536000000),
  ]);
  console.info('vote tally refreshed',{receipts:result.receiptCount,choices:Object.values(result.counts).reduce((a,b)=>a+b,0),entries:Object.keys(result.counts).length,checkedAt:result.checkedAt});
  return result;
 }catch(error){
  console.error('vote receipt sync failed',error instanceof Error?error.message:String(error));
  return {...previous,status:'unavailable',warning:'The latest official vote check failed. Previous observations are preserved; no missing data has been replaced with zero.'};
 }finally{await db.prepare('DELETE FROM sonnet_cache WHERE key=? AND value=?').bind(LEASE,token).run();}
}
