# ⚡ AWS → Elastic Load Generator

A web UI for bulk-generating realistic AWS logs and metrics and shipping them directly to an Elastic deployment via the Elasticsearch Bulk API. Covers **200 AWS services** across **15 service groups**, all using **ECS (Elastic Common Schema)** field naming.

Each service has its correct real-world ingestion source pre-configured — S3, CloudWatch, direct API, Firehose, OTel, or Elastic Agent — matching how each service actually delivers data to Elastic in production. Switch between **Logs**, **Metrics**, and **Traces** mode; **165 services** support Metrics mode.

**Documentation index** (canonical reference material, version history, pipeline reference): [docs/README.md](docs/README.md). Shorter-path copies of two CloudWatch guides also live under [aws-elastic-setup/](aws-elastic-setup/).

---

## What's New in v11.4

- **200-service milestone** — 15 new AWS service generators: Amazon VPC IPAM, AWS Private 5G, Amazon Neptune Analytics, Amazon Aurora DSQL, AWS Mainframe Modernization, AWS Parallel Computing Service, Amazon Elastic VMware Service (EVS), AWS SimSpace Weaver, Amazon HealthOmics, Amazon Bedrock Data Automation, AWS Ground Station, Amazon WorkMail, AWS Wickr, Amazon Q Developer, AWS End User Messaging.
- **165 metrics generators** — all 15 new services included in Metrics mode via the generic CloudWatch generator.
- **167 ingest pipelines** — 15 new pipelines added to the custom pipeline installer across 8 groups (networking, databases, compute, aiml, iot, enduser, devtools, streaming).
- **158 ML anomaly detection jobs across 24 groups** — `v114-services-jobs.json` adds one targeted detector per new service, partitioned by the most operationally meaningful dimension (pool ID, site ID, cluster ID, graph ID, queue, channel, etc.).
- **Proper AWS icons** — 9 new SVG icons added to `public/aws-icons/` from the official AWS Architecture Icon library (`AWSPrivate5G`, `AWSMainframeModernization`, `AWSParallelComputingService`, `AmazonElasticVMwareService`, `AWSSimSpaceWeaver`, `AmazonHealthOmics`, `AWSGroundStation`, `AmazonWorkMail`, `AWSWickr`).
- **UI fully updated** — all 15 new services appear in the service picker with correct group, icon, and description.

## What's New in v11.3

- **Scheduled mode** — new card in the UI runs shipping on a repeat timer to build an ML baseline. Set **Total runs** (1–24, default 12) and **Interval** (5–60 min, default 15); for example 12 × 15 min ≈ 3 hours of spaced loads. A header badge shows `Run N/M` during the schedule, and a countdown timer in the progress card shows the wait between runs. The **Stop** button cancels both the current run and the pending countdown.
- **Inject anomalies checkbox** — when checked, each **Ship** (including every run under scheduled mode) completes the main load and then runs a second spike pass at current time. Metrics values are inflated **20×**, log error rate is forced to **100%**, and trace durations are multiplied **15×**, producing sharp deviations for ML anomaly detection. For a clean baseline-first demo, leave this off during the schedule and enable it only when you want the spike.
- **Browser storage** — **Elasticsearch URL and API key are never written to `localStorage`.** Only non-sensitive UI preferences are saved. If an older build left extra keys in the stored object, they are stripped on load so credentials are not kept on disk.
- **Concurrent service shipping** — services are now shipped in parallel (4-worker pool) rather than sequentially, significantly reducing wall-clock time for large service selections.
- **Metrics timestamp window reduced to 2 hours** — `metrics-aws.*` data streams are TSDS-backed with an approximate 2-hour look-back writable range on Elastic Cloud. The previous 7-day window generated timestamps outside this range, causing `timestamp_error` rejections. Millisecond-precision timestamps make dimension+timestamp collisions effectively impossible even within the narrower window.
- **ML datafeed `query_delay: 60s`** — added to all 158 ML job datafeed configs to prevent "missed documents due to ingest latency" warnings. Datafeeds now trail real time by 60 seconds before querying, giving ingestion time to complete before the datafeed window closes.
- **Delete and reinstall modes for all three installers** — the custom pipelines, dashboards, and ML jobs installers now offer delete and delete+reinstall modes so updated configs can be applied without manual Kibana intervention. See the installer sections below for details.
- **Readline input bleed fix** — in all three interactive installers, the API key prompt no longer pre-populates with the previous answer (Elasticsearch/Kibana URL).
- **Traces mode** — **23** APM scenarios: single-service traces plus multi-service workflows (e‑commerce, ML, ingestion, Step Functions, cascading failure, **SNS fan-out**, **data pipelines** for S3→SQS→Glue and EventBridge→SFN). The trace picker groups workflows and shows correct AWS icons; pipeline generators live in `workflow-pipelines.js` beside the shared `workflow-internal.js` builders.

For earlier releases see [docs/VERSION-HISTORY.md](docs/VERSION-HISTORY.md).

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
```

**Shipping to Elasticsearch from the dev server** needs the small bulk proxy (same role as nginx → proxy in Docker). Use two terminals:

```bash
# Terminal 1 — proxy on port 3001 (default)
node proxy.cjs

# Terminal 2 — Vite (proxies /proxy → http://127.0.0.1:3001)
npm run dev
# → http://localhost:3000
```

See **[Testing](#testing)** for commands, samples workflow, formatting, and CI.

To stop Docker: `docker compose down`

---

## Testing

| Command                                           | What it does                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`npm run test`**                                | Runs **Vitest** (`src/**/*.test.ts`, etc.), then **`npm run samples:verify`** — fails if any registered log, metric, or trace generator is missing a matching file under `samples/logs`, `samples/metrics`, or `samples/traces`. |
| **`npm run test:watch`**                          | Vitest in watch mode (does not run `samples:verify`).                                                                                                                                                                            |
| **`npm run samples`**                             | Regenerates all sample JSON files from the generators. Run this after **adding or renaming a service**, then commit the updated `samples/` tree.                                                                                 |
| **`npm run samples:verify`**                      | Only the sample-file guard (also part of `npm run test`).                                                                                                                                                                        |
| **`npm run format`** / **`npm run format:check`** | **Prettier** over the repo (`format:check` is what CI uses).                                                                                                                                                                     |
| **`npm run lint`** / **`npm run typecheck`**      | ESLint (TS/TSX, scripts, `proxy.cjs`; `src/**/*.js` generators excluded for now) and `tsc --noEmit`.                                                                                                                             |

**Pull requests:** GitHub Actions runs **`format:check`**, **`lint`**, **`typecheck`**, **`test`**, and **`build`** on Node 20. [Dependabot](.github/dependabot.yml) opens weekly grouped npm updates.

**Node.js:** `package.json` declares **`engines.node`: `>=18`**; the Docker image and CI use **20**.

**End-to-end (browser) tests** are not in this repository; add Playwright or Cypress separately if you need UI regression coverage.

---

## Bulk proxy (security)

`proxy.cjs` is a **small forwarder** to your cluster’s **`_bulk`** API: the browser sends the target Elasticsearch URL and API key in headers (`x-elastic-url`, `x-elastic-key`). It is meant for **local use** or **trusted networks** (e.g. Docker Compose with nginx), **not** as a public internet-facing relay.

- **Bind address** — Listens on **`127.0.0.1`** by default (`PROXY_HOST`). On shared workstations this avoids exposing the proxy to the LAN. Use **`PROXY_HOST=0.0.0.0`** only when you intentionally accept remote TCP (for example a published container port).
- **Body size** — **`PROXY_MAX_BODY_BYTES`** (default **50 MiB**) rejects oversized bulk payloads with **413**.
- **Methods** — **`GET /health`** for health checks; **`POST`** for bulk forwards. Other methods get **405**.
- **Observability** — One JSON line per finished response on **stderr** (`event: "proxy_access"`, method, path, status, duration, bytes in, optional `targetHost`). No document bodies and no API keys are logged. Set **`PROXY_QUIET=1`** to disable.
- **Other env** — **`PROXY_PORT`** (default **3001**), **`PROXY_REQUEST_TIMEOUT_MS`** (default **120000**).

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

| Prompt     | Where to find it                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Kibana URL | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| API key    | Kibana → Stack Management → API Keys → Create API key (needs `cluster: manage` + `kibana: all` privileges)   |

If the integration is already installed, the installer skips — it is safe to re-run at any time.

---

### Step 2 — Install custom ingest pipelines

```bash
npm run setup:pipelines
```

**What it does:** Installs Elasticsearch ingest pipelines for the ~100 AWS services not covered by the official integration. These pipelines parse the structured JSON `message` field emitted by the load generator into named fields (e.g. `glue.parsed`, `sagemaker.parsed`), making logs fully searchable and aggregatable in Kibana.

**What you'll be prompted for:**

| Prompt            | Where to find it                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Elasticsearch URL | Deployment overview → Elasticsearch endpoint (e.g. `https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243`) |
| API key           | Kibana → Stack Management → API Keys → Create API key (needs `manage_ingest_pipelines` cluster privilege)           |

You can select individual groups by number (e.g. `1,3,8`) or type `all`. Already-installed pipelines are automatically skipped.

**To update pipelines after an upgrade**, choose option `3. Delete then reinstall` — this removes existing pipelines and recreates them from the latest definitions.

---

### Step 3 — Install custom dashboards

```bash
npm run setup:dashboards
```

**What it does:** Installs pre-built Kibana dashboards for AWS services monitored by the load generator. Dashboards use ES|QL queries against the `logs-aws.*` data streams.

| Dashboard                                | Panels                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS Glue — Jobs & Performance**        | KPI row (total runs, success rate %, avg duration, failed runs), run outcomes (donut), runs by state (donut), failures by error category (bar), avg job duration (line), JVM heap usage (line), executor count (line), failed/killed tasks (bar), elapsed time ETL (line), records read (line), throughput by job name (bar), recent job runs (table) |
| **AWS SageMaker — Endpoints & Training** | KPI row (total invocations, avg latency, total 4xx/5xx errors), invocations over time (area), model latency (line), 4xx/5xx errors (line), GPU/CPU utilization (line), job outcomes (donut), events by job type (bar), events by action (bar), training loss & accuracy (line), recent events (table)                                                 |

**What you'll be prompted for:**

| Prompt     | Where to find it                                                                  |
| ---------- | --------------------------------------------------------------------------------- |
| Kibana URL | Deployment overview → Kibana endpoint                                             |
| API key    | Kibana → Stack Management → API Keys → Create API key (needs `kibana_admin` role) |

Already-installed dashboards are automatically skipped — the installer is safe to re-run at any time.

**To update dashboards after an upgrade**, choose option `3. Delete then reinstall`.

**Requires Kibana 9.4+.** For Kibana 8.11–9.3 use the legacy installer:

```bash
npm run setup:dashboards:legacy
```

Or import manually: **Stack Management → Saved Objects → Import** — select any `.ndjson` file from `installer/custom-dashboards/ndjson/`.

---

**Pipeline groups and what they cover:**

| Group      | Pipelines | Key services                                                                                                                                                                                                                                                                        |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| analytics  | 15        | Glue, EMR, Athena, Lake Formation, QuickSight, DataBrew, AppFlow, AppFabric, B2B Data Interchange                                                                                                                                                                                   |
| compute    | 8         | EC2, EKS, Fargate, ECR, App Runner, Batch, Elastic Beanstalk, Outposts                                                                                                                                                                                                              |
| databases  | 10        | ElastiCache, OpenSearch, DocumentDB, Aurora, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, DAX                                                                                                                                                                                    |
| devtools   | 9         | CodeCommit, CodeArtifact, Amplify, CodeGuru, DevOps Guru, Lightsail, Proton                                                                                                                                                                                                         |
| enduser    | 14        | WorkSpaces, Connect, AppStream, GameLift, Transfer Family, MediaConvert, MediaLive, Pinpoint, Location Service, Managed Blockchain, Fraud Detector, Lookout for Metrics, Comprehend Medical, SES                                                                                    |
| iot        | 8         | IoT Core, Greengrass, IoT Analytics, IoT Events, IoT SiteWise, IoT Defender                                                                                                                                                                                                         |
| management | 25        | CloudFormation, SSM, CloudWatch Alarms, AWS Health, Trusted Advisor, Control Tower, Organizations, Service Catalog, Service Quotas, Compute Optimizer, Budgets, Billing, RAM, Resilience Hub, Migration Hub, Network Manager, DMS, AppConfig, Elastic DRS, License Manager, Chatbot |
| media      | 2         | Chime SDK Voice, (additional media services)                                                                                                                                                                                                                                        |
| ml         | 14        | SageMaker, Bedrock, Bedrock Agent, Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, Forecast, Personalize, Lex                                                                                                                                                      |
| networking | 9         | Shield, Global Accelerator, Direct Connect, PrivateLink, App Mesh, Client VPN, Cloud Map                                                                                                                                                                                            |
| security   | 16        | Macie, IAM Access Analyzer, Cognito, KMS, Secrets Manager, ACM, IAM Identity Center, Detective, Audit Manager, Verified Permissions, Payment Cryptography, Artifact                                                                                                                 |
| serverless | 5         | Lambda, API Gateway, Step Functions, EventBridge, AppSync                                                                                                                                                                                                                           |
| storage    | 6         | EFS, FSx, DataSync, Backup, Storage Gateway, DAX                                                                                                                                                                                                                                    |
| streaming  | 5         | Kinesis Analytics, Amazon MQ, SNS, SQS, (custom pipelines)                                                                                                                                                                                                                          |

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

**What it does:** Installs 158 Elasticsearch ML anomaly detection jobs across 24 groups — covering services that the official Elastic AWS integration does not include. Jobs are created directly via the Elasticsearch ML API.

| Prompt            | Where to find it                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Elasticsearch URL | Deployment overview → Elasticsearch endpoint                                                |
| API key           | Kibana → Stack Management → API Keys → Create API key (needs `manage_ml` cluster privilege) |

The installer presents four modes:

| Option                     | What it does                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `1. Install jobs`          | Creates jobs and datafeeds; skips any already installed                                                        |
| `2. Stop jobs`             | Stops datafeeds and closes jobs (preserves job history and model state)                                        |
| `3. Delete jobs`           | Stops, closes, then permanently deletes jobs and datafeeds                                                     |
| `4. Delete then reinstall` | Full delete pass followed by a fresh install — use this to pick up config changes (e.g. updated `query_delay`) |

After installation, the installer offers to open jobs and start datafeeds immediately. Results appear in **Kibana → Machine Learning → Anomaly Detection → Anomaly Explorer** once at least one bucket span of data has been collected.

---

**Why four separate installers?**

|                    | `setup:integration`        | `setup:pipelines`           | `setup:dashboards`       | `setup:ml-jobs`             |
| ------------------ | -------------------------- | --------------------------- | ------------------------ | --------------------------- |
| API used           | Kibana Fleet API           | Elasticsearch Ingest API    | Kibana Dashboards API    | Elasticsearch ML API        |
| Credentials        | Kibana URL + API key       | Elasticsearch URL + API key | Kibana URL + API key     | Elasticsearch URL + API key |
| What it configures | Dashboards, ILM, templates | Ingest pipelines            | Custom Kibana dashboards | ML anomaly detection jobs   |
| Re-runnable        | Yes — skips if installed   | Yes — skips existing        | Yes — skips by title     | Yes — skips existing jobs   |
| Delete / reinstall | —                          | Yes — modes 2 & 3           | Yes — modes 2 & 3        | Yes — modes 2, 3 & 4        |
| Kibana version     | Any                        | —                           | 9.4+ (or 8.11+ legacy)   | —                           |

---

## Usage

1. **Select services** — toggle individual services, entire groups, or all 200 at once
2. **Choose mode** — **Logs** generates log documents for all 200 services; **Metrics** generates metrics documents for the 165 metrics-supported services; **Traces** generates APM trace documents for 23 services
3. **Configure volume** — set logs per service (50–5,000), error rate (0–50%), and batch size
4. **Set ingestion source** — leave on **Default (per-service)** or override all services to a single source for pipeline testing
5. **Scheduled mode** _(optional)_ — enable to automatically repeat shipping on a timer. Set **Total runs** and **Interval** to build a consistent ML baseline without manual re-runs. See [ML anomaly detection workflow](#ml-anomaly-detection-workflow) for a recommended baseline-then-spike flow.
6. **Inject anomalies** _(optional)_ — when checked, **every** Ship (including each scheduled run) adds a spike pass after the main load. Leave it off while establishing a baseline if you do not want anomalies mixed into those runs.
7. **Connect to Elastic** — enter your Elasticsearch URL, API key, and index prefix. **These credentials are not saved in the browser** (session memory only); other settings may be persisted locally — see [What's New in v11.3](#whats-new-in-v113).
8. **Preview** — click **Preview doc** to inspect a sample document before shipping
9. **Ship** — click ⚡ **Ship** and watch real-time progress in the activity log

### Getting an Elastic API key

1. Kibana → **Stack Management** → **API Keys**
2. Click **Create API key**
3. Assign `cluster_admin` or scoped `index_admin` privileges
4. Copy the **base64** encoded key into the UI

### Index naming

Indices follow the pattern **`{prefix}.{dataset_suffix}`**. The suffix comes from the Elastic dataset field (e.g. `aws.lambda` → `lambda`, `aws.elb_logs` → `elb_logs`).

| Mode    | Default prefix | Example index                                              |
| ------- | -------------- | ---------------------------------------------------------- |
| Logs    | `logs-aws`     | `logs-aws.lambda`, `logs-aws.elb_logs`, `logs-aws.vpcflow` |
| Metrics | `metrics-aws`  | `metrics-aws.lambda`, `metrics-aws.elb`                    |

Timestamp windows per mode:

| Mode    | Window  | Reason                                                                                          |
| ------- | ------- | ----------------------------------------------------------------------------------------------- |
| Logs    | 30 min  | Gives spread across a short recent window; log IDs are not timestamp-derived                    |
| Metrics | 2 hours | TSDS-backed `metrics-aws.*` data streams have an ~2 h look-back writable range on Elastic Cloud |
| Traces  | 30 min  | APM trace IDs are not timestamp-derived                                                         |

---

### ML anomaly detection workflow

The load generator includes two features designed to work together for demonstrating Elastic ML anomaly detection:

#### Step 1 — Build a baseline with scheduled mode

ML models need several hours of "normal" traffic to establish a baseline before they can score deviations. With `bucket_span: 15m`, roughly 8–12 filled buckets (2–3 hours) are needed.

1. Enable **Scheduled mode** and set **12 runs × 15 min interval** (the defaults)
2. Leave **Inject anomalies** unchecked
3. Click **Ship** — the generator will run 12 times automatically, pausing 15 minutes between each run
4. Monitor progress: the header shows `Run N/12` and the progress card counts down to the next run
5. While the schedule runs, open all ML jobs and start all datafeeds from Kibana or Dev Console:

```
POST /_ml/anomaly_detectors/_all/_open

POST /_ml/datafeeds/_all/_start
{ "start": "now-3d" }
```

#### Step 2 — Inject anomalies

Once the schedule completes and the ML models have a baseline:

1. Enable **Inject anomalies**
2. Optionally disable **Scheduled mode** (a single manual Ship is enough for the spike; if you leave scheduled mode on with **Inject anomalies** checked, every repeat run will also perform the spike pass after its main load)
3. Click **Ship** — the normal run completes, then a second spike pass fires at current time:
   - **Metrics** — all numeric fields inflated **20×**
   - **Logs** — error rate forced to **100%**
   - **Traces** — durations multiplied **15×**
4. Wait 1–2 minutes (datafeed `query_delay: 60s` + one bucket span)
5. Check **Kibana → Machine Learning → Anomaly Detection → Anomaly Explorer** — jobs with `record_score ≥ 75` indicate major anomalies

#### Checking anomaly results directly

```
GET /.ml-anomalies-*/_search
{
  "query": { "range": { "record_score": { "gte": 50 } } },
  "sort": [{ "timestamp": "desc" }],
  "size": 10
}
```

---

## Elastic AWS integration coverage

Documents align with the official [Elastic AWS integration](https://github.com/elastic/integrations/tree/main/packages/aws). The table below shows which services have a native Elastic data stream and which use ECS-only (`aws.<service>`).

| Official integration | Data stream / dataset                                                                                                                                  | Services                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Yes                  | `aws.cloudtrail`                                                                                                                                       | CloudTrail                                                          |
| Yes                  | `aws.vpcflow`                                                                                                                                          | VPC Flow                                                            |
| Yes                  | `aws.elb_logs`                                                                                                                                         | ALB, NLB                                                            |
| Yes                  | `aws.guardduty`                                                                                                                                        | GuardDuty                                                           |
| Yes                  | `aws.s3access`                                                                                                                                         | S3 access logs                                                      |
| Yes                  | `aws.apigateway_logs`                                                                                                                                  | API Gateway                                                         |
| Yes                  | `aws.cloudfront_logs`                                                                                                                                  | CloudFront                                                          |
| Yes                  | `aws.lambda` / `aws.lambda_logs`                                                                                                                       | Lambda                                                              |
| Yes                  | `aws.firewall_logs`                                                                                                                                    | Network Firewall                                                    |
| Yes                  | `aws.securityhub_findings`                                                                                                                             | Security Hub                                                        |
| Yes                  | `aws.waf`                                                                                                                                              | WAF, WAF v2                                                         |
| Yes                  | `aws.rds`, `aws.ec2_logs`, `aws.ecs_metrics`, `aws.config`, `aws.inspector`, `aws.dynamodb`, `aws.redshift`, `aws.emr_logs`, `aws.route53_public_logs` | RDS, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EMR, Route 53 |
| No — ECS only        | `aws.<service>`                                                                                                                                        | All remaining ~90 services                                          |

For integration-backed services, field names follow the integration's index mappings so pre-built dashboards and security rules work without modification.

---

## ECS field coverage

Every document includes these standard ECS base fields:

| ECS field            | Example value                     | Notes                                            |
| -------------------- | --------------------------------- | ------------------------------------------------ |
| `@timestamp`         | `2025-03-11T14:22:01.000Z`        | Random within last 24 hours                      |
| `cloud.provider`     | `aws`                             | Always `aws`                                     |
| `cloud.region`       | `eu-west-2` or `us-east-1`        |                                                  |
| `cloud.account.id`   | `814726593401`                    | One of 5 fictitious account IDs                  |
| `cloud.account.name` | `globex-production`               | Human-readable account alias                     |
| `cloud.service.name` | `lambda`, `guardduty`, …          | AWS service identifier                           |
| `aws.dimensions`     | `{ FunctionName: "api-handler" }` | Real CloudWatch dimension keys per service       |
| `event.dataset`      | `aws.lambda`, `aws.guardduty`, …  | Routes to Elastic integration dashboards         |
| `event.provider`     | `lambda.amazonaws.com`            | AWS endpoint that produced the event             |
| `event.category`     | `["network"]`, `["database"]`, …  | ECS array — required for SIEM rules              |
| `event.outcome`      | `success` or `failure`            | Derived from status / error rate                 |
| `event.duration`     | `4500000000`                      | Nanoseconds — present on all time-bound services |
| `event.kind`         | `event` or `alert`                | Set to `alert` for security findings             |
| `log.level`          | `info`, `warn`, `error`           |                                                  |
| `message`            | Human-readable log line           |                                                  |

Additional ECS field groups by service category:

| Category          | ECS fields added                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Security / IAM    | `user.name`, `user.id`, `source.ip`, `event.action`, `error.code`, `error.message`                |
| Network           | `source.ip`, `destination.ip`, `network.transport`, `network.bytes`, `network.direction`          |
| HTTP / API        | `http.request.method`, `http.response.status_code`, `url.path`, `user_agent.original`             |
| Database          | `db.name`, `db.operation`, `db.type`, `error.code`, `error.message`                               |
| File / Storage    | `file.path`, `file.size`, `file.hash.sha256`                                                      |
| Container         | `container.id`, `container.image.name`, `container.image.tag`, `container.runtime`                |
| Process / Compute | `host.hostname`, `host.os.platform`, `host.cpu.count`, `process.name`, `process.pid`              |
| Email             | `email.from.address`, `email.to.address`, `email.message_id`                                      |
| Threat / Security | `threat.indicator.type`, `vulnerability.id`, `vulnerability.severity`, `vulnerability.score.base` |

---

## Ingestion methods

Each service defaults to the method that matches how AWS actually delivers data to Elastic in production. You can override all services to a single method for pipeline testing.

| Method            | `input.type`     | Default for                                                                                                                                                                    |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S3**            | `aws-s3`         | CloudTrail, ALB, NLB, CloudFront, WAF, WAF v2, VPC Flow, Network Firewall, S3 access logs                                                                                      |
| **CloudWatch**    | `aws-cloudwatch` | Lambda, API Gateway, RDS, ECS, EC2, EKS, and most other services                                                                                                               |
| **API**           | `http_endpoint`  | GuardDuty, Security Hub, Inspector, Config, IAM Access Analyzer, Macie, Detective, Trusted Advisor, Compute Optimizer, Budgets, Billing, Service Quotas, Fraud Detector, X-Ray |
| **Firehose**      | `aws-firehose`   | Kinesis Data Firehose                                                                                                                                                          |
| **OTel**          | `opentelemetry`  | Override only — adds `telemetry.sdk` and OTLP-style metadata                                                                                                                   |
| **Elastic Agent** | `logfile`        | Override only — documents as if collected from log files                                                                                                                       |

When **Ingestion source** is set to **Default**, each service uses its native method. When you select an override, all selected services use that method — useful for testing a single ingest pipeline across any mix of AWS services.

---

## Fictitious AWS organisation

All documents use a consistent fictitious organisation — **Globex** — with five accounts rotating across documents to simulate a real multi-account environment.

| Account ID     | Account name              | Purpose               |
| -------------- | ------------------------- | --------------------- |
| `814726593401` | `globex-production`       | Production workloads  |
| `293847561023` | `globex-staging`          | Pre-production / QA   |
| `738291046572` | `globex-development`      | Developer sandboxes   |
| `501938274650` | `globex-security-tooling` | Security services     |
| `164820739518` | `globex-shared-services`  | Shared infrastructure |

Regions rotate between `eu-west-2` (London) and `us-east-1` (N. Virginia).

---

## Supported services (200 total)

200 services across 15 groups are supported. Each entry includes the default ingestion source (S3, CloudWatch, API, Firehose) and the ECS dataset field used. For the full per-service breakdown, browse [src/generators/logs/](src/generators/logs/) or [src/generators/metrics/](src/generators/metrics/), or use the service picker in the UI.

| Group                      | Services (examples)                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Serverless & Core          | Lambda, API Gateway, VPC Flow, CloudTrail, RDS, ECS                                                                                       |
| Compute & Containers       | EC2, EKS, Fargate, ECR, App Runner, Batch, Elastic Beanstalk, Outposts, Mainframe Modernization, Parallel Computing, EVS, SimSpace Weaver |
| Networking & CDN           | ALB, NLB, CloudFront, WAF, Route 53, Network Firewall, Shield, App Mesh, Client VPN, VPC IPAM, Private 5G                                 |
| Security & Compliance      | GuardDuty, Security Hub, Macie, Inspector v2, Config, IAM Access Analyzer, KMS, Security Lake                                             |
| Storage & Databases        | S3, DynamoDB, ElastiCache, Redshift, OpenSearch, DocumentDB, EFS, Aurora, Neptune, Neptune Analytics, Aurora DSQL                         |
| Streaming & Messaging      | Kinesis, MSK, SQS, SNS, EventBridge, Step Functions, AppSync, End User Messaging                                                          |
| Developer & CI/CD          | CodeBuild, CodePipeline, CodeDeploy, CodeCommit, Amplify, X-Ray, CodeGuru, Q Developer                                                    |
| Analytics                  | EMR, Glue, Athena, Lake Formation, QuickSight, MWAA, Clean Rooms, DataZone                                                                |
| AI & Machine Learning      | SageMaker, Bedrock, Bedrock Agent, Rekognition, Textract, Comprehend, Lex, Kendra, HealthOmics, Bedrock Data Automation                   |
| IoT                        | IoT Core, Greengrass, IoT Analytics, IoT Events, IoT SiteWise, IoT TwinMaker, IoT FleetWise, Ground Station                               |
| Management & Governance    | CloudFormation, Systems Manager, CloudWatch Alarms, Trusted Advisor, Control Tower, DMS                                                   |
| Media & End-User Computing | MediaConvert, MediaLive, WorkSpaces, Amazon Connect, AppStream, GameLift, Chime SDK Voice, WorkMail, Wickr                                |
| Messaging & Communications | SES, Pinpoint                                                                                                                             |
| Additional Services        | Transfer Family, Lightsail, Fraud Detector, Location Service, Managed Blockchain                                                          |

---

## Configuration reference

| Setting                  | Default                    | Range                   | Description                                                                                                          |
| ------------------------ | -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Event type               | Logs                       | Logs / Metrics / Traces | **Logs** — all 200 services. **Metrics** — 165 metrics-supported services. **Traces** — 23 trace-supported services. |
| Logs/metrics per service | 500                        | 50–5,000                | Documents generated per selected service                                                                             |
| Error rate               | 5%                         | 0–50%                   | Fraction of documents representing errors/failures                                                                   |
| Batch size               | 250                        | 50–1,000                | Documents per `_bulk` API request                                                                                    |
| Index prefix             | `logs-aws` / `metrics-aws` | —                       | Switches automatically by mode; override with any custom prefix                                                      |
| Ingestion source         | Default                    | Default + 6 overrides   | Sets `input.type` on every document                                                                                  |
| `data_stream.dataset`    | auto                       | —                       | Integration-backed services use the Elastic dataset name; others use `aws.<service>`                                 |

---

## Sample data

The **samples/** directory contains one sample document per service generated by the same logic as the app:

- **samples/logs/** — 200 JSON log documents, one per service
- **samples/metrics/** — 165 JSON metrics documents, one per metrics-supported service
- **samples/traces/** — 23 JSON APM trace documents, one per trace-supported service

Regenerate with: `npm run samples` · Verify full coverage: `npm run samples:verify`

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

Request payloads and credentials are not written to disk. The proxy may emit **metadata-only** access lines to stderr (see [Bulk proxy (security)](#bulk-proxy-security)).

---

## Docker image

- **Build**: `node:20-alpine` → **Runtime**: `node:20-alpine` + nginx + supervisor
- **Host port**: 8765 → container port 80
- **Health check**: `GET /health` → 200 OK
- **Processes**: nginx (serves the React SPA) + Node.js proxy (forwards `_bulk` requests to Elastic). Nginx talks to the proxy on **127.0.0.1:3001**, which matches the default **`PROXY_HOST`**. Override **`PROXY_PORT`**, **`PROXY_MAX_BODY_BYTES`**, **`PROXY_REQUEST_TIMEOUT_MS`**, or **`PROXY_QUIET`** in the container environment if needed.

---

## Contributors & acknowledgments

This project was developed with AI-assisted tooling:

- **[Claude Code](https://claude.ai/claude-code)** — Code generation, refactoring, and documentation
- **Human maintainer** — You (the repo owner) remain the author and maintainer

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full contributor list.
