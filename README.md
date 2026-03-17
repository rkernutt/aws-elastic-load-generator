# ⚡ AWS → Elastic Load Generator

**v7.6** — A web UI for bulk-generating realistic AWS logs and metrics and shipping them directly to an Elastic Cloud deployment via the Elasticsearch Bulk API. Covers **136 AWS services** across **14 themed groups**, all using **ECS (Elastic Common Schema)** field naming.

Each service has its **correct real-world ingestion source** pre-configured — S3, CloudWatch, direct API, Firehose, **OTel** (OpenTelemetry), or **Elastic Agent** — matching how each service actually delivers data to Elastic in production. You can leave **Default (per-service)** or override all services to a single ingestion method (e.g. OTel) for testing. Switch between **Logs** and **Metrics** mode; only the **46** services with Elastic metrics support are selectable in Metrics mode.

---

## What's New in v7.6

- **Full AWS CloudWatch fidelity across all 136 generators** — Every generator now uses real AWS CloudWatch metric names, dimensions, and stat types (`sum` for counters, `avg` for gauges). Previously, many services used invented or misnamed metric fields; all are now aligned with the official AWS CloudWatch namespace documentation.
- **`event.category` on all generators** — Every generator now emits `event.category` as a proper ECS array (e.g. `["web","network"]`, `["database"]`, `["process","container"]`, `["intrusion_detection","network"]`). This is required for Elastic Security categorisation, SIEM rules, and dashboard filtering.
- **Metrics blocks added to 30+ previously uncovered services** — Services that had no CloudWatch metrics block now have complete, realistic metric sets including: all 6 IoT services, EFS, FSx, StorageGateway, DataSync, NLB (20 metrics), CloudFront (14 metrics), Route53 (7 metrics), NetworkFirewall, TransitGateway, NatGateway, SSM, DMS (17 metrics), CloudFormation, SES (9 metrics), GameLift (13 metrics), Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, EventBridge, and more.
- **Realistic error codes matched to AWS API exceptions** — All generators now draw from real AWS API error code lists (e.g. `ProvisionedThroughputExceededException` for Kinesis, `ConditionalCheckFailedException` for DynamoDB, `DBInstanceNotFound` for RDS, `ClusterNotFoundException` for ECS). Previously most services used generic or invented codes.
- **Authentic log message formats** — Messages now match what AWS actually writes to CloudWatch Logs: RDS emits MySQL slow-query format (`Query_time: X Lock_time: Y Rows_sent: Z`) and PostgreSQL format (`LOG: duration: X ms statement:`, `FATAL: role does not exist`); VPC Flow Logs emit the exact v2 space-separated format (`2 <acct> <eni> <src> <dst> <srcPort> <dstPort> <proto> <pkts> <bytes> <start> <end> <action> OK`); Route53 emits real resolver query log format; EC2 emits `cloud-init`, `systemd`, and `kernel:` patterns; CloudTrail maps event names realistically per service.
- **Geo data on network and web services** — ALB, CloudFront, WAF/WAFv2, API Gateway, Route53, CloudTrail, and GuardDuty now emit `client.geo` / `source.geo` with `country_iso_code`, `country_name`, and `city_name`. WAF and GuardDuty use threat-actor-realistic country distributions.
- **Real GuardDuty finding types** — Uses actual GuardDuty finding type taxonomy (`ThreatPurpose:ResourceType/ThreatFamilyName.DetectionMechanism!Artifact`), e.g. `UnauthorizedAccess:EC2/SSHBruteForce`, `CryptoCurrency:EC2/BitcoinTool.B!DNS`, `Exfiltration:S3/MaliciousIPCaller`.
- **Security Hub, Macie, Inspector fidelity** — Security Hub uses real standards (`CIS AWS Foundations Benchmark v1.4.0`, `AWS Foundational Security Best Practices v1.0.0`, `PCI DSS v3.2.1`) and real control IDs (`CIS.1.1`, `IAM.1`, `S3.2`). Macie uses real managed data identifier names (`AWS_CREDENTIALS`, `CREDIT_CARD_NUMBER`, `SSN_US`). Inspector emits real CVE IDs with `vulnerability.id`, `vulnerability.severity`, and `vulnerability.score.base` ECS fields.
- **Container and process ECS fields** — ECS, EKS, Fargate, and Batch now emit full `container` objects (`id`, `image.name`, `image.tag`, `runtime`) and `process` objects (`pid`, `name`, `exit_code`). EKS messages use kubelet log format when unstructured.
- **Expanded EC2 host and metrics** — EC2 now includes `host.architecture`, `host.cpu.count`, `host.os.kernel`, `host.os.version` and a full 22-metric CloudWatch block including all EBS, network packet, CPU credit, and status check metrics.
- **Aurora, Neptune, DocumentDB metrics** — Aurora emits Aurora-specific CloudWatch metrics (`AuroraBinlogReplicaLag`, `ServerlessDatabaseCapacity`, `ACUUtilization`, backtrack metrics). Neptune and DocumentDB have appropriate metrics and real error codes.
- **Lambda X-Ray trace in REPORT** — 20% of Lambda REPORT log events now include a real-format X-Ray trace line: `XRay TraceId: 1-... SegmentId: ... Sampled: true`.

Older release notes: [Version What's New Archive](#version-whats-new-archive).

---

## What's New in v7.5

- **Lambda START / END / REPORT log events** — The Lambda generator now randomly emits one of four authentic log event types per document: `START RequestId:`, `END RequestId:`, `REPORT RequestId: Duration: X ms Billed Duration: Y ms Memory Size: Z MB Max Memory Used: W MB` (with optional cold-start `Init Duration`), or a structured application log. Matches real CloudWatch Lambda log streams. The `aws.lambda.log_event_type` field indicates which type was produced.
- **RDS Enhanced Monitoring OS metrics** — When `enhanced_monitoring: true` (≈55% of RDS docs), the generator now emits a full `aws.rds.os_metrics` block — `cpuUtilization` (user/system/wait/idle/irq/total), `memory` (total/free/cached/active/inactive/buffers), `disk` (readIOsPS/writeIOsPS/readKbPS/writeKbPS/avgQueueLen/await), `network` (rx/tx), `numVCPUs`, and `uptime` — matching the RDSOSMetrics format published to CloudWatch Logs.
- **`event.duration` on all 136 generators** — Every time-bound generator now emits `event.duration` (nanoseconds) in the ECS `event` object. Previously missing on all IoT, most management, most end-user, and several storage generators. Enables latency dashboards and ML anomaly detection across all services.
- **`ship()` refactored** — The inner per-service shipping loop is now a named `shipService()` helper function. Progress updates are emitted after each batch within a service (showing live incremental counts rather than only updating between services).
- **`makeSetup()` helper** — `src/helpers/index.js` exports `makeSetup(er)` returning `{ region, acct, isErr }` to DRY up the boilerplate common to every generator. Applied to IoT generators; available for future generator additions.
- **Dev-mode localStorage warnings** — `localStorage` read/write failures now emit `console.warn` in development mode (suppressed in production), making private-browsing and quota issues visible during development.
- **Expanded test coverage** — Added three new test suites:
  - `src/generators/generators.test.js` — Shape-validation tests for all 14 generator modules (IoT, management, end-user, storage, databases, serverless, compute, networking, security, streaming, devtools, analytics, ML), plus Lambda log-event-type assertions, RDS Enhanced Monitoring shape, and error-rate consistency tests.
  - `src/utils/ship.test.js` — Ship workflow integration tests with mocked `fetch`: NDJSON batch assembly, full-success / partial-error / server-error / network-error response handling, index name construction, and `stripNulls` correctness.
  - `src/utils/proxy.test.js` — Proxy retry logic unit tests: exponential backoff values, retryable status codes (5xx only), retryable error codes (ECONNRESET/ETIMEDOUT/ECONNREFUSED), and MAX_RETRIES exhaustion.

Older release notes: [Version What's New Archive](#version-whats-new-archive).

---

## What's New in v7.4

- **Log and message-pool enhancements** — Lifecycle and message-pool improvements for easier search and correlation (aligned with [docs/IMPROVEMENT-SUGGESTIONS.md](docs/IMPROVEMENT-SUGGESTIONS.md) and [docs/ENHANCEMENT-CANDIDATES.md](docs/ENHANCEMENT-CANDIDATES.md)):
  - **SageMaker** — Job-type-specific lifecycle messages: “Training job started/succeeded/failed”, “Processing job started/succeeded/failed”, “Endpoint creation started/succeeded/failed”, “Pipeline execution started/succeeded/failed”, and equivalent for Transform and HyperparameterTuning. Message pool is built from the active job type so logs match the operation.
  - **CodeBuild** — “Build started”, “Build succeeded”, “Build failed” and phase-level messages (e.g. “Phase BUILD completed in 120s”) added and weighted so lifecycle and phase messages appear more often.
  - **Athena** — “Query started”, “Query succeeded”, “Query failed” emphasized in the message pool for clearer query-lifecycle visibility.
- **High-impact coverage** — EMR, Batch, DataBrew, and AppFlow already provide run_state (where applicable), “Job run started/succeeded/failed” / “Flow run started/succeeded/failed” message pools, and `aws.<service>.metrics` (including elapsedTime/Duration, records_processed, etc.). No code changes in v7.4; documented in the improvement suggestions checklist.

Older release notes: [Version What's New Archive](#version-whats-new-archive).

---

## What's New in v7.3

- **Input validation** — Elasticsearch URL, API key, and index prefix are validated on blur and before Ship. Invalid fields show inline errors and disable the Ship button until fixed. URL must be HTTPS with a proper hostname; API key has minimum length and character rules; index prefix allows only letters, numbers, hyphens, and underscores.
- **React error boundary** — The app is wrapped in an error boundary that catches rendering errors and shows a fallback UI with a "Try again" action instead of a blank screen.
- **Proxy timeout and retries** — The Node.js bulk proxy (`proxy.js`) uses a configurable request timeout (default 120s via `PROXY_REQUEST_TIMEOUT_MS`) and retries with exponential backoff (up to 3 retries) on 5xx, timeouts, and connection errors.
- **Configurable batch delay** — A **Batch delay (ms)** slider (0–2000 ms) in Volume & Settings controls the pause between bulk requests. Persisted with saved config. Reduces load on Elastic when shipping large volumes.
- **Unit tests (Vitest)** — Smoke tests with Vitest and jsdom: helpers (`stripNulls`, `rand`, `randInt`, etc.), validation (URL, API key, index prefix), and generator shape (Lambda, API Gateway). Run with `npm run test`; watch mode with `npm run test:watch`.
- **CSS modules** — Main layout and shared controls (root, header, main, inputs, buttons, log box, preview) use `App.module.css` instead of inline styles. Dynamic values (e.g. group colors) remain inline where needed.
- **JSDoc on generators** — Generator modules and key functions (e.g. `serverless.js`, `storage.js`, `generators/index.js`) include JSDoc (`@module`, `@param`, `@returns`) for better editor support and documentation.

Older release notes: [Version What's New Archive](#version-whats-new-archive).

---

## What's New in v7.2

- **NAT Gateway** — Added `natgateway` service to the Networking & CDN group. Generates realistic NAT Gateway connection and traffic metrics (bytes, packets, connections, port allocation errors) mapped to `aws.natgateway`. Available in both Logs and Metrics mode.
- **Cost estimation** — A doc count estimate now appears below the Ship button when services are selected: `~{N} documents across {X} services ({B} batches)`. Helps confirm volume before shipping.
- **Save / restore config** — Connection settings, volume sliders, and ingestion preferences are now persisted to `localStorage` and restored on next visit. A **Clear saved config** button resets to defaults.
- **Module split** — The codebase has been refactored from a monolithic `App.jsx` (~5000 lines) into focused ES modules: `src/helpers/`, `src/theme/`, `src/data/`, `src/generators/` (14 category files), and `src/components/`. `App.jsx` now contains only React state, logic, and JSX.

---

## What's New in v7.1

- **Kibana-inspired UI** — The web UI has been redesigned to follow the **Kibana / Elastic UI (EUI)** design language: dark top bar (`#1D1E24`), light content background (`#F6F9FC`), EUI primary blue (`#0B64DD`) for actions and focus, and semantic colors for success, warning, and danger. Cards, form controls, buttons, and status pills now use EUI-aligned tokens for a consistent look when used alongside Kibana and Elastic Cloud.
- **Design tokens** — A central `K` token set in the app aligns with EUI colors (backgrounds, borders, text, success/warning/danger) and spacing so future UI changes stay consistent with Elastic’s design system.
- **Simplified layout** — Single dark header with logo and status; compact page title and description; main content in a constrained width with clear card hierarchy. Ship button label correctly reflects **Logs** vs **Metrics** mode.

Older release notes: [Version What's New Archive](#version-whats-new-archive).

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

## Usage

1. **Select services** — toggle individual services, entire groups, or all 136 at once
2. **Configure volume** — set logs per service (50–5,000), error rate (0–50%), and batch size
3. **Set ingestion source** — leave on **Default (per-service)** or override all services to a specific source
4. **Connect to Elastic** — enter your Elasticsearch URL, API key, and index prefix
5. **Preview a document** — click **Preview doc** to inspect a sample before shipping
6. **Ship** — click ⚡ **Ship** and watch real-time progress in the activity log (logs or metrics depending on mode)

### Getting an Elastic API Key

1. Open Kibana → **Stack Management** → **API Keys**
2. Click **Create API key**
3. Assign `cluster_admin` or scoped `index_admin` privileges
4. Copy the **base64** encoded key into the UI

### Index naming

Indices are named **`{prefix}.{dataset_suffix}`** (a **dot** between prefix and suffix). The suffix is derived from the Elastic dataset (e.g. `aws.lambda` → `lambda`, `aws.elb_logs` → `elb_logs`). In **Logs** mode (default prefix `logs-aws`): e.g. `logs-aws.lambda`, `logs-aws.elb_logs`, `logs-aws.vpcflow`. In **Metrics** mode (prefix `metrics-aws`): e.g. `metrics-aws.lambda`, `metrics-aws.elb`. Services without a dedicated integration use `logs-aws.{service}` or `metrics-aws.{service}` as applicable.

Timestamps are spread across the **last 24 hours** so data appears naturally in Kibana time-based views.

---

## Elastic AWS integration coverage

Generated documents are aligned with the **AWS** and **Custom AWS Logs** integrations in Elastic ([elastic/integrations](https://github.com/elastic/integrations/tree/main/packages/aws)). The table below indicates which app services map to an official data stream and which use ECS-only (no dedicated integration).

| Has Elastic integration | Data stream / dataset | App services |
|-------------------------|------------------------|--------------|
| Yes | `aws.cloudtrail` | CloudTrail |
| Yes | `aws.vpcflow` | VPC Flow |
| Yes | `aws.elb_logs` | ALB, NLB |
| Yes | `aws.guardduty` | GuardDuty |
| Yes | `aws.s3access` | S3 (access logs) |
| Yes | `aws.apigateway_logs` | API Gateway |
| Yes | `aws.cloudfront_logs` | CloudFront |
| Yes | `aws.lambda` / `aws.lambda_logs` | Lambda |
| Yes | `aws.firewall_logs` | Network Firewall |
| Yes | `aws.securityhub_findings` | Security Hub |
| Yes | `aws.waf` | WAF, WAF v2 |
| Yes | `aws.rds`, `aws.ec2_logs`, `aws.ecs_metrics`, `aws.config`, `aws.inspector`, `aws.dynamodb`, `aws.redshift`, `aws.emr_logs`, `aws.route53_public_logs` | RDS, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EMR, Route 53 |
| No (ECS only) | `aws.<service>` | All other 100+ services (Batch, Beanstalk, App Runner, ECR, etc.) |

For integration-backed services, field names and nesting follow the integration’s index mappings so that pre-built dashboards and security rules work.

### Configuration reference

| Setting | Description |
|--------|-------------|
| **Index prefix** | Base name for indices (e.g. `logs-aws`). Final index = `{prefix}.{dataset_suffix}` (e.g. `logs-aws.elb_logs`, `metrics-aws.lambda`). |
| **Ingestion source** | **Default (per-service)** uses the native source for each service (S3, CloudWatch, API, Firehose). Override to force all services to a single source (including **OTel** or **Elastic Agent**) for testing. |
| **data_stream.dataset** | Set automatically: integration-backed services use the Elastic dataset (e.g. `aws.cloudtrail`, `aws.vpcflow`); others use `aws.<service>`. |

---

## ECS Field Coverage

Every document includes these standard ECS base fields:

| ECS Field | Example Value | Notes |
|---|---|---|
| `@timestamp` | `2025-03-11T14:22:01.000Z` | Random within last 24 hours |
| `cloud.provider` | `aws` | Always `aws` |
| `cloud.region` | `eu-west-2` or `us-east-1` | |
| `cloud.account.id` | `814726593401` | One of 5 fictitious account IDs |
| `cloud.account.name` | `globex-production` | Human-readable account alias |
| `cloud.service.name` | `lambda`, `guardduty`, … | AWS service identifier |
| `event.dataset` | `aws.lambda`, `aws.guardduty`, … | Routes to Elastic integration dashboards |
| `event.provider` | `lambda.amazonaws.com` | AWS endpoint that produced the event |
| `event.category` | `network`, `iam`, `database`, … | ECS event category |
| `event.outcome` | `success` or `failure` | Derived from status/error rate |
| `event.kind` | `event` or `alert` | Set to `alert` for security findings |
| `log.level` | `info`, `warn`, `error` | |
| `message` | Human-readable log line | |

Services without a native Elastic integration emit additional ECS field groups relevant to their category:

| Category | ECS fields added |
|---|---|
| Security / IAM | `user.name`, `user.id`, `source.ip`, `event.action`, `error.code`, `error.message` |
| Network | `source.ip`, `destination.ip`, `network.transport`, `network.bytes`, `network.direction` |
| HTTP / API | `http.request.method`, `http.response.status_code`, `url.path`, `user_agent.original` |
| Database | `error.code`, `error.message` |
| File / Storage | `file.path`, `file.size`, `file.hash.sha256` |
| Container | `container.id`, `container.name`, `container.image.name` |
| Process / Compute | `host.hostname`, `host.os.platform`, `process.name`, `process.pid` |
| Email | `email.from.address`, `email.to.address`, `email.message_id` |

---

## Ingestion methods

The app supports six **ingestion methods**. Each determines the `input.type` and metadata (e.g. `telemetry.sdk` for OTel) stamped on generated documents.

### Ingestion method reference

| Method | `input.type` | Default for these services | Available as override |
|--------|---------------|----------------------------|------------------------|
| **S3** | `aws-s3` | CloudTrail, ALB, NLB, CloudFront, WAF, WAF v2, VPC Flow Logs, Network Firewall, S3 access logs | All 134 services |
| **CloudWatch** | `aws-cloudwatch` | Lambda, API Gateway, RDS, ECS, EC2, EKS, Glue, SageMaker, and 80+ other services | All 134 services |
| **API** | `http_endpoint` | GuardDuty, Security Hub, Inspector, Config, IAM Access Analyzer, Macie, Detective, Trusted Advisor, Compute Optimizer, Budgets, Billing, Service Quotas, Fraud Detector, X-Ray | All 134 services |
| **Firehose** | `aws-firehose` | Kinesis Data Firehose only | All 134 services |
| **OTel** | `opentelemetry` | — (override only) | All 134 services; adds `telemetry.sdk` and OTLP-style metadata |
| **Elastic Agent** | `logfile` | — (override only) | All 134 services; documents as if from log files |

When **Ingestion source** is **Default**, each service uses the method in the “Default for these services” column. When you select an **override**, every selected service uses that method (column “Available as override”).

### Default (per-service) — which service uses which method

When **Ingestion source** is **Default**, each service uses the method that matches how that AWS service typically delivers data to Elastic:

| Method | `input.type` | Services (default) |
|---|---|---|
| **S3** | `aws-s3` | CloudTrail, ALB, NLB, CloudFront, WAF, WAFv2, VPC Flow Logs, Network Firewall, S3 access logs |
| **CloudWatch** | `aws-cloudwatch` | Lambda, API Gateway, RDS, Aurora, ECS, EKS, Fargate, EC2, and most other services |
| **API** | `http_endpoint` | GuardDuty, Security Hub, Inspector, Config, IAM Access Analyzer, Macie, Detective, Trusted Advisor, Compute Optimizer, Budgets, Billing, Service Quotas, Fraud Detector, X-Ray |
| **Firehose** | `aws-firehose` | Kinesis Data Firehose |

**OTel** and **Elastic Agent** are not assigned as a default to any single service; they are available only as overrides (see below).

### Override mode — force one method for all services

When you override **Ingestion source** to a specific method, **all** selected services generate documents with that method. Useful for testing a single pipeline (e.g. OTLP or Agent) with any mix of AWS services.

| Override | `input.type` | Effect |
|---|---|---|
| S3 Bucket | `aws-s3` | All documents as if read from S3 via SQS notification |
| CloudWatch | `aws-cloudwatch` | All documents as if polled from CloudWatch log groups |
| Firehose | `aws-firehose` | All documents as if pushed via Firehose delivery stream |
| API | `http_endpoint` | All documents as if ingested via direct REST API |
| **OTel** | `opentelemetry` | **All services**; documents get `telemetry.sdk` and OTLP-style metadata (simulates ingestion via an OpenTelemetry collector). |
| Elastic Agent | `logfile` | **All services**; documents as if collected from log files by Elastic Agent |

---

## Fictitious AWS Organisation

All documents share a consistent fictitious organisation — **Globex** — with five accounts rotating across documents to simulate a real multi-account environment.

| Account ID | Account Name | Purpose |
|---|---|---|
| `814726593401` | `globex-production` | Production workloads |
| `293847561023` | `globex-staging` | Pre-production / QA |
| `738291046572` | `globex-development` | Developer sandboxes |
| `501938274650` | `globex-security-tooling` | Security services |
| `164820739518` | `globex-shared-services` | Shared infrastructure |

Regions: `eu-west-2` (London) and `us-east-1` (N. Virginia).

---

## Supported Services (134 total)

### 1 · Serverless & Core
| Service | Source | ECS Coverage |
|---|---|---|
| Lambda | CloudWatch | Full Elastic integration (`aws.lambda.*`, dimensions, metrics) |
| API Gateway | CloudWatch | Full Elastic integration (`aws.apigateway.*`) |
| VPC Flow | S3 | Full Elastic integration (`aws.vpcflow.*`) |
| CloudTrail | S3 | Full Elastic integration (`aws.cloudtrail.*`) |
| RDS | CloudWatch | Full Elastic integration (`aws.rds.*`, metrics) |
| ECS | CloudWatch | Full Elastic integration (`aws.ecs.*`) |

### 2 · Compute & Containers
| Service | Source | ECS Coverage |
|---|---|---|
| EC2 | CloudWatch | Full Elastic integration (`aws.ec2.*`) |
| EKS | CloudWatch | Full Elastic integration (`aws.eks.*`) |
| Fargate | CloudWatch | `aws.ecs_fargate.*`, `container.*` |
| ECR | CloudWatch | `aws.ecr.*`, `error.*` |
| App Runner | CloudWatch | `aws.apprunner.*`, `http.*`, `url.*` |
| Batch | CloudWatch | `aws.batch.*` |
| Elastic Beanstalk | CloudWatch | `aws.elasticbeanstalk.*`, `http.*` |
| Auto Scaling | CloudWatch | `aws.autoscaling.*` |
| EC2 Image Builder | CloudWatch | `aws.imagebuilder.*`, `event.duration` |

### 3 · Networking & CDN
| Service | Source | ECS Coverage |
|---|---|---|
| ALB | S3 | Full Elastic integration (`aws.alb.*`) |
| NLB | S3 | `aws.nlb.*`, `source.ip`, `network.*` |
| CloudFront | S3 | Full Elastic integration (`aws.cloudfront.*`) |
| WAF | S3 | Full Elastic integration (`aws.waf.*`) |
| WAF v2 | S3 | `aws.waf.*` |
| Route 53 | CloudWatch | Full Elastic integration (`aws.route53.*`) |
| Network Firewall | S3 | `aws.network_firewall.*`, `network.*` |
| Shield | CloudWatch | `aws.shield.*` |
| Global Accelerator | CloudWatch | `aws.globalaccelerator.*`, `network.*` |
| Transit Gateway | CloudWatch | `aws.transitgateway.*`, `network.*` |
| Direct Connect | CloudWatch | `aws.directconnect.*` |
| Site-to-Site VPN | CloudWatch | `aws.vpn.*` |
| PrivateLink | CloudWatch | `aws.privatelink.*` |

### 4 · Security & Compliance
| Service | Source | ECS Coverage |
|---|---|---|
| GuardDuty | API | Full Elastic integration (`aws.guardduty.*`) |
| Security Hub | API | Full Elastic integration (`aws.securityhub.*`) |
| Macie | API | `aws.macie.*`, `file.*` |
| Inspector | API | Full Elastic integration (`aws.inspector.*`) |
| Config | API | Full Elastic integration (`aws.config.*`) |
| IAM Access Analyzer | API | `aws.access_analyzer.*`, `user.*`, `source.ip` |
| Cognito | CloudWatch | `aws.cognito.*`, `user.*`, `source.ip`, `user_agent.original` |
| KMS | CloudWatch | `aws.kms.*`, `user.*`, `event.action` |
| Secrets Manager | CloudWatch | `aws.secretsmanager.*`, `user.*` |
| ACM | CloudWatch | `aws.acm.*` |
| IAM Identity Center | CloudWatch | `aws.identitycenter.*`, `user.*`, `source.ip` |
| Detective | API | `aws.detective.*` |

### 5 · Storage & Databases
| Service | Source | ECS Coverage |
|---|---|---|
| S3 | S3 | Full Elastic integration (`aws.s3.*`) |
| DynamoDB | CloudWatch | Full Elastic integration (`aws.dynamodb.*`) |
| ElastiCache | CloudWatch | Full Elastic integration (`aws.elasticache.*`) |
| Redshift | CloudWatch | Full Elastic integration (`aws.redshift.*`) |
| OpenSearch | CloudWatch | Full Elastic integration (`aws.opensearch.*`) |
| DocumentDB | CloudWatch | Full Elastic integration (`aws.docdb.*`) |
| EFS | CloudWatch | `aws.efs.*`, `file.*` |
| FSx | CloudWatch | `aws.fsx.*`, `file.*` |
| DataSync | CloudWatch | `aws.datasync.*`, `file.*` |
| Backup | CloudWatch | `aws.backup.*` |
| Storage Gateway | CloudWatch | `aws.storagegateway.*` |
| EBS | CloudWatch | `aws.ebs.*`, `host.*` |
| Aurora | CloudWatch | `aws.aurora.*` |
| Neptune | CloudWatch | `aws.neptune.*` |
| Timestream | CloudWatch | `aws.timestream.*` |
| QLDB | CloudWatch | `aws.qldb.*` |
| Keyspaces | CloudWatch | `aws.keyspaces.*` |
| MemoryDB | CloudWatch | `aws.memorydb.*` |

### 6 · Streaming & Messaging
| Service | Source | ECS Coverage |
|---|---|---|
| Kinesis Streams | CloudWatch | Full Elastic integration (`aws.kinesis.*`) |
| Firehose | Firehose | Full Elastic integration (`aws.firehose.*`) |
| Kinesis Analytics | CloudWatch | `aws.kinesisanalytics.*` |
| MSK (Kafka) | CloudWatch | Full Elastic integration (`aws.msk.*`) |
| SQS | CloudWatch | Full Elastic integration (`aws.sqs.*`) |
| SNS | CloudWatch | `aws.sns.*` |
| Amazon MQ | CloudWatch | `aws.amazonmq.*` |
| EventBridge | CloudWatch | Full Elastic integration (`aws.eventbridge.*`) |
| Step Functions | CloudWatch | Full Elastic integration (`aws.stepfunctions.*`) |
| AppSync | CloudWatch | `aws.appsync.*`, `http.*` |

### 7 · Developer & CI/CD
| Service | Source | ECS Coverage |
|---|---|---|
| CodeBuild | CloudWatch | Full Elastic integration (`aws.codebuild.*`) |
| CodePipeline | CloudWatch | Full Elastic integration (`aws.codepipeline.*`) |
| CodeDeploy | CloudWatch | Full Elastic integration (`aws.codedeploy.*`) |
| CodeCommit | CloudWatch | `aws.codecommit.*`, `user.*` |
| CodeArtifact | CloudWatch | `aws.codeartifact.*` |
| Amplify | CloudWatch | `aws.amplify.*`, `http.*` |
| X-Ray | API | Full Elastic integration (`aws.xray.*`) |

### 8 · Analytics
| Service | Source | ECS Coverage |
|---|---|---|
| EMR | CloudWatch | `aws.emr.*` |
| Glue | CloudWatch | `aws.glue.*` |
| Athena | CloudWatch | `aws.athena.*` |
| Lake Formation | CloudWatch | `aws.lakeformation.*`, `user.*` |
| QuickSight | CloudWatch | `aws.quicksight.*`, `user.*`, `http.*` |
| DataBrew | CloudWatch | `aws.databrew.*` |
| AppFlow | CloudWatch | `aws.appflow.*` |

### 9 · AI & Machine Learning
| Service | Source | ECS Coverage |
|---|---|---|
| SageMaker | CloudWatch | `aws.sagemaker.*`, `user.*` |
| Bedrock | CloudWatch | `aws.bedrock.*`, `event.duration` |
| Bedrock Agent | CloudWatch | `aws.bedrockagent.*`, agent/knowledge-base invocations |
| Rekognition | CloudWatch | `aws.rekognition.*` |
| Textract | CloudWatch | `aws.textract.*` |
| Comprehend | CloudWatch | `aws.comprehend.*` |
| Translate | CloudWatch | `aws.translate.*` |
| Transcribe | CloudWatch | `aws.transcribe.*` |
| Polly | CloudWatch | `aws.polly.*` |
| Forecast | CloudWatch | `aws.forecast.*` |
| Personalize | CloudWatch | `aws.personalize.*` |
| Lex | CloudWatch | `aws.lex.*`, `user.*` |

### 10 · IoT
| Service | Source | ECS Coverage |
|---|---|---|
| IoT Core | CloudWatch | `aws.iot.*`, `source.ip` |
| Greengrass | CloudWatch | `aws.greengrass.*` |
| IoT Analytics | CloudWatch | `aws.iotanalytics.*` |

### 11 · Management & Governance
| Service | Source | ECS Coverage |
|---|---|---|
| CloudFormation | CloudWatch | `aws.cloudformation.*`, `user.*`, `event.action` |
| Systems Manager | CloudWatch | `aws.ssm.*`, `host.*`, `user.*` |
| CloudWatch Alarms | CloudWatch | `aws.cloudwatch.*` |
| AWS Health | CloudWatch | `aws.health.*` |
| Trusted Advisor | API | `aws.trustedadvisor.*` |
| Control Tower | CloudWatch | `aws.controltower.*`, `user.*` |
| Organizations | CloudWatch | `aws.organizations.*`, `user.*` |
| Service Catalog | CloudWatch | `aws.servicecatalog.*`, `user.*`, `event.action` |
| Service Quotas | API | `aws.servicequotas.*` |
| Compute Optimizer | API | `aws.computeoptimizer.*` |
| Budgets | API | `aws.budgets.*` |
| Billing | API | `aws.billing.*` (Cost & Usage, Elastic integration) |
| Resource Access Manager | CloudWatch | `aws.ram.*`, `user.*` |
| Resilience Hub | CloudWatch | `aws.resiliencehub.*` |
| Migration Hub | CloudWatch | `aws.migrationhub.*` |
| Network Manager | CloudWatch | `aws.networkmanager.*` |
| DMS | CloudWatch | `aws.dms.*` |

### 12 · Media & End User Computing
| Service | Source | ECS Coverage |
|---|---|---|
| MediaConvert | CloudWatch | `aws.mediaconvert.*` |
| MediaLive | CloudWatch | `aws.medialive.*` |
| WorkSpaces | CloudWatch | `aws.workspaces.*`, `user.*`, `source.ip` |
| Amazon Connect | CloudWatch | `aws.connect.*`, `user.*` |
| AppStream | CloudWatch | `aws.appstream.*`, `user.*` |
| GameLift | CloudWatch | `aws.gamelift.*` |

### 13 · Messaging & Communications
| Service | Source | ECS Coverage |
|---|---|---|
| SES | CloudWatch | `aws.ses.*`, `email.*` |
| Pinpoint | CloudWatch | `aws.pinpoint.*`, `email.*` |

### 14 · Additional Services
| Service | Source | ECS Coverage |
|---|---|---|
| Transfer Family | CloudWatch | `aws.transfer.*`, `file.*`, `source.ip` |
| Lightsail | CloudWatch | `aws.lightsail.*` |
| Fraud Detector | API | `aws.frauddetector.*`, `source.ip` |
| Lookout for Metrics | CloudWatch | `aws.lookoutmetrics.*` |
| Comprehend Medical | CloudWatch | `aws.comprehendmedical.*` |
| Location Service | CloudWatch | `aws.location.*` |
| Managed Blockchain | CloudWatch | `aws.blockchain.*` |
| CodeGuru | CloudWatch | `aws.codeguru.*` |
| DevOps Guru | CloudWatch | `aws.devopsguru.*` |
| IoT Events | CloudWatch | `aws.iotevents.*` |
| IoT SiteWise | CloudWatch | `aws.iotsitewise.*` |
| IoT Defender | CloudWatch | `aws.iotdefender.*` |
| WAF v2 | S3 | `aws.waf.*` |

---

## Elastic Serverless

Works with **Elastic Serverless** projects without code changes. Assign the **Editor** project role (or a custom role with `index` privileges on `aws-logs-*`) instead of `cluster_admin`. Paste your Serverless project URL directly — the `_bulk` API behaves identically.

---

## Configuration Reference

| Setting | Default | Range | Description |
|---|---|---|---|
| Event type | Logs | Logs / Metrics | **Logs** = log documents (all 136 services). **Metrics** = metrics documents (46 services with Elastic AWS metrics support). |
| Logs/metrics per service | 500 | 50–5,000 | Documents generated per selected service |
| Error rate | 5% | 0–50% | Fraction of documents representing errors/failures |
| Batch size | 250 | 50–1,000 | Documents per `_bulk` API request |
| Index prefix | `logs-aws` or `metrics-aws` | — | Prefix for index names; switches by event type (e.g. `metrics-aws` in Metrics mode). |
| Ingestion source | Default | Default + 6 overrides | `input.type` stamped on every document |

---

## Sample data

The **samples/** directory contains one sample log and (where applicable) one sample metrics document per service, generated by the same logic as the app:

- **samples/logs/** — one JSON log document per service (134 services)
- **samples/metrics/** — one JSON metrics document per metrics-supported service (46 services)

See [samples/README.md](samples/README.md) for details. Regenerate with: `npm run samples`.

---

## Ingest pipelines

For services that emit **JSON in the `message` field** (structured/continuous logging), ingest pipelines can parse that JSON into a target field (e.g. `glue.parsed`, `lambda.parsed`) so the payload is searchable and aggregatable.

- **Plan for all services:** [ingest-pipelines/PLAN-PARSE-JSON-SERVICES.md](ingest-pipelines/PLAN-PARSE-JSON-SERVICES.md) — pipeline IDs, target fields, index patterns, and example JSON keys for all 23 services.
- **Definitions and how to apply:** [ingest-pipelines/README.md](ingest-pipelines/README.md) — pipeline JSON files for Glue, Lambda, API Gateway, RDS, ECS, EMR, and SageMaker; template for the rest.
- **Performance & anomaly detection:** [docs/PERFORMANCE-METRICS-PLAN.md](docs/PERFORMANCE-METRICS-PLAN.md) — which metrics are emitted for visualizations and ML (duration, utilization, throughput, error rates).

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

All log data goes directly from your browser → proxy → your Elastic deployment. Nothing is stored or logged anywhere in between.

---

## Docker Image

- **Build**: `node:20-alpine` → **Runtime**: `node:20-alpine` + nginx + supervisor
- **Host port**: 8765 (mapped to container port 80)
- **Health check**: `GET /health` → 200 OK
- **Processes**: nginx (serves the SPA) + Node.js proxy (forwards requests to Elastic)

---

## Contributors & acknowledgments

This project was developed with **AI-assisted tooling** for transparency:

- **[Cursor](https://cursor.com)** — Code generation, refactoring, and documentation were produced with the help of Cursor (AI pair programming in the editor). Cursor is listed as a contributor to reflect that.
- **Human maintainer(s)** — You (the repo owner) remain the author and maintainer; commits and decisions are yours.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the contributor list.

---

## Version What's New Archive

### What's New in v7.4

- **SageMaker** — Job-type-specific lifecycle messages: "Training job started/succeeded/failed", "Processing job started/succeeded/failed", "Endpoint creation started/succeeded/failed", "Pipeline execution started/succeeded/failed", and equivalent for Transform and HyperparameterTuning.
- **CodeBuild** — "Build started", "Build succeeded", "Build failed" and phase-level messages added and weighted so lifecycle and phase messages appear more often.
- **Athena** — "Query started/succeeded/failed" messages emphasised for clearer query-lifecycle visibility.
- **EMR, Batch, DataBrew, AppFlow** — Run-state and job-lifecycle message pools; `aws.<service>.metrics` including elapsedTime/Duration and records_processed.

### What's New in v7.3

- **Input validation** — Elasticsearch URL, API key, and index prefix are validated on blur and before Ship. Invalid fields show inline errors and disable the Ship button until fixed.
- **React error boundary** — The app is wrapped in an error boundary that catches rendering errors and shows a fallback UI with a "Try again" action.
- **Proxy timeout and retries** — The Node.js bulk proxy uses a configurable request timeout (default 120s) and retries with exponential backoff (up to 3 retries) on 5xx, timeouts, and connection errors.
- **Configurable batch delay** — Batch delay (ms) slider (0–2000 ms) in Volume & Settings; persisted with saved config.
- **Unit tests (Vitest)** — Smoke tests for helpers, validation, and generator shape. Run with `npm run test`.
- **CSS modules** — Main layout and shared controls use `App.module.css`; dynamic values remain inline where needed.
- **JSDoc on generators** — Generator modules and key functions include JSDoc for better editor support and documentation.

### What's New in v7

- **Performance & anomaly-detection metrics** — Added or expanded `event.duration` and `aws.<service>.metrics` across services for Elastic visualizations and ML anomaly detection. New or expanded metrics for: SNS, Athena, SageMaker (CloudWatch-style), Fargate, AutoScaling, ImageBuilder, Amazon MQ, AppSync, Bedrock, and Bedrock Agent.
- **Glue: skewness & observability** — Glue generator emits `aws.glue.metrics.driver.skewness.stage` and `skewness.job`, plus JVM heap and disk metrics aligned with AWS Glue Observability.
- **Performance metrics plan** — [docs/PERFORMANCE-METRICS-PLAN.md](docs/PERFORMANCE-METRICS-PLAN.md) documents fields for dashboards and ML.

### What's New in v6

- **Logs / Metrics toggle** — Generate either log documents or metrics documents. In Metrics mode, only the 46 services with Elastic AWS metrics support are selectable; index prefix defaults to `metrics-aws`.
- **Official AWS service icons** — Service tiles use official AWS Architecture Icons stored locally (`public/aws-icons/`), copied from the `aws-icons` package at install time (no CDN).
- **Sample data directory** — `samples/logs/` and `samples/metrics/` contain one sample document per service. Regenerate with `npm run samples`.
- **Bedrock Agent & Billing** — Added Bedrock Agent and AWS Billing (logs and metrics) with Elastic integration alignment.
- **Structured / continuous logging** — Many services (Lambda, API Gateway, RDS, ECS, EC2, EKS, Glue, EMR, SageMaker, and others) can emit JSON in the `message` field and optional metrics blocks, matching real-world continuous logging.
- **Ingest pipeline plan** — [ingest-pipelines/PLAN-PARSE-JSON-SERVICES.md](ingest-pipelines/PLAN-PARSE-JSON-SERVICES.md) documents pipeline IDs, target fields, and index patterns for all services that emit parseable JSON messages; pipeline JSON files provided for Glue, Lambda, API Gateway, RDS, ECS, EMR, SageMaker.
- **Reduced null fields** — Generated documents have `null` values stripped so output stays clean.
- **Application rename** — Project and UI titled **AWS → Elastic Load Generator** (load, not log).

### What's New in v5 — Elastic integration alignment

- **Data stream dataset mapping** — Services with an Elastic AWS integration use the exact `data_stream.dataset` (and index suffix) from the [Elastic integrations repo](https://github.com/elastic/integrations/tree/main/packages/aws/data_stream), so generated logs populate the correct integration dashboards and rules.
- **Integration-backed services** — CloudTrail, VPC Flow, ALB/NLB, GuardDuty, S3 access, API Gateway, CloudFront, Lambda, Network Firewall, Security Hub, WAF, RDS, Route 53, EMR, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EBS, Kinesis, MSK, SNS, SQS, Transit Gateway, VPN, AWS Health use the corresponding Elastic dataset where applicable.
- **Services without an Elastic integration** — All other services use `data_stream.dataset: aws.<service>` and ECS-style fields so they remain searchable in custom dashboards.
- **ECS baseline for every service** — Every document is enriched with standard ECS fields when missing; all services are searchable in ECS indices.

### What's New in v4

- **Realistic account names** — All documents use a consistent fictitious AWS organisation (`globex-production`, `globex-staging`, etc.) with realistic 12-digit account IDs.
- **Focused region pool** — Regions restricted to `eu-west-2` and `us-east-1`.
- **`event.dataset` and `event.provider`** on every document for correct routing to Elastic integration dashboards.
- **ECS enrichment for non-integrated services** — Common ECS field groups so all services are searchable in ECS indices.
- **`cloud.account.name`** on every document.

### What's New in v3

- **`cloud.account.id` + `cloud.account.name`** added to all generators.
- **CloudWatch dimension fields** (`aws.dimensions.*`) and **CloudWatch metric fields** (`aws.*.metrics.*`) with exact CloudWatch metric names.
- Lambda extended with full CloudWatch dimension set including `EventSourceMappingUUID` where applicable.

### What's New in v2

- Per-service ingestion defaults — every service defaults to its correct `input.type`.
- Default (per-service) mode and ingestion override controls.
- Service card badges showing effective ingestion source.
- Override warning banner and activity log enhancement.
