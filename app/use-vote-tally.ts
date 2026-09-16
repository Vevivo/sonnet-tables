"use client";
import {useEffect,useState} from 'react';
import {apiUrl} from '@/lib/client-urls';
import {emptyVoteTally,type VoteTally} from '@/lib/vote-tally';

export function useVoteTally(){
 const [data,setData]=useState<VoteTally>();
 useEffect(()=>{
  const lifecycle=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const check=async()=>{
   if(document.visibilityState==='visible'){
    const controller=new AbortController(),cancel=()=>controller.abort();
    lifecycle.signal.addEventListener('abort',cancel,{once:true});
    const timeout=setTimeout(cancel,55000);
    try{
     const r=await fetch(apiUrl('/api/votes'),{signal:controller.signal,cache:'no-store'});
     const tally=await r.json() as VoteTally;
     if(!r.ok||!tally.counts||!['ready','refreshing','unavailable'].includes(tally.status))throw Error('Vote check unavailable');
     if(!lifecycle.signal.aborted)setData(prev=>{
      if(prev?.checkedAt&&(!tally.checkedAt||Date.parse(tally.checkedAt)<Date.parse(prev.checkedAt)))return {...prev,status:tally.status,warning:tally.warning};
      return tally;
     });
    }catch{if(!lifecycle.signal.aborted)setData(prev=>({...prev??emptyVoteTally,status:'unavailable',warning:'The latest vote check failed. Saved observations are shown; totals have not been reset to zero.'}));}
    finally{clearTimeout(timeout);lifecycle.signal.removeEventListener('abort',cancel);}
   }
   if(!lifecycle.signal.aborted)timer=setTimeout(check,30000);
  };
  void check();return()=>{lifecycle.abort();clearTimeout(timer);};
 },[]);
 return data;
}
