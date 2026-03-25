# Installer 4 — ML Anomaly Detection Jobs

Interactive CLI that installs **Elasticsearch ML anomaly detection jobs** for AWS services across 7 service groups (~35 jobs total). Jobs are created via the Elasticsearch ML API directly — no Kibana required.

---

## Why this installer exists

The official Elastic AWS integration ships ML jobs only for **CloudTrail**. This installer fills the gap with purpose-built anomaly detection jobs for ALB, API Gateway, Lambda, EC2, EKS, RDS, Aurora, ElastiCache, Kinesis, SQS, Bedrock, S3, VPC Flow Logs, GuardDuty, and WAF.

---

## Prerequisites

- Elasticsearch 8.x (Stack) or Elastic Cloud / Serverless with ML enabled
- A Platinum or Enterprise licence is required for ML anomaly detection on self-managed clusters
- An API key with the **`manage_ml`** cluster privilege

To create a suitable API key in Kibana:
> Dev Tools → `POST /_security/api_key` with `"cluster": ["manage_ml"]`

---

## How to run

```bash
# From the repo root:
npm run setup:ml-jobs

# Or directly:
node installer/custom-ml-jobs/index.mjs
```

The installer will prompt you for:
1. Deployment type (Self-Managed / Cloud Hosted / Serverless)
2. Whether to skip TLS verification (self-managed only, for internal CAs)
3. Your **Elasticsearch** URL (not Kibana)
4. Your API key

---

## Job groups

| # | Group | Description | Jobs |
|---|-------|-------------|------|
| 1 | `security` | Security & compliance — VPC Flow, GuardDuty, WAF, CloudTrail | 7 |
| 2 | `compute` | Compute & containers — Lambda, EC2, EKS | 7 |
| 3 | `networking` | Networking & load balancers — ALB, API Gateway | 5 |
| 4 | `databases` | Databases — RDS, Aurora, ElastiCache | 6 |
| 5 | `streaming` | Streaming & messaging — Kinesis, SQS | 4 |
| 6 | `aiml` | AI & ML services — Bedrock | 4 |
| 7 | `storage` | Storage — S3 | 4 |

You can install individual groups or all groups at once.

---

## All jobs

### security (7 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-vpcflow-high-bytes-tx` | VPC Flow Logs | high_sum by dest IP | Unusually high bytes transmitted to a destination (exfiltration) |
| `aws-vpcflow-rare-dest-port` | VPC Flow Logs | rare by dest port | Rare destination ports being contacted (lateral movement, recon) |
| `aws-vpcflow-high-denied-count` | VPC Flow Logs | high_count by src IP | Spikes in denied connections from a single source IP |
| `aws-guardduty-finding-spike` | GuardDuty | high_count by finding type | Sudden increases in GuardDuty finding counts per type |
| `aws-guardduty-rare-finding-type` | GuardDuty | rare by finding type | Rare or novel GuardDuty finding types appearing for the first time |
| `aws-waf-high-block-rate` | WAF | high_count by rule | Spikes in WAF rule block actions per rule |
| `aws-cloudtrail-rare-user-action` | CloudTrail | rare by event name + user | Rare or unusual API calls per user (privilege escalation, recon) |

### compute (7 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-lambda-error-spike` | Lambda | high_count by function | Spikes in Lambda function errors per function name |
| `aws-lambda-duration-anomaly` | Lambda | high_mean by function | Unusually long Lambda invocation durations |
| `aws-lambda-throttle-spike` | Lambda | high_count by function | Spikes in Lambda throttles (capacity exhaustion) |
| `aws-ec2-cpu-anomaly` | EC2 | high_mean by instance | CPU utilisation anomalies per EC2 instance |
| `aws-ec2-network-spike` | EC2 | high_sum by instance | Unusual outbound network volume per instance |
| `aws-eks-pod-failure-spike` | EKS | high_count by namespace | Pod failure / restart spikes per Kubernetes namespace |
| `aws-eks-rare-image` | EKS | rare by image | Rare container images starting in the cluster |

### networking (5 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-alb-5xx-spike` | ALB | high_count by target group | Spikes in ALB 5xx responses per target group |
| `aws-alb-response-time-anomaly` | ALB | high_mean | Unusual backend response times in ALB |
| `aws-alb-rare-user-agent` | ALB | rare by user agent | Rare user agent strings (scanners, bots, attack tooling) |
| `aws-apigateway-latency-anomaly` | API Gateway | high_mean by stage | Unusual API Gateway latency per stage |
| `aws-apigateway-error-spike` | API Gateway | high_count by stage | Spikes in API Gateway 4xx/5xx errors per stage |

### databases (6 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-rds-latency-anomaly` | RDS | high_mean by instance | Query latency anomalies per RDS instance |
| `aws-rds-connection-spike` | RDS | high_count by instance | Unusual connection count spikes (connection pool exhaustion) |
| `aws-aurora-replica-lag` | Aurora | high_mean by cluster | Aurora replica lag anomalies indicating replication issues |
| `aws-aurora-serverless-capacity` | Aurora Serverless | high_max by cluster | Capacity unit spikes (cost runaway, scaling storms) |
| `aws-elasticache-hit-rate-drop` | ElastiCache | low_mean by node | Cache hit rate drops (cold cache, key churn) |
| `aws-elasticache-latency-spike` | ElastiCache | high_mean by node | Command latency spikes per ElastiCache node |

### streaming (4 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-kinesis-iterator-age-anomaly` | Kinesis | high_mean by stream | Iterator age anomalies (consumers falling behind) |
| `aws-kinesis-throughput-anomaly` | Kinesis | high_sum by stream | Unusual write throughput spikes per stream |
| `aws-sqs-message-age-anomaly` | SQS | high_mean by queue | Message age anomalies (slow consumers, DLQ build-up) |
| `aws-sqs-not-visible-spike` | SQS | high_count by queue | Spikes in not-visible message count (processing failures) |

### aiml (4 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-bedrock-token-usage-spike` | Bedrock | high_sum by model | Unusual token consumption per model (cost runaway detection) |
| `aws-bedrock-latency-anomaly` | Bedrock | high_mean by model | Unusual inference latency per Bedrock model |
| `aws-bedrock-error-spike` | Bedrock | high_count by model | Error rate spikes per Bedrock model |
| `aws-bedrock-rare-model` | Bedrock | rare by model ID | Rare or unexpected model IDs being invoked |

### storage (4 jobs)

| Job ID | Service | Detector | What it detects |
|--------|---------|----------|-----------------|
| `aws-s3-bandwidth-anomaly` | S3 | high_sum by bucket | Unusual data egress volume per bucket (potential exfiltration) |
| `aws-s3-error-spike` | S3 | high_count by bucket | 4xx/5xx error spikes per bucket (access denied, not found) |
| `aws-s3-rare-operation` | S3 | rare by operation | Rare S3 operations (DeleteBucket, PutBucketPolicy, etc.) |
| `aws-s3-rare-requester` | S3 | rare by requester | Rare requesting principals accessing a bucket |

---

## Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic ML Anomaly Detection Installer     ║
╚══════════════════════════════════════════════════════╝

Installs Elasticsearch ML anomaly detection jobs for AWS services.
Requires an API key with the `manage_ml` cluster privilege.

Select your Elastic deployment type:

  1. Self-Managed  (on-premises, Docker, VM)
  2. Elastic Cloud Hosted  (cloud.elastic.co)
  3. Elastic Serverless  (cloud.elastic.co/serverless)

Enter 1, 2, or 3:
> 2

Elasticsearch URL (e.g. https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.es.eu-west-2.aws.elastic.cloud

Elastic API Key (requires `manage_ml` privilege):
> <redacted>

Testing connection...
  Connected to cluster: my-production (8.17.0)
  Checking ML availability...
  ML is available.

Available job groups:

   1. security     (7 jobs)  — Security & compliance anomaly detection — VPC Flow, GuardDuty, WAF, CloudTrail
   2. compute      (7 jobs)  — Compute & container anomaly detection — Lambda, EC2, EKS
   3. networking   (5 jobs)  — Networking & load balancer anomaly detection — ALB, API Gateway
   4. databases    (6 jobs)  — Database anomaly detection — RDS, Aurora, ElastiCache
   5. streaming    (4 jobs)  — Streaming & messaging anomaly detection — Kinesis, SQS
   6. aiml         (4 jobs)  — AI & ML service anomaly detection — Bedrock
   7. storage      (4 jobs)  — Storage anomaly detection — S3
   8. all           (install every group)

Enter number(s) comma-separated, or "all":
> 1,3

Installing 12 job(s)...

  ✓ aws-vpcflow-traffic-spike — installed
  ✓ aws-vpcflow-rare-dest-port — installed
  ✓ aws-guardduty-finding-spike — installed
  ✓ aws-waf-block-spike — installed
  ✓ aws-cloudtrail-failed-auth — installed
  ✓ aws-cloudtrail-rare-api-call — installed
  ✓ aws-cloudtrail-root-activity — installed
  ✓ aws-alb-5xx-spike — installed
  ✓ aws-alb-response-time-anomaly — installed
  ✓ aws-alb-rare-user-agent — installed
  ✓ aws-apigateway-latency-anomaly — installed
  ✓ aws-apigateway-error-spike — installed

Installed 12 / 12 job(s).

Open jobs and start datafeeds? This begins ML analysis. (y/N):
> y

  Opening aws-vpcflow-traffic-spike... opened. Starting datafeed... started.
  Opening aws-vpcflow-rare-dest-port... opened. Starting datafeed... started.
  ...

Done.
```

---

## Opening jobs and starting datafeeds

After installation, the installer offers to open jobs and start their datafeeds immediately. If you choose **N** (or run the installer again to install more groups later), you can start jobs manually from:

> Kibana → Machine Learning → Anomaly Detection → Jobs → select jobs → Actions → Start datafeed

Datafeeds default to real-time mode (from now). To backfill historical data, use the Kibana UI to set a custom start time.

---

## Viewing results in Kibana

Once datafeeds are running and data has been collected for at least one bucket span (typically 15–60 minutes), anomalies will appear in:

> Kibana → Machine Learning → Anomaly Detection → Anomaly Explorer

Filter by job groups `aws` to see all jobs installed by this tool. Anomaly scores are surfaced on a per-job and per-detector basis, with influencers highlighting the specific instance, function, bucket, or IP responsible for the anomaly.

---

## Notes

- Jobs use `allow_lazy_open: true` — they will open even if ML nodes are temporarily at capacity.
- All jobs use `model_memory_limit` values between 16 MB and 64 MB; adjust these in the job JSON files before installing if your environment has high cardinality.
- Re-running the installer is safe — existing jobs are detected and skipped automatically.
- Job definitions live in `installer/custom-ml-jobs/jobs/` as `*-jobs.json` files. You can add new groups by creating additional files following the same schema.
