import {readRoom} from "@/lib/sonnet-sync";
import {verifyEnvelope} from "@/lib/signatures";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const room=new URL(req.url).searchParams.get("room")??"";const d=await readRoom(room);d.messages=await Promise.all(d.messages.map(async(m:any)=>({...m,room,generation:d.generation,signatureValid:await verifyEnvelope(room,m)})));return Response.json(d,{headers:{"Cache-Control":"private, max-age=15","Access-Control-Allow-Origin":"*"}});}catch(e){return Response.json({error:e instanceof Error?e.message:"Room unavailable"},{status:502,headers:{"Access-Control-Allow-Origin":"*"}});}}
