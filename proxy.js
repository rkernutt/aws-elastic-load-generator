const http = require("http");
const https = require("https");

const PORT = 3001;

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  const targetUrl = req.headers["x-elastic-url"];
  const apiKey   = req.headers["x-elastic-key"];

  if (!targetUrl || !apiKey) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Missing x-elastic-url or x-elastic-key header" }));
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Invalid x-elastic-url: " + e.message }));
    return;
  }

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
    path:     "/_bulk",
    method:   "POST",
    headers: {
      "Content-Type":  "application/x-ndjson",
      "Authorization": `ApiKey ${apiKey}`,
    },
  };

  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    options.headers["Content-Length"] = body.length;

    const transport = parsed.protocol === "https:" ? https : http;
    const proxyReq = transport.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      proxyRes.pipe(res);
    });

    proxyReq.on("error", err => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: "Proxy error: " + err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`Elastic proxy listening on port ${PORT}`);
});
