import {REFEREE,ROOM,type Writer,type Team} from './sonnet-types';
import {packet,type ActionRecord} from './participation';
import {START,DEADLINE} from './protocol';

export const VOTING_RULES='https://github.com/flop-labs/technocore-sonnet-challenge/blob/e1999094c359ef7390bdf07fe2a151393a5c2f51/sonnet-game.md#campaigning-and-open-voting';
export type RegistrationCheck={registrationCheckedAt?:string;warning:string};
export function registrationFresh(check:RegistrationCheck,now=Date.now()){
 const at=Date.parse(check.registrationCheckedAt??'');
 return !check.warning&&Number.isFinite(at)&&at<=now&&now-at<120000;
}
export function participantFrom(...people:(Writer|null|undefined)[]){
 return people.find(p=>p?.registration==='confirmed')??people.find(Boolean)??undefined;
}
export function voterState(did:string,person:Writer|undefined,check:RegistrationCheck,registrationInFlight=false,now=Date.now()){
 if(!did)return {kind:'disconnected',title:'Connect your existing identity',text:'A public DID alone cannot sign a ballot. Use the signing key for your own existing DID.'};
 if(did===REFEREE)return {kind:'excluded',title:'The referee cannot vote',text:'Contributors, organizers, the referee and judges cannot cast counted ballots.'};
 if(person?.registration==='confirmed')return person.role==='voter'
  ?{kind:'voter',title:'Voter registration accepted',text:'Choose the poem you think FLOP’s human judges will find best. Signing and delivery still require a referee receipt.'}
  :{kind:'excluded',title:`Your fixed role: ${person.role}`,text:'Writers and organizers cannot vote, including after finishing a poem. Do not switch roles or use another DID to vote.'};
 if(registrationInFlight||person?.registration==='requested')return registrationFresh(check,now)
  ?{kind:'pending',title:'Registration sent · receipt not verified',text:'Your request is saved, but no matching referee decision is verified here yet. This page checks automatically while open. Missing receipt history is possible; do not send another registration.'}
  :{kind:'pending',title:'Registration result temporarily unavailable',text:'Your existing request is preserved. The latest check is unavailable or out of date, so this screen cannot confirm whether the referee has answered. We check again automatically while this page is open; do not register again.'};
 if(!registrationFresh(check,now))return {kind:'unknown',title:'Checking your registration',text:'Your role could not yet be confirmed from a recent check. Refresh or read the official registration room before preparing a registration.'};
 if(person?.registration==='rejected')return {kind:'rejected',title:'Registration rejected',text:'Read the referee’s exact reason. If earlier identity evidence was missing, retry only after the referee has verified it, before closing.'};
 return {kind:'unconfirmed',title:'No accepted registration found here',text:'Review the official records before registering as a voter. The referee must verify this exact DID’s signed pre-start archive evidence; importing a key does not establish eligibility.'};
}
export function votingWindow(now=Date.now()){
 return now<START?'Voting opens on 11 September 2026 at 12:00 UTC.':now>DEADLINE?'Voting is closed. Review your receipts and the official results.':null;
}
/** Uses the referee-projected submission, never a full roster or a claimed poem. */
export function hasAcceptedSubmission(team:Team){
 return team.status==='submitted'&&!!team.entryId;
}
export function tableVotingState(team:Team,now=Date.now()){
 if(hasAcceptedSubmission(team)){
  const window=votingWindow(now);
  return window
   ?{kind:now<START?'scheduled':'closed',canVote:false,label:now<START?'Voting has not opened':'Voting closed',detail:window}
   :{kind:'open',canVote:true,label:'Open for voting',detail:'Submission accepted. Final entry eligibility is still reviewed separately; vote counts are provisional.'};
 }
 if(team.status==='submitted')return {kind:'awaiting_entry',canVote:false,label:'Entry verification pending',detail:'The accepted entry ID is not available here yet. Refresh the table or check its official submission receipt.'};
 if(team.status==='completed')return {kind:'awaiting_submission',canVote:false,label:'Poem complete · submission pending',detail:'All 14 lines are complete. The final contributor must publish and submit the poem, and the referee must accept the submission before voting can open.'};
 if(team.closed)return {kind:'room_closed',canVote:false,label:'Recruitment closed',detail:'No accepted poem submission is available to vote for.'};
 return {kind:'writing',canVote:false,label:'Poem not yet complete',detail:'Voting opens after all 14 lines are completed and the referee accepts the poem submission.'};
}
export function ballotHistory(records:ActionRecord[],did:string){
 const ballots=records.filter(r=>r.request.from===did&&r.request.room===ROOM.votes&&packet(r.request).type==='sonnet.ballot.v1'&&packet(r.request).voter_did===did);
 const accepted=ballots.filter(r=>r.status==='accepted'&&r.receipt).sort((a,b)=>packet(b.receipt!).intake_seq-packet(a.receipt!).intake_seq)[0]??null;
 const latest=[...ballots].sort((a,b)=>b.request.generation-a.request.generation||b.request.seq-a.request.seq)[0]??null;
 return {accepted,latest,pending:ballots.filter(r=>r.status==='pending')};
}
// Retain the effective ballot and the last ballot/registration even after many later actions.
export function activityWithEvidence(records:ActionRecord[],did:string,limit=35){
 const {accepted,latest}=ballotHistory(records,did);
 const registration=records.filter(r=>r.request.room===ROOM.registration&&packet(r.request).type==='sonnet.register.v1').sort((a,b)=>b.request.generation-a.request.generation||b.request.seq-a.request.seq)[0];
 return [...new Map([...records.slice(0,limit),accepted,latest,registration].filter((r):r is ActionRecord=>!!r).map(r=>[`${r.request.room}:${r.request.generation}:${r.request.seq}`,r])).values()];
}
