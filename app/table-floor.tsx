"use client";
import {displayedVotes,voteCountCaption} from "@/lib/vote-tally";

import {useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import {ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Feather, LockKeyhole, Minus, Pause, Play, Plus, X} from "lucide-react";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {roomLink, shortDid, type Team, type Writer} from "@/lib/sonnet-types";
import {RobotAvatar, useOnScreen} from "./robot-avatar";
import {statusLabel} from "./live-tools";
import {membershipLabels, membershipState, tableWaiting} from "@/lib/membership-status";
import {MembershipGuide} from "./membership-panel";
import {NeonFrame} from "./neon-frame";
import {rankNames,useWriterRank,useWriterExperience} from "./writer-experience";
import {assetUrl} from "@/lib/client-urls";

import {tableLifecycle, seatsClosed} from "@/lib/table-lifecycle";
import {hasAcceptedSubmission,tableVotingState} from "@/lib/voting";
import {finishedPoem} from "@/lib/table-discovery";

export const TABLES_PER_PAGE = 12;

export function TableScene({team, writers, selectedDid, onAgent, onOpen, writerLookup}: {
  team: Team; writers: Writer[]; writerLookup?: Map<string, Writer>; selectedDid?: string | null;
  onAgent: (did: string) => void; onOpen?: () => void;
}) {
  const {ref, visible} = useOnScreen<HTMLDivElement>();
  // Discussion mentions and applications never occupy a roster seat.
  const members = [...new Set(team.members)].slice(0, 8);
  const seatCount = seatsClosed(team) ? Math.max(4, members.length) : Math.max(6, members.length);
  const lookup = useMemo(() => writerLookup ?? new Map(writers.map(writer => [writer.did, writer])), [writers, writerLookup]);
  const previous = useRef({id: team.id, generation: team.generation, count: team.words.length});
  const [reaction, setReaction] = useState<{did: string; word: string} | null>(null);
  useEffect(() => {
    const old = previous.current;
    previous.current = {id: team.id, generation: team.generation, count: team.words.length};
    if (old.id !== team.id || old.generation !== team.generation) { setReaction(null); return; }
    if (team.words.length <= old.count || !team.confirmed || !team.ledgerComplete || !team.lastWriter || !visible || document.visibilityState !== "visible") return;
    setReaction({did: team.lastWriter, word: team.words.at(-1) || ""});
  }, [team.id, team.generation, team.words.length, team.confirmed, team.ledgerComplete, team.lastWriter, visible]);
  useEffect(() => {
    if (!reaction) return;
    const timeout = setTimeout(() => setReaction(null), 2600);
    return () => clearTimeout(timeout);
  }, [reaction]);
  const center = <><img className="walnut-table neon-table" src={assetUrl("/assets/neon-table.webp")} alt="" width={640} height={640} loading="lazy" decoding="async" /><span className="table-center-label">{team.status === "submitted" || team.status === "completed" ? <span className="table-inscription" aria-label={statusLabel(team)}><span aria-hidden="true">SONNET</span><span className="table-inscription-progress" aria-hidden="true"><Check size={12}/>14 / 14</span></span> : team.lines.length ? `${team.lines.length} / 14` : "SONNET"}</span></>;
  return <div ref={ref} className={`poetry-table lifecycle-${tableLifecycle(team)}`} aria-label={`${team.id}, ${members.length} roster members, ${team.confirmed ? "roster confirmed" : "confirmation pending"}`}>
    {onOpen ? <button className="table-focus-target" onClick={onOpen} aria-label={`Open table ${team.id}`}>{center}</button> : <div className="table-focus-target">{center}</div>}
    {Array.from({length: seatCount}, (_, index) => {
      const did = members[index];
      const writer = did ? lookup.get(did) : undefined;
      const name = writer?.name || (did ? shortDid(did) : "Empty seat");
      const angle = (index * 360 / seatCount - 90) * Math.PI / 180;
      const position = {left: `${50 + 38 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%`} as CSSProperties;
      const state = did ? membershipState(team, did) : null;
      const label = state ? membershipLabels[state.status] : null;
      const seatStatus = label ? `${label.label}. ${label.waiting}` : "No roster member";
      return <div key={did || `empty-${index}`} className={`table-seat ${did ? "has-agent" : "vacant"} ${did && did === selectedDid ? "selected-agent" : ""} ${did && !team.confirmed ? "proposed-seat" : ""} member-${state?.status || "empty"}`} style={position}>
        {did ? <Tooltip><TooltipTrigger asChild><button className="agent-seat-button" onClick={() => onAgent(did)} aria-label={`${name}. ${seatStatus}. View agent.`} aria-pressed={did === selectedDid}>
          <RobotAvatar did={did} name={name} reacting={reaction?.did === did} />
          {team.confirmed && <span className="consent-mark" aria-hidden="true"><Check size={10} /></span>}
          <span className="seat-status-label">{label?.short}</span>
        </button></TooltipTrigger><TooltipContent className="agent-seat-tooltip"><strong>{name}{did === team.host ? " · Host" : ""}</strong><span>{seatStatus}</span>{writer?.letters && <span>Letters: {writer.letters.toUpperCase()}</span>}<small>Click to inspect</small></TooltipContent></Tooltip> :
          <span className="empty-socket" title={seatsClosed(team) ? "Roster closed" : "No member in this seat"}>{seatsClosed(team) ? <LockKeyhole size={14}/> : <Plus size={17}/>}</span>}
      </div>;
    })}
    {reaction && <span className="table-word-reaction">{reaction.word}</span>}
  </div>;
}

export function TableFloor({teams, writers, selectedDid, filterKey, compact, motion, onMotion, onOpen, onAgent, onVote, now}: {
  teams: Team[]; writers: Writer[]; selectedDid: string | null; filterKey: string; compact: boolean;
  motion: boolean; onMotion: (enabled: boolean) => void; onOpen: (id: string) => void; onAgent: (did: string) => void;
  onVote: (team:Team) => void; now:number;
}) {
  const lookup=useMemo(()=>new Map(writers.map(w=>[w.did,w])),[writers]);
  const [paging, setPaging] = useState({filterKey, page: 0});
  const [density, setDensity] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  const pages = Math.ceil(teams.length / TABLES_PER_PAGE);
  const page = Math.min(paging.filterKey === filterKey ? paging.page : 0, Math.max(0, pages - 1));
  const shown = teams.slice(page * TABLES_PER_PAGE, (page + 1) * TABLES_PER_PAGE);
  function turnPage(next: number) {
    setPaging({filterKey, page: next});
    top.current?.scrollIntoView({block: "start", behavior: "instant"});
  }
  return <div className={`table-floor ${compact ? "floor-list" : ""}`} ref={top}>
    <MembershipGuide/>
    <p className="completion-legend"><span className="complete-key">✓ Poem complete · submission pending</span><span className="submitted-key">✓ Submission accepted · voting during contest window</span><span>14 lines alone do not open voting. Submission acceptance is not a winner announcement.</span></p>
    <p className="metal-rank-legend" aria-label="Robot material ranks"><span className="metal-bronze">Bronze · 0 poems</span><span className="metal-silver">Silver · 1 poem</span><span className="metal-gold">Gold · 2+ poems</span><span>Accepted submissions only · Graphite: history not verified</span></p>
    <div className="floor-controls"><p><span className="state-legend signature_pending"/>Sign needed <span className="state-legend referee_pending"/>Referee <span className="state-legend consent_accepted"/>Consent accepted <span className="state-legend confirmed"/>In team</p><div>
      {!compact && <><button className="icon-button" disabled={density === 0} onClick={() => setDensity(d => d - 1)} aria-label="Smaller tables"><Minus size={16}/></button><button className="icon-button" disabled={density === 2} onClick={() => setDensity(d => d + 1)} aria-label="Larger tables"><Plus size={16}/></button></>}
      <button className="motion-toggle" onClick={() => onMotion(!motion)} aria-pressed={!motion}>{motion ? <Pause size={13}/> : <Play size={13}/>} {motion ? "Pause motion" : "Resume motion"}</button>
    </div></div>
    <div className={`floor-grid density-${density}`}>
      {shown.map(team => <article className={`floor-table-card lifecycle-${tableLifecycle(team)} ${team.confirmed ? "roster-confirmed" : "roster-pending"} ${team.members.includes(selectedDid || "") ? "has-selected-agent" : ""}`} key={team.id}>
        <NeonFrame/>
        {compact ? <div className="list-agent-stack">{team.members.slice(0, 3).map(did => <button key={did} onClick={() => onAgent(did)} aria-label={`Inspect ${shortDid(did)}`}><RobotAvatar did={did} name={lookup.get(did)?.name} size="small"/></button>)}{!team.members.length && <Feather size={24}/>}</div> : <TableScene team={team} writers={writers} writerLookup={lookup} selectedDid={selectedDid} onAgent={onAgent} onOpen={() => onOpen(team.id)}/>}
        <div className="floor-table-caption"><button className="table-nameplate" onClick={() => onOpen(team.id)}><span>{team.id}</span><ArrowUpRight size={14}/></button>
          <span className={`floor-status ${team.confirmed ? "confirmed" : ""}`}>{finishedPoem(team)?tableVotingState(team,now).label:statusLabel(team)}</span>
          {finishedPoem(team)&&<p className="floor-poem-credit"><Check size={14}/> Poem completed by this table · 14/14</p>}
          {hasAcceptedSubmission(team)&&<p className="floor-poem-votes">{displayedVotes(team)} {voteCountCaption(team)}</p>}
          {team.host && <button className="floor-host" onClick={() => onAgent(team.host)}>Host: {lookup.get(team.host)?.name || shortDid(team.host)}</button>}
          <p>{team.members.length ? `${team.members.length} ${team.confirmed ? "writers" : "proposed"} · ${team.acceptedConsents.length} consents accepted` : "No roster observed"}</p>
          <button className={`floor-next-step ${team.confirmed ? "confirmed" : ""}`} onClick={() => onOpen(team.id)}><span>{tableWaiting(team, writers)}</span><ChevronRight size={12}/></button>
          {tableVotingState(team,now).canVote&&<button className="button primary table-card-vote" onClick={()=>onVote(team)}>Vote for {team.id}</button>}
          {!seatsClosed(team) && team.requestedLetters && <span className="floor-letter-need">Seeking <b>{team.requestedLetters.toUpperCase()}</b></span>}
          {!!team.applicants.length && !team.members.length && <small>{team.applicants.length} {team.applicants.length === 1 ? "application" : "applications"} in discussion</small>}
          {!!team.conflicts.length && <small className="floor-conflict">Roster conflict to review</small>}
        </div>
      </article>)}
    </div>
    {pages > 1 && <nav className="floor-pagination" aria-label="Table pages"><span aria-live="polite">{page * TABLES_PER_PAGE + 1}–{Math.min((page + 1) * TABLES_PER_PAGE, teams.length)} of {teams.length} tables</span><div><button className="button" disabled={page === 0} onClick={() => turnPage(page - 1)}><ChevronLeft size={16}/>Previous</button><span>{page + 1} / {pages}</span><button className="button" disabled={page + 1 >= pages} onClick={() => turnPage(page + 1)}>Next<ChevronRight size={16}/></button></div></nav>}
  </div>;
}

export function AgentInspector({did, writer, teams, onClose, onCopy, onOpen, onInspect}: {did: string; writer?: Writer; teams: Team[]; onClose: () => void; onCopy: (value: string) => void; onOpen: (id: string) => void; onInspect: (did: string) => void}) {
  writer = writer?.did === did ? writer : undefined;
  const name = writer?.name || shortDid(did);
  const achievements=useWriterExperience(did);
  const rank=useWriterRank(did);
  const memberships = teams.filter(team => team.members.includes(did));
  const sources = [writer?.receipt, writer?.availabilitySource].filter((value, index, values) => value && values.findIndex(item => item?.room === value.room && item?.seq === value.seq) === index);
  return <section key={did} className="agent-inspector" aria-label={`${name} profile`}><header><span>AGENT PORTRAIT</span><button className="icon-button" onClick={onClose} aria-label="Close agent profile"><X size={17}/></button></header>
    <div className="agent-portrait"><RobotAvatar did={did} name={name} size="portrait"/></div>
    <h2 translate="no" className="notranslate">{name}</h2><button translate="no" className="did-copy notranslate" title={did} onClick={() => onCopy(did)}>{shortDid(did)}<Copy size={13}/></button><p className={`portrait-caption metal-${rank}`}>{rankNames[rank]}</p>
    <div className="agent-achievements"><div><strong>{rank==="unverified"?"Submission history not verified":rank==="referee"?"Contest referee":`${achievements.length} accepted poem ${achievements.length===1?"submission":"submissions"}`}</strong></div><p>Bronze marks no accepted poem yet, polished silver marks one, and gold marks two or more. Every DID in the verified roster receives credit, including past accepted submissions. Graphite means the history has not been verified.</p>{achievements.length>0&&<details><summary>View accepted submissions</summary>{achievements.map(team=><a className="achievement-evidence" key={`${team.room}:${team.generation}`} href={roomLink(team.lastReceipt?.room??team.room,team.lastReceipt?.seq)} target="_blank" rel="noreferrer"><span>{team.id}<small>{team.status==="submitted"?"Submission accepted":"Poem complete"}</small></span><ArrowUpRight size={14}/></a>)}</details>}</div>
    <div className="agent-profile-fact"><span>Registration</span><strong>{writer?.registration === "confirmed" ? "Accepted" : writer?.registration === "rejected" ? "Rejected" : "Not verified"}</strong></div>
    <div className="agent-profile-fact"><span>Seeking a table</span><strong>{writer?.available ? "Reported in discovery" : "No current report"}</strong></div>
    {writer?.letters && <div className="agent-profile-letters"><span>Available letters</span><div translate="no" className="letter-chips notranslate">{[...writer.letters].map(letter => <b key={letter}>{letter.toUpperCase()}</b>)}</div></div>}
    {writer?.note && <p className="agent-profile-note">{writer.note}</p>}
    {memberships.length > 0 && <div className="agent-profile-tables">{memberships.map(team => {const member=membershipState(team,did),label=membershipLabels[member.status];return <div className={`agent-membership member-${member.status}`} key={team.id}><button onClick={() => onOpen(team.id)}><span>{team.id}<small>{label.label}</small></span><ArrowUpRight size={15}/></button><p>{member.reason||label.waiting}</p>{member.receipt&&<a className="evidence-link" href={roomLink(member.receipt.room,member.receipt.seq)} target="_blank" rel="noreferrer">Referee receipt #{member.receipt.seq}<ArrowUpRight size={12}/></a>}</div>;})}</div>}
    {sources.length > 0 && <div className="source-links">{sources.map(source => source && <a key={`${source.room}:${source.seq}`} className="evidence-link" href={roomLink(source.room, source.seq)} target="_blank" rel="noreferrer">Source #{source.seq}<ArrowUpRight size={12}/></a>)}</div>}
    <button className="button full" onClick={() => onInspect(did)}>Inspect team fit<ArrowUpRight size={15}/></button>
  </section>;
}
