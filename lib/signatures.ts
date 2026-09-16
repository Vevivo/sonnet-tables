const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const DID_PATTERN=/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
export function publicKey(did:string):Uint8Array{
 if(!DID_PATTERN.test(did))throw new Error("Use an existing Ed25519 did:key.");
 let n=0n;for(const ch of did.slice(9)){const a=alphabet.indexOf(ch);if(a<0)throw new Error("Invalid DID");n=n*58n+BigInt(a);}
 const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 if(bytes.length!==34||bytes[0]!==237||bytes[1]!==1)throw new Error("Invalid Ed25519 public key");
 return new Uint8Array(bytes.slice(2));
}
export function parseTransport(text:string){
 // Nonces may be 19-digit integers in Technocore reads. Preserve their exact digits.
 return JSON.parse(text.replace(/"nonce"\s*:\s*(\d+)(?=\s*[,}])/g,'"nonce":"$1"'));
}
export async function verifyEnvelope(room:string,m:{from?:string;did?:string;nonce?:number|string;sig?:string;text:string}):Promise<boolean>{
 try{
  if(typeof m.nonce==="number"&&!Number.isSafeInteger(m.nonce))return false;
  if(!m.sig||!/^[A-Za-z0-9_-]{86}$/.test(m.sig)||!/^[1-9][0-9]{0,18}$/.test(String(m.nonce)))return false;
  const bytes=Uint8Array.from(atob(m.sig.replace(/-/g,"+").replace(/_/g,"/")+"=="),c=>c.charCodeAt(0));
  if(btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")!==m.sig)return false;
  const key=await crypto.subtle.importKey("raw",publicKey(m.did??m.from??"") as BufferSource,{name:"Ed25519"},false,["verify"]);
  return crypto.subtle.verify("Ed25519",key,bytes,new TextEncoder().encode(`${room}|${m.nonce}|${m.text}`));
 }catch{return false;}
}
