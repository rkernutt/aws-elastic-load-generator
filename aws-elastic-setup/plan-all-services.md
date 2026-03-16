# Plan: Improvements for All Other Services

Apply the same patterns used for **Lambda**, **Glue**, and **SageMaker** across the remaining ~104 services in the aws-elastic-load-generator so every service is easier to search, filter, and dashboard in Elastic (with or without a dedicated integration).

**Reference:** [plan-glue-sagemaker.md](plan-glue-sagemaker.md) for the Glue/SageMaker pattern. Lambda already has: index/data stream naming, `data_stream.dataset`, `aws.lambda.metrics.memory_size_mb`, and `EventSourceMappingUUID` always set.

---

## Goal

For every generator (except Lambda, Glue, SageMaker, which are done):

1. **event.duration** — Add where the event represents a request, job, or operation with a meaningful duration (nanoseconds). Many already have it (e.g. RDS, API Gateway, Step Functions, CodeBuild, Athena); add for any that do not.
2. **error.code / error.message** — On failure (`event.outcome === "failure"`), set explicit `error: { code, message, type: "service" }` with service-appropriate codes/messages so Discover and ECS error views work with real codes instead of only the generic enrichDoc fallback.
3. **Dimensions** — For every generator that has `aws.dimensions`, ensure every dimension key is **always present** (value or `null`). No conditional spread that omits keys (same as Lambda's `EventSourceMappingUUID`).
4. **event.action** — Add where it helps (audit/API events, lifecycle, or operation type). Optional for job-based services that already have a status/type field.

**Out of scope:** Changing index naming or `data_stream.dataset` (already done globally with dot naming and `ELASTIC_DATASET_MAP`). No change to `enrichDoc`.

---

## Service groups and rules

### Group 1 — Serverless & Core (Lambda done; others)

| Service       | event.duration | error on failure | dimensions | event.action |
|---------------|----------------|------------------|------------|--------------|
| API Gateway   | Yes            | Add code/message | Yes        | Optional     |
| VPC Flow      | N/A            | Add if failure   | Yes        | Optional     |
| CloudTrail    | N/A            | Add if failure   | Yes        | Keep action  |
| RDS           | Yes            | Add code/message | Yes        | Optional     |
| ECS           | Add if missing | Add code/message | Yes        | Optional     |

**Rule:** Ensure dimensions always have all keys; add explicit `error` on failure; add `event.duration` for ECS if not present.

---

### Group 2 — Compute & Containers

| Service        | event.duration | error on failure | dimensions | event.action / run_state |
|----------------|----------------|------------------|------------|---------------------------|
| EC2            | Add if missing | Add             | Yes (all keys) | Optional              |
| EKS            | Add if missing | Add             | Yes        | Optional                  |
| App Runner     | Yes            | Add             | No         | Optional                  |
| Batch          | Add            | Add             | Yes        | Optional run_state       |
| Beanstalk      | Add if missing | Add             | Yes        | Optional                  |
| ECR            | N/A            | Add             | No         | Optional                  |
| Fargate        | Add if missing | Add             | Yes        | Optional                  |
| Auto Scaling   | N/A            | Add             | No         | Optional                  |
| Image Builder  | Yes            | Add             | Yes        | Optional                  |

**Rule:** Job/container services: add `event.duration` (e.g. job duration in ns); add explicit `error` on failure; dimensions always full (value or null).

---

### Group 3 — Networking & CDN

| Service           | event.duration | error on failure | dimensions | event.action |
|-------------------|----------------|------------------|------------|--------------|
| ALB               | Yes            | Add              | Yes        | Optional     |
| NLB               | Add if missing | Add              | Yes        | Optional     |
| CloudFront        | Add if missing | Add              | Yes        | Optional     |
| WAF               | N/A            | Add              | Yes        | Keep action  |
| Route 53          | Add if missing | Add              | Yes        | Optional     |
| Network Firewall  | N/A            | Add              | Yes        | Keep action  |
| Shield            | N/A            | Add              | Yes        | Optional     |
| Global Accelerator | Add if missing | Add              | No         | Optional     |
| Transit Gateway   | N/A            | Add              | No         | Optional     |
| Direct Connect    | N/A            | Add              | No         | Optional     |
| VPN               | N/A            | Add              | No         | Optional     |
| PrivateLink       | N/A            | Add              | No         | Optional     |

**Rule:** All: explicit `error` on failure. Where dimensions exist, all keys always set. Add `event.duration` for request/latency-based logs where missing.

---

### Group 4 — Security & Compliance

| Service          | event.duration | error on failure | dimensions | event.action   |
|------------------|----------------|------------------|------------|-----------------|
| GuardDuty        | N/A            | Add if finding   | Yes        | Keep/align      |
| Security Hub     | N/A            | Add              | Yes        | Optional        |
| Macie            | N/A            | Add              | No         | Optional        |
| Inspector        | N/A            | Add              | Yes        | Optional        |
| Config           | N/A            | Add              | Yes        | Optional        |
| Access Analyzer  | N/A            | Add              | Yes        | Optional        |
| Cognito          | N/A            | Add              | No         | Optional        |
| KMS              | N/A            | Add              | No         | Keep action     |
| Secrets Manager  | N/A            | Add              | No         | Optional        |
| ACM              | N/A            | Add              | No         | Optional        |
| Identity Center  | N/A            | Add              | No         | Optional        |
| Detective        | N/A            | Add              | No         | Optional        |

**Rule:** All: explicit `error` on failure. Dimensions: all keys always set where present. event.action only where it adds value (e.g. operation type).

---

### Group 5 — Storage & Databases

| Service         | event.duration | error on failure | dimensions | event.action |
|-----------------|----------------|------------------|------------|--------------|
| S3              | N/A            | Add              | Yes        | Optional      |
| DynamoDB        | Add if missing | Add              | Yes        | Optional      |
| ElastiCache     | Yes            | Add              | Yes        | Optional      |
| Redshift        | Yes            | Add              | Yes        | Optional      |
| OpenSearch      | Yes            | Add              | Yes        | Optional      |
| DocumentDB      | Yes            | Add              | Yes        | Optional      |
| EBS             | N/A            | Add              | Yes        | Optional      |
| EFS             | N/A            | Add              | No         | Optional      |
| FSx             | N/A            | Add              | No         | Optional      |
| DataSync        | Add            | Add              | No         | Optional      |
| Backup          | Add if missing | Add              | No         | Optional      |
| Storage Gateway | N/A            | Add              | No         | Optional      |
| Aurora          | Add if missing | Add              | Yes        | Optional       |
| Neptune         | Yes            | Add              | No         | Optional      |
| Timestream      | Yes            | Add              | No         | Optional      |
| QLDB            | Yes            | Add              | No         | Optional      |
| Keyspaces       | Yes            | Add              | No         | Optional      |
| MemoryDB        | Yes            | Add              | No         | Optional      |

**Rule:** All: explicit `error` on failure. Add `event.duration` where the log represents a query/job/request and it's missing. Dimensions: all keys always set.

---

### Group 6 — Streaming & Messaging

| Service        | event.duration | error on failure | dimensions | event.action |
|----------------|----------------|------------------|------------|--------------|
| Kinesis        | Add if missing | Add              | Yes        | Optional      |
| Firehose       | Add if missing | Add              | Yes        | Optional      |
| Kinesis Analytics | Add if missing | Add           | No         | Optional      |
| MSK            | Add if missing | Add              | Yes        | Optional      |
| SQS            | Add if missing | Add              | Yes        | Optional      |
| SNS            | N/A            | Add              | No         | Optional      |
| Amazon MQ      | N/A            | Add              | No         | Optional      |
| EventBridge    | Add if missing | Add              | Yes        | Optional      |
| Step Functions | Yes            | Add              | Yes        | Optional      |
| AppSync        | Yes            | Add              | No         | Optional      |

**Rule:** Same as above: error on failure, duration where applicable, dimensions full.

---

### Group 7 — Developer & CI/CD

| Service       | event.duration | error on failure | dimensions | event.action |
|---------------|----------------|------------------|------------|--------------|
| CodeBuild     | Yes            | Add              | Yes        | Optional      |
| CodePipeline  | Add if missing | Add              | Yes        | Optional      |
| CodeDeploy    | Yes            | Add              | Yes        | Optional      |
| CodeCommit    | N/A            | Add              | No         | Optional      |
| CodeArtifact  | N/A            | Add              | No         | Optional      |
| Amplify       | Yes            | Add              | No         | Optional      |
| X-Ray         | Yes            | Add              | No         | Optional      |

**Rule:** Job-based: ensure event.duration; all: explicit error on failure; dimensions full where present.

---

### Group 8 — Analytics (Glue done; others)

| Service      | event.duration | error on failure | dimensions | event.action |
|--------------|----------------|------------------|------------|--------------|
| EMR          | Add if missing | Add              | No         | Optional      |
| Athena       | Yes            | Add              | No         | Optional      |
| Kinesis Analytics | Add if missing | Add           | No         | Optional      |
| Lake Formation   | N/A         | Add              | No         | Optional      |
| QuickSight   | Yes            | Add              | No         | Optional      |
| DataBrew     | Yes            | Add              | No         | Optional      |
| AppFlow      | Add if missing | Add              | No         | Optional      |

**Rule:** Same: duration where applicable, error on failure.

---

### Group 9 — AI & ML (SageMaker done; others)

| Service    | event.duration | error on failure | dimensions | event.action |
|------------|----------------|------------------|------------|--------------|
| Bedrock    | Add if missing | Add              | No         | Optional      |
| Rekognition | Yes            | Add              | No         | Optional      |
| Textract   | N/A            | Add              | No         | Optional      |
| Comprehend | N/A            | Add              | No         | Optional      |
| Translate  | Yes            | Add              | No         | Optional      |
| Transcribe | N/A            | Add              | No         | Optional      |
| Polly      | N/A            | Add              | No         | Optional      |
| Forecast    | Yes            | Add              | No         | Optional      |
| Personalize | Yes            | Add              | No         | Optional      |
| Lex        | N/A            | Add              | No         | Optional      |

**Rule:** Same: duration where it applies (e.g. inference/training), error on failure.

---

### Groups 10–14 — IoT, Management, Media, Messaging, Additional

Apply the same rules:

- **event.duration** — Add for any request/job/operation that has a meaningful duration and does not already set it.
- **error** — On every generator that can have `event.outcome === "failure"`, set `error: { code, message, type: "service" }` with 2–5 service-specific codes and messages.
- **dimensions** — For every generator that has `aws.dimensions`, ensure every key is always set (value or `null`); remove any `...(condition ? { Key: value } : {})` and use `Key: condition ? value : null`.
- **event.action** — Add only where it clearly helps (e.g. API/audit events, lifecycle); optional for most.

---

## Implementation order

1. **Phase 1 — Dimensions only**  
   Walk every generator that has `aws.dimensions` and ensure all dimension keys are always present (value or `null`). No new fields.

2. **Phase 2 — Error on failure**  
   For every generator that uses an error rate or outcome, add explicit `error: { code, message, type: "service" }` when outcome is failure. Use 2–5 plausible codes/messages per service.

3. **Phase 3 — event.duration**  
   For every generator that represents a request/job/operation with a duration and does not yet set `event.duration`, add it (in nanoseconds).

4. **Phase 4 — event.action (optional)**  
   Add `event.action` only where it clearly improves filtering (e.g. CloudTrail-style actions, lifecycle events). Skip for simple job/request logs.

---

## File and scope

- **File:** All changes in `src/App.jsx` only (at repo root). No changes to `enrichDoc`, index naming, or README.
- **Excluded:** Lambda, Glue, SageMaker (already done).
- **Lint:** Run after each phase (or at the end) and fix any issues.

---

## Out of scope

- New data streams or index naming (already global).
- Per-service run_state/status unless it's a single line (e.g. Batch, EMR) and significantly helps.
- Custom Kibana dashboards or saved searches.
- Real CloudWatch/log parsing; generators remain synthetic.
