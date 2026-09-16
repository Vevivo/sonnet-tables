import {seatsClosed} from "./table-lifecycle";
import {lettersOf,type Team} from "./sonnet-types";
export const SAMPLE_WORDS=["the","and","light","night","dream","heart","time","world","love","voice","silence","stars","hope","our","your","with","from","through","still","when","dawn","bloom","earth","sky","wave","fire","life","together","word","song","we","you","I","a","in","of","to","is","as","by","sea","moon","sun","wind","rain","spring","summer","winter","autumn","shine","dark","bright","soft","quiet","hand","soul","home","rise","fall","gold"];
export const canWrite=(did:string,word:string)=>!!did&&/^[A-Za-z]+(?:'[A-Za-z]+)*[,.;:!?]?$/.test(word)&&[...word.toLowerCase().replace(/[^a-z]/g,"")].every(c=>lettersOf(did).includes(c));
export function teamFit(did:string,t:Team){
 const members=t.members.length?t.members:t.host?[t.host]:[];
 const requested=[...t.requestedLetters].filter(l=>lettersOf(did).includes(l)).join("");
 const missingBefore=[..."abcdefghijklmnopqrstuvwxyz"].filter(l=>!members.some(m=>lettersOf(m).includes(l))).join("");
 const addedLetters=[...missingBefore].filter(l=>lettersOf(did).includes(l)).join("");
 const newWords=SAMPLE_WORDS.filter(w=>canWrite(did,w)&&!members.some(m=>canWrite(m,w)));
 const backupWords=SAMPLE_WORDS.filter(w=>canWrite(did,w)&&members.filter(m=>canWrite(m,w)).length===1);
 return {requested,addedLetters,newWords,backupWords,memberCount:members.length,eligible:!seatsClosed(t)&&t.members.length<8};
}
export function routeWords(text:string,members:string[],lastWriter:string|null=null){
 const tokens=text.trim().split(/\s+/).filter(Boolean).slice(0,250);
 const rows=tokens.map(word=>({word,owners:members.filter(d=>canWrite(d,word))}));
 let states=new Map<string,{last:string;mask:number;path:string[]}>();states.set("start",{last:lastWriter??"",mask:0,path:[]});
 for(const row of rows){const next=new Map<string,{last:string;mask:number;path:string[]}>();for(const state of states.values())for(const owner of row.owners){if(owner===state.last)continue;const mask=state.mask|(1<<members.indexOf(owner)),key=owner+":"+mask;if(!next.has(key))next.set(key,{last:owner,mask,path:[...state.path,owner]});}states=next;if(!states.size)break;}
 const allMask=(1<<members.length)-1;
 const complete=[...states.values()].find(s=>s.mask===allMask)??states.values().next().value;
 return {rows,path:complete?.path??[],feasible:tokens.length>0&&!!complete,allContribute:!!complete&&complete.mask===allMask,truncated:text.trim().split(/\s+/).length>250};
}
