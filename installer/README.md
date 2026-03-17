# AWS → Elastic Onboarding Installers

Two standalone Node.js scripts to configure Elastic before you start shipping data with the AWS → Elastic Load Generator. Run them once — both are idempotent and safe to re-run at any time.

**Requirements:** Node.js 18+ (native `fetch`, ES modules). No `npm install` needed — zero external dependencies.

---

## Installer 1 — Official Elastic AWS Integration

**File:** `installer/elastic-integration/`
**Command:** `npm run setup:integration`

### What it installs

The official Elastic AWS integration package via the Kibana Fleet API. You get:

- Pre-built index templates for all 46 officially-supported AWS services
- ILM (Index Lifecycle Management) policies
- Pre-built Kibana dashboards for CloudTrail, VPC Flow, ALB/NLB, GuardDuty, Lambda, RDS, and more
- ML anomaly detection job configurations

### How to run

```bash
npm run setup:integration
# or directly:
node installer/elastic-integration/index.mjs
```

### Credentials

| Prompt | Where to find it |
|--------|-----------------|
| **Kibana URL** | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key** | Kibana → Stack Management → API Keys → Create API key — needs `cluster: manage` + `kibana: all` privileges |

### What happens

1. Prompts for Kibana URL and API key
2. Checks if the AWS integration is already installed
3. If installed → prints current version and exits (skips safely)
4. If not installed → fetches the latest version from the Elastic Package Registry and installs it

### Example output

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

---

## Installer 2 — Custom Ingest Pipelines

**File:** `installer/custom-pipelines/`
**Command:** `npm run setup:pipelines`

### What it installs

Custom Elasticsearch ingest pipelines for the ~85 AWS services not covered by the official integration. These pipelines parse the structured JSON `message` field emitted by the load generator into named fields (e.g. `glue.parsed`, `sagemaker.parsed`) — making logs fully searchable and aggregatable in Kibana.

### How to run

```bash
npm run setup:pipelines
# or directly:
node installer/custom-pipelines/index.mjs
```

### Credentials

| Prompt | Where to find it |
|--------|-----------------|
| **Elasticsearch URL** | Deployment overview → Elasticsearch endpoint (e.g. `https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key** | Kibana → Stack Management → API Keys → Create API key — needs `manage_ingest_pipelines` cluster privilege |

### What happens

1. Prompts for Elasticsearch URL and API key
2. Tests the connection and confirms the cluster name + version
3. Displays an interactive group selection menu
4. For each selected pipeline: checks if it exists, skips if so, creates it if not
5. Prints a summary of installed / skipped / failed counts

### Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Pipeline Installer          ║
╚══════════════════════════════════════════════════════╝

Elasticsearch URL (e.g. https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to cluster: my-deployment (8.14.0)

Available pipeline groups:

  1. analytics    (8 pipelines)
  2. compute      (7 pipelines)
  3. databases    (9 pipelines)
  4. devtools     (6 pipelines)
  5. enduser      (14 pipelines)
  6. iot          (6 pipelines)
  7. management   (17 pipelines)
  8. ml           (13 pipelines)
  9. networking   (4 pipelines)
  10. security    (8 pipelines)
  11. serverless  (5 pipelines)
  12. storage     (5 pipelines)
  13. streaming   (4 pipelines)
  14. all         (install every group)

Enter number(s) comma-separated, or "all":
> all

Installing 106 pipeline(s)...

  ✓ logs-aws.glue-default — installed
  ✓ logs-aws.emr_logs-default — installed
  ✓ logs-aws.athena-default — installed
  ...
  ✓ logs-aws.sagemaker-default — installed

Installed 106 / 106 pipelines.
Done.
```

You can select individual groups (e.g. `1,3,8`) or type `all`. Already-installed pipelines are automatically skipped on every run.

### Pipeline groups

| Group | Pipelines | Services covered |
|-------|-----------|-----------------|
| analytics | 8 | Glue, EMR, Athena, Lake Formation, QuickSight, DataBrew, AppFlow |
| compute | 7 | EC2, EKS, Fargate, ECR, App Runner, Batch, Elastic Beanstalk |
| databases | 9 | ElastiCache, OpenSearch, DocumentDB, Aurora, Neptune, Timestream, QLDB, Keyspaces, MemoryDB |
| devtools | 6 | CodeCommit, CodeArtifact, Amplify, CodeGuru, DevOps Guru, Lightsail |
| enduser | 14 | WorkSpaces, Connect, AppStream, GameLift, Transfer Family, MediaConvert, MediaLive, Pinpoint, Location Service, Managed Blockchain, Fraud Detector, Lookout for Metrics, Comprehend Medical, SES |
| iot | 6 | IoT Core, Greengrass, IoT Analytics, IoT Events, IoT SiteWise, IoT Defender |
| management | 17 | CloudFormation, SSM, CloudWatch Alarms, AWS Health, Trusted Advisor, Control Tower, Organizations, Service Catalog, Service Quotas, Compute Optimizer, Budgets, Billing, RAM, Resilience Hub, Migration Hub, Network Manager, DMS |
| ml | 13 | SageMaker, Bedrock, Bedrock Agent, Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, Forecast, Personalize, Lex, Comprehend Medical |
| networking | 4 | Shield, Global Accelerator, Direct Connect, PrivateLink |
| security | 8 | Macie, IAM Access Analyzer, Cognito, KMS, Secrets Manager, ACM, IAM Identity Center, Detective |
| serverless | 5 | Lambda, API Gateway, Step Functions, EventBridge, AppSync |
| storage | 5 | EFS, FSx, DataSync, Backup, Storage Gateway |
| streaming | 4 | Kinesis Analytics, Amazon MQ, SNS, SQS (custom only) |

### Pipeline naming convention

All pipelines follow the Elastic standard:

```
logs-aws.{dataset_suffix}-default
```

Examples:
- `logs-aws.glue-default`
- `logs-aws.sagemaker-default`
- `logs-aws.lambda_logs-default`
- `logs-aws.emr_logs-default`

These match the index names the load generator writes to, so pipelines are applied automatically on ingest — no extra routing or index template configuration needed.

### Processor strategy

| Service type | Processors |
|---|---|
| Services with structured JSON logging (Glue, EMR, SageMaker, Lambda, etc.) | `json` processor → parse `message` into `{ns}.parsed`, then targeted `rename` processors for key fields |
| All other services | Single `json` processor with `ignore_failure: true` — passes plain-text safely, parses JSON when present |

---

## Why two separate installers?

| | `setup:integration` | `setup:pipelines` |
|---|---|---|
| **API** | Kibana Fleet API | Elasticsearch Ingest API |
| **URL needed** | Kibana URL | Elasticsearch URL |
| **Privileges** | `cluster: manage` + `kibana: all` | `manage_ingest_pipelines` |
| **What it configures** | Dashboards, ILM, index templates | Ingest pipelines |
| **Re-runnable** | Yes — skips if already installed | Yes — skips existing pipelines |
| **When to re-run** | When Elastic releases a new integration version | When new services are added to the load generator |

Running both gives you full coverage across all 136 services.
