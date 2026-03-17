/**
 * Kibana Fleet API client.
 *
 * Usage:
 *   import createKibanaClient from './kibana.mjs';
 *   const client = createKibanaClient('https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243', '<apiKey>');
 */

const EPR_BASE_URL = 'https://epr.elastic.co';

/**
 * Creates a Kibana Fleet API client.
 *
 * @param {string} baseUrl - Kibana base URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243)
 * @param {string} apiKey  - Base64-encoded Elastic API key
 * @returns {object} Client with getInstalledPackage, installPackage, and getLatestVersion methods
 */
export default function createKibanaClient(baseUrl, apiKey) {
  // Normalise: strip trailing slash so path concatenation is consistent
  const base = baseUrl.replace(/\/$/, '');

  const commonHeaders = {
    'kbn-xsrf': 'true',
    Authorization: `ApiKey ${apiKey}`,
  };

  /**
   * Shared fetch helper. Throws a descriptive error for non-2xx responses.
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<any>} Parsed JSON body
   */
  async function apiFetch(url, options = {}) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(`Network error while reaching ${url}: ${networkErr.message}`);
    }

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch (_) {
        // ignore body read errors
      }
      const err = new Error(
        `HTTP ${response.status} ${response.statusText} — ${url}\n${body}`.trim(),
      );
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return response.json();
  }

  return {
    /**
     * Returns the installed package metadata for the given package name, or
     * null if the package is not found (404).
     *
     * @param {string} packageName - e.g. "aws"
     * @returns {Promise<object|null>}
     */
    async getInstalledPackage(packageName) {
      const url = `${base}/api/fleet/epm/packages/${encodeURIComponent(packageName)}`;
      try {
        return await apiFetch(url, {
          method: 'GET',
          headers: {
            'kbn-xsrf': 'true',
            Authorization: `ApiKey ${apiKey}`,
          },
        });
      } catch (err) {
        if (err.status === 404) {
          return null;
        }
        throw err;
      }
    },

    /**
     * Installs a specific version of a package via the Fleet EPM API.
     *
     * @param {string} packageName - e.g. "aws"
     * @param {string} version     - e.g. "2.33.0"
     * @returns {Promise<object>} Installation response JSON
     */
    async installPackage(packageName, version) {
      const url = `${base}/api/fleet/epm/packages/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
      return apiFetch(url, {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force: false }),
      });
    },

    /**
     * Queries the Elastic Package Registry to find the latest published version
     * of a package.
     *
     * @param {string} packageName - e.g. "aws"
     * @returns {Promise<string>} Version string, e.g. "2.33.0"
     */
    async getLatestVersion(packageName) {
      const url = `${EPR_BASE_URL}/search?package=${encodeURIComponent(packageName)}&kibana.version=8.0.0`;
      let results;
      try {
        results = await fetch(url);
      } catch (networkErr) {
        throw new Error(
          `Network error while reaching Elastic Package Registry: ${networkErr.message}`,
        );
      }

      if (!results.ok) {
        const body = await results.text().catch(() => '');
        throw new Error(
          `Failed to query Elastic Package Registry (HTTP ${results.status}): ${body}`.trim(),
        );
      }

      const data = await results.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
          `No packages found for "${packageName}" in the Elastic Package Registry.`,
        );
      }

      const version = data[0]?.version;
      if (!version) {
        throw new Error(
          `Could not parse version from Elastic Package Registry response for "${packageName}".`,
        );
      }

      return version;
    },
  };
}
