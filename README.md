# ⚡ AWS → Elastic Load Generator

A web UI for bulk-generating realistic AWS logs and metrics and shipping them directly to an Elastic Cloud deployment via the Elasticsearch Bulk API. Covers **109 AWS services** across **14 themed groups**, all using **ECS (Elastic Common Schema)** field naming.

Each service has its **correct real-world ingestion source** pre-configured — S3, CloudWatch, direct API, or Firehose — matching how each service actually delivers data to Elastic in production.

---

## What's New in v4

- **Realistic account names** — all documents use a consistent fictitious AWS organisation (`globex-production`, `globex-staging`, `globex-development`, `globex-security-tooling`, `globex-shared-services`) with realistic 12-digit account IDs
- **Focused region pool** — regions are now restricted to `eu-west-2` and `us-east-1` for coherent, consistent test data
- **`event.dataset` on every document** — every generator sets the correct `event.dataset` (e.g. `aws.lambda`, `aws.guardduty`) so documents route to the right Elastic integration dashboards
- **`event.provider` on every document** — every generator sets the corresponding AWS service endpoint (e.g. `lambda.amazonaws.com`, `guardduty.amazonaws.com`)
- **ECS enrichment for non-integrated services** — services without a native Elastic integration now emit common ECS field groups (`error.*`, `user.*`, `source.ip`, `network.*`, `url.*`, `user_agent.original`, `file.*`, `process.*`, `host.*`) making them fully searchable in any ECS index
- **`cloud.account.name` on every document** — all 109 generators include both `cloud.account.id` and `cloud.account.name`

---

## What's New in v5 — Elastic integration alignment

- **Data stream dataset mapping** — Services with an Elastic AWS integration now use the exact `data_stream.dataset` (and index suffix) from the [Elastic integrations repo](https://github.com/elastic/integrations/tree/main/packages/aws/data_stream), so generated logs populate the correct integration dashboards and rules.
- **Integration-backed services** — CloudTrail, VPC Flow, ALB/NLB, GuardDuty, S3 access, API Gateway, CloudFront, Lambda, Network Firewall, Security Hub, WAF, RDS, Route 53, EMR, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EBS, Kinesis, MSK, SNS, SQS, Transit Gateway, VPN, AWS Health use the corresponding Elastic dataset where applicable.
- **Services without an Elastic integration** — All other services still use `data_stream.dataset: aws.<service>` and ECS-style fields so they remain searchable in custom dashboards.
- **ECS baseline for every service** — Every document is enriched with standard ECS fields when missing: `source.ip`, `destination.ip`, `network.transport` / `network.direction`, `host.name` / `host.hostname`, `process.name`, `user_agent.original`, `url.path` / `url.domain`, `error.message` (on failure), `user.name`, `service.name`, and `file.path` / `file.name` where relevant. All 109 services are searchable in ECS indices.

---

## What's New in v3

- **`cloud.account.id` + `cloud.account.name`** added to all 109 generators
- **CloudWatch dimension fields** (`aws.dimensions.*`) added to all CloudWatch-sourced services
- **CloudWatch metric fields** (`aws.*.metrics.*`) added to all CloudWatch-sourced services using exact CloudWatch metric names (e.g. `aws.lambda.metrics.Errors.sum`, `aws.rds.metrics.CPUUtilization.avg`)
- Lambda extended with full CloudWatch dimension set including `EventSourceMappingUUID` where applicable

---

## What's New in v2

- Per-service ingestion defaults — every service defaults to its correct `input.type`
- Default (per-service) mode and ingestion override controls
- Service card badges showing effective ingestion source
- Override warning banner and activity log enhancement

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

1. **Select services** — toggle individual services, entire groups, or all 109 at once
2. **Configure volume** — set logs per service (50–5,000), error rate (0–50%), and batch size
3. **Set ingestion source** — leave on **Default (per-service)** or override all services to a specific source
4. **Connect to Elastic** — enter your Elasticsearch URL, API key, and index prefix
5. **Preview a document** — click **Preview doc** to inspect a sample before shipping
6. **Ship logs** — click ⚡ Ship Logs and watch real-time progress in the activity log

### Getting an Elastic API Key

1. Open Kibana → **Stack Management** → **API Keys**
2. Click **Create API key**
3. Assign `cluster_admin` or scoped `index_admin` privileges
4. Copy the **base64** encoded key into the UI

### Index naming

Indices follow the Elastic data stream dataset where applicable: `{prefix}-{dataset_suffix}`, e.g. `logs-aws-lambda`, `logs-aws-elb_logs` (for both ALB and NLB), `logs-aws-vpcflow`, `logs-aws-guardduty`. Services without a dedicated integration use `logs-aws-{service}`.

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
| No (ECS only) | `aws.<service>` | All other 80+ services (Batch, Beanstalk, App Runner, ECR, etc.) |

For integration-backed services, field names and nesting follow the integration’s index mappings so that pre-built dashboards and security rules work.

### Configuration reference

| Setting | Description |
|--------|-------------|
| **Index prefix** | Base name for indices (e.g. `logs-aws`). Final index = `{prefix}-{dataset_suffix}` (e.g. `logs-aws-elb_logs`). |
| **Ingestion source** | **Default (per-service)** uses the native source for each service (S3, CloudWatch, API, Firehose). Override to force all services to a single source for testing. |
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

## Ingestion Source

### Default (per-service) mode

| Source | `input.type` | Services |
|---|---|---|
| **S3** | `aws-s3` | CloudTrail, ALB, NLB, CloudFront, WAF, WAFv2, VPC Flow Logs, Network Firewall, S3 access logs |
| **CloudWatch** | `aws-cloudwatch` | Lambda, API Gateway, RDS, Aurora, ECS, EKS, Fargate, EC2, and most other services |
| **API** | `http_endpoint` | GuardDuty, Security Hub, Inspector, Config, IAM Access Analyzer, Macie, Detective, Trusted Advisor, Compute Optimizer, Budgets, Billing, Service Quotas, Fraud Detector, X-Ray |
| **Firehose** | `aws-firehose` | Kinesis Data Firehose |

### Override mode

| Override | `input.type` | Use case |
|---|---|---|
| S3 Bucket | `aws-s3` | All logs read from S3 via SQS notification |
| CloudWatch | `aws-cloudwatch` | All logs polled from CloudWatch log groups |
| Firehose | `aws-firehose` | All logs pushed via Firehose delivery stream |
| API | `http_endpoint` | All logs via direct REST API ingestion |
| OTel | `opentelemetry` | All logs via OTLP collector |
| Elastic Agent | `logfile` | All logs collected from files by Elastic Agent |

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

## Supported Services (109 total)

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
| Logs per service | 500 | 50–5,000 | Documents generated per selected service |
| Error rate | 5% | 0–50% | Fraction of logs representing errors/failures |
| Batch size | 250 | 50–1,000 | Documents per `_bulk` API request |
| Index prefix | `logs-aws` | — | Prefix for Elasticsearch index names |
| Ingestion source | Default | Default + 6 overrides | `input.type` stamped on every document |

---

## Ingest pipelines

For **AWS Glue** logs where the `message` field contains JSON (e.g. continuous logging), an ingest pipeline is provided to parse it into `glue.parsed` so the payload is searchable. See [ingest-pipelines/README.md](ingest-pipelines/README.md) for the `glue-parse-json-message` definition and how to apply and attach it in Elastic.

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
