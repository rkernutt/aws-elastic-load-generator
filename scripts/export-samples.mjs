/**
 * Export one sample log per service to samples/logs/, and one sample metrics doc
 * per metrics-supported service to samples/metrics/. Run: npm run samples
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const logsDir = path.join(rootDir, "samples", "logs");
const metricsDir = path.join(rootDir, "samples", "metrics");

const ts = new Date().toISOString();
const errorRate = 0.1;

function stripNulls(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v != null) out[k] = stripNulls(v);
  return out;
}

const { GENERATORS } = await import("../src/generators/index.js");
const { METRICS_GENERATORS } = await import("../src/generators/metrics/index.js");

fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(metricsDir, { recursive: true });

// ── Log samples ───────────────────────────────────────────────────────────────
let logCount = 0;
for (const [id, fn] of Object.entries(GENERATORS)) {
  const result = fn(ts, errorRate);
  // Chain generators return arrays — write first doc; strip __dataset routing key
  const raw = Array.isArray(result) ? result[0] : result;
  const { __dataset, ...doc } = stripNulls(raw);
  fs.writeFileSync(
    path.join(logsDir, `${id}.json`),
    JSON.stringify(doc, null, 2),
    "utf8"
  );
  logCount++;
}

// ── Metrics samples — use dimensional generators for true CloudWatch shape ────
let metricsCount = 0;
for (const [id, fn] of Object.entries(METRICS_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const doc  = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  fs.writeFileSync(
    path.join(metricsDir, `${id}.json`),
    JSON.stringify(doc, null, 2),
    "utf8"
  );
  metricsCount++;
}

console.log(
  `Wrote ${logCount} sample log(s) to samples/logs/ and ${metricsCount} sample metric(s) to samples/metrics/`
);
