# ⚡ AWS → Elastic Load Generator

A web UI for bulk-generating realistic AWS logs and metrics and shipping them directly to an Elastic deployment via the Elasticsearch Bulk API. Covers **185 AWS services** across **14 service groups**, all using **ECS (Elastic Common Schema)** field naming.

Each service has its correct real-world ingestion source pre-configured — S3, CloudWatch, direct API, Firehose, OTel, or Elastic Agent — matching how each service actually delivers data to Elastic in production. Switch between **Logs**, **Metrics**, and **Traces** mode; **150 services** support Metrics mode.

---

## What's New in v11.2

- **Metrics re-run errors fixed** — `version_conflict_engine_exception` responses from TSDS (`metrics-aws.*`) data streams are no longer counted as errors. When you run metrics mode a second time over the same time window, duplicate documents are silently skipped and shown in the activity log as `↷ batch N: X indexed, Y skipped (already exists)`. Only genuine indexing failures increment the error counter.
- **Metrics volume estimate clarified** — The pre-run estimate below the Ship button now reads `~N calls across X services — actual doc count varies by service (dimensional metrics generate multiple docs per call)` instead of the misleading `~N documents`. Services like Lambda, RDS, ECS, and others generate arrays of multiple metric documents per generator call (one per function/instance/cluster), so the actual indexed doc count is always higher than the call count shown.

## What's New in v11.1

- **3 new AWS service generators** — Coverage expanded from 182 to **185 services**: AWS Wavelength, Amazon Nova, Amazon Lookout for Vision.
- **3 new metrics generators** — Wavelength, Nova, Lookout for Vision now support Metrics mode (150 total).
- **185 log samples, 150 metric samples** — `samples/` regenerated.
- **3 new ingest pipelines** added to installer.

## What's New in v11.0

- **17 new AWS service generators** — Coverage expanded from 165 to **182 services**: AWS App Mesh, AWS Client VPN, AWS Cloud Map, AWS Outposts, AWS Audit Manager, Amazon Verified Permissions, AWS Payment Cryptography, AWS Artifact, Amazon DynamoDB DAX, AWS Proton, AWS AppFabric, AWS B2B Data Interchange, AWS AppConfig, AWS Elastic Disaster Recovery, AWS License Manager, AWS Chatbot, Amazon Chime SDK Voice.
- **8 new metrics services** — App Mesh, Client VPN, Cloud Map, Outposts, Verified Permissions, DAX, Chime SDK Voice, Elastic DRS now support Metrics mode (147 total).
- **182 log samples, 147 metric samples** — `samples/` regenerated with one doc per service.
- **17 Kibana dashboards, 17 ingest pipelines, 17 ML jobs** added to installers.

---

## What's New in v10.0

- **21 new AWS service generators** — Coverage expanded from 144 to **165 services**: Amazon Kendra, VPC Lattice, MWAA, AWS Fault Injection Service, Clean Rooms, Amazon DataZone, AWS Security Incident Response, AWS CloudHSM, Amazon Managed Grafana, AWS Supply Chain, IoT TwinMaker, IoT FleetWise, CodeCatalyst, Entity Resolution, Data Exchange, Device Farm, MSK Connect, Augmented AI (A2I), Deadline Cloud, HealthLake, Application Recovery Controller.
- **Services span 10 groups** — New additions distributed across Networking, Security, Streaming, Developer Tools, Analytics, AI/ML, IoT, Management, and Media.
- **165 log samples** — `samples/logs/` regenerated with one doc per service.

For older release notes see [docs/VERSION-HISTORY.md](docs/VERSION-HISTORY.md).

---

## Quick Start

### Option A — Docker Compose (recommended)

```bash
cd aws-elastic-load-generator
docker compose up -d
```

Open **http://localhost:8765** in your browser.

### Option B — Docker CLI

```bash
docker build -t aws-elastic-load-generator .
docker run -d -p 8765:80 --name aws-elastic-load-generator aws-elastic-load-generator
```

### Option C — Local dev (Node.js required)

```bash
npm install
npm run dev
# → http://localhost:3000
```

To stop Docker: `docker compose down`

---

## Recommended setup before first use

Run the four onboarding installers once before you start shipping data. They configure Elastic with the correct index templates, dashboards, ingest pipelines, and ML anomaly detection jobs. All require only Node.js 18+ and zero extra `npm install`.

### Step 1 — Install the official Elastic AWS integration

```bash
npm run setup:integration
```

**What it does:** Installs the official Elastic AWS integration package via the Kibana Fleet API. This gives you:

- Pre-built index templates for all 46 officially-supported AWS services
- ILM (Index Lifecycle Management) policies
- Pre-built Kibana dashboards for CloudTrail, VPC Flow, ALB/NLB, GuardDuty, Lambda, RDS, and more
- ML anomaly detection job configurations

**What you'll be prompted for:**

| Prompt | Where to find it |
|--------|-----------------|
| Kibana URL | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| API key | Kibana → Stack Management → API Keys → Create API key (needs `cluster: manage` + `kibana: all` privileges) |

**Example session:**

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Integration Installer              ║
╚══════════════════════════════════════════════════════╝

Kibana URL (https://...):
> https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Checking AWS integration status...
  AWS integration not installed — fetching latest version...
  Latest version: 2.34.1
  Installing aws 2.34.1...
  ✓ AWS integration installed successfully (version 2.34.1)
Done.
```

If the integration is already installed, the installer skips — it is safe to re-run at any time.

---

### Step 2 — Install custom ingest pipelines

```bash
npm run setup:pipelines
```

**What it does:** Installs Elasticsearch ingest pipelines for the ~85 AWS services not covered by the official integration. These pipelines parse the structured JSON `message` field emitted by the load generator into named fields (e.g. `glue.parsed`, `sagemaker.parsed`), making logs fully searchable and aggregatable in Kibana.

**What you'll be prompted for:**

| Prompt | Where to find it |
|--------|-----------------|
| Elasticsearch URL | Deployment overview → Elasticsearch endpoint (e.g. `https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243`) |
| API key | Kibana → Stack Management → API Keys → Create API key (needs `manage_ingest_pipelines` cluster privilege) |

**Example session:**

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Pipeline Installer          ║
╚══════════════════════════════════════════════════════╝

Elasticsearch URL:
> https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to cluster: my-deployment (8.14.0)

What would you like to do?

  1. Install pipelines
  2. Delete pipelines
  3. Delete then reinstall pipelines

Enter 1, 2, or 3:
> 1

Available pipeline groups (install):

  1. aiml        (3 pipelines)
  2. analytics    (15 pipelines)
  ...
  16. all         (install every group)

Enter number(s) comma-separated, or "all":
> all

Installing 149 pipeline(s)...

  ✓ logs-aws.glue-default — installed
  ✓ logs-aws.emr_logs-default — installed
  ...

Installed 106 / 106 pipelines.
Done.
```

You can select individual groups by number (e.g. `1,3,8`) or type `all`. Already-installed pipelines are automatically skipped.

**To update pipelines after an upgrade**, choose option `3. Delete then reinstall` — this removes existing pipelines and recreates them from the latest definitions.

---

### Step 3 — Install custom dashboards

```bash
npm run setup:dashboards
```

**What it does:** Installs pre-built Kibana dashboards for AWS services monitored by the load generator. Dashboards use ES|QL queries against the `logs-aws.*` data streams.

| Dashboard | Panels |
|-----------|--------|
| **AWS Glue — Jobs & Performance** | KPI row (total runs, success rate %, avg duration, failed runs), run outcomes (donut), runs by state (donut), failures by error category (bar), avg job duration (line), JVM heap usage (line), executor count (line), failed/killed tasks (bar), elapsed time ETL (line), records read (line), throughput by job name (bar), recent job runs (table) |
| **AWS SageMaker — Endpoints & Training** | KPI row (total invocations, avg latency, total 4xx/5xx errors), invocations over time (area), model latency (line), 4xx/5xx errors (line), GPU/CPU utilization (line), job outcomes (donut), events by job type (bar), events by action (bar), training loss & accuracy (line), recent events (table) |

**What you'll be prompted for:**

| Prompt | Where to find it |
|--------|-----------------|
| Kibana URL | Deployment overview → Kibana endpoint |
| API key | Kibana → Stack Management → API Keys → Create API key (needs `kibana_admin` role) |

**Example session:**

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Dashboard Installer         ║
╚══════════════════════════════════════════════════════╝

Kibana URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to Kibana: my-deployment (9.4.0)

What would you like to do?

  1. Install dashboards
  2. Delete dashboards
  3. Delete then reinstall dashboards

Enter 1, 2, or 3:
> 1

Available dashboards (install):

  1. AWS Glue — Jobs & Performance
  2. AWS SageMaker — Endpoints & Training
  3. all  (install every dashboard)

Enter number(s) comma-separated, or "all":
> all

Installing 2 dashboard(s)...

  ✓ "AWS Glue — Jobs & Performance" — installed (id: a1b2c3d4-...)
  ✓ "AWS SageMaker — Endpoints & Training" — installed (id: e5f6g7h8-...)

Installed 2 / 2 dashboard(s).
Done.
```

Already-installed dashboards are automatically skipped — the installer is safe to re-run at any time.

**To update dashboards after an upgrade**, choose option `3. Delete then reinstall`.

**Requires Kibana 9.4+.** For Kibana 8.11–9.3 use the legacy installer:

```bash
npm run setup:dashboards:legacy
```

Or import manually: **Stack Management → Saved Objects → Import** — select any `.ndjson` file from `installer/custom-dashboards/ndjson/`.

---

**Pipeline groups and what they cover:**

| Group | Pipelines | Key services |
|-------|-----------|-------------|
| analytics | 15 | Glue, EMR, Athena, Lake Formation, QuickSight, DataBrew, AppFlow, AppFabric, B2B Data Interchange |
| compute | 8 | EC2, EKS, Fargate, ECR, App Runner, Batch, Elastic Beanstalk, Outposts |
| databases | 10 | ElastiCache, OpenSearch, DocumentDB, Aurora, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, DAX |
| devtools | 9 | CodeCommit, CodeArtifact, Amplify, CodeGuru, DevOps Guru, Lightsail, Proton |
| enduser | 14 | WorkSpaces, Connect, AppStream, GameLift, Transfer Family, MediaConvert, MediaLive, Pinpoint, Location Service, Managed Blockchain, Fraud Detector, Lookout for Metrics, Comprehend Medical, SES |
| iot | 8 | IoT Core, Greengrass, IoT Analytics, IoT Events, IoT SiteWise, IoT Defender |
| management | 25 | CloudFormation, SSM, CloudWatch Alarms, AWS Health, Trusted Advisor, Control Tower, Organizations, Service Catalog, Service Quotas, Compute Optimizer, Budgets, Billing, RAM, Resilience Hub, Migration Hub, Network Manager, DMS, AppConfig, Elastic DRS, License Manager, Chatbot |
| media | 2 | Chime SDK Voice, (additional media services) |
| ml | 14 | SageMaker, Bedrock, Bedrock Agent, Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, Forecast, Personalize, Lex |
| networking | 9 | Shield, Global Accelerator, Direct Connect, PrivateLink, App Mesh, Client VPN, Cloud Map |
| security | 16 | Macie, IAM Access Analyzer, Cognito, KMS, Secrets Manager, ACM, IAM Identity Center, Detective, Audit Manager, Verified Permissions, Payment Cryptography, Artifact |
| serverless | 5 | Lambda, API Gateway, Step Functions, EventBridge, AppSync |
| storage | 6 | EFS, FSx, DataSync, Backup, Storage Gateway, DAX |
| streaming | 5 | Kinesis Analytics, Amazon MQ, SNS, SQS, (custom pipelines) |

**Pipeline naming convention:**

Pipelines follow the Elastic standard naming pattern:

```
logs-aws.{dataset_suffix}-default
```

e.g. `logs-aws.glue-default`, `logs-aws.sagemaker-default`, `logs-aws.lambda_logs-default`. These match the index names the load generator writes to, so pipelines are applied automatically on ingest — no additional routing configuration is needed.

### Step 4 — Install ML anomaly detection jobs

```bash
npm run setup:ml-jobs
```

**What it does:** Installs 137 Elasticsearch ML anomaly detection jobs across 22 groups — covering services that the official Elastic AWS integration does not include. Jobs are created directly via the Elasticsearch ML API.

| Prompt | Where to find it |
|--------|-----------------|
| Elasticsearch URL | Deployment overview → Elasticsearch endpoint |
| API key | Kibana → Stack Management → API Keys → Create API key (needs `manage_ml` cluster privilege) |

The installer presents four modes:

| Option | What it does |
|--------|-------------|
| `1. Install jobs` | Creates jobs and datafeeds; skips any already installed |
| `2. Stop jobs` | Stops datafeeds and closes jobs (preserves job history and model state) |
| `3. Delete jobs` | Stops, closes, then permanently deletes jobs and datafeeds |
| `4. Delete then reinstall` | Full delete pass followed by a fresh install — use this to pick up config changes (e.g. updated `query_delay`) |

After installation, the installer offers to open jobs and start datafeeds immediately. Results appear in **Kibana → Machine Learning → Anomaly Detection → Anomaly Explorer** once at least one bucket span of data has been collected.

---

**Why four separate installers?**

| | `setup:integration` | `setup:pipelines` | `setup:dashboards` | `setup:ml-jobs` |
|---|---|---|---|---|
| API used | Kibana Fleet API | Elasticsearch Ingest API | Kibana Dashboards API | Elasticsearch ML API |
| Credentials | Kibana URL + API key | Elasticsearch URL + API key | Kibana URL + API key | Elasticsearch URL + API key |
| What it configures | Dashboards, ILM, templates | Ingest pipelines | Custom Kibana dashboards | ML anomaly detection jobs |
| Re-runnable | Yes — skips if installed | Yes — skips existing | Yes — skips by title | Yes — skips existing jobs |
| Delete / reinstall | — | Yes — modes 2 & 3 | Yes — modes 2 & 3 | Yes — modes 2, 3 & 4 |
| Kibana version | Any | — | 9.4+ (or 8.11+ legacy) | — |

---

## Usage

1. **Select services** — toggle individual services, entire groups, or all 185 at once
2. **Choose mode** — **Logs** generates log documents for all 182 services; **Metrics** generates metrics documents for the 147 metrics-supported services; **Traces** generates APM trace documents for 20 services
3. **Configure volume** — set logs per service (50–5,000), error rate (0–50%), and batch size
4. **Set ingestion source** — leave on **Default (per-service)** or override all services to a single source for pipeline testing
5. **Connect to Elastic** — enter your Elasticsearch URL, API key, and index prefix
6. **Preview** — click **Preview doc** to inspect a sample document before shipping
7. **Ship** — click ⚡ **Ship** and watch real-time progress in the activity log

### Getting an Elastic API key

1. Kibana → **Stack Management** → **API Keys**
2. Click **Create API key**
3. Assign `cluster_admin` or scoped `index_admin` privileges
4. Copy the **base64** encoded key into the UI

### Index naming

Indices follow the pattern **`{prefix}.{dataset_suffix}`**. The suffix comes from the Elastic dataset field (e.g. `aws.lambda` → `lambda`, `aws.elb_logs` → `elb_logs`).

| Mode | Default prefix | Example index |
|------|---------------|---------------|
| Logs | `logs-aws` | `logs-aws.lambda`, `logs-aws.elb_logs`, `logs-aws.vpcflow` |
| Metrics | `metrics-aws` | `metrics-aws.lambda`, `metrics-aws.elb` |

Timestamps are spread across the **last 24 hours** so data appears naturally in Kibana time-based views.

---

## Elastic AWS integration coverage

Documents align with the official [Elastic AWS integration](https://github.com/elastic/integrations/tree/main/packages/aws). The table below shows which services have a native Elastic data stream and which use ECS-only (`aws.<service>`).

| Official integration | Data stream / dataset | Services |
|----------------------|----------------------|----------|
| Yes | `aws.cloudtrail` | CloudTrail |
| Yes | `aws.vpcflow` | VPC Flow |
| Yes | `aws.elb_logs` | ALB, NLB |
| Yes | `aws.guardduty` | GuardDuty |
| Yes | `aws.s3access` | S3 access logs |
| Yes | `aws.apigateway_logs` | API Gateway |
| Yes | `aws.cloudfront_logs` | CloudFront |
| Yes | `aws.lambda` / `aws.lambda_logs` | Lambda |
| Yes | `aws.firewall_logs` | Network Firewall |
| Yes | `aws.securityhub_findings` | Security Hub |
| Yes | `aws.waf` | WAF, WAF v2 |
| Yes | `aws.rds`, `aws.ec2_logs`, `aws.ecs_metrics`, `aws.config`, `aws.inspector`, `aws.dynamodb`, `aws.redshift`, `aws.emr_logs`, `aws.route53_public_logs` | RDS, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EMR, Route 53 |
| No — ECS only | `aws.<service>` | All remaining ~90 services |

For integration-backed services, field names follow the integration's index mappings so pre-built dashboards and security rules work without modification.

---

## ECS field coverage

Every document includes these standard ECS base fields:

| ECS field | Example value | Notes |
|---|---|---|
| `@timestamp` | `2025-03-11T14:22:01.000Z` | Random within last 24 hours |
| `cloud.provider` | `aws` | Always `aws` |
| `cloud.region` | `eu-west-2` or `us-east-1` | |
| `cloud.account.id` | `814726593401` | One of 5 fictitious account IDs |
| `cloud.account.name` | `globex-production` | Human-readable account alias |
| `cloud.service.name` | `lambda`, `guardduty`, … | AWS service identifier |
| `aws.dimensions` | `{ FunctionName: "api-handler" }` | Real CloudWatch dimension keys per service |
| `event.dataset` | `aws.lambda`, `aws.guardduty`, … | Routes to Elastic integration dashboards |
| `event.provider` | `lambda.amazonaws.com` | AWS endpoint that produced the event |
| `event.category` | `["network"]`, `["database"]`, … | ECS array — required for SIEM rules |
| `event.outcome` | `success` or `failure` | Derived from status / error rate |
| `event.duration` | `4500000000` | Nanoseconds — present on all time-bound services |
| `event.kind` | `event` or `alert` | Set to `alert` for security findings |
| `log.level` | `info`, `warn`, `error` | |
| `message` | Human-readable log line | |

Additional ECS field groups by service category:

| Category | ECS fields added |
|---|---|
| Security / IAM | `user.name`, `user.id`, `source.ip`, `event.action`, `error.code`, `error.message` |
| Network | `source.ip`, `destination.ip`, `network.transport`, `network.bytes`, `network.direction` |
| HTTP / API | `http.request.method`, `http.response.status_code`, `url.path`, `user_agent.original` |
| Database | `db.name`, `db.operation`, `db.type`, `error.code`, `error.message` |
| File / Storage | `file.path`, `file.size`, `file.hash.sha256` |
| Container | `container.id`, `container.image.name`, `container.image.tag`, `container.runtime` |
| Process / Compute | `host.hostname`, `host.os.platform`, `host.cpu.count`, `process.name`, `process.pid` |
| Email | `email.from.address`, `email.to.address`, `email.message_id` |
| Threat / Security | `threat.indicator.type`, `vulnerability.id`, `vulnerability.severity`, `vulnerability.score.base` |

---

## Ingestion methods

Each service defaults to the method that matches how AWS actually delivers data to Elastic in production. You can override all services to a single method for pipeline testing.

| Method | `input.type` | Default for |
|--------|-------------|-------------|
| **S3** | `aws-s3` | CloudTrail, ALB, NLB, CloudFront, WAF, WAF v2, VPC Flow, Network Firewall, S3 access logs |
| **CloudWatch** | `aws-cloudwatch` | Lambda, API Gateway, RDS, ECS, EC2, EKS, and most other services |
| **API** | `http_endpoint` | GuardDuty, Security Hub, Inspector, Config, IAM Access Analyzer, Macie, Detective, Trusted Advisor, Compute Optimizer, Budgets, Billing, Service Quotas, Fraud Detector, X-Ray |
| **Firehose** | `aws-firehose` | Kinesis Data Firehose |
| **OTel** | `opentelemetry` | Override only — adds `telemetry.sdk` and OTLP-style metadata |
| **Elastic Agent** | `logfile` | Override only — documents as if collected from log files |

When **Ingestion source** is set to **Default**, each service uses its native method. When you select an override, all selected services use that method — useful for testing a single ingest pipeline across any mix of AWS services.

---

## Fictitious AWS organisation

All documents use a consistent fictitious organisation — **Globex** — with five accounts rotating across documents to simulate a real multi-account environment.

| Account ID | Account name | Purpose |
|---|---|---|
| `814726593401` | `globex-production` | Production workloads |
| `293847561023` | `globex-staging` | Pre-production / QA |
| `738291046572` | `globex-development` | Developer sandboxes |
| `501938274650` | `globex-security-tooling` | Security services |
| `164820739518` | `globex-shared-services` | Shared infrastructure |

Regions rotate between `eu-west-2` (London) and `us-east-1` (N. Virginia).

---

## Supported services (182 total)

### 1 · Serverless & Core

| Service | Source | ECS / dataset |
|---|---|---|
| Lambda | CloudWatch | Full integration — `aws.lambda.*`, START/END/REPORT log events, X-Ray trace |
| API Gateway | CloudWatch | Full integration — `aws.apigateway.*`, `http.*`, `url.*` |
| VPC Flow | S3 | Full integration — `aws.vpcflow.*`, exact v2 space-separated format |
| CloudTrail | S3 | Full integration — `aws.cloudtrail.*`, `user.*`, `source.geo` |
| RDS | CloudWatch | Full integration — `aws.rds.*`, MySQL/PostgreSQL log formats, Enhanced Monitoring OS metrics |
| ECS | CloudWatch | Full integration — `aws.ecs.*`, `container.*`, `process.*` |

### 2 · Compute & Containers

| Service | Source | ECS / dataset |
|---|---|---|
| EC2 | CloudWatch | Full integration — `aws.ec2.*`, 22-metric CloudWatch block, `host.*` |
| EKS | CloudWatch | Full integration — `aws.eks.*`, kubelet log format, `container.*` |
| Fargate | CloudWatch | `aws.ecs_fargate.*`, `container.*`, `process.*`, metrics block |
| ECR | CloudWatch | `aws.ecr.*`, `error.*` |
| App Runner | CloudWatch | `aws.apprunner.*`, `http.*`, `url.*` |
| Batch | CloudWatch | `aws.batch.*`, `container.*`, `process.*` |
| Elastic Beanstalk | CloudWatch | `aws.elasticbeanstalk.*`, `http.*` |
| Outposts | CloudWatch | `aws.outposts.*`, capacity status, connectivity, rack/site IDs |
| Auto Scaling | CloudWatch | `aws.autoscaling.*`, metrics block |
| EC2 Image Builder | CloudWatch | `aws.imagebuilder.*`, `event.duration` |

### 3 · Networking & CDN

| Service | Source | ECS / dataset |
|---|---|---|
| ALB | S3 | Full integration — `aws.alb.*`, `source.geo`, `http.*`, `url.*` |
| NLB | S3 | `aws.nlb.*`, `source.ip`, `network.*`, 20-metric block |
| CloudFront | S3 | Full integration — `aws.cloudfront.*`, `source.geo`, 14-metric block |
| WAF | S3 | Full integration — `aws.waf.*`, threat-actor country distribution |
| WAF v2 | S3 | `aws.waf.*` |
| Route 53 | CloudWatch | Full integration — `aws.route53.*`, real resolver query log format |
| Network Firewall | S3 | `aws.network_firewall.*`, `network.*` |
| Shield | CloudWatch | `aws.shield.*`, metrics block |
| Global Accelerator | CloudWatch | `aws.globalaccelerator.*`, `network.*`, metrics block |
| Transit Gateway | CloudWatch | `aws.transitgateway.*`, `network.*` |
| Direct Connect | CloudWatch | `aws.directconnect.*`, metrics block |
| Site-to-Site VPN | CloudWatch | `aws.vpn.*` |
| PrivateLink | CloudWatch | `aws.privatelink.*` |
| VPC Lattice | CloudWatch | `aws.vpclattice.*`, `network.*`, `http.*` |
| App Mesh | CloudWatch | `aws.appmesh.*`, Envoy proxy request/response metrics, circuit breaker |
| Client VPN | CloudWatch | `aws.clientvpn.*`, `user.*`, `source.ip`, connection lifecycle |
| Cloud Map | CloudWatch | `aws.cloudmap.*`, service discovery operations, health status |

### 4 · Security & Compliance

| Service | Source | ECS / dataset |
|---|---|---|
| GuardDuty | API | Full integration — `aws.guardduty.*`, real finding type taxonomy, `threat.indicator`, `source.geo` |
| Security Hub | API | Full integration — `aws.securityhub.*`, real standards and control IDs (CIS, PCI DSS, FSBP) |
| Macie | API | `aws.macie.*`, real managed data identifier names, `file.*` |
| Inspector v2 | API | Full integration — `aws.inspector2.*`, PACKAGE_VULNERABILITY/NETWORK_REACHABILITY/CODE_VULNERABILITY, CVSS scoring, `vulnerability.*` |
| Config | API | Full integration — `aws.config.*`, real resource types and compliance states |
| IAM Access Analyzer | API | `aws.access_analyzer.*`, `user.*`, `source.ip` |
| Cognito | CloudWatch | `aws.cognito.*`, `user.*`, `source.ip`, metrics block (SignInSuccesses, ThrottleCount, etc.) |
| KMS | CloudWatch | `aws.kms.*`, `user.*`, `event.action` |
| Secrets Manager | CloudWatch | `aws.secretsmanager.*`, `user.*` |
| ACM | CloudWatch | `aws.acm.*`, certificate expiry days |
| IAM Identity Center | CloudWatch | `aws.identitycenter.*`, `user.*`, `source.ip` |
| Detective | API | `aws.detective.*` |
| Verified Access | CloudWatch | `aws.verifiedaccess.*`, device posture, trust provider type (IAM Identity Center / OIDC), verdict/deny_reason |
| Security Lake | S3 | `aws.securitylake.*`, OCSF 1.1.0 — 6 event classes (API_ACTIVITY, NETWORK_ACTIVITY, DNS_ACTIVITY, HTTP_ACTIVITY, AUTHENTICATION, SECURITY_FINDING) |
| Security Incident Response | API | `aws.securityir.*`, case lifecycle, severity, `event.outcome` |
| CloudHSM | CloudWatch | `aws.cloudhsm.*`, HSM operation types, key usage |
| Audit Manager | API | `aws.auditmanager.*`, compliance assessment evidence, NON_COMPLIANT controls |
| Verified Permissions | CloudWatch | `aws.verifiedpermissions.*`, Cedar policy ALLOW/DENY decisions, eval time |
| Payment Cryptography | CloudWatch | `aws.paymentcryptography.*`, TR31 PIN/MAC/CVV key operations |
| Artifact | API | `aws.artifact.*`, `user.*`, compliance report access audit |

### 5 · Storage & Databases

| Service | Source | ECS / dataset |
|---|---|---|
| S3 | S3 | Full integration — `aws.s3.*`, access log format |
| DynamoDB | CloudWatch | Full integration — `aws.dynamodb.*`, structured logging, 12-metric block |
| ElastiCache | CloudWatch | Full integration — `aws.elasticache.*`, 20-metric block |
| Redshift | CloudWatch | Full integration — `aws.redshift.*`, 18-metric block |
| OpenSearch | CloudWatch | Full integration — `aws.opensearch.*`, `http.*`, 11-metric block |
| DocumentDB | CloudWatch | Full integration — `aws.docdb.*`, 12-metric block |
| EFS | CloudWatch | `aws.efs.*`, `file.*` |
| FSx | CloudWatch | `aws.fsx.*`, `file.*` |
| DataSync | CloudWatch | `aws.datasync.*`, `file.*` |
| Backup | CloudWatch | `aws.backup.*` |
| Storage Gateway | CloudWatch | `aws.storagegateway.*` |
| EBS | CloudWatch | `aws.ebs.*`, `host.*` |
| Aurora | CloudWatch | `aws.aurora.*`, Aurora-specific metrics (BinlogReplicaLag, ServerlessCapacity, ACUUtilization) |
| Neptune | CloudWatch | `aws.neptune.*`, Gremlin/SPARQL/openCypher query types |
| Timestream | CloudWatch | `aws.timestream.*` |
| QLDB | CloudWatch | `aws.qldb.*`, ledger/transaction model |
| DynamoDB DAX | CloudWatch | `aws.dax.*`, cache hit/miss, request latency, throughput errors |
| Keyspaces | CloudWatch | `aws.keyspaces.*` |
| MemoryDB | CloudWatch | `aws.memorydb.*` |

### 6 · Streaming & Messaging

| Service | Source | ECS / dataset |
|---|---|---|
| Kinesis Streams | CloudWatch | Full integration — `aws.kinesis.*` |
| Kinesis Data Firehose | Firehose | Full integration — `aws.firehose.*` |
| Kinesis Analytics | CloudWatch | `aws.kinesisanalytics.*` |
| MSK (Kafka) | CloudWatch | Full integration — `aws.msk.*` |
| SQS | CloudWatch | Full integration — `aws.sqs.*` |
| SNS | CloudWatch | `aws.sns.*`, metrics block |
| Amazon MQ | CloudWatch | `aws.amazonmq.*`, metrics block |
| EventBridge | CloudWatch | Full integration — `aws.eventbridge.*` |
| Step Functions | CloudWatch | Full integration — `aws.stepfunctions.*` |
| MSK Connect | CloudWatch | `aws.mskconnect.*`, connector task lifecycle, offset lag |
| AppSync | CloudWatch | `aws.appsync.*`, `http.*`, metrics block |

### 7 · Developer & CI/CD

| Service | Source | ECS / dataset |
|---|---|---|
| CodeBuild | CloudWatch | Full integration — `aws.codebuild.*` |
| CodePipeline | CloudWatch | Full integration — `aws.codepipeline.*` |
| CodeDeploy | CloudWatch | Full integration — `aws.codedeploy.*` |
| CodeCommit | CloudWatch | `aws.codecommit.*`, `user.*` |
| CodeArtifact | CloudWatch | `aws.codeartifact.*` |
| Amplify | CloudWatch | `aws.amplify.*`, `http.*` |
| X-Ray | API | Full integration — `aws.xray.*`, trace segments, subsegments |
| CodeGuru | CloudWatch | `aws.codeguru.*` |
| DevOps Guru | CloudWatch | `aws.devopsguru.*` |
| CodeCatalyst | CloudWatch | `aws.codecatalyst.*`, workflow runs, dev environments |
| Device Farm | CloudWatch | `aws.devicefarm.*`, mobile/browser test run results |
| Proton | CloudWatch | `aws.proton.*`, IaC environment & service deployment lifecycle |

### 8 · Analytics

| Service | Source | ECS / dataset |
|---|---|---|
| EMR | CloudWatch | `aws.emr.*`, step/cluster lifecycle messages |
| Glue | CloudWatch | `aws.glue.*`, structured JSON continuous logging |
| Athena | CloudWatch | `aws.athena.*`, metrics block |
| Lake Formation | CloudWatch | `aws.lakeformation.*`, `user.*` |
| QuickSight | CloudWatch | `aws.quicksight.*`, `user.*`, `http.*` |
| DataBrew | CloudWatch | `aws.databrew.*` |
| AppFlow | CloudWatch | `aws.appflow.*` |
| MWAA (Managed Airflow) | CloudWatch | `aws.mwaa.*`, DAG and task execution lifecycle |
| Clean Rooms | CloudWatch | `aws.cleanrooms.*`, protected query lifecycle |
| DataZone | CloudWatch | `aws.datazone.*`, data catalog and governance events |
| Entity Resolution | CloudWatch | `aws.entityresolution.*`, matching workflow jobs |
| Data Exchange | CloudWatch | `aws.dataexchange.*`, subscription and job events |
| AppFabric | API | `aws.appfabric.*`, SaaS audit log normalisation to OCSF, `user.email`, `source.ip` |
| B2B Data Interchange | CloudWatch | `aws.b2bi.*`, EDI X12/EDIFACT transformation, partner transactions |

### 9 · AI & Machine Learning

| Service | Source | ECS / dataset |
|---|---|---|
| SageMaker | CloudWatch | `aws.sagemaker.*`, training metrics, Studio logging, lifecycle messages, CloudWatch endpoint metrics |
| Bedrock | CloudWatch | `aws.bedrock.*`, token counts, invocation latency, metrics block |
| Bedrock Agent | CloudWatch | `aws.bedrockagent.*`, agent + knowledge-base invocations |
| Rekognition | CloudWatch | `aws.rekognition.*` |
| Textract | CloudWatch | `aws.textract.*` |
| Comprehend | CloudWatch | `aws.comprehend.*` |
| Comprehend Medical | CloudWatch | `aws.comprehendmedical.*` |
| Translate | CloudWatch | `aws.translate.*` |
| Transcribe | CloudWatch | `aws.transcribe.*` |
| Polly | CloudWatch | `aws.polly.*` |
| Forecast | CloudWatch | `aws.forecast.*` |
| Personalize | CloudWatch | `aws.personalize.*` |
| Lex | CloudWatch | `aws.lex.*`, `user.*` |
| Lookout for Metrics | CloudWatch | `aws.lookoutmetrics.*` |
| Q Business | CloudWatch | `aws.qbusiness.*`, QUERY/DOCUMENT_RETRIEVAL/PLUGIN_INVOCATION events, retrieved document attribution, guardrail tracking, token counts |
| Kendra | CloudWatch | `aws.kendra.*`, enterprise search queries, index sync events |
| Augmented AI (A2I) | CloudWatch | `aws.a2i.*`, human review loop lifecycle, reviewer outcomes |
| HealthLake | CloudWatch | `aws.healthlake.*`, FHIR data store operations, import/export jobs |

### 10 · IoT

| Service | Source | ECS / dataset |
|---|---|---|
| IoT Core | CloudWatch | `aws.iot.*`, `source.ip`, metrics block |
| Greengrass | CloudWatch | `aws.greengrass.*`, metrics block |
| IoT Analytics | CloudWatch | `aws.iotanalytics.*` |
| IoT Events | CloudWatch | `aws.iotevents.*` |
| IoT SiteWise | CloudWatch | `aws.iotsitewise.*`, asset/property model |
| IoT Defender | CloudWatch | `aws.iotdefender.*` |
| IoT TwinMaker | CloudWatch | `aws.iottwinmaker.*`, digital twin sync and component operations |
| IoT FleetWise | CloudWatch | `aws.iotfleetwise.*`, vehicle signal campaign delivery |

### 11 · Management & Governance

| Service | Source | ECS / dataset |
|---|---|---|
| CloudFormation | CloudWatch | `aws.cloudformation.*`, `user.*`, `event.action`, structured change events |
| Systems Manager | CloudWatch | `aws.ssm.*`, `host.*`, `user.*`, command execution lifecycle |
| CloudWatch Alarms | CloudWatch | `aws.cloudwatch.*` |
| AWS Health | CloudWatch | `aws.health.*` |
| Trusted Advisor | API | `aws.trustedadvisor.*` |
| Control Tower | CloudWatch | `aws.controltower.*`, `user.*` |
| Organizations | CloudWatch | `aws.organizations.*`, `user.*` |
| Service Catalog | CloudWatch | `aws.servicecatalog.*`, `user.*`, `event.action` |
| Service Quotas | API | `aws.servicequotas.*` |
| Compute Optimizer | API | `aws.computeoptimizer.*` |
| Budgets | API | `aws.budgets.*` |
| Billing | API | `aws.billing.*` |
| Resource Access Manager | CloudWatch | `aws.ram.*`, `user.*` |
| Resilience Hub | CloudWatch | `aws.resiliencehub.*` |
| Migration Hub | CloudWatch | `aws.migrationhub.*` |
| Network Manager | CloudWatch | `aws.networkmanager.*` |
| DMS | CloudWatch | `aws.dms.*`, 17-metric block |
| Fault Injection Service | CloudWatch | `aws.fis.*`, chaos experiment lifecycle, stop conditions |
| Managed Grafana | CloudWatch | `aws.managedgrafana.*`, workspace alerts, user sync |
| Supply Chain | CloudWatch | `aws.supplychain.*`, planning and integration events |
| App Recovery Controller | CloudWatch | `aws.arc.*`, zonal shift lifecycle, readiness checks |
| AppConfig | CloudWatch | `aws.appconfig.*`, deployment state, rollback, percentage complete |
| Elastic Disaster Recovery | CloudWatch | `aws.drs.*`, replication lag, data replication state, RPO |
| License Manager | CloudWatch | `aws.licensemanager.*`, consumed licenses, utilisation percentage |
| Chatbot | CloudWatch | `aws.chatbot.*`, notification delivery, channel type, SNS topic |

### 12 · Media & End-User Computing

| Service | Source | ECS / dataset |
|---|---|---|
| MediaConvert | CloudWatch | `aws.mediaconvert.*`, metrics block |
| MediaLive | CloudWatch | `aws.medialive.*`, metrics block |
| WorkSpaces | CloudWatch | `aws.workspaces.*`, `user.*`, `source.ip`, metrics block |
| Amazon Connect | CloudWatch | `aws.connect.*`, `user.*`, metrics block (ContactsQueued, AverageHandleTime, ServiceLevel) |
| AppStream | CloudWatch | `aws.appstream.*`, `user.*` |
| GameLift | CloudWatch | `aws.gamelift.*`, 13-metric block |
| Deadline Cloud | CloudWatch | `aws.deadlinecloud.*`, render farm job and task lifecycle |
| Chime SDK Voice | CloudWatch | `aws.chimesdkvoice.*`, call quality, MOS score, SIP response code |

### 13 · Messaging & Communications

| Service | Source | ECS / dataset |
|---|---|---|
| SES | CloudWatch | `aws.ses.*`, `email.*`, 9-metric block |
| Pinpoint | CloudWatch | `aws.pinpoint.*`, `email.*` |

### 14 · Additional Services

| Service | Source | ECS / dataset |
|---|---|---|
| Transfer Family | CloudWatch | `aws.transfer.*`, `file.*`, `source.ip` |
| Lightsail | CloudWatch | `aws.lightsail.*` |
| Fraud Detector | API | `aws.frauddetector.*`, `source.ip` |
| Location Service | CloudWatch | `aws.location.*` |
| Managed Blockchain | CloudWatch | `aws.blockchain.*` |

---

## Configuration reference

| Setting | Default | Range | Description |
|---|---|---|---|
| Event type | Logs | Logs / Metrics / Traces | **Logs** — all 185 services. **Metrics** — 150 metrics-supported services. **Traces** — 20 trace-supported services. |
| Logs/metrics per service | 500 | 50–5,000 | Documents generated per selected service |
| Error rate | 5% | 0–50% | Fraction of documents representing errors/failures |
| Batch size | 250 | 50–1,000 | Documents per `_bulk` API request |
| Index prefix | `logs-aws` / `metrics-aws` | — | Switches automatically by mode; override with any custom prefix |
| Ingestion source | Default | Default + 6 overrides | Sets `input.type` on every document |
| `data_stream.dataset` | auto | — | Integration-backed services use the Elastic dataset name; others use `aws.<service>` |

---

## Sample data

The **samples/** directory contains one sample document per service generated by the same logic as the app:

- **samples/logs/** — 185 JSON log documents, one per service
- **samples/metrics/** — 150 JSON metrics documents, one per metrics-supported service
- **samples/traces/** — 20 JSON APM trace documents, one per trace-supported service

Regenerate with: `npm run samples`

---

## Elastic Serverless

Works with Elastic Serverless projects without code changes. Assign the **Editor** project role (or a custom role with `index` privileges on `aws-logs-*`) instead of `cluster_admin`. Paste your Serverless project URL directly — the `_bulk` API behaves identically.

---

## Architecture

```
Browser → nginx (port 80) → React SPA
                                ↓
                         /proxy/_bulk
                                ↓
                     Node.js proxy (port 3001)
                                ↓
                  Elasticsearch _bulk API (server-side)
                                ↓
                  Elastic Cloud or Elastic Serverless
```

All data goes directly from your browser → proxy → your Elastic deployment. Nothing is stored or logged in between.

---

## Docker image

- **Build**: `node:20-alpine` → **Runtime**: `node:20-alpine` + nginx + supervisor
- **Host port**: 8765 → container port 80
- **Health check**: `GET /health` → 200 OK
- **Processes**: nginx (serves the React SPA) + Node.js proxy (forwards `_bulk` requests to Elastic)

---

## Contributors & acknowledgments

This project was developed with AI-assisted tooling:

- **[Claude Code](https://claude.ai/claude-code)** — Code generation, refactoring, and documentation
- **Human maintainer** — You (the repo owner) remain the author and maintainer

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full contributor list.
