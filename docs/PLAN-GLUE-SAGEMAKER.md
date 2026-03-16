# Glue and SageMaker Generator Improvements

Plan for extending the Glue and SageMaker log generators in the aws-elastic-load-generator app with ECS-aligned and Studio-specific fields so logs are easier to search, filter, and dashboard in Elastic when no dedicated integration exists.

---

## Scope

- **Glue:** `src/App.jsx` — `generateGlueLog`
- **SageMaker:** `src/App.jsx` — `generateSageMakerLog`
- No changes to `enrichDoc`, index naming, or other services. Existing ECS baseline in `enrichDoc` already fills `error.message` when `event.outcome === "failure"`; generators add explicit `error` and `event.duration` for clearer, queryable fields.

---

## 1. Glue generator

**Location:** `generateGlueLog` in `src/App.jsx`.

**Additions:**

| Area | Field(s) | Purpose |
|------|----------|---------|
| Run state | `aws.glue.job.run_state` | One of `RUNNING`, `SUCCEEDED`, `FAILED`, `STOPPED` (derived from level / error so filtering by outcome is consistent). |
| Duration | `event.duration` | Job duration in nanoseconds (e.g. random range 30s–2h, or shorter on failure). |
| Error | `error.code`, `error.message` | On `level === "error"`: set from a small list of Glue-like codes/messages (e.g. `GlueException`, `AccessDenied`, connection errors); otherwise omit. |
| Dimensions | `aws.dimensions` | `JobName`, `JobRunId`, `Type` (glueetl / pythonshell / gluestreaming) for future metric/correlation use. |
| Context | `aws.glue.crawler_name`, `aws.glue.connection_name` | Optional; can be `null` for most docs to allow filtering by crawler/connection in Discover. |

**Implementation notes:**

- Compute `run_state` from `level`: e.g. `level === "error"` → `FAILED`, else `SUCCEEDED` (or occasionally `RUNNING`/`STOPPED` for variety).
- Use existing `job`, `run_id`, `type` for dimensions; for `event.duration` use a random duration in nanoseconds.
- Keep existing `event.outcome` and `event.category`; add `event.duration` and explicit `error` when failing so ECS `error.*` and duration-based views work.

---

## 2. SageMaker generator (classic + Unified Studio)

**Location:** `generateSageMakerLog` in `src/App.jsx`.

**Additions:**

| Area | Field(s) | Purpose |
|------|----------|---------|
| Studio (Unified Studio) | `aws.sagemaker.studio.space_name`, `aws.sagemaker.studio.app_type`, `aws.sagemaker.studio.app_name`, `aws.sagemaker.studio.lifecycle_config` | Model Studio log stream path; filter by space, app type, and lifecycle vs app logs. |
| Event action | `event.action` | Action type, e.g. `TrainingJobStarted`, `EndpointInService`, `AppCreated`, `AppReady`, `LifecycleConfigOnStart`, `PipelineExecutionStarted`. |
| Duration | `event.duration` | Duration in nanoseconds (e.g. training duration or app lifecycle). |
| Error | `error.code`, `error.message` | On failure: SageMaker-like codes/messages (e.g. `CapacityError`, `ResourceNotFound`, CUDA OOM). |
| Clarity | Keep `user.name`; ensure job name is clearly present for pivots. | Already have job name; expose consistently. |

**Studio field population strategy:**

- **Option A (recommended):** For a random subset of docs (e.g. 40–50%), treat as “Studio” and set `aws.sagemaker.studio.*` and `event.action` to Studio-like values; for the rest, set Studio fields to `null` or `false` and use classic job/endpoint/pipeline actions. One generator covers both classic and Studio.
- **Option B:** Two separate functions and wire both in the service list; more code but clearer separation.

**Suggested Studio values:**

- `app_type`: `JupyterServer`, `KernelGateway`, `JupyterLab`, `CodeEditor`, `RStudio`, `RSession`.
- `app_name`: `default` or a short instance name.
- `space_name`: e.g. from a small list like `["ml-research","cv-team","ds-platform"]` (can align with existing domain names).
- `lifecycle_config`: boolean; `true` only when `event.action` is `LifecycleConfigOnStart` (or similar).

---

## 3. ECS and indexing (no code change)

- **Indexing:** Glue and SageMaker use `aws.glue` and `aws.sagemaker` and index as `logs-aws.glue` and `logs-aws.sagemaker` (existing dot naming). No change needed.
- **ECS:** enrichDoc already adds `error.message` when `event.outcome === "failure"`. Generators add `event.duration`, optional `error.code`, and (SageMaker) `event.action` and Studio fields so Discover and saved searches can use them.

---

## 4. Kibana (optional)

- **Data views:** Create one per service, e.g. `logs-aws.glue*` and `logs-aws.sagemaker*` with Time field `@timestamp`.
- **Suggested columns (Glue):** `aws.glue.job.name`, `aws.glue.job.run_id`, `aws.glue.job.run_state`, `event.outcome`, `event.duration`, `log.level`, `message`, `error.message`, `aws.glue.crawler_name`, `aws.glue.connection_name`.
- **Suggested columns (SageMaker):** `aws.sagemaker.studio.space_name`, `aws.sagemaker.studio.app_type`, `aws.sagemaker.studio.app_name`, `aws.sagemaker.job.name`, `event.action`, `event.outcome`, `user.name`, `log.level`, `message`, `error.message`, `aws.sagemaker.studio.lifecycle_config`.

---

## 5. Out of scope (for later)

- Custom Kibana dashboards or saved searches (manual in Kibana).
- Separate data stream for Studio (e.g. `logs-aws.sagemaker_studio`); can be added later if you want to split indices.
- Real CloudWatch log parsing; this remains a generator for realistic-looking structure only.
