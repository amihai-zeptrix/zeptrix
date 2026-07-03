const {
  bearerToken,
  hashPassword,
  normalizeEmail,
  verifyGoogleRegistration,
  verifyPassword,
  verifySession,
} = require("./auth");
const { adminPassword } = require("./config");
const { recordAuditEvent } = require("./audit-service");
const { pool } = require("./db");

type AuthProvider = "password" | "google";

interface RequestLike {
  headers: {
    authorization?: string;
    "user-agent"?: string;
    "x-forwarded-for"?: string;
    "x-real-ip"?: string;
  };
  socket?: {
    remoteAddress?: string;
  };
}

interface UserPayload {
  name?: unknown;
  company?: unknown;
  companyName?: unknown;
  email?: unknown;
  password?: unknown;
  googleSubject?: unknown;
  googleRegistrationToken?: unknown;
}

interface UserRow {
  id: string;
  account_id: string;
  name: string;
  email: string;
  password_hash?: string | null;
  provider: string;
  company_name: string;
  session_version?: number;
  role?: string;
}

interface AuthEvent {
  req?: RequestLike | null;
  userId?: string | null;
  accountId?: string | null;
  email?: string | null;
  role?: string | null;
  eventType: string;
  detail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function userFromSession(req: RequestLike): Promise<UserRow> {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const session = verifySession(bearerToken(req));
  if (!session) throw new Error("CloudPrune session is invalid.");
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, u.session_version, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.id=$1`,
    [session.sub]
  );
  const user = result.rows[0];
  if (!user) throw new Error("CloudPrune session user was not found.");
  if (Number(session.sessionVersion) !== Number(user.session_version)) throw new Error("CloudPrune session is invalid.");
  return user;
}

function adminUser(): UserRow {
  return {
    id: "cloudprune-admin",
    account_id: "cloudprune-admin",
    name: "CloudPrune Admin",
    email: "admin",
    provider: "admin",
    company_name: "CloudPrune Admin",
    role: "admin",
  };
}

async function recordAuthEvent({ req = null, userId = null, accountId = null, email = null, role = null, eventType, detail = null, targetType = null, targetId = null, metadata = null }: AuthEvent): Promise<void> {
  await recordAuditEvent({
    req,
    actor: { accountId, userId, email, role },
    action: eventType,
    targetType,
    targetId,
    summary: detail,
    metadata,
  });
}

async function registerUser(payload: UserPayload, provider: AuthProvider = "password", req: RequestLike | null = null): Promise<UserRow> {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const name = String(payload.name || "").trim();
  const company = String(payload.company || payload.companyName || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!name || !company || !email.includes("@")) throw new Error("Name, company, and email are required.");
  if (provider === "password" && password.length < 10) throw new Error("Password must be at least 10 characters.");

  const client = await pool.connect();
  let registeredUser: UserRow | null = null;
  try {
    await client.query("begin");
    const account = await client.query(`insert into cloudprune_accounts (company_name) values ($1) returning id`, [company]);
    const user = await client.query(
      `insert into cloudprune_users (account_id, name, email, password_hash, google_subject, provider, last_login_at)
       values ($1,$2,$3,$4,$5,$6,now())
       returning id, account_id, name, email, provider, session_version, $7::text as company_name`,
      [account.rows[0].id, name, email, provider === "password" ? hashPassword(password) : null, payload.googleSubject || null, provider, company]
    );
    registeredUser = user.rows[0];
    await client.query("commit");
  } catch (error: any) {
    await client.query("rollback");
    if (error.code === "23505") throw new Error("A CloudPrune user already exists for this email.");
    throw error;
  } finally {
    client.release();
  }
  await recordAuthEvent({
    req,
    userId: registeredUser.id,
    accountId: registeredUser.account_id,
    email,
    eventType: provider === "google" ? "google_register" : "register",
    detail: company,
    targetType: "user",
    targetId: registeredUser.id,
  });
  return registeredUser;
}

async function loginUser(payload: UserPayload, req: RequestLike | null = null): Promise<UserRow> {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (adminPassword && email === "admin" && password.trim() === adminPassword) {
    await recordAuthEvent({ req, email, role: "admin", eventType: "login", detail: "admin", targetType: "session", targetId: "cloudprune-admin" });
    return adminUser();
  }
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.password_hash, u.provider, u.session_version, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.email=$1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    await recordAuthEvent({ req, email, eventType: "login_failed", detail: "invalid_credentials", targetType: "session" });
    throw new Error("Invalid email or password.");
  }
  await pool.query(`update cloudprune_users set last_login_at=now() where id=$1`, [user.id]);
  await recordAuthEvent({ req, userId: user.id, accountId: user.account_id, email, eventType: "login", detail: "password", targetType: "session", targetId: user.id });
  return user;
}

async function completeGoogleRegistration(payload: UserPayload, req: RequestLike | null = null): Promise<UserRow> {
  const registration = verifyGoogleRegistration(payload.googleRegistrationToken);
  if (!registration) throw new Error("Google registration expired. Please continue with Google again.");
  return registerUser({
    name: payload.name || registration.name,
    company: payload.company || payload.companyName,
    email: registration.email,
    googleSubject: registration.sub,
  }, "google", req);
}

async function updateUserProfile(req: RequestLike, payload: UserPayload): Promise<UserRow> {
  const user = await userFromSession(req);
  const name = String(payload.name || "").trim();
  const company = String(payload.company || payload.companyName || "").trim();
  if (!name || !company) throw new Error("Name and company are required.");
  await pool.query(
    `update cloudprune_users set name=$2 where id=$1`,
    [user.id, name]
  );
  await pool.query(
    `update cloudprune_accounts set company_name=$2 where id=$1`,
    [user.account_id, company]
  );
  await recordAuthEvent({ req, userId: user.id, accountId: user.account_id, email: user.email, eventType: "profile_updated", detail: company, targetType: "user", targetId: user.id });
  return { ...user, name, company_name: company };
}

export {
  completeGoogleRegistration,
  loginUser,
  recordAuthEvent,
  registerUser,
  updateUserProfile,
  userFromSession,
};
