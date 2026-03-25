#!/usr/bin/env node
/**
 * AWS → Elastic ML Anomaly Detection Jobs Installer
 *
 * Interactive CLI that installs Elasticsearch ML anomaly detection jobs
 * for AWS services not covered by the official Elastic AWS integration.
 *
 * Run with:  node installer/custom-ml-jobs/index.mjs
 *            or: npm run setup:ml-jobs
 *
 * No external dependencies — uses Node.js built-ins only (Node 18+).
 */

import readline from "readline";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printHeader() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     AWS → Elastic ML Anomaly Detection Installer     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs Elasticsearch ML anomaly detection jobs for AWS services.");
  console.log("Requires an API key with the `manage_ml` cluster privilege.");
  console.log("");
}

// ─── Deployment type ─────────────────────────────────────────────────────────

const DEPLOYMENT_TYPES = [
  { id: "self-managed", label: "Self-Managed  (on-premises, Docker, VM)" },
  { id: "cloud-hosted", label: "Elastic Cloud Hosted  (cloud.elastic.co)" },
  { id: "serverless",   label: "Elastic Serverless  (cloud.elastic.co/serverless)" },
];

async function promptDeploymentType(rl) {
  console.log("Select your Elastic deployment type:");
  console.log("");
  DEPLOYMENT_TYPES.forEach(({ label }, i) => console.log(`  ${i + 1}. ${label}`));
  console.log("");

  while (true) {
    const input = await prompt(rl, "Enter 1, 2, or 3:\n> ");
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < DEPLOYMENT_TYPES.length) return DEPLOYMENT_TYPES[idx].id;
    console.error("  Please enter 1, 2, or 3.");
  }
}

function getUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:9200  or  https://elasticsearch.yourdomain.internal:9200";
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
}

async function maybeSkipTls(rl, deploymentType) {
  if (deploymentType !== "self-managed") return;

  const answer = await prompt(
    rl,
    "Skip TLS certificate verification? Required for self-signed / internal CA certs. (y/N):\n> "
  );
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.log("  ⚠  TLS verification disabled — ensure you trust this endpoint.");
  }
  console.log("");
}

// ─── Elasticsearch client ─────────────────────────────────────────────────────

function createElasticClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `ApiKey ${apiKey}`,
  };

  async function request(method, path, body) {
    const url = `${base}${path}`;
    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (res.status === 404) {
      return null;
    }

    if (res.status === 410) {
      return { _not_available: true, status: 410 };
    }

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response body)";
      }
      throw new Error(
        `Elasticsearch request failed: ${method} ${path} → HTTP ${res.status}\n${text}`
      );
    }

    return res.json();
  }

  return {
    /** GET / — verify connectivity, returns cluster info */
    async testConnection() {
      return request("GET", "/");
    },

    /** GET /_ml/info — verify ML is available */
    async getMlInfo() {
      return request("GET", "/_ml/info");
    },

    /** GET /_ml/anomaly_detectors/{jobId} — returns job or null if not found */
    async getJob(jobId) {
      return request("GET", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}`);
    },

    /** PUT /_ml/anomaly_detectors/{jobId} — create ML job */
    async putJob(jobId, body) {
      return request("PUT", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}`, body);
    },

    /** PUT /_ml/datafeeds/datafeed-{jobId} — create datafeed */
    async putDatafeed(jobId, body) {
      return request("PUT", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}`, body);
    },

    /** POST /_ml/anomaly_detectors/{jobId}/_open — open job */
    async openJob(jobId) {
      return request("POST", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}/_open`);
    },

    /** POST /_ml/datafeeds/datafeed-{jobId}/_start — start datafeed */
    async startDatafeed(jobId) {
      return request("POST", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}/_start`);
    },
  };
}

// ─── Job definitions loader ───────────────────────────────────────────────────

function loadJobGroups() {
  const jobsDir = join(__dirname, "jobs");
  const files = readdirSync(jobsDir).filter((f) => f.endsWith("-jobs.json"));

  if (files.length === 0) {
    throw new Error(`No *-jobs.json files found in ${jobsDir}`);
  }

  const groups = [];

  for (const file of files.sort()) {
    const raw = readFileSync(join(jobsDir, file), "utf8");
    const parsed = JSON.parse(raw);
    groups.push({
      name: parsed.group,
      description: parsed.description,
      jobs: parsed.jobs,
    });
  }

  return groups;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createReadline();

  // 1. Deployment type
  const deploymentType = await promptDeploymentType(rl);
  console.log("");

  // 2. TLS (self-managed only)
  await maybeSkipTls(rl, deploymentType);

  // 3. Elasticsearch URL
  const esUrl = await prompt(
    rl,
    `Elasticsearch URL (e.g. ${getUrlExample(deploymentType)}):\n> `
  );

  if (!esUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  if (deploymentType === "self-managed") {
    if (!esUrl.startsWith("http://") && !esUrl.startsWith("https://")) {
      console.error("URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else {
    if (!esUrl.startsWith("https://")) {
      console.error("URL must start with https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  }

  // 4. API Key
  const apiKey = await prompt(
    rl,
    "\nElastic API Key (requires `manage_ml` privilege):\n> "
  );

  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const client = createElasticClient(esUrl, apiKey);

  // 5. Test connection
  console.log("\nTesting connection...");
  let isServerless = false;
  try {
    const clusterInfo = await client.testConnection();
    const clusterName = clusterInfo?.cluster_name ?? "(unknown)";
    const version = clusterInfo?.version?.number ?? "";
    isServerless = clusterInfo?.version?.build_flavor === "serverless";
    console.log(
      `  Connected to cluster: ${clusterName}${version ? ` (${version})` : ""}${isServerless ? " [serverless]" : ""}`
    );
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 6. Check ML is available
  if (isServerless) {
    console.log("  Serverless deployment detected — skipping /_ml/info check.");
    console.log("  Note: ML anomaly detection is available on Security and Observability");
    console.log("  serverless projects. Elasticsearch serverless projects do not support it.");
    console.log("  Proceeding — any unsupported jobs will report an error during installation.");
  } else {
    console.log("  Checking ML availability...");
    try {
      const mlInfo = await client.getMlInfo();
      if (mlInfo === null || mlInfo?._not_available) {
        console.error(
          "  ML is not available on this cluster.\n" +
          "  ML anomaly detection requires a Platinum or Enterprise licence on Elastic Stack,\n" +
          "  or an Elastic Cloud / Serverless Security or Observability project with ML enabled."
        );
        rl.close();
        process.exit(1);
      }
      console.log("  ML is available.");
    } catch (err) {
      console.error(
        `  ML availability check failed: ${err.message}\n` +
        "  Ensure your API key has the `manage_ml` cluster privilege."
      );
      rl.close();
      process.exit(1);
    }
  }

  // 7. Load job groups
  let groups;
  try {
    groups = loadJobGroups();
  } catch (err) {
    console.error(`\nFailed to load job definitions: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  if (groups.length === 0) {
    console.error("\nNo job groups loaded. Exiting.");
    rl.close();
    process.exit(1);
  }

  // 8. Group selection menu
  console.log("\nAvailable job groups:\n");

  groups.forEach((group, i) => {
    const count = group.jobs.length;
    const pad = String(i + 1).padStart(2, " ");
    console.log(
      `  ${pad}. ${group.name.padEnd(12)}(${count} job${count !== 1 ? "s" : ""})  — ${group.description}`
    );
  });

  const allIndex = groups.length + 1;
  console.log(`  ${String(allIndex).padStart(2, " ")}. all          (install every group)`);
  console.log("");

  const selectionInput = await prompt(
    rl,
    `Enter number(s) comma-separated, or "all":\n> `
  );

  rl.close();

  // Parse selection
  let selectedJobs = [];

  if (selectionInput.toLowerCase() === "all" || selectionInput === String(allIndex)) {
    selectedJobs = groups.flatMap((g) => g.jobs);
  } else {
    const tokens = selectionInput.split(",").map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    let expandedAll = false;

    for (const token of tokens) {
      if (expandedAll) break;

      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIndex) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIndex) {
        selectedJobs = groups.flatMap((g) => g.jobs);
        expandedAll = true;
        break;
      }
      const group = groups[num - 1];
      if (!seen.has(group.name)) {
        seen.add(group.name);
        selectedJobs.push(...group.jobs);
      }
    }
  }

  if (selectedJobs.length === 0) {
    console.log("\nNo jobs selected. Exiting.");
    process.exit(0);
  }

  // 9. Install jobs
  console.log(`\nInstalling ${selectedJobs.length} job(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const newlyInstalled = [];

  for (const jobDef of selectedJobs) {
    const { id, job: jobConfig, datafeed: datafeedConfig } = jobDef;

    try {
      const existing = await client.getJob(id);

      if (existing !== null) {
        console.log(`  ✓ ${id} — already installed, skipping`);
        skippedCount++;
        continue;
      }

      // Create job (body must NOT include job_id — it's in the URL)
      await client.putJob(id, jobConfig);

      // Create datafeed (body must NOT include datafeed_id; add job_id)
      await client.putDatafeed(id, { ...datafeedConfig, job_id: id });

      console.log(`  ✓ ${id} — installed`);
      installedCount++;
      newlyInstalled.push(id);
    } catch (err) {
      console.error(`  ✗ ${id} — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  // 10. Summary
  const total = selectedJobs.length;
  console.log("");
  console.log(
    `Installed ${installedCount} / ${total} job(s).` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );

  // 11. Offer to open jobs and start datafeeds
  if (newlyInstalled.length > 0) {
    console.log("");
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const openAnswer = await new Promise((resolve) => {
      rl2.question(
        "Open jobs and start datafeeds? This begins ML analysis. (y/N):\n> ",
        (a) => {
          rl2.close();
          resolve(a.trim().toLowerCase());
        }
      );
    });

    if (openAnswer === "y" || openAnswer === "yes") {
      console.log("");
      for (const id of newlyInstalled) {
        try {
          process.stdout.write(`  Opening ${id}...`);
          await client.openJob(id);
          process.stdout.write(" opened. Starting datafeed...");
          await client.startDatafeed(id);
          console.log(" started.");
        } catch (err) {
          console.log(` FAILED: ${err.message}`);
        }
      }
    } else {
      console.log(
        "\nJobs installed but not started. To start them later, go to:\n" +
        "  Kibana → Machine Learning → Anomaly Detection → Jobs → Start datafeed"
      );
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
