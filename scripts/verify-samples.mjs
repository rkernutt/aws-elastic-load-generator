/**
 * Fail if samples/logs|metrics|traces are missing files for any registered generator.
 * Run: npm run samples:verify
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function idsInDir(relDir, ext = ".json") {
  const dir = path.join(rootDir, relDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length));
}

function assertMatch(name, expectedKeys, actualIds, samplesDir) {
  const actual = new Set(actualIds);
  const missing = expectedKeys.filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expectedKeys.includes(k));
  if (missing.length || extra.length) {
    console.error(`\n[samples:verify] ${name} mismatch under ${samplesDir}/`);
    if (missing.length) console.error("  Missing files:", missing.join(", "));
    if (extra.length) console.error("  Unexpected files:", extra.join(", "));
    process.exit(1);
  }
}

const { GENERATORS } = await import("../src/generators/index.ts");
const { METRICS_GENERATORS } = await import("../src/generators/metrics/index.ts");
const { TRACE_GENERATORS } = await import("../src/generators/traces/index.ts");

const logKeys = Object.keys(GENERATORS).sort();
const metricKeys = Object.keys(METRICS_GENERATORS).sort();
const traceKeys = Object.keys(TRACE_GENERATORS).sort();

assertMatch("logs", logKeys, idsInDir("samples/logs"), "samples/logs");
assertMatch("metrics", metricKeys, idsInDir("samples/metrics"), "samples/metrics");
assertMatch("traces", traceKeys, idsInDir("samples/traces"), "samples/traces");

console.log(
  `samples:verify OK — logs: ${logKeys.length}, metrics: ${metricKeys.length}, traces: ${traceKeys.length}`
);
