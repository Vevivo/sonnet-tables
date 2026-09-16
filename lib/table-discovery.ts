import {CONTEST,REFEREE,ROOM,type Message,type Team} from "./sonnet-types";
import {seatsClosed} from "./table-lifecycle";
import {hasAcceptedSubmission,tableVotingState} from "./voting";

export const NEW_ROOM_WINDOW = 24 * 60 * 60 * 1000;
export const finishedPoem = (t: Team) => t.status === "completed" || t.status === "submitted";
export function openedAt(t: Team) { return Date.parse(t.setupReceipt?.ts ?? ""); }
export function matchesTableFilter(t: Team, filter: string, now: number) {
 switch (filter) {
  case "all": return true;
  case "recruiting": return t.availableRequest && !seatsClosed(t) && t.members.length < 8;
  case "full": return !finishedPoem(t) && (t.members.length >= 8 || t.confirmed || t.frozen);
  case "new": { const opened=openedAt(t); return Number.isFinite(opened) && opened<=now && now-opened<NEW_ROOM_WINDOW; }
  case "forming": return t.status==="forming" && !t.closed;
  case "ready": return t.confirmed && !seatsClosed(t);
  case "signed": return t.consents.length>0 && !finishedPoem(t);
  case "writing": return t.frozen && !finishedPoem(t);
  case "completed": return finishedPoem(t);
  case "submitted": return hasAcceptedSubmission(t);
  case "voting": return tableVotingState(t,now).canVote;
  case "awaiting-submission": return t.status==="completed";
  default: return false;
 }
}

function body(m:Message|null|undefined):Record<string,any> { try { return m?.payload??JSON.parse(m?.text??"{}"); } catch { return {}; } }
function refereeReceipt(m:Message|null|undefined,room:string) { const p=body(m);return !!m?.signatureValid&&m.from===REFEREE&&m.room===room&&p.contest_id===CONTEST&&p.type==="sonnet.receipt.v1"&&p.status==="accepted"; }
/** An accepted submission proves completion even when individual turn history is incomplete. */
export function verifiedPoemMembers(team:Team) {
 const roster=body(team.rosterProposal),receipt=body(team.rosterReceipt);
 const matchedRoster=refereeReceipt(team.rosterReceipt,ROOM.discovery)&&receipt.roster_ready===true&&team.rosterProposal?.signatureValid&&roster.type==="sonnet.roster.v1"&&roster.contest_id===CONTEST&&roster.game_id===team.id&&(roster.poem_room===team.room||roster.poem_room===undefined)&&roster.room_generation===team.generation&&receipt.request_id===roster.request_id&&receipt.sender_did===team.rosterProposal.from&&Array.isArray(roster.members)&&roster.members.length>=4&&roster.members.length<=8&&new Set(roster.members).size===roster.members.length&&roster.members.includes(team.rosterProposal.from);
 if(!matchedRoster||team.generation===null)return [] as string[];
 const submitted=body(team.lastReceipt);
 if(team.status==="submitted"&&team.entryId&&refereeReceipt(team.lastReceipt,ROOM.submissions)&&submitted.entry_id===team.entryId&&roster.members.includes(submitted.sender_did))return roster.members as string[];
 return [] as string[];
}
/** One star per accepted submission/room generation. A finished draft or full roster earns none. */
export function writerAchievements(teams: Team[]) {
 const credits=new Map<string,Map<string,Team>>();
 for(const team of teams) {
  const id=`${team.room}:${team.generation}`;
  for(const did of verifiedPoemMembers(team)) {
   if(!credits.has(did))credits.set(did,new Map());
   const previous=credits.get(did)!.get(id);
   if(!previous||team.status==="submitted")credits.get(did)!.set(id,team);
  }
 }
 return new Map([...credits].map(([did,rooms])=>[did,[...rooms.values()]]));
}
