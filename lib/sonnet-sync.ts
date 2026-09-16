import {database,refereePin} from "./sonnet-db";
import {parseTransport,verifyEnvelope} from "./signatures";
import {readProjectionHistory} from "./projection-history";
import {projectMessages} from "./sonnet-projector";
import {enrichAcceptedPoems} from "./accepted-poem";
import {encodeSnapshot,decodeSnapshot} from "./snapshot-cache";
import {readRetainedHistory,needsRetainedHistory} from "./room-history";
import {ROOM,CONTEST,REFEREE,emptySnapshot,type Message,type Snapshot} from "./sonnet-types";
const ORIGIN="https://technocore.chat",CACHE=`${CONTEST}:snapshot:participation-v3`,LEASE=`${CONTEST}:lease`;
type Cursor={room:string;generation:number;seq:number;first_seq:number;updated_at:string};
const baseRooms=Object.values(ROOM);
export async function readRoom(room:string,since?:number){
 if(!baseRooms.includes(room)&&!/^d-sonnet-2-team-[a-z0-9][a-z0-9_-]{0,15}$/.test(room))throw new Error("Unsupported contest room");
 const q=new URLSearchParams({format:"json",limit:"200"});if(since!==undefined)q.set("since",String(since));
 const response=await fetch(`${ORIGIN}/r/${room}?${q}`,{signal:AbortSignal.timeout(15000),redirect:"manual",headers:{Accept:"application/json"}});
 if(!response.ok)throw new Error(`${room}: Technocore HTTP ${response.status}`);
 const raw=await response.text();if(raw.length>2_000_000)throw new Error("Room reply is too large");
 const data=parseTransport(raw);if(data.room!==room||!Array.isArray(data.messages)||!Number.isInteger(data.generation))throw new Error("Unexpected room response");return data;
}
function relevant(room:string,m:Message){
 try{const p=JSON.parse(m.text);if(!p||typeof p!=="object")return false;
  if(p.type==="sonnet.launch.v1"){m.payload=p;return room===ROOM.rules&&p.configuration?.contest_id===CONTEST;}
  if(p.contest_id!==CONTEST)return false;
  m.payload=p;return true;
 }catch{return room===ROOM.discovery||room.startsWith("d-sonnet-2-team-");}
}
const initialExport=(room:string,generation:number,after=0)=>readRetainedHistory(room,generation,relevant,after);

export async function syncSnapshot(focusTeam?:string):Promise<Snapshot>{
 const db=database(),now=Date.now();const cached=await db.prepare("SELECT value,expires FROM sonnet_cache WHERE key=?").bind(CACHE).first<{value:string;expires:number}>();
 const previousCache=cached??await db.prepare("SELECT value,expires FROM sonnet_cache WHERE key=?").bind(`${CONTEST}:snapshot:identity-v2`).first<{value:string;expires:number}>();
 const cachedSnapshot=previousCache?await decodeSnapshot<Snapshot>(previousCache.value):null;
 if(cached&&cached.expires>now&&cachedSnapshot){const s=cachedSnapshot;const t=s.teams.find(t=>t.id===focusTeam);if(!t?.setupReceipt||t.lastCheckedAt&&now-Date.parse(t.lastCheckedAt)<45000)return s;}
 const leaseId=crypto.randomUUID();
 const acquisition=await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE sonnet_cache.expires < ?").bind(LEASE,leaseId,now+180000,now).run();
 const acquired=acquisition.meta.changes===1;
 console.info("contest collector lease",{acquired,changes:acquisition.meta.changes});
 if(!acquired)return cachedSnapshot?{...cachedSnapshot,connected:false,indexing:true}:{...emptySnapshot,indexing:true,warnings:["Reading the contest rooms. The first sync can take a moment."]};
 const warnings:string[]=[],stats:Snapshot["roomStats"]=[];let connected=false,historyReads=0;
 try{
  const saved=await db.prepare("SELECT * FROM sonnet_cursors WHERE room LIKE ? OR room LIKE ?").bind("d-sonnet-2-%","mb-sonnet-2-%").all<Cursor>();const cursors=new Map(saved.results.map(c=>[c.room,c]));
  const oldTeams:Snapshot["teams"]=cachedSnapshot?.teams??[];
  // All visitors share a bounded collector. Oldest checked rooms go first, so busy chat cannot starve a quiet table.
  const focused=oldTeams.find(t=>t.id===focusTeam&&t.setupReceipt);
  const chosen=[...new Set([...(focused?[focused.room]:[]),...oldTeams.filter(t=>t.setupReceipt).map(t=>t.room).sort((a,b)=>(cursors.get(a)?.updated_at??"").localeCompare(cursors.get(b)?.updated_at??""))])].slice(0,5);
  await Promise.all([...baseRooms,...chosen].map(async room=>{
   try{
    const roleBackfill=room===ROOM.registration&&!await db.prepare("SELECT key FROM sonnet_cache WHERE key=?").bind("sonnet-2:role-history-v1").first();
    const cursor=roleBackfill?undefined:cursors.get(room);let data=await readRoom(room,cursor?.seq??0);
    let rows:Message[]=data.messages.map((m:Message)=>({...m,room,generation:data.generation}));
    const sameGeneration=cursor?.generation===data.generation;
    const prior=cachedSnapshot?.roomStats.find(s=>s.room===room&&s.generation===data.generation);
    let last=rows.at(-1)?.seq??(sameGeneration?cursor!.seq:0);
    // first_seq in an incremental reply describes that reply, not the retained floor.
    let first=sameGeneration?cursor!.first_seq:Number(data.first_seq)||0,gap=prior?.gap??first>1;
    let historyCheckedAt=prior?.historyCheckedAt,historyPending=prior?.historyPending??false;
    let historyAfter=prior?.historyAfter;
    if(cursor&&!sameGeneration)warnings.push(`${room}: room generation changed.`);
    // Repair legacy coverage metadata in the small rules room. Busy rooms are
    // recovered only for missing ranges, never by re-verifying their entire archive.
    const auditOldCursor=room===ROOM.rules&&sameGeneration&&!historyCheckedAt&&first>1;
    const retryHistory=historyPending&&(!historyCheckedAt||now-Date.parse(historyCheckedAt)>300000);
    if(needsRetainedHistory(cursor,data)||auditOldCursor||retryHistory){
     historyAfter=Math.min(historyAfter??Infinity,auditOldCursor?0:sameGeneration?cursor!.seq:0);
     if(historyReads>=2){gap=true;historyPending=true;warnings.push(`${room}: earlier history recovery is queued for a later sync.`);}
     else{
     historyReads++;
     historyCheckedAt=new Date().toISOString();
     try{
      const history=await initialExport(room,data.generation,historyAfter);
      const check=await readRoom(room,Math.max(last,history.last));
      if(check.generation!==data.generation)throw new Error("Room generation changed during history recovery.");
      // Keep the verified tail too: an archive can end before the latest read.
      rows=[...new Map([...history.messages,...rows].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq);
      last=Math.max(last,history.last);
      first=history.first||first;
      gap=history.truncated||(prior?.gap??false)||first>1;historyPending=history.truncated;
      if(!history.truncated&&history.first===1&&historyAfter===0)gap=false;
      if(!historyPending)historyAfter=undefined;
      if(gap)warnings.push(`${room}: the retained archive does not establish complete room history.`);
     }catch{
      gap=true;historyPending=true;
      warnings.push(`${room}: some earlier messages could not be recovered; a later sync will retry.`);
     }
     }
    }
    const keep=rows.filter(m=>typeof m.from==="string"&&typeof m.text==="string"&&Number.isInteger(m.seq)&&relevant(room,m));
    for(let i=0;i<keep.length;i+=40){const slice=keep.slice(i,i+40);await Promise.all(slice.map(async m=>{m.signatureValid=await verifyEnvelope(room,m);}));const valid=slice.filter(m=>m.signatureValid);if(valid.length)await db.batch(valid.map(m=>db.prepare("INSERT OR IGNORE INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)").bind(`${room}:${data.generation}:${m.seq}`,room,data.generation,m.seq,JSON.stringify(m),m.ts)));}
    if(roleBackfill&&!historyPending)await db.prepare("INSERT OR REPLACE INTO sonnet_cache(key,value,expires) VALUES(?,?,?)").bind("sonnet-2:role-history-v1","complete",Date.now()+31536000000).run();
    const stamp=new Date().toISOString();await db.prepare("INSERT INTO sonnet_cursors(room,generation,seq,first_seq,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(room) DO UPDATE SET generation=excluded.generation,seq=excluded.seq,first_seq=excluded.first_seq,updated_at=excluded.updated_at").bind(room,data.generation,last,first,stamp).run();
    stats.push({room,generation:data.generation,first,last,count:keep.length,checkedAt:stamp,gap,historyCheckedAt,historyPending,historyAfter,checkSucceeded:true});connected=true;
   }catch(e){warnings.push(e instanceof Error?e.message:"A contest room is temporarily unavailable.");const c=cursors.get(room),prior=cachedSnapshot?.roomStats.find(s=>s.room===room);if(c)stats.push({...prior,room,generation:c.generation,first:c.first_seq,last:c.seq,count:0,checkedAt:c.updated_at,checkSucceeded:false});}
  }));
  // A busy room may advance more than the API's 200-message window between
  // visits. Repair retained history instead of keeping a permanent ledger gap.
  const repair=oldTeams.find(t=>chosen.includes(t.room)&&t.frozen&&!t.ledgerComplete&&t.generation!==null);
  if(repair)try{await backfillTeamHistory(repair.room,repair.generation!);}catch{warnings.push(`${repair.room}: earlier accepted turns are still unavailable.`);}
  // Identity, roster, turn and submission evidence must not age out under voting traffic.
  const historyStarted=Date.now();
  const records=await readProjectionHistory(db);
  console.info("contest projection pages loaded",{records:records.length,elapsedMs:Date.now()-historyStarted});
  const projectionStarted=Date.now();
  const projection=projectMessages(records,refereePin());
  console.info("contest projection completed",{records:records.length,elapsedMs:Date.now()-projectionStarted});
  // Vote receipts are collected independently and merged by /api/lobby and /api/votes.
  try{await enrichAcceptedPoems(projection);}catch{warnings.push("Accepted words are shown; line reconstruction is waiting for the frozen dictionary.");}
  if(!projection.launchSeen)warnings.unshift("The official launch signature could not be verified. Requests remain observations until the trust anchor is available.");
  warnings.push("Vote standings use observed, accepted ballots. Eligibility review and the official final tally may change the result.");
  for(const t of projection.teams){t.lastCheckedAt=stats.find(s=>s.room===t.room)?.checkedAt??cursors.get(t.room)?.updated_at??null;if(t.setupReceipt&&!t.lastCheckedAt)t.blockers.push("First team-room scan pending");}
  const roomStats=[...new Map([...(cachedSnapshot?.roomStats??[]),...stats].map(s=>[s.room,s])).values()];
  const snapshot:Snapshot={...projection,connected,updatedAt:connected?new Date().toISOString():cachedSnapshot?.updatedAt??null,warnings,coverage:"partial",roomStats,indexing:false};
  const encoded=await encodeSnapshot(snapshot);
  console.info("snapshot cache prepared",{bytes:encoded.length,writers:snapshot.writers.length,teams:snapshot.teams.length});
  await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(CACHE,encoded,Date.now()+45000).run();return snapshot;
 }catch(error){
  console.error("contest snapshot failed",error instanceof Error?error.message:String(error));
  const fallback=previousCache??await db.prepare("SELECT value,expires FROM sonnet_cache WHERE key=?").bind(`${CONTEST}:snapshot`).first<{value:string;expires:number}>();
  if(fallback){const previous=await decodeSnapshot<Snapshot>(fallback.value);return {...previous,connected:false,indexing:false,warnings:[...(previous.warnings||[]),"Live refresh failed; showing the last saved index. Registration status may be incomplete."]};}
  throw error;
 }finally{await db.prepare("DELETE FROM sonnet_cache WHERE key=? AND value=?").bind(LEASE,leaseId).run();}
}

/** Shared, bounded repair; a missing upstream archive never becomes fake text. */
export async function backfillTeamHistory(room:string,generation:number){
 if(!/^d-sonnet-2-team-[a-z0-9][a-z0-9_-]{0,15}$/.test(room))throw Error("Unsupported team room");
 const db=database(),now=Date.now(),key=`poem-backfill:v1:${room}:${generation}`;
 const lease=await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE sonnet_cache.expires < ?").bind(key,"checking",now+300000,now).run();
 if(lease.meta.changes!==1)return false;
 const history=await initialExport(room,generation);
 const check=await readRoom(room,history.last);
 if(check.generation!==generation)throw Error("Room generation changed during history recovery");
 for(let i=0;i<history.messages.length;i+=40){
  const batch=history.messages.slice(i,i+40);
  await Promise.all(batch.map(async m=>{m.signatureValid=await verifyEnvelope(room,m);}));
  const valid=batch.filter(m=>m.signatureValid);
  if(valid.length)await db.batch(valid.map(m=>db.prepare("INSERT OR IGNORE INTO sonnet_records(id,room,generation,seq,body,ts) VALUES(?,?,?,?,?,?)").bind(`${room}:${generation}:${m.seq}`,room,generation,m.seq,JSON.stringify(m),m.ts)));
 }
 return true;
}
