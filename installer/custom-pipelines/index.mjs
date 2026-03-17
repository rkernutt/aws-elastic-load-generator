#!/usr/bin/env node
/**
 * AWS → Elastic Custom Pipeline Installer
 *
 * Interactive CLI that installs Elasticsearch ingest pipelines for AWS services
 * not covered by the official Elastic AWS integration.
 *
 * Run with:  node index.mjs
 *
 * No external dependencies — uses Node.js built-ins only.
 */

import readline from "readline";
import { createElasticClient } from "./elastic.mjs";
import { getPipelinesByGroup, getGroups } from "./pipelines/index.mjs";

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
  console.log("║     AWS → Elastic Custom Pipeline Installer          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log(
    "Installs Elasticsearch ingest pipelines for AWS services not"
  );
  console.log("covered by the official Elastic AWS integration.");
  console.log("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createReadline();

  // 1. Elasticsearch URL
  const esUrl = await prompt(
    rl,
    "Elasticsearch URL (e.g. https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243):\n> "
  );

  if (!esUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  // 2. API Key
  const apiKey = await prompt(rl, "\nElastic API Key:\n> ");

  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  // 3. Test connection
  console.log("\nTesting connection...");
  const client = createElasticClient(esUrl, apiKey);

  let clusterInfo;
  try {
    clusterInfo = await client.testConnection();
    const clusterName = clusterInfo?.cluster_name ?? "(unknown)";
    const version = clusterInfo?.version?.number ?? "";
    console.log(
      `  Connected to cluster: ${clusterName}${version ? ` (${version})` : ""}`
    );
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 4. Group selection menu
  const groups = getGroups();
  console.log("\nAvailable pipeline groups:");
  console.log("");

  groups.forEach((group, i) => {
    const pipelines = getPipelinesByGroup(group);
    console.log(`  ${i + 1}. ${group}  (${pipelines.length} pipeline${pipelines.length !== 1 ? "s" : ""})`);
  });
  const allIndex = groups.length + 1;
  console.log(`  ${allIndex}. all  (install every group)`);
  console.log("");

  const selectionInput = await prompt(
    rl,
    `Enter number(s) comma-separated, or "all":\n> `
  );

  rl.close();

  // Parse selection
  let selectedPipelines = [];

  if (selectionInput.toLowerCase() === "all") {
    selectedPipelines = getPipelinesByGroup("all");
  } else {
    const tokens = selectionInput.split(",").map((s) => s.trim()).filter(Boolean);
    const selectedGroups = new Set();

    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIndex) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIndex) {
        selectedPipelines = getPipelinesByGroup("all");
        selectedGroups.clear();
        break;
      }
      const group = groups[num - 1];
      if (!selectedGroups.has(group)) {
        selectedGroups.add(group);
        selectedPipelines.push(...getPipelinesByGroup(group));
      }
    }
  }

  if (selectedPipelines.length === 0) {
    console.log("\nNo pipelines selected. Exiting.");
    process.exit(0);
  }

  // 5. Install pipelines
  console.log(`\nInstalling ${selectedPipelines.length} pipeline(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const pipeline of selectedPipelines) {
    const { id, processors, description } = pipeline;

    try {
      const existing = await client.getPipeline(id);

      if (existing !== null) {
        console.log(`  ✓ ${id} — already installed, skipping`);
        skippedCount++;
        continue;
      }

      await client.putPipeline(id, {
        description,
        processors,
      });

      console.log(`  ✓ ${id} — installed`);
      installedCount++;
    } catch (err) {
      console.error(`  ✗ ${id} — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  // 6. Summary
  const total = selectedPipelines.length;
  console.log("");
  console.log(
    `Installed ${installedCount} / ${total} pipelines.` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
