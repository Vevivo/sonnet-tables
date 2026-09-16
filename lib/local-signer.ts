import {DID_PATTERN,publicKey} from "./signatures";
const b58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encode58(bytes:Uint8Array){let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out="";while(n){out=b58[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b!==0)break;out="1"+out;}return out;}
const unbase=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
export class VaultPasswordRequired extends Error {
 constructor(){super("PACT vault detected. Enter its existing password to unlock it in this tab.");this.name="VaultPasswordRequired";}
}
function vaultBytes(value:unknown,field:string,length?:number){
 if(typeof value!=="string"||!value.length||value.length>22000||!/^[A-Za-z0-9_-]+$/.test(value))throw Error(`The PACT vault has an invalid ${field} field.`);
 let bytes:Uint8Array;try{bytes=unbase(value);}catch{throw Error(`The PACT vault has an invalid ${field} field.`);}
 if(length!==undefined&&bytes.length!==length)throw Error(`The PACT vault has an invalid ${field} length.`);
 return bytes;
}
// Compatible with PACT frontend/src/identity.ts: PBKDF2-SHA256 / AES-256-GCM.
// The original file is read only; decrypted material stays in this browser tab.
async function unlockPactVault(value:Record<string,any>,expectedDid:string,passphrase?:string){
 if(value.did!==expectedDid)throw Error("This PACT vault belongs to a different DID. Enter the DID used when you created this vault; do not rename or edit the vault.");
 const pub=value.publicJwk;
 if(!pub||pub.kty!=="OKP"||pub.crv!=="Ed25519"||typeof pub.x!=="string")throw Error("The PACT vault is missing its Ed25519 public key.");
 const raw=vaultBytes(pub.x,"public key",32);
 const declaredDid="did:key:z"+encode58(new Uint8Array([237,1,...raw]));
 if(declaredDid!==expectedDid)throw Error("The PACT vault's public key does not match its DID.");
 if(!Number.isInteger(value.iterations)||value.iterations<1||value.iterations>2000000)throw Error("The PACT vault uses an unsupported password-derivation setting.");
 const salt=vaultBytes(value.salt,"salt",16),iv=vaultBytes(value.iv,"iv",12),ciphertext=vaultBytes(value.ciphertext,"ciphertext");
 if(ciphertext.length<17)throw Error("The PACT vault's encrypted content is incomplete.");
 if(passphrase===undefined)throw new VaultPasswordRequired();
 const passwordBytes=new TextEncoder().encode(passphrase);
 let decrypted:Uint8Array;
 try{
  const material=await crypto.subtle.importKey("raw",passwordBytes,"PBKDF2",false,["deriveKey"]);
  const aes=await crypto.subtle.deriveKey({name:"PBKDF2",salt:salt as BufferSource,iterations:value.iterations,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["decrypt"]);
  decrypted=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:iv as BufferSource},aes,ciphertext as BufferSource));
 }catch{throw Error("The PACT vault could not be unlocked. Check its original password; a damaged vault can cause the same error. The file has not been changed.");}
 finally{passwordBytes.fill(0);}
 try{
  let payload:any;try{payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(decrypted));}catch{throw Error("The unlocked PACT vault does not contain a valid key payload.");}
  const jwk=payload?.privateKeyJwk;
  if(!jwk||jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.d!=="string"||jwk.x!==pub.x)throw Error("The decrypted key does not match the PACT vault's public identity.");
  return jwk as JsonWebKey;
 }finally{decrypted.fill(0);}
}
export async function importSigner(file:File,expectedDid:string,passphrase?:string){
 if(!DID_PATTERN.test(expectedDid))throw new Error("Enter your existing DID first.");
 if(file.size>16384)throw new Error("Use a small signing-key file, not a full backup.");
 let value:any;try{value=JSON.parse(await file.text());}catch{throw Error("This is not a valid JSON key or PACT vault file.");}
 if(!value||typeof value!=="object")throw Error("Choose a JSON signing key or a PACT vault file.");
 if(value.format!==undefined){if(value.format!=="pact-vault-v1")throw Error("This vault version is not supported. Keep the original file and check which app exported it.");value={privateKeyJwk:await unlockPactVault(value,expectedDid,passphrase)};}
 let key:CryptoKey;
 const jwk=value.privateKeyJwk??value.jwk??value;
 if(jwk.kty==="OKP"&&jwk.crv==="Ed25519"&&jwk.d)key=await crypto.subtle.importKey("jwk",jwk,{name:"Ed25519"},true,["sign"]);
 else{
  let seed:Uint8Array;
  if(Array.isArray(value)&&[32,64].includes(value.length)&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))seed=new Uint8Array(value.slice(0,32));
  else if(typeof value.seedHex==="string"&&/^[0-9a-f]{64}$/i.test(value.seedHex))seed=new Uint8Array(value.seedHex.match(/../g).map((h:string)=>parseInt(h,16)));
  else throw new Error("This file format is not supported. Choose a PACT vault v1, an Ed25519 private JWK, a 32/64-byte JSON array, or seedHex JSON.");
  const der=new Uint8Array([48,46,2,1,0,48,5,6,3,43,101,112,4,34,4,32,...seed]);seed.fill(0);key=await crypto.subtle.importKey("pkcs8",der,{name:"Ed25519"},true,["sign"]);der.fill(0);
 }
 const exported=await crypto.subtle.exportKey("jwk",key);if(!exported.x)throw new Error("Cannot read the signing key's public part.");
 const did="did:key:z"+encode58(new Uint8Array([237,1,...unbase(exported.x)]));
 if(did!==expectedDid)throw new Error("This key does not match the DID you entered. Nothing was sent.");
 const challenge=new TextEncoder().encode("sonnet-tables:local-key-check");const sig=await crypto.subtle.sign("Ed25519",key,challenge);const pub=await crypto.subtle.importKey("raw",publicKey(did) as BufferSource,"Ed25519",false,["verify"]);if(!await crypto.subtle.verify("Ed25519",pub,sig,challenge))throw new Error("Signing-key check failed.");
 // Keep only a non-exportable signing key for the session after proving control.
 const sessionKey=await crypto.subtle.importKey("jwk",exported,{name:"Ed25519"},false,["sign"]);
 return {did,key:sessionKey};
}
let previousNonce=0n;
export async function signAction(key:CryptoKey,did:string,room:string,text:string){const clock=BigInt(Date.now())*1000000n;previousNonce=clock>previousNonce?clock:previousNonce+1n;const nonce=String(previousNonce);const raw=new Uint8Array(await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(`${room}|${nonce}|${text}`)));const sig=btoa(String.fromCharCode(...raw)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");return {did,nonce,text,sig};}
