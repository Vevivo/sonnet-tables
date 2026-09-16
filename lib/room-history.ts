import {parseTransport} from './signatures';
import type {Message} from './sonnet-types';
type Cursor={generation:number;seq:number};
type Tail={generation:number;last_seq:number;messages:{seq:number}[]};

/** The room API returns the newest window, not the next page after `since`. */
export function needsRetainedHistory(cursor:Cursor|undefined,tail:Tail){
 if(!cursor||cursor.generation!==tail.generation)return tail.last_seq>200;
 return tail.messages.length>0&&tail.messages[0].seq>cursor.seq+1;
}

export function assertExportGeneration(headers:Headers,generation:number){
 const value=headers.get('x-room-generation');
 if(value===null||!/^\d+$/.test(value)||Number(value)!==generation)throw Error('Room generation changed or could not be verified during history recovery.');
}

export async function readRetainedHistory(room:string,generation:number,relevant:(room:string,m:Message)=>boolean,after=0){
 const r=await fetch(`https://technocore.chat/r/${room}/export`,{signal:AbortSignal.timeout(22000),redirect:"manual"});if(!r.ok||!r.body)throw new Error("History unavailable");
 assertExportGeneration(r.headers,generation);
 const reader=r.body.getReader(),decoder=new TextDecoder();let buffer="",bytes=0,truncated=false,last=0,first=0;const result:Message[]=[];
 const line=(raw:string)=>{if(!raw.trim())return;try{const m=parseTransport(raw) as Message;m.room=room;m.generation=generation;if(!Number.isInteger(m.seq)||typeof m.text!=="string")return;last=Math.max(last,m.seq);first=first?Math.min(first,m.seq):m.seq;if(m.seq>after&&relevant(room,m))result.push(m);}catch{truncated=true;}};
 try{while(true){const {value,done}=await reader.read();if(done){buffer+=decoder.decode();break;}bytes+=value.byteLength;if(bytes>12_000_000){truncated=true;break;}buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";for(const raw of lines)line(raw);}
 if(buffer.trim()&&!truncated)line(buffer);
 }finally{await reader.cancel();}
 return {messages:result,last,first,truncated};
}
