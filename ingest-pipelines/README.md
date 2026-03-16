# Elastic Ingest Pipelines (AWS Glue)

Ingest pipeline definitions for parsing and enriching AWS Glue logs (and related streams) in Elastic.

## glue-parse-json-message

**Pipeline ID:** `glue-parse-json-message`

Parses a JSON payload from the log `message` field (e.g. from AWS Glue continuous logging). When `message` contains valid JSON, the parsed object is stored under `glue.parsed`. When `message` is not JSON or parsing fails, the document is unchanged and the original `message` is kept.

- **Input field:** `message` (or configure to use `log.original` if your integration stores the raw log line there)
- **Target field:** `glue.parsed`
- **Failure handling:** `ignore_failure: true` so non-JSON messages are still indexed

### Apply the pipeline (API)

Use the [Put Ingest Pipeline API](https://www.elastic.co/guide/en/elasticsearch/reference/current/put-pipeline-api.html) with your Elasticsearch endpoint and credentials:

```bash
curl -X PUT "${ES_URL}/_ingest/pipeline/glue-parse-json-message" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey ${ES_API_KEY}" \
  -d @glue-parse-json-message.json
```

Replace `ES_URL` and `ES_API_KEY` with your deployment URL and API key (e.g. from your Elastic Cloud API keys or the elasticsearch skill `.env`).

### Attach the pipeline

Use one of these so that Glue log documents are processed by the pipeline:

| Method | Steps |
|--------|--------|
| **Fleet / AWS integration** | In **Fleet → Agent policy → AWS (Custom Logs or CloudWatch)** for the Glue log group, set **Custom ingest pipeline** to `glue-parse-json-message`. |
| **Index template** | In the index template that matches `logs-aws.glue*`, set `default_pipeline` to `glue-parse-json-message` (e.g. via Index Management or the [Index Templates API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-put-template.html)). |
| **Kibana** | **Stack Management → Ingest Pipelines** → open `glue-parse-json-message` → **Manage** → assign to the appropriate data stream or index template. |

**Target index pattern:** `logs-aws.glue*` so only Glue logs are parsed; other AWS log streams are unaffected.

### Optional: ECS / aws.glue mapping

If your Glue logs emit known JSON keys (e.g. `jobName`, `jobRunId`, `level`, `errorCode`), you can add processors to copy them into ECS or `aws.glue` (e.g. `glue.parsed.jobName` → `aws.glue.job.name`). Edit `glue-parse-json-message.json` and add `rename` or `set` processors after the `json` processor, then re-apply the pipeline.
