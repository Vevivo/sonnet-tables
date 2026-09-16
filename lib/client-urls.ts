// The ArNS build supplies these constants; the hosted app uses its own origin.
declare const __SONNET_API_BASE__: string | undefined;
declare const __SONNET_ASSET_BASE__: string | undefined;

export function apiUrl(path: string) {
  return (typeof __SONNET_API_BASE__ === "string" ? __SONNET_API_BASE__ : "") + path;
}

export function assetUrl(path: string) {
  return (typeof __SONNET_ASSET_BASE__ === "string" ? __SONNET_ASSET_BASE__ : "") + path;
}
