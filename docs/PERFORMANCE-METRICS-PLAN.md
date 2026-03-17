# Performance & anomaly-detection metrics plan

> **Last updated:** 2026-03-17 (v7.6)

This document guides which fields the load generator emits so you can:

- **Measure performance** — duration, latency (avg/p99), throughput, utilization %
- **Build Elastic visualizations** — consistent numeric fields across services
- **Run ML anomaly detection** — time-series-friendly metrics (counts, rates, utilization)

## Principles

1. **`event.duration`** (nanoseconds) — Emitted for every log where a duration is meaningful (request latency, job run time, query time). Enables latency trends and anomaly detection.
2. **`aws.<service>.metrics`** — CloudWatch-style blocks with numeric metrics (sum, avg, max, p99) so dashboards and ML jobs can use the same field paths.
3. **Utilization & rates** — CPU/memory/disk %, error rate, success rate, throttle rate, cache hit rate. These are strong signals for anomaly detection.
4. **Counts** — Invocations, requests, messages, errors, throttles. Essential for throughput and failure analysis.

## Services updated for performance / ML

| Service | Additions |
|---------|-----------|
| **SNS** | `event.duration`, `aws.sns.metrics` (NumberOfMessagesPublished, NumberOfNotificationsDelivered, NumberOfNotificationsFailed, etc.) |
| **Athena** | `aws.athena.metrics` (DataScannedInBytes, EngineExecutionTimeInMillis, ProcessedBytes, etc.) |
| **SageMaker** | `aws.sagemaker.metrics` CloudWatch-style (Invocations, ModelLatency, GPUUtilization, etc.) in addition to training metrics |
| **Fargate** | `aws.fargate.metrics` (CPUUtilization, MemoryUtilization, RunningTaskCount) aligned with ECS |
| **AutoScaling** | `event.duration`, `aws.autoscaling.metrics` (GroupDesiredCapacity, GroupInServiceInstances, etc.) |
| **ImageBuilder** | `aws.imagebuilder.metrics` (BuildDuration, ImageBuildSuccess/Failed counts) |
| **Amazon MQ** | `event.duration`, `aws.amazonmq.metrics` (QueueDepth, ProducerCount, ConsumerCount, etc.) |
| **AppSync** | `aws.appsync.metrics` (4xx, 5xx, Latency, RequestCount) |
| **Bedrock** | `aws.bedrock.metrics` (Invocations, InvocationLatency, InputTokenCount, OutputTokenCount, Throttles) |

## Field naming (Elastic / CloudWatch alignment)

- Use **CloudWatch metric names** where the service has a native integration (e.g. `NumberOfMessagesSent` for SQS, `Invocations` for Lambda).
- Use **snake_case** for custom or composite fields (e.g. `used_percentage`, `data_scanned_bytes`).
- Keep **utilization** as 0–1 or 0–100 consistently per service so ML jobs can aggregate.

## Already strong

These already have rich metrics and/or duration suitable for visualizations and ML:

- **Lambda** — Invocations, Errors, Throttles, Duration (avg/max/min)
- **API Gateway** — Count, 4xx/5xx, Latency, IntegrationLatency
- **ECS** — CPUUtilization, MemoryUtilization, RunningTaskCount, PendingTaskCount
- **EC2** — CPUUtilization, NetworkIn/Out, Disk*, StatusCheck*, CPUCredit*
- **ALB/NLB** — RequestCount, *StatusCode*, TargetResponseTime, HealthyHostCount, etc.
- **CloudFront** — Requests, ErrorRate, CacheHitRate, etc.
- **RDS** — CPUUtilization, DatabaseConnections, ReadLatency, WriteLatency, etc.
- **DynamoDB** — ConsumedRead/WriteCapacityUnits, SuccessfulRequestLatency, SystemErrors, ThrottledRequests
- **ElastiCache** — CPUUtilization, CacheHits/Misses, CurrConnections, Evictions, ReplicationLag
- **Kinesis** — IncomingRecords/Bytes, IteratorAgeMilliseconds, *ThroughputExceeded
- **SQS** — NumberOfMessagesSent/Received/Deleted, ApproximateNumberOfMessagesVisible, ApproximateAgeOfOldestMessage
- **EventBridge** — Invocations, FailedInvocations, TriggeredRules, MatchedEvents
- **Step Functions** — ExecutionsStarted/Succeeded/Failed/Aborted/TimedOut, ExecutionTime
- **Glue** — driver/ALL memory.heap, disk, workerUtilization, skewness (stage/job)
- **EMR, MSK, OpenSearch, DocumentDB, Redshift, Batch, CodeBuild, Beanstalk** — existing metrics blocks

## Regenerating samples

After changes, run `npm run samples` to refresh `samples/logs/` and `samples/metrics/`.
