const {
  bearerToken,
  hashPassword,
  normalizeEmail,
  verifyGoogleRegistration,
  verifyPassword,
  verifySession,
} = require("./auth");
const { pool } = require("./db");

async function userFromSession(req) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const session = verifySession(bearerToken(req));
  if (!session) throw new Error("CloudPrune session is invalid.");
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.id=$1`,
    [session.sub]
  );
  if (!result.rows[0]) throw new Error("CloudPrune session user was not found.");
  return result.rows[0];
}

async function recordAuthEvent({ userId = null, email = null, eventType, detail = null }) {
  if (!pool) return;
  await pool.query(
    `insert into cloudprune_auth_events (user_id, email, event_type, detail) values ($1,$2,$3,$4)`,
    [userId, email, eventType, detail]
  );
}

async function registerUser(payload, provider = "password") {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const name = String(payload.name || "").trim();
  const company = String(payload.company || payload.companyName || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!name || !company || !email.includes("@")) throw new Error("Name, company, and email are required.");
  if (provider === "password" && password.length < 10) throw new Error("Password must be at least 10 characters.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const account = await client.query(`insert into cloudprune_accounts (company_name) values ($1) returning id`, [company]);
    const user = await client.query(
      `insert into cloudprune_users (account_id, name, email, password_hash, google_subject, provider, last_login_at)
       values ($1,$2,$3,$4,$5,$6,now())
       returning id, account_id, name, email, provider, $7::text as company_name`,
      [account.rows[0].id, name, email, provider === "password" ? hashPassword(password) : null, payload.googleSubject || null, provider, company]
    );
    await client.query(
      `insert into cloudprune_auth_events (user_id, email, event_type, detail) values ($1,$2,$3,$4)`,
      [user.rows[0].id, email, provider === "google" ? "google_register" : "register", company]
    );
    await client.query("commit");
    return user.rows[0];
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505") throw new Error("A CloudPrune user already exists for this email.");
    throw error;
  } finally {
    client.release();
  }
}

async function loginUser(payload) {
  if (!pool) throw new Error("CloudPrune database is not configured.");
  const email = normalizeEmail(payload.email);
  const result = await pool.query(
    `select u.id, u.account_id, u.name, u.email, u.password_hash, u.provider, a.company_name
     from cloudprune_users u
     join cloudprune_accounts a on a.id = u.account_id
     where u.email=$1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.password_hash || !verifyPassword(payload.password || "", user.password_hash)) {
    await recordAuthEvent({ email, eventType: "login_failed", detail: "invalid_credentials" });
    throw new Error("Invalid email or password.");
  }
  await pool.query(`update cloudprune_users set last_login_at=now() where id=$1`, [user.id]);
  await recordAuthEvent({ userId: user.id, email, eventType: "login", detail: "password" });
  return user;
}

async function completeGoogleRegistration(payload) {
  const registration = verifyGoogleRegistration(payload.googleRegistrationToken);
  if (!registration) throw new Error("Google registration expired. Please continue with Google again.");
  return registerUser({
    name: payload.name || registration.name,
    company: payload.company || payload.companyName,
    email: registration.email,
    googleSubject: registration.sub,
  }, "google");
}

async function updateUserProfile(req, payload) {
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
  return { ...user, name, company_name: company };
}

module.exports = {
  completeGoogleRegistration,
  loginUser,
  recordAuthEvent,
  registerUser,
  updateUserProfile,
  userFromSession,
};
