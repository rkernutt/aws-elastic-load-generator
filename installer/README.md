# AWS → Elastic Onboarding Installers

Three standalone Node.js scripts to configure Elastic before you start shipping data with the AWS → Elastic Load Generator. Run them once — all are idempotent and safe to re-run at any time.

**Requirements:** Node.js 18+ (native `fetch`, ES modules). No `npm install` needed — zero external dependencies.

---

## Deployment types

Each installer begins by asking which type of Elastic deployment you are connecting to:

```
Select your Elastic deployment type:

  1. Self-Managed  (on-premises, Docker, VM)
  2. Elastic Cloud Hosted  (cloud.elastic.co)
  3. Elastic Serverless  (cloud.elastic.co/serverless)
```

Your selection controls the URL format shown in the prompts and the validation rules applied.

| | Self-Managed | Cloud Hosted | Serverless |
|---|---|---|---|
| **Kibana port** | `:5601` (default) | `:9243` | none |
| **Elasticsearch port** | `:9200` (default) | `:9243` | none |
| **Protocol** | `http://` or `https://` | `https://` only | `https://` only |
| **TLS skip option** | yes (prompted) | no | no |
| **Package Registry** | Kibana-proxied (air-gap safe) + EPR fallback | EPR via Kibana | EPR via Kibana |
| **Fleet required** | yes — must be enabled | pre-configured | pre-configured |

### Self-Managed notes

**Self-signed / internal CA certificates**

If your Kibana or Elasticsearch endpoint uses a self-signed certificate or one issued by an internal CA, the installer will prompt:

```
Skip TLS certificate verification? Required for self-signed / internal CA certs. (y/N):
> y
  ⚠  TLS verification disabled — ensure you trust this endpoint.
```

Answering `y` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for the duration of the installer process only. This is safe for internal networks where you control the endpoint. Do not use on untrusted networks.

**Air-gapped / no internet access**

The integration installer (Installer 1) resolves the latest AWS package version by first querying Kibana's own Fleet API (`GET /api/fleet/epm/packages/aws`), which works without any internet access. It only falls back to the public Elastic Package Registry (`epr.elastic.co`) if the Kibana Fleet API does not return a version. The pipeline and dashboard installers have no external network dependencies at all.

**Fleet setup**

On self-managed Kibana, Fleet must be enabled and initialised before running Installer 1. Go to **Kibana → Fleet → Settings** and complete the Fleet setup wizard if you have not already done so.

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

### Using custom pipelines alongside the official AWS integration

The custom pipelines were designed to cover services **not** included in the official Elastic AWS integration, so in most cases they are purely additive. However there are a few things to be aware of if you have both installed.

**Services intentionally excluded from the custom pipelines** (already covered by the official integration):

CloudTrail, VPC Flow, ALB/NLB, GuardDuty, S3 Access, API Gateway, CloudFront, Network Firewall, Security Hub, WAF, Route 53, EC2 (metrics), ECS, Config, Inspector, DynamoDB, Redshift, EBS, Kinesis, MSK/Kafka, SNS, SQS, Transit Gateway, VPN, AWS Health, Bedrock Agent, Billing, NAT Gateway.

None of these have a custom pipeline — there is nothing to conflict with.

**Services where different dataset names are used to avoid conflicts:**

For services where the load generator produces logs under a different dataset name than the official integration uses, both pipelines coexist safely and target separate data streams:

| Service | Official dataset | Load generator dataset |
|---------|-----------------|----------------------|
| Lambda | `aws.lambda` | `aws.lambda_logs` |
| EC2 | `aws.ec2` | `aws.ec2_logs` |
| EMR | `aws.emr` | `aws.emr_logs` |

**Two pipelines that will overwrite official integration pipelines if installed:**

| Pipeline | Group | Notes |
|----------|-------|-------|
| `logs-aws.rds-default` | databases | RDS has official integration coverage. The custom pipeline adds structured JSON parsing for the load generator's simulated log format but **replaces** the official pipeline for the `logs-aws.rds` data stream. Skip this pipeline if you want to preserve the official integration's RDS field mappings and ECS normalization for real RDS logs. |
| `logs-aws.eks-default` | compute | Same situation as RDS above — EKS is covered by the official integration. |

**Recommendation:** If you are running the official AWS integration alongside the load generator, consider skipping the **RDS** entry from the `databases` group and the **EKS** entry from the `compute` group when prompted during installation. All other custom pipelines are safe to install without affecting the official integration.

---

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

---

## Installer 3 — Custom Dashboards

**File:** `installer/custom-dashboards/`
**Command:** `npm run setup:dashboards`

### What it installs

Pre-built Kibana dashboards for AWS services monitored by the load generator. Dashboards use ES|QL queries against
the `logs-aws.*` data streams written by the app.

### Dashboards included

| File | Title | Panels |
|------|-------|--------|
| `glue-dashboard.json` | AWS Glue — Jobs & Performance | 15 panels |
| `sagemaker-dashboard.json` | AWS SageMaker — Endpoints & Training | 13 panels |

#### AWS Glue — Jobs & Performance

| Panel | Type | Metric |
|-------|------|--------|
| Total Runs | KPI metric | Count of all events |
| Success Rate % | KPI metric | % of events with `event.outcome` = success |
| Avg Duration (s) | KPI metric | Avg `event.duration` in seconds |
| Failed Runs | KPI metric | Count where `event.outcome` = failure |
| Run Outcomes | Donut | Count by `event.outcome` (success / failure) |
| Runs by State | Donut | Count by `aws.glue.job.run_state` |
| Failures by Error Category | Horizontal bar | Count by `aws.glue.error_category` (failures only) |
| Avg Job Duration | Line | Avg `event.duration` converted to seconds |
| JVM Heap Usage | Line | Avg `aws.glue.metrics.driver.jvm.heap.usage` (0–1) |
| Executor Count | Line | Avg `aws.glue.metrics.driver.ExecutorAllocationManager.executors.numberAllExecutors` |
| Failed / Killed Tasks | Stacked bar | Sum of `numFailedTasks` and `numKilledTasks` over time |
| Elapsed Time ETL | Line | Avg `aws.glue.metrics.driver.aggregate.elapsedTime` (ms) |
| Records Read | Line | Sum `aws.glue.metrics.driver.aggregate.numRecords` over time |
| Throughput by Job Name | Horizontal bar | Count by `aws.glue.job.name` (top 10 jobs) |
| Recent Job Runs | Data table | Last 100 events: timestamp, job name, state, outcome, duration, error category |

#### AWS SageMaker — Endpoints & Training

| Panel | Type | Metric |
|-------|------|--------|
| Total Invocations | KPI metric | Sum `aws.sagemaker.cloudwatch_metrics.Invocations.sum` |
| Avg Latency (ms) | KPI metric | Avg `aws.sagemaker.cloudwatch_metrics.ModelLatency.avg` |
| Total 4xx Errors | KPI metric | Sum `Invocations4XXError.sum` |
| Total 5xx Errors | KPI metric | Sum `Invocations5XXError.sum` |
| Invocations Over Time | Area | Sum `aws.sagemaker.cloudwatch_metrics.Invocations.sum` |
| Model Latency | Line | Avg `aws.sagemaker.cloudwatch_metrics.ModelLatency.avg` |
| 4xx / 5xx Errors | Line (2 series) | Sum of `Invocations4XXError.sum` and `Invocations5XXError.sum` |
| GPU / CPU Utilization | Line (2 series) | Avg of `GPUUtilization.avg` and `CPUUtilization.avg` |
| Job Outcomes | Donut | Count by `event.outcome` |
| Events by Job Type | Horizontal bar | Count by `aws.sagemaker.job.type` |
| Events by Action | Horizontal bar | Count by `event.action` (top 10 actions) |
| Training Loss & Accuracy | Line (2 series) | Avg `training_loss` and `accuracy` (Training jobs only) |
| Recent SageMaker Events | Data table | Last 100 events: timestamp, job name, type, action, outcome, duration |

### How to run

```bash
npm run setup:dashboards
# or directly:
node installer/custom-dashboards/index.mjs
```

### Credentials

| Prompt | Where to find it |
|--------|-----------------|
| **Kibana URL** | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key** | Kibana → Stack Management → API Keys → Create API key — needs `kibana_admin` built-in role |

**Note:** The dashboard installer uses the Kibana Dashboards API (`Elastic-Api-Version: 1`), which requires **Kibana 9.4+**. If you are on an earlier version, dashboards can be imported manually via Kibana → Stack Management → Saved Objects → Import using the JSON files in `installer/custom-dashboards/`.

### What happens

1. Prompts for Kibana URL and API key
2. Tests the connection and confirms the Kibana version
3. Lists available dashboards and prompts for selection
4. For each selected dashboard: searches by title, skips if already installed, creates if not
5. Prints a summary of installed / skipped / failed counts

### Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Dashboard Installer         ║
╚══════════════════════════════════════════════════════╝

Installs Kibana dashboards for AWS services monitored
by the AWS → Elastic Load Generator.

Kibana URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to Kibana: my-deployment (9.4.0)

Available dashboards:

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

### Template variables / filter controls

The dashboard JSON format does not include Kibana filter controls (e.g. dropdowns to filter by job name, job type, or region). These must be added manually after import via the Kibana UI:

1. Open the dashboard in Kibana
2. Click **Controls** in the dashboard toolbar (or **Edit → Add control**)
3. Add an **Options list** control for any field you want to filter by — common choices:
   - `aws.glue.job.name` — filter all Glue panels to a single job
   - `aws.sagemaker.job.type` — filter SageMaker panels to Training / Endpoint / etc.
   - `event.outcome` — toggle between success and failure views
   - `cloud.region` — filter by AWS region

Controls are saved as part of the dashboard in Kibana and persist across sessions, but are not exported in the simplified JSON format used by this installer.

---

### Adding more dashboards

Any `*-dashboard.json` file placed in `installer/custom-dashboards/` is automatically discovered and presented in the
selection menu. The JSON format is the Kibana Dashboards API format — see the existing files for reference.

---

### Legacy import (Kibana 8.11 – 9.3)

For Kibana versions before 9.4, use the Saved Objects `.ndjson` installer instead:

```bash
npm run setup:dashboards:legacy
# or directly:
node installer/custom-dashboards/index-legacy.mjs
```

This uses `POST /api/saved_objects/_import` which is supported from **Kibana 8.11+** (when ES|QL became available).

The ndjson files are pre-generated and committed under `installer/custom-dashboards/ndjson/`. If you add a new
`*-dashboard.json` file, regenerate them:

```bash
npm run generate:dashboards:ndjson
# or directly:
node installer/custom-dashboards/generate-ndjson.mjs
```

You can also import the `.ndjson` files manually via the Kibana UI:
**Stack Management → Saved Objects → Import → select the file → Import**

| Method | Kibana version | Command |
|--------|---------------|---------|
| Dashboards API | 9.4+ | `npm run setup:dashboards` |
| Saved Objects import | 8.11 – 9.3 | `npm run setup:dashboards:legacy` |
| Manual UI import | 8.11+ | Stack Management → Saved Objects → Import |

---

## Why three separate installers?

| | `setup:integration` | `setup:pipelines` | `setup:dashboards` |
|---|---|---|---|
| **API** | Kibana Fleet API | Elasticsearch Ingest API | Kibana Dashboards API |
| **URL needed** | Kibana URL | Elasticsearch URL | Kibana URL |
| **Privileges** | `cluster: manage` + `kibana: all` | `manage_ingest_pipelines` | `kibana_admin` |
| **What it configures** | Dashboards, ILM, index templates | Ingest pipelines | Custom Kibana dashboards |
| **Re-runnable** | Yes — skips if already installed | Yes — skips existing pipelines | Yes — skips by title |
| **When to re-run** | When Elastic releases a new integration version | When new services are added | When new dashboards are added |

Running all three gives you full coverage across all 136 services.
