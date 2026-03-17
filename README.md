# ⚡ AWS → Elastic Load Generator

A web UI for bulk-generating realistic AWS logs and metrics and shipping them directly to an Elastic Cloud deployment via the Elasticsearch Bulk API. Covers **136 AWS services** across **14 themed groups**, all using **ECS (Elastic Common Schema)** field naming.

Each service has its **correct real-world ingestion source** pre-configured — S3, CloudWatch, direct API, Firehose, **OTel** (OpenTelemetry), or **Elastic Agent** — matching how each service actually delivers data to Elastic in production. You can leave **Default (per-service)** or override all services to a single ingestion method (e.g. OTel) for testing. Switch between **Logs** and **Metrics** mode; **75 services** support Metrics mode (expanded from 46 in v7).

---

## What's New in v8.0

- **Metrics mode expanded to 75 services** — Up from 46 in v7. Added Route 53, Auto Scaling, ElasticBeanstalk, Amazon MQ, AppSync, Cognito, KMS, EFS, FSx, Backup, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, Kinesis Analytics, CodePipeline, CodeDeploy, Amplify, QuickSight, IoT Core, Shield, Global Accelerator, Direct Connect, VPC Flow, WorkSpaces, Connect, GameLift, Transfer Family, SES, X-Ray, and more. All newly added services have `aws.<service>.metrics` blocks with real CloudWatch metric names.
- **Onboarding installers** — Two zero-dependency Node.js installers in `installer/`:
  - `npm run setup:integration` — installs the official **Elastic AWS integration** package via the Kibana Fleet API (idempotent; skips if already installed). Gives you pre-built dashboards, ILM policies, and index templates for 46 services.
  - `npm run setup:pipelines` — installs **custom Elasticsearch ingest pipelines** for the ~85 services not covered by the official integration. Interactive group selection menu (analytics, databases, serverless, compute, management, IoT, ml, storage, security, networking, streaming, devtools, enduser). **106 pipelines** across 13 groups — all idempotent.
- **ECS Phase 1–3 complete across all 136 generators** — `aws.dimensions` keys always present (value or `null`) on every generator that has dimensions; no conditional spread that omits keys. All generators with a failure outcome set explicit `error: { code, message, type }` with real AWS API error codes. `event.duration` (nanoseconds) on every service where a meaningful duration exists.
- **Performance metrics blocks on all key services** — SNS, Athena, SageMaker, Fargate, AutoScaling, ImageBuilder, Amazon MQ, AppSync, Bedrock all have `aws.<service>.metrics` blocks with CloudWatch-aligned numeric fields (sum/avg/p99) suitable for Elastic visualisations and ML anomaly detection jobs.
- **Cognito metrics block** — `aws.cognito.metrics` now emits `SignInSuccesses`, `SignInAttempts`, `TokenRefreshSuccesses`, `SignUpSuccesses`, `FederationSuccesses`, `CallCount`, `ThrottleCount`, `AccountTakeoverRisk`, and `CompromisedCredentialsRisk` matching the Cognito CloudWatch namespace. `event.category` fixed to ECS array `["authentication"]`.
- **SageMaker field naming** — CloudWatch endpoint/invocation metrics renamed from `cloudwatch_metrics` to `cloudwatch` to clearly distinguish them from the training `metrics` block within the same document.

See full release history: [docs/VERSION-HISTORY.md](docs/VERSION-HISTORY.md).

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

See full release history: [docs/VERSION-HISTORY.md](docs/VERSION-HISTORY.md).

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
| Event type | Logs | Logs / Metrics | **Logs** = log documents (all 136 services). **Metrics** = metrics documents (75 services with Elastic AWS metrics support). |
| Logs/metrics per service | 500 | 50–5,000 | Documents generated per selected service |
| Error rate | 5% | 0–50% | Fraction of documents representing errors/failures |
| Batch size | 250 | 50–1,000 | Documents per `_bulk` API request |
| Index prefix | `logs-aws` or `metrics-aws` | — | Prefix for index names; switches by event type (e.g. `metrics-aws` in Metrics mode). |
| Ingestion source | Default | Default + 6 overrides | `input.type` stamped on every document |

---

## Sample data

The **samples/** directory contains one sample log and (where applicable) one sample metrics document per service, generated by the same logic as the app:

- **samples/logs/** — one JSON log document per service (136 services)
- **samples/metrics/** — one JSON metrics document per metrics-supported service (75 services)

See [samples/README.md](samples/README.md) for details. Regenerate with: `npm run samples`.

---

## Onboarding installers

Two zero-dependency Node.js scripts in `installer/` prepare Elastic before you start shipping data. See [installer/README.md](installer/README.md) for full details.

```bash
npm run setup:integration   # install official Elastic AWS integration (Kibana Fleet API)
npm run setup:pipelines     # install custom ingest pipelines (Elasticsearch API)
```

| Installer | API | What it does |
|---|---|---|
| `elastic-integration` | Kibana Fleet API | Installs the official AWS integration package — pre-built dashboards, ILM, index templates for 46 services |
| `custom-pipelines` | Elasticsearch Ingest API | Installs **106 custom ingest pipelines** across 13 groups for the ~85 services not covered by the official integration |

Both installers are **idempotent** — safe to re-run; already-installed items are skipped.

---

## Ingest pipelines

For services that emit **JSON in the `message` field** (structured/continuous logging), ingest pipelines parse that JSON into a target field (e.g. `glue.parsed`, `lambda.parsed`) so the payload is searchable and aggregatable.

- **Automated installer:** `npm run setup:pipelines` — installs all 106 pipelines interactively with group selection
- **Manual pipeline files:** [ingest-pipelines/README.md](ingest-pipelines/README.md) — individual pipeline JSON files for Glue, Lambda, API Gateway, RDS, ECS, EMR, and SageMaker

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

