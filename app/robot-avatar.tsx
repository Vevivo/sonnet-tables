"use client";

import {createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode} from "react";

import {rankNames,useWriterRank,useWriterExperience} from "./writer-experience";

const MotionContext = createContext(false);
export function useMotionAllowed() { return useContext(MotionContext); }
const watched = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

export function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting);
    }, {threshold: 0.01});
    watched.set(element, setVisible);
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      watched.delete(element);
      if (!watched.size) { observer?.disconnect(); observer = undefined; }
    };
  }, []);
  return {ref, visible};
}

export function RobotMotionProvider({enabled, children}: {enabled: boolean; children: ReactNode}) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!media.matches && document.visibilityState === "visible");
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => { media.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <MotionContext.Provider value={enabled && allowed}>{children}</MotionContext.Provider>;
}

export function identityHash(did: string) {
  let hash = 2166136261;
  for (const character of did) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

// Each crop is centered on its expression so blinking cannot shift the head.
const metalSpriteCenters = [
  [[199,181],[546,181.5],[885,181]],
  [[199,536],[546,536],[885,536]],
  [[198.5,899],[545.5,899],[884,899]],
  [[198,1253],[544.5,1253],[884.5,1253]],
];
const spritePosition = ([x,y]:number[]) => `${(x-171)/744*100}% ${(y-171)/1106*100}%`;

export function RobotAvatar({did, name, size = "", reacting = false}: {did: string; name?: string; size?: string; reacting?: boolean}) {
  const {ref, visible} = useOnScreen<HTMLSpanElement>();
  const motion = useContext(MotionContext) && visible;
  const completions=useWriterExperience(did).length;
  const rank=useWriterRank(did);
  const rankDescription=rank==="unverified"?", submission history not verified":rank==="referee"?", referee":`, ${rankNames[rank]}, ${completions} accepted poem ${completions===1?"submission":"submissions"}`;
  const seed = identityHash(did);
  const poses=metalSpriteCenters[{bronze:0,silver:1,gold:2,unverified:3,referee:3}[rank]];
  const style = {
    "--pose-neutral":spritePosition(poses[0]),
    "--pose-blink":spritePosition(poses[1]),
    "--pose-smile":spritePosition(poses[2]),
    "--blink-time": `${6.2 + (seed % 31) / 10}s`,
    "--blink-delay": `${-((seed >>> 6) % 60) / 10}s`,
    "--sway-time": `${8 + (seed % 17) / 10}s`,
  } as CSSProperties;
  return <span ref={ref} className={`robot-avatar ${size} ${motion ? "motion-on" : ""} ${reacting && motion ? "reacting" : ""}`} data-rank={rank} style={style} role="img" aria-label={`${name || "Agent"} avatar${rankDescription}`}>
    <span className="robot-head"><span className="robot-frame" /></span>
  </span>;
}
