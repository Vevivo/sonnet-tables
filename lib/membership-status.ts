import {shortDid, type RosterMemberState, type Team, type Writer} from "./sonnet-types";

export function membershipState(team: Team, did: string): RosterMemberState {
  const observed = team.memberStates?.find(member => member.did === did);
  if (observed) return observed;
  return {did, status: team.confirmed ? "confirmed" : team.acceptedConsents.includes(did) ? "consent_accepted" : team.consents.includes(did) ? "referee_pending" : "signature_pending", signature: null, receipt: null};
}

export const membershipLabels: Record<RosterMemberState["status"], {short: string; label: string; waiting: string}> = {
  confirmed: {short: "In team", label: "Confirmed team member", waiting: "All matching consents accepted; the referee confirmed this roster."},
  consent_accepted: {short: "Accepted", label: "Your consent is accepted", waiting: "Other members or the final roster-ready receipt are still pending."},
  signature_pending: {short: "Sign needed", label: "Writer's signature not observed", waiting: "This writer must sign the exact roster. The host cannot sign for them."},
  referee_pending: {short: "Referee", label: "Signature sent · receipt not verified", waiting: "The signature is observed; a matching referee acceptance is still unverified."},
  rejected: {short: "Review", label: "Consent rejected", waiting: "Review the referee's reason before submitting a corrected consent."},
  withdrawn: {short: "Withdrew", label: "Consent withdrawn", waiting: "This writer's previous consent no longer establishes membership."},
  withdrawal_pending: {short: "Withdrawing", label: "Withdrawal sent · receipt pending", waiting: "Wait for the referee to resolve the withdrawal before signing another roster."},
  other_roster: {short: "Other roster", label: "Consent belongs to another roster", waiting: "Reconcile the other accepted roster before treating this seat as confirmed."},
};

export function tableWaiting(team: Team, writers: Writer[]) {
  if (team.status === "submitted") return "Submission accepted · view the finished poem";
  if (team.status === "completed") return "Poem complete · publication / submission pending";
  if (team.confirmed) return team.frozen ? "Confirmed team · roster locked" : "Confirmed team · ready for the first word";
  if (!team.members.length) return team.closed ? "Recruitment closed" : "Host and writers are agreeing the roster";
  const states = team.members.map(did => membershipState(team, did));
  const name = (did: string) => writers.find(writer => writer.did === did)?.name || shortDid(did);
  const pending = states.filter(member => member.status === "signature_pending");
  if (pending.length) return `Needs signature: ${pending.slice(0, 2).map(member => name(member.did)).join(", ")}${pending.length > 2 ? ` +${pending.length - 2}` : ""}`;
  const review = states.find(member => ["rejected", "withdrawn", "withdrawal_pending", "other_roster"].includes(member.status));
  if (review) return `${name(review.did)}: ${membershipLabels[review.status].label.toLowerCase()}`;
  const unreceipted = states.filter(member => member.status === "referee_pending");
  if (unreceipted.length) return `${unreceipted.length} signature${unreceipted.length === 1 ? "" : "s"} awaiting referee receipts`;
  return "Consents accepted · final roster confirmation not verified";
}
