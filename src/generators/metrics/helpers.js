/**
 * Shared utilities for per-dimension CloudWatch metric document generation.
 * Each metric doc matches the shape produced by the Elastic AWS integration.
 */

export { REGIONS, ACCOUNTS, rand, randInt, randFloat, randId } from "../../helpers";
import { rand } from "../../helpers";

/**
 * Build a single CloudWatch metric document.
 *
 * @param {string}   ts         - ISO timestamp string
 * @param {string}   service    - metricset name / AWS service key (e.g. "lambda")
 * @param {string}   dataset    - data_stream.dataset  (e.g. "aws.lambda")
 * @param {string}   region     - AWS region
 * @param {Object}   account    - { id, name }
 * @param {Object}   dimensions - CloudWatch dimension key/value pairs
 * @param {Object}   metrics    - metric name → { avg, sum, count, max, min } (omit unused stats)
 * @param {number}   period     - collection period ms (default 60 000)
 * @returns {Object}
 */
export function metricDoc(
  ts,
  service,
  dataset,
  region,
  account,
  dimensions,
  metrics,
  period = 60_000
) {
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
    },
    aws: {
      [service]: {
        metrics: metrics,
        dimensions: dimensions,
      },
    },
    metricset: { name: service, period: period },
    data_stream: { type: "metrics", dataset: dataset, namespace: "default" },
    event: { dataset: dataset, module: "aws" },
  };
}

/** Pick n unique items from arr (or all if n >= arr.length). */
export function sample(arr, n) {
  const copy = [...arr].sort(() => Math.random() - 0.5);
  return copy.slice(0, Math.min(n, copy.length));
}

/** Gaussian-ish float: center ± spread, clamped to [min, max]. */
export function jitter(center, spread, min = 0, max = Infinity) {
  const v = center + (Math.random() - 0.5) * 2 * spread;
  return Math.max(min, Math.min(max, v));
}

/** Round to dp decimal places. */
export function dp(v, places = 2) {
  return parseFloat(v.toFixed(places));
}

/** Metric stat object with avg, sum, count (and optional max/min). */
export function stat(avg, { sum, count = 1, max, min } = {}) {
  const s = { avg: dp(avg), sum: dp(sum ?? avg), count };
  if (max !== undefined) s.max = dp(max);
  if (min !== undefined) s.min = dp(min);
  return s;
}

/** Simple counter stat (avg = sum = value, count = 1). */
export function counter(value) {
  return stat(value, { sum: value });
}

/** Pick a random region+account pair (same for all docs in one generator call). */
export function pickCloudContext(REGIONS, ACCOUNTS) {
  return { region: rand(REGIONS), account: rand(ACCOUNTS) };
}
