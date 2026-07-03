const { Pool } = require("pg");
const { databaseUrl } = require("./config");

import type { Pool as PgPool } from "pg";

export const pool: PgPool | null = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.CLOUDPRUNE_DATABASE_SSL === "true" || process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

export async function initDatabase(): Promise<void> {
  if (!pool) return;
  await pool.query(`create extension if not exists pgcrypto`);
  await pool.query(`create extension if not exists citext`);
  await pool.query(`
    create table if not exists cloudprune_accounts (
      id uuid primary key default gen_random_uuid(),
      company_name text not null,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_users (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      name text not null,
      email citext not null unique,
      password_hash text,
      google_subject text unique,
      provider text not null default 'password',
      session_version integer not null default 1,
      last_login_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table cloudprune_users add column if not exists session_version integer not null default 1`);
  await pool.query(`
    create table if not exists cloudprune_auth_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references cloudprune_users(id) on delete set null,
      email citext,
      event_type text not null,
      detail text,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_audit_log (
      id uuid primary key default gen_random_uuid(),
      account_id uuid references cloudprune_accounts(id) on delete set null,
      user_id uuid references cloudprune_users(id) on delete set null,
      actor_email citext,
      actor_role text not null default 'user',
      action text not null,
      target_type text,
      target_id text,
      summary text,
      metadata jsonb not null default '{}'::jsonb,
      ip_address text,
      user_agent text,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`create index if not exists cloudprune_audit_log_created_at_idx on cloudprune_audit_log (created_at desc)`);
  await pool.query(`create index if not exists cloudprune_audit_log_account_id_idx on cloudprune_audit_log (account_id, created_at desc)`);
  await pool.query(`
    create table if not exists cloudprune_cloud_connections (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      provider text not null,
      provider_account_id text,
      role_arn text,
      external_id text not null,
      metadata jsonb not null default '{}'::jsonb,
      status text not null default 'configured',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(account_id, provider)
    )
  `);
  await pool.query(`alter table cloudprune_cloud_connections add column if not exists metadata jsonb not null default '{}'::jsonb`);
  await pool.query(`
    create table if not exists cloudprune_aws_scans (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      provider_account_id text not null,
      status text not null default 'completed',
      monthly_cost numeric not null default 0,
      currency text not null default 'USD',
      counts jsonb not null default '{}'::jsonb,
      errors jsonb not null default '[]'::jsonb,
      scan_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table cloudprune_aws_scans add column if not exists updated_at timestamptz not null default now()`);
  await pool.query(`
    create table if not exists cloudprune_oauth_codes (
      code_hash text primary key,
      user_id uuid references cloudprune_users(id) on delete cascade,
      registration jsonb,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists cloudprune_feedback_reports (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references cloudprune_accounts(id) on delete cascade,
      user_id uuid not null references cloudprune_users(id) on delete cascade,
      report_type text not null,
      details text not null,
      attachment_name text,
      attachment_type text,
      attachment_size integer,
      attachment_content_base64 text,
      created_at timestamptz not null default now()
    )
  `);
}
