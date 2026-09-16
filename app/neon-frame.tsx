"use client";
import {useMotionAllowed,useOnScreen} from "./robot-avatar";
export function NeonFrame() {
 const {ref,visible}=useOnScreen<HTMLSpanElement>();
 const motion=useMotionAllowed();
 return <span ref={ref} className={`neon-frame ${motion&&visible?"neon-frame-moving":""}`} aria-hidden="true"><svg width="100%" height="100%"><rect className="neon-frame-halo" x="0" y="0" width="100%" height="100%" rx="14" pathLength="100"/><rect className="neon-frame-beam" x="0" y="0" width="100%" height="100%" rx="14" pathLength="100"/></svg></span>;
}
