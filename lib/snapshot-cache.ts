// Keep the complete projection without exceeding D1's single-value size limit.
export async function encodeSnapshot(value:unknown):Promise<string>{
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return 'gzip:'+btoa(binary);
}
export async function decodeSnapshot<T=any>(value:string):Promise<T>{
 if(!value.startsWith('gzip:'))return JSON.parse(value);
 const bytes=Uint8Array.from(atob(value.slice(5)),char=>char.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
