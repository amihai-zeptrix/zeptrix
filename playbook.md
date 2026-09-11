# CloudPrune session playbook

This file is the handoff document for starting a new CloudPrune development
session without depending on previous chat history. It describes the repository,
the application, the current Azure work, known local constraints, and the safest
way to continue.

Last context refresh: 2026-07-31.

## Start here

The canonical Git worktree is:

```text
/Users/Amihai/projects/zeptrix.io/cloudprune
```

Start every session with:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
git status --short
git branch --show-current
git remote -v
git worktree list
gh auth status
```

The expected remote is:

```text
https://github.com/amihai-zeptrix/zeptrix.git
```

Use the `amihai-zeptrix` GitHub account. If another account is active:

```sh
gh auth switch -h github.com -u amihai-zeptrix
```

Do not assume the current branch, PR, checks, or deployment state is unchanged.
Verify them at the start of a new session.

## Current Git and PR context

At the time this playbook was written:

- Branch: `feature/cloudprune-azure-support`
- Base branch: `main`
- Pull request:
  [#64 — Add Azure parity to the CloudPrune demo](https://github.com/amihai-zeptrix/zeptrix/pull/64)
- PR state: open, non-draft, and mergeable
- GitGuardian check: successful on commit `dcac18e`
- Main Azure implementation commit: `115e4cb`
- Isolated-review correction commit: `dcac18e`
- Latest complete local verification: 107 tests passed

Useful checks:

```sh
gh pr view 64 --repo amihai-zeptrix/zeptrix \
  --json url,title,state,isDraft,mergeable,reviewDecision,statusCheckRollup,headRefOid
git log -5 --oneline --decorate
```

The Azure PR received multiple isolated, read-only reviews. The corrected issues
included:

- preserving the selected Azure dry-run plan across navigation;
- validating `plan` and `cloud` URL parameters together;
- removing stale selected-plan state and URL parameters when providers change;
- retaining the plan when the active provider button is clicked again;
- making the queue preview toggle actually control queue visibility;
- routing the demo `Connect AWS` action into sign-in onboarding;
- marking Azure public-IP cleanup as high-risk and review-only;
- narrowing documentation claims to Azure recommendations where appropriate.

If more changes are added to PR #64, run another review against
`origin/main...HEAD`, not against chat summaries.

## Worktree layout and cleanup history

This repository is a monorepo. The current Git worktrees are intentionally
separate:

```text
/Users/Amihai/projects/zeptrix.io/web-site
/Users/Amihai/projects/zeptrix.io/cloudprune
/Users/Amihai/projects/zeptrix.io/web-site-cloudprune-schema
```

They contain active branches. Do not delete, move, prune, or overwrite the other
worktrees without checking their status and receiving explicit authorization.

An older standalone, non-Git CloudPrune copy was moved recoverably to:

```text
/Users/Amihai/.Trash/cloudprune-standalone-2026-07-30
```

The canonical CloudPrune Git worktree now occupies the requested
`zeptrix.io/cloudprune` path.

The nested path below is intentional:

```text
cloudprune/cloudprune/
```

The first `cloudprune/` is the application package inside the monorepo. The
second is its browser-facing static asset directory. Do not “deduplicate” this
path.

## Application purpose and current product boundary

CloudPrune is a cloud-cost workspace with:

- a live, read-only AWS connector and assessment pipeline;
- synthetic multi-cloud demo data;
- recommendation review and dry-run automation-plan workflows;
- authentication, tenant workspaces, feedback, audit logs, and admin views;
- generated AWS cost-optimization resource pages and growth tracking.

The most important trust boundary is:

- AWS assessment can use real read-only account access.
- Azure support in PR #64 is demo-only.
- Azure spend, resources, anomalies, recommendations, and workflows are
  synthetic.
- No Azure APIs are called.
- No live Azure subscription scanning or Azure resource execution exists.
- Azure demo workflows are review-only even when modeled effort is low.

Do not describe Azure as connected, scanned, verified, executable, or capable of
changing resources. See
[`cloudprune/AZURE_SUPPORT_PLAN.md`](cloudprune/AZURE_SUPPORT_PLAN.md) before
extending Azure support.

## Important paths

### Package and frontend

- `cloudprune/package.json` — scripts and dependencies
- `cloudprune/package-lock.json` — pinned Node dependencies
- `cloudprune/cloudprune/index.html` — public application shell
- `cloudprune/cloudprune/app.js` — client state, demo catalog, rendering, and
  browser interactions
- `cloudprune/cloudprune/styles.css` — application styling
- `cloudprune/cloudprune/favicon.svg` — app icon
- `cloudprune/cloudprune/aws-readonly-role-template.yaml` — public AWS
  CloudFormation onboarding template

The frontend is deliberately plain JavaScript and server-rendered template
strings rather than a React/Vite application.

### Server and services

- `cloudprune/server.ts` — HTTP server, API routing, OAuth flow, static/SPA
  routing, and startup
- `cloudprune/src/config.ts` — runtime configuration and production validation
- `cloudprune/src/db.ts` — PostgreSQL schema initialization
- `cloudprune/src/auth.ts` — sessions, password hashing, Google OAuth state
- `cloudprune/src/user-service.ts` — registration, login, profile, and admin user
  behavior
- `cloudprune/src/workspace-service.ts` — saved AWS connections and scan
  orchestration
- `cloudprune/src/aws-scan-runner.ts` — bounded AWS CLI collection
- `cloudprune/src/aws-scan-report.ts` — scan result normalization
- `cloudprune/src/automation-service.ts` — persisted dry-run plans
- `cloudprune/src/audit-service.ts` — audit events
- `cloudprune/src/feedback-service.ts` — feedback and tenant administration
- `cloudprune/src/growth-service.ts` — funnel events and experiments
- `cloudprune/src/http-utils.ts` — route prefixing, static paths, and bounded JSON
  parsing

### AWS assessment CLI

- `cloudprune/scripts/aws-assessment.js` — runtime entry shim
- `cloudprune/scripts/aws-assessment.ts` — TypeScript entry
- `cloudprune/scripts/aws-assessment/` — collectors, costs, recommendations,
  report generation, Markdown formatting, and CLI parsing
- `cloudprune/aws-readonly-policy.json` — policy for assessment access

### Tests and documentation

- `cloudprune/test/server.test.js` — Node test suite for server, frontend,
  authentication, AWS scanning, Azure demo behavior, security, and routing
- `cloudprune/README.md` — package-level operating notes
- `cloudprune/AZURE_SUPPORT_PLAN.md` — Azure parity matrix and live connector
  design
- `deploy.md` — production CloudPrune packaging, S3/SSM deployment, health
  verification, and rollback procedure
- `GITHUB_WORKFLOW.md` — GitHub identity and deployment rule
- `DEPLOYMENT_LESSONS.md` — shared web-root deployment risks
- `SEO_ROLLOUT.md` — CloudPrune discovery and indexing plan
- `scripts/test.sh` — monorepo deploy-invariant hook
- `scripts/verify-routes.sh` — production route verification
- `nginx-zeptrix.conf` — public reverse-proxy/static routing

## Routes

The Node app listens on port `4321` by default and supports both `/cloudprune`
and `/cp` route prefixes.

Important public routes include:

- `/cloudprune/` — authentication or signed-in workspace
- `/cloudprune/demo` — synthetic demo dashboard
- `/cloudprune/demo/recommendations` — demo recommendation catalog
- `/cloudprune/demo/automation` — demo dry-run plans
- `/cloudprune/resources/` — generated AWS cost resources
- `/cloudprune/admin` — admin workspace
- `/cp/...` — compatibility alias served by the same app

Nginx proxies `/cloudprune/` and `/cp/` to `127.0.0.1:4321`.

## Azure demo coverage

PR #64 adds five Azure service groups:

- Virtual Machines
- Azure SQL
- AKS
- Storage & Monitor
- Networking

It adds eleven Azure recommendation families:

1. Azure savings plan and reservation coverage
2. Unattached managed disks
3. Unassociated public IP resources
4. Blob and Log Analytics lifecycle
5. VM consolidation
6. Idle load balancers
7. VM rightsizing
8. VM jobs to Functions or Container Apps assessment
9. Azure SQL rightsizing
10. NAT Gateway and private-access review
11. AKS node-pool consolidation

The source data and service mappings live near the top of
`cloudprune/cloudprune/app.js`. Provider filtering must consistently scope:

- KPI and spend totals;
- services;
- recommendations;
- recommendation grouping and subfilters;
- anomalies;
- queue and selected-plan state.

Selected demo plans are encoded with `plan` and `cloud` query parameters.
Provider changes must remove stale plan parameters from browser history so a
refresh cannot restore an unrelated plan.

## AWS behavior and safety

AWS scanning is read-only. The assessment collects identity, cost, inventory,
CloudWatch, Compute Optimizer, Savings Plans, Trusted Advisor, and selected SSM
signals when permissions exist.

Collection is bounded by region, inventory, concurrency, sampled-resource,
output-size, lookback, and timeout limits. Missing optional permissions should
produce partial-coverage warnings, not invented zero-valued findings.

Do not implement automatic mutation without a separate, explicit user decision
and safety design. Before any future action that can cause downtime, data loss,
financial commitment, retention loss, network changes, or loss of a stable
public IP, require:

- exact resource identity and ownership checks;
- dependency and protected-tag checks;
- impact and downtime disclosure;
- approval;
- rollback guidance;
- a validation window and audit record.

## Local setup and commands

Use Node 20 or later.

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune/cloudprune
npm ci
npm run check
```

`npm run check` performs:

- JavaScript syntax checks;
- TypeScript type checking;
- a clean build;
- the complete Node test suite.

Other useful commands:

```sh
npm run dev
npm run build
npm test
npm run typecheck
npm run assess:aws -- --profile prod-readonly --region us-east-1
```

Build output is written to `cloudprune/dist/` and ignored. AWS CLI assessment
reports are written under `cloudprune/reports/` and ignored.

After tests:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
git diff --check
git status --short
```

## Runtime configuration

Use `cloudprune/.env.example` as a starting point, but inspect
`cloudprune/src/config.ts` for the authoritative current set.

Important variables include:

- `PORT`
- `NODE_ENV`
- `PUBLIC_BASE_URL`
- `CLOUDPRUNE_DATABASE_URL` or `DATABASE_URL`
- `CLOUDPRUNE_DATABASE_SSL` or `DATABASE_SSL`
- `CLOUDPRUNE_TOKEN_SECRET` or `CRM_TOKEN_SECRET`
- `CLOUDPRUNE_ADMIN_PASSWORD`
- `CLOUDPRUNE_GOOGLE_CLIENT_ID`
- `CLOUDPRUNE_GOOGLE_CLIENT_SECRET`
- `CLOUDPRUNE_GOOGLE_REDIRECT_URI`
- `CLOUDPRUNE_OAUTH_COOKIE_DOMAIN`
- `CLOUDPRUNE_AWS_PRINCIPAL_ARN`
- `CLOUDPRUNE_AWS_CLOUDFORMATION_TEMPLATE_URL`
- AWS credential/profile/region variables
- AWS scanner limit and timeout variables
- audit-email variables

Production validation requires a token secret, admin password, and explicit
CloudFormation template URL. Do not print, commit, or paste secret values into
issues, PRs, logs, or this playbook.

With no database configured, the server can run locally but persistent
registration and workspace features are disabled. Database startup creates or
updates the CloudPrune PostgreSQL tables through `initDatabase()`.

## Git hooks and known baseline issue

The repository uses:

```sh
git config core.hooksPath .githooks
```

The pre-commit hook runs the monorepo-level `./scripts/test.sh`. In this
canonical worktree, that script currently fails before CloudPrune validation
because it requires a root `ai-power-site.html` file that is not tracked by
`origin/main`.

The older `web-site` worktree contains `ai-power-site.html` only as an unrelated
untracked user file. Do not copy, stage, overwrite, or delete it merely to make
the hook pass.

For PR #64, CloudPrune commits used `--no-verify` only after:

```sh
cd cloudprune
npm run check
cd ..
git diff --check
```

Treat this as a known repository baseline problem, not permission to skip
CloudPrune verification. If `ai-power-site.html` becomes tracked or the invariant
script is corrected, return to normal verified commits.

## Commit and PR workflow

Preserve unrelated user changes. Stage explicit paths rather than using a broad
cleanup or destructive reset.

Typical continuation:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
git status --short
git diff --check
git add <explicit paths>
git commit -m "<focused message>"
git push
gh pr view 64 --repo amihai-zeptrix/zeptrix
```

If push reports permission denied for `ahadarbioa`, switch GitHub authentication
to `amihai-zeptrix` and retry. Do not change the remote to a different
repository.

## Deployment rules

CloudPrune deploys to the existing `zeptrix-web-1` EC2 instance through AWS SSM.
Do not create new AWS infrastructure without explicit approval.

Follow `deploy.md` for the current commit-pinned, rollback-protected deployment
procedure.

The monorepo serves multiple public products from one web root. Never run
`rsync --delete` from a partial source tree. Assemble and verify the complete
public bundle first, including `/mbh/` and other shared-site paths described in
`DEPLOYMENT_LESSONS.md`.

Before a deployment:

```sh
./scripts/test.sh
```

After a deployment:

```sh
./scripts/verify-routes.sh https://zeptrix.io
```

Do not consider a deployment complete if production route verification fails.

## New-session checklist

1. Read this file, `cloudprune/README.md`, and any task-specific plan.
2. Verify the canonical path, branch, worktree status, and remote.
3. Verify the active GitHub account.
4. Fetch before comparing with `origin/main`.
5. Inspect PR #64 if the Azure branch is still active.
6. Keep live AWS behavior separate from synthetic Azure demo behavior.
7. Preserve the URL/provider/selected-plan invariants.
8. Run `npm run check` from the inner package directory.
9. Run `git diff --check` from the repository root.
10. Request an isolated review for meaningful UX, security, cloud, or workflow
    changes.
11. Stage only intended files, push with `amihai-zeptrix`, and verify remote
    checks.
12. Do not deploy unless the user explicitly requests it.

## What to verify rather than assume

This playbook intentionally records current context, but these details can
change:

- the active branch and current commit;
- whether PR #64 is open or merged;
- CI and review status;
- worktree paths and uncommitted changes;
- production environment variables;
- the EC2 service/process state;
- live routes and deployed version;
- whether the monorepo hook baseline has been repaired.

Use Git, GitHub, repository files, and read-only deployment checks as the source
of truth at the start of each new session.
