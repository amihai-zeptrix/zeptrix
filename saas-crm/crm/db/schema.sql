create extension if not exists pgcrypto;
create extension if not exists citext;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  plan text not null check (plan in ('Starter', 'Growth', 'Enterprise')),
  status text not null default 'Active' check (status in ('Trial', 'Active', 'Suspended')),
  region text not null default 'US-East',
  seats integer not null default 1 check (seats > 0),
  billing_email citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email citext not null unique,
  password_hash text,
  password_change_required boolean not null default true,
  role text not null check (role in ('platform_admin', 'tenant_admin', 'sales_manager', 'sales_rep')),
  mfa_enabled boolean not null default true,
  mfa_secret text,
  google_subject text unique,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table invite_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recipient_email citext not null,
  temporary_password_hash text not null,
  subject text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  owner_id uuid references users(id),
  domain text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  name text not null,
  email citext,
  owner_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  owner_id uuid references users(id),
  name text not null,
  stage text not null check (stage in ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost')),
  value_cents bigint not null default 0,
  close_date date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  owner_id uuid references users(id),
  title text not null,
  type text not null check (type in ('Follow-up', 'Call', 'Email', 'Meeting')),
  due_date date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  owner_id uuid references users(id),
  type text not null check (type in ('Email', 'Meeting', 'Call')),
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text not null,
  body text,
  tracked text,
  occurred_at timestamptz not null default now()
);

create index deals_tenant_stage_idx on deals(tenant_id, stage);
create index deals_tenant_owner_idx on deals(tenant_id, owner_id);
create index activities_tenant_due_idx on activities(tenant_id, due_date, completed);
create index communications_tenant_deal_idx on communications(tenant_id, deal_id, occurred_at desc);
create index invite_emails_tenant_created_idx on invite_emails(tenant_id, created_at desc);

insert into tenants (slug, name, plan, status, region, seats, billing_email)
values
  ('admin', 'Zeptrix Admin', 'Enterprise', 'Active', 'US-East', 8, 'billing@zeptrix.io'),
  ('amihai', 'Amihai Sales', 'Growth', 'Active', 'EU-West', 5, 'billing@amihai.example');

insert into users (tenant_id, name, email, password_hash, password_change_required, role, mfa_enabled, google_subject)
select id, 'Platform Admin', 'admin@zeptrix.io', crypt('Tmp-Admin-7394!', gen_salt('bf')), true, 'platform_admin', true, 'google-admin-demo'
from tenants where slug = 'admin';

insert into users (tenant_id, name, email, password_hash, password_change_required, role, mfa_enabled, google_subject)
select id, 'Amihai Cohen', 'amihai@zeptrix.io', crypt('Tmp-Amihai-5821!', gen_salt('bf')), true, 'tenant_admin', true, 'google-amihai-demo'
from tenants where slug = 'amihai';

insert into invite_emails (tenant_id, recipient_email, temporary_password_hash, subject, status, sent_at)
select id, 'admin@zeptrix.io', crypt('Tmp-Admin-7394!', gen_salt('bf')), 'Your Zeptrix CRM invite', 'sent', now()
from tenants where slug = 'admin';

insert into invite_emails (tenant_id, recipient_email, temporary_password_hash, subject, status, sent_at)
select id, 'amihai@zeptrix.io', crypt('Tmp-Amihai-5821!', gen_salt('bf')), 'Your Zeptrix CRM invite', 'sent', now()
from tenants where slug = 'amihai';
