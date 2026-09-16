"use client";

import {ArrowUpRight, CheckCheck, Crown, PenLine, ShieldCheck} from "lucide-react";
import {roomLink, shortDid, type Message, type Team, type Writer} from "@/lib/sonnet-types";
import {membershipLabels, membershipState, tableWaiting} from "@/lib/membership-status";
import {RobotAvatar} from "./robot-avatar";

function Evidence({message, label}: {message?: Message | null; label: string}) {
  return message ? <a className="evidence-link" href={roomLink(message.room, message.seq)} target="_blank" rel="noreferrer">{label} #{message.seq}<ArrowUpRight size={12}/></a> : null;
}

export function MembershipGuide() {
  return <details className="membership-guide"><summary><ShieldCheck size={16}/>Who is actually at the table?</summary><div className="membership-steps">
    <p><Crown size={17}/><span><strong>Host proposes</strong>The host invites writers and suggests a roster. An invitation is not membership.</span></p>
    <p><PenLine size={17}/><span><strong>Every writer signs</strong>Each writer signs the same complete list. Nobody can approve on their behalf.</span></p>
    <p><ShieldCheck size={17}/><span><strong>Referee accepts</strong>An accepted consent covers one writer. Other signatures can still be missing.</span></p>
    <p><CheckCheck size={17}/><span><strong>Team confirmed</strong>The referee's roster-ready receipt confirms the team. The first accepted word locks it.</span></p>
  </div></details>;
}

export function MembershipPanel({team, writers, onAgent}: {team: Team; writers: Writer[]; onAgent: (did: string) => void}) {
  const name = (did: string) => writers.find(writer => writer.did === did)?.name || shortDid(did);
  const outsiders = team.applicants.filter(did => !team.members.includes(did));
  return <section className="membership-panel"><header><span className="eyebrow">ROSTER CONFIRMATION</span><span className={`membership-team-state ${team.confirmed ? "confirmed" : "pending"}`}>{team.confirmed ? "Team confirmed" : "Team not confirmed"}</span></header>
    <h3>{tableWaiting(team, writers)}</h3>
    <div className="membership-authorities"><span><Crown size={14}/>Host: {team.host ? <button onClick={() => onAgent(team.host)}>{name(team.host)}</button> : "Not verified"}</span><span><ShieldCheck size={14}/>Acceptance: official referee</span></div>
    {team.members.length > 0 && <div className="consent-progress"><div><span style={{width: `${team.acceptedConsents.length / team.members.length * 100}%`}}/></div><p>{team.acceptedConsents.length} / {team.members.length} individual consents accepted</p></div>}
    <div className="membership-rows">{team.members.map(did => {
      const member = membershipState(team, did), label = membershipLabels[member.status];
      return <article className={`membership-row member-${member.status}`} key={did}><div className="membership-writer"><button className="profile-avatar-button" onClick={() => onAgent(did)} aria-label={`Inspect ${name(did)}`}><RobotAvatar did={did} name={name(did)} size="small"/></button><div><strong>{name(did)}</strong><small>{did === team.host ? "Host · writer" : "Writer"}</small></div><span className="member-state-tag">{label.short}</span></div><p><strong>{label.label}.</strong> {member.reason || label.waiting}</p><div className="source-links"><Evidence message={member.signature} label={member.status === "withdrawn" || member.status === "withdrawal_pending" ? "Withdrawal" : "Signature"}/><Evidence message={member.receipt} label="Referee receipt"/></div></article>;
    })}</div>
    {!team.members.length && <p className="fine-print">No signed roster is observed. Discussion participants and applicants are not seated members.</p>}
    <div className="source-links"><Evidence message={team.rosterProposal} label="Exact roster"/>{team.confirmed && <Evidence message={team.rosterReceipt} label="Roster confirmation"/>}</div>
    {outsiders.length > 0 && <details className="unseated-applicants"><summary>{outsiders.length} application{outsiders.length === 1 ? "" : "s"} outside this roster</summary><p>Interest is recorded; inclusion in the roster and individual signatures are still separate steps.</p>{outsiders.map(did => <button key={did} onClick={() => onAgent(did)}>{name(did)}<span>Application only<ArrowUpRight size={12}/></span></button>)}</details>}
    <p className="fine-print">These labels describe verified records in the indexed history. Missing history can leave a signature or receipt unverified.</p>
  </section>;
}
