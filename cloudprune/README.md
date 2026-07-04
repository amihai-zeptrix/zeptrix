# CloudPrune

CloudPrune is a cloud cost workspace and read-only AWS assessment helper.

## AWS assessment

Run the first onboarding assessment with existing AWS CLI credentials:

```sh
npm run assess:aws -- --profile prod-readonly --region us-east-1
```

CloudPrune uses the same AWS credential environment variable pattern as the CRM app. For local credentials, start from `.env.example`:

```sh
cp .env.example .env
```

For customer onboarding, attach the read-only policy template in `aws-readonly-policy.json` to the IAM user or role used by the assessment. The policy only grants read APIs used for identity, cost, inventory, metrics, Compute Optimizer, Savings Plans, and Trusted Advisor checks.

The script writes JSON and Markdown reports under `cloudprune/reports/` by default. It does not change AWS resources. Missing optional permissions are included in the permission check so onboarding can show exactly which signals are unavailable.

The first pass looks for:

- Idle resources such as unattached EBS volumes, unassociated Elastic IPs, stopped EC2 instances, and load balancers with no sampled traffic.
- Rightsizing signals from EC2 Compute Optimizer and low-utilization RDS CloudWatch metrics.
- AWS Savings Plans purchase recommendations, with a low-confidence heuristic signal when native recommendations are unavailable.
- Storage lifecycle opportunities for CloudWatch log groups with infinite retention and sampled S3 buckets without lifecycle rules.
- NAT gateway/network optimization candidates using NAT inventory and sampled CloudWatch traffic metrics.

Every finding includes estimated savings when available, confidence, blast radius, operational risk, downtime risk, impact analysis, a lower-impact execution path, rollback guidance, and validation metrics.

Use `--max-resources` to control how many resources are sampled for per-resource metric and lifecycle checks:

```sh
npm run assess:aws -- --profile prod-readonly --region us-east-1 --max-resources 100
```

Use `--concurrency` to bound sampled resource checks. The default is 6 concurrent AWS CLI calls:

```sh
npm run assess:aws -- --profile prod-readonly --region us-east-1 --concurrency 4
```

Use `--timeout-ms` to cap each AWS CLI call. The default is 30 seconds:

```sh
npm run assess:aws -- --profile prod-readonly --region us-east-1 --timeout-ms 45000
```

The web scan uses separate server-side safety caps so repeated onboarding scans stay bounded in large AWS accounts:

- `CLOUDPRUNE_AWS_SCAN_MAX_REGIONS` limits enabled regions scanned, default `12`.
- `CLOUDPRUNE_AWS_SCAN_MAX_INVENTORY_ITEMS` limits paginated inventory items per regional AWS CLI call, default `200`.
- `CLOUDPRUNE_AWS_SCAN_MAX_SAMPLED_RESOURCES` limits per-resource lifecycle and CloudWatch metric follow-up checks, default `25`.

## Stock scanner cost state

Current AWS account: `339494983469`, region `us-east-1`.

`stocks-scanner-1` is intentionally no longer an always-on IBKR host:

- Instance: `i-0420639532e30c7ae`, tag `Name=stocks-scanner-1`.
- Instance type: `t3.small`.
- Current root volume: `vol-0f38f94bdfd6c0594`, `20 GiB` gp3, attached as `/dev/xvda`.
- Old `150 GiB` root volume `vol-01ea94beb6456dde6` was deleted after verification.
- Rollback snapshot before IBKR removal/root shrink: `snap-0b6a00d63f0a69c0d`.
- IBKR Gateway and VNC runtime were removed from active service use.
- IBKR intraday backfill services were disabled and moved under `/opt/stocks-scanner/disabled-units`.
- PostgreSQL remains local on the instance with database `stocks_scanner`.
- Polygon/Massive remains the active market data path through `massive-intraday-update.timer`.

Enabled EventBridge Scheduler rules:

- `stocks-scanner-start-weekdays`: starts the instance Monday-Friday at `13:20 UTC`.
- `stocks-scanner-stop-weekdays`: stops the instance Monday-Friday at `22:45 UTC`.

Expected steady-state monthly cost is now much lower than the previous always-on `t3.small` plus `150 GiB` disk setup. AWS Cost Explorer forecasts can lag because they extrapolate earlier month usage.

Important operations rule: before stopping, swapping volumes, changing schedules, deleting snapshots, or doing anything that can cause downtime or data-loss risk, warn the user first. Include what will be unavailable, why downtime is needed, estimated duration, rollback path, and ask for approval before proceeding. The July 2026 root-volume shrink required a short stop/swap/start downtime window of about two minutes.
