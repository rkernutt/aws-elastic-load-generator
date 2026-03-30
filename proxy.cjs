const http = require("http");
const https = require("https");

const PORT = process.env.PROXY_PORT || 3001;

/** Request timeout in ms (e.g. 120s for large bulk requests). */
const REQUEST_TIMEOUT_MS = Number(process.env.PROXY_REQUEST_TIMEOUT_MS) || 120000;

/** Max retries for transient failures (5xx, ECONNRESET, timeouts). */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff. */
const BACKOFF_BASE_MS = 1000;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function proxyRequest(transport, options, body, retryCount, res) {
  const req = transport.request(options, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const data = Buffer.concat(chunks);
      const ok = proxyRes.statusCode >= 200 && proxyRes.statusCode < 300;
      const retryable = proxyRes.statusCode >= 500 && retryCount < MAX_RETRIES;
      if (ok) {
        res.writeHead(proxyRes.statusCode, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(data);
        return;
      }
      if (retryable) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
        setTimeout(() => {
          proxyRequest(transport, options, body, retryCount + 1, res);
        }, delay);
        return;
      }
      res.writeHead(proxyRes.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    });
  });

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy();
    if (retryCount < MAX_RETRIES) {
      const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
      setTimeout(() => {
        proxyRequest(transport, options, body, retryCount + 1, res);
      }, delay);
    } else {
      sendJson(res, 504, { error: "Proxy request timeout after " + (REQUEST_TIMEOUT_MS / 1000) + "s" });
    }
  });

  req.on("error", (err) => {
    const retryable = (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") && retryCount < MAX_RETRIES;
    if (retryable) {
      const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
      setTimeout(() => {
        proxyRequest(transport, options, body, retryCount + 1, res);
      }, delay);
    } else {
      sendJson(res, 502, { error: "Proxy error: " + err.message });
    }
  });

  req.write(body);
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  const targetUrl = req.headers["x-elastic-url"];
  const apiKey = req.headers["x-elastic-key"];

  if (!targetUrl || !apiKey) {
    sendJson(res, 400, { error: "Missing x-elastic-url or x-elastic-key header" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    sendJson(res, 400, { error: "Invalid x-elastic-url: " + e.message });
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: "/_bulk",
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Length": body.length,
        "Authorization": "ApiKey " + apiKey,
      },
    };

    const transport = parsed.protocol === "https:" ? https : http;
    proxyRequest(transport, options, body, 0, res);
  });
});

server.listen(PORT, () => {
  console.log("Elastic proxy listening on port " + PORT + " (timeout " + REQUEST_TIMEOUT_MS + "ms, max retries " + MAX_RETRIES + ")");
});
