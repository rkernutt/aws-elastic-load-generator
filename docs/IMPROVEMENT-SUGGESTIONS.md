# Improvement suggestions

> **Last updated:** 2026-03-17 (v7.5)

This document suggests improvements across **coverage** (logs vs metrics), **content** (fields, messages, metrics blocks), and **general** product/UX. It references existing docs ([ENHANCEMENT-CANDIDATES.md](ENHANCEMENT-CANDIDATES.md), [AWS-SERVICES-DOCUMENTATION-REVIEW.md](AWS-SERVICES-DOCUMENTATION-REVIEW.md), [GLUE-METRICS-COVERAGE.md](GLUE-METRICS-COVERAGE.md)) and adds concrete next steps.

**As of v7.5,** `event.duration` is now present on all 136 generators, Lambda emits authentic START/END/REPORT log events, and RDS includes full Enhanced Monitoring OS metrics. See README “What’s New in v7.5”.

**As of v7.4,** the high-impact log/message-pool enhancements (SageMaker job-type lifecycle, CodeBuild phase-level messages, Athena query lifecycle) and the checklist items for EMR, Batch, DataBrew, AppFlow, and CodeBuild are implemented; see the [Summary checklist](#4-summary-checklist) and README “What’s New in v7.4”.

---

## 1. Logs vs metrics coverage

### Current state

- **Logs:** All **136** services in the app can generate **log** documents. Every service has a generator; documents are enriched with ECS fields and sent to `{prefix}.{dataset_suffix}` (e.g. `logs-aws.lambda`, `logs-aws.guardduty`).
- **Metrics:** **46** services are selectable in **Metrics** mode (`METRICS_SUPPORTED_SERVICE_IDS` in `src/data/elasticMaps.js`). These align with services that have **metrics data streams** in the Elastic AWS integration (or a clear CloudWatch metrics story). In metrics mode the same generator is used; the document is sent with `data_stream.type: "metrics"` and `metricset: { name: "cloudwatch", period: 300000 }` to indices like `metrics-aws.lambda`, `metrics-aws.elb`.

### Are all services covered where they can be?

- **Logs:** Yes. Every listed service has a log generator and can ship to Elastic.
- **Metrics:** Only 46 of 136 services support metrics mode. The rest are **intentionally** logs-only because:
  - The **Elastic AWS integration** does not define a metrics data stream for them (e.g. GuardDuty, Security Hub, CloudTrail are event/finding-based).
  - Or the service has no standard CloudWatch metrics namespace (e.g. many security/audit services).

### Suggestions: expanding metrics coverage

If you want **more services** to support Metrics mode (e.g. for dashboards or ML on CloudWatch-style metrics where the Elastic integration does not yet have a metrics stream), you can:

1. **Add to `METRICS_SUPPORTED_SERVICE_IDS`** and optionally **`ELASTIC_METRICS_DATASET_MAP`** in `src/data/elasticMaps.js` for services that have **CloudWatch metrics** in AWS but are not yet in the set. Good candidates (AWS has metrics; add only if you are okay using a generic `metrics-aws.{service}` dataset):
   - **Route 53** — HealthCheckStatus, ConnectionTime
   - **Elastic Beanstalk** — EnvironmentHealth, ApplicationRequests, ApplicationLatencyP99/P90
   - **Auto Scaling** — GroupDesiredCapacity, GroupInServiceInstances, etc.
   - **Amazon MQ** — QueueDepth, ProducerCount, ConsumerCount
   - **AppSync** — 4xxErrorRate, 5xxErrorRate, Latency, RequestCount
   - **Cognito** — User pool sign-in/token metrics
   - **KMS** — Key usage, grant count
   - **EFS** — DataReadIOBytes, DataWriteIOBytes, PermittedThroughput
   - **FSx** — DataReadBytes, DataWriteBytes
   - **Backup** — NumberOfBackupJobsCreated, NumberOfRestoreJobsCompleted
   - **Neptune** — CPUUtilization, DatabaseConnections
   - **Timestream** — Query/system metrics
   - **QLDB** — CommandDuration, JournalStorage
   - **Keyspaces** — ReadThrottledRequests, WriteThrottledRequests
   - **MemoryDB** — CPUUtilization, CurrConnections, CacheHits
   - **Kinesis Analytics** — records_in_per_second, kpu_utilization_pct, checkpoint_duration_ms
   - **CodePipeline** — PipelineExecutionAttempts, PipelineSuccessCount/FailureCount
   - **CodeDeploy** — Deployment duration
   - **Amplify** — Build success/failure
   - **QuickSight** — Dashboard load, SPICE
   - **IoT Core** — Connect, publish, subscribe metrics
   - **Shield** — DDoS-related metrics
   - **Global Accelerator** — NewFlowCount, ProcessedBytes
   - **Direct Connect** — ConnectionState, LightLevelTxRx
   - **Image Builder** — BuildDuration, ImageBuildSuccess/Failed

2. **Ensure each new metrics-capable service** has an **`aws.<service>.metrics`** block (or equivalent) in its generator so the emitted document is useful for dashboards and ML. Many of these already have metrics in the **log** document; metrics mode would then just change the target index/dataset and add `metricset`.

3. **Update the README** “only the 42 services” (or current count) to match the new total and optionally list which services support metrics.

---

## 2. Improving logs and metrics content

### 2.1 Lifecycle and message pools (high impact)

These changes make logs easier to search and correlate (e.g. “Job run started”, “Query succeeded”) and align with AWS/Glue-style patterns. See [ENHANCEMENT-CANDIDATES.md](ENHANCEMENT-CANDIDATES.md) for full detail.

| Priority | Service    | Suggested additions |
|----------|------------|----------------------|
| **High** | EMR        | `aws.emr.job.run_state` (RUNNING/SUCCEEDED/FAILED); message pool: “Job run started/succeeded/failed”; dynamic “Stage N (runJob) finished in X.XXX s”, “Shuffle read/write”; metrics: elapsedTime, numCompletedTasks, numFailedTasks, JVM heap, GC time, numberAllExecutors. |
| **High** | Batch      | Message pool: “Job run started”, “Job run succeeded”, “Job run failed”; metrics: `elapsedTime` or `Duration` in the metrics block. |
| **Medium** | CodeBuild | Message pool: “Build started”, “Build succeeded”, “Build failed”; optional phase-level messages. |
| **Medium** | Athena     | Message pool: “Query started”, “Query succeeded”, “Query failed”. |
| **Medium** | DataBrew   | `run_state`; message pool: “Job run started/succeeded/failed”; `aws.databrew.metrics` (rows_processed, duration, transform_steps, etc.). |
| **Medium** | AppFlow    | Message pool: “Flow run started/succeeded/failed”; `aws.appflow.metrics` (records_processed, duration_ms, etc.). |
| **Lower** | SageMaker  | Optional: “Training job started/succeeded/failed” in message pool. |
| **Lower** | Step Functions | Optional: “Execution started/succeeded/failed” in message pool. |
| **Lower** | Kinesis Analytics | Optional: “Application run started/failed” or “Checkpoint completed/failed” in messages. |
| **Lower** | CodePipeline / CodeDeploy | Optional: “Pipeline/Deployment started/succeeded/failed” in message pool. |

### 2.2 Metrics blocks and fields (per service)

- **Cognito** — Add `aws.cognito.metrics` (e.g. sign-in, token metrics) if the generator is currently minimal ([AWS-SERVICES-DOCUMENTATION-REVIEW.md](AWS-SERVICES-DOCUMENTATION-REVIEW.md)).
- **Lambda** — Confirm `event.duration` unit (microseconds vs milliseconds) vs AWS docs; consider DestinationDeliveryFailures, AsyncEventsReceived/AsyncEventAge/AsyncEventsDropped, provisioned concurrency metrics.
- **S3** — Optional `event.duration` for request-style logs.
- **DynamoDB** — Optional: ReadThrottleEvents, WriteThrottleEvents, TimeToLiveDeletedItemCount in metrics.
- **API Gateway** — Align metric names with CloudWatch (e.g. Count, 4XXError, 5XXError).

### 2.3 ECS and error consistency

- Ensure every generator that can fail sets **`error: { code, message, type: "service" }`** when `event.outcome === "failure"` with 2–5 service-specific codes (see [PLAN-ALL-SERVICES.md](PLAN-ALL-SERVICES.md)).
- Ensure **`event.duration`** (nanoseconds) is set for every log that represents a request, job, or operation with a meaningful duration.
- Ensure **`aws.dimensions`** keys are always present (value or `null`) for generators that have dimensions.

### 2.4 JSON in `message` and ingest pipelines

- Services that support **continuous or structured logging** (Lambda, Glue, SageMaker, API Gateway, RDS, ECS, EMR, etc.) already (or can) emit JSON in `message`. The repo’s **ingest pipelines** (e.g. `glue-parse-json-message`, `sagemaker-parse-json-message`) parse that into `*.parsed`. Extend message content and pipeline coverage as needed for other services that emit structured logs in production.

---

## 3. General improvements

### 3.1 Documentation and discoverability

- **README:** Keep “What’s New” and index naming (`{prefix}.{dataset_suffix}`) up to date; ensure the **metrics service count** (e.g. “46 services” or “42”) matches `METRICS_SUPPORTED_SERVICE_IDS`.
- **Index naming:** Document that the app writes to **`{prefix}.{suffix}`** with a **dot** (e.g. `logs-aws.lambda`), not a hyphen. Already corrected in README and UI hint.
- **aws-elastic-setup:** Keep the setup guide and ingest-pipeline README in sync with the main app (datasets, index patterns).

### 3.2 UX and validation

- **Connection validation:** If the app already runs URL/API key/prefix validation before Ship, surface clear errors (e.g. “Invalid index prefix: only lowercase letters, numbers, hyphens allowed”).
- **Batch size / rate:** Optionally document or enforce a safe bulk size (e.g. 500–1000) to avoid timeouts or backpressure on the cluster.
- **Sample data:** Keep `npm run samples` and the **samples/** directory updated after generator or dataset changes so examples match what the app ships.

### 3.3 Operational and testing

- **Proxy:** The app uses `/proxy/_bulk` for shipping. Ensure the proxy (or backend) correctly forwards to the user’s Elasticsearch URL and handles auth (e.g. API key) and errors (e.g. 429, 403) with clear feedback in the activity log.
- **Idempotency:** If you ever need replay or retry, consider documenting whether documents use stable IDs (e.g. `_id`) or are append-only; currently they appear to be create-without-id.

### 3.4 Alignment with Elastic and AWS

- **Elastic AWS integration:** When the [Elastic integrations](https://github.com/elastic/integrations/tree/main/packages/aws) add new data streams or metrics streams, add the corresponding service to `ELASTIC_DATASET_MAP` / `ELASTIC_METRICS_DATASET_MAP` and `METRICS_SUPPORTED_SERVICE_IDS` so the generator stays aligned.
- **New AWS services:** When AWS launches new services with CloudWatch or logging, consider adding a generator and, if the Elastic integration supports it, dataset and metrics support.

---

## 4. Summary checklist

| Area | Action | Status |
|------|--------|--------|
| **Metrics coverage** | Optionally add 20+ more services to `METRICS_SUPPORTED_SERVICE_IDS` (and `ELASTIC_METRICS_DATASET_MAP` where different from logs) for Route 53, Beanstalk, Auto Scaling, Amazon MQ, AppSync, Cognito, KMS, EFS, FSx, Backup, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, Kinesis Analytics, CodePipeline, CodeDeploy, Amplify, QuickSight, IoT Core, Shield, Global Accelerator, Direct Connect, Image Builder. Ensure each has an `aws.<service>.metrics` block. | Optional |
| **Log content (high impact)** | EMR: run_state, message pool (“Job run started/succeeded/failed”), dynamic Stage/Shuffle, metrics (elapsedTime, numCompletedTasks, JVM heap, GC, numberAllExecutors). Batch: message pool + elapsedTime/Duration in metrics. | **Done** (generators already had these) |
| **Log content (medium)** | DataBrew, AppFlow: run_state (DataBrew), message pools, `aws.databrew.metrics` / `aws.appflow.metrics`. CodeBuild: “Build started/succeeded/failed” + phase-level messages. Athena: “Query started/succeeded/failed”. | **Done** (DataBrew/AppFlow/Athena had them; CodeBuild + Athena message pools enhanced) |
| **SageMaker** | “Training job started/succeeded/failed” and job-type lifecycle messages (Processing, Endpoint, Pipeline, etc.) in message pool. | **Done** |
| **Metrics content** | Add or expand `aws.<service>.metrics` for Cognito; verify Lambda duration unit and optional Lambda/API Gateway/DynamoDB/S3 metric fields. | Optional |
| **ECS/error** | Ensure error on failure and event.duration and full dimensions per [PLAN-ALL-SERVICES.md](PLAN-ALL-SERVICES.md) where not already done. | Ongoing |
| **Docs** | Keep README and aws-elastic-setup in sync; document index naming (dot); keep metrics count and sample output current. | Ongoing |

For detailed per-service gaps and AWS doc links, use [AWS-SERVICES-DOCUMENTATION-REVIEW.md](AWS-SERVICES-DOCUMENTATION-REVIEW.md) and [ENHANCEMENT-CANDIDATES.md](ENHANCEMENT-CANDIDATES.md).
