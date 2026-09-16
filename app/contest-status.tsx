"use client";
import {ArrowUpRight} from 'lucide-react';
import {contestPhase,recentCheck} from '@/lib/contest-evidence';
import {ROOM,RULES,roomLink,type Snapshot} from '@/lib/sonnet-types';
import {useContestTime} from './use-contest-time';

const time=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC';
export function ContestStatus({snapshot}:{snapshot:Snapshot}){
 const now=useContestTime(),evidence=snapshot.contestEvidence,report=evidence?.statusReport,phase=contestPhase(evidence,now);
 const labels={unknown:'Checking contest schedule',upcoming:'Contest has not opened',open:'Writing, submissions & voting open',closed:'Intake deadline passed'};
 return <section className="contest-status" aria-label="Official contest status">
  <div className="contest-status-heading"><strong>{labels[phase]}</strong><a href={RULES} target="_blank" rel="noreferrer">Frozen rulebook <ArrowUpRight size={13}/></a></div>
  {evidence&&<p>Deadline: <time dateTime={evidence.deadline}>{time(evidence.deadline)}</time>. {phase==='closed'?'Check the official results for shortlist and judging decisions.':'Standings remain provisional until official review.'} <a href={roomLink(ROOM.results)} target="_blank" rel="noreferrer">Official results ↗</a></p>}
  {report?<><dl className="referee-counts">{[['Teams',report.teams],['Writers',report.participants.writer],['Voters',report.participants.voter],['Organizers',report.participants.organizer]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl><p>Latest observed referee report · <time dateTime={report.source.ts}>{time(report.source.ts)}</time> · <a href={roomLink(report.source.room,report.source.seq)} target="_blank" rel="noreferrer">Signed notice #{report.source.seq} ↗</a></p><p className="contest-status-note">These are the referee’s reported totals at that notice. The table list and vote counts below reflect the records this site has observed.</p></>:<p>No verified referee status report is available in this index yet. Totals will appear after a successful room sync.</p>}
  <details><summary>Data coverage · {snapshot.connected&&recentCheck(snapshot.updatedAt,now)?'recent room sync':'saved index'}</summary><p>Last index refresh: {snapshot.updatedAt?time(snapshot.updatedAt):'pending'}. Rooms are checked in rotation; a refresh does not make every table current. Available history can be incomplete. Observed votes do not establish a finalist or winner.</p><div className="room-coverage">{snapshot.roomStats.map(s=><div key={s.room}><a href={roomLink(s.room)} target="_blank" rel="noreferrer">{s.room}</a><span>{s.checkSucceeded===false?'Refresh failed · ':''}{s.checkedAt?time(s.checkedAt):'Not checked'}</span><small>{s.historyPending?'History recovery pending':s.gap?'Earlier history incomplete':s.gap===false?'No history gap detected':'History completeness unverified'} · generation {s.generation} · last sequence {s.last}</small></div>)}</div></details>
 </section>;
}
