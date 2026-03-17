/**
 * Serverless & core AWS log generators (Lambda, API Gateway, App Sync, App Runner, Fargate).
 * Each generator returns a single ECS-shaped document for the given timestamp and error rate.
 * @module generators/serverless
 */

import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

/**
 * Generates a synthetic AWS Lambda log event (function invocation, metrics, optional trace ID).
 * @param {string} ts - ISO timestamp for @timestamp.
 * @param {number} er - Error rate in [0,1]; influences level and error count.
 * @returns {Object} ECS-style document with cloud, aws.lambda, log, message, event.
 */
function generateLambdaLog(ts, er) {
  const fn = rand(["user-auth","payment-processor","image-resizer","notification-sender","data-pipeline","api-handler"]);
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const level = isErr ? "ERROR" : Math.random() < 0.15 ? "WARN" : Math.random() < 0.1 ? "DEBUG" : "INFO";
  const rid = randUUID();
  const dur = parseFloat(randFloat(1, 3000));
  const billedDur = Math.ceil(dur / 100) * 100;
  const memSize = rand([128,256,512,1024,2048,3008]);
  const memUsed = randInt(Math.floor(memSize*0.2), memSize);
  const invocations = randInt(1, 500);
  const errors = isErr ? randInt(1, Math.max(1, Math.floor(invocations * er))) : 0;
  const throttles = Math.random() < 0.05 ? randInt(1, 10) : 0;
  const hasMapping = Math.random() > 0.5;
  const isColdStart = Math.random() < 0.05;
  const initDur = isColdStart ? parseFloat(randFloat(50, 800)) : null;
  const MSGS = { INFO:["Request received","Processing complete","Cache hit","Event processed"],WARN:["Retry attempt 1/3","Memory usage at 80%","Slow query detected"],ERROR:["Unhandled exception","DB connection refused","Timeout after 30000ms"],DEBUG:["Entering handler","Parsed request body","Exiting with status 200"] };
  const logGroup = `/aws/lambda/${fn}`;
  const logStream = `${new Date(ts).toISOString().slice(0,10)}/[$LATEST]${randId(32).toLowerCase()}`;
  const traceId = Math.random() < 0.5 ? `1-${randId(8).toLowerCase()}-${randId(24).toLowerCase()}` : null;

  // Randomly emit one of: START, application log, END, or REPORT — matching real Lambda log patterns
  const logEventType = rand(["start","app","app","app","end","report"]);
  let message;
  if (logEventType === "start") {
    message = `START RequestId: ${rid} Version: $LATEST`;
  } else if (logEventType === "end") {
    message = `END RequestId: ${rid}`;
  } else if (logEventType === "report") {
    message = `REPORT RequestId: ${rid}\tDuration: ${dur.toFixed(2)} ms\tBilled Duration: ${billedDur} ms\tMemory Size: ${memSize} MB\tMax Memory Used: ${memUsed} MB${isColdStart ? `\tInit Duration: ${initDur.toFixed(2)} ms` : ""}`;
  } else {
    const useStructuredLogging = Math.random() < 0.6;
    message = useStructuredLogging
      ? JSON.stringify({ requestId: rid, level, message: rand(MSGS[level]), timestamp: new Date(ts).toISOString(), duration_ms: Math.round(dur), memory_used_mb: memUsed, ...(traceId ? { traceId } : {}) })
      : `[${level}]\t${rid}\t${rand(MSGS[level])}`;
  }

  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"lambda" } },
    ...(traceId ? { trace: { id: traceId } } : {}),
    "aws": {
      dimensions: { FunctionName:fn, Resource:`${fn}:$LATEST`, ExecutedVersion:"$LATEST", EventSourceMappingUUID: hasMapping ? randUUID() : null },
      lambda: {
        function: { name:fn, version:"$LATEST", arn:`arn:aws:lambda:${region}:${acct.id}:function:${fn}` },
        request_id: rid,
        trace_id: traceId,
        duration: dur,
        billed_duration_ms: logEventType === "report" ? billedDur : null,
        init_duration_ms: logEventType === "report" && isColdStart ? initDur : null,
        cold_start: logEventType === "report" ? isColdStart : null,
        memory_size_mb: memSize,
        memory_used_mb: memUsed,
        log_group: logGroup,
        log_stream: logStream,
        log_event_type: logEventType,
        metrics: {
          Invocations: { sum: invocations },
          Errors: { sum: errors },
          Throttles: { sum: throttles },
          Duration: { avg: dur, max: dur * 1.1, min: dur * 0.9 },
          ConcurrentExecutions: { avg: randInt(1, 200) },
          UnreservedConcurrentExecutions: { avg: randInt(0, 500) },
          DeadLetterErrors: { sum: Math.random() < 0.02 ? randInt(1, 5) : 0 },
          IteratorAge: { avg: hasMapping ? randInt(0, 60000) : null },
          memory_size_mb: memSize,
        }
      }
    },
    "log": { level: level.toLowerCase() },
    "message": message,
    "event": { duration: dur * 1000000, outcome: isErr ? "failure" : "success", dataset:"aws.lambda", provider:"lambda.amazonaws.com" },
    "service": { name:fn, type:"lambda" },
  };
}

/**
 * Generates a synthetic API Gateway access log event (request/response, latency, optional trace ID).
 * @param {string} ts - ISO timestamp for @timestamp.
 * @param {number} er - Error rate in [0,1]; influences HTTP status and error block.
 * @returns {Object} ECS-style document with cloud, aws.apigateway, http, url, event.
 */
function generateApiGatewayLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const method = rand(HTTP_METHODS); const path = rand(HTTP_PATHS);
  const isErr = Math.random() < er; const status = isErr ? rand([400,401,403,404,429,500,502,503]) : rand([200,200,201,204]);
  const lat = randInt(5, isErr?5000:800); const integrationLat = Math.floor(lat*0.85);
  const apiId = randId(10).toLowerCase();
  const apiName = rand(["prod-api","internal-api","partner-api","mobile-api"]);
  const stage = rand(["prod","v1","v2","staging"]);
  const count = randInt(1, 1000);
  const requestId = `${randId(8)}-${randId(4)}`.toLowerCase();
  const traceId = Math.random() < 0.5 ? `1-${randId(8).toLowerCase()}-${randId(24).toLowerCase()}` : null;
  const plainMessage = `${method} ${path} ${status} ${lat}ms`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ requestId, requestMethod: method, requestPath: path, status: status, responseLatency: lat, integrationLatency: integrationLat, timestamp: new Date(ts).toISOString(), ...(traceId ? { traceId } : {}) }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"apigateway" } },
    ...(traceId ? { trace: { id: traceId } } : {}),
    "aws": {
      dimensions: { ApiName:apiName, Stage:stage, Method:method, Resource:path },
      apigateway: {
        request_id: requestId,
        trace_id: traceId,
        api_id: apiId,
        api_name: apiName,
        stage,
        structured_logging: useStructuredLogging,
        request: { http_method: method, path, protocol: "HTTP/1.1" },
        response: { status_code: status, integration_latency_ms: integrationLat, response_latency_ms: lat },
        metrics: {
          Count: { sum: count },
          "4xx": { sum: status>=400&&status<500 ? randInt(0, Math.floor(count*0.1)) : 0 },
          "5xx": { sum: status>=500 ? randInt(0, Math.floor(count*0.05)) : 0 },
          Latency: { avg: lat, max: lat*1.5, min: lat*0.5 },
          IntegrationLatency: { avg: integrationLat, max: Math.floor(lat*1.3), min: Math.floor(lat*0.4) },
        }
      }
    },
    "http": { request:{ method, bytes:randInt(100,5000) }, response:{ status_code:status, bytes:randInt(200,10000) } },
    "url": { path, domain:`${apiId}.execute-api.${region}.amazonaws.com` },
    "client": { ip:randIp() },
    "user_agent": { original:rand(USER_AGENTS) },
    "event": { duration:lat*1000000, outcome:status>=400?"failure":"success", dataset:"aws.apigateway_logs", provider:"apigateway.amazonaws.com" },
    "message": message,
    "log": { level:status>=500?"error":status>=400?"warn":"info" },
    ...(status >= 400 ? { error: { code: status >= 500 ? "InternalServerError" : status === 429 ? "ThrottlingException" : status === 403 ? "AccessDeniedException" : status === 404 ? "NotFoundException" : "BadRequestException", message: `HTTP ${status}`, type: "server" } } : {})
  };
}

function generateAppSyncLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const api = rand(["prod-graphql-api","mobile-api","partner-api"]);
  const op = rand(["query","mutation","subscription"]);
  const resolver = rand(["getUserById","listOrders","createProduct","updateInventory","searchItems"]);
  const dur = parseFloat(randFloat(1, isErr?5000:500));
  const status = isErr ? rand([400,401,403,500]) : 200;
  const requestCount = randInt(1, 5000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"appsync"}},
    "aws":{appsync:{api_id:randId(26),api_name:api,
      operation_type:op,operation_name:resolver,
      data_source_type:rand(["AMAZON_DYNAMODB","AWS_LAMBDA","HTTP","AMAZON_ELASTICSEARCH"]),
      duration_ms:Math.round(dur),status_code:status,
      error_type:isErr?rand(["UnauthorizedException","MappingTemplate","ExecutionTimeout","DatasourceError"]):null,
      metrics:{
        RequestCount: { sum: requestCount },
        "4XXError": { sum: status>=400&&status<500 ? randInt(1, Math.floor(requestCount*0.1)) : 0 },
        "5XXError": { sum: status>=500 ? randInt(1, Math.floor(requestCount*0.05)) : 0 },
        Latency: { avg: dur, p99: dur * 2.5 },
      }}},
    "http":{response:{status_code:status}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"api",dataset:"aws.appsync",provider:"appsync.amazonaws.com"},
    "message":isErr?`AppSync ${op}.${resolver} FAILED [${status}]: ${rand(["Unauthorized","MappingTemplate error","DatasourceError"])}`:
      `AppSync ${op}.${resolver}: ${dur.toFixed(0)}ms [${api}]`,
    "log":{level:isErr?"error":dur>1000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["UnauthorizedException","MappingTemplate","ExecutionTimeout","DatasourceError"]), message: "AppSync operation failed", type: "api" } } : {})};
}

function generateAppRunnerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const svc = rand(["web-api","frontend","admin-portal","webhook-handler"]);
  const status = isErr ? rand([500,502,503,504]) : rand([200,200,201,204]);
  const dur = randInt(5, isErr?8000:500);
  const APP_RUNNER_ERROR_CODES = ["InternalServerError","BadGateway","ServiceUnavailable","GatewayTimeout"];
  const plainMessage = `${rand(HTTP_METHODS)} ${rand(HTTP_PATHS)} ${status} ${dur}ms`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ service: svc, status, latency_ms: dur, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"apprunner" } },
    "aws": {
      dimensions: { ServiceName:svc },
      apprunner: {
        service_name: svc,
        service_arn: `arn:aws:apprunner:${region}:${acct.id}:service/${svc}/${randId(32).toLowerCase()}`,
        structured_logging: useStructuredLogging,
        metrics: {
          Requests: { sum: randInt(1, 1000) },
          "2xxStatusResponses": { sum: status<300 ? randInt(1,1000) : 0 },
          "4xxStatusResponses": { sum: status>=400&&status<500 ? randInt(1,50) : 0 },
          "5xxStatusResponses": { sum: status>=500 ? randInt(1,20) : 0 },
          RequestLatency: { avg: dur, p99: dur*2 },
          ActiveInstances: { avg: randInt(1, 10) },
          CPUUtilization: { avg: parseFloat(randFloat(5, isErr?95:60)) },
          MemoryUtilization: { avg: parseFloat(randFloat(10, isErr?90:70)) },
        }
      }
    },
    "http": { request:{ method:rand(HTTP_METHODS), bytes:randInt(100,5000) }, response:{ status_code:status, bytes:randInt(200,8000) } },
    "url": { path:rand(HTTP_PATHS) },
    "client": { ip:randIp() },
    "event": { duration:dur*1000000, outcome:status>=400?"failure":"success", dataset:"aws.apprunner", provider:"apprunner.amazonaws.com" },
    "message": message,
    "log": { level:status>=500?"error":status>=400?"warn":"info" },
    ...(status >= 500 ? { error: { code: rand(APP_RUNNER_ERROR_CODES), message: `HTTP ${status}`, type: "server" } } : {})
  };
}

function generateFargateLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const task = rand(["web-frontend","api-backend","worker","data-processor","scheduler"]);
  const cluster = rand(["prod","staging","batch-workers"]);
  const clusterName = `${cluster}-cluster`;
  const taskId = randId(32).toLowerCase();
  const taskDef = `${task}:${randInt(1,50)}`;
  const MSGS = {
    error:["Task stopped with exit code 1","Container health check failed 3 times","OOMKilled: resource limits exceeded","Failed to pull image: rate limit exceeded","Task failed to reach RUNNING state"],
    warn:["CPU utilization: 87%","Memory utilization: 91%","Task approaching resource limits","Network throughput spike detected"],
    info:["Task started successfully","Container is healthy","Task registered with load balancer","Scaling event: desired 3->5","Task deregistered gracefully"],
  };
  const FARGATE_ERROR_CODES = ["TaskStopped","HealthCheckFailed","OOMKilled","ImagePullFailed","TaskStartFailed"];
  const durationSec = randInt(10, level === "error" ? 600 : 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ cluster: clusterName, taskId, taskDefinition: taskDef, container: task, level, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  const cpuPct = level==="error"?randInt(90,100):randInt(10,80);
  const memPct = level==="error"?randInt(90,100):randInt(20,75);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"fargate"}},
    "aws":{
      dimensions: { ClusterName:clusterName, TaskId:taskId, TaskDefinition:taskDef },
      fargate:{cluster_name:clusterName,task_id:taskId,
        task_definition:taskDef,
        structured_logging:useStructuredLogging,
        cpu_units:rand([256,512,1024,2048,4096]),memory_mb:rand([512,1024,2048,4096,8192]),
        platform_version:rand(["1.4.0","LATEST"]),
        cpu_utilized_percent:cpuPct,
        memory_utilized_percent:memPct,
        metrics:{
          CPUUtilization: { avg: cpuPct / 100 },
          MemoryUtilization: { avg: memPct / 100 },
          RunningTaskCount: { avg: randInt(1, 20) },
          PendingTaskCount: { avg: level==="error" ? randInt(1, 5) : 0 },
        }}},
    "container":{name:task},"log":{level},
    "event":{outcome:level==="error"?"failure":"success",category:"container",dataset:"aws.ecs_fargate",provider:"ecs.amazonaws.com",duration:durationSec*1e9},
    "message":message,
    ...(level === "error" ? { error: { code: rand(FARGATE_ERROR_CODES), message: rand(MSGS.error), type: "container" } } : {})};
}

export { generateLambdaLog, generateApiGatewayLog, generateAppSyncLog, generateAppRunnerLog, generateFargateLog };
