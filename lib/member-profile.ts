import {REFEREE,ROOM,type Snapshot,type Team,type Writer} from './sonnet-types';
import {writerAchievements} from './table-discovery';
import {packet,type ActionRecord} from './participation';

export type ProfileTable={id:string;room:string;generation:number|null;status:Team['status'];entryId:string|null;receipt:{room:string;seq:number}|null;at:string};
export type ProfileBallot={entry:string;status:'accepted'|'rejected'|'pending';order:number;at:string;request:{room:string;seq:number};receipt:{room:string;seq:number}|null;reason:string};
export type MemberProfile={did:string;person:Writer|null;active:ProfileTable[];pending:ProfileTable[];hosted:ProfileTable[];completed:ProfileTable[];historyReady:boolean;ballots:ProfileBallot[];currentVote:ProfileBallot|null;updatedAt:string|null;checkedAt:string;warning:string};
export function profileTable(t:Team):ProfileTable {const receipt=t.status==='submitted'?t.lastReceipt:t.rosterReceipt;return {id:t.id,room:t.room,generation:t.generation,status:t.status,entryId:t.entryId,receipt:receipt?{room:receipt.room,seq:receipt.seq}:null,at:receipt?.ts??t.lastSeen};}
export function profileBallots(records:ActionRecord[],did:string){
 return records.filter(r=>r.request.from===did&&r.request.room===ROOM.votes&&packet(r.request).type==='sonnet.ballot.v1'&&packet(r.request).voter_did===did&&typeof packet(r.request).entry_id==='string').map(r=>({entry:packet(r.request).entry_id,status:r.status==='recorded'?'pending':r.status,order:r.receipt?Number(packet(r.receipt).intake_seq):0,at:r.receipt?.ts??r.request.ts,request:{room:r.request.room,seq:r.request.seq},receipt:r.receipt?{room:r.receipt.room,seq:r.receipt.seq}:null,reason:r.reason} as ProfileBallot)).sort((a,b)=>b.order-a.order||b.at.localeCompare(a.at));
}
export function buildMemberProfile(snapshot:Snapshot,did:string,person:Writer|null,records:ActionRecord[],checkedAt:string,warning=''):MemberProfile {
 const trusted=snapshot.launchSeen&&snapshot.refereeDid===REFEREE;
 const teams=trusted?snapshot.teams:[];
 const historyReady=trusted&&!!snapshot.submissionAudit&&snapshot.submissionAudit.unresolved.length===0;
 const completed=writerAchievements(teams).get(did)??[];
 const active=teams.filter(t=>t.status!=='submitted'&&t.members.includes(did)&&((t.confirmed&&t.frozen)||t.memberStates?.some(m=>m.did===did&&['confirmed','consent_accepted'].includes(m.status))));
 const pending=teams.filter(t=>t.status!=='submitted'&&!active.includes(t)&&(t.members.includes(did)&&t.memberStates?.some(m=>m.did===did&&['signature_pending','referee_pending'].includes(m.status))||t.applicants.includes(did)));
 const ballots=profileBallots(records,did);
 return {did,person,active:active.map(profileTable),pending:pending.map(profileTable),hosted:teams.filter(t=>t.host===did&&t.status!=='submitted').map(profileTable),completed:completed.map(profileTable).sort((a,b)=>b.at.localeCompare(a.at)),historyReady,ballots:ballots.slice(0,25),currentVote:ballots.find(b=>b.status==='accepted')??null,updatedAt:snapshot.updatedAt,checkedAt,warning};
}
export function profileTier(profile:Pick<MemberProfile,'historyReady'|'completed'>){return profile.completed.length>=2?'gold':profile.completed.length===1?'silver':profile.historyReady?'bronze':'unverified';}
export function profileShareText(profile:MemberProfile){const n=profile.completed.length;return n?`I contributed to ${profile.historyReady?'':'at least '}${n} accepted ${n===1?'sonnet':'sonnets'} in the Technocore Sonnet Challenge. Explore my robot badge and signed participation record on Sonnet Tables.`:'My robot badge and participation record for the Technocore Sonnet Challenge are on Sonnet Tables. Find a team, follow the poems and explore the signed records.';}
