const path = require("node:path");
const { IncomingMessage, ServerResponse } = require("node:http");
const { publicRoot } = require("./config");

type JsonPayload = unknown;
export const maxJsonBodyBytes = 3 * 1024 * 1024;

export function routePrefix(urlPath: string): "/cloudprune" | "/cp" | null {
  if (urlPath === "/cloudprune" || urlPath.startsWith("/cloudprune/")) return "/cloudprune";
  if (urlPath === "/cp" || urlPath.startsWith("/cp/")) return "/cp";
  return null;
}

export function staticFilePathForUrlPath(urlPath: string): string | null {
  const prefix = routePrefix(urlPath);
  if (urlPath === "/" || urlPath === "/cloudprune" || urlPath === "/cloudprune/" || urlPath === "/cp" || urlPath === "/cp/") return path.join(publicRoot, "index.html");
  if (!prefix) return null;
  if ((urlPath === `${prefix}/resources` || urlPath.startsWith(`${prefix}/resources/`)) && !path.basename(urlPath).includes(".")) {
    const relativePath = urlPath === `${prefix}/resources` ? "resources" : urlPath.slice(`${prefix}/`.length);
    const filePath = path.resolve(publicRoot, relativePath, "index.html");
    return filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : null;
  }
  if (!path.basename(urlPath).includes(".")) return path.join(publicRoot, "index.html");

  const relativePath = urlPath.slice(`${prefix}/`.length);
  const filePath = path.resolve(publicRoot, relativePath);
  return filePath.startsWith(`${publicRoot}${path.sep}`) || filePath === publicRoot ? filePath : null;
}

export function json(res: InstanceType<typeof ServerResponse>, status: number, payload: JsonPayload): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

export function jsonb(value: JsonPayload): string {
  return JSON.stringify(value);
}

export async function readJson(req: InstanceType<typeof IncomingMessage>): Promise<unknown> {
  const chunks: Buffer[] = [];
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > maxJsonBodyBytes) throw new Error("Request body is too large.");
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxJsonBodyBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
