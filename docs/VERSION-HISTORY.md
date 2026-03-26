# Version History

> Full release notes for all versions. Latest release notes are in the [README](../README.md).

---

## What's New in v10.0

- **21 new AWS service generators** — Coverage expanded from 144 to **165 services**. New services: Amazon Kendra, Amazon VPC Lattice, Amazon MWAA, AWS Fault Injection Service, AWS Clean Rooms, Amazon DataZone, AWS Security Incident Response, AWS CloudHSM, Amazon Managed Grafana, AWS Supply Chain, AWS IoT TwinMaker, AWS IoT FleetWise, Amazon CodeCatalyst, AWS Entity Resolution, AWS Data Exchange, AWS Device Farm, Amazon MSK Connect, Amazon Augmented AI (A2I), AWS Deadline Cloud, AWS HealthLake, Amazon Application Recovery Controller.
- **Distributed across 10 existing service groups** — No new groups required; all services slotted into Networking, Security, Streaming, DevTools, Analytics, AI/ML, IoT, Management, and Media.
- **165 log samples** — `samples/logs/` updated; metrics (139) and traces (20) unchanged.

---

## What's New in v9.3

- **5 new service generators** — Coverage expanded from 139 to **144 services**:
  - **Elastic CSPM** (`cspm`) — Cloud Security Posture Management findings against CIS AWS Foundations Benchmark v1.5.0. 14 rules covering IAM (root account usage, MFA, access keys, password policy), audit (CloudTrail, Config), monitoring (CloudWatch metric filters), and networking (security groups, VPC Flow Logs). Routes to `logs-cloud_security_posture.findings-default`.
  - **Elastic KSPM** (`kspm`) — Kubernetes Security Posture Management findings against CIS EKS Benchmark v1.4.0. 10 rules covering API server security, privileged container admission, host namespace sharing, root container minimisation, network policy, and KMS secret encryption. Same `cloud_security_posture.findings` index. Includes `orchestrator.cluster.*` and `orchestrator.namespace` fields.
  - **IAM Privilege Escalation Chain** (`iam-privesc-chain`) — 4-document CloudTrail attack chain sharing actor, source IP, and timestamp: `ListUsers` → `CreateAccessKey` → `AttachUserPolicy` (AdministratorAccess) → `AssumeRole`. Each document carries `threat.tactic` and `threat.technique` (MITRE ATT&CK) fields.
  - **Data Exfiltration Chain** (`data-exfil-chain`) — 3-document cross-service chain: GuardDuty `Exfiltration:S3/MaliciousIPCaller` + CloudTrail S3 data event burst + VPC Flow high-egress record. All docs share attacker IP and target bucket.

- **ML jobs expanded: 70 → 99 jobs, 14 → 20 groups:**
  - `serverless` (4): API Gateway 5xx/throttle/latency, Lambda cold start spikes
  - `devtools` (5): CodeBuild failure/duration, CodePipeline failures, X-Ray error rate/latency
  - `iot` (4): IoT Core connection failures, message volume, rule engine errors, rare device clients
  - `media` (4): MediaConvert failures, Connect abandonment/handle-time, WorkSpaces session failures
  - `siem` (4): CloudTrail rare source IP, root activity, IAM creation spike, Route53 DNS exfiltration
  - `security-extended` (+2): Security Lake OCSF finding spike, rare OCSF class

- **Routing enhancement** — `__dataset` values that don't start with `aws.` now route to `logs-<dataset>-default` instead of the AWS-prefixed path, enabling CSPM/KSPM to land in the correct Elastic Security index without user configuration.

- **Metrics consistency** — `securityhub` dimensional CloudWatch metrics generator added; `greengrass` internal naming corrected; `METRICS_SUPPORTED_SERVICE_IDS` aligned to exactly 139 entries (all 144 UI services minus the 5 chain/posture generators that produce no CloudWatch metrics).

---

## What's New in v9.2

- **Installer 4 — ML Anomaly Detection Jobs** — New `npm run setup:ml-jobs` installer adds **70 Elasticsearch ML anomaly detection jobs** across **14 service groups**, filling the gap left by the official Elastic AWS integration (which only ships ML jobs for CloudTrail). Coverage includes:
  - **Security:** VPC Flow (denied traffic, rare ports, data exfiltration), GuardDuty (finding spikes, rare types), WAF (block rate), CloudTrail (rare user actions), Security Hub (critical finding spikes), Macie (sensitive data exposure), Inspector (vulnerability spikes), AWS Config (compliance drift), KMS (unusual key operations)
  - **Compute:** Lambda (error/throttle/duration per function), EC2 (CPU, network), EKS (pod failures, rare images), ECS (memory pressure, task failures), Auto Scaling (rapid scaling), Elastic Beanstalk (5xx, p99 latency)
  - **Networking:** ALB (5xx, response time, rare user agents), API Gateway (latency, errors), CloudFront (error rate, cache miss storms), Route 53 (NXDOMAIN spikes — DNS attack detection), Network Firewall (drop spikes)
  - **Databases:** RDS (latency, connections), Aurora (replica lag), ElastiCache (hit rate drop, latency), DynamoDB (throttle spikes, latency), Redshift (query duration), OpenSearch (JVM pressure, write rejections)
  - **Streaming:** Kinesis (iterator age lag, throughput), SQS (message age, not-visible count), SNS (delivery failures), MSK/Kafka (consumer lag, under-replicated partitions), EventBridge (failed invocations), Step Functions (execution failures)
  - **AI/ML:** Bedrock (token usage, latency, errors, rare models)
  - **Storage:** S3 (bandwidth, errors, rare operations, rare requesters)
  - **Analytics:** Glue (duration, failures), Athena (data scanned cost spike, query duration), EMR (task failures)
  - **Management:** CloudWatch alarm storms (meta-monitoring), CloudFormation rollback spikes, billing cost anomalies, SSM rare commands
- Jobs are created via the Elasticsearch ML API (no Kibana required). The installer works with Elastic Stack 8.x, Elastic Cloud Hosted, and Elastic Serverless.
- All 70 job definitions live in `installer/custom-ml-jobs/jobs/` as `*-jobs.json` files. Adding new groups requires only a new JSON file — no installer code changes.

---

## What's New in v9.1

- **3 new AWS service generators** — Coverage expanded from 136 to **139 services**:
  - **AWS Verified Access** — `aws.verifiedaccess.*`: device posture, trust provider type (IAM Identity Center / OIDC), verdict/deny_reason, HTTP method/path/status, connection and session IDs
  - **Amazon Security Lake** — `aws.securitylake.*`: full OCSF 1.1.0 format across 6 event classes (`API_ACTIVITY`, `NETWORK_ACTIVITY`, `DNS_ACTIVITY`, `HTTP_ACTIVITY`, `AUTHENTICATION`, `SECURITY_FINDING`) with correct `class_uid` / `category_uid` / `activity_id` / `severity_id` mappings
  - **Amazon Q Business** — `aws.qbusiness.*`: QUERY / DOCUMENT_RETRIEVAL / PLUGIN_INVOCATION / FEEDBACK events with retrieved document attribution, source citations, guardrail tracking, and input/output token counts
- **3 new ingest pipelines** — `logs-aws.verifiedaccess-default`, `logs-aws.securitylake-default`, `logs-aws.qbusiness-default` added to the custom pipelines installer
- **Inspector updated to v2** — Generator updated to Inspector v2 finding types (`PACKAGE_VULNERABILITY`, `NETWORK_REACHABILITY`, `CODE_VULNERABILITY`) with CVSS scoring, CVE details, exploitability field, and ECS `vulnerability.*` fields. Dataset updated to `aws.inspector2.*`
- **Schema alignment with official Elastic field schemas** — Three generators brought in line with the published Elastic metricbeat/filebeat schemas:
  - **EC2** — Replaced CloudWatch metric wrappers with flat Elastic field paths: `aws.ec2.cpu.total.pct`, `aws.ec2.network.in/out.*`, `aws.ec2.diskio.read/write.*`, `aws.ec2.status.check_failed*`
  - **EBS** — Fixed 5 aggregation types from `.sum` → `.avg`: `VolumeReadOps`, `VolumeWriteOps`, `VolumeReadBytes`, `VolumeWriteBytes`, `VolumeConsumedReadWriteOps`
  - **S3** — Added missing request fields (`select`, `list`, `select_scanned/returned` bytes, `first_byte` latency); removed non-standard `bytes_per_period`
- **Generator enhancements** — Six existing services extended:
  - **API Gateway** — `api_type` (REST / HTTP / WebSocket), integration latency, WebSocket route keys (`$connect/$disconnect/$default`), REST API cache hit/miss tracking, metrics block
  - **App Runner** — `auto_scaling` block (`min_size`, `max_size`, `desired_count`, `scale_from_zero`)
  - **Step Functions** — Standard vs Express workflow bifurcation with appropriate duration limits (Express: 5 min max, Standard: long-running), per-type metrics
  - **Redshift** — WLM queue name and wait seconds, `COPY`/`UNLOAD` query types
  - **OpenSearch** — Expanded shard detail (`active`, `initializing`, `relocating`, `unassigned`), write rejection metrics (`CoordinatingWriteRejected`, `PrimaryWriteRejected`, `ReplicaWriteRejected`), warm storage metrics
  - **Bedrock** — Model-family-aware token limits (Anthropic/Amazon/Meta/Mistral), streaming flag, `time_to_first_token_ms`, `input_tokens_per_sec`

---

## What's New in v9.0

- **Elastic AWS integration field alignment** — Comprehensive audit against all 53 official Elastic AWS integration dashboards. Fields generated by the app now match what the integration dashboards expect, so out-of-the-box visualisations populate without missing-field warnings:
  - **WAF** — Added `rule.id`, `rule.ruleset`, `source.ip`, `source.geo.*` (dashboard uses `source.*` not `client.*`)
  - **Lambda** — Fixed `EventSourceMappingUUID` CloudWatch dimension name; added `aws.cloudwatch.log_group` and `aws.cloudwatch.log_stream`; renamed `log_event_type` → `event_type`; moved duration/memory metrics into `aws.lambda.metrics` namespace (`duration_ms`, `billed_duration_ms`, `init_duration_ms`, `memory_size_mb`, `max_memory_used_mb`, `instance_max_memory`); added `aws.lambda.error.message` and `aws.lambda.error.stack_trace`; added 6 event source mapping metrics (`PolledEventCount`, `InvokedEventCount`, `FilteredOutEventCount`, `FailedInvokeEventCount`, `DeletedEventCount`, `OnFailureDestinationDeliveredEventCount`)
  - **S3 / S3 Storage Lens** — Added Storage Lens CloudWatch dimensions (`aws_account_number`, `aws_region`, `bucket_name`, `record_type`, `storage_class`); restructured `aws.s3_request` with nested `uploaded`, `downloaded`, `requests`, `errors`, and `latency` objects aligned with the Elastic AWS integration schema; added `aws.s3_storage_lens.metrics` block
  - **EMR** — Added `JobFlowId` dimension; corrected metric names (`TotalNodesRunning`, `MemoryTotalMB.sum`, `MemoryAvailableMB.sum`); added `ContainerPendingRatio`, `AppsKilled`, `S3BytesWritten.sum`; added `process.name`
  - **EC2** — Added `aws.ec2.instance.type`; added EBS metrics (`EBSReadBytes`, `EBSWriteBytes`, `EBSReadOps`, `EBSWriteOps`, `MetadataNoToken`); added host-level `host.cpu.usage`, `host.disk.read.bytes`, `host.disk.write.bytes`, `host.network.ingress.bytes`, `host.network.egress.bytes`
  - **DynamoDB** — Added 5 account-level CloudWatch metrics: `AccountMaxReads.max`, `AccountMaxWrites.max`, `AccountMaxTableLevelReads.max`, `AccountMaxTableLevelWrites.max`, `AccountProvisionedReadCapacityUtilization.avg`; fixed `SuccessfulRequestLatency.p99` → `.max`
  - **GuardDuty** — Added `service.evidence.threat_intelligence_details.threat.names`; added ECS `rule.category`, `rule.ruleset`, `rule.name`
  - **Security Hub** — Added ECS `rule.id`, `rule.name`; added `severity.normalized`
  - **Inspector** — Added `status`, `type`, `package_vulnerability_details.cvss`; added resource details (`resources[].details.aws.ec2_instance.*`, `ecr_container_image.*`); added `vulnerability.title`
  - **Kinesis Streams** — Added `GetRecords_Records.avg` and `PutRecords_Latency.avg` metric variants

- **New EMR and Athena dashboards** — Two new pre-built Kibana dashboards added to the custom dashboards installer. **AWS EMR — Clusters & Job Performance** (15 panels: KPI row, job outcomes donut, jobs-by-application donut, jobs-by-run-state donut, job runs over time, HDFS utilisation, YARN memory, JVM heap, executor count, GC time, completed/failed task stacked bar, and recent job runs table). **AWS Athena — Query Performance & Cost** (15 panels: KPI row including total data scanned in GB, query outcomes donut, queries by workgroup/database donuts, query volume over time, engine execution/queue/planning time lines, data scanned by workgroup bar, top error codes bar, engine version donut, and recent queries table).

- **Kibana 10.x pie chart fix** — Rewrote `buildPartitionLens` in `installer/custom-dashboards/generate-ndjson.mjs` to emit the correct Kibana 10.x `lnsPie` format: `adHocDataViews` in state, SHA-256 of the index pattern title as the `indexId`, `metrics: []` array (replacing the 8.x `metric: string`), `shape: "pie"` (not `"donut"`), `indexPatternRefs` at the `textBased` top-level, rich column metadata (`label`, `customLabel`, `esType`, `sourceParams`, `inMetricDimension`), and `typeMigrationVersion: "10.3.0"`. All pie/donut panels in the custom dashboards were previously broken in Kibana 10.x deployments.

- **Clear saved config fix** — `clearSavedConfig()` in `App.jsx` now resets all React state to defaults (`logsPerService` → 500, `errorRate` → 0.05, `batchSize` → 250, `logsIndexPrefix` → `"logs-aws"`, `metricsIndexPrefix` → `"metrics-aws"`, `eventType` → `"logs"`, `ingestionSource` → `"default"`, `batchDelayMs` → 20) in addition to removing the `localStorage` key. Previously the function only called `localStorage.removeItem()` but the React `useEffect` immediately re-wrote all unchanged state back to storage, making the button appear non-functional.

- **Updated Elastic logo** — Header updated to use the official Elastic horizontal reverse SVG (`public/elastic-logo.svg`: white wordmark + full-colour hexagonal mark), replacing the inline `<ElasticMark>` SVG component + plain-text `<span>`. The reverse variant is designed for dark backgrounds and matches the `#1D1E24` Kibana-style header.

---

## What's New in v8.1

- **Custom dashboards installer** — New `installer/custom-dashboards/` directory with pre-built Kibana dashboards for AWS Glue (7 panels) and SageMaker (6 panels). `npm run setup:dashboards` uses the Kibana 9.4+ Dashboards API; `npm run setup:dashboards:legacy` uses the Saved Objects import API for Kibana 8.11+. Pre-generated `.ndjson` files in `installer/custom-dashboards/ndjson/` support manual import via Stack Management → Saved Objects. New `npm run generate:dashboards:ndjson` script regenerates the ndjson files from source JSON definitions.
- **Pipeline quality improvements** — Lambda ingest pipeline: consolidated 3 separate grok processors into a single multi-pattern grok (Elasticsearch stops at first match, reducing per-document work). EC2 and Greengrass pipelines: replaced no-op `set: data_stream.dataset` processors (that field is managed by Elasticsearch data streams) with proper `json` message parsing, consistent with all other services. Added `lowercase` processor after `log.level` extraction in Glue, EMR, SageMaker, and RDS pipelines — AWS emits uppercase log levels ("INFO", "ERROR") but ECS expects lowercase for correct Kibana filtering.
- **Dynamic service count in UI** — Header counter (`X / N services`) and the **All N** quick-select button now dynamically reflect the active mode: **136** in Logs mode, **75** in Metrics mode. Previously both always showed the Logs count regardless of which mode was active.
- **UI icon fixes** — QLDB (`⊛` → `◈`) and Lookout for Metrics (`⌚` → `◎`) service tiles had characters that rendered as empty boxes. Replaced with Unicode symbols confirmed to render correctly across the font stack.

---

## What's New in v8.0

- **Metrics mode expanded to 75 services** — Added 29 more services: Route 53, Auto Scaling, ElasticBeanstalk, Amazon MQ, AppSync, Cognito, KMS, EFS, FSx, Backup, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, Kinesis Analytics, CodePipeline, CodeDeploy, Amplify, QuickSight, IoT Core, Shield, Global Accelerator, Direct Connect, VPC Flow, WorkSpaces, Connect, GameLift, Transfer Family, SES, and X-Ray. All newly added services have `aws.<service>.metrics` blocks with CloudWatch-aligned numeric fields.
- **Onboarding installers** — Two zero-dependency Node.js scripts (`npm run setup:integration`, `npm run setup:pipelines`) to prepare Elastic before shipping data. `elastic-integration` uses the Kibana Fleet API; `custom-pipelines` uses the Elasticsearch Ingest API. Both are idempotent. See `installer/README.md`.
- **106 custom ingest pipelines** — `installer/custom-pipelines` now covers all ~85 non-officially-integrated AWS services across 13 groups: analytics (8), ml (13), serverless (5), compute (7), databases (9), storage (5), security (8), networking (4), streaming (4), iot (6), management (17), devtools (6), enduser (14). Services with structured JSON logging (Glue, EMR, SageMaker, Lambda, CloudFormation, SSM, etc.) have targeted `json + rename` processors; all others get a graceful `json` processor with `ignore_failure: true`.
- **ECS Phase 1–3 complete across all 135 generators** — `aws.dimensions` keys always present (value or `null`) — no conditional spreads that omit keys. All generators with a failure outcome set `error: { code, message, type }` with real AWS API error codes. `event.duration` (nanoseconds) on every service where a meaningful request/job/operation duration exists.
- **Performance metrics blocks** — SNS, Athena, SageMaker, Fargate, AutoScaling, ImageBuilder, Amazon MQ, AppSync, and Bedrock all have `aws.<service>.metrics` blocks with CloudWatch-aligned fields for Elastic visualisations and ML anomaly detection jobs.
- **Cognito CloudWatch metrics** — `aws.cognito.metrics` emits `SignInSuccesses`, `SignInAttempts`, `TokenRefreshSuccesses`, `SignUpSuccesses`, `FederationSuccesses`, `CallCount`, `ThrottleCount`, `AccountTakeoverRisk`, `CompromisedCredentialsRisk`. `event.category` corrected to ECS array `["authentication"]`; `aws.dimensions` added (`UserPool`, `UserPoolClient`).
- **SageMaker field naming** — CloudWatch endpoint/invocation metrics renamed from `aws.sagemaker.cloudwatch_metrics` to `aws.sagemaker.cloudwatch` to clearly distinguish from the training `aws.sagemaker.metrics` block.

---

## What's New in v7.6

- **Full AWS CloudWatch fidelity across all 135 generators** — Every generator now uses real AWS CloudWatch metric names, dimensions, and stat types (`sum` for counters, `avg` for gauges). Previously, many services used invented or misnamed metric fields; all are now aligned with the official AWS CloudWatch namespace documentation.
- **`event.category` on all generators** — Every generator now emits `event.category` as a proper ECS array (e.g. `["web","network"]`, `["database"]`, `["process","container"]`, `["intrusion_detection","network"]`). This is required for Elastic Security categorisation, SIEM rules, and dashboard filtering.
- **Metrics blocks added to 30+ previously uncovered services** — Services that had no CloudWatch metrics block now have complete, realistic metric sets including: all 6 IoT services, EFS, FSx, StorageGateway, DataSync, NLB (20 metrics), CloudFront (14 metrics), Route53 (7 metrics), NetworkFirewall, TransitGateway, NatGateway, SSM, DMS (17 metrics), CloudFormation, SES (9 metrics), GameLift (13 metrics), Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, EventBridge, and more.
- **Realistic error codes matched to AWS API exceptions** — All generators now draw from real AWS API error code lists (e.g. `ProvisionedThroughputExceededException` for Kinesis, `ConditionalCheckFailedException` for DynamoDB, `DBInstanceNotFound` for RDS, `ClusterNotFoundException` for ECS). Previously most services used generic or invented codes.
- **Authentic log message formats** — Messages now match what AWS actually writes to CloudWatch Logs: RDS emits MySQL slow-query format (`Query_time: X Lock_time: Y Rows_sent: Z`) and PostgreSQL format (`LOG: duration: X ms statement:`, `FATAL: role does not exist`); VPC Flow Logs emit the exact v2 space-separated format; Route53 emits real resolver query log format; EC2 emits `cloud-init`, `systemd`, and `kernel:` patterns; CloudTrail maps event names realistically per service.
- **Geo data on network and web services** — ALB, CloudFront, WAF/WAFv2, API Gateway, Route53, CloudTrail, and GuardDuty now emit `client.geo` / `source.geo` with `country_iso_code`, `country_name`, and `city_name`. WAF and GuardDuty use threat-actor-realistic country distributions.
- **Real GuardDuty finding types** — Uses actual GuardDuty finding type taxonomy (`ThreatPurpose:ResourceType/ThreatFamilyName.DetectionMechanism!Artifact`), e.g. `UnauthorizedAccess:EC2/SSHBruteForce`, `CryptoCurrency:EC2/BitcoinTool.B!DNS`, `Exfiltration:S3/MaliciousIPCaller`.
- **Security Hub, Macie, Inspector fidelity** — Security Hub uses real standards (`CIS AWS Foundations Benchmark v1.4.0`, `AWS Foundational Security Best Practices v1.0.0`, `PCI DSS v3.2.1`) and real control IDs (`CIS.1.1`, `IAM.1`, `S3.2`). Macie uses real managed data identifier names (`AWS_CREDENTIALS`, `CREDIT_CARD_NUMBER`, `SSN_US`). Inspector emits real CVE IDs with `vulnerability.id`, `vulnerability.severity`, and `vulnerability.score.base` ECS fields.
- **Container and process ECS fields** — ECS, EKS, Fargate, and Batch now emit full `container` objects (`id`, `image.name`, `image.tag`, `runtime`) and `process` objects (`pid`, `name`, `exit_code`). EKS messages use kubelet log format when unstructured.
- **Expanded EC2 host and metrics** — EC2 now includes `host.architecture`, `host.cpu.count`, `host.os.kernel`, `host.os.version` and a full 22-metric CloudWatch block including all EBS, network packet, CPU credit, and status check metrics.
- **Aurora, Neptune, DocumentDB metrics** — Aurora emits Aurora-specific CloudWatch metrics (`AuroraBinlogReplicaLag`, `ServerlessDatabaseCapacity`, `ACUUtilization`, backtrack metrics). Neptune and DocumentDB have appropriate metrics and real error codes.
- **Lambda X-Ray trace in REPORT** — 20% of Lambda REPORT log events now include a real-format X-Ray trace line: `XRay TraceId: 1-... SegmentId: ... Sampled: true`.

---

## What's New in v7.5

- **Lambda START / END / REPORT log events** — The Lambda generator now randomly emits one of four authentic log event types per document: `START RequestId:`, `END RequestId:`, `REPORT RequestId: Duration: X ms Billed Duration: Y ms Memory Size: Z MB Max Memory Used: W MB` (with optional cold-start `Init Duration`), or a structured application log. Matches real CloudWatch Lambda log streams. The `aws.lambda.log_event_type` field indicates which type was produced.
- **RDS Enhanced Monitoring OS metrics** — When `enhanced_monitoring: true` (≈55% of RDS docs), the generator now emits a full `aws.rds.os_metrics` block — `cpuUtilization` (user/system/wait/idle/irq/total), `memory` (total/free/cached/active/inactive/buffers), `disk` (readIOsPS/writeIOsPS/readKbPS/writeKbPS/avgQueueLen/await), `network` (rx/tx), `numVCPUs`, and `uptime` — matching the RDSOSMetrics format published to CloudWatch Logs.
- **`event.duration` on all 135 generators** — Every time-bound generator now emits `event.duration` (nanoseconds) in the ECS `event` object. Previously missing on all IoT, most management, most end-user, and several storage generators. Enables latency dashboards and ML anomaly detection across all services.
- **`ship()` refactored** — The inner per-service shipping loop is now a named `shipService()` helper function. Progress updates are emitted after each batch within a service (showing live incremental counts rather than only updating between services).
- **`makeSetup()` helper** — `src/helpers/index.js` exports `makeSetup(er)` returning `{ region, acct, isErr }` to DRY up the boilerplate common to every generator. Applied to IoT generators; available for future generator additions.
- **Dev-mode localStorage warnings** — `localStorage` read/write failures now emit `console.warn` in development mode (suppressed in production), making private-browsing and quota issues visible during development.
- **Expanded test coverage** — Added three new test suites:
  - `src/generators/generators.test.js` — Shape-validation tests for all 14 generator modules (IoT, management, end-user, storage, databases, serverless, compute, networking, security, streaming, devtools, analytics, ML), plus Lambda log-event-type assertions, RDS Enhanced Monitoring shape, and error-rate consistency tests.
  - `src/utils/ship.test.js` — Ship workflow integration tests with mocked `fetch`: NDJSON batch assembly, full-success / partial-error / server-error / network-error response handling, index name construction, and `stripNulls` correctness.
  - `src/utils/proxy.test.js` — Proxy retry logic unit tests: exponential backoff values, retryable status codes (5xx only), retryable error codes (ECONNRESET/ETIMEDOUT/ECONNREFUSED), and MAX_RETRIES exhaustion.

---

## What's New in v7.4

- **Log and message-pool enhancements** — Lifecycle and message-pool improvements for easier search and correlation:
  - **SageMaker** — Job-type-specific lifecycle messages: "Training job started/succeeded/failed", "Processing job started/succeeded/failed", "Endpoint creation started/succeeded/failed", "Pipeline execution started/succeeded/failed", and equivalent for Transform and HyperparameterTuning.
  - **CodeBuild** — "Build started", "Build succeeded", "Build failed" and phase-level messages (e.g. "Phase BUILD completed in 120s") added and weighted so lifecycle and phase messages appear more often.
  - **Athena** — "Query started", "Query succeeded", "Query failed" emphasized in the message pool for clearer query-lifecycle visibility.
- **High-impact coverage** — EMR, Batch, DataBrew, and AppFlow already provide run_state (where applicable), "Job run started/succeeded/failed" / "Flow run started/succeeded/failed" message pools, and `aws.<service>.metrics` (including elapsedTime/Duration, records_processed, etc.). No code changes in v7.4; documented in the improvement suggestions checklist.

---

## What's New in v7.3

- **Input validation** — Elasticsearch URL, API key, and index prefix are validated on blur and before Ship. Invalid fields show inline errors and disable the Ship button until fixed. URL must be HTTPS with a proper hostname; API key has minimum length and character rules; index prefix allows only letters, numbers, hyphens, and underscores.
- **React error boundary** — The app is wrapped in an error boundary that catches rendering errors and shows a fallback UI with a "Try again" action instead of a blank screen.
- **Proxy timeout and retries** — The Node.js bulk proxy (`proxy.js`) uses a configurable request timeout (default 120s via `PROXY_REQUEST_TIMEOUT_MS`) and retries with exponential backoff (up to 3 retries) on 5xx, timeouts, and connection errors.
- **Configurable batch delay** — A **Batch delay (ms)** slider (0–2000 ms) in Volume & Settings controls the pause between bulk requests. Persisted with saved config. Reduces load on Elastic when shipping large volumes.
- **Unit tests (Vitest)** — Smoke tests with Vitest and jsdom: helpers (`stripNulls`, `rand`, `randInt`, etc.), validation (URL, API key, index prefix), and generator shape (Lambda, API Gateway). Run with `npm run test`; watch mode with `npm run test:watch`.
- **CSS modules** — Main layout and shared controls (root, header, main, inputs, buttons, log box, preview) use `App.module.css` instead of inline styles. Dynamic values (e.g. group colors) remain inline where needed.
- **JSDoc on generators** — Generator modules and key functions (e.g. `serverless.js`, `storage.js`, `generators/index.js`) include JSDoc (`@module`, `@param`, `@returns`) for better editor support and documentation.

---

## What's New in v7.2

- **NAT Gateway** — Added `natgateway` service to the Networking & CDN group. Generates realistic NAT Gateway connection and traffic metrics (bytes, packets, connections, port allocation errors) mapped to `aws.natgateway`. Available in both Logs and Metrics mode.
- **Cost estimation** — A doc count estimate now appears below the Ship button when services are selected: `~{N} documents across {X} services ({B} batches)`. Helps confirm volume before shipping.
- **Save / restore config** — Connection settings, volume sliders, and ingestion preferences are now persisted to `localStorage` and restored on next visit. A **Clear saved config** button resets to defaults.
- **Module split** — The codebase has been refactored from a monolithic `App.jsx` (~5000 lines) into focused ES modules: `src/helpers/`, `src/theme/`, `src/data/`, `src/generators/` (14 category files), and `src/components/`. `App.jsx` now contains only React state, logic, and JSX.

---

## What's New in v7.1

- **Kibana-inspired UI** — The web UI has been redesigned to follow the **Kibana / Elastic UI (EUI)** design language: dark top bar (`#1D1E24`), light content background (`#F6F9FC`), EUI primary blue (`#0B64DD`) for actions and focus, and semantic colors for success, warning, and danger. Cards, form controls, buttons, and status pills now use EUI-aligned tokens for a consistent look when used alongside Kibana and Elastic Cloud.
- **Design tokens** — A central `K` token set in the app aligns with EUI colors (backgrounds, borders, text, success/warning/danger) and spacing so future UI changes stay consistent with Elastic's design system.
- **Simplified layout** — Single dark header with logo and status; compact page title and description; main content in a constrained width with clear card hierarchy. Ship button label correctly reflects **Logs** vs **Metrics** mode.

---

## What's New in v7

- **Performance & anomaly-detection metrics** — Added or expanded `event.duration` and `aws.<service>.metrics` across services for Elastic visualizations and ML anomaly detection. New or expanded metrics for: SNS, Athena, SageMaker (CloudWatch-style), Fargate, AutoScaling, ImageBuilder, Amazon MQ, AppSync, Bedrock, and Bedrock Agent.
- **Glue: skewness & observability** — Glue generator emits `aws.glue.metrics.driver.skewness.stage` and `skewness.job`, plus JVM heap and disk metrics aligned with AWS Glue Observability.
- **Performance metrics plan** — covered by [ENHANCEMENT-CANDIDATES.md](ENHANCEMENT-CANDIDATES.md) (performance metrics fields for dashboards and ML).

---

## What's New in v6

- **Logs / Metrics toggle** — Generate either log documents or metrics documents. In Metrics mode, only the 46 services with Elastic AWS metrics support are selectable; index prefix defaults to `metrics-aws`.
- **Official AWS service icons** — Service tiles use official AWS Architecture Icons stored locally (`public/aws-icons/`), copied from the `aws-icons` package at install time (no CDN).
- **Sample data directory** — `samples/logs/` and `samples/metrics/` contain one sample document per service. Regenerate with `npm run samples`.
- **Bedrock Agent & Billing** — Added Bedrock Agent and AWS Billing (logs and metrics) with Elastic integration alignment.
- **Structured / continuous logging** — Many services (Lambda, API Gateway, RDS, ECS, EC2, EKS, Glue, EMR, SageMaker, and others) can emit JSON in the `message` field and optional metrics blocks, matching real-world continuous logging.
- **Ingest pipeline plan** — [INGEST-PIPELINE-REFERENCE.md](INGEST-PIPELINE-REFERENCE.md) documents pipeline IDs, target fields, and index patterns for all services that emit parseable JSON messages.
- **Reduced null fields** — Generated documents have `null` values stripped so output stays clean.
- **Application rename** — Project and UI titled **AWS → Elastic Load Generator**.

---

## What's New in v5

- **Data stream dataset mapping** — Services with an Elastic AWS integration use the exact `data_stream.dataset` (and index suffix) from the [Elastic integrations repo](https://github.com/elastic/integrations/tree/main/packages/aws/data_stream), so generated logs populate the correct integration dashboards and rules.
- **Integration-backed services** — CloudTrail, VPC Flow, ALB/NLB, GuardDuty, S3 access, API Gateway, CloudFront, Lambda, Network Firewall, Security Hub, WAF, RDS, Route 53, EMR, EC2, ECS, Config, Inspector, DynamoDB, Redshift, EBS, Kinesis, MSK, SNS, SQS, Transit Gateway, VPN, AWS Health use the corresponding Elastic dataset where applicable.
- **Services without an Elastic integration** — All other services use `data_stream.dataset: aws.<service>` and ECS-style fields so they remain searchable in custom dashboards.
- **ECS baseline for every service** — Every document is enriched with standard ECS fields when missing; all services are searchable in ECS indices.

---

## What's New in v4

- **Realistic account names** — All documents use a consistent fictitious AWS organisation (`globex-production`, `globex-staging`, etc.) with realistic 12-digit account IDs.
- **Focused region pool** — Regions restricted to `eu-west-2` and `us-east-1`.
- **`event.dataset` and `event.provider`** on every document for correct routing to Elastic integration dashboards.
- **ECS enrichment for non-integrated services** — Common ECS field groups so all services are searchable in ECS indices.
- **`cloud.account.name`** on every document.

---

## What's New in v3

- **`cloud.account.id` + `cloud.account.name`** added to all generators.
- **CloudWatch dimension fields** (`aws.dimensions.*`) and **CloudWatch metric fields** (`aws.*.metrics.*`) with exact CloudWatch metric names.
- Lambda extended with full CloudWatch dimension set including `EventSourceMappingUUID` where applicable.

---

## What's New in v2

- Per-service ingestion defaults — every service defaults to its correct `input.type`.
- Default (per-service) mode and ingestion override controls.
- Service card badges showing effective ingestion source.
- Override warning banner and activity log enhancement.
