export function configuredOrigins(value: string | undefined): string[] {
 return (value ?? "").split(",").map(v => v.trim()).filter(v => {
  try { const u = new URL(v); return u.origin === v && (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))); } catch { return false; }
 });
}

export function relayHeaders(req: Request, allowedOrigins: readonly string[] = []): Headers | null {
  const origin = req.headers.get("origin");
  if (!origin || (origin !== new URL(req.url).origin && !allowedOrigins.includes(origin))) return null;
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
}

export function relayPreflight(req: Request, allowedOrigins: readonly string[] = []): Response {
  const headers = relayHeaders(req, allowedOrigins);
  const requestedHeaders = (req.headers.get("access-control-request-headers") || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
  if (!headers || req.headers.get("access-control-request-method") !== "POST" || requestedHeaders.some(value => value !== "content-type")) {
    return new Response(null, {status: 403, headers: {"Cache-Control": "no-store", "Vary": "Origin"}});
  }
  return new Response(null, {status: 204, headers});
}
