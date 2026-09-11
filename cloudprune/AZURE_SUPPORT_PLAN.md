# Azure support plan

## Scope of this release

This release adds complete Azure use-case parity to the CloudPrune demo. Azure
service spend, recommendations, provider filtering, anomaly filtering, and
dry-run workflow previews are synthetic and make no Azure API calls.

The demo labels this boundary next to the provider filter. Live AWS assessment
continues to use the existing read-only connector; live Azure subscription
scanning is a separate implementation phase.

## Demo use-case parity

| AWS use case | Azure counterpart | Demo recommendation |
| --- | --- | --- |
| Savings Plans | Azure savings plan and reservation comparison | `azure-compute-commitments` |
| Unattached EBS volumes | Unattached managed disks | `azure-idle-managed-disks` |
| Unassociated Elastic IPs | Unassociated public IP resources | `azure-idle-public-ips` |
| S3 and CloudWatch lifecycle | Blob lifecycle and Log Analytics retention | `azure-storage-lifecycle` |
| EC2 application consolidation | Azure VM consolidation | `azure-vm-consolidation` |
| Idle load balancers | Idle Azure Load Balancer or Application Gateway review | `azure-idle-load-balancers` |
| EC2 rightsizing | Azure Advisor and Monitor VM rightsizing | `azure-vm-rightsizing` |
| EC2-to-Lambda assessment | Azure VM jobs to Functions or Container Apps jobs | `azure-functions-assessment` |
| RDS rightsizing | Azure SQL service-objective rightsizing | `azure-sql-rightsizing` |
| NAT gateway review | Azure NAT Gateway, Private Link, endpoints, and cross-zone review | `azure-network-egress-review` |
| Kubernetes capacity | AKS node-pool consolidation | `azure-aks-consolidation` |

Every Azure demo recommendation includes impact, effort, risk, ownership, supporting
statistics, a lower-impact path, rollback guidance, and a selectable dry-run
workflow for operator review. Azure workflows remain review-only regardless of
their modeled effort because no live Azure execution path exists.

## Demo-account UX

Selecting Azure changes:

- spend and KPI totals to the Azure demo estate;
- services to Virtual Machines, Azure SQL, AKS, Storage & Monitor, and
  Networking;
- the recommendation inbox to all eleven Azure use cases;
- service/vendor/complexity grouping and filtering;
- anomalies to Azure-specific signals;
- the dry-run queue to the selected Azure workflow; no Azure action is marked
  eligible for execution.

The demo notice explicitly states:

- values are synthetic demo data;
- no live cloud credentials were used;
- live Azure subscription scanning is not enabled;
- live AWS connection remains a separate signed-in workflow.

The top-level connection action is consequently labeled `Connect AWS`, not the
provider-neutral `Connect cloud`.

## Live Azure connector design

### Authentication and scope

- Use a Microsoft Entra service principal or workload identity.
- Keep tenant IDs, client credentials, and access tokens server-side.
- Require an explicit tenant, billing scope, subscription allowlist, and Azure
  cloud environment.
- Verify identity and subscription access before starting a scan.
- Show the exact reviewed scope without exposing secrets.

### Least privilege

Prefer built-in roles at the narrowest permitted scope:

- `Reader` for resource inventory;
- `Cost Management Reader` for cost and usage;
- `Monitoring Reader` for Azure Monitor metrics;
- `Log Analytics Reader` only where table metadata or query evidence is
  required.

Assessment must not request Owner, Contributor, User Access Administrator, or
provider write permissions. Missing optional access should produce partial
coverage warnings, never zero-valued findings.

### Collectors

Implement bounded provider adapters for:

- Azure Resource Graph inventory;
- Azure Advisor and Azure Monitor VM/SQL metrics;
- Cost Management usage, reservations, and savings-plan eligibility;
- Storage lifecycle and Log Analytics retention/ingestion;
- NAT Gateway, Network Watcher, routing, zones, and private endpoints;
- AKS inventory and metrics.

Each adapter needs explicit region/subscription, pagination, inventory,
concurrency, lookback, and request-timeout caps analogous to the AWS scanner.

### Finding contract

Normalize Azure findings into the existing CloudPrune recommendation contract:

- estimated monthly savings, currency, and calculation source;
- confidence and observation window;
- blast radius, operational risk, and downtime risk;
- affected resources;
- missing signals and permissions;
- lower-impact implementation path;
- rollback guidance and validation metrics.

Do not combine Azure billing-currency values with USD demo totals without
conversion metadata.

### Safety sequence

The first live Azure milestone should be read-only validation against an exact,
server-owned, expiring manifest. It should verify tenant/subscription identity,
resource fingerprints, dependencies, locks, protected tags, and freshness.
Mutation should remain a later milestone with separate authorization for
destructive cleanup, financial commitments, restarts, retention reduction, and
routing changes.

## Acceptance criteria

- Azure filter shows five service groups and eleven recommendations.
- Azure recommendations cover every AWS demo engine family plus AKS.
- Vendor, service, and complexity filters remain accurate.
- Azure anomalies do not appear under another provider filter.
- Synthetic KPI data is labeled as modeled demo data.
- No UI claims a live Azure tenant was scanned.
- Tests cover the Azure catalog, provider filtering, service grouping, and demo
  boundary copy.
