import {env} from "cloudflare:workers";
import {verifyEnvelope,parseTransport} from "@/lib/signatures";
import {validateAction} from "@/lib/protocol";
import {database} from "@/lib/sonnet-db";
import {configuredOrigins,relayHeaders,relayPreflight} from "@/lib/relay-cors";
const allowedOrigins=()=>configuredOrigins((env as Cloudflare.Env).SONNET_ALLOWED_ORIGINS);
export function OPTIONS(req:Request){return relayPreflight(req,allowedOrigins());}
export async function POST(req:Request){
 const headers=relayHeaders(req,allowedOrigins());if(!headers)return Response.json({error:"Open this action from Sonnet Tables."},{status:403,headers:{"Vary":"Origin","Cache-Control":"no-store"}});
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
 try{
  const raw=await req.text();if(raw.length>18000)throw new Error("Message is too large.");const {room,envelope,dryRun}=parseTransport(raw);
  if(!envelope||typeof envelope.text!=="string"||envelope.text.length>4096||typeof envelope.nonce!=="string"||/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u.test(envelope.text))throw new Error("Use a compact, single-line signed message and a string nonce.");
  const p=JSON.parse(envelope.text);validateAction(room,p,envelope.did);
  if(!await verifyEnvelope(room,envelope))throw new Error("Signature does not match this DID, room and message. Nothing was sent.");
  if(dryRun)return json({signatureValid:true,payload:p});
  const db=database(),now=Date.now();const throttle=await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires WHERE sonnet_cache.expires < ? RETURNING key").bind(`relay:${envelope.did}`,p.request_id,now+2000,now).first();if(!throttle)return json({error:"Please wait a moment before sending another message."},429);
  const ticketKey=`action:${envelope.did}:${p.request_id}`,ticket={room,requestId:p.request_id,type:p.type,text:envelope.text,createdAt:new Date().toISOString()};
  const previous=await db.prepare("SELECT value FROM sonnet_cache WHERE key=?").bind(ticketKey).first<{value:string}>();
  if(previous){const old=JSON.parse(previous.value);if(old.room!==room||old.text!==envelope.text)throw new Error("This request ID belongs to a different action. Review the original result before preparing a correction.");}
  await db.prepare("INSERT INTO sonnet_cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires").bind(ticketKey,JSON.stringify(ticket),now+7*86400000).run();
  const r=await fetch(`https://technocore.chat/r/${room}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(envelope),signal:AbortSignal.timeout(18000),redirect:"manual"});const body=await r.text();
  if(!r.ok&&r.status!==303){if(r.status>=400&&r.status<500)await db.prepare("DELETE FROM sonnet_cache WHERE key=?").bind(ticketKey).run();return json({error:body.slice(0,600),transportStatus:r.status},422);}
  return json({relayed:true,acceptedByReferee:false,message:"Delivered to Technocore. Referee acceptance is still pending.",room});
 }catch(e){const uncertain=e instanceof Error&&/timeout|abort|fetch|network/i.test(e.message);return json({error:uncertain?"Delivery could not be confirmed. Check the room before retrying; do not assume the message failed.":e instanceof Error?e.message:"Delivery could not be confirmed. Check the room before retrying."},400);}
}
