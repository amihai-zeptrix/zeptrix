const crypto = require("node:crypto");
const {
  cloudpruneOauthCookieDomain,
  googleClientId,
  tokenSecret,
} = require("./config");

interface UserRecord {
  id: string;
  account_id: string;
  name: string;
  email: string;
  company_name: string;
  role?: string;
}

interface PublicUserRecord {
  name: string;
  email: string;
  company_name: string;
  role?: string;
}

interface GoogleProfile {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  hd?: string;
}

interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  accountId: string;
  companyName: string;
  role?: string;
  exp: number;
}

interface GoogleRegistrationPayload {
  sub: string;
  email: string;
  name: string;
  companyName: string;
  exp: number;
}

interface OAuthStatePayload {
  prefix: "/cp" | "/cloudprune";
  nonce: string;
  exp: number;
}

function decodeJson<T>(body: string): T {
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

export function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

export function hashPassword(password: unknown, salt = crypto.randomBytes(16).toString("hex")): string {
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: unknown, stored: unknown): boolean {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function secureEqual(actual: unknown, expected: unknown): boolean {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function publicUser(user: PublicUserRecord): { name: string; email: string; companyName: string; role?: string } {
  return { name: user.name, email: user.email, companyName: user.company_name, ...(user.role ? { role: user.role } : {}) };
}

export function signSession(user: UserRecord): string {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    accountId: user.account_id,
    companyName: user.company_name,
    ...(user.role ? { role: user.role } : {}),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: unknown): SessionPayload | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = decodeJson<SessionPayload>(parts[0]);
  if (!payload.sub || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

export function bearerToken(req: { headers: { authorization?: string } }): string {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

export function signGoogleRegistration(profile: GoogleProfile): string {
  const email = normalizeEmail(profile.email);
  const payload = {
    sub: profile.sub,
    email,
    name: profile.name || email.split("@")[0],
    companyName: profile.hd || "",
    exp: Date.now() + 20 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleRegistration(token: unknown): GoogleRegistrationPayload | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = decodeJson<GoogleRegistrationPayload>(parts[0]);
  if (!payload.sub || !payload.email || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

export function validateGoogleProfile(profile: GoogleProfile): GoogleProfile {
  if (profile.aud !== googleClientId || !profile.email) throw new Error("Google identity is not valid for this client.");
  if (profile.email_verified !== true && profile.email_verified !== "true") throw new Error("Google email must be verified.");
  return profile;
}

export function cloudpruneOAuthState(prefix: "/cp" | "/cloudprune"): string {
  const body = Buffer.from(JSON.stringify({
    prefix,
    nonce: crypto.randomBytes(18).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `cloudprune.${body}.${sig}`;
}

export function verifyCloudpruneOAuthState(state: unknown): OAuthStatePayload | null {
  const parts = String(state || "").split(".");
  if (parts.length !== 3 || parts[0] !== "cloudprune") return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[1]).digest("base64url");
  if (!secureEqual(parts[2], expected)) return null;
  const payload = decodeJson<OAuthStatePayload>(parts[1]);
  if (payload.exp && Number(payload.exp) < Date.now()) return null;
  if (payload.prefix !== "/cp" && payload.prefix !== "/cloudprune") return null;
  return payload;
}

export function cookieValue(req: { headers: { cookie?: string } }, name: string): string | null {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .reduce((found, part) => {
      if (found !== null) return found;
      const index = part.indexOf("=");
      if (index < 0) return null;
      const key = part.slice(0, index);
      return key === name ? decodeURIComponent(part.slice(index + 1)) : null;
    }, null);
}

export function cloudpruneOAuthCookie(value: string, prefix: string, extra = ""): string {
  const domain = cloudpruneOauthCookieDomain ? `; Domain=${cloudpruneOauthCookieDomain}` : "";
  return `cloudprune_oauth_state=${value}; Path=${prefix}${domain}; HttpOnly; SameSite=Lax; Secure${extra}`;
}
