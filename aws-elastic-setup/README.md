# AWS → Elastic setup and reference

This directory contains **guides, plans, and reference docs** for:

- Ingesting **AWS Glue** and **Amazon SageMaker** logs from **CloudWatch** into **Elastic** (default or Custom Logs integration).
- **Glue metrics and logs** coverage vs AWS documentation.
- **AWS services** documentation review and enhancement candidates.
- **Elastic ingest pipelines** for parsing JSON from the `message` field (Glue, SageMaker).

Use this as a single place for setup steps, index routing, and pipeline definitions.

---

## Contents

### Step-by-step and routing

| Document | Description |
|----------|-------------|
| [**guide-cloudwatch-glue-sagemaker-elastic.md**](guide-cloudwatch-glue-sagemaker-elastic.md) | **Start here.** Step-by-step: AWS (Glue/SageMaker logging, IAM) and Elastic (Fleet/Custom Logs integration, ingest pipelines) so CloudWatch logs land in `logs-aws.glue` and `logs-aws.sagemaker`. |
| [**cloudwatch-to-index-routing.md**](cloudwatch-to-index-routing.md) | Why CloudWatch doesn’t set an index; how to route by log group so Glue/SageMaker go to the right indices; custom sender option. |

### Glue and metrics reference

| Document | Description |
|----------|-------------|
| [**glue-metrics-coverage.md**](glue-metrics-coverage.md) | Map of load generator Glue fields vs AWS CloudWatch and Observability docs; what’s covered and what’s out of scope. |

### AWS services review and plans

| Document | Description |
|----------|-------------|
| [**aws-services-documentation-review.md**](aws-services-documentation-review.md) | Review of all AWS services in the generator vs official AWS monitoring docs; doc links, coverage, gaps. |
| [**enhancement-candidates.md**](enhancement-candidates.md) | Services to enhance (EMR, Batch, DataBrew, AppFlow, etc.) with Glue-style run signals and metrics; suggested implementation order. |
| [**performance-metrics-plan.md**](performance-metrics-plan.md) | Principles for performance and anomaly-detection metrics; services updated; field naming. |
| [**plan-glue-sagemaker.md**](plan-glue-sagemaker.md) | Plan for Glue and SageMaker generator improvements (run_state, duration, error, Studio fields). |
| [**plan-all-services.md**](plan-all-services.md) | Plan to apply event.duration, error on failure, dimensions, and event.action across all other services. |

### Ingest pipelines (Glue & SageMaker)

| Item | Description |
|------|-------------|
| [**ingest-pipelines/README.md**](ingest-pipelines/README.md) | How to apply and attach the pipelines. |
| [**ingest-pipelines/glue-parse-json-message.json**](ingest-pipelines/glue-parse-json-message.json) | Pipeline definition: parse JSON from `message` → `glue.parsed`. |
| [**ingest-pipelines/sagemaker-parse-json-message.json**](ingest-pipelines/sagemaker-parse-json-message.json) | Pipeline definition: parse JSON from `message` → `sagemaker.parsed`. |

---

## Quick links

- **I want to ingest Glue and SageMaker from CloudWatch** → [guide-cloudwatch-glue-sagemaker-elastic.md](guide-cloudwatch-glue-sagemaker-elastic.md).
- **I want to know which index CloudWatch logs go to** → [cloudwatch-to-index-routing.md](cloudwatch-to-index-routing.md).
- **I want to see what Glue metrics we emit vs AWS** → [glue-metrics-coverage.md](glue-metrics-coverage.md).
- **I want to add ingest pipelines in Elastic** → [ingest-pipelines/README.md](ingest-pipelines/README.md) and the JSON files in [ingest-pipelines/](ingest-pipelines/).

---

## Relation to repo root

- The **load generator app** and **main docs** live in the repo root and `docs/`. This directory is a **copy** of the relevant setup and reference content so you have one place for AWS + Elastic setup.
- The **canonical ingest pipeline JSON files** for the full app are in the repo at `ingest-pipelines/`; this directory’s `ingest-pipelines/` contains the Glue and SageMaker pipelines used by the guide.
