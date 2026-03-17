/**
 * Input validation for Elastic Cloud connection form fields.
 * @module utils/validation
 */

/** Regex for valid Elasticsearch/Elastic Cloud URL (https, optional port, no path beyond trailing slash). */
const ELASTIC_URL_REGEX = /^https:\/\/[a-zA-Z0-9][-a-zA-Z0-9.]*(\.[a-zA-Z]{2,})?(\.[a-zA-Z0-9][-a-zA-Z0-9.]*)*(:\d{1,5})?\/?$/;

/** Min length for API key (base64). */
const API_KEY_MIN_LENGTH = 20;

/** Index prefix: alphanumeric, hyphens, underscores only; 1–80 chars. */
const INDEX_PREFIX_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

/**
 * Validates Elasticsearch / Elastic Cloud URL.
 * @param {string} value - URL string
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateElasticUrl(value) {
  if (!value || typeof value !== "string") {
    return { valid: false, message: "Elasticsearch URL is required." };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: "Elasticsearch URL is required." };
  }
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "https:") {
      return { valid: false, message: "URL must use HTTPS." };
    }
    if (!u.hostname || u.hostname.length < 4) {
      return { valid: false, message: "Invalid hostname." };
    }
    // Elastic Cloud URLs have a dot in the hostname (e.g. .es.us-east-1.aws.elastic.cloud)
    if (!u.hostname.includes(".")) {
      return { valid: false, message: "Enter a valid Elasticsearch URL (hostname should contain a domain)." };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Enter a valid URL (e.g. https://my-deployment.es.us-east-1.aws.elastic.cloud)." };
  }
}

/**
 * Validates Elastic API key (base64-like, minimum length).
 * @param {string} value - API key string
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateApiKey(value) {
  if (value == null) {
    return { valid: false, message: "API key is required." };
  }
  const s = String(value).trim();
  if (!s) {
    return { valid: false, message: "API key is required." };
  }
  if (s.length < API_KEY_MIN_LENGTH) {
    return { valid: false, message: "API key is too short (check it’s the full base64 key)." };
  }
  // Base64 alphabet (with padding)
  if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) {
    return { valid: false, message: "API key contains invalid characters." };
  }
  return { valid: true };
}

/**
 * Validates index prefix (data stream / index name prefix).
 * @param {string} value - Index prefix
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateIndexPrefix(value) {
  if (value == null) {
    return { valid: false, message: "Index prefix is required." };
  }
  const s = String(value).trim();
  if (!s) {
    return { valid: false, message: "Index prefix is required." };
  }
  if (!INDEX_PREFIX_REGEX.test(s)) {
    return { valid: false, message: "Use only letters, numbers, hyphens, and underscores (1–80 characters)." };
  }
  if (/^[-_]|[-_]$/.test(s)) {
    return { valid: false, message: "Index prefix cannot start or end with a hyphen or underscore." };
  }
  return { valid: true };
}
