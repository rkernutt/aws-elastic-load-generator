# Services to Review for Further Enhancements

> **Last updated:** 2026-03-17 (v8.0)

This document lists services that could benefit from **Glue-style enhancements**: explicit job/run lifecycle signals in logs, richer observability metrics (CloudWatch/Spark-style), and framework-specific log message patterns.

**Implemented in v8.0:** Metrics mode expanded to 75 services (from 46). Cognito metrics block (SignInSuccesses, ThrottleCount, AccountTakeoverRisk, etc.). SageMaker CloudWatch endpoint metrics renamed `cloudwatch_metrics` → `cloudwatch`. Performance metrics blocks added to SNS, Athena, Fargate, Auto Scaling, Image Builder, Amazon MQ, AppSync, Bedrock. `aws.dimensions` always-present on all generators.

**Implemented in v7.6:** Full CloudWatch metric name and dimension alignment across all 135 generators. `event.category` as ECS array on all generators. Metrics blocks added to 30+ previously uncovered services (IoT, NLB, CloudFront, NetworkFirewall, SSM, DMS, SES, GameLift, Rekognition, Textract, and more). Real AWS API error codes on all generators.

**Implemented in v7.5:** `event.duration` added to all IoT, management, end-user, and storage generators. Lambda START/END/REPORT log events. RDS Enhanced Monitoring OS metrics (`cpuUtilization`, `memory`, `disk`, `network`).

**Implemented in v7.4:** EMR (run_state, message pool, metrics), Batch (message pool, elapsedTime/Duration), DataBrew (run_state, message pool, metrics), AppFlow (message pool, metrics), CodeBuild (Build started/succeeded/failed + phase-level messages), Athena (Query started/succeeded/failed), SageMaker (job-type lifecycle messages: Training/Processing/Endpoint/Pipeline/Transform/HyperparameterTuning).

---

## Summary

| Status         | Service       | Notes                                                                    |
| -------------- | ------------- | ------------------------------------------------------------------------ |
| ✅ Done (v7.4) | EMR           | run_state, message pool, metrics block                                   |
| ✅ Done (v7.4) | Batch         | message pool lifecycle signals, elapsedTime in metrics                   |
| ✅ Done (v7.4) | CodeBuild     | “Build started/succeeded/failed” message pool, phase-level messages      |
| ✅ Done (v7.4) | SageMaker     | job-type lifecycle messages (Training/Processing/Endpoint/Pipeline/etc.) |
| ✅ Done (v7.4) | Athena        | “Query started/succeeded/failed” message pool, metrics block             |
| ✅ Done (v7.4) | DataBrew      | run_state, message pool, metrics block                                   |
| ✅ Done (v7.4) | AppFlow       | message pool, metrics block                                              |
| ✅ Done (v8.0) | SNS           | Performance metrics block                                                |
| ✅ Done (v8.0) | Fargate       | Performance metrics block                                                |
| ✅ Done (v8.0) | Auto Scaling  | Performance metrics block                                                |
| ✅ Done (v8.0) | Amazon MQ     | Performance metrics block                                                |
| ✅ Done (v8.0) | AppSync       | Performance metrics block                                                |
| ✅ Done (v8.0) | Bedrock       | Performance metrics block                                                |
| ✅ Done (v8.0) | Image Builder | Performance metrics block                                                |
| ✅ Done (v8.0) | Cognito       | Full metrics block (SignInSuccesses, ThrottleCount, etc.), dimensions    |

**Remaining optional enhancements** (lower priority, not blocking any feature):

| Service                   | Possible addition                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Step Functions            | “Execution started/succeeded/failed” in message pool                                                                         |
| Kinesis Analytics         | “Application started/checkpoint/failed” in message pool                                                                      |
| CodePipeline / CodeDeploy | “Pipeline/Deployment started/succeeded/failed” in message pool                                                               |
| CloudTrail                | Full record shape (eventVersion, userIdentity, requestParameters, responseElements) for tighter dashboard/rule compatibility |
| More services             | Additional `aws.<service>.metrics` blocks for any service not yet covered                                                    |

---

## 1. EMR (highest impact)

**Why:** Same Spark/YARN ecosystem as Glue ETL; observability needs are similar.

**Currently has:**

- Spark-style log messages: “Stage 0 (Map) completed in 12.4s”, “Shuffle read/write”, “GC overhead limit”, etc.
- Basic metrics: `executor_count`, `running_step_count`, `failed_step_count`, `hdfs_utilization_pct`, `yarn_memory_used_mb`
- `event.duration`, `error` on failure

**Missing (Glue-style):**

- **Run lifecycle:** No explicit `run_state` (RUNNING/SUCCEEDED/FAILED); no “Job run started” / “Job run succeeded” / “Job run failed” in message pool.
- **Metrics:** No `elapsedTime`, no driver/executor JVM heap usage, no `numCompletedTasks` / `numFailedTasks`, no GC time, no executor allocation (e.g. numberAllMaxNeeded-style).
- **Log variety:** Stage messages are fixed strings; could add dynamic “Stage N (runJob) finished in X.XXX s” and shuffle read/write like Glue.

**Suggested additions:**

- `aws.emr.job.run_state` (RUNNING | SUCCEEDED | FAILED | WAITING).
- Message pool: “Job run started”, “Job run succeeded”, “Job run failed”; for Spark apps: dynamic “Stage N (runJob) finished in X.XXX s”, “Shuffle read: X GB, Shuffle write: Y GB”.
- Metrics: `elapsedTime`, driver/executor (or aggregate) `numCompletedTasks`, `numFailedTasks`, `jvm.heap.usage` or equivalent, `gc_time_ms`, optional executor allocation metric.

---

## 2. Batch

**Why:** Job-based; dashboards and ML often key off job run lifecycle and duration.

**Currently has:**

- `job.status` (SUCCEEDED/FAILED), `event.duration`, explicit `error` on failure.
- Metrics: PendingJobCount, RunnableJobCount, RunningJobCount, SucceededJobCount, FailedJobCount.

**Missing:**

- **Message pool:** No explicit “Job run started”, “Job run succeeded”, “Job run failed” (only generic “Job submitted”, “Job completed successfully”, etc.).
- **Metrics:** No `elapsedTime` (or equivalent) in the metrics block for correlation with CloudWatch.

**Suggested additions:**

- Message pool: “Job run started”, “Job run succeeded”, “Job run failed” (and keep existing messages).
- Metrics: `elapsedTime` or `Duration` (seconds) aligned with `event.duration`.

---

## 3. CodeBuild

**Why:** Build lifecycle is central to CI/CD observability.

**Currently has:**

- `build_status`, `current_phase`, `duration_seconds`, `event.duration`, metrics (Builds, SucceededBuilds, FailedBuilds, Duration, etc.), explicit `error` on failure.

**Missing:**

- **Message pool:** No explicit “Build started”, “Build succeeded”, “Build failed” (only one dynamic message per outcome).

**Suggested additions:**

- Message pool: “Build started”, “Build succeeded”, “Build failed” plus phase-level messages (e.g. “Phase BUILD completed in 120s”) for variety.

---

## 4. SageMaker

**Already strong:** `event.action` (TrainingJobStarted, etc.), Studio fields, `cloudwatch_metrics` (Invocations, ModelLatency, GPUUtilization, etc.), `event.duration`, `error` on failure.

**Optional:** Add “Training job started/succeeded/failed” (and similar for Processing/Endpoint) to the message pool for consistency with Glue/Batch.

---

## 5. Athena

**Currently has:** state (FAILED/SUCCEEDED), `event.duration`, rich metrics (DataScannedInBytes, EngineExecutionTimeInMillis, etc.), explicit `error` on failure.

**Missing:** Explicit “Query started”, “Query succeeded”, “Query failed” in the message pool.

**Suggested additions:** Message pool: “Query started”, “Query succeeded”, “Query failed”.

---

## 6. DataBrew

**Currently has:** `job_status` (FAILED/SUCCEEDED), `duration_seconds`, `event.duration`, `error` on failure. No `aws.databrew.metrics` block.

**Missing:**

- **Run lifecycle:** No `run_state`; no “Job run started/succeeded/failed” in messages.
- **Metrics:** No metrics block for dashboards/ML (e.g. rows_processed, duration, transform_steps).

**Suggested additions:**

- `aws.databrew.job.run_state` (or keep job_status and add run_state alias if desired).
- Message pool: “Job run started”, “Job run succeeded”, “Job run failed”.
- `aws.databrew.metrics`: e.g. RowsProcessed, DurationSeconds, TransformSteps, JobSuccessCount, JobFailureCount.

---

## 7. AppFlow

**Currently has:** `execution_status` (ExecutionFailed/ExecutionSuccessful), `duration_ms`, `event.duration`, `error` on failure. No metrics block.

**Missing:**

- Message pool: “Flow run started”, “Flow run succeeded”, “Flow run failed”.
- `aws.appflow.metrics`: e.g. RecordsProcessed, DurationMs, ExecutionSuccessCount, ExecutionFailureCount.

---

## 8. Step Functions, CodePipeline, CodeDeploy, Kinesis Analytics

- **Step Functions:** Already has ExecutionsStarted/Succeeded/Failed/Aborted/TimedOut and ExecutionTime. Optional: add “Execution started/succeeded/failed” to message pool.
- **CodePipeline / CodeDeploy:** Already have stage/state and duration. Optional: “Pipeline/Deployment started/succeeded/failed” in message pool.
- **Kinesis Analytics:** Good metrics and event.duration. Optional: “Application run started/failed” or “Checkpoint completed/failed” in message pool.

---

## Implementation order (suggested)

1. **EMR** — Align with Glue: run_state, richer metrics (elapsedTime, tasks, JVM/GC), and Spark-style message variety.
2. **Batch** — Job run message signals + elapsedTime in metrics.
3. **DataBrew** — run_state, message signals, metrics block.
4. **AppFlow** — Message signals + metrics block.
5. **CodeBuild** — Build started/succeeded/failed + optional phase messages.
6. **Athena** — Query started/succeeded/failed in message pool.
7. **SageMaker / Step Functions / CodePipeline / Kinesis Analytics** — Optional message pool additions only.

---

## Reference: what Glue has (after enhancements)

- **Signals:** `run_state` (RUNNING/SUCCEEDED/FAILED/STOPPED); messages: “Job run started”, “Job run succeeded”, “Job run failed”.
- **Metrics:** `driver.aggregate.elapsedTime`, `numCompletedTasks`, `numFailedTasks`, `gc_time_ms`; `ExecutorAllocationManager.executors.numberAllMaxNeeded`; `jvm.heap.usage` (driver + ALL); `BlockManager.disk.diskSpaceUsed_MB`.
- **Spark-style logs (glueetl):** “Stage N (runJob) finished in X.XXX s”, “Shuffle read: X GB, Shuffle write: Y GB”, GC/shuffle spill warnings.

Use this as the bar when adding similar behavior to EMR, Batch, DataBrew, and AppFlow.
