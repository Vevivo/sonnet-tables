import {DID_PATTERN} from "./signatures";
import {ROOM} from "./sonnet-types";
export const START=Date.parse("2026-09-11T12:00:00Z"),DEADLINE=Date.parse("2026-09-18T12:00:00Z");
export function validateAction(room:string,p:Record<string,unknown>,did:string){
 if(p.contest_id!=="sonnet-2"||typeof p.request_id!=="string"||!p.request_id||p.request_id.length>120)throw new Error("Missing contest or request identifier.");
 const type=String(p.type??"");const game=String(p.game_id??"");
 const tableTypes=["sonnet.team-request.v1","sonnet.roster.v1","sonnet.withdraw.v1","sonnet.word.v1","sonnet.submit.v1"];
 if(tableTypes.includes(type)&&!/^[a-z0-9][a-z0-9_-]{0,15}$/.test(game))throw new Error("Table ID must use 1–16 lowercase letters, digits, hyphens or underscores.");
 const allowed:Record<string,string>={"sonnet.register.v1":ROOM.registration,"sonnet.team-request.v1":ROOM.discovery,"sonnet.roster.v1":ROOM.discovery,"sonnet.withdraw.v1":ROOM.discovery,"sonnet.word.v1":`d-sonnet-2-team-${game}`,"sonnet.submit.v1":ROOM.submissions,"sonnet.ballot.v1":ROOM.votes,"sonnet.claim.v1":ROOM.registration};
 if(type==="sonnet.note.v1"||type==="sonnet.recruit.v1"){if(room!==ROOM.discovery&&!/^d-sonnet-2-team-[a-z0-9][a-z0-9_-]{0,15}$/.test(room))throw new Error("Planning must stay in contest rooms.");if(typeof p.text!=="string"||!p.text.trim())throw new Error("Write a message first.");return;}
 if(!allowed[type]||allowed[type]!==room)throw new Error("This action belongs in a different contest room.");
 if(type==="sonnet.register.v1"){
  if(!["writer","voter","organizer"].includes(String(p.role)))throw new Error("Choose a role.");
  if(p.role==="writer"&&!/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(String(p.x_account_url)))throw new Error("Writers need their own public X account URL.");
 }
 if(type==="sonnet.roster.v1"){
  const a=p.members;if(!Array.isArray(a)||a.length<4||a.length>8||new Set(a).size!==a.length||!a.every(d=>typeof d==="string"&&DID_PATTERN.test(d))||!a.includes(did))throw new Error("The same roster must contain 4–8 different writer DIDs, including yours.");
  if(!Number.isInteger(p.room_generation)||Number(p.room_generation)<0||p.poem_room!==`d-sonnet-2-team-${game}`)throw new Error("Use the exact room and generation from the referee setup receipt.");
 }
 if(type==="sonnet.word.v1"){
  if(!/^[A-Za-z]+(?:'[A-Za-z]+)*[,.;:!?]?$/.test(String(p.word)))throw new Error("Propose exactly one English word.");
  if(!Number.isInteger(p.version)||Number(p.version)<0||!Number.isInteger(p.room_generation)||Number(p.room_generation)<0||!/^[a-f0-9]{64}$/i.test(String(p.previous_state_hash)))throw new Error("A verified current referee state is required before writing.");
 }
 if(type==="sonnet.submit.v1"&&(!/^[a-f0-9]{64}$/i.test(String(p.poem_sha256))||!Array.isArray(p.x_post_ids)||!p.x_post_ids.length||!p.x_post_ids.every(id=>/^\d{1,25}$/.test(String(id)))||p.poem_room!==`d-sonnet-2-team-${game}`||!Number.isInteger(p.final_version)||!Number.isInteger(p.room_generation)))throw new Error("Supply the frozen poem hash, state and published X post IDs.");
 if(type==="sonnet.ballot.v1"&&(p.voter_did!==did||typeof p.entry_id!=="string"||!p.entry_id))throw new Error("The ballot must use your DID and a submitted entry ID.");
 if(type==="sonnet.claim.v1"&&(typeof p.destination!=="string"||!p.destination.trim()))throw new Error("Use the destination for the officially announced payment method.");
}
