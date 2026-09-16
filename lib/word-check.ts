import {assetUrl} from "./client-urls";
import {lettersOf} from "./sonnet-types";
import {DID_PATTERN} from "./signatures";
let lexicon:Promise<Map<string,number>>|null=null;
export function parseLexicon(text:string){const counts=new Map<string,number>();for(const row of text.split("\n")){const fields=row.split("#",1)[0].trim().split(/\s+/);const word=fields[0]?.replace(/\(\d+\)$/,"").toLowerCase();if(!word||!/^[a-z]+(?:'[a-z]+)*$/.test(word))continue;const n=fields.slice(1).filter(p=>/^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)[012]$/.test(p)).length;if(n)counts.set(word,Math.max(n,counts.get(word)??0));}return counts;}
export function loadLexicon(){if(!lexicon)lexicon=(async()=>{const r=await fetch(assetUrl("/cmudict.dict"));if(!r.ok)throw new Error("The official dictionary could not be loaded.");const bytes=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");if(hash!=="81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22")throw new Error("Dictionary integrity check failed. Writing is paused.");return parseLexicon(new TextDecoder().decode(bytes));})().catch(e=>{lexicon=null;throw e;});return lexicon;}
export function checkWord(word:string,did:string,lex:Map<string,number>){if(!DID_PATTERN.test(did))throw new Error("Choose your existing Ed25519 DID first.");const match=word.match(/^([A-Za-z]+(?:'[A-Za-z]+)*)[,.;:!?]?$/);if(!match)throw new Error("Use one English word, optionally ending in , . ; : ! or ?");const bare=match[1].toLowerCase();const missing=[...new Set([...bare].filter(c=>c!=="'"&&!lettersOf(did).includes(c)))];if(missing.length)throw new Error(`Your DID does not contain: ${missing.join(", ").toUpperCase()}. Another teammate may be able to write this word.`);const count=lex.get(bare);if(!count)throw new Error("This word is not in the contest's frozen dictionary.");return count;}
export async function checkPoem(text:string,lex:Map<string,number>){
 const source=text.replace(/\r\n/g,"\n").replace(/\n$/,"");
 const stanzas=source.split("\n\n");if(stanzas.length>1&&stanzas.map(s=>s.split("\n").length).join(",")!=="4,4,4,2")throw new Error("Use 14 lines together or 4/4/4/2 stanzas.");
 const lines=stanzas.flatMap(s=>s.split("\n"));if(lines.length!==14)throw new Error(`Expected 14 lines; found ${lines.length}.`);
 const counts=lines.map((line,i)=>{const count=line.split(" ").reduce((sum,token)=>{const m=token.match(/^([A-Za-z]+(?:'[A-Za-z]+)*)[,.;:!?]?$/);if(!m)throw new Error(`Line ${i+1}: use valid words separated by one ASCII space.`);const n=lex.get(m[1].toLowerCase());if(!n)throw new Error(`Line ${i+1}: ${m[1]} is not in the frozen dictionary.`);return sum+n;},0);if(count!==10)throw new Error(`Line ${i+1}: ${count} dictionary syllables; exactly 10 required.`);return count;});
 const canonical=[lines.slice(0,4).join("\n"),lines.slice(4,8).join("\n"),lines.slice(8,12).join("\n"),lines.slice(12).join("\n")].join("\n\n");
 const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical)))].map(b=>b.toString(16).padStart(2,"0")).join("");
 return {counts,canonical,hash};
}
