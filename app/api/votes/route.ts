import {database} from '@/lib/sonnet-db';
import {getVoteTally} from '@/lib/vote-sync';
import {waitUntil} from 'cloudflare:workers';
import {emptyVoteTally} from '@/lib/vote-tally';
export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
 try{return Response.json(await getVoteTally(database(),waitUntil),{headers});}
 catch(error){console.error('vote response failed',error instanceof Error?error.message:String(error));return Response.json({...emptyVoteTally,warning:'Vote records are temporarily unavailable. No zero totals can be confirmed.'},{status:503,headers});}
}
