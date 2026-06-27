const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const port = Number(process.env.PORT || 4321);
const root = __dirname;
const publicRoot = path.join(root, "cloudprune");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function staticFilePathForUrlPath(urlPath) {
  if (urlPath === "/" || urlPath === "/cloudprune" || urlPath === "/cloudprune/") return path.join(publicRoot, "index.html");
  if (/^\/cloudprune\/[^/.]+\/?$/.test(urlPath)) return path.join(publicRoot, "index.html");
  if (!urlPath.startsWith("/cloudprune/")) return null;

  const relativePath = urlPath.slice("/cloudprune/".length);
  const filePath = path.resolve(publicRoot, relativePath);
  return filePath.startsWith(`${publicRoot}${path.sep}`) || filePath === publicRoot ? filePath : null;
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  let urlPath;
  try {
    urlPath = decodeURIComponent(requestUrl.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (urlPath === "/cloudprune") {
    res.writeHead(301, { location: "/cloudprune/" });
    res.end();
    return;
  }

  let filePath = staticFilePathForUrlPath(urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const ext = path.extname(filePath);
    const headers = {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": urlPath === "/cloudprune/" || urlPath.startsWith("/cloudprune/") ? "no-store" : "public, max-age=300",
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(serveStatic);

if (require.main === module) {
  server.listen(port, () => {
    console.log(`CloudPrune listening on http://localhost:${port}/cloudprune/`);
  });
}

module.exports = { server, staticFilePathForUrlPath };
