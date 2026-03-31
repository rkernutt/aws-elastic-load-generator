/**
 * Multi-service workflow trace generator.
 *
 * Each call produces a correlated set of APM documents (transactions + spans)
 * that all share ONE trace.id, simulating a real distributed request flowing
 * through multiple AWS services. The resulting flame graph in Elastic APM will
 * show the full end-to-end chain.
 *
 * Five workflow patterns are supported:
 *
 *   1. E-commerce Order Flow
 *      API Gateway → Lambda (order-processor) → DynamoDB + SQS
 *        → Lambda (notification-sender) → SES
 *
 *   2. ML Inference Pipeline
 *      API Gateway → Lambda (inference-router) → S3 + Bedrock
 *        → DynamoDB (results cache)
 *
 *   3. Data Ingestion Pipeline
 *      Kinesis (producer) → Lambda (stream-processor) → S3 + Glue
 *        → EMR (etl-job) with Spark stage spans
 *
 *   4. Step Functions Orchestration
 *      EventBridge → Step Functions → Lambda (validate) → DynamoDB
 *        → Lambda (payment) → RDS → Lambda (notification) → SES
 *
 *   5. Cascading Failure
 *      API Gateway (api-payments) → Lambda (payment-handler)
 *        → DynamoDB throttle (×2 retries) → SQS DLQ
 *        → Lambda (dlq-processor) → DynamoDB (success on 3rd attempt)
 *
 * Real-world instrumentation path:
 *   Each service runs its own OTel SDK instance (EDOT layer / EDOT Java agent).
 *   W3C traceparent header carries the same trace.id across HTTP / SDK calls.
 *   OTLP → Elastic APM Server → traces-apm-default
 *
 * Lambda instrumentation options (selected randomly per trace):
 *   EDOT: Elastic Distro for OTel — telemetry.distro.name = "elastic"
 *   ADOT: AWS Distro for OTel   — telemetry.distro.name = "aws-otel"
 *         ADOT traces also carry aws.xray.trace_id / aws.xray.segment_id labels
 *         so the same invocation is findable in both APM and X-Ray.
 *
 * Cold start (~8 % of Lambda invocations):
 *   When faas.coldstart is true an extra "Lambda init" span is emitted as a
 *   child of the Lambda transaction. The TX duration is inflated to include init.
 *
 * Workflow 6 DLQ branch (~15 % of traces, independent of glueFail/redshiftFail):
 *   pipeline-sqs-handler emits an EventSchemaValidationError and routes the
 *   poison message to an SQS DLQ. pipeline-dlq-processor then archives it to S3.
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  randHex,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  randFloat,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Shared constants ─────────────────────────────────────────────────────────

const ENVS = ["production", "production", "staging", "dev"];

const RUNTIME_LANG = {
  "python3.11": "python",
  "python3.12": "python",
  "nodejs18.x": "nodejs",
  "nodejs20.x": "nodejs",
  java21: "java",
};

const RUNTIME_VERSION = {
  "python3.11": "3.11.9",
  "python3.12": "3.12.3",
  "nodejs18.x": "18.20.4",
  "nodejs20.x": "20.15.1",
  java21: "21.0.3",
};

// ─── Low-level document builders ─────────────────────────────────────────────

/**
 * Build a transaction document for a service entry point.
 * `parentId` is undefined for the root service; set it to the invoking span ID
 * for downstream services so APM can stitch the distributed trace.
 */
function txDoc({
  ts,
  traceId,
  txId,
  parentId,
  serviceName,
  environment,
  language,
  runtime,
  framework,
  txType,
  txName,
  durationUs,
  isErr,
  spanCount,
  cloud,
  faas,
  labels,
  distro = "elastic",
}) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    framework ?? null,
    runtime,
    RUNTIME_VERSION[runtime] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    ...(parentId ? { parent: { id: parentId } } : {}),
    transaction: {
      id: txId,
      name: txName,
      type: txType,
      duration: { us: durationUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanCount ?? 1, dropped: 0 },
      ...(faas ? { faas: faas } : {}),
    },
    ...(faas ? { faas: faas } : {}),
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: cloud,
    ...(labels || distro === "aws"
      ? {
          labels: {
            ...(labels ?? {}),
            ...(distro === "aws"
              ? {
                  "aws.xray.trace_id": `1-${randHex(8)}-${randHex(24)}`,
                  "aws.xray.segment_id": randHex(16),
                }
              : {}),
          },
        }
      : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Build a span document.
 * `txId`     = the transaction this span belongs to (for grouping in APM).
 * `parentId` = the immediate parent (could be txId or another span's id).
 */
function spanDoc({
  ts,
  traceId,
  txId,
  parentId,
  spanId,
  spanType,
  spanSubtype,
  spanName,
  spanAction,
  durationUs,
  isErr,
  db,
  destination,
  labels,
  serviceName,
  environment,
  language,
  runtime,
  distro = "elastic",
}) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: spanId,
      type: spanType,
      subtype: spanSubtype,
      name: spanName,
      duration: { us: durationUs },
      action: spanAction,
      ...(db ? { db: db } : {}),
      ...(destination
        ? { destination: { service: { resource: destination, type: spanType, name: destination } } }
        : {}),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    ...(labels ? { labels: labels } : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/** Build the standard AWS cloud block. */
function cloudBlock(region, account, awsService) {
  return {
    provider: "aws",
    region: region,
    account: { id: account.id, name: account.name },
    service: { name: awsService },
  };
}

/**
 * Build an APM error document.
 * Errors land in logs-apm.error-* (data_stream.type = "logs").
 * The parent.id ties the error to the tx or span where it occurred.
 */
function errorDoc({
  ts,
  traceId,
  txId,
  txType,
  parentId,
  exceptionType,
  exceptionMessage,
  culprit,
  handled = false,
  frames = [],
  serviceName,
  environment,
  language,
  runtime,
  distro = "elastic",
}) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);
  return {
    "@timestamp": ts,
    processor: { name: "error", event: "error" },
    trace: { id: traceId },
    transaction: { id: txId, type: txType, sampled: true },
    parent: { id: parentId },
    error: {
      id: randHex(32),
      grouping_key: randHex(32),
      culprit,
      exception: [
        {
          type: exceptionType,
          message: exceptionMessage,
          handled,
          stacktrace: frames,
        },
      ],
    },
    service: svcBlock,
    agent,
    telemetry,
    data_stream: { type: "logs", dataset: "apm.error", namespace: "default" },
  };
}

// ─── Stacktrace frame sets ────────────────────────────────────────────────────
// Realistic frames per runtime/scenario. Mixed library + user frames.

const FRAMES = {
  // Python Lambda — task timeout (Runtime.ExitError)
  python_timeout: (fn) => [
    { function: "handler", filename: `${fn}.py`, lineno: 47, library_frame: false },
    { function: "_execute", filename: `${fn}.py`, lineno: 31, library_frame: false },
    { function: "invoke", filename: "botocore/endpoint.py", lineno: 174, library_frame: true },
  ],
  // Python — DynamoDB ProvisionedThroughputExceededException
  python_dynamo_throttle: (fn) => [
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    {
      function: "_convert_input_params",
      filename: "botocore/serialize.py",
      lineno: 289,
      library_frame: true,
    },
    { function: "write_record", filename: `${fn}.py`, lineno: 38, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 14, library_frame: false },
  ],
  // Python — Bedrock ThrottlingException
  python_bedrock_throttle: (fn) => [
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    { function: "invoke_model", filename: `${fn}.py`, lineno: 52, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 19, library_frame: false },
  ],
  // Python — SageMaker ResourceLimitExceeded (throttle)
  python_sagemaker_throttle: (fn) => [
    {
      function: "create_processing_job",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 886,
      library_frame: true,
    },
    { function: "start_job", filename: `${fn}.py`, lineno: 38, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 15, library_frame: false },
  ],
  // Python — Redshift COPY S3ServiceException
  python_redshift: (fn) => [
    { function: "execute", filename: "psycopg2/cursor.py", lineno: 122, library_frame: true },
    { function: "fetchall", filename: "psycopg2/cursor.py", lineno: 136, library_frame: true },
    { function: "run_copy", filename: `${fn}.py`, lineno: 61, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 22, library_frame: false },
  ],
  // Java Lambda — PSQLException (RDS)
  java_rds: () => [
    {
      classname: "org.postgresql.core.v3.QueryExecutorImpl",
      function: "execute",
      filename: "QueryExecutorImpl.java",
      lineno: 342,
      library_frame: true,
    },
    {
      classname: "org.postgresql.jdbc.PgPreparedStatement",
      function: "executeUpdate",
      filename: "PgPreparedStatement.java",
      lineno: 137,
      library_frame: true,
    },
    {
      classname: "com.example.payment.PaymentRepository",
      function: "insertTransaction",
      filename: "PaymentRepository.java",
      lineno: 78,
      library_frame: false,
    },
    {
      classname: "com.example.payment.Handler",
      function: "handleRequest",
      filename: "Handler.java",
      lineno: 31,
      library_frame: false,
    },
  ],
  // Java — Glue/Spark JobRunFailedException
  java_glue: () => [
    {
      classname: "org.apache.spark.sql.execution.datasources.FileFormatWriter",
      function: "write",
      filename: "FileFormatWriter.scala",
      lineno: 203,
      library_frame: true,
    },
    {
      classname: "com.amazonaws.services.glue.GlueContext",
      function: "getSinkWithFormat",
      filename: "GlueContext.scala",
      lineno: 342,
      library_frame: true,
    },
    {
      classname: "com.example.etl.LakehouseEtlJob",
      function: "run",
      filename: "LakehouseEtlJob.scala",
      lineno: 87,
      library_frame: false,
    },
    {
      classname: "com.example.etl.Main",
      function: "main",
      filename: "Main.scala",
      lineno: 12,
      library_frame: false,
    },
  ],
  // Java — Redshift COPY via JDBC
  java_redshift: () => [
    {
      classname: "com.amazon.redshift.jdbc42.RS42PreparedStatement",
      function: "execute",
      filename: "RS42PreparedStatement.java",
      lineno: 553,
      library_frame: true,
    },
    {
      classname: "com.example.loader.RedshiftLoader",
      function: "executeCopy",
      filename: "RedshiftLoader.java",
      lineno: 92,
      library_frame: false,
    },
    {
      classname: "com.example.loader.Handler",
      function: "handleRequest",
      filename: "Handler.java",
      lineno: 28,
      library_frame: false,
    },
  ],
};

/**
 * Occasionally inflate a duration to simulate resource contention, queue wait,
 * or partition skew. ~7% of calls produce a 2.5–4× spike; the rest pass through.
 * Only applied to long-running stages (Glue, Redshift, SageMaker) — not API calls.
 */
function spike(baseUs, prob = 0.07, lo = 2.5, hi = 4.0) {
  return Math.random() < prob ? Math.round(baseUs * randFloat(lo, hi)) : baseUs;
}

/**
 * Cold start init duration by runtime. JVM classloading (java21) takes 2–8 s;
 * Python and Node cold starts are 300 ms–2.5 s and 150 ms–1.2 s respectively.
 * Only called when faas.coldstart is true (~8 % of invocations).
 */
function coldStartInitUs(runtime) {
  if (runtime === "java21") return randInt(2000, 8000) * 1000;
  if (runtime === "nodejs18.x" || runtime === "nodejs20.x") return randInt(150, 1200) * 1000;
  return randInt(300, 2500) * 1000; // Python default
}

/** Build a FaaS block for Lambda transactions. */
function faasBlock(funcName, region, accountId, trigger = "other") {
  const executionId = `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;
  const coldStart = Math.random() < 0.08;
  return {
    name: funcName,
    id: `arn:aws:lambda:${region}:${accountId}:function:${funcName}`,
    version: "$LATEST",
    coldstart: coldStart,
    execution: executionId,
    trigger: { type: trigger },
  };
}

// ─── Workflow 1: E-commerce Order Flow ───────────────────────────────────────
//
//  API Gateway (api-orders)
//    └── SPAN: Lambda invoke → order-processor
//         └── TX: order-processor (Lambda)
//              ├── SPAN: DynamoDB.PutItem
//              └── SPAN: SQS.SendMessage
//                   └── TX: notification-sender (Lambda)
//                        └── SPAN: SES.SendEmail

function workflowEcommerceOrder(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // Span / TX IDs
  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const orderProcessorTxId = newSpanId();
  const dynamoSpanId = newSpanId();
  const sqsSpanId = newSpanId();
  const notifTxId = newSpanId();
  const sesSpanId = newSpanId();

  // Durations (µs) — outer wraps inner
  const sesUs = randInt(80, 300) * 1000;
  const notifTotalUs = sesUs + randInt(20, 80) * 1000;
  const sqsUs = randInt(30, 120) * 1000;
  const dynamoUs = randInt(5, 40) * 1000;
  const orderExecUs = dynamoUs + sqsUs + notifTotalUs + randInt(50, 150) * 1000;
  const lambdaInvUs = orderExecUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  // Timestamp offsets (ms)
  const lambdaInvOffset = randInt(2, 10);
  const orderTxOffset = lambdaInvOffset + randInt(1, 5);
  const dynamoOffset = orderTxOffset + randInt(2, 8);
  const sqsOffset = dynamoOffset + dynamoUs / 1000 + randInt(1, 5);
  const notifTxOffset = sqsOffset + sqsUs / 1000 + randInt(5, 20);
  const sesOffset = notifTxOffset + randInt(2, 8);

  const cloud = cloudBlock(region, account, "apigateway");

  const docs = [];

  // 1. TX — API Gateway root
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-orders",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /orders",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes order-processor Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke order-processor",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-orders",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — order-processor Lambda (parent = invoke span)
  const orderFaas = faasBlock("order-processor", region, account.id, "other");
  const orderInitUs = orderFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, orderTxOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "order-processor",
      durationUs: orderExecUs + orderInitUs,
      isErr,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: orderFaas,
      distro: lambdaDistro,
    })
  );
  if (orderFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, orderTxOffset),
        traceId,
        txId: orderProcessorTxId,
        parentId: orderProcessorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: order-processor",
        spanAction: "init",
        durationUs: orderInitUs,
        isErr: false,
        serviceName: "order-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — DynamoDB PutItem
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: orderProcessorTxId,
      spanId: dynamoSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoUs,
      isErr: false,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — SQS SendMessage
  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: orderProcessorTxId,
      spanId: sqsSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: "SQS.SendMessage notification-queue",
      spanAction: "send",
      durationUs: sqsUs,
      isErr: false,
      destination: "sqs",
      labels: { messaging_destination: "notification-queue" },
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. TX — notification-sender Lambda (parent = SQS span, triggered by queue)
  const notifFaas = faasBlock("notification-sender", region, account.id, "pubsub");
  const notifInitUs = notifFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, notifTxOffset),
      traceId,
      txId: notifTxId,
      parentId: sqsSpanId,
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "notification-sender",
      durationUs: notifTotalUs + notifInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: notifFaas,
      labels: {
        sqs_message_id: `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`,
      },
      distro: lambdaDistro,
    })
  );
  if (notifFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, notifTxOffset),
        traceId,
        txId: notifTxId,
        parentId: notifTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: notification-sender",
        spanAction: "init",
        durationUs: notifInitUs,
        isErr: false,
        serviceName: "notification-sender",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 7. SPAN — SES SendEmail
  docs.push(
    spanDoc({
      ts: offsetTs(base, sesOffset),
      traceId,
      txId: notifTxId,
      parentId: notifTxId,
      spanId: sesSpanId,
      spanType: "messaging",
      spanSubtype: "ses",
      spanName: "SES.SendEmail",
      spanAction: "send",
      durationUs: sesUs,
      isErr: false,
      destination: "ses",
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — emitted when order-processor fails (DynamoDB throttle or timeout)
  if (isErr) {
    const useDynamoErr = Math.random() < 0.6;
    docs.push(
      errorDoc({
        ts: offsetTs(base, orderTxOffset + orderExecUs / 1000 - 2),
        traceId,
        txId: orderProcessorTxId,
        txType: "lambda",
        parentId: useDynamoErr ? dynamoSpanId : orderProcessorTxId,
        exceptionType: useDynamoErr
          ? "ProvisionedThroughputExceededException"
          : "Runtime.ExitError",
        exceptionMessage: useDynamoErr
          ? "An error occurred (ProvisionedThroughputExceededException) when calling the PutItem operation: The level of configured provisioned throughput for the table was exceeded."
          : `RequestId: ${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)} Error: Task timed out after 30.00 seconds`,
        culprit: useDynamoErr
          ? "write_record in order_processor.py"
          : "handler in order_processor.py",
        handled: false,
        frames: useDynamoErr
          ? FRAMES.python_dynamo_throttle("order_processor")
          : FRAMES.python_timeout("order_processor"),
        serviceName: "order-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 2: ML Inference Pipeline ───────────────────────────────────────
//
//  API Gateway (api-ml)
//    └── SPAN: Lambda invoke → inference-router
//         └── TX: inference-router (Lambda)
//              ├── SPAN: S3.GetObject (fetch input data)
//              ├── SPAN: Bedrock.InvokeModel (Claude)
//              └── SPAN: DynamoDB.PutItem (cache result)

function workflowMlInference(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const BEDROCK_MODELS = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
  ];

  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const routerTxId = newSpanId();
  const s3SpanId = newSpanId();
  const bedrockSpanId = newSpanId();
  const dynamoSpanId = newSpanId();

  const bedrockUs = randInt(2000, 15000) * 1000; // 2–15 s for model inference
  const s3Us = randInt(40, 200) * 1000;
  const dynamoCacheUs = randInt(8, 40) * 1000;
  const routerExecUs = s3Us + bedrockUs + dynamoCacheUs + randInt(50, 200) * 1000;
  const lambdaInvUs = routerExecUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  const lambdaInvOffset = randInt(2, 10);
  const routerTxOffset = lambdaInvOffset + randInt(1, 5);
  const s3Offset = routerTxOffset + randInt(2, 8);
  const bedrockOffset = s3Offset + s3Us / 1000 + randInt(2, 10);
  const dynamoOffset = bedrockOffset + bedrockUs / 1000 + randInt(2, 10);

  const model = rand(BEDROCK_MODELS);
  const inputTokens = randInt(128, 4096);
  const outputTokens = randInt(64, 2048);

  const docs = [];

  // 1. TX — API Gateway root
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-ml",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /inference",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes inference-router Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke inference-router",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-ml",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — inference-router Lambda
  const routerFaas = faasBlock("inference-router", region, account.id, "other");
  const routerInitUs = routerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, routerTxOffset),
      traceId,
      txId: routerTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "inference-router",
      durationUs: routerExecUs + routerInitUs,
      isErr,
      spanCount: 3,
      cloud: cloudBlock(region, account, "lambda"),
      faas: routerFaas,
      distro: lambdaDistro,
    })
  );
  if (routerFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, routerTxOffset),
        traceId,
        txId: routerTxId,
        parentId: routerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: inference-router",
        spanAction: "init",
        durationUs: routerInitUs,
        isErr: false,
        serviceName: "inference-router",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — S3 GetObject (fetch input data)
  docs.push(
    spanDoc({
      ts: offsetTs(base, s3Offset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: s3SpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.GetObject",
      spanAction: "GetObject",
      durationUs: s3Us,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-ml-input-data` },
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — Bedrock InvokeModel
  docs.push(
    spanDoc({
      ts: offsetTs(base, bedrockOffset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: bedrockSpanId,
      spanType: "gen_ai",
      spanSubtype: "bedrock",
      spanName: `Bedrock.InvokeModel ${model}`,
      spanAction: "InvokeModel",
      durationUs: bedrockUs,
      isErr: false,
      destination: "bedrock",
      labels: {
        gen_ai_request_model: model,
        gen_ai_usage_input_tokens: String(inputTokens),
        gen_ai_usage_output_tokens: String(outputTokens),
      },
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — DynamoDB PutItem (cache result)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: dynamoSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoCacheUs,
      isErr: false,
      db: { type: "nosql", statement: "PutItem inference-results-cache" },
      destination: "dynamodb",
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — Bedrock throttle (60%) or Lambda timeout (40%)
  if (isErr) {
    const useBedrockErr = Math.random() < 0.6;
    docs.push(
      errorDoc({
        ts: offsetTs(base, routerTxOffset + routerExecUs / 1000 - 2),
        traceId,
        txId: routerTxId,
        txType: "lambda",
        parentId: useBedrockErr ? bedrockSpanId : routerTxId,
        exceptionType: useBedrockErr ? "ThrottlingException" : "Runtime.ExitError",
        exceptionMessage: useBedrockErr
          ? `An error occurred (ThrottlingException) when calling the InvokeModel operation: Rate exceeded for model ${model}`
          : `RequestId: ${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)} Error: Task timed out after 30.00 seconds`,
        culprit: useBedrockErr
          ? "invoke_model in inference_router.py"
          : "handler in inference_router.py",
        handled: false,
        frames: useBedrockErr
          ? FRAMES.python_bedrock_throttle("inference_router")
          : FRAMES.python_timeout("inference_router"),
        serviceName: "inference-router",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 3: Data Ingestion Pipeline ─────────────────────────────────────
//
//  Kinesis (kinesis-stream) — producer TX
//    └── TX: stream-processor (Lambda)
//         ├── SPAN: S3.PutObject (archive raw)
//         └── SPAN: Glue.StartJobRun (trigger ETL)
//              └── TX: etl-job (Spark on EMR)
//                   ├── SPAN: Stage 0 (Read Kinesis)
//                   ├── SPAN: Stage 1 (Parse & Validate)
//                   └── SPAN: Stage 2 (Write to S3)

function workflowDataIngestion(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const STREAM_NAMES = ["clickstream-events", "order-events", "iot-telemetry", "app-logs"];
  const SHARD_IDS = ["shardId-000000000000", "shardId-000000000001", "shardId-000000000002"];
  const ETL_JOBS = ["clickstream-aggregation", "order-enrichment", "telemetry-normalisation"];

  const streamName = rand(STREAM_NAMES);
  const shardId = rand(SHARD_IDS);
  const etlJobName = rand(ETL_JOBS);
  const recordCount = randInt(100, 5000);

  // Spark stage durations (µs)
  const stage0Us = randInt(30, 90) * 1000 * 1000; // Read shard — 30–90 s
  const stage1Us = randInt(10, 40) * 1000 * 1000; // Parse & validate
  const stage2Us = randInt(15, 60) * 1000 * 1000; // Write to S3
  const emrTotalUs = stage0Us + stage1Us + stage2Us + randInt(5, 20) * 1000 * 1000;

  const glueUs = randInt(200, 800) * 1000; // Glue API call itself
  const s3PutUs = randInt(50, 200) * 1000;
  const processorExecUs = s3PutUs + glueUs + randInt(50, 150) * 1000;
  const processorTotalUs = processorExecUs + randInt(20, 80) * 1000;
  const kinesisTxUs = processorTotalUs + emrTotalUs + randInt(100, 500) * 1000;

  // IDs
  const kinesisTxId = newSpanId();
  const processorTxId = newSpanId();
  const s3SpanId = newSpanId();
  const glueSpanId = newSpanId();
  const emrTxId = newSpanId();
  const stage0SpanId = newSpanId();
  const stage1SpanId = newSpanId();
  const stage2SpanId = newSpanId();

  // Offsets (ms)
  const processorTxOffset = randInt(5, 20);
  const s3Offset = processorTxOffset + randInt(2, 8);
  const glueOffset = s3Offset + s3PutUs / 1000 + randInt(2, 8);
  const emrTxOffset = glueOffset + glueUs / 1000 + randInt(500, 2000);
  const stage0Offset = emrTxOffset + randInt(2000, 10000);
  const stage1Offset = stage0Offset + stage0Us / 1000 + randInt(500, 2000);
  const stage2Offset = stage1Offset + stage1Us / 1000 + randInt(500, 2000);

  const clusterId = `j-${randHex(13).toUpperCase()}`;
  const appId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  const docs = [];

  // 1. TX — Kinesis producer / stream consumer entry point
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: kinesisTxId,
      serviceName: "kinesis-stream",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: null,
      txType: "messaging",
      txName: "clickstream process",
      durationUs: kinesisTxUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "kinesis"),
      labels: {
        stream_name: streamName,
        shard_id: shardId,
        record_count: String(recordCount),
      },
    })
  );

  // 2. TX — stream-processor Lambda (Kinesis trigger)
  const processorFaas = faasBlock("stream-processor", region, account.id, "pubsub");
  const processorInitUs = processorFaas.coldstart ? coldStartInitUs("nodejs20.x") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, processorTxOffset),
      traceId,
      txId: processorTxId,
      parentId: kinesisTxId,
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "stream-processor",
      durationUs: processorTotalUs + processorInitUs,
      isErr,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: processorFaas,
      labels: {
        kinesis_sequence_number: `${randHex(16)}${randHex(16)}${randHex(8)}`,
        kinesis_shard_id: shardId,
      },
      distro: lambdaDistro,
    })
  );
  if (processorFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, processorTxOffset),
        traceId,
        txId: processorTxId,
        parentId: processorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: stream-processor",
        spanAction: "init",
        durationUs: processorInitUs,
        isErr: false,
        serviceName: "stream-processor",
        environment: env,
        language: "nodejs",
        runtime: "nodejs20.x",
        distro: lambdaDistro,
      })
    );
  }

  // 3. SPAN — S3 PutObject (archive raw)
  docs.push(
    spanDoc({
      ts: offsetTs(base, s3Offset),
      traceId,
      txId: processorTxId,
      parentId: processorTxId,
      spanId: s3SpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.PutObject",
      spanAction: "PutObject",
      durationUs: s3PutUs,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-raw-events-archive` },
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      distro: lambdaDistro,
    })
  );

  // 4. SPAN — Glue StartJobRun (trigger ETL)
  docs.push(
    spanDoc({
      ts: offsetTs(base, glueOffset),
      traceId,
      txId: processorTxId,
      parentId: processorTxId,
      spanId: glueSpanId,
      spanType: "external",
      spanSubtype: "glue",
      spanName: `Glue.StartJobRun ${etlJobName}`,
      spanAction: "StartJobRun",
      durationUs: glueUs,
      isErr: false,
      destination: "glue",
      labels: { glue_job_name: etlJobName },
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      distro: lambdaDistro,
    })
  );

  // 5. TX — etl-job (Spark on EMR); parent = Glue span
  const emrSvcBlock = serviceBlock("etl-job", env, "java", "Spark", "OpenJDK", "21.0.3");
  emrSvcBlock.framework = { name: "Spark", version: "3.5.1" };
  const { agent: emrAgent, telemetry: emrTelemetry } = otelBlocks("java", "elastic");

  docs.push({
    "@timestamp": offsetTs(base, emrTxOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueSpanId },
    transaction: {
      id: emrTxId,
      name: `${etlJobName} [ETL]`,
      type: "spark_job",
      duration: { us: emrTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: emrSvcBlock,
    agent: emrAgent,
    telemetry: emrTelemetry,
    cloud: cloudBlock(region, account, "emr"),
    labels: {
      emr_cluster_id: clusterId,
      spark_app_id: appId,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Spark stage spans — they belong to the emr TX
  const stages = [
    {
      id: stage0SpanId,
      offset: stage0Offset,
      us: stage0Us,
      name: "Stage 0: Read Kinesis Shard",
      type: "messaging",
      subtype: "kinesis",
      stageIdx: "0",
    },
    {
      id: stage1SpanId,
      offset: stage1Offset,
      us: stage1Us,
      name: "Stage 1: Parse & Validate Events",
      type: "compute",
      subtype: "spark",
      stageIdx: "1",
    },
    {
      id: stage2SpanId,
      offset: stage2Offset,
      us: stage2Us,
      name: "Stage 2: Write Enriched to S3",
      type: "storage",
      subtype: "s3",
      stageIdx: "2",
    },
  ];

  for (const [i, stage] of stages.entries()) {
    docs.push({
      "@timestamp": offsetTs(base, stage.offset),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: emrTxId },
      parent: { id: emrTxId },
      span: {
        id: stage.id,
        type: stage.type,
        subtype: stage.subtype,
        name: stage.name,
        duration: { us: stage.us },
        action:
          stage.type === "storage" ? "write" : stage.type === "messaging" ? "receive" : "execute",
      },
      service: emrSvcBlock,
      agent: emrAgent,
      telemetry: emrTelemetry,
      labels: {
        spark_stage_id: stage.stageIdx,
        spark_stage_attempt: "0",
        spark_input_records: String(randInt(10000, 500000)),
      },
      event: { outcome: isErr && i === stages.length - 1 ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
  }

  // Error document — Spark stage failure on the EMR job
  if (isErr) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, emrTxOffset + emrTotalUs / 1000 - 2),
        traceId,
        txId: emrTxId,
        txType: "spark_job",
        parentId: stage2SpanId,
        exceptionType: "SparkException",
        exceptionMessage: `Job aborted due to stage failure: Task ${randInt(0, 127)} in stage 2.0 failed 4 times. Most recent failure: Lost task ${randInt(0, 31)} in stage 2.0 (TID ${randInt(100, 999)}, executor ${randInt(0, 8)}): org.apache.spark.SparkException: Failed to write data to S3: Access Denied`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: "etl-job",
        environment: env,
        language: "java",
        runtime: "OpenJDK",
        distro: "elastic",
      })
    );
  }

  return docs;
}

// ─── Workflow 4: Step Functions Orchestration ─────────────────────────────────
//
//  EventBridge (eventbridge) → TX
//    └── TX: order-processing-workflow (Step Functions execution)
//         ├── SPAN: state ValidateOrder
//         │    └── TX: order-validator (Lambda)
//         │         └── SPAN: DynamoDB.GetItem
//         ├── SPAN: state ProcessPayment
//         │    └── TX: payment-processor (Lambda)
//         │         └── SPAN: PostgreSQL INSERT
//         └── SPAN: state SendConfirmation
//              └── TX: notification-sender (Lambda)
//                   └── SPAN: SES.SendEmail

function workflowStepFunctions(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // IDs
  const ebTxId = newSpanId();
  const sfnTxId = newSpanId();
  const validateStateSpanId = newSpanId();
  const validatorTxId = newSpanId();
  const dynamoGetSpanId = newSpanId();
  const paymentStateSpanId = newSpanId();
  const paymentTxId = newSpanId();
  const rdsSpanId = newSpanId();
  const confirmStateSpanId = newSpanId();
  const notifTxId = newSpanId();
  const sesSpanId = newSpanId();

  // Durations (µs) — innermost first
  const sesUs = randInt(80, 300) * 1000;
  const notifUs = sesUs + randInt(30, 100) * 1000;
  const confirmUs = notifUs + randInt(20, 60) * 1000; // state wraps Lambda

  const rdsUs = randInt(10, 80) * 1000;
  const paymentUs = rdsUs + randInt(50, 200) * 1000;
  const paymentStateUs = paymentUs + randInt(20, 60) * 1000;

  const dynamoUs = randInt(5, 30) * 1000;
  const validatorUs = dynamoUs + randInt(30, 120) * 1000;
  const validateStateUs = validatorUs + randInt(20, 60) * 1000;

  const sfnTotalUs = validateStateUs + paymentStateUs + confirmUs + randInt(200, 800) * 1000;
  const ebTotalUs = sfnTotalUs + randInt(50, 200) * 1000;

  // Offsets (ms)
  const sfnOffset = randInt(5, 20);
  const validateStateOffset = sfnOffset + randInt(10, 30);
  const validatorTxOffset = validateStateOffset + randInt(2, 8);
  const dynamoOffset = validatorTxOffset + randInt(2, 8);
  const paymentStateOffset = validateStateOffset + validateStateUs / 1000 + randInt(50, 200);
  const paymentTxOffset = paymentStateOffset + randInt(2, 8);
  const rdsOffset = paymentTxOffset + randInt(2, 8);
  const confirmStateOffset = paymentStateOffset + paymentStateUs / 1000 + randInt(50, 200);
  const notifTxOffset = confirmStateOffset + randInt(2, 8);
  const sesOffset = notifTxOffset + randInt(2, 8);

  const smName = rand(["OrderProcessingWorkflow", "CheckoutWorkflow", "FulfillmentPipeline"]);
  const smArn = `arn:aws:states:${region}:${account.id}:stateMachine:${smName}`;
  const execArn = `${smArn.replace("stateMachine", "execution")}:exec-${randHex(8)}`;

  const docs = [];

  // 1. TX — EventBridge event trigger
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: ebTxId,
      serviceName: "eventbridge",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: null,
      txType: "messaging",
      txName: "order.created process",
      durationUs: ebTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "events"),
    })
  );

  // 2. TX — Step Functions execution (parent = EB TX)
  docs.push({
    "@timestamp": offsetTs(base, sfnOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: ebTxId },
    transaction: {
      id: sfnTxId,
      name: smName,
      type: "workflow",
      duration: { us: sfnTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: serviceBlock(
      "order-processing-workflow",
      env,
      "nodejs",
      null,
      "nodejs20.x",
      "20.15.1"
    ),
    ...otelBlocks("nodejs", "aws"),
    cloud: cloudBlock(region, account, "states"),
    labels: {
      execution_arn: execArn,
      state_machine_arn: smArn,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // 3. SPAN — state: ValidateOrder
  docs.push(
    spanDoc({
      ts: offsetTs(base, validateStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: validateStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ValidateOrder",
      spanAction: "invoke",
      durationUs: validateStateUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 4. TX — order-validator Lambda (parent = ValidateOrder state span)
  const validatorFaas = faasBlock("order-validator", region, account.id, "other");
  const validatorInitUs = validatorFaas.coldstart ? coldStartInitUs("python3.11") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, validatorTxOffset),
      traceId,
      txId: validatorTxId,
      parentId: validateStateSpanId,
      serviceName: "order-validator",
      environment: env,
      language: "python",
      runtime: "python3.11",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "order-validator",
      durationUs: validatorUs + validatorInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: validatorFaas,
      distro: lambdaDistro,
    })
  );
  if (validatorFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, validatorTxOffset),
        traceId,
        txId: validatorTxId,
        parentId: validatorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: order-validator",
        spanAction: "init",
        durationUs: validatorInitUs,
        isErr: false,
        serviceName: "order-validator",
        environment: env,
        language: "python",
        runtime: "python3.11",
        distro: lambdaDistro,
      })
    );
  }

  // 5. SPAN — DynamoDB GetItem (from validator)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: validatorTxId,
      parentId: validatorTxId,
      spanId: dynamoGetSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.GetItem",
      spanAction: "GetItem",
      durationUs: dynamoUs,
      isErr: false,
      db: { type: "nosql", statement: "GetItem orders" },
      destination: "dynamodb",
      serviceName: "order-validator",
      environment: env,
      language: "python",
      runtime: "python3.11",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — state: ProcessPayment
  docs.push(
    spanDoc({
      ts: offsetTs(base, paymentStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: paymentStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ProcessPayment",
      spanAction: "invoke",
      durationUs: paymentStateUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 7. TX — payment-processor Lambda (parent = ProcessPayment state span)
  const paymentFaas = faasBlock("payment-processor", region, account.id, "other");
  const paymentInitUs = paymentFaas.coldstart ? coldStartInitUs("java21") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, paymentTxOffset),
      traceId,
      txId: paymentTxId,
      parentId: paymentStateSpanId,
      serviceName: "payment-processor",
      environment: env,
      language: "java",
      runtime: "java21",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "payment-processor",
      durationUs: paymentUs + paymentInitUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: paymentFaas,
      distro: lambdaDistro,
    })
  );
  if (paymentFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, paymentTxOffset),
        traceId,
        txId: paymentTxId,
        parentId: paymentTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: payment-processor",
        spanAction: "init",
        durationUs: paymentInitUs,
        isErr: false,
        serviceName: "payment-processor",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  // 8. SPAN — RDS INSERT (from payment processor)
  docs.push(
    spanDoc({
      ts: offsetTs(base, rdsOffset),
      traceId,
      txId: paymentTxId,
      parentId: paymentTxId,
      spanId: rdsSpanId,
      spanType: "db",
      spanSubtype: "postgresql",
      spanName: "PostgreSQL INSERT",
      spanAction: "execute",
      durationUs: rdsUs,
      isErr,
      db: {
        type: "sql",
        statement:
          "INSERT INTO payments (order_id, amount, status, created_at) VALUES ($1, $2, $3, NOW())",
      },
      destination: "postgresql",
      serviceName: "payment-processor",
      environment: env,
      language: "java",
      runtime: "java21",
      distro: lambdaDistro,
    })
  );

  // 9. SPAN — state: SendConfirmation
  docs.push(
    spanDoc({
      ts: offsetTs(base, confirmStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: confirmStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "SendConfirmation",
      spanAction: "invoke",
      durationUs: confirmUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 10. TX — notification-sender Lambda (parent = SendConfirmation state span)
  const notifFaas = faasBlock("notification-sender", region, account.id, "other");
  const notifInitUs = notifFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, notifTxOffset),
      traceId,
      txId: notifTxId,
      parentId: confirmStateSpanId,
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "notification-sender",
      durationUs: notifUs + notifInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: notifFaas,
      distro: lambdaDistro,
    })
  );
  if (notifFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, notifTxOffset),
        traceId,
        txId: notifTxId,
        parentId: notifTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: notification-sender",
        spanAction: "init",
        durationUs: notifInitUs,
        isErr: false,
        serviceName: "notification-sender",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 11. SPAN — SES SendEmail
  docs.push(
    spanDoc({
      ts: offsetTs(base, sesOffset),
      traceId,
      txId: notifTxId,
      parentId: notifTxId,
      spanId: sesSpanId,
      spanType: "messaging",
      spanSubtype: "ses",
      spanName: "SES.SendEmail",
      spanAction: "send",
      durationUs: sesUs,
      isErr: false,
      destination: "ses",
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — RDS PSQLException on payment-processor
  if (isErr) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, paymentTxOffset + paymentUs / 1000 - 2),
        traceId,
        txId: paymentTxId,
        txType: "lambda",
        parentId: rdsSpanId,
        exceptionType: "PSQLException",
        exceptionMessage: `ERROR: deadlock detected\n  Detail: Process ${randInt(10000, 99999)} waits for ShareLock on transaction ${randInt(1000, 9999)}; blocked by process ${randInt(10000, 99999)}.\n  Hint: See server log for query details.`,
        culprit: "PaymentRepository.insertTransaction in PaymentRepository.java",
        handled: false,
        frames: FRAMES.java_rds(),
        serviceName: "payment-processor",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 5: Cascading Failure ────────────────────────────────────────────
//
//  API Gateway (api-payments)                [TX — always isErr = true]
//    └── SPAN: Lambda invoke → payment-handler
//         └── TX: payment-handler (Lambda)
//              ├── SPAN: DynamoDB.GetItem     [SUCCESS]
//              ├── SPAN: DynamoDB.PutItem     [FAIL — ProvisionedThroughputExceededException]
//              ├── SPAN: DynamoDB.PutItem retry [FAIL again]
//              └── SPAN: SQS.SendMessage DLQ
//                   └── TX: dlq-processor (Lambda)
//                        └── SPAN: DynamoDB.PutItem (3rd attempt) [SUCCESS]

function workflowCascadingFailure(ts, _er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  // Root is always an error — the payment request failed from the client's perspective
  const isErr = true;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // IDs
  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const paymentHandlerTxId = newSpanId();
  const dynamoGetSpanId = newSpanId();
  const dynamoPut1SpanId = newSpanId();
  const dynamoPut2SpanId = newSpanId();
  const sqsDlqSpanId = newSpanId();
  const dlqProcessorTxId = newSpanId();
  const dynamoPut3SpanId = newSpanId();

  // Durations (µs) — throttled DynamoDB spans are slow (200–800 ms each)
  const dynamoGetUs = randInt(5, 30) * 1000;
  const dynamoPut1Us = randInt(200, 800) * 1000; // throttled — slow
  const dynamoPut2Us = randInt(200, 800) * 1000; // throttled — slow (retry)
  const sqsDlqUs = randInt(500, 2000) * 1000; // DLQ delivery delay
  const dynamoPut3Us = randInt(5, 40) * 1000; // success after backoff
  const dlqProcessorUs = dynamoPut3Us + randInt(30, 100) * 1000;
  const paymentHandlerUs =
    dynamoGetUs + dynamoPut1Us + dynamoPut2Us + sqsDlqUs + dlqProcessorUs + randInt(50, 150) * 1000;
  const lambdaInvUs = paymentHandlerUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  // Offsets (ms)
  const lambdaInvOffset = randInt(2, 10);
  const paymentTxOffset = lambdaInvOffset + randInt(1, 5);
  const dynamoGetOffset = paymentTxOffset + randInt(2, 8);
  const dynamoPut1Offset = dynamoGetOffset + dynamoGetUs / 1000 + randInt(1, 5);
  const dynamoPut2Offset = dynamoPut1Offset + dynamoPut1Us / 1000 + randInt(5, 20);
  const sqsDlqOffset = dynamoPut2Offset + dynamoPut2Us / 1000 + randInt(5, 20);
  const dlqProcessorOffset = sqsDlqOffset + sqsDlqUs / 1000 + randInt(10, 50);
  const dynamoPut3Offset = dlqProcessorOffset + randInt(2, 8);

  const throttleLabels = {
    error_code: "ProvisionedThroughputExceededException",
    error_message: "Rate exceeded for table orders",
  };

  const docs = [];

  // 1. TX — API Gateway root (always failure)
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-payments",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /payments",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes payment-handler Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke payment-handler",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-payments",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — payment-handler Lambda (parent = invoke span)
  const paymentFaas = faasBlock("payment-handler", region, account.id, "other");
  const paymentHandlerInitUs = paymentFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, paymentTxOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "payment-handler",
      durationUs: paymentHandlerUs + paymentHandlerInitUs,
      isErr: true,
      spanCount: 4,
      cloud: cloudBlock(region, account, "lambda"),
      faas: paymentFaas,
      distro: lambdaDistro,
    })
  );
  if (paymentFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, paymentTxOffset),
        traceId,
        txId: paymentHandlerTxId,
        parentId: paymentHandlerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: payment-handler",
        spanAction: "init",
        durationUs: paymentHandlerInitUs,
        isErr: false,
        serviceName: "payment-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — DynamoDB.GetItem (SUCCESS — initial read before write)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoGetOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoGetSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.GetItem",
      spanAction: "GetItem",
      durationUs: dynamoGetUs,
      isErr: false,
      db: { type: "nosql", statement: "GetItem orders" },
      destination: "dynamodb",
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — DynamoDB.PutItem attempt 1 (FAIL — throttled)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut1Offset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoPut1SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoPut1Us,
      isErr: true,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: throttleLabels,
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — DynamoDB.PutItem attempt 2 / Lambda retry (FAIL — throttled again)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut2Offset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoPut2SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem retry",
      spanAction: "PutItem",
      durationUs: dynamoPut2Us,
      isErr: true,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: { ...throttleLabels, retry_attempt: "2" },
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 7. SPAN — SQS.SendMessage to DLQ (routes message after repeated failure)
  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsDlqOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: sqsDlqSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: "SQS.SendMessage payment-dlq.fifo",
      spanAction: "send",
      durationUs: sqsDlqUs,
      isErr: false,
      destination: "sqs",
      labels: {
        queue_name: "payment-dlq.fifo",
        dlq_trigger: "true",
      },
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 8. TX — dlq-processor Lambda (parent = SQS DLQ span; processing succeeds)
  const dlqFaas = faasBlock("dlq-processor", region, account.id, "pubsub");
  const dlqProcessorInitUs = dlqFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, dlqProcessorOffset),
      traceId,
      txId: dlqProcessorTxId,
      parentId: sqsDlqSpanId,
      serviceName: "dlq-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "dlq-processor",
      durationUs: dlqProcessorUs + dlqProcessorInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: dlqFaas,
      distro: lambdaDistro,
    })
  );
  if (dlqFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqProcessorOffset),
        traceId,
        txId: dlqProcessorTxId,
        parentId: dlqProcessorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: dlq-processor",
        spanAction: "init",
        durationUs: dlqProcessorInitUs,
        isErr: false,
        serviceName: "dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 9. SPAN — DynamoDB.PutItem attempt 3 (SUCCESS after backoff)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut3Offset),
      traceId,
      txId: dlqProcessorTxId,
      parentId: dlqProcessorTxId,
      spanId: dynamoPut3SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoPut3Us,
      isErr: false,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: { retry_attempt: "3" },
      serviceName: "dlq-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — DynamoDB ProvisionedThroughputExceededException on payment-handler
  // (always errors — cascading failure scenario)
  docs.push(
    errorDoc({
      ts: offsetTs(base, paymentTxOffset + paymentHandlerUs / 1000 - 2),
      traceId,
      txId: paymentHandlerTxId,
      txType: "lambda",
      parentId: dynamoPut2SpanId,
      exceptionType: "ProvisionedThroughputExceededException",
      exceptionMessage:
        "An error occurred (ProvisionedThroughputExceededException) when calling the PutItem operation: The level of configured provisioned throughput for the table was exceeded. Consider increasing your provisioning level with the UpdateTable API.",
      culprit: "write_record in payment_handler.py",
      handled: false,
      frames: FRAMES.python_dynamo_throttle("payment_handler"),
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  return docs;
}

// ─── Workflow 6: S3 event notification → SQS → Lambda → Glue → S3 + Redshift + SageMaker
//
//  TX: pipeline-sqs-handler (Lambda) — SQS event from bucket notification
//    ├── SPAN: SQS.ReceiveMessage (landing-zone notifications queue)
//    ├── SPAN: parse S3 event notification payload
//    └── SPAN: Glue.StartJobRun
//         └── TX: lakehouse-curated-etl (Glue job — Spark)
//              ├── SPAN: read raw zone (S3)
//              ├── SPAN: transform & Iceberg commit
//              └── SPAN: write curated Parquet (S3)
//                   └── TX: warehouse-loader (Lambda) — COPY to Redshift
//                        └── SPAN: Redshift COPY
//                             └── TX: sm-pipeline-feature-prep (SageMaker Processing)

function workflowPipelineS3SqsChained(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const rawBucket = `${account.name}-landing-raw`;
  const curatedBucket = `${account.name}-curated-parquet`;
  const queueName = `s3-lake-notifications-${rand(["prod", "staging"])}`;
  const glueJobName = rand([
    "lakehouse-curated-etl",
    "bronze-to-silver-promote",
    "pipeline-merge-small-files",
  ]);
  const redshiftCluster = rand(["rs-analytics-prod", "rs-datalake-staging", "rs-unified-studio"]);
  const smProcessingJob = `sm-processing-${randHex(6)}`;

  const glueFail = Math.random() < er * 0.55;
  const redshiftFail = Math.random() < er * 0.45 && !glueFail;
  const dlqFail = Math.random() < er * 0.15 && !glueFail && !redshiftFail;
  const rootErr = glueFail || redshiftFail || dlqFail;

  const lambdaTxId = newSpanId();
  const sqsRecvSpanId = newSpanId();
  const parseEventSpanId = newSpanId();
  const glueStartSpanId = newSpanId();
  const glueJobTxId = newSpanId();
  const readRawSpanId = newSpanId();
  const transformSpanId = newSpanId();
  const writeCuratedSpanId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const whLoaderTxId = newSpanId();
  const redshiftSpanId = newSpanId();
  const smCreateSpanId = newSpanId();
  const smTxId = newSpanId();
  const smInternalSpanId = newSpanId();
  const dlqQueueName = `${queueName}-dlq`;
  const dlqRecvSpanId = newSpanId();
  const dlqProcessorTxId2 = newSpanId();
  const dlqS3LogSpanId = newSpanId();

  const lambdaInvokeUs = randInt(80, 250) * 1000; // API call only — sub-second
  const smCreateUs = randInt(100, 350) * 1000; // CreateProcessingJob API — sub-second
  // Long-running stages get realistic minute-range durations with occasional spikes
  // modelling DPU resource contention or partition skew
  const readRawUs = spike(randInt(30, 180) * 1000 * 1000); // 30s–3min
  const transformUs = spike(randInt(45, 300) * 1000 * 1000, 0.08); // 45s–5min (higher spike prob — skew-prone)
  const writeCurUs = spike(randInt(20, 120) * 1000 * 1000); // 20s–2min
  const redshiftUs = spike(randInt(15, 180) * 1000 * 1000, 0.08, 3, 6); // 15s–3min (queue-wait spikes)
  const smInternalUs = spike(randInt(60, 600) * 1000 * 1000, 0.05, 2, 3.5); // 1–10min
  const whLoaderUs = redshiftUs + smCreateUs + randInt(50, 150) * 1000;
  const glueJobUs =
    readRawUs + transformUs + writeCurUs + lambdaInvokeUs + randInt(500, 2000) * 1000;
  const glueApiUs = randInt(150, 600) * 1000;
  const parseUs = randInt(15, 80) * 1000;
  const sqsRecvUs = randInt(40, 200) * 1000;
  // Lambda exits after submitting the Glue job asynchronously — it does not wait for
  // Glue, the warehouse loader, or SageMaker. Downstream transactions carry their own
  // wall-clock offsets from the trace base timestamp.
  const lambdaTotalUs = sqsRecvUs + parseUs + glueApiUs + randInt(200, 800) * 1000;

  const dlqRecvUs = randInt(40, 150) * 1000;
  const dlqProcessUs = randInt(200, 800) * 1000;
  const dlqS3LogUs = randInt(30, 100) * 1000;
  const dlqTotalUs = dlqRecvUs + dlqProcessUs + dlqS3LogUs + randInt(50, 150) * 1000;
  // DLQ delivery happens after MaxReceiveCount × visibilityTimeout — model as ~30–90 s later
  const dlqLambdaOffset = 3 + randInt(30000, 90000);
  const dlqRecvOffset = dlqLambdaOffset + 3;
  const dlqS3LogOffset = dlqRecvOffset + dlqRecvUs / 1000 + dlqProcessUs / 1000 + 5;

  let ms = 3;
  const lambdaStartMs = ms;
  ms += 2;
  const sqsOffset = ms;
  ms += sqsRecvUs / 1000 + 2;
  const parseOffset = ms;
  ms += parseUs / 1000 + 2;
  const glueApiOffset = ms;
  ms += glueApiUs / 1000 + randInt(300, 1200);
  const glueJobStartOffset = ms;
  ms += 10;
  const readRawOffset = ms;
  ms += readRawUs / 1000 + 5;
  const transformOffset = ms;
  ms += transformUs / 1000 + 5;
  const writeCurOffset = ms;
  ms += writeCurUs / 1000 + randInt(200, 800);
  const lambdaInvokeOffset = ms;
  ms += lambdaInvokeUs / 1000 + randInt(50, 150);
  const whLoaderOffset = ms;
  ms += 15;
  const redshiftOffset = ms;
  ms += redshiftUs / 1000 + randInt(100, 400);
  const smCreateOffset = ms;
  ms += smCreateUs / 1000 + randInt(50, 150);
  const smTxOffset = ms;
  ms += 8;
  const smInternalOffset = ms;

  const pipelineHandlerFaas = faasBlock("pipeline-sqs-handler", region, account.id, "pubsub");
  const lambdaHandlerInitUs = pipelineHandlerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  const glueSvcBlock = serviceBlock(glueJobName, env, "java", "Spark", "java21", "21.0.3");
  glueSvcBlock.framework = { name: "Spark", version: "3.5.1" };
  const { agent: glueAgent, telemetry: glueTelemetry } = otelBlocks("java", "elastic");

  const loaderFaas = faasBlock("warehouse-loader", region, account.id, "other");
  // SageMaker Processing is only triggered ~40% of the time — not every ETL run produces
  // features that need refreshing, and the Glue/Redshift stages must succeed first.
  const includeSm = !glueFail && !redshiftFail && Math.random() < 0.4;
  const smSvcBlock = serviceBlock(
    "sm-pipeline-feature-prep",
    env,
    "python",
    null,
    "python3.11",
    "3.11.9"
  );
  const { agent: smAgent, telemetry: smTelemetry } = otelBlocks("python", "elastic");

  const docs = [];

  docs.push(
    txDoc({
      ts: offsetTs(base, lambdaStartMs),
      traceId,
      txId: lambdaTxId,
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "messaging",
      txName: "pipeline-sqs-handler",
      durationUs: lambdaTotalUs + lambdaHandlerInitUs,
      isErr: rootErr,
      spanCount: 3,
      cloud: cloudBlock(region, account, "lambda"),
      faas: pipelineHandlerFaas,
      labels: {
        s3_notification_prefix: "raw/",
        sqs_queue: queueName,
        landing_bucket: rawBucket,
        sqs_message_id: `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`,
      },
      distro: lambdaDistro,
    })
  );
  if (pipelineHandlerFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, lambdaStartMs),
        traceId,
        txId: lambdaTxId,
        parentId: lambdaTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: pipeline-sqs-handler",
        spanAction: "init",
        durationUs: lambdaHandlerInitUs,
        isErr: false,
        serviceName: "pipeline-sqs-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: sqsRecvSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: `SQS.ReceiveMessage ${queueName}`,
      spanAction: "receive",
      durationUs: sqsRecvUs,
      isErr: false,
      destination: "sqs",
      labels: {
        messaging_destination: queueName,
        trigger: "s3_object_created",
      },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, parseOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: parseEventSpanId,
      spanType: "app",
      spanSubtype: "internal",
      spanName: "Parse S3 event notification JSON",
      spanAction: "parse",
      durationUs: parseUs,
      isErr: false,
      labels: { s3_bucket: rawBucket, event_name: "ObjectCreated:Put" },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, glueApiOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: glueStartSpanId,
      spanType: "external",
      spanSubtype: "glue",
      spanName: `Glue.StartJobRun ${glueJobName}`,
      spanAction: "StartJobRun",
      durationUs: glueApiUs,
      isErr: false,
      destination: "glue",
      labels: { glue_job_name: glueJobName },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, glueJobStartOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueStartSpanId },
    transaction: {
      id: glueJobTxId,
      name: `${glueJobName} [Glue Spark]`,
      type: "job",
      duration: { us: glueJobUs },
      result: glueFail ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    cloud: cloudBlock(region, account, "glue"),
    labels: { glue_job_name: glueJobName, output_bucket: curatedBucket },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, readRawOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: readRawSpanId,
      type: "storage",
      subtype: "s3",
      name: "Read raw objects (landing zone)",
      duration: { us: readRawUs },
      action: "read",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { s3_bucket: rawBucket },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, transformOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: transformSpanId,
      type: "compute",
      subtype: "glue",
      name: "Transform & dedupe to curated schema",
      duration: { us: transformUs },
      action: "execute",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, writeCurOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: writeCuratedSpanId,
      type: "storage",
      subtype: "s3",
      name: "Write curated Parquet (Silver zone)",
      duration: { us: writeCurUs },
      action: "write",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { s3_bucket: curatedBucket },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Glue calls warehouse-loader via Boto3 lambda.invoke() — this is how the Glue job
  // hands off to the next stage without polling; the span represents the synchronous API
  // call only (Lambda executes independently afterwards).
  docs.push({
    "@timestamp": offsetTs(base, lambdaInvokeOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: writeCuratedSpanId },
    span: {
      id: lambdaInvokeSpanId,
      type: "external",
      subtype: "lambda",
      name: "Lambda.Invoke warehouse-loader",
      duration: { us: lambdaInvokeUs },
      action: "invoke",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { function_name: "warehouse-loader" },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  const whLoaderInitUs = loaderFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, whLoaderOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: glueFail ? glueStartSpanId : lambdaInvokeSpanId,
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "warehouse-loader",
      durationUs: whLoaderUs + whLoaderInitUs,
      isErr: redshiftFail || glueFail,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: loaderFaas,
      labels: { redshift_cluster: redshiftCluster, source_bucket: curatedBucket },
      distro: lambdaDistro,
    })
  );
  if (loaderFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, whLoaderOffset),
        traceId,
        txId: whLoaderTxId,
        parentId: whLoaderTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: warehouse-loader",
        spanAction: "init",
        durationUs: whLoaderInitUs,
        isErr: false,
        serviceName: "warehouse-loader",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, redshiftOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: whLoaderTxId,
      spanId: redshiftSpanId,
      spanType: "db",
      spanSubtype: "redshift",
      spanName: "Redshift COPY from S3 manifest",
      spanAction: "execute",
      durationUs: redshiftUs,
      isErr: redshiftFail,
      db: {
        type: "sql",
        statement: `COPY analytics.fact_events FROM 's3://${curatedBucket}/manifest.json' IAM_ROLE DEFAULT FORMAT AS PARQUET`,
      },
      destination: "redshift",
      labels: { redshift_cluster: redshiftCluster },
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // warehouse-loader calls SageMaker.CreateProcessingJob via Boto3 to kick off the
  // feature engineering job; the API call returns immediately (job runs async).
  docs.push(
    spanDoc({
      ts: offsetTs(base, smCreateOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: whLoaderTxId,
      spanId: smCreateSpanId,
      spanType: "external",
      spanSubtype: "sagemaker",
      spanName: `SageMaker.CreateProcessingJob ${smProcessingJob}`,
      spanAction: "CreateProcessingJob",
      durationUs: smCreateUs,
      isErr: false,
      destination: "sagemaker",
      labels: { processing_job: smProcessingJob },
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  if (includeSm) {
    docs.push({
      "@timestamp": offsetTs(base, smTxOffset),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: smCreateSpanId },
      transaction: {
        id: smTxId,
        name: smProcessingJob,
        type: "job",
        duration: { us: smInternalUs + randInt(50, 200) * 1000 },
        result: glueFail || redshiftFail ? "failure" : "success",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: smSvcBlock,
      agent: smAgent,
      telemetry: smTelemetry,
      cloud: cloudBlock(region, account, "sagemaker"),
      labels: {
        sagemaker_processing_job: smProcessingJob,
        unified_studio_visible: "true",
        feature_store: "pipeline-features",
      },
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });

    docs.push({
      "@timestamp": offsetTs(base, smInternalOffset),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: smTxId },
      parent: { id: smTxId },
      span: {
        id: smInternalSpanId,
        type: "ml",
        subtype: "sagemaker",
        name: "Processing — feature engineering for Unified Studio",
        duration: { us: smInternalUs },
        action: "process",
      },
      service: smSvcBlock,
      agent: smAgent,
      telemetry: smTelemetry,
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
  } // end if (includeSm)

  if (dlqFail) {
    const dlqHandlerFaas = faasBlock("pipeline-dlq-processor", region, account.id, "pubsub");
    const dlqInitUs = dlqHandlerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
    docs.push(
      txDoc({
        ts: offsetTs(base, dlqLambdaOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: lambdaTxId,
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        framework: "AWS Lambda",
        txType: "messaging",
        txName: "pipeline-dlq-processor",
        durationUs: dlqTotalUs + dlqInitUs,
        isErr: false,
        spanCount: 2,
        cloud: cloudBlock(region, account, "lambda"),
        faas: dlqHandlerFaas,
        labels: { sqs_queue: dlqQueueName, dlq_reason: "MaxReceiveCount exceeded" },
        distro: lambdaDistro,
      })
    );
    if (dlqHandlerFaas.coldstart) {
      docs.push(
        spanDoc({
          ts: offsetTs(base, dlqLambdaOffset),
          traceId,
          txId: dlqProcessorTxId2,
          parentId: dlqProcessorTxId2,
          spanId: newSpanId(),
          spanType: "app",
          spanSubtype: "cold-start",
          spanName: "Lambda init: pipeline-dlq-processor",
          spanAction: "init",
          durationUs: dlqInitUs,
          isErr: false,
          serviceName: "pipeline-dlq-processor",
          environment: env,
          language: "python",
          runtime: "python3.12",
          distro: lambdaDistro,
        })
      );
    }
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqRecvOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: dlqProcessorTxId2,
        spanId: dlqRecvSpanId,
        spanType: "messaging",
        spanSubtype: "sqs",
        spanName: `SQS.ReceiveMessage ${dlqQueueName}`,
        spanAction: "receive",
        durationUs: dlqRecvUs,
        isErr: false,
        destination: "sqs",
        labels: { messaging_destination: dlqQueueName, dlq: "true" },
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqS3LogOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: dlqProcessorTxId2,
        spanId: dlqS3LogSpanId,
        spanType: "storage",
        spanSubtype: "s3",
        spanName: `S3.PutObject dead-letter-logs/${rawBucket}`,
        spanAction: "PutObject",
        durationUs: dlqS3LogUs,
        isErr: false,
        destination: "s3",
        labels: { s3_bucket: `${account.name}-pipeline-dead-letters`, source_queue: dlqQueueName },
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // Error documents — distinct exception per failure branch
  if (glueFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, glueJobStartOffset + glueJobUs / 1000 - 2),
        traceId,
        txId: glueJobTxId,
        txType: "job",
        parentId: writeCuratedSpanId,
        exceptionType: "JobRunFailedException",
        exceptionMessage: `Job run failed: ${glueJobName}. Error: Exception in thread "main" org.apache.spark.SparkException: Job aborted due to stage failure: Task ${randInt(0, 63)} in stage 1.0 failed 4 times. Most recent failure: FetchFailed(null, shuffleId=${randInt(0, 9)}, mapIndex=${randInt(0, 31)}, mapTaskId=${randInt(100, 999)}, reduceId=${randInt(0, 15)}, message=\norg.apache.spark.shuffle.FetchFailedException: Failed to connect to host)`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: glueJobName,
        environment: env,
        language: "java",
        runtime: "java21",
        distro: "elastic",
      })
    );
  }

  if (redshiftFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, whLoaderOffset + whLoaderUs / 1000 - 2),
        traceId,
        txId: whLoaderTxId,
        txType: "lambda",
        parentId: redshiftSpanId,
        exceptionType: "S3ServiceException",
        exceptionMessage: `An error occurred (S3ServiceException) during Redshift COPY from 's3://${curatedBucket}/manifest.json': Access Denied. Check IAM role attached to the Redshift cluster has s3:GetObject on the curated bucket.`,
        culprit: "run_copy in warehouse_loader.py",
        handled: false,
        frames: FRAMES.python_redshift("warehouse_loader"),
        serviceName: "warehouse-loader",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  if (dlqFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, lambdaStartMs + lambdaTotalUs / 1000 - 2),
        traceId,
        txId: lambdaTxId,
        txType: "messaging",
        parentId: parseEventSpanId,
        exceptionType: "EventSchemaValidationError",
        exceptionMessage: `Failed to validate S3 event notification payload: missing required field 'Records[0].s3.object.key'. Raw message archived to s3://${account.name}-pipeline-dead-letters/. Queue: ${queueName}`,
        culprit: "validate_event in pipeline_handler.py",
        handled: false,
        frames: [
          {
            function: "validate_event",
            filename: "pipeline_handler.py",
            lineno: 28,
            library_frame: false,
          },
          {
            function: "handler",
            filename: "pipeline_handler.py",
            lineno: 12,
            library_frame: false,
          },
        ],
        serviceName: "pipeline-sqs-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 7: EventBridge → Step Functions — data pipeline (Glue, S3, Redshift, SageMaker)
//
//  TX: EventBridge (scheduled pipeline trigger)
//    └── TX: data-lake-pipeline-sfn (Step Functions)
//         ├── SPAN: StartGlueETL (Task)
//         │    └── TX: dw-glue-spark-job
//         │         ├── SPAN: extract
//         │         └── SPAN: load S3 curated
//         ├── SPAN: ParallelExport (parallel branch — S3 export task)
//         │    └── TX: s3-export-worker (Lambda)
//         │         └── SPAN: S3 PutObject archive
//         ├── SPAN: ParallelWarehouseLoad (parallel branch — Redshift)
//         │    └── TX: redshift-staging-loader (Lambda)
//         │         └── SPAN: Redshift COPY
//         └── SPAN: SageMakerFeaturePrep (Task)
//              └── TX: sm-unified-prep (SageMaker Processing)

function workflowPipelineSfnData(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // Distinct failure modes produce different waterfall shapes — mirroring Pipeline 1
  const glueFail = Math.random() < er * 0.5;
  const redshiftFail = Math.random() < er * 0.4 && !glueFail;
  const smThrottle = !glueFail && !redshiftFail && Math.random() < er * 0.2;
  const isErr = glueFail || redshiftFail || smThrottle;

  const smName = rand([
    "DataLakeOrchestrationPipeline",
    "LakehousePromoteWorkflow",
    "AnalyticsETLStateMachine",
  ]);
  const smArn = `arn:aws:states:${region}:${account.id}:stateMachine:${smName}`;
  const execArn = `${smArn.replace("stateMachine", "execution")}:exec-${randHex(8)}`;
  const curatedBucket = `${account.name}-orchestrated-curated`;
  const rsCluster = rand(["rs-analytics-prod", "rs-datalake-staging", "rs-unified-studio"]);

  const ebTxId = newSpanId();
  const ebSfnSpanId = newSpanId();
  const sfnTxId = newSpanId();
  const glueTaskSpanId = newSpanId();
  const glueSparkTxId = newSpanId();
  const glueExtractSpanId = newSpanId();
  const glueTransformSpanId = newSpanId();
  const glueLoadS3SpanId = newSpanId();
  const parS3StateSpanId = newSpanId();
  const s3WorkerTxId = newSpanId();
  const s3PutSpanId = newSpanId();
  const parRsStateSpanId = newSpanId();
  const rsWorkerTxId = newSpanId();
  const rsCopySpanId = newSpanId();
  const smStateSpanId = newSpanId();
  const smProcTxId = newSpanId();
  const smSpanId = newSpanId();

  const s3PutUs = randInt(40, 180) * 1000; // S3 archive write — sub-second ✓
  const s3WorkerUs = s3PutUs + randInt(30, 100) * 1000;
  const parS3Us = s3WorkerUs + randInt(20, 80) * 1000;

  const rsCopyUs = spike(randInt(15, 180) * 1000 * 1000, 0.08, 3, 6); // 15s–3min with queue-wait spikes
  const rsWorkerUs = rsCopyUs + randInt(40, 120) * 1000;
  const parRsUs = rsWorkerUs + randInt(20, 80) * 1000;

  const ebSfnUs = randInt(80, 250) * 1000; // StartExecution API — sub-second ✓
  const glueExtractUs = spike(randInt(30, 180) * 1000 * 1000); // 30s–3min
  const glueTransformUs = spike(randInt(45, 300) * 1000 * 1000, 0.08); // 45s–5min
  const glueLoadUs = spike(randInt(20, 120) * 1000 * 1000); // 20s–2min
  const glueSparkUs = glueExtractUs + glueTransformUs + glueLoadUs + randInt(500, 2000) * 1000;
  const glueTaskUs = glueSparkUs + randInt(100, 400) * 1000;

  const smInnerUs = spike(randInt(60, 600) * 1000 * 1000, 0.05, 2, 3.5); // 1–10min
  const smStateUs = smInnerUs + randInt(80, 250) * 1000;

  const parallelOverlap = Math.max(parS3Us, parRsUs);
  const sfnTotalUs = glueTaskUs + parallelOverlap + smStateUs + randInt(300, 900) * 1000;
  const ebTotalUs = sfnTotalUs + randInt(50, 200) * 1000;

  const ebSfnOffset = randInt(3, 10);
  // SFN TX starts after EB emits the StepFunctions.StartExecution span
  const sfnOffset = ebSfnOffset + ebSfnUs / 1000 + randInt(5, 20);
  const glueTaskOffset = sfnOffset + randInt(10, 25);
  const glueSparkOffset = glueTaskOffset + randInt(3, 10);
  const extractOffset = glueSparkOffset + randInt(5, 15);
  const glueTransformOffset = extractOffset + glueExtractUs / 1000 + randInt(5, 15);
  const loadS3Offset = glueTransformOffset + glueTransformUs / 1000 + randInt(10, 30);
  const parS3Offset = glueTaskOffset + glueTaskUs / 1000 + randInt(20, 80);
  const s3WorkerOffset = parS3Offset + randInt(3, 10);
  const s3PutOffset = s3WorkerOffset + randInt(3, 10);
  const parRsOffset = glueTaskOffset + glueTaskUs / 1000 + randInt(30, 90);
  const rsWorkerOffset = parRsOffset + randInt(3, 10);
  const rsCopyOffset = rsWorkerOffset + randInt(3, 10);
  const smStateOffset =
    glueTaskOffset + glueTaskUs / 1000 + parallelOverlap / 1000 + randInt(50, 150);
  const smProcOffset = smStateOffset + randInt(5, 15);
  const smInnerOffset = smProcOffset + randInt(4, 12);

  const glueSparkSvc = serviceBlock("dw-glue-spark-job", env, "java", "Spark", "java21", "21.0.3");
  glueSparkSvc.framework = { name: "Spark", version: "3.5.1" };
  const { agent: gjAgent, telemetry: gjTelemetry } = otelBlocks("java", "elastic");
  const s3wFaas = faasBlock("s3-export-worker", region, account.id, "other");
  const rswFaas = faasBlock("redshift-staging-loader", region, account.id, "other");
  const smSvc2 = serviceBlock("sm-unified-prep", env, "python", null, "python3.11", "3.11.9");
  const { agent: smA2, telemetry: smT2 } = otelBlocks("python", "elastic");

  const sfnSvc = serviceBlock(
    "data-lake-pipeline-sfn",
    env,
    "nodejs",
    null,
    "nodejs20.x",
    "20.15.1"
  );

  const docs = [];

  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: ebTxId,
      serviceName: "eventbridge",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: null,
      txType: "messaging",
      txName: "scheduled pipeline.tick",
      durationUs: ebTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "events"),
      labels: { rule_name: `pipeline-daily-${region}`, bus: "default" },
    })
  );

  // EventBridge calls StepFunctions.StartExecution as its target — the SFN TX then
  // parents to this span so the waterfall shows EB → StartExecution → SFN workflow.
  docs.push(
    spanDoc({
      ts: offsetTs(base, ebSfnOffset),
      traceId,
      txId: ebTxId,
      parentId: ebTxId,
      spanId: ebSfnSpanId,
      spanType: "external",
      spanSubtype: "stepfunctions",
      spanName: `StepFunctions.StartExecution ${smName}`,
      spanAction: "StartExecution",
      durationUs: ebSfnUs,
      isErr: false,
      destination: "states",
      labels: { state_machine_arn: smArn },
      serviceName: "eventbridge",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, sfnOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: ebSfnSpanId },
    transaction: {
      id: sfnTxId,
      name: smName,
      type: "workflow",
      duration: { us: sfnTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: sfnSvc,
    ...otelBlocks("nodejs", "elastic"),
    cloud: cloudBlock(region, account, "states"),
    labels: { execution_arn: execArn, state_machine_arn: smArn, pattern: "data_pipeline" },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push(
    spanDoc({
      ts: offsetTs(base, glueTaskOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: glueTaskSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "StartGlueETL",
      spanAction: "invoke",
      durationUs: glueTaskUs,
      isErr: false,
      destination: "states",
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, glueSparkOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueTaskSpanId },
    transaction: {
      id: glueSparkTxId,
      name: "dw-glue-spark-job [orchestrated]",
      type: "job",
      duration: { us: glueSparkUs },
      result: glueFail ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    cloud: cloudBlock(region, account, "glue"),
    labels: { glue_job_name: "dw-glue-spark-job" },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, extractOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueExtractSpanId,
      type: "storage",
      subtype: "s3",
      name: "Extract source partitions",
      duration: { us: glueExtractUs },
      action: "read",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, glueTransformOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueTransformSpanId,
      type: "compute",
      subtype: "glue",
      name: "Transform & apply business rules",
      duration: { us: glueTransformUs },
      action: "execute",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, loadS3Offset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueLoadS3SpanId,
      type: "storage",
      subtype: "s3",
      name: "Load curated tables to S3",
      duration: { us: glueLoadUs },
      action: "write",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    labels: { s3_bucket: curatedBucket },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push(
    spanDoc({
      ts: offsetTs(base, parS3Offset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: parS3StateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ParallelExportToColdArchive",
      spanAction: "invoke",
      durationUs: parS3Us,
      isErr: false,
      destination: "states",
      labels: { branch: "s3_archive" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  const s3WorkerInitUs = s3wFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, s3WorkerOffset),
      traceId,
      txId: s3WorkerTxId,
      parentId: parS3StateSpanId,
      serviceName: "s3-export-worker",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "s3-export-worker",
      durationUs: s3WorkerUs + s3WorkerInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: s3wFaas,
      distro: lambdaDistro,
    })
  );
  if (s3wFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, s3WorkerOffset),
        traceId,
        txId: s3WorkerTxId,
        parentId: s3WorkerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: s3-export-worker",
        spanAction: "init",
        durationUs: s3WorkerInitUs,
        isErr: false,
        serviceName: "s3-export-worker",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, s3PutOffset),
      traceId,
      txId: s3WorkerTxId,
      parentId: s3WorkerTxId,
      spanId: s3PutSpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.PutObject cold archive",
      spanAction: "PutObject",
      durationUs: s3PutUs,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-cold-archive` },
      serviceName: "s3-export-worker",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, parRsOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: parRsStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ParallelWarehouseLoad",
      spanAction: "invoke",
      durationUs: parRsUs,
      isErr: false,
      destination: "states",
      labels: { branch: "redshift_staging" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  const rsWorkerInitUs = rswFaas.coldstart ? coldStartInitUs("java21") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, rsWorkerOffset),
      traceId,
      txId: rsWorkerTxId,
      parentId: parRsStateSpanId,
      serviceName: "redshift-staging-loader",
      environment: env,
      language: "java",
      runtime: "java21",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "redshift-staging-loader",
      durationUs: rsWorkerUs + rsWorkerInitUs,
      isErr: redshiftFail,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: rswFaas,
      distro: lambdaDistro,
    })
  );
  if (rswFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, rsWorkerOffset),
        traceId,
        txId: rsWorkerTxId,
        parentId: rsWorkerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: redshift-staging-loader",
        spanAction: "init",
        durationUs: rsWorkerInitUs,
        isErr: false,
        serviceName: "redshift-staging-loader",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, rsCopyOffset),
      traceId,
      txId: rsWorkerTxId,
      parentId: rsWorkerTxId,
      spanId: rsCopySpanId,
      spanType: "db",
      spanSubtype: "redshift",
      spanName: "Redshift COPY staging",
      spanAction: "execute",
      durationUs: rsCopyUs,
      isErr: redshiftFail,
      db: {
        type: "sql",
        statement: `COPY staging.fact_pipeline FROM 's3://${curatedBucket}/' ...`,
      },
      destination: "redshift",
      labels: { redshift_cluster: rsCluster },
      serviceName: "redshift-staging-loader",
      environment: env,
      language: "java",
      runtime: "java21",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, smStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: smStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "SageMakerFeaturePrep",
      spanAction: "invoke",
      durationUs: smStateUs,
      isErr: false,
      destination: "states",
      labels: { target: "sagemaker:CreateProcessingJob" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, smProcOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: smStateSpanId },
    transaction: {
      id: smProcTxId,
      name: "sm-unified-prep",
      type: "job",
      duration: { us: smInnerUs + randInt(40, 150) * 1000 },
      result: smThrottle ? "failure" : "success",
      sampled: true,
      span_count: { started: 1, dropped: 0 },
    },
    service: smSvc2,
    agent: smA2,
    telemetry: smT2,
    cloud: cloudBlock(region, account, "sagemaker"),
    labels: {
      unified_studio_pipeline: "true",
      processing_job: `prep-${randHex(5)}`,
    },
    event: { outcome: smThrottle ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, smInnerOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: smProcTxId },
    parent: { id: smProcTxId },
    span: {
      id: smSpanId,
      type: "ml",
      subtype: "sagemaker",
      name: "ProcessingJob — features for Unified Studio",
      duration: { us: smInnerUs },
      action: "process",
    },
    service: smSvc2,
    agent: smA2,
    telemetry: smT2,
    event: { outcome: smThrottle ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Error documents — distinct exception per failure branch
  if (glueFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, glueSparkOffset + glueSparkUs / 1000 - 2),
        traceId,
        txId: glueSparkTxId,
        txType: "job",
        parentId: glueLoadS3SpanId,
        exceptionType: "JobRunFailedException",
        exceptionMessage: `Job run failed: dw-glue-spark-job. Error: Exception in thread "main" org.apache.spark.SparkException: Job aborted due to stage failure: Task ${randInt(0, 63)} in stage 2.0 failed 4 times. Most recent failure: FetchFailed(null, shuffleId=${randInt(0, 9)}, mapIndex=${randInt(0, 31)}, reduceId=${randInt(0, 15)})`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: "dw-glue-spark-job",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: "elastic",
      })
    );
  }

  if (redshiftFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, rsWorkerOffset + rsWorkerUs / 1000 - 2),
        traceId,
        txId: rsWorkerTxId,
        txType: "lambda",
        parentId: rsCopySpanId,
        exceptionType: "RedshiftDataException",
        exceptionMessage: `Load into table 'staging.fact_pipeline' failed. Check 'stl_load_errors' system table for details. COPY from 's3://${curatedBucket}/' aborted: ERROR: Spectrum scan error. The specified S3 prefix does not exist.`,
        culprit: "RedshiftLoader.executeCopy in RedshiftLoader.java",
        handled: false,
        frames: FRAMES.java_redshift(),
        serviceName: "redshift-staging-loader",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  if (smThrottle) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, smProcOffset + smInnerUs / 1000 - 2),
        traceId,
        txId: smProcTxId,
        txType: "job",
        parentId: smSpanId,
        exceptionType: "ResourceLimitExceeded",
        exceptionMessage: `ResourceLimitExceeded: The account-level service limit 'ml.m5.xlarge for processing job usage' is 4 Instances. Current utilization is 4 Instances. Request to increase the limit can be made to AWS through AWS Support.`,
        culprit: "start_job in sm_prep.py",
        handled: false,
        frames: FRAMES.python_sagemaker_throttle("sm_prep"),
        serviceName: "sm-unified-prep",
        environment: env,
        language: "python",
        runtime: "python3.11",
        distro: "elastic",
      })
    );
  }

  return docs;
}

// ─── Public exports ───────────────────────────────────────────────────────────

/** E-commerce Order Flow: API Gateway → Lambda → DynamoDB + SQS → Lambda → SES */
export function generateEcommerceOrderTrace(ts, er) {
  return workflowEcommerceOrder(ts, er);
}

/** ML Inference Pipeline: API Gateway → Lambda → S3 + Bedrock → DynamoDB */
export function generateMlInferenceTrace(ts, er) {
  return workflowMlInference(ts, er);
}

/** Data Ingestion Pipeline: Kinesis → Lambda → S3 + Glue → EMR Spark */
export function generateDataIngestionTrace(ts, er) {
  return workflowDataIngestion(ts, er);
}

/** Step Functions Orchestration: EventBridge → Step Functions → Lambda (×3) → DynamoDB + RDS + SES */
export function generateStepFunctionsWorkflowTrace(ts, er) {
  return workflowStepFunctions(ts, er);
}

/** Cascading Failure: API Gateway → Lambda → DynamoDB throttle → DLQ → Lambda recovery */
export function generateCascadingFailureTrace(ts, er) {
  return workflowCascadingFailure(ts, er);
}

/** S3 notification → SQS → Lambda → Glue → S3 curated + Redshift + SageMaker Processing */
export function generatePipelineS3SqsChainedTrace(ts, er) {
  return workflowPipelineS3SqsChained(ts, er);
}

/** EventBridge → Step Functions → Glue + parallel S3/Redshift + SageMaker (data lake pipeline) */
export function generatePipelineStepFunctionsOrchestratedTrace(ts, er) {
  return workflowPipelineSfnData(ts, er);
}
