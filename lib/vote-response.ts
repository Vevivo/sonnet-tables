import {emptyVoteTally,type VoteTally} from './vote-tally';

type Cached={value:VoteTally;expires:number}|null;
type Source={readCache:()=>Promise<Cached>;refresh:()=>Promise<VoteTally>;restore:()=>Promise<VoteTally>};
/** Keep ingestion alive independently of the browser and serve durable evidence first. */
export async function voteResponse(source:Source,keepAlive:(work:Promise<unknown>)=>void,now=Date.now()){
 const cached=await source.readCache();
 if(cached?.value.checkedAt&&cached.expires>now)return cached.value;
 const updating=source.refresh().catch(()=>({...cached?.value??emptyVoteTally,status:'unavailable' as const,warning:'The live vote check failed. Saved verified observations are preserved.'}));
 keepAlive(updating);
 if(cached?.value.checkedAt)return {...cached.value,status:'refreshing' as const,warning:'Showing saved verified choices while the latest vote receipts are checked. History is incomplete.'};
 // The old archive already contains verified votes. Do not wait for an export
 // before making those observations visible after an empty-cache deployment.
 const restored=source.restore();keepAlive(restored.catch(()=>{}));
 try{return await restored;}catch{return await updating;}
}
