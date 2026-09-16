"use client";
import {useMemo} from "react";
import {CheckCheck, Clock3, Layers3, LockKeyhole, Award, Users, Vote} from "lucide-react";
import type {Team} from "@/lib/sonnet-types";
import {matchesTableFilter} from "@/lib/table-discovery";
const quickFilters=[
 {id:"all",label:"All tables",icon:Layers3},
 {id:"voting",label:"Open for voting",icon:Vote},
 {id:"completed",label:"Completed poems",icon:CheckCheck},
 {id:"recruiting",label:"Seeking writers",icon:Users},
 {id:"full",label:"Full / roster set",icon:LockKeyhole},
 {id:"new",label:"New · 24 hours",icon:Clock3},
];
const moreFilters=[{id:"awaiting-submission",label:"Poem complete · submission pending"},{id:"submitted",label:"Submission accepted"},{id:"forming",label:"Forming"},{id:"ready",label:"Ready to write"},{id:"signed",label:"Roster signatures"},{id:"writing",label:"Writing"}];
export function TableFilters({teams,filter,now,experiencedCount,historyPending,onFilter,onExperienced}:{teams:Team[];filter:string;now:number;experiencedCount:number;historyPending:boolean;onFilter:(id:string)=>void;onExperienced:()=>void}) {
 const counts=useMemo(()=>Object.fromEntries([...quickFilters,...moreFilters].map(f=>[f.id,teams.filter(t=>matchesTableFilter(t,f.id,now)).length])),[teams,now]);
 const description=filter==="voting"?"Tables with an accepted poem submission and entry ID, while voting is open. Final eligibility review remains separate.":filter==="awaiting-submission"?"These tables finished all 14 lines. Publication and referee acceptance of the submission are still needed before voting.":filter==="submitted"?"Accepted poem submissions. Voting is available only during the contest window.":filter==="full"?"Eight proposed seats, a confirmed roster or a locked poem. Some tables may still need signatures.":filter==="new"?"Officially allocated in the last 24 hours, newest first.":filter==="recruiting"?"Hosts advertising seats, with room for another writer. Confirm availability with the team.":filter==="completed"?"These tables completed a poem. Each table shows whether its submission is pending or accepted; a full roster alone does not qualify.":"Choose a category to search the entire lobby.";
 return <div className="table-discovery-controls"><div className="table-quick-filters" role="group" aria-label="Find tables by status">
  {quickFilters.map(({id,label,icon:Icon})=><button key={id} className={`table-filter-card filter-${id}`} aria-pressed={filter===id} onClick={()=>onFilter(id)}><Icon size={18}/><span>{label}</span><strong>{counts[id]}</strong></button>)}
  <button className="table-filter-card filter-experienced" disabled={historyPending} title={historyPending?"Metal ranks are paused until every accepted submission has a verified roster":undefined} onClick={onExperienced}><Award size={18}/><span>{historyPending?"History check":"Experienced writers"}</span><strong>{historyPending?"…":experiencedCount}</strong></button>
 </div><div className="table-more-filters" role="group" aria-label="More table stages">{moreFilters.map(f=><button key={f.id} aria-pressed={filter===f.id} onClick={()=>onFilter(f.id)}>{f.label}<span>{counts[f.id]}</span></button>)}</div><p className="table-filter-description">{description}</p></div>;
}
