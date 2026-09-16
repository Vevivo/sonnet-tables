"use client";
import {useEffect,useState} from "react";
import {START,DEADLINE} from "@/lib/protocol";

/** Keep voting controls current even if the index is stale or a tab was asleep. */
export function useContestTime(){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const update=()=>{
   clearTimeout(timer);
   if(document.visibilityState!=="visible")return;
   const current=Date.now();setNow(current);
   const boundary=[START,DEADLINE+1].find(t=>t>current);
   timer=setTimeout(update,Math.min(30000,boundary?boundary-current:30000));
  };
  update();document.addEventListener("visibilitychange",update);
  return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",update);};
 },[]);
 return now;
}
