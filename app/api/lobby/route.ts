import {waitUntil} from 'cloudflare:workers';
import {database} from '@/lib/sonnet-db';
import {getVoteTally} from '@/lib/vote-sync';
import {withVoteTally} from '@/lib/vote-tally';
import {lobbyJson} from "@/lib/lobby-json";
import {syncSnapshot} from "@/lib/sonnet-sync";
import {emptySnapshot} from "@/lib/sonnet-types";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const focus=new URL(req.url).searchParams.get("team")??undefined;const indexing=syncSnapshot(focus);waitUntil(indexing.catch(error=>console.error('lobby refresh failed',String(error))));const [snapshot,tally]=await Promise.all([indexing,getVoteTally(database(),waitUntil)]);return new Response(lobbyJson(withVoteTally(snapshot,tally)),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=10","Access-Control-Allow-Origin":"*"}});}catch{return Response.json({...emptySnapshot,warnings:["The live index is temporarily unavailable. No empty seats or registrations can be confirmed right now."]},{status:503,headers:{"Access-Control-Allow-Origin":"*"}});}}
