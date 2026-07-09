export const clients = [
  { client: "default", name: "默认" },
  { client: "clash", name: "Clash" },
  { client: "mihomo", name: "Mihomo" },
  { client: "clashmetaforandroid", name: "Clash Meta for Android" },
  { client: "clashverge", name: "Clash Verge" },
  { client: "shadowrocket", name: "Shadowrocket" },
  { client: "singbox", name: "SingBox" },
  { client: "surge", name: "Surge" },
  { client: "loon", name: "Loon" },
  { client: "stash", name: "Stash" },
  { client: "quantumultx", name: "Quantumult X" },
  { client: "egern", name: "Egern" },
  { client: "v2ray", name: "V2Ray" }
] as const;

export const userVisibleClients = clients.filter((item) => item.client !== "default" && item.client !== "v2ray");

export function clientName(client: string) {
  return clients.find((item) => item.client === client)?.name ?? client;
}

export function normalizeClient(client?: string) {
  return client?.trim().toLowerCase() || "default";
}

export function detectClientFromUserAgent(userAgent?: string) {
  const ua = userAgent?.toLowerCase() ?? "";
  if (!ua) return undefined;

  const compact = ua.replace(/[\s._-]+/g, "");
  if (compact.includes("quantumultx")) return "quantumultx";
  if (compact.includes("clashmetaforandroid")) return "clashmetaforandroid";
  if (compact.includes("clashverge")) return "clashverge";
  if (compact.includes("shadowrocket")) return "shadowrocket";
  if (compact.includes("singbox")) return "singbox";
  if (compact.includes("mihomo")) return "mihomo";
  if (compact.includes("clashmeta")) return "clash";
  if (compact.includes("clash")) return "clash";
  if (compact.includes("surge")) return "surge";
  if (compact.includes("loon")) return "loon";
  if (compact.includes("stash")) return "stash";
  if (compact.includes("egern")) return "egern";
  if (compact.includes("v2ray")) return "v2ray";

  return undefined;
}
