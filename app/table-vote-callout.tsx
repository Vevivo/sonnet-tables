"use client";
import {displayedVotes,voteCountCaption} from "@/lib/vote-tally";
import {Vote} from "lucide-react";
import type {Team} from "@/lib/sonnet-types";
import {hasAcceptedSubmission,tableVotingState} from "@/lib/voting";

export function TableVoteCallout({team,now,onVote}:{team:Team;now:number;onVote:()=>void}){
 const state=tableVotingState(team,now);
 return <section className={`table-vote-callout voting-${state.kind}`} aria-label={`Voting for ${team.id}`}>
  <div className="table-vote-heading"><Vote size={23}/><div><strong>{state.label}</strong><p>{state.detail}</p></div></div>
  {hasAcceptedSubmission(team)&&<p className="table-vote-total">{displayedVotes(team)} {voteCountCaption(team)} · completed by <strong>{team.id}</strong></p>}
  <button className="button primary full table-vote-button" disabled={!state.canVote} onClick={onVote}><Vote size={19}/><span>{state.canVote?<>Vote for <strong>{team.id}</strong></>:state.kind==="closed"?"Voting closed":state.kind==="scheduled"?"Voting has not opened":"Voting not available yet"}</span></button>
  {state.canVote&&<small>Your table stays selected. Connect your identity, confirm voter registration, then review and sign your vote here.</small>}
 </section>;
}
