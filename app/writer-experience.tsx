"use client";
import {createContext, useContext, useMemo, type ReactNode} from "react";
import {REFEREE, type Team} from "@/lib/sonnet-types";

const ExperienceContext=createContext({achievements:new Map<string,Team[]>(),historyReady:false});
const noPoems:Team[]=[];
export function WriterExperienceProvider({achievements,historyReady,children}:{achievements:Map<string,Team[]>;historyReady:boolean;children:ReactNode}) {
 const value=useMemo(()=>({achievements,historyReady}),[achievements,historyReady]);
 return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
export function useWriterExperience(did:string) { return useContext(ExperienceContext).achievements.get(did)??noPoems; }
export function writerRank(count:number,historyReady:boolean) {
 return count>=2?"gold":count===1?"silver":historyReady?"bronze":"unverified";
}
export function useWriterRank(did:string) {
 const {achievements,historyReady}=useContext(ExperienceContext);
 return did===REFEREE?"referee":writerRank(achievements.get(did)?.length??0,historyReady);
}
export const rankNames={bronze:"Bronze",silver:"Polished silver",gold:"Gold plated",unverified:"History not verified",referee:"Referee"};
export function ExperienceLabel({did}:{did:string}) {
 const count=useWriterExperience(did).length;
 const rank=useWriterRank(did);
 return <span className={`experience-label metal-${rank}`}>{rankNames[rank]}{rank!=="unverified"&&rank!=="referee"?` · ${count} accepted ${count===1?"poem":"poems"}`:""}</span>;
}
