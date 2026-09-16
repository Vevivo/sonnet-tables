import type {Message} from './sonnet-types';

/** Start from the DID indexes. A room-first OR scan grows with everybody's traffic. */
export async function readIdentityHistory(db:D1Database,did:string,options:{rooms?:string[];limit?:number}={}){
 const {rooms,limit}=options;
 const roomFilter=rooms?.length?` AND room IN (${rooms.map(()=>'?').join(',')})`:'';
 const cap=limit?Math.max(1,Math.min(500,Math.floor(limit))):null;
 const queries=[
  ['idx_sonnet_records_sender',"$.from"],
  ['idx_sonnet_records_receipt_sender',"$.payload.sender_did"],
 ].map(([index,path])=>db.prepare(`SELECT body FROM sonnet_records INDEXED BY ${index}
  WHERE json_extract(body,'${path}')=?${roomFilter} ORDER BY ts DESC${cap?' LIMIT '+cap:''}`).bind(did,...(rooms??[])));
 const pages=await db.batch<{body:string}>(queries);
 const unique=new Map<string,Message>();
 for(const page of pages)for(const row of page.results){const m=JSON.parse(row.body) as Message;unique.set(`${m.room}:${m.generation}:${m.seq}`,m);}
 const rows=[...unique.values()].sort((a,b)=>b.ts.localeCompare(a.ts));
 return cap?rows.slice(0,cap):rows;
}
