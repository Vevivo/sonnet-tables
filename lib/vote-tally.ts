import type {Snapshot,Team} from './sonnet-types';
export type VoteTally={source?:'stored'|'live';counts:Record<string,number>;checkedAt:string|null;status:'ready'|'refreshing'|'unavailable';coverage:'partial';receiptCount:number;unresolved:number;warning:string};
export const emptyVoteTally:VoteTally={counts:{},checkedAt:null,status:'unavailable',coverage:'partial',receiptCount:0,unresolved:0,warning:'Vote records have not been checked yet.'};
export function tallyStale(tally:VoteTally|undefined,now=Date.now()){
 const at=Date.parse(tally?.checkedAt??'');
 return !tally||tally.status!=='ready'||!Number.isFinite(at)||at>now||now-at>120000;
}
export function withVoteTally(snapshot:Snapshot,tally?:VoteTally):Snapshot{
 let use=snapshot.voteTally;
 if(tally){
  if(!tally.checkedAt&&use?.checkedAt)use={...use,status:tally.status,warning:tally.warning};
  else if(!use?.checkedAt||tally.checkedAt&&Date.parse(tally.checkedAt)>=Date.parse(use.checkedAt))use=tally;
 }
 return {...snapshot,voteTally:use,teams:snapshot.teams.map(t=>({...t,
  validVotes:use?.checkedAt&&t.entryId?use.counts[t.entryId]??0:0,
  voteCountKnown:!!use?.checkedAt,voteCountStale:tallyStale(use),
 }))};
}
export function displayedVotes(team:Team){return team.voteCountKnown?String(team.validVotes):'—';}

export function voteCountCaption(team:Team){return !team.voteCountKnown?"Count not verified":team.voteCountStale?"saved observed choices":"observed choices";}
