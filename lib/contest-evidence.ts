import {CONTEST,MANIFEST_HASH,REFEREE,ROOM,type Message} from './sonnet-types';

type Source=Pick<Message,'room'|'generation'|'seq'|'ts'>;
export type ContestEvidence={
 launch:Source;opening:string;deadline:string;
 statusReport:{source:Source;teams:number;participants:{writer:number;voter:number;organizer:number}}|null;
};
const source=(m:Message):Source=>({room:m.room,generation:m.generation,seq:m.seq,ts:m.ts});
const count=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
function body(m:Message){try{return JSON.parse(m.text);}catch{return null;}}

/** Only verified rules-room evidence may describe the official contest. */
export function contestEvidence(messages:Message[],referee:string|null):ContestEvidence|null{
 if(referee!==REFEREE)return null;
 const rules=messages.filter(m=>m.signatureValid&&m.from===REFEREE&&m.room===ROOM.rules);
 const launch=rules.find(m=>{const p=body(m);return p?.type==='sonnet.launch.v1'&&p.configuration?.contest_id===CONTEST&&p.configuration.referee===REFEREE&&p.package?.sha256===MANIFEST_HASH;});
 if(!launch)return null;
 const config=body(launch).configuration;
 if(!Number.isFinite(config.opening)||!Number.isFinite(config.deadline)||config.opening>=config.deadline)return null;
 const opening=new Date(config.opening*1000),deadline=new Date(config.deadline*1000);
 if(!Number.isFinite(opening.getTime())||!Number.isFinite(deadline.getTime()))return null;
 const evidence:ContestEvidence={launch:source(launch),opening:opening.toISOString(),deadline:deadline.toISOString(),statusReport:null};
 // Transport timestamps are display metadata; rules-room order selects the latest report.
 for(const m of rules.filter(m=>m.generation===launch.generation&&m.seq>launch.seq).sort((a,b)=>b.seq-a.seq)){
  const p=body(m),participants=p?.participants;
  if(p?.type!=='sonnet.notice.v1'||p.contest_id!==CONTEST||p.subject!=='referee status'||p.referee!==REFEREE)continue;
  if(!count(p.teams)||!participants||!['writer','voter','organizer'].every(k=>count(participants[k])))continue;
  evidence.statusReport={source:source(m),teams:p.teams,participants:{writer:participants.writer,voter:participants.voter,organizer:participants.organizer}};break;
 }
 return evidence;
}

export function contestPhase(evidence:ContestEvidence|null|undefined,now:number){
 if(!evidence)return 'unknown';
 if(now<Date.parse(evidence.opening))return 'upcoming';
 return now>Date.parse(evidence.deadline)?'closed':'open';
}

export function recentCheck(checkedAt:string|null|undefined,now:number){
 const time=checkedAt?Date.parse(checkedAt):NaN;
 return Number.isFinite(time)&&now>=time&&now-time<90_000;
}
