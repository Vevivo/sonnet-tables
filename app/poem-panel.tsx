"use client";
import {ArrowUpRight,Copy,Feather,RefreshCw,ShieldCheck} from "lucide-react";
import {poemDisplay} from "@/lib/poem-display";
import {roomLink,shortDid,type Team,type Writer} from "@/lib/sonnet-types";
import {PoemWorkshop} from "./live-tools";
import {WordAssistant} from "./participation-desk";
import type {ActionKind} from "@/lib/participation";
import {tableVotingState} from "@/lib/voting";

export function PoemPanel({team,did,writers,busy,refresh,begin,copy,now}:{team:Team;did:string;writers:Writer[];busy:boolean;refresh:()=>void;begin:(kind:ActionKind,team:Team,preset?:Record<string,string>)=>void;copy:(text:string)=>void;now:number}){
 const state=poemDisplay(team),receipt=team.submissionReceipt??team.lastReceipt,voting=tableVotingState(team,now);
 return <>
  {state.finished&&<div className="poem-verification"><ShieldCheck size={20}/><div><strong>{team.status==="submitted"?"Submission accepted · 14/14 lines":"Poem complete · 14/14 lines"}</strong><p>{state.textReady?"Read the accepted poem below.":"Completion is recorded. The full text is still being recovered here."}</p></div></div>}
  <div className="poem-paper"><div className="eyebrow">{state.finished?"COMPLETED BY TABLE":"A POEM BY TABLE"}</div><h3 className="poem-table-name">{team.id}</h3><div className="eyebrow">FOURTEEN LINES · ONE WORD PER TURN</div>
   {(!state.finished||state.textReady)&&team.lines.length?team.lines.map((line,i)=><p key={i}><span>{String(i+1).padStart(2,"0")}</span>{line}</p>):<div className="poem-empty"><Feather size={28}/><h3>{state.title}</h3><p>{state.description}</p></div>}
  </div>
  {state.recovering&&<div className="poem-recovery"><button className="button" disabled={busy} onClick={refresh}><RefreshCw size={15} className={busy?"spin":""}/>{busy?"Checking poem history…":"Refresh poem history"}</button><a className="button" href={roomLink(team.room)} target="_blank" rel="noreferrer">Read the official room<ArrowUpRight size={14}/></a></div>}
  {state.finished&&<div className="poem-sources"><strong>Original poem & submission</strong><div className="source-links">{receipt&&<a className="evidence-link" href={roomLink(receipt.room,receipt.seq)} target="_blank" rel="noreferrer">{team.status==="submitted"?"Submission receipt":"Completion receipt"}<ArrowUpRight size={13}/></a>}{team.publicationUrls?.map((url,i)=><a key={url} className="evidence-link" href={url} target="_blank" rel="noreferrer">{i===0?"Read the poem on X":`Thread · part ${i+1}`}<ArrowUpRight size={13}/></a>)}</div><p className="fine-print">{team.status==="submitted"?"These are the publication links in the accepted submission. Final eligibility review and judging are separate.":"Publication on X and an accepted submission are still required."}</p></div>}
  {team.canonicalPoem&&<div className="inline-info"><strong>Text reconstructed from verified accepted turns</strong><p>Final contributor: {writers.find(w=>w.did===team.lastWriter)?.name??shortDid(team.lastWriter??"")}</p><button className="text-button" onClick={()=>copy(team.canonicalPoem!)}>Copy exact poem<Copy size={13}/></button><details><summary>Poem SHA-256</summary><code className="hash-value">{team.poemHash}</code></details></div>}
  {!state.finished&&<><WordAssistant team={team} did={did} onChoose={word=>begin("word",team,{word})}/><PoemWorkshop key={team.id} team={team} writers={writers}/></>}
  <div className="detail-actions">{team.status==="submitted"?<button className="button primary" disabled={!voting.canVote} onClick={()=>begin("vote",team)}>{voting.canVote?`Vote for ${team.id}`:voting.label}</button>:team.status==="completed"?<button className="button primary" onClick={()=>begin("submit",team)}>Publication & submission</button>:<button className="button primary" onClick={()=>begin("word",team)}>Check & propose a word</button>}</div>
 </>;
}
