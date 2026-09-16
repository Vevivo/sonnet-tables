import type {Team} from "./sonnet-types";
/** Completion comes only from the verified projection, never a chat claim. */
export function tableLifecycle(t: Team) {
 return t.status === "submitted" ? "submitted" : t.status === "completed" ? "completed" : t.frozen ? "writing" : t.closed ? "closed" : "open";
}
export function seatsClosed(t: Team) { return tableLifecycle(t) !== "open"; }
export function tableStatusLabel(t: Team) {
 const state=tableLifecycle(t);
 return state==="submitted"?"Submission accepted":state==="completed"?"Poem complete":state==="writing"?"Roster locked · writing":state==="closed"?"Recruitment closed":t.confirmed?"Roster ready":t.setupReceipt?"Room ready · forming":"Finding writers";
}
