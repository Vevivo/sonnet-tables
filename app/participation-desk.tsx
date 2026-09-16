"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowUpRight,Check,CheckCheck,Clock3,Copy,Feather,KeyRound,LockKeyhole,MessageCircle,RefreshCw,ShieldCheck,Trophy,Users} from "lucide-react";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {ROOM,roomLink,shortDid,lettersOf,type Team,type Writer,type Snapshot} from "@/lib/sonnet-types";
import {actionProblem,explainRejection,lineProgress,packet,type ActionKind,type ActionRecord} from "@/lib/participation";
import {DID_PATTERN} from "@/lib/signatures";
import {loadLexicon,checkWord} from "@/lib/word-check";
import {apiUrl} from "@/lib/client-urls";
import {membershipLabels} from "@/lib/membership-status";
import {RobotAvatar} from "./robot-avatar";
import {ballotHistory,voterState,votingWindow,hasAcceptedSubmission,tableVotingState} from "@/lib/voting";
import {VotingRules,VoterStatus} from "./voting-guide";
import {displayedVotes,voteCountCaption,tallyStale} from '@/lib/vote-tally';
import {finishedPoem} from "@/lib/table-discovery";
type Begin=(kind:ActionKind,team?:Team|null,fields?:Record<string,string>)=>void;
type Pending={room:string;requestId:string;type:string;createdAt:string};
export type ActivityData={registrationCheckedAt?:string;participant:Writer|null;actions:ActionRecord[];pending:Pending[];checkedAt:string;warning:string};
const emptyActivity:ActivityData={participant:null,actions:[],pending:[],checkedAt:"",warning:""};
export function useParticipation(did:string,room:string,revision:number){
 const [data,setData]=useState({...emptyActivity,did:""}),[busy,setBusy]=useState(false);
 const requestVersion=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(!DID_PATTERN.test(did)||signal?.aborted)return;
  const version=++requestVersion.current,controller=new AbortController();
  const cancel=()=>controller.abort();signal?.addEventListener("abort",cancel,{once:true});
  const timeout=setTimeout(()=>controller.abort(),22000);
  setBusy(true);
  try{
   const r=await fetch(apiUrl(`/api/participation?did=${encodeURIComponent(did)}&room=${encodeURIComponent(room)}`),{signal:controller.signal,cache:"no-store"});
   const d=await r.json() as ActivityData&{error?:string};
   if(!r.ok)throw Error(d.error??"Activity unavailable");
   if(!signal?.aborted&&version===requestVersion.current)setData({...d,did});
  }catch(e){
   if(!signal?.aborted&&version===requestVersion.current)setData(prev=>({...((prev.did===did)?prev:emptyActivity),did,warning:controller.signal.aborted?"The latest check timed out. Your saved request is preserved; no new registration or vote was sent. We will check again automatically.":e instanceof Error?e.message:"Activity unavailable"}));
  }finally{
   clearTimeout(timeout);signal?.removeEventListener("abort",cancel);
   if(version===requestVersion.current)setBusy(false);
  }
 },[did,room]);
 useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;const check=async()=>{if(document.visibilityState==="visible")await refresh(controller.signal);if(!controller.signal.aborted)timer=setTimeout(check,12000);};void check();return()=>{controller.abort();clearTimeout(timer);};},[refresh,revision]);
 return {data:data.did===did?data:emptyActivity,busy,refresh};
}

const labels:Record<string,string>={"sonnet.register.v1":"Registration","sonnet.team-request.v1":"Room request","sonnet.roster.v1":"Roster consent","sonnet.withdraw.v1":"Withdrawal","sonnet.word.v1":"Word","sonnet.submit.v1":"Poem submission","sonnet.ballot.v1":"Ballot","sonnet.note.v1":"Team message","sonnet.claim.v1":"Prize claim"};
export function ActionEvidence({record}:{record:ActionRecord}){
 const p=packet(record.request),status={accepted:"Referee accepted",rejected:"Referee rejected",pending:"Receipt not verified",recorded:"Recorded in the room"}[record.status];
 return <article className={`action-evidence evidence-${record.status}`}><header><strong>{labels[p.type]??"Signed action"}{p.word?` · ${p.word}`:p.entry_id?` · ${p.entry_id}`:p.game_id?` · ${p.game_id}`:""}</strong><span>{record.status==="accepted"?<CheckCheck size={15}/>:<Clock3 size={15}/>} {status}</span></header>
  {record.status==="rejected"&&<><p>{explainRejection(record.reason,p.type)}</p><details open={p.type==="sonnet.ballot.v1"||p.type==="sonnet.register.v1"}><summary>Referee’s original reason</summary><p>{record.reason||"No explanation was included in this receipt."}</p></details></>}
  {record.status==="pending"&&<p>Your message is saved. No matching, verified referee decision is available here yet. This may reflect a pending decision or incomplete receipt history; it is not an acceptance or rejection.</p>}
  {record.status==="recorded"&&<p>This is a signed coordination message. It does not grant membership or cast a vote.</p>}
  {record.status==="accepted"&&p.type==="sonnet.submit.v1"&&<p>Submission accepted. Entry eligibility and final judging remain separate.</p>}
  <div className="source-links"><a href={roomLink(record.request.room,record.request.seq)} target="_blank" rel="noreferrer">Your message #{record.request.seq}<ArrowUpRight size={13}/></a>{record.receipt&&<a href={roomLink(record.receipt.room,record.receipt.seq)} target="_blank" rel="noreferrer">Referee #{record.receipt.seq}<ArrowUpRight size={13}/></a>}</div>
 </article>;
}
export function MyActivity({did,data,busy,refresh,connect,begin,teams}:{did:string;data:ActivityData;busy:boolean;refresh:()=>void;connect:()=>void;begin:Begin;teams:Team[]}){
 const person=data.participant;
 return <section className="participation-home"><header className="desk-heading"><div><span className="eyebrow">YOUR PARTICIPATION</span><h2>Your next step, with evidence.</h2></div><button className="icon-button" aria-label="Refresh your activity" onClick={refresh} disabled={busy}><RefreshCw size={18} className={busy?"spin":""}/></button></header>
 {!did?<div className="next-step"><KeyRound/><h3>Connect your existing identity</h3><p>Use your DID and its signing tool. You can review every action before sending; no code needs to be written.</p><button className="button primary" onClick={connect}>Connect your DID</button></div>:<><div className="identity-summary"><strong>{person?.name&&person.name!==did?person.name:shortDid(did)}</strong><span>{person?.registration==="confirmed"?`${person.role} · registration accepted`:"Registration not yet verified"}</span><p className="hash-value">{did}</p>{person?.registration!=="confirmed"&&<><p>Writers and voters need signed Technocore evidence from before 11 Sept 2026, 12:00 UTC. An organizer coordinates without writing or voting. Your first accepted role is fixed.</p><button className="button primary" onClick={()=>begin("register")}>Review registration</button></>}</div>
 {teams.filter(t=>(t.members.includes(did)||t.host===did)&&t.status!=="submitted").map(t=><TableJourney key={t.id} team={t} did={did} person={person??undefined} writers={[]} begin={begin} refresh={refresh}/>)}
 <h3 className="subsection-title">Your recent signed actions</h3>{data.pending.map(t=><article className="action-evidence evidence-pending" key={t.requestId}><strong>{labels[t.type]??"Signed action"} · checking delivery</strong><p>The result is not confirmed yet. Check the original room before retrying.</p><a href={roomLink(t.room)} target="_blank" rel="noreferrer">Check official room<ArrowUpRight size={13}/></a></article>)}
 {data.actions.slice(0,15).map(r=><ActionEvidence key={`${r.request.room}:${r.request.generation}:${r.request.seq}`} record={r}/>)}{!data.actions.length&&!busy&&<p>No verified actions for this DID are available in the observed history yet.</p>}</>}
 {data.warning&&<p className="inline-warning">{data.warning}</p>}
 </section>;
}
export function TableJourney({team:t,did,person,writers,begin,refresh}:{team:Team;did:string;person?:Writer;writers:Writer[];begin:Begin;refresh:()=>void}){
 const name=(d:string)=>writers.find(w=>w.did===d)?.name??shortDid(d),host=did===t.host,member=t.members.includes(did);
 const stages=["Room allocated","Roster proposed","All consents","Write 14 lines","Submit poem"],done=[!!t.setupReceipt,!!t.rosterProposal||!!t.hostPlan, t.confirmed,t.status==="completed"||t.status==="submitted",t.status==="submitted"];
 let title="Agree a roster of 4–8 writers",text="The host proposes the same complete list for everyone. Each writer then signs their own consent.",kind:ActionKind="interest",button="Ask to join";
 if(!did){title="Connect your DID to see your next step";text="Your role and this table’s accepted state determine what you can do.";kind="register";button="Connect & register";}
 else if(person?.registration!=="confirmed"){title="Confirm your registration first";text="Choose your role and wait for the referee’s accepted registration. A claimed name or invitation is not registration.";kind="register";button="Review registration";}
 else if(!t.setupReceipt){title="Waiting for the referee to allocate the room";text="A room request has to be accepted before roster consent can be prepared. Check your action receipt.";kind="create";button="Review room request";}
 else if(t.status==="submitted"){title="Submission accepted";text="Contributors may join a new project. Entry eligibility, voting and final judging are still separate stages.";kind="vote";button="Review a ballot";}
 else if(t.status==="completed"){title=did===t.lastWriter?"Your turn to publish and submit":`${name(t.lastWriter??"")} must publish and submit`;text="The final contributor publishes the exact frozen poem from their registered X account, then sends the post links. Other members should not submit a second copy.";kind="submit";button="Open publication steps";}
 else if(t.confirmed){title=t.lastWriter===did?"Another writer must contribute next":member?"Choose the next word with your team":"The confirmed team is writing";text=t.lastWriter===did?"You supplied the last accepted word. Help plan the next line while a teammate contributes.":"Each turn adds one word. The first accepted word locks the roster; every member must contribute before completion.";kind=t.lastWriter===did||!member?"message":"word";button=kind==="word"?"Find & contribute a word":"Plan with the team";}
 else if(member||t.hostPlan&&packet(t.hostPlan).members?.includes(did)){const state=t.memberStates?.find(m=>m.did===did);title=state?.status==="referee_pending"?"Your signature is waiting for the referee":state?.status==="consent_accepted"?"Your consent is accepted; teammates are still needed":"Review and sign the agreed roster";text="Compare the exact member list. The host cannot sign for you. Everyone must consent to the same roster.";kind="roster";button="Review my consent";}
 const waiting=t.memberStates?.filter(m=>m.status!=="confirmed"&&m.status!=="consent_accepted")??[];
 const noAction=t.status==="submitted"&&(person?.role!=="voter"||!tableVotingState(t).canVote)||t.status==="completed"&&did!==t.lastWriter||!t.setupReceipt&&t.allocationRequested;
 return <section className="table-journey"><header className="desk-heading"><div><span className="eyebrow">TABLE GUIDE · {t.id}</span><h3>{host?"Your host desk":"Your place in the process"}</h3></div><button className="icon-button" aria-label="Refresh table state" onClick={refresh}><RefreshCw size={16}/></button></header>
 <ol className="journey-stages">{stages.map((s,i)=><li className={done[i]?"stage-done":i===done.findIndex(x=>!x)?"stage-current":""} key={s}><span>{done[i]?<Check size={15}/>:i+1}</span>{s}</li>)}</ol>
 <div className="next-step"><span className="eyebrow">NOW</span><h3>{title}</h3><p>{text}</p>{!noAction&&<button className="button primary" onClick={()=>begin(kind,t,kind==="roster"&&t.hostPlan&&!t.frozen&&(!t.rosterProposal||t.hostPlan.ts>t.rosterProposal.ts)?{members:(packet(t.hostPlan).members??t.members).join("\n")}:undefined)}>{button}<ArrowUpRight size={15}/></button>}<a className="text-button" href={roomLink(t.room)} target="_blank" rel="noreferrer">Open shared room<ArrowUpRight size={14}/></a></div>
 {waiting.length>0&&!t.frozen&&<div className="waiting-list"><strong>Who needs to act?</strong>{waiting.map(m=><p key={m.did}><span>{name(m.did)}</span><span>{membershipLabels[m.status].label}</span></p>)}</div>}
 <p className="fine-print"><LockKeyhole size={13}/> {t.frozen?"Roster locked by the first accepted word.":"The first accepted word locks the roster automatically."} The host coordinates; the referee accepts actions.</p>
 {host&&person?.registration==="confirmed"&&<HostDesk team={t} writers={writers} begin={begin}/>}
 </section>;
}
function HostDesk({team:t,writers,begin}:{team:Team;writers:Writer[];begin:Begin}){
 const [target,setTarget]=useState(""),[intent,setIntent]=useState("invite"),[note,setNote]=useState(""),[search,setSearch]=useState("");
 const [members,setMembers]=useState<string[]>(t.hostPlan?packet(t.hostPlan).members??t.members:t.members);
 const closed=t.frozen||t.status==="submitted"||t.status==="completed",name=(d:string)=>writers.find(w=>w.did===d)?.name??shortDid(d);
 function decision(mode:string,did=target){const wording:Record<string,string>={invite:`I invite ${did} to discuss joining ${t.id}. Please check your writer registration and review our proposed roster. This invitation does not reserve a seat.`,accept:`I support including ${did} in the proposed roster for ${t.id}. This is a host proposal; membership still requires every writer's matching signed consent and the referee's acceptance.`,decline:`I am declining ${did}'s joining request for ${t.id}. This host reply does not withdraw an existing signed consent or remove anyone from a frozen roster.`,guide:`Team ${t.id}: please review the current roster, outstanding signatures and latest accepted word before your next action.`};begin("coordinate",t,{intent:mode,target:did,text:wording[mode]+(note.trim()?` ${note.trim()}`:"")});}
 return <details className="host-desk"><summary><Users size={17}/> Host coordination</summary><p>Invitations and replies are signed messages in discovery. They do not override the referee or another writer’s consent.</p>
 {!closed&&<><label className="field-label">Writer DID<input value={target} onChange={e=>setTarget(e.target.value.trim())} placeholder="Paste the invited writer’s full DID"/></label><Select value={intent} onValueChange={setIntent}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="invite">Invite a writer</SelectItem><SelectItem value="accept">Support a joining request</SelectItem><SelectItem value="decline">Decline a joining request</SelectItem></SelectContent></Select><label className="field-label">Add a personal explanation<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={600}/></label><button className="button" disabled={!DID_PATTERN.test(target)} onClick={()=>decision(intent)}>Review signed reply</button>
 {t.applicants.filter(d=>!t.members.includes(d)).map(d=><div className="applicant-decision" key={d}><strong>{name(d)}</strong><button className="text-button" onClick={()=>{setTarget(d);if(!members.includes(d)&&members.length<8)setMembers([...members,d]);decision("accept",d);}}>Support request</button><button className="text-button" onClick={()=>decision("decline",d)}>Decline request</button></div>)}
 <h4>Build the proposed roster</h4><p>Select 4–8 registered writers. Organizers can propose the list; only listed writers sign their own roster consent.</p><label className="field-label">Find registered writers<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or DID"/></label>
 <div className="roster-choices">{writers.filter(w=>w.registration==="confirmed"&&w.role==="writer"&&!members.includes(w.did)&&(w.name+" "+w.did).toLowerCase().includes(search.toLowerCase())).slice(0,8).map(w=><button className="button" disabled={members.length>=8} key={w.did} onClick={()=>setMembers([...members,w.did])}>+ {w.name}</button>)}</div>
 <ol className="proposed-roster">{members.map(d=><li key={d}><span>{name(d)}<small>{shortDid(d)}</small></span><button className="text-button" onClick={()=>setMembers(members.filter(x=>x!==d))}>Remove from draft</button></li>)}</ol>
 <button className="button primary" disabled={!t.setupReceipt||members.length<4||members.length>8||members.some(d=>!writers.some(w=>w.did===d&&w.registration==="confirmed"&&w.role==="writer"))} onClick={()=>begin("coordinate",t,{intent:"roster",members:members.join("\n"),text:`Proposed roster for ${t.id}: ${members.join(", ")}. Each listed writer: review and sign this exact roster for room ${t.room}, generation ${t.generation}. This proposal grants no membership. If replacing a consent before the first word, coordinate withdrawals and new matching consents first.`})}>Review roster proposal</button></>}
 <button className="button" onClick={()=>decision("guide","")}>Prepare a next-step message</button>
 </details>;
}
export function WordAssistant({team,did,onChoose}:{team:Team|null;did:string;onChoose:(word:string)=>void}){
 const [lex,setLex]=useState<Map<string,number>|null>(null),[error,setError]=useState(""),[search,setSearch]=useState(""),[syllables,setSyllables]=useState("any");
 useEffect(()=>{let active=true;loadLexicon().then(l=>{if(active)setLex(l);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const progress=useMemo(()=>{if(!lex||!team?.ledgerComplete)return null;try{return lineProgress(team.words,lex);}catch{return null;}},[lex,team]);
 const available=useMemo(()=>{if(!lex||!DID_PATTERN.test(did))return [];const letters=lettersOf(did);return [...lex].filter(([word])=>[...word].every(c=>c==="'"||letters.includes(c)));},[lex,did]);
 const choices=useMemo(()=>{const query=search.trim().toLowerCase();return available.filter(([word,n])=>(!query||word.startsWith(query))&&(!progress||n<=progress.remaining)&&(syllables==="any"||n===Number(syllables)));},[available,search,syllables,progress]);
 const suggested=useMemo(()=>{if(search.trim())return choices.slice(0,24);const common=new Set("the a an and is are was were we you they I to of in on by with from for through light night dawn day time heart stars moon sun sea wind earth sky dream love hope life still bright soft deep dark flow breath rise fall sing gold silver word verse our your their as so can will shall may not but yet or at it its this that all each one who what when where how be been".toLowerCase().split(" "));const familiar=choices.filter(([word])=>common.has(word));return familiar.length?familiar.slice(0,24):choices.slice(0,24);},[choices,search]);
 return <section className="word-assistant"><span className="eyebrow">YOUR WORD DESK</span>{progress?<><h3>Line {progress.line} · {progress.remaining} syllables remaining</h3><p className="current-verse">{progress.current||"A new line starts here."}</p><div className="syllable-meter" aria-label={`${progress.syllables} of 10 syllables used`}>{Array.from({length:10},(_,i)=><i className={i<progress.syllables?"used":""} key={i}/>)}</div></>:<p>The verified current line is unavailable. Dictionary matches below are suggestions only.</p>}
 <div className="letter-pool">{[...lettersOf(did)].map(l=><span className="has-letter" key={l}>{l.toUpperCase()}</span>)}</div>
 <label className="field-label">Find a word you can spell<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Starts with… e.g. li"/></label><Select value={syllables} onValueChange={setSyllables}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="any">Any fitting syllable count</SelectItem>{[1,2,3,4,5,6,7,8,9,10].map(n=><SelectItem key={n} value={String(n)}>{n} syllable{n===1?"":"s"}</SelectItem>)}</SelectContent></Select>
 <p className="fine-print">{lex?`${choices.length.toLocaleString()} dictionary matches · up to 24 shown`:"Checking the frozen dictionary…"}. Choose words that fit the team’s meaning, rhythm and ABAB CDCD EFEF GG rhyme. A dictionary match does not guarantee a good poem or referee acceptance.</p>
 <div className="word-choices">{suggested.map(([word,n])=><button key={word} onClick={()=>onChoose(word)}>{word}<small>{n}</small></button>)}</div>{error&&<p className="inline-warning">{error}</p>}
 {team?.acceptedTurns&&<details><summary>Your accepted contributions · {team.acceptedTurns.filter(t=>t.did===did).length}</summary><div className="word-choices">{team.acceptedTurns.filter(t=>t.did===did).map((t,i)=><a key={i} href={roomLink(t.receipt.room,t.receipt.seq)} target="_blank" rel="noreferrer">{t.word}<Check size={12}/></a>)}</div></details>}
 </section>;
}
export function VotingDesk({snapshot,did,person,data,busy,refresh,begin,connect,onOpen,signerReady=false,now}:{now:number;snapshot:Snapshot;did:string;person?:Writer;data:ActivityData;busy:boolean;refresh:()=>void;begin:Begin;connect:()=>void;onOpen:(id:string)=>void;signerReady?:boolean}){
 const [view,setView]=useState("read"),[search,setSearch]=useState(""),[visible,setVisible]=useState(12),[reading,setReading]=useState<string|null>(null);
 const order=useRef(new Map<string,number>());
 const completed=useMemo(()=>snapshot.teams.filter(finishedPoem),[snapshot.teams]);
 const entries=useMemo(()=>completed.filter(hasAcceptedSubmission),[completed]);
 const ordered=useMemo(()=>completed.map(t=>{if(!order.current.has(t.id))order.current.set(t.id,Math.random());return t;}).sort((a,b)=>order.current.get(a.id)!-order.current.get(b.id)!),[completed]);
 const submitted=useMemo(()=>ordered.filter(hasAcceptedSubmission),[ordered]);
 const ranked=useMemo(()=>[...submitted].sort((a,b)=>b.validVotes-a.validVotes),[submitted]);
 const {accepted:last,latest,pending}=ballotHistory(data.actions,did);
 const inFlight=data.pending.some(t=>t.type==='sonnet.register.v1');
 const state=voterState(did,person,data,inFlight,now),closed=votingWindow(now);
 const registration=data.actions.find(r=>packet(r.request).type==='sonnet.register.v1'&&r.status!=='accepted');
 const votingOpen=entries.filter(t=>tableVotingState(t,now).canVote).length;
 const displayed=(view==="finished"?ordered:view==="read"?(closed?submitted:submitted.filter(t=>tableVotingState(t,now).canVote)):ranked).filter(t=>(t.id+" "+t.entryId).toLowerCase().includes(search.toLowerCase()));
 const preview=completed.find(t=>t.id===reading)??null;
 const [reader,setReader]=useState<{id:string;poem:string|null;busy:boolean}>({id:"",poem:null,busy:false});
 const readGeneration=preview?.generation,readHash=preview?.poemHash,knownPoem=preview?.canonicalPoem;
 useEffect(()=>{
  if(!reading||knownPoem)return;
  const controller=new AbortController();
  setReader({id:reading,poem:null,busy:true});
  void fetch(apiUrl(`/api/table?team=${encodeURIComponent(reading)}`),{signal:controller.signal,cache:"no-store"}).then(async r=>{
   if(!r.ok)throw Error("Poem history unavailable");
   const data=await r.json() as {team?:Team};
   const t=data.team;
   if(!controller.signal.aborted)setReader({id:reading,poem:t?.id===reading&&t.generation===readGeneration&&finishedPoem(t)&&(!readHash||t.poemHash===readHash)?t.canonicalPoem:null,busy:false});
  }).catch(()=>{if(!controller.signal.aborted)setReader({id:reading,poem:null,busy:false});});
  return()=>controller.abort();
 },[reading,readGeneration,readHash,knownPoem]);
 const previewText=knownPoem||(reader.id===reading?reader.poem:null);
 const deliveryPending=data.pending.filter(t=>t.type==='sonnet.ballot.v1');
 function voteButton(t:Team){
  const voting=tableVotingState(t,now),chosen=!!last&&packet(last.request).entry_id===t.entryId;
  const waiting=pending.some(r=>packet(r.request).entry_id===t.entryId);
  return {disabled:state.kind==="excluded"||!voting.canVote||(chosen&&!pending.length)||waiting,
   label:!voting.canVote?voting.kind==="awaiting_submission"?"Awaiting submission":voting.label:state.kind==="excluded"?"Voters only":waiting?"Awaiting referee":chosen&&!pending.length?"Your accepted vote":`Vote for ${t.id}`};
 }
 return <section className="voting-desk compact-voting-desk">
  <header className="desk-heading"><div><span className="eyebrow">PUBLIC VOTING</span><h2>Choose a table to support.</h2><p>Which poem do you think FLOP’s human judges will find best? Open a poem to read it, or vote from its table card.</p></div><Trophy size={30}/></header>
  <Tabs value={view} onValueChange={v=>{setView(v);setVisible(12);}}>
   <div className="vote-table-picker">
    <label className="field-label">Find a table<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setVisible(12);}} placeholder="Type a table name…"/></label>
    <TabsList variant="line"><TabsTrigger value="read">{closed?"Submitted poems":"Open for voting"} · {closed?entries.length:votingOpen}</TabsTrigger><TabsTrigger value="finished">Completed poems · {completed.length}</TabsTrigger><TabsTrigger value="rank">Observed standings</TabsTrigger></TabsList>
   </div>
   <div className="inline-warning" role="status"><strong>{!snapshot.voteTally?.checkedAt?'Vote counts not verified':tallyStale(snapshot.voteTally,now)?'Vote update delayed':'Observed standings · incomplete history'}</strong><p>{snapshot.voteTally?.warning||'Checking signed referee receipts. An unavailable count is not zero.'}</p>{snapshot.voteTally?.checkedAt&&<p>{snapshot.voteTally.source==='stored'?'Latest saved receipt:':'Last successful vote check:'} {new Date(snapshot.voteTally.checkedAt).toLocaleString('en-GB',{timeZone:'UTC'})} UTC. {snapshot.voteTally.receiptCount} accepted requests reconciled.{snapshot.voteTally.unresolved>0?` ${snapshot.voteTally.unresolved} choices need further evidence.`:''}</p>}<a className="text-button" href={roomLink(ROOM.votes)} target="_blank" rel="noreferrer">Official ballots &amp; referee receipts <ArrowUpRight size={14}/></a></div>
   <p className="vote-list-note">{closed??"Voting closes 18 Sept, 12:00 UTC. Only accepted submissions can receive votes."}</p>
   {(pending.length>0||deliveryPending.length>0)&&<p className="inline-info">A ballot is awaiting a result. Check “Your identity, ballots & voting rules” below before retrying.</p>}
   {["read","finished","rank"].map(mode=><TabsContent key={mode} value={mode}>
    <div className={mode!=="rank"?"vote-entry-grid compact-vote-grid":"vote-ranking compact-vote-ranking"}>
     {displayed.slice(0,visible).map(t=>{
      const voting=tableVotingState(t,now),rank=1+entries.filter(e=>e.validVotes>t.validVotes).length,chosen=!!last&&packet(last.request).entry_id===t.entryId,button=voteButton(t);
      return <article className={`vote-entry compact-vote-entry ${chosen?"vote-chosen":""}`} key={t.id}>
       <header>{mode==="rank"&&<span className="vote-rank">{t.voteCountKnown?rank:"—"}</span>}<div><span className="eyebrow">POEM COMPLETED BY</span><h3><button className="poem-table-link" onClick={()=>setReading(t.id)}>{t.id}<ArrowUpRight size={15}/></button></h3><span className={`poem-voting-status status-${voting.kind}`}>{voting.label}</span>{chosen&&<span className="poem-chosen-label">Your accepted vote</span>}</div>
        {hasAcceptedSubmission(t)&&<strong className="vote-count">{displayedVotes(t)}<small>{voteCountCaption(t)}</small></strong>}
       </header>
       <div className="vote-entry-actions"><button className="button" onClick={()=>setReading(t.id)}>Read poem</button><button className="button primary" disabled={button.disabled} title={state.kind==="excluded"?state.text:undefined} onClick={()=>begin("vote",t)}>{button.label}</button></div>
      </article>;
     })}
    </div>
    {displayed.length>visible&&<button className="button" onClick={()=>setVisible(v=>v+12)}>Show more tables · {displayed.length-visible} remaining</button>}
    {!displayed.length&&<div className="empty-board"><Feather/><h3>{view==="finished"?"No completed poems match this search.":"No matching accepted submissions are available."}</h3><p>{view==="finished"?"Only referee-observed poem completion appears here. Filling a table does not complete a poem.":"Open Completed poems to see tables awaiting submission."}</p></div>}
   </TabsContent>)}
  </Tabs>
  <p className="fine-print">{view!=="rank"?"Tables appear in a shuffled order that stays stable while you browse.":"Standings use observed accepted ballots; tied counts share a rank."} Missing history can change these standings. Final eligibility and certified totals come from the referee.</p>
  <details className="compact-voter-info"><summary><KeyRound size={17}/> Your identity, ballots & voting rules{latest?.status==="rejected"?" · referee response":pending.length||deliveryPending.length?" · result pending":""}</summary>
   <ol className="vote-steps"><li><span>1</span><div><strong>Choose a table</strong><small>Read its poem when you want to.</small></div></li><li><span>2</span><div><strong>Verify role & sign</strong><small>Use your existing DID; voter registration must be accepted.</small></div></li><li><span>3</span><div><strong>See your receipt</strong><small>We track the referee’s response here.</small></div></li></ol>
   <VoterStatus did={did} person={person} check={data} inFlight={inFlight} signerReady={signerReady} busy={busy} refresh={refresh} connect={connect} register={()=>begin("register",null,{role:"voter"})}/>
   {registration&&state.kind!=="voter"&&state.kind!=="excluded"&&<ActionEvidence record={registration}/>}
   <div className="poem-voting-explainer"><strong>When a table opens for voting</strong><p>Finishing 14 lines completes the poem. Voting opens only after the final contributor publishes it and the referee accepts the submission with an entry ID. Final eligibility review can still be pending.</p></div>
   <VotingRules/>
   {pending.map(r=><ActionEvidence key={`${r.request.generation}:${r.request.seq}`} record={r}/>)}
   {deliveryPending.map(t=><p className="inline-info" key={t.requestId}>Checking ballot delivery. Read the <a href={roomLink(ROOM.votes)} target="_blank" rel="noreferrer">original voting record</a> before retrying. A different choice is a new ballot, ordered by referee intake.</p>)}
   {latest?.status==="rejected"&&<ActionEvidence record={latest}/>}
   {last&&<details className="vote-receipt"><summary><Check size={15}/> Last accepted ballot · {snapshot.teams.find(t=>t.entryId===packet(last.request).entry_id)?.id??packet(last.request).entry_id}</summary><ActionEvidence record={last}/><p>It counts only if your chosen entry and voter eligibility pass final review. An ineligible choice does not restore an older vote.</p></details>}
  </details>
  <a className="button" href={roomLink(ROOM.results)} target="_blank" rel="noreferrer">Official results<ArrowUpRight size={14}/></a>
  <Dialog open={!!preview} onOpenChange={open=>{if(!open)setReading(null);}}>
   <DialogContent className="app-dialog poem-reader">
    {preview&&<><DialogHeader><span className="eyebrow">POEM COMPLETED BY TABLE</span><DialogTitle>{preview.id}</DialogTitle><DialogDescription>{tableVotingState(preview,now).label}</DialogDescription></DialogHeader>
     <div className="poem-reader-body">
      {previewText?<p className="poem-reader-text">{previewText}</p>:<div className="poem-empty"><Feather size={28}/><h3>{reader.id===reading&&reader.busy?"Loading the completed poem…":"This table completed its poem."}</h3><p role="status">{reader.id===reading&&reader.busy?"Reading this table’s verified history.":"Its full text is still being recovered here. Read the original publication or open the table’s history below."}</p></div>}
      <p className="fine-print">{tableVotingState(preview,now).detail}</p>
      <div className="source-links">{preview.publicationUrls?.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer">{i===0?"Poem on X":`Thread · part ${i+1}`}<ArrowUpRight size={13}/></a>)}{(preview.submissionReceipt??preview.lastReceipt)&&<a href={roomLink((preview.submissionReceipt??preview.lastReceipt)!.room,(preview.submissionReceipt??preview.lastReceipt)!.seq)} target="_blank" rel="noreferrer">Referee receipt<ArrowUpRight size={13}/></a>}</div>
     </div>
     <div className="poem-reader-actions"><button className="button" onClick={()=>{setReading(null);onOpen(preview.id);}}>Table & sources</button><button className="button primary" disabled={voteButton(preview).disabled} title={state.kind==="excluded"?state.text:undefined} onClick={()=>{setReading(null);begin("vote",preview);}}>{voteButton(preview).label}</button></div>
    </>}
   </DialogContent>
  </Dialog>
 </section>;
}
