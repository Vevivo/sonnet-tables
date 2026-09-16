/** Parsed payload duplicates the exact signed text; clients can derive it on demand. */
export function lobbyJson(snapshot: unknown) {
 return JSON.stringify(snapshot,(key,value)=>key === "payload" ? undefined : value);
}
