# Services to Review for Further Enhancements

> **Last updated:** 2026-03-17 (v7.5)

This document lists services that could benefit from **Glue-style enhancements**: explicit job/run lifecycle signals in logs, richer observability metrics (CloudWatch/Spark-style), and framework-specific log message patterns. Use it to prioritize which generators to extend next.

**Implemented in v7.5:** `event.duration` added to all IoT, management, end-user, and storage generators. Lambda START/END/REPORT log events. RDS Enhanced Monitoring OS metrics (`cpuUtilization`, `memory`, `disk`, `network`). See README “What’s New in v7.5”.

**Implemented in v7.4:** EMR (run_state, message pool, metrics), Batch (message pool, elapsedTime/Duration), DataBrew (run_state, message pool, metrics), AppFlow (message pool, metrics), CodeBuild (Build started/succeeded/failed + phase-level messages), Athena (Query started/succeeded/failed), and SageMaker (job-type lifecycle messages: Training/Processing/Endpoint/Pipeline/Transform/HyperparameterTuning). See [IMPROVEMENT-SUGGESTIONS.md](IMPROVEMENT-SUGGESTIONS.md) and README “What’s New in v7.4”.

---

## Summary

| Priority | Service    | Gap vs. Glue-style | Suggested additions |
|----------|------------|--------------------|---------------------|
| **High** | EMR        | No run_state; thin metrics; static Spark messages | run_state, elapsedTime, JVM/heap/GC, numCompletedTasks, “Job run started/succeeded/failed”, dynamic Stage (runJob) + shuffle messages |
| **High** | Batch      | No “job run started/succeeded/failed” in messages; no elapsedTime in metrics | Message pool: job run started/succeeded/failed; metrics: elapsedTime (or duration in metrics block) |
| **Medium** | CodeBuild | No “Build started/succeeded/failed” in messages | Message pool: build started/succeeded/failed; optional phase-level duration in metrics |
| **Medium** | SageMaker  | Already strong (event.action, studio, cloudwatch_metrics) | Optional: “Training job started/succeeded/failed” in message pool for consistency |
| **Medium** | Athena     | Good metrics; no explicit “Query started/succeeded/failed” in messages | Message pool: query started/succeeded/failed |
| **Medium** | DataBrew   | No run_state; no “Job run started/succeeded/failed”; no metrics block | run_state, message pool signals, aws.databrew.metrics (rows_processed, duration, etc.) |
| **Medium** | AppFlow    | execution_status present; no metrics block; no “Flow run started/succeeded/failed” | Message pool signals; aws.appflow.metrics (records_processed, duration_ms, etc.) |
| **Lower** | Step Functions | Already has ExecutionsStarted/Succeeded/Failed, ExecutionTime | Optional: “Execution started/succeeded/failed” in message pool |
| **Lower** | Kinesis Analytics | Good metrics; no “Application started/failed” in messages | Message pool: application run/checkpoint signals |
| **Lower** | CodePipeline / CodeDeploy | Already have stage/state and duration | Optional: “Pipeline/Deployment started/succeeded/failed” in message pool |

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
