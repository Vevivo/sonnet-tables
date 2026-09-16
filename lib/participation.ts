import {CONTEST,MANIFEST_HASH,REFEREE,ROOM,type Message,type Team,type Writer} from "./sonnet-types";
import {START,DEADLINE} from "./protocol";

export type ActionKind="register"|"create"|"interest"|"roster"|"withdraw"|"message"|"word"|"submit"|"vote"|"claim"|"coordinate";
export type ActionRecord={request:Message;receipt:Message|null;status:"accepted"|"rejected"|"pending"|"recorded";reason:string};
export function packet(m:Message):Record<string,any>{try{const p=JSON.parse(m.text);return p&&typeof p==="object"&&!Array.isArray(p)?p:{};}catch{return {};}}
export function trustedLaunch(messages:Message[]){return messages.some(m=>m.signatureValid&&m.from===REFEREE&&m.room===ROOM.rules&&packet(m).type==="sonnet.launch.v1"&&packet(m).configuration?.contest_id===CONTEST&&packet(m).configuration?.referee===REFEREE&&packet(m).package?.sha256===MANIFEST_HASH);}
export function actionRecords(messages:Message[],did:string):ActionRecord[]{
 const anchored=trustedLaunch(messages),requests=new Map<string,Message>();
 for(const m of [...messages].sort((a,b)=>a.seq-b.seq)){const p=packet(m);if(m.signatureValid&&m.from===did&&p.contest_id===CONTEST&&typeof p.request_id==="string"&&p.type!=="sonnet.receipt.v1"){
  const k=`${m.room}|${m.generation}|${p.request_id}`;if(!requests.has(k))requests.set(k,m);
 }}
 return [...requests.values()].map(request=>{
  const p=packet(request),receipt=anchored?messages.filter(m=>m.signatureValid&&m.from===REFEREE&&m.room===request.room&&m.generation===request.generation&&packet(m).contest_id===CONTEST&&packet(m).type==="sonnet.receipt.v1"&&packet(m).sender_did===did&&packet(m).request_id===p.request_id&&Number.isInteger(packet(m).intake_seq)&&["accepted","rejected"].includes(packet(m).status)).sort((a,b)=>packet(a).intake_seq-packet(b).intake_seq||a.seq-b.seq)[0]??null:null;
  const note=["sonnet.note.v1","sonnet.recruit.v1","sonnet.invite.v1","sonnet.reply.v1"].includes(p.type);
  return {request,receipt,status:receipt?packet(receipt).status:note?"recorded":"pending",reason:receipt?String(packet(receipt).reason??""):""} as ActionRecord;
 }).sort((a,b)=>b.request.ts.localeCompare(a.request.ts));
}
export function roleFrom(records:ActionRecord[]):Writer|undefined{
 const registrations=records.filter(r=>packet(r.request).type==="sonnet.register.v1").sort((a,b)=>a.request.seq-b.request.seq);
 const valid=registrations.find(r=>r.status==="accepted"&&packet(r.receipt!).participant_did===r.request.from&&packet(r.receipt!).role===packet(r.request).role&&(packet(r.request).role!=="writer"||packet(r.receipt!).x_account_url===packet(r.request).x_account_url));
 const r=valid??registrations.at(-1);if(!r)return;
 const p=packet(r.request);return {did:r.request.from,name:p.x_account_url?.split("/").pop()??r.request.from,role:p.role,x:p.x_account_url,registration:valid?"confirmed":r.status==="rejected"?"rejected":"requested",receipt:r.receipt??undefined,letters:"",teams:[],available:false,lastSeen:r.request.ts};
}
export function actionProblem(kind:ActionKind,did:string,person:Writer|undefined,team:Team|null,teams:Team[],now=Date.now()):string|null{
 if(!did)return "Connect your existing DID to continue. A public DID alone cannot sign an action.";
 if(["register","create","roster","word","submit","vote","withdraw"].includes(kind)&&(now<START||now>DEADLINE))return "This action is outside the contest window. Check the official announcement.";
 if(kind==="vote"&&did===REFEREE)return "The referee cannot vote. Contributors, organizers and judges cannot vote either.";
 if(kind==="register")return person?.registration==="confirmed"?`Your ${person.role} registration is already accepted and fixed for this contest.`:person?.registration==="requested"?"Your original registration has no verified result here yet. Check that request before sending another registration.":null;
 if(["create","roster","word","submit","vote","interest","coordinate"].includes(kind)&&person?.registration!=="confirmed")return "Register first and wait for the referee to accept your role.";
 if(kind==="vote")return person?.role!=="voter"?"Only registered voters can vote. Writers and organizers cannot change roles to vote.":!team?.entryId||team.status!=="submitted"?"Choose a poem with an accepted submission.":null;
 if(kind==="create"&&!['writer','organizer'].includes(person?.role??""))return "A registered writer or organizer must request the room.";
 if(["interest","roster","word","submit"].includes(kind)&&person?.role!=="writer")return "This step requires an accepted writer registration.";
 if(["interest","roster"].includes(kind)){
  const locked=teams.find(t=>t.id!==team?.id&&t.frozen&&t.status!=="submitted"&&t.members.includes(did));
  if(locked)return `You are committed to ${locked.id} until its submission is accepted.`;
  if(team?.frozen||team?.status==="completed"||team?.status==="submitted")return "This roster is locked. Membership cannot change after the first accepted word.";
 }
 if(kind==="coordinate"&&(!team||team.host!==did))return "Only this table's host can send a host decision. Each writer still signs their own consent.";
 if(kind==="roster"&&!team?.setupReceipt)return "Wait for the official room allocation before signing a roster.";
 if(kind==="withdraw"&&(!team?.members.includes(did)||team.frozen))return "You can withdraw only your own roster consent, before the first accepted word.";
 if(kind==="word"){
  if(!team?.members.includes(did))return "You must belong to this table's confirmed roster.";
  if(!team.confirmed||!team.ledgerComplete||!team.stateHash||!team.lastCheckedAt||now-Date.parse(team.lastCheckedAt)>120000)return "Refresh this table. A verified, current referee state is required before writing.";
  if(team.status==="submitted"||team.status==="completed")return "This poem is complete. No more words can be added.";
  if(team.lastWriter===did)return "Another teammate must contribute before you can write again.";
 }
 if(kind==="submit"&&(!team?.canonicalPoem||!team.poemHash||team.status!=="completed"||team.lastWriter!==did))return "Only the final contributor can publish and submit the exact completed poem.";
 return null;
}
export function explainRejection(reason:string,type?:string){
 // Ballot errors must not become guessed word, roster or publication advice.
 if(type==="sonnet.ballot.v1")return "This rejected ballot does not replace an earlier accepted choice. Follow the referee’s exact reason below; correct only that issue before closing. This site cannot override the decision.";
 if(type==="sonnet.register.v1")return "Read the exact registration decision below. Your first accepted role remains fixed. Correct only the stated issue; missing pre-start identity evidence must be verified by the referee before retrying.";
 const r=reason.toLowerCase();
 if(/nonce/.test(r))return "Your signing tool must use a nonce newer than its last message in this room. Keep the same request when checking an uncertain delivery.";
 if(/request.?id|idempot|duplicate/.test(r))return "Check the original action first. Retry unchanged content with the same request ID; a corrected rejected action needs a new ID.";
 if(/version|state.?hash|stale|generation/.test(r))return "Refresh the table and review its latest accepted state before preparing a corrected action.";
 if(/consecutive|last.?writer|turn/.test(r))return "Wait for another teammate's accepted word. The same writer cannot contribute twice in a row.";
 if(/syllable|line.*10|ten/.test(r))return "Check the remaining syllables in the current line and choose a word that fits.";
 if(/dictionary|lexicon/.test(r))return "Choose a word found in the contest's frozen dictionary.";
 if(/letter|alphabet/.test(r))return "Choose a word your DID can spell, or ask a teammate whose DID has the missing letters.";
 if(/roster|consent|member|frozen/.test(r))return "Review the exact roster and missing signatures. A locked roster cannot be changed.";
 if(/eligib|pre.?start|archive|cutoff/.test(r))return "Check the signed evidence for this exact DID from before 11 September 2026, 12:00 UTC. Creating a new DID does not satisfy this condition.";
 if(/registr|role|voter/.test(r))return "Check your accepted registration and role. Writers and organizers cannot cast ballots.";
 if(/x_|publication|post|sha256|hash/.test(r))return "The final contributor must publish the exact frozen poem from their registered X account and provide the ordered post links.";
 return "Read the referee's original reason below, correct that specific issue, then prepare a new action. Acceptance cannot be overridden here.";
}
export function lineProgress(words:string[],lex:Map<string,number>){let completed=0,syllables=0;let current:string[]=[];for(const word of words){const n=lex.get(word.replace(/[,.;:!?]$/,"").toLowerCase());if(!n||syllables+n>10||completed>=14)throw Error("The accepted word history needs reconciliation.");syllables+=n;current.push(word);if(syllables===10){completed++;syllables=0;current=[];}}return {completed,syllables,remaining:completed===14?0:10-syllables,current:current.join(" "),line:Math.min(14,completed+1)};}
