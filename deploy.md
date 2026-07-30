# CloudPrune deployment guide

This document describes how to deploy CloudPrune to the existing production AWS
host. It is based on the successful deployment of PR #64 on 2026-07-31.

Read [`playbook.md`](playbook.md), [`GITHUB_WORKFLOW.md`](GITHUB_WORKFLOW.md),
and [`DEPLOYMENT_LESSONS.md`](DEPLOYMENT_LESSONS.md) before changing the
deployment shape.

## Production target

CloudPrune currently runs on:

| Setting | Value |
| --- | --- |
| AWS profile | `zeptrix.io` |
| AWS account | `339494983469` |
| Region | `us-east-1` |
| EC2 name | `zeptrix-web-1` |
| EC2 instance ID | `i-07726edefbc901f50` |
| SSM status | Must be `Online` |
| Application path | `/opt/cloudprune` |
| Environment file | `/etc/cloudprune.env` |
| Systemd service | `cloudprune.service` |
| Node entry point | `/opt/cloudprune/dist/server.js` |
| Local port | `4321` |
| Public URL | `https://zeptrix.io/cloudprune/` |
| Demo URL | `https://zeptrix.io/cloudprune/demo` |
| Transfer bucket | `elasticbeanstalk-us-east-1-339494983469` |

Nginx proxies `/cloudprune/` and `/cp/` to `127.0.0.1:4321`.

Deploy only the application package under `/opt/cloudprune`. Do not sync or
delete files in `/usr/share/nginx/html/`; it is a shared web root for multiple
products.

## Safety rules

- Deploy only after explicit authorization.
- Do not create new AWS infrastructure for a normal CloudPrune deployment.
- Deploy an exact Git commit, not an uncommitted working tree.
- Verify the local branch, remote PR head, tests, and AWS identity first.
- Never copy or print `/etc/cloudprune.env`.
- Build in a new staging directory.
- Keep the previous `/opt/cloudprune` as a timestamped rollback backup.
- Use a rollback trap around the directory swap and service restart.
- Verify both local service health and public production routes.
- Remove the temporary S3 object after verification.
- Do not remove old backups during the same deployment unless separately
  authorized.

## 1. Verify Git and GitHub

From the canonical worktree:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
gh auth status
```

The worktree should be clean. If deploying a PR, confirm that the checked-out
commit is the PR head:

```sh
gh pr view PR_NUMBER --repo amihai-zeptrix/zeptrix \
  --json url,state,isDraft,mergeable,headRefOid,statusCheckRollup
```

Do not deploy a draft, closed, failing, or unexpected commit without resolving
the discrepancy.

Git pushes for this repository use the `amihai-zeptrix` GitHub account:

```sh
gh auth switch -h github.com -u amihai-zeptrix
```

## 2. Run local verification

CloudPrune requires Node 20 or later.

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune/cloudprune
npm ci
npm run check
```

Then:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
git diff --check
git status --short
```

`npm run check` performs syntax checks, TypeScript checking, a clean build, and
the complete Node test suite.

The monorepo-level pre-commit test currently has a known baseline problem:
`scripts/test.sh` expects an untracked root `ai-power-site.html`. See
`playbook.md` before interpreting that failure. It does not replace the
CloudPrune package checks above.

## 3. Verify AWS access and the target

Use task-specific shell variables:

```sh
CP_AWS_PROFILE=zeptrix.io
CP_AWS_REGION=us-east-1
CP_INSTANCE_ID=i-07726edefbc901f50
CP_DEPLOY_BUCKET=elasticbeanstalk-us-east-1-339494983469
```

Verify identity:

```sh
aws sts get-caller-identity \
  --profile "$CP_AWS_PROFILE" \
  --query '{Account:Account,Arn:Arn}' \
  --output json
```

The account must be `339494983469`.

If the session is expired:

```sh
aws login --profile zeptrix.io
```

Verify the instance name and state:

```sh
aws ec2 describe-instances \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --instance-ids "$CP_INSTANCE_ID" \
  --query 'Reservations[].Instances[].{Name:Tags[?Key==`Name`]|[0].Value,State:State.Name,InstanceId:InstanceId}' \
  --output json
```

Verify SSM is online:

```sh
aws ssm describe-instance-information \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --query "InstanceInformationList[?InstanceId==\`$CP_INSTANCE_ID\`].{InstanceId:InstanceId,PingStatus:PingStatus}" \
  --output json
```

Stop if the EC2 instance is not `running`, its Name tag is not
`zeptrix-web-1`, or SSM is not `Online`.

## 4. Verify production before changing it

Run the public baseline:

```sh
./scripts/verify-routes.sh https://zeptrix.io
curl -fsS -o /dev/null -w 'CLOUDPRUNE_STATUS=%{http_code}\n' \
  https://zeptrix.io/cloudprune/
```

Inspect the remote service without reading environment values:

```sh
CP_INSPECT_COMMAND_ID=$(
  aws ssm send-command \
    --profile "$CP_AWS_PROFILE" \
    --region "$CP_AWS_REGION" \
    --instance-ids "$CP_INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Inspect CloudPrune before deployment" \
    --parameters 'commands=[
      "systemctl is-active cloudprune.service",
      "systemctl show cloudprune.service -p ExecStart -p WorkingDirectory -p User",
      "curl -fsS -o /dev/null -w LOCAL_STATUS=%{http_code} http://127.0.0.1:4321/cloudprune/",
      "df -h /opt /tmp"
    ]' \
    --query 'Command.CommandId' \
    --output text
)

aws ssm wait command-executed \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --command-id "$CP_INSPECT_COMMAND_ID" \
  --instance-id "$CP_INSTANCE_ID"

aws ssm get-command-invocation \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --command-id "$CP_INSPECT_COMMAND_ID" \
  --instance-id "$CP_INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json
```

Stop if the current service is not active or the local status is not 200.

## 5. Create a commit-pinned deployment archive

From the repository root:

```sh
CP_COMMIT=$(git rev-parse HEAD)
CP_SHORT_COMMIT=$(git rev-parse --short=8 HEAD)
CP_ARCHIVE="/tmp/cloudprune-$CP_SHORT_COMMIT.tar.gz"
CP_S3_KEY="cloudprune-deployments/$CP_SHORT_COMMIT/cloudprune.tar.gz"

git archive \
  --format=tar.gz \
  --prefix=cloudprune-release/ \
  -o "$CP_ARCHIVE" \
  "$CP_COMMIT:cloudprune"

CP_ARCHIVE_SHA256=$(shasum -a 256 "$CP_ARCHIVE" | awk '{print $1}')
ls -lh "$CP_ARCHIVE"
printf 'commit=%s\nsha256=%s\n' "$CP_COMMIT" "$CP_ARCHIVE_SHA256"
```

This packages only the application package at repository path `cloudprune/`.
The root documentation and unrelated monorepo products are not copied into
`/opt/cloudprune`.

## 6. Upload the temporary archive

```sh
aws s3 cp \
  "$CP_ARCHIVE" \
  "s3://$CP_DEPLOY_BUCKET/$CP_S3_KEY" \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --only-show-errors

aws s3api head-object \
  --bucket "$CP_DEPLOY_BUCKET" \
  --key "$CP_S3_KEY" \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --query '{ContentLength:ContentLength,ETag:ETag,LastModified:LastModified}' \
  --output json
```

Create a short-lived presigned download URL. Do not print or paste it:

```sh
CP_DEPLOY_URL=$(
  aws s3 presign \
    "s3://$CP_DEPLOY_BUCKET/$CP_S3_KEY" \
    --profile "$CP_AWS_PROFILE" \
    --region "$CP_AWS_REGION" \
    --expires-in 900
)
```

## 7. Build and activate with automatic rollback

The remote command below:

1. downloads and checksum-verifies the exact archive;
2. extracts it into a unique `/opt` staging directory;
3. installs dependencies and builds;
4. records the deployed Git commit;
5. prunes development dependencies;
6. moves the current release to a timestamped backup;
7. activates the new release and restarts systemd;
8. restores the backup automatically if health checks fail.

Create the remote script:

```sh
read -r -d '' CP_REMOTE_DEPLOY_SCRIPT <<'SCRIPT' || true
set -euo pipefail

commit="__COMMIT__"
archive_sha256="__ARCHIVE_SHA256__"
short_commit="__SHORT_COMMIT__"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="/tmp/cloudprune-$short_commit.tar.gz"
stage="/opt/cloudprune.deploy-$short_commit-$timestamp"
backup="/opt/cloudprune.backup-$short_commit-$timestamp"
failed="/opt/cloudprune.failed-$short_commit-$timestamp"
backup_made=0

rollback() {
  if [ "$backup_made" = 1 ] && [ -d "$backup" ]; then
    systemctl stop cloudprune.service || true
    if [ -d /opt/cloudprune ]; then
      mv /opt/cloudprune "$failed"
    fi
    mv "$backup" /opt/cloudprune
    chown -R ec2-user:ec2-user /opt/cloudprune
    systemctl start cloudprune.service
  fi
}

trap rollback ERR

curl -fsSL "$DEPLOY_URL" -o "$archive"
echo "$archive_sha256  $archive" | sha256sum -c -

mkdir "$stage"
tar -xzf "$archive" -C "$stage" --strip-components=1
cd "$stage"
printf '%s\n' "$commit" > .deployment-commit

npm ci --no-audit --no-fund
npm run build
node --check dist/server.js
npm prune --omit=dev --no-audit --no-fund

chown -R ec2-user:ec2-user "$stage"
mv /opt/cloudprune "$backup"
backup_made=1
mv "$stage" /opt/cloudprune
systemctl restart cloudprune.service

healthy=0
probe="/tmp/cloudprune-app-$short_commit.js"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:4321/cloudprune/ >/dev/null \
    && curl -fsS http://127.0.0.1:4321/cloudprune/app.js -o "$probe" \
    && grep -Fq 'function render' "$probe"; then
    healthy=1
    break
  fi
  sleep 2
done

if [ "$healthy" != 1 ]; then
  false
fi

trap - ERR
rm -f "$archive" "$probe"

echo "DEPLOYED_COMMIT=$commit"
echo "BACKUP_PATH=$backup"
systemctl is-active cloudprune.service
curl -fsS -o /dev/null -w 'LOCAL_STATUS=%{http_code}\n' \
  http://127.0.0.1:4321/cloudprune/demo
SCRIPT
```

Substitute only the non-secret deployment values:

```sh
CP_REMOTE_DEPLOY_SCRIPT=${CP_REMOTE_DEPLOY_SCRIPT//__COMMIT__/$CP_COMMIT}
CP_REMOTE_DEPLOY_SCRIPT=${CP_REMOTE_DEPLOY_SCRIPT//__ARCHIVE_SHA256__/$CP_ARCHIVE_SHA256}
CP_REMOTE_DEPLOY_SCRIPT=${CP_REMOTE_DEPLOY_SCRIPT//__SHORT_COMMIT__/$CP_SHORT_COMMIT}
```

Build the SSM parameters without printing the presigned URL:

```sh
CP_DEPLOY_PARAMETERS=$(
  jq -cn \
    --arg url "$CP_DEPLOY_URL" \
    --arg script "$CP_REMOTE_DEPLOY_SCRIPT" \
    '{commands:[("DEPLOY_URL=" + ($url|@sh)), $script]}'
)
```

Send the deployment:

```sh
CP_DEPLOY_COMMAND_ID=$(
  aws ssm send-command \
    --profile "$CP_AWS_PROFILE" \
    --region "$CP_AWS_REGION" \
    --instance-ids "$CP_INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Deploy CloudPrune commit $CP_SHORT_COMMIT with automatic rollback" \
    --parameters "$CP_DEPLOY_PARAMETERS" \
    --timeout-seconds 600 \
    --query 'Command.CommandId' \
    --output text
)

printf 'command_id=%s\n' "$CP_DEPLOY_COMMAND_ID"

aws ssm wait command-executed \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --command-id "$CP_DEPLOY_COMMAND_ID" \
  --instance-id "$CP_INSTANCE_ID"

aws ssm get-command-invocation \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --command-id "$CP_DEPLOY_COMMAND_ID" \
  --instance-id "$CP_INSTANCE_ID" \
  --query '{Status:Status,ResponseCode:ResponseCode,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json
```

Do not continue if the SSM status is not `Success`. Confirm that the rollback
handler restored the old release and that the service is active.

### Health-probe pitfall

Do not use this under `set -o pipefail`:

```sh
curl -fsS http://127.0.0.1:4321/cloudprune/app.js | grep -Fq expected-text
```

When `grep -q` finds the text, it can close the pipe early. `curl` then exits
with code 23, which makes a healthy deployment look failed. Download the asset
to a probe file first and run `grep` on that file, as shown above.

### Node engine warning

The production host currently uses Node `v20.20.2`. `npm ci` may warn that the
development-only Puppeteer packages prefer Node 22. The build succeeded with
Node 20 during the PR #64 deployment. Treat warnings as warnings, but stop on
installation, TypeScript, build, or runtime errors. Reconcile the declared
package engines and Puppeteer version separately rather than upgrading the
production runtime during an unrelated deploy.

## 8. Verify production

Run the complete route suite:

```sh
cd /Users/Amihai/projects/zeptrix.io/cloudprune
./scripts/verify-routes.sh https://zeptrix.io
```

Verify CloudPrune routes directly:

```sh
curl -fsS -o /dev/null -w 'HOME_STATUS=%{http_code}\n' \
  https://zeptrix.io/cloudprune/
curl -fsS -o /dev/null -w 'DEMO_STATUS=%{http_code}\n' \
  https://zeptrix.io/cloudprune/demo
curl -fsS -o /dev/null -w 'AUTOMATION_STATUS=%{http_code}\n' \
  'https://zeptrix.io/cloudprune/demo/automation'
```

For a feature-specific asset check, bypass caches and save the file before
searching it:

```sh
CP_LIVE_ASSET="/tmp/cloudprune-live-$CP_SHORT_COMMIT.js"
curl -fsS \
  "https://zeptrix.io/cloudprune/app.js?commit=$CP_SHORT_COMMIT" \
  -o "$CP_LIVE_ASSET"
rg -n 'EXPECTED_FEATURE_MARKER' "$CP_LIVE_ASSET"
unlink "$CP_LIVE_ASSET"
```

Verify the remote commit marker and service:

```sh
CP_VERIFY_COMMAND_ID=$(
  aws ssm send-command \
    --profile "$CP_AWS_PROFILE" \
    --region "$CP_AWS_REGION" \
    --instance-ids "$CP_INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Verify CloudPrune deployment $CP_SHORT_COMMIT" \
    --parameters 'commands=[
      "printf DEPLOYED_COMMIT= && cat /opt/cloudprune/.deployment-commit",
      "systemctl is-active cloudprune.service",
      "systemctl show cloudprune.service -p MainPID -p ActiveEnterTimestamp",
      "curl -fsS -o /dev/null -w LOCAL_STATUS=%{http_code} http://127.0.0.1:4321/cloudprune/demo",
      "journalctl -u cloudprune.service -n 30 --no-pager"
    ]' \
    --query 'Command.CommandId' \
    --output text
)
```

Retrieve the command as in the earlier steps and confirm:

- `DEPLOYED_COMMIT` equals `CP_COMMIT`;
- `cloudprune.service` is `active`;
- local status is 200;
- the journal contains no restart loop or configuration failure.

## 9. Remove temporary transfer artifacts

Only after production verification succeeds:

```sh
aws s3 rm \
  "s3://$CP_DEPLOY_BUCKET/$CP_S3_KEY" \
  --profile "$CP_AWS_PROFILE" \
  --region "$CP_AWS_REGION" \
  --only-show-errors

unlink "$CP_ARCHIVE"
```

This removes only the temporary deployment archive created by the current
deployment. Keep the timestamped server backup for rollback.

## Manual rollback

Use the exact `BACKUP_PATH` printed by the successful deployment. Never choose a
backup using an unresolved wildcard.

First inspect:

```sh
CP_BACKUP_PATH=/opt/cloudprune.backup-SHORT_COMMIT-TIMESTAMP
```

Confirm that exact directory exists through a read-only SSM command. Then run a
rollback command equivalent to:

```sh
set -euo pipefail

backup="/opt/cloudprune.backup-SHORT_COMMIT-TIMESTAMP"
failed="/opt/cloudprune.failed-manual-$(date -u +%Y%m%dT%H%M%SZ)"

test -d "$backup"
systemctl stop cloudprune.service
mv /opt/cloudprune "$failed"
mv "$backup" /opt/cloudprune
chown -R ec2-user:ec2-user /opt/cloudprune
systemctl start cloudprune.service
systemctl is-active cloudprune.service
curl -fsS -o /dev/null -w 'LOCAL_STATUS=%{http_code}\n' \
  http://127.0.0.1:4321/cloudprune/
```

After rollback, rerun `scripts/verify-routes.sh https://zeptrix.io`.

## Last known successful deployment

The deployment used to validate this guide was:

- PR:
  [#64 — Add Azure parity to the CloudPrune demo](https://github.com/amihai-zeptrix/zeptrix/pull/64)
- Commit: `d360a304c26608c9ef39791f58a8d8e2d41b9eb5`
- Activated: 2026-07-30 21:29 UTC
- Backup: `/opt/cloudprune.backup-d360a30-20260730T212900Z`
- Local health: 200
- Public demo: 200
- Public automation route: 200
- Full production route suite: passed

Treat this section as historical context. Always inspect the current live commit,
service, PR, and backup paths before the next deployment.
