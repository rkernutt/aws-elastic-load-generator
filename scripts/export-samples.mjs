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

const {
  GENERATORS,
  METRICS_SUPPORTED_SERVICE_IDS,
  ELASTIC_METRICS_DATASET_MAP,
  ELASTIC_DATASET_MAP,
} = await import("../src/App.jsx");

fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(metricsDir, { recursive: true });

let logCount = 0;
let metricsCount = 0;
for (const [id, fn] of Object.entries(GENERATORS)) {
  const doc = stripNulls(fn(ts, errorRate));

  fs.writeFileSync(
    path.join(logsDir, `${id}.json`),
    JSON.stringify(doc, null, 2),
    "utf8"
  );
  logCount++;

  if (METRICS_SUPPORTED_SERVICE_IDS.has(id)) {
    const dataset =
      ELASTIC_METRICS_DATASET_MAP[id] ?? ELASTIC_DATASET_MAP[id] ?? `aws.${id}`;
    const metricsDoc = {
      ...doc,
      data_stream: { type: "metrics", dataset, namespace: "default" },
      metricset: { name: "cloudwatch", period: 300000 },
    };
    fs.writeFileSync(
      path.join(metricsDir, `${id}.json`),
      JSON.stringify(metricsDoc, null, 2),
      "utf8"
    );
    metricsCount++;
  }
}

console.log(
  `Wrote ${logCount} sample log(s) to samples/logs/ and ${metricsCount} sample metric(s) to samples/metrics/`
);
