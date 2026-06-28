const crypto = require("node:crypto");
const {
  cloudpruneOauthCookieDomain,
  googleClientId,
  tokenSecret,
} = require("./config");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(user) {
  return { name: user.name, email: user.email, companyName: user.company_name };
}

function signSession(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    accountId: user.account_id,
    companyName: user.company_name,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!payload.sub || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

function bearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function signGoogleRegistration(profile) {
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

function verifyGoogleRegistration(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[0]).digest("base64url");
  if (!secureEqual(parts[1], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!payload.sub || !payload.email || (payload.exp && Number(payload.exp) < Date.now())) return null;
  return payload;
}

function validateGoogleProfile(profile) {
  if (profile.aud !== googleClientId || !profile.email) throw new Error("Google identity is not valid for this client.");
  if (profile.email_verified !== true && profile.email_verified !== "true") throw new Error("Google email must be verified.");
  return profile;
}

function cloudpruneOAuthState(prefix) {
  const body = Buffer.from(JSON.stringify({
    prefix,
    nonce: crypto.randomBytes(18).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `cloudprune.${body}.${sig}`;
}

function verifyCloudpruneOAuthState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 3 || parts[0] !== "cloudprune") return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(parts[1]).digest("base64url");
  if (!secureEqual(parts[2], expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (payload.exp && Number(payload.exp) < Date.now()) return null;
  if (payload.prefix !== "/cp" && payload.prefix !== "/cloudprune") return null;
  return payload;
}

function cookieValue(req, name) {
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

function cloudpruneOAuthCookie(value, prefix, extra = "") {
  const domain = cloudpruneOauthCookieDomain ? `; Domain=${cloudpruneOauthCookieDomain}` : "";
  return `cloudprune_oauth_state=${value}; Path=${prefix}${domain}; HttpOnly; SameSite=Lax; Secure${extra}`;
}

module.exports = {
  bearerToken,
  cloudpruneOAuthCookie,
  cloudpruneOAuthState,
  cookieValue,
  hashPassword,
  normalizeEmail,
  publicUser,
  signGoogleRegistration,
  signSession,
  validateGoogleProfile,
  verifyCloudpruneOAuthState,
  verifyGoogleRegistration,
  verifyPassword,
  verifySession,
};
