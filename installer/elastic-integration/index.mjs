#!/usr/bin/env node
/**
 * AWS → Elastic Integration Installer
 *
 * Installs the Elastic AWS integration package via the Kibana Fleet API.
 *
 * Run with:
 *   node index.mjs
 *
 * Requirements:
 *   - Node.js 18+ (uses native fetch and readline/promises)
 *   - A running Kibana instance reachable over HTTPS
 *   - A valid Elastic API key (base64-encoded, created in Kibana →
 *     Stack Management → API Keys)
 */

import readline from 'readline';
import process from 'process';
import createKibanaClient from './kibana.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a readline interface bound to stdin/stdout and returns a simple
 * `prompt(question)` helper that resolves with the trimmed answer.
 */
function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (question) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });

  const close = () => rl.close();

  return { prompt, close };
}

/**
 * Validates a Kibana base URL.
 * Must be a well-formed URL that starts with https://.
 *
 * @param {string} raw
 * @returns {{ valid: boolean, message?: string }}
 */
function validateKibanaUrl(raw) {
  if (!raw) {
    return { valid: false, message: 'Kibana URL must not be empty.' };
  }
  if (!raw.startsWith('https://')) {
    return { valid: false, message: 'Kibana URL must start with https://.' };
  }
  try {
    new URL(raw);
  } catch (_) {
    return { valid: false, message: `"${raw}" is not a valid URL.` };
  }
  return { valid: true };
}

/**
 * Validates an Elastic API key.
 *
 * @param {string} raw
 * @returns {{ valid: boolean, message?: string }}
 */
function validateApiKey(raw) {
  if (!raw) {
    return { valid: false, message: 'API key must not be empty.' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   AWS → Elastic Integration Installer        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const { prompt, close } = createPrompter();

  let kibanaUrl;
  let apiKey;

  // -- Prompt for Kibana URL -------------------------------------------------
  try {
    while (true) {
      const raw = await prompt(
        'Kibana URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243): ',
      );
      const { valid, message } = validateKibanaUrl(raw);
      if (valid) {
        kibanaUrl = raw.replace(/\/$/, '');
        break;
      }
      console.error(`  ✗ ${message}`);
    }

    // -- Prompt for API key --------------------------------------------------
    while (true) {
      const raw = await prompt(
        'Elastic API key (base64-encoded, from Kibana → Stack Management → API Keys): ',
      );
      const { valid, message } = validateApiKey(raw);
      if (valid) {
        apiKey = raw;
        break;
      }
      console.error(`  ✗ ${message}`);
    }
  } finally {
    // Always close readline so stdin doesn't keep the process alive if we
    // need to exit early due to a validation loop break.
    close();
  }

  console.log('');

  // -- Build client ----------------------------------------------------------
  const client = createKibanaClient(kibanaUrl, apiKey);

  // -- Check if already installed -------------------------------------------
  let installed = null;
  try {
    console.log('Checking whether the AWS integration is already installed...');
    installed = await client.getInstalledPackage('aws');
  } catch (err) {
    console.error(`✗ Failed to query Kibana: ${err.message}`);
    process.exit(1);
  }

  if (installed && installed.item?.status === 'installed') {
    const version = installed.item?.version ?? 'unknown';
    console.log(`✓ AWS integration already installed (v${version}) — skipping.`);
    console.log('');
    console.log('Done.');
    process.exit(0);
  }

  // -- Resolve latest version -----------------------------------------------
  let latestVersion;
  try {
    console.log('Fetching latest AWS integration version from Elastic Package Registry...');
    latestVersion = await client.getLatestVersion('aws');
  } catch (err) {
    console.error(`✗ Could not determine latest package version: ${err.message}`);
    process.exit(1);
  }

  // -- Install ---------------------------------------------------------------
  try {
    console.log(`Installing AWS integration v${latestVersion}...`);
    await client.installPackage('aws', latestVersion);
  } catch (err) {
    console.error(`✗ Installation failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`✓ AWS integration installed successfully (v${latestVersion})`);
  console.log('  Index templates, ILM policies, and dashboards are now available in Kibana.');
  console.log('');
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`✗ Unexpected error: ${err.message}`);
  process.exit(1);
});
