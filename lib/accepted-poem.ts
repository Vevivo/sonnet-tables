import {parseLexicon} from "./word-check";
import type {Snapshot} from "./sonnet-types";
let dictionary:Promise<Map<string,number>>|null=null;
async function lexicon(){
 if(!dictionary)dictionary=(async()=>{const r=await fetch("https://raw.githubusercontent.com/flop-labs/technocore-sonnet-challenge/e1999094c359ef7390bdf07fe2a151393a5c2f51/cmudict.dict",{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error("Frozen dictionary unavailable");const bytes=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");if(hash!=="81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22")throw Error("Dictionary integrity mismatch");return parseLexicon(new TextDecoder().decode(bytes));})().catch(e=>{dictionary=null;throw e;});
 return dictionary;
}
export async function enrichAcceptedPoems(snapshot:Snapshot){
 const teams=snapshot.teams.filter(t=>t.words.length&&t.ledgerComplete);if(!teams.length)return;
 const lex=await lexicon();
 for(const t of teams){let count=0,line:string[]=[],valid=true;const lines:string[]=[];
  for(const token of t.words){const n=lex.get(token.replace(/[,.;:!?]$/,"").toLowerCase());if(!n||count+n>10||lines.length>=14){valid=false;break;}line.push(token);count+=n;if(count===10){lines.push(line.join(" "));line=[];count=0;}}
  if(!valid){t.ledgerComplete=false;t.stateHash=null;t.version=null;t.blockers.push("Accepted word sequence needs reconciliation against the frozen dictionary");continue;}
  t.lines=[...lines,...(line.length?[line.join(" ")]:[])];
  if(lines.length===14&&line.length===0&&t.completionAccepted&&t.members.every(d=>t.contributors?.includes(d))){
   const poem=[lines.slice(0,4),lines.slice(4,8),lines.slice(8,12),lines.slice(12)].map(s=>s.join("\n")).join("\n\n");
   const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(poem)))].map(b=>b.toString(16).padStart(2,"0")).join("");
   if(t.status==="submitted"&&t.poemHash&&hash!==t.poemHash){t.canonicalPoem=null;t.blockers.push("Recovered text does not match the accepted submission hash");continue;}
   t.canonicalPoem=poem;t.poemHash=hash;if(t.status!=="submitted")t.status="completed";t.blockers=[t.status==="submitted"?"Official submission accepted":"Fourteen accepted lines · final contributor must publish on X and submit before the deadline"];
  }
 }
}
