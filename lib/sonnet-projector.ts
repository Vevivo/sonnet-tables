import {contestEvidence} from './contest-evidence';
import {lettersOf,ROOM,REFEREE,MANIFEST_HASH,CONTEST,shortDid,type Message,type Snapshot,type Team,type Writer,type RosterMemberState,emptySnapshot} from "./sonnet-types";
import {verifiedPoemMembers} from "./table-discovery";
import {DID_PATTERN} from "./signatures";
const txt=(v:unknown):string=>typeof v==="string"?v:"";
const game=(v:unknown)=>typeof v==="string"&&/^[a-z0-9][a-z0-9_-]{0,15}$/.test(v)?v:null;
const same=(a:string[],b:string[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const displayName=(did:string,handle?:string)=>handle||shortDid(did);
const payloadCache=new WeakMap<Message,{text:string;source:Message["payload"];value:Record<string,any>}>();
export function payload(m:Message):Record<string,any>{
 const cached=payloadCache.get(m);if(cached&&cached.text===m.text&&cached.source===m.payload)return cached.value;
 let value:Record<string,any>={};try{const p=m.payload??JSON.parse(m.text);if(p&&typeof p==="object"&&!Array.isArray(p))value=p;}catch{}
 payloadCache.set(m,{text:m.text,source:m.payload,value});return value;
}
function groupBy(messages:Message[],key:(m:Message)=>string|null){const groups=new Map<string,Message[]>();for(const m of messages){const k=key(m);if(k===null)continue;const list=groups.get(k);if(list)list.push(m);else groups.set(k,[m]);}return groups;}
export function messageBody(m:Message){const p=payload(m);return (txt(p.text)||m.text).replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));}
export function recruitmentHints(m:Message){
 const p=payload(m),text=messageBody(m);
 const letters=txt(p.needed_letters)||txt(p.missing_letters)||text.match(/(?:needed|needs?|missing|misses?|lack(?:s|ing)?|cover)\s*(?:letters?\s*)?[:=]?\s*([a-z](?:[\s,\/]+[a-z]){1,12})(?=[\s.;:)]|$)/i)?.[1]||"";
 const requested=[...new Set(letters.toLowerCase().replace(/[^a-z]/g,""))].sort().join("");
 const number=text.match(/\b([1-7])\s+(?:(?:open|final|more|additional|writer)\s+)*(?:seats?|places?|writers?)\b/i)?.[1];
 const seats=number?Number(number):/\b(?:one|final|last)\s+(?:open\s+)?seat\b/i.test(text)?1:null;
 const closed=/\b(?:recruitment closed|closing my unfilled|no (?:open )?seats|no longer recruiting)\b/i.test(text);
 const recruiting=!closed&&(p.type==="sonnet.recruit.v1"||/\b(?:open seats?|final seat|last seat|looking for .*writers?|recruiting|inviting unteamed|need .*writers?|seat offer|forming (?:a )?team)\b/i.test(text));
 return {requested,seats,closed,recruiting};
}
export function projectMessages(input:Message[],refereeDid:string|null):Snapshot{
 const writers=new Map<string,Writer>(),teams=new Map<string,Team>();
 const events=input.filter(m=>m.signatureValid).sort((a,b)=>a.ts.localeCompare(b.ts)||a.seq-b.seq);
 const launch=events.find(m=>refereeDid===REFEREE&&m.from===REFEREE&&m.room===ROOM.rules&&payload(m).type==="sonnet.launch.v1"&&payload(m).configuration?.contest_id===CONTEST&&payload(m).configuration?.referee===REFEREE&&payload(m).package?.sha256===MANIFEST_HASH);
 const official=(m:Message)=>!!launch&&m.from===REFEREE&&payload(m).contest_id===CONTEST;
 const requests=new Map<string,Message>();
 for(const m of events){const p=payload(m);if(m.from===REFEREE||p.contest_id!==CONTEST||typeof p.request_id!=="string")continue;const key=`${m.room}|${m.from}|${p.request_id}`;if(!requests.has(key))requests.set(key,m);}
 const receipts=events.filter(m=>official(m)&&payload(m).type==="sonnet.receipt.v1"&&Number.isInteger(payload(m).intake_seq)).sort((a,b)=>payload(a).intake_seq-payload(b).intake_seq||a.seq-b.seq);
 const responses=new Map<string,Message>();
 for(const r of receipts){const p=payload(r),key=`${r.room}|${p.sender_did}|${p.request_id}`;if(requests.has(key)&&!responses.has(key))responses.set(key,r);}
 const response=(m:Message)=>responses.get(`${m.room}|${m.from}|${payload(m).request_id}`);
 const accepted=(m:Message)=>{const r=response(m);return !!r&&payload(r).status==="accepted";};
 const writer=(did:string,ts:string)=>{if(!writers.has(did))writers.set(did,{did,name:displayName(did),letters:lettersOf(did),lastSeen:ts,role:"participant",registration:"unknown",teams:[],available:false,applications:[],confirmedTeams:[]});const w=writers.get(did)!;if(ts>w.lastSeen)w.lastSeen=ts;return w;};
 const team=(id:string,m:Message)=>{if(!teams.has(id))teams.set(id,{id,room:`d-sonnet-2-team-${id}`,generation:null,status:"forming",members:[],consents:[],acceptedConsents:[],referenced:[],host:m.from===REFEREE?"":m.from,confirmed:false,conflicts:[],lastSeen:m.ts,notes:[],words:[],lines:[],version:null,stateHash:null,lastWriter:null,entryId:null,allocationRequested:false,sourceRoom:m.room,sourceSeq:m.seq,proposals:0,rosterValid:false,availableRequest:false,setupReceipt:null,rosterReceipt:null,lastReceipt:null,recruitment:null,requestedLetters:"",missingLetters:"",openSeats:null,applicants:[],blockers:[],poemHash:null,canonicalPoem:null,frozen:false,ledgerComplete:false,validVotes:0,closed:false});const t=teams.get(id)!;if(m.ts>t.lastSeen)t.lastSeen=m.ts;return t;};
 const rosters:Message[]=[],withdrawals:Message[]=[];
 const knownGames=[...new Set(events.map(m=>game(payload(m).game_id)).filter((x):x is string=>!!x))].map(id=>({id,pattern:new RegExp(`\\b${id}\\b`)}));
 for(const m of events){
  const p=payload(m),type=txt(p.type);
  if(p.contest_id&&p.contest_id!==CONTEST)continue;
  if(m.from===REFEREE){if(official(m)&&m.room===ROOM.results&&["sonnet.setup.v1","sonnet.resetup.v1"].includes(type)&&game(p.game_id)&&p.poem_room===`d-sonnet-2-team-${p.game_id}`&&Number.isInteger(p.room_generation)){
    const t=team(p.game_id,m);t.generation=p.room_generation;t.setupReceipt=m;
   }continue;}
  if(!DID_PATTERN.test(m.from))continue;
  if(m.room===ROOM.registration&&type==="sonnet.register.v1"){
   const w=writer(m.from,m.ts),r=response(m);if(w.registration==="confirmed")continue;
   const rp=r?payload(r):{};
   const registrationValid=accepted(m)&&rp.participant_did===m.from&&rp.role===p.role&&(p.role!=="writer"||rp.x_account_url===p.x_account_url);
   w.role=txt(p.role);w.registration=registrationValid?"confirmed":rp.status==="rejected"?"rejected":"requested";if(r)w.receipt=r;
   if(p.role==="writer"&&/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(txt(p.x_account_url))){w.x=p.x_account_url;w.name=displayName(m.from,p.x_account_url.split("/").pop());}
   continue;
  }
  if(m.room===ROOM.registration)continue;
  // Ballots and campaign chatter do not establish a writer identity.
  if(m.room!==ROOM.discovery&&m.room!==ROOM.submissions&&!m.room.startsWith("d-sonnet-2-team-"))continue;
  let id=game(p.game_id)??(m.room.startsWith("d-sonnet-2-team-")?game(m.room.slice("d-sonnet-2-team-".length)):null);
  if(!id&&m.room===ROOM.discovery)id=knownGames.find(g=>g.pattern.test(m.text))?.id??null;
  const w=writer(m.from,m.ts),body=messageBody(m);
  // A signed self-description can supply a display label, never referee acceptance.
  if(!w.x&&p.writer_did===m.from&&/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(txt(p.x_account_url))){w.x=p.x_account_url;w.name=displayName(m.from,p.x_account_url.split("/").pop());}
  if(m.room===ROOM.discovery){w.note=body.slice(0,700);if(/\b(?:I am available|I am unseated|looking for a team|seeking (?:a )?(?:seat|team)|no (?:active )?roster consent)\b/i.test(body)){w.available=true;w.availabilitySource=m;}}
  if(!id||![ROOM.discovery,ROOM.submissions,`d-sonnet-2-team-${id}`].includes(m.room))continue;
  const t=team(id,m);t.notes.push(m);
  if(m.room===ROOM.discovery){
   if(type==="sonnet.team-request.v1"){t.host=m.from;t.allocationRequested=true;t.sourceSeq=m.seq;t.sourceRoom=m.room;}
   const hints=recruitmentHints(m);
   if(!t.host||t.host===m.from){if(hints.recruiting){t.recruitment=m;t.requestedLetters=hints.requested;t.openSeats=hints.seats;t.availableRequest=true;t.closed=false;}if(hints.closed){t.closed=true;t.availableRequest=false;t.recruitment=m;}}
   const refs=body.match(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}/g)??[];t.referenced=[...new Set([...t.referenced,...refs])];
   if(type==="sonnet.application.v1"||(m.from!==t.host&&/\b(?:I apply|applies to|yes[- ]|I would like to join|I accept .*seat)\b/i.test(body))){if(!t.applicants.includes(m.from))t.applicants.push(m.from);if(!w.applications!.includes(id))w.applications!.push(id);}
   if(type==="sonnet.roster.v1"&&Array.isArray(p.members)&&p.members.length>=4&&p.members.length<=8&&new Set(p.members).size===p.members.length&&p.members.every((d:unknown)=>typeof d==="string"&&DID_PATTERN.test(d))&&p.members.includes(m.from)&&(p.poem_room===t.room||p.poem_room===undefined&&accepted(m))&&Number.isInteger(p.room_generation))rosters.push(m);
   if(type==="sonnet.withdraw.v1")withdrawals.push(m);
  }
  if(m.room===t.room&&type==="sonnet.word.v1")t.proposals++;
 }
 const hostRequestsByGame=groupBy(events.filter(m=>m.room===ROOM.discovery&&payload(m).type==="sonnet.team-request.v1"),m=>game(payload(m).game_id));
 const rostersByGame=groupBy(rosters,m=>game(payload(m).game_id));
 const withdrawalsByGame=groupBy(withdrawals,m=>game(payload(m).game_id));
 const receiptsByRoom=groupBy(receipts,m=>m.room);
 const acceptedReceiptsByGame=groupBy(receipts.filter(r=>payload(r).status==="accepted"),r=>{
  const p=payload(r),request=requests.get(`${r.room}|${p.sender_did}|${p.request_id}`);
  return request?game(payload(request).game_id)??(request.room.startsWith("d-sonnet-2-team-")?game(request.room.slice("d-sonnet-2-team-".length)):null):null;
 });
 const latestMembership=new Map<string,Message>();
 for(const m of [...rosters,...withdrawals])if(accepted(m)){const last=latestMembership.get(m.from);if(!last||payload(response(m)!).intake_seq>=payload(response(last)!).intake_seq)latestMembership.set(m.from,m);}
 for(const t of teams.values()){
  const teamWithdrawals=withdrawalsByGame.get(t.id)??[];
  const hostRequests=hostRequestsByGame.get(t.id)??[];
  const hostRequest=hostRequests.find(accepted)??hostRequests[0];if(hostRequest)t.host=hostRequest.from;
  const recruitment=t.notes.filter(m=>m.room===ROOM.discovery&&m.from===t.host&&(recruitmentHints(m).recruiting||recruitmentHints(m).closed)).at(-1);
  const hostPlan=t.notes.filter(m=>m.from===t.host&&payload(m).type==="sonnet.note.v1"&&payload(m).coordination==="roster_proposal"&&Array.isArray(payload(m).members)&&payload(m).members.length>=4&&payload(m).members.length<=8&&new Set(payload(m).members).size===payload(m).members.length&&payload(m).members.every((d:unknown)=>typeof d==="string"&&DID_PATTERN.test(d))&&payload(m).room_generation===t.generation).at(-1);if(hostPlan)t.hostPlan=hostPlan;
  if(recruitment){const h=recruitmentHints(recruitment);t.recruitment=recruitment;t.availableRequest=h.recruiting;t.closed=h.closed;t.requestedLetters=h.requested;t.openSeats=h.seats;}
  const candidates=(rostersByGame.get(t.id)??[]).filter(m=>!t.setupReceipt||payload(m).room_generation===t.generation);
  const acceptedRosters=candidates.filter(accepted).sort((a,b)=>payload(response(a)!).intake_seq-payload(response(b)!).intake_seq);
  const chosen=acceptedRosters.at(-1)??candidates.at(-1);
  if(chosen){const p=payload(chosen);t.members=p.members;t.rosterValid=true;t.rosterProposal=chosen;
   const matching=candidates.filter(m=>same(payload(m).members,t.members));
   t.consents=t.members.filter(d=>{const m=matching.filter(m=>m.from===d).at(-1);return !!m&&!teamWithdrawals.some(x=>x.from===d&&x.ts>m.ts&&!response(x));});
   t.acceptedConsents=t.members.filter(d=>{const last=latestMembership.get(d);return !!last&&payload(last).type==="sonnet.roster.v1"&&payload(last).game_id===t.id&&payload(last).room_generation===t.generation&&same(payload(last).members,t.members);});
   const receipt=response(chosen);t.rosterReceipt=receipt??null;
   if(receipt&&accepted(chosen)&&t.setupReceipt){const rp=payload(receipt);
    t.stateHash=/^[a-f0-9]{64}$/.test(txt(rp.state_hash))?rp.state_hash:null;
    const laterWithdrawal=teamWithdrawals.some(x=>accepted(x)&&payload(response(x)!).intake_seq>rp.intake_seq);
    t.confirmed=rp.roster_ready===true&&!laterWithdrawal;t.status=t.confirmed?"ready":"forming";t.lastReceipt=receipt;
    if(t.confirmed&&t.stateHash){t.version=0;t.ledgerComplete=true;}
   }
  }
  // The referee also publishes the initial roster-ready receipt inside the poem
  // room. Correlate that copy with the exact signed roster, never a chat claim.
  if(!t.ledgerComplete&&t.setupReceipt&&chosen){
   const anchor=(receiptsByRoom.get(t.room)??[]).find(r=>r.generation===t.generation&&payload(r).status==="accepted"&&payload(r).roster_ready===true&&/^[a-f0-9]{64}$/.test(txt(payload(r).state_hash))&&candidates.some(m=>m.from===payload(r).sender_did&&payload(m).request_id===payload(r).request_id&&same(payload(m).members,t.members)));
   if(anchor&&!teamWithdrawals.some(m=>accepted(m)&&payload(response(m)!).intake_seq>payload(anchor).intake_seq)){
    t.confirmed=true;t.status="ready";t.rosterReceipt=anchor;t.lastReceipt=anchor;t.stateHash=payload(anchor).state_hash;t.version=0;t.ledgerComplete=true;
   }
  }
  for(const r of acceptedReceiptsByGame.get(t.id)??[]){const rp=payload(r),request=requests.get(`${r.room}|${rp.sender_did}|${rp.request_id}`);if(!request||rp.status!=="accepted")continue;const p=payload(request);if((game(p.game_id)??(request.room.startsWith("d-sonnet-2-team-")?game(request.room.slice("d-sonnet-2-team-".length)):null))!==t.id)continue;
   if(p.type==="sonnet.word.v1"&&request.room===t.room&&p.room_generation===t.generation){
    t.frozen=true;t.status="writing";t.lastReceipt=r;
    if(t.ledgerComplete&&p.version===t.version&&rp.version===Number(p.version)+1&&p.previous_state_hash===t.stateHash&&t.members.includes(request.from)&&t.lastWriter!==request.from&&/^[a-f0-9]{64}$/.test(txt(rp.state_hash))){t.words.push(txt(p.word));(t.acceptedTurns??=[]).push({did:request.from,word:txt(p.word),receipt:{room:r.room,seq:r.seq}});t.version=rp.version;t.stateHash=rp.state_hash;t.lastWriter=request.from;t.contributors=[...new Set([...(t.contributors??[]),request.from])];t.completionAccepted=rp.complete===true;}
    else if(Number(p.version)>=Number(t.version)){t.ledgerComplete=false;t.stateHash=null;t.version=null;}
   }
   if(p.type==="sonnet.submit.v1"&&request.room===ROOM.submissions&&p.room_generation===t.generation&&(!t.members.length||t.members.includes(request.from))&&txt(rp.entry_id)){
    t.frozen=true;t.status="submitted";t.entryId=rp.entry_id;t.lastReceipt=r;t.submissionReceipt=r;t.poemHash=txt(p.poem_sha256)||null;t.lastWriter=request.from;
    t.publicationUrls=Array.isArray(p.x_post_ids)?p.x_post_ids.filter((id:unknown)=>typeof id==="string"&&/^\d{1,25}$/.test(id)).map((id:string)=>`https://x.com/i/status/${id}`):[];
   }
  }
  if(t.frozen)t.availableRequest=false;
  t.missingLetters=[..."abcdefghijklmnopqrstuvwxyz"].filter(l=>!t.members.some(d=>lettersOf(d).includes(l))).join("");
  if(!t.setupReceipt)t.blockers.push(t.allocationRequested?"Waiting for official room allocation":"A registered writer or organizer must request the room");
  const pending=t.members.filter(d=>writers.get(d)?.registration!=="confirmed");if(pending.length)t.blockers.push(`${pending.length} writer registration${pending.length>1?"s":""} not verified`);
  if(!t.members.length)t.blockers.push(t.closed?"Recruitment closed by the host":"Agree a roster of 4–8 writers");
  else if(!t.confirmed&&!t.frozen)t.blockers.push(`${t.members.length-t.acceptedConsents.length} matching roster approval${t.members.length-t.acceptedConsents.length===1?"":"s"} still unverified`);
  if(t.confirmed&&!t.frozen)t.blockers.push("Roster ready · waiting for the first accepted word");
  if(t.frozen&&!t.ledgerComplete)t.blockers.push("Accepted turns exist; reconcile missing history before proposing a word");
  if(t.frozen&&t.ledgerComplete&&t.status!=="submitted")t.blockers.push("Writing · the last contributor must wait for another writer");
  const latestReject=t.notes.map(response).filter((r):r is Message=>!!r&&payload(r).status==="rejected").at(-1);
  if(latestReject&&(!t.lastReceipt||latestReject.ts>t.lastReceipt.ts))t.blockers.push(`Referee: ${txt(payload(latestReject).reason).slice(0,250)}`);
  t.memberStates=t.members.map(did=>{
   let signature=candidates.filter(m=>m.from===did&&same(payload(m).members,t.members)).at(-1)??null;
   const receipt=signature?response(signature)??null:null;
   const latestAccepted=latestMembership.get(did);
   const withdrawal=teamWithdrawals.filter(m=>m.from===did&&(!signature||m.ts>signature.ts)).at(-1);
   let status:RosterMemberState["status"]="signature_pending",evidence=receipt,reason="";
   if(t.confirmed)status="confirmed";
   else if(withdrawal&&!response(withdrawal)){status="withdrawal_pending";evidence=null;}
   else if(t.acceptedConsents.includes(did))status="consent_accepted";
   else if(latestAccepted&&payload(latestAccepted).type==="sonnet.withdraw.v1"&&payload(latestAccepted).game_id===t.id&&(!signature||latestAccepted.ts>signature.ts)){status="withdrawn";evidence=response(latestAccepted)??null;}
   else if(latestAccepted&&payload(latestAccepted).type==="sonnet.roster.v1"&&(payload(latestAccepted).game_id!==t.id||payload(latestAccepted).room_generation!==t.generation||!same(payload(latestAccepted).members,t.members))){status="other_roster";evidence=response(latestAccepted)??null;}
   else if(receipt&&payload(receipt).status==="rejected"){status="rejected";reason=txt(payload(receipt).reason);}
   else if(signature)status="referee_pending";
   if((status==="confirmed"||status==="consent_accepted")&&latestAccepted&&payload(latestAccepted).type==="sonnet.roster.v1"&&payload(latestAccepted).game_id===t.id&&payload(latestAccepted).room_generation===t.generation&&same(payload(latestAccepted).members,t.members)){signature=latestAccepted;evidence=response(latestAccepted)??null;}
   if(status==="withdrawal_pending"||status==="withdrawn")signature=withdrawal??null;
   return {did,status,signature,receipt:evidence,...(reason?{reason}:{})};
  });
  for(const d of t.members){const w=writer(d,t.lastSeen);w.teams.push(t.id);if(t.confirmed)w.confirmedTeams!.push(t.id);}
  t.notes=t.notes.slice(-8).reverse();
 }
 for(const w of writers.values()){if(w.teams.length||w.applications?.length)w.available=false;for(const id of w.teams)if(w.teams.length>1)teams.get(id)?.conflicts.push(w.did);}
 const ballots=new Map<string,{entry:string;order:number}>();
 for(const r of receipts){const rp=payload(r),req=requests.get(`${r.room}|${rp.sender_did}|${rp.request_id}`);if(req&&rp.status==="accepted"&&req.room===ROOM.votes&&payload(req).type==="sonnet.ballot.v1"&&payload(req).voter_did===req.from)ballots.set(req.from,{entry:txt(payload(req).entry_id),order:rp.intake_seq});}
 for(const t of teams.values())if(t.entryId)t.validVotes=[...ballots.values()].filter(b=>b.entry===t.entryId).length;
 const acceptedEntries=new Set(receipts.filter(r=>{const rp=payload(r),req=requests.get(`${r.room}|${rp.sender_did}|${rp.request_id}`);return req&&req.room===ROOM.submissions&&payload(req).type==="sonnet.submit.v1"&&rp.status==="accepted"&&txt(rp.entry_id);}).map(r=>txt(payload(r).entry_id)));
 const unresolved=[...acceptedEntries].filter(entry=>![...teams.values()].some(t=>t.entryId===entry&&verifiedPoemMembers(t).length>0));
 for(const entry of unresolved){const t=[...teams.values()].find(t=>t.entryId===entry);console.warn("submission roster unresolved",{entry,game_id:t?.id,rostersJson:JSON.stringify(events.filter(m=>(payload(m).game_id===t?.id||payload(m).poem_room===t?.room)&&payload(m).type==="sonnet.roster.v1").slice(-8).map(m=>({seq:m.seq,keys:Object.keys(payload(m)),poem_room:payload(m).poem_room,room_generation:payload(m).room_generation,members:payload(m).members?.length,accepted:accepted(m)})))});}
 return {...emptySnapshot,contestEvidence:contestEvidence(events,refereeDid),submissionAudit:{accepted:acceptedEntries.size,matched:acceptedEntries.size-unresolved.length,unresolved},participants:[...writers.values()].filter(w=>w.role==="organizer"||w.role==="voter"),teams:[...teams.values()].sort((a,b)=>a.id.localeCompare(b.id)),writers:[...writers.values()].filter(w=>w.role!=="voter"&&w.role!=="organizer").sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)),activity:events.filter(m=>m.room===ROOM.discovery&&m.from!==REFEREE).slice(-30).reverse(),refereeDid:launch?REFEREE:null,launchSeen:!!launch,observedAt:events.at(-1)?.ts??null};
}
