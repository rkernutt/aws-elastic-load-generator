// ─── Helpers ───────────────────────────────────────────────────────────────
export const REGIONS = [
  // US
  "us-east-1","us-east-2","us-west-1","us-west-2",
  // Canada
  "ca-central-1","ca-west-1",
  // South America
  "sa-east-1",
  // Europe
  "eu-west-1","eu-west-2","eu-west-3",
  "eu-central-1","eu-central-2",
  "eu-north-1","eu-south-1","eu-south-2",
  // Middle East & Africa
  "me-south-1","me-central-1","af-south-1","il-central-1",
  // Asia Pacific
  "ap-east-1","ap-south-1","ap-south-2",
  "ap-southeast-1","ap-southeast-2","ap-southeast-3","ap-southeast-4",
  "ap-northeast-1","ap-northeast-2","ap-northeast-3",
];
export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const randFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(3);
export const randId = (len = 8) => Math.random().toString(36).substring(2, 2 + len).toUpperCase();
export const randIp = () => `${randInt(1,254)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`;
export const randTs = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
export const PROTOCOLS = { 6:"TCP", 17:"UDP", 1:"ICMP" };
export const HTTP_METHODS = ["GET","POST","PUT","DELETE","PATCH"];
export const HTTP_PATHS = ["/api/v1/users","/api/v1/products","/api/v1/orders","/api/v1/auth/login","/api/v1/search","/health","/api/v2/events"];
export const USER_AGENTS = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)","curl/7.68.0","python-requests/2.27.1","Go-http-client/1.1"];

// ─── AWS Account Pool ───────────────────────────────────────────────────────
export const ACCOUNTS = [
  { id:"814726593401", name:"globex-production" },
  { id:"293847561023", name:"globex-staging" },
  { id:"738291046572", name:"globex-development" },
  { id:"501938274650", name:"globex-security-tooling" },
  { id:"164820739518", name:"globex-shared-services" },
];
export const randAccount = () => rand(ACCOUNTS);
export const randUUID = () => `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();

/**
 * Returns common per-document setup values used by every generator.
 * DRYs up the `region / acct / isErr` boilerplate across all 136 generators.
 * @param {number} er - Error rate in [0,1].
 * @returns {{ region: string, acct: {id:string,name:string}, isErr: boolean }}
 */
export function makeSetup(er) {
  return { region: rand(REGIONS), acct: randAccount(), isErr: Math.random() < er };
}

/** Recursively remove object keys whose value is null so output has no pointless null fields. */
export function stripNulls(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue;
    out[k] = stripNulls(v);
  }
  return out;
}
