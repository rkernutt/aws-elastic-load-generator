import { useState, useCallback, useRef } from "react";

// ─── Helpers ───────────────────────────────────────────────────────────────
const REGIONS = ["eu-west-2","us-east-1"];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(3);
const randId = (len = 8) => Math.random().toString(36).substring(2, 2 + len).toUpperCase();
const randIp = () => `${randInt(1,254)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`;
const randTs = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
const PROTOCOLS = { 6:"TCP", 17:"UDP", 1:"ICMP" };
const HTTP_METHODS = ["GET","POST","PUT","DELETE","PATCH"];
const HTTP_PATHS = ["/api/v1/users","/api/v1/products","/api/v1/orders","/api/v1/auth/login","/api/v1/search","/health","/api/v2/events"];
const USER_AGENTS = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)","curl/7.68.0","python-requests/2.27.1","Go-http-client/1.1"];

// ─── AWS Account Pool ───────────────────────────────────────────────────────
const ACCOUNTS = [
  { id:"814726593401", name:"globex-production" },
  { id:"293847561023", name:"globex-staging" },
  { id:"738291046572", name:"globex-development" },
  { id:"501938274650", name:"globex-security-tooling" },
  { id:"164820739518", name:"globex-shared-services" },
];
const randAccount = () => rand(ACCOUNTS);
const randUUID = () => `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();

/** Recursively remove object keys whose value is null so output has no pointless null fields. */
function stripNulls(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue;
    out[k] = stripNulls(v);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 1 — SERVERLESS & CORE
// ═══════════════════════════════════════════════════════════════════════════

function generateLambdaLog(ts, er) {
  const fn = rand(["user-auth","payment-processor","image-resizer","notification-sender","data-pipeline","api-handler"]);
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "ERROR" : Math.random() < 0.15 ? "WARN" : Math.random() < 0.1 ? "DEBUG" : "INFO";
  const rid = randUUID();
  const dur = parseFloat(randFloat(1, 3000));
  const memSize = rand([128,256,512,1024,2048,3008]);
  const memUsed = randInt(Math.floor(memSize*0.2), memSize);
  const invocations = randInt(1, 500);
  const errors = level === "ERROR" ? randInt(1, Math.max(1, Math.floor(invocations * er))) : 0;
  const throttles = Math.random() < 0.05 ? randInt(1, 10) : 0;
  const hasMapping = Math.random() > 0.5;
  const MSGS = { INFO:["Request received","Processing complete","Cache hit","Event processed"],WARN:["Retry attempt 1/3","Memory usage at 80%","Slow query detected"],ERROR:["Unhandled exception","DB connection refused","Timeout after 30000ms"],DEBUG:["Entering handler","Parsed request body","Exiting with status 200"] };
  const logGroup = `/aws/lambda/${fn}`;
  const logStream = `${new Date(ts).toISOString().slice(0,10)}/[$LATEST]${randId(32).toLowerCase()}`;
  const plainMessage = `[${level}]\t${rid}\t${rand(MSGS[level])}`;
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ requestId: rid, level, message: rand(MSGS[level]), timestamp: new Date(ts).toISOString(), duration_ms: Math.round(dur), memory_used_mb: memUsed }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"lambda" } },
    "aws": {
      dimensions: { FunctionName:fn, Resource:`${fn}:$LATEST`, ExecutedVersion:"$LATEST", EventSourceMappingUUID: hasMapping ? randUUID() : null },
      lambda: {
        function: { name:fn, version:"$LATEST", arn:`arn:aws:lambda:${region}:${acct.id}:function:${fn}` },
        request_id: rid,
        duration: dur,
        memory_size_mb: memSize,
        memory_used_mb: memUsed,
        log_group: logGroup,
        log_stream: logStream,
        structured_logging: useStructuredLogging,
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
    "event": { duration: dur * 1000000, outcome: level==="ERROR" ? "failure" : "success", dataset:"aws.lambda", provider:"lambda.amazonaws.com" },
    "service": { name:fn, type:"lambda" },
  };
}

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
  const plainMessage = `${method} ${path} ${status} ${lat}ms`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ requestId, requestMethod: method, requestPath: path, status: status, responseLatency: lat, integrationLatency: integrationLat, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"apigateway" } },
    "aws": {
      dimensions: { ApiName:apiName, Stage:stage, Method:method, Resource:path },
      apigateway: {
        request_id: requestId,
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
    ...(status >= 400 ? { error: { code: status >= 500 ? "InternalServerError" : status === 429 ? "ThrottlingException" : "BadRequest", message: `HTTP ${status}`, type: "server" } } : {})
  };
}

function generateVpcFlowLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const action = Math.random() < er ? "REJECT" : "ACCEPT";
  const proto = rand([6,6,6,17,1]); const bytes = randInt(40,65535); const pkts = randInt(1,100);
  const src = randIp(); const dst = randIp(); const dstPort = rand([22,80,443,3306,5432,6379,8080,8443]);
  const vpcId = `vpc-${randId(8).toLowerCase()}`;
  const eni = `eni-${randId(8).toLowerCase()}`;
  const subnetId = `subnet-${randId(8).toLowerCase()}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"vpc" } },
    "aws": {
      dimensions: { VpcId:vpcId },
      vpcflow: {
        version: "2",
        account_id: acct.id,
        interface_id: eni,
        action,
        log_status: "OK",
        instance_id: Math.random() > 0.3 ? `i-${randId(17).toLowerCase()}` : undefined,
        pkt_srcaddr: src,
        pkt_dstaddr: dst,
        vpc_id: vpcId,
        subnet_id: subnetId,
        type: "IPv4",
      },
      vpc: {
        action, log_status:"OK",
        interface_id: eni,
        vpc_id: vpcId,
        subnet_id: subnetId,
        account_id: acct.id,
        metrics: { BytesTransferred: { sum: bytes }, PacketsTransferred: { sum: pkts } }
      }
    },
    "source": { ip:src, port:randInt(1024,65535) },
    "destination": { ip:dst, port:dstPort },
    "network": { transport:PROTOCOLS[proto]?.toLowerCase()||"tcp", bytes, packets:pkts, direction:rand(["inbound","outbound"]) },
    "event": { action:action.toLowerCase(), outcome:action==="ACCEPT"?"success":"failure", category:"network", dataset:"aws.vpcflow", provider:"ec2.amazonaws.com" },
    "message": `${action} ${PROTOCOLS[proto]||"TCP"} ${src}:${randInt(1024,65535)} -> ${dst}:${dstPort} ${bytes}B ${pkts}pkts`,
    "log": { level:action==="REJECT"?"warn":"info" },
    ...(action === "REJECT" ? { error: { code: "FlowRejected", message: "Security group or ACL rejected flow", type: "network" } } : {})
  };
}

function generateCloudTrailLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand(["alice","bob","carol","deploy-bot","ci-pipeline","admin"]);
  const ev = rand([{name:"ConsoleLogin",svc:"signin.amazonaws.com"},{name:"CreateBucket",svc:"s3.amazonaws.com"},{name:"PutObject",svc:"s3.amazonaws.com"},{name:"DescribeInstances",svc:"ec2.amazonaws.com"},{name:"CreateUser",svc:"iam.amazonaws.com"},{name:"AssumeRole",svc:"sts.amazonaws.com"},{name:"GetSecretValue",svc:"secretsmanager.amazonaws.com"},{name:"InvokeFunction",svc:"lambda.amazonaws.com"},{name:"AttachRolePolicy",svc:"iam.amazonaws.com"}]);
  const requestId = randId(8) + "-" + randId(4) + "-" + randId(4) + "-" + randId(4) + "-" + randId(12);
  const eventType = ev.name === "ConsoleLogin" ? "AwsConsoleSignIn" : "AwsApiCall";
  const readOnly = ["DescribeInstances","GetSecretValue"].includes(ev.name);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"cloudtrail" } },
    "aws": {
      dimensions: { EventName:ev.name, EventSource:ev.svc },
      cloudtrail: {
        event_version: "1.08",
        event_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        event_name: ev.name,
        event_source: ev.svc,
        event_category: ev.name === "ConsoleLogin" ? "SignIn" : "Management",
        event_type: eventType,
        request_id: requestId,
        api_version: "2012-10-17",
        management_event: true,
        read_only: readOnly,
        user_identity: { type:"IAMUser", user_name:user, account_id:acct.id },
        request_parameters: isErr ? undefined : (ev.name === "CreateBucket" ? { bucketName:`my-bucket-${randId(6).toLowerCase()}` } : ev.name === "PutObject" ? { bucketName:"prod-data", key:"uploads/file.json" } : {}),
        response_elements: isErr ? { errorCode:rand(["AccessDenied","NoSuchBucket","InvalidParameter"]) } : {},
        error_code: isErr ? rand(["AccessDenied","NoSuchBucket","InvalidParameter"]) : undefined,
        error_message: isErr ? "User is not authorized to perform this operation" : undefined,
      }
    },
    "user": { name:user },
    "source": { ip:randIp() },
    "event": { action:ev.name, outcome:isErr?"failure":"success", category:"iam", dataset:"aws.cloudtrail", provider:"cloudtrail.amazonaws.com" },
    "message": `${user} performed ${ev.name} via ${ev.svc}${isErr?" [DENIED]":""}`,
    "log": { level:isErr?"warn":"info" },
    ...(isErr ? { error: { code: rand(["AccessDenied","NoSuchBucket","InvalidParameter"]), message: "User is not authorized to perform this operation", type: "access" } } : {})
  };
}

function generateRdsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const qt = parseFloat(randFloat(0.001, isErr?30:2)); const dbUser = rand(["appuser","readonly","admin","replica"]);
  const instanceId = `prod-db-${rand(["primary","replica","analytics"])}`;
  const engine = rand(["mysql","postgres","aurora-mysql"]);
  const plainMessage = isErr ? rand(["ERROR 1045: Access denied","FATAL: role does not exist","ERROR 1213: Deadlock found"]) : `Query executed in ${qt}s by ${dbUser}`;
  const useEnhancedMonitoring = Math.random() < 0.55;
  const message = useEnhancedMonitoring ? JSON.stringify({ instanceId, engine, userId: dbUser, queryTime: qt, error: isErr ? plainMessage : null, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"rds" } },
    "aws": {
      dimensions: { DBInstanceIdentifier:instanceId, DatabaseClass:rand(["db.t3.medium","db.r5.large","db.r6g.xlarge"]), EngineName:engine },
      rds: {
        instance_id: instanceId, engine, engine_version: engine==="postgres"?"15.4":engine==="mysql"?"8.0.34":"8.0.mysql_aurora.3.04.0",
        query_time: qt,
        enhanced_monitoring: useEnhancedMonitoring,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(1, isErr?95:60)) },
          DatabaseConnections: { avg: randInt(5, isErr?500:200) },
          FreeStorageSpace: { avg: randInt(1e9, 100e9) },
          ReadIOPS: { avg: randInt(0, 3000) },
          WriteIOPS: { avg: randInt(0, 3000) },
          ReadLatency: { avg: parseFloat(randFloat(0.0001, 0.02)) },
          WriteLatency: { avg: parseFloat(randFloat(0.0001, 0.02)) },
          FreeableMemory: { avg: randInt(500e6, 8e9) },
          NetworkReceiveThroughput: { avg: randInt(1000, 10e6) },
          NetworkTransmitThroughput: { avg: randInt(1000, 10e6) },
        }
      }
    },
    "db": { user:{ name:dbUser }, name:rand(["appdb","analytics","users","events"]), statement:rand(["SELECT * FROM users WHERE","INSERT INTO orders VALUES","UPDATE products SET price","DELETE FROM sessions WHERE"])+` ${randId(6)}`, type:"sql" },
    "event": { duration:qt*1000000000, outcome:isErr?"failure":"success", dataset:"aws.rds", provider:"rds.amazonaws.com" },
    "message": message,
    "log": { level:isErr?"error":qt>5?"warn":"info" },
    ...(isErr ? { error: { code: rand(["AccessDenied","RoleNotFound","DeadlockDetected"]), message: rand(["ERROR 1045: Access denied","FATAL: role does not exist","ERROR 1213: Deadlock found"]), type: "db" } } : {})
  };
}

function generateEcsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const svc = rand(["web-frontend","api-backend","worker","scheduler","auth-service"]);
  const cluster = rand(["prod-cluster","staging","workers"]);
  const level = Math.random() < er ? "error" : Math.random() < 0.15 ? "warn" : "info";
  const MSGS = { error:["Container exited with code 1","OOMKilled","Health check failed","Failed to pull image"],warn:["High memory: 85%","Slow response","Retry 2/3","Connection pool exhausted"],info:["Task started","Health check passed","Request processed","Scaling event triggered"] };
  const ECS_ERROR_CODES = ["ContainerExitCode","OOMKilled","HealthCheckFailed","ImagePullFailed"];
  const durationSec = randInt(5, level === "error" ? 300 : 3600);
  const taskId = randId(32).toLowerCase();
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ cluster, service: svc, taskId, container: svc, level, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"ecs" } },
    "aws": {
      dimensions: { ClusterName:cluster, ServiceName:svc },
      ecs: {
        cluster: { name:cluster },
        service: { name:svc },
        task: { id:taskId, definition:`${svc}:${randInt(1,50)}` },
        structured_logging: useStructuredLogging,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(1, level==="error"?99:70)) },
          MemoryUtilization: { avg: parseFloat(randFloat(10, level==="error"?99:80)) },
          RunningTaskCount: { avg: randInt(1, 20) },
          PendingTaskCount: { avg: level==="error" ? randInt(1,5) : 0 },
          ServiceCount: { avg: 1 },
        }
      }
    },
    "container": { name:svc, image:{ name:`myrepo/${svc}:latest` } },
    "log": { level },
    "event": { outcome:level==="error"?"failure":"success", dataset:"aws.ecs", provider:"ecs.amazonaws.com", duration:durationSec * 1e9 },
    "message": message,
    "service": { name:svc, type:"ecs" },
    ...(level === "error" ? { error: { code: rand(ECS_ERROR_CODES), message: rand(MSGS.error), type: "container" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 2 — COMPUTE & CONTAINERS
// ═══════════════════════════════════════════════════════════════════════════

function generateEc2Log(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const instanceType = rand(["t3.medium","m5.xlarge","c5.2xlarge","r5.large"]);
  const MSGS = { error:["kernel: Out of memory: Killed process","sshd: error: Could not load host key","Failed to start NetworkManager","disk I/O error on /dev/xvda1"],warn:["CPU steal time above threshold: 23%","High disk utilization: 88% full","Memory available below 512MB","SSH login from unknown IP"],info:["sshd: Accepted publickey for ec2-user","systemd: Started Amazon SSM Agent","cloud-init: modules done","awslogs: Starting daemon"] };
  const EC2_ERROR_CODES = ["StatusCheckFailed","StatusCheckFailed_Instance","InstanceReboot","SystemFailure"];
  const durationSec = randInt(60, 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ instanceId, instanceType, level, message: plainMessage, timestamp: new Date(ts).toISOString(), component: rand(["syslog","cloud-init","sshd","awslogs"]) }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"ec2" }, instance:{ id:instanceId } },
    "aws": {
      dimensions: { InstanceId:instanceId, InstanceType:instanceType, ImageId:`ami-${randId(8).toLowerCase()}`, AutoScalingGroupName:rand(["web-asg","api-asg","worker-asg",null]) },
      ec2: {
        instance_id: instanceId, instance_type: instanceType, ami_id:`ami-${randId(8).toLowerCase()}`,
        structured_logging: useStructuredLogging,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(1, level==="error"?99:70)) },
          NetworkIn: { sum: randInt(1e6, 500e6) },
          NetworkOut: { sum: randInt(1e6, 500e6) },
          DiskReadBytes: { sum: randInt(0, 100e6) },
          DiskWriteBytes: { sum: randInt(0, 100e6) },
          DiskReadOps: { sum: randInt(0, 10000) },
          DiskWriteOps: { sum: randInt(0, 10000) },
          StatusCheckFailed: { max: level==="error" ? 1 : 0 },
          StatusCheckFailed_Instance: { max: level==="error" ? 1 : 0 },
          StatusCheckFailed_System: { max: 0 },
          CPUCreditBalance: { avg: randInt(0, 500) },
          CPUCreditUsage: { avg: parseFloat(randFloat(0, 10)) },
        }
      }
    },
    "host": { hostname:`ip-${randIp().replace(/\./g,"-")}`, os:{ type:"linux" } },
    "log": { level },
    "event": { category:"host", outcome:level==="error"?"failure":"success", dataset:"aws.ec2", provider:"ec2.amazonaws.com", duration:durationSec * 1e9 },
    "message": message,
    ...(level === "error" ? { error: { code: rand(EC2_ERROR_CODES), message: rand(MSGS.error), type: "host" } } : {})
  };
}

function generateEksLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const ns = rand(["default","kube-system","monitoring","ingress-nginx","app-prod"]); const pod = `${rand(["web","api","worker","cache"])}-${randId(5).toLowerCase()}-${randId(5).toLowerCase()}`;
  const clusterName = `prod-cluster-${region}`;
  const MSGS = { error:["OOMKilled: container exceeded memory limit","CrashLoopBackOff: back-off restarting failed container","ImagePullBackOff: failed to pull image","Liveness probe failed","FailedScheduling: 0/12 nodes available"],warn:["PodDisruptionBudget violations detected","Node memory pressure detected","Evicted pod due to disk pressure","HPA scaling event: replicas 3->8"],info:["Pod scheduled on node","Container started","Endpoint slice updated","Deployment rollout complete","Service endpoint added"] };
  const EKS_ERROR_CODES = ["OOMKilled","CrashLoopBackOff","ImagePullBackOff","LivenessProbeFailed","FailedScheduling"];
  const durationSec = randInt(1, level === "error" ? 300 : 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ cluster: clusterName, namespace: ns, pod, level, message: plainMessage, timestamp: new Date(ts).toISOString(), stream: rand(["stdout","stderr"]) }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"eks" } },
    "aws": {
      dimensions: { ClusterName:clusterName, NodeName:`ip-${randIp().replace(/\./g,"-")}.${region}.compute.internal` },
      eks: {
        structured_logging: useStructuredLogging,
        cluster: { name:clusterName },
        node: { name:`ip-${randIp().replace(/\./g,"-")}.${region}.compute.internal` },
        metrics: {
          cluster_failed_node_count: { avg: level==="error" ? randInt(1,3) : 0 },
          node_cpu_utilization: { avg: parseFloat(randFloat(5, level==="error"?95:70)) },
          node_memory_utilization: { avg: parseFloat(randFloat(10, level==="error"?99:80)) },
          pod_cpu_utilization: { avg: parseFloat(randFloat(1, 90)) },
          pod_memory_utilization: { avg: parseFloat(randFloat(5, 95)) },
          node_network_total_bytes: { sum: randInt(1e6, 500e6) },
          pod_count: { avg: randInt(1, 50) },
        }
      }
    },
    "kubernetes": { namespace:ns, pod:{ name:pod }, container:{ name:pod.split("-")[0] }, labels:{ app:pod.split("-")[0], env:"prod" } },
    "log": { level },
    "event": { outcome:level==="error"?"failure":"success", category:"container", dataset:"aws.eks", provider:"eks.amazonaws.com", duration:durationSec * 1e9 },
    "message": message,
    ...(level === "error" ? { error: { code: rand(EKS_ERROR_CODES), message: rand(MSGS.error), type: "container" } } : {})
  };
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

function generateBatchLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const jobName = rand(["nightly-etl","report-generation","data-export","ml-training-prep","cleanup-job"]);
  const jobQueue = `${jobName}-queue`;
  const jobId = `${randId(8)}-${randId(4)}`.toLowerCase();
  const MSGS = { error:["Job failed with exit code 1","Container instance terminated unexpectedly","Job queue capacity exceeded","IAM role permission denied","Spot instance reclaimed during execution"],warn:["Job retry attempt 2/3","vCPU limit approaching: 980/1000","Job timeout warning: 80% elapsed"],info:["Job submitted to queue","Container started on ECS instance","Job completed successfully","Job definition registered"] };
  const BATCH_ERROR_CODES = ["JobFailed","ContainerTerminated","CapacityExceeded","PermissionDenied","SpotReclaimed"];
  const durationSec = randInt(10, level === "error" ? 7200 : 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ jobId, jobName, jobQueue, level, message: plainMessage, timestamp: new Date(ts).toISOString(), arrayIndex: randInt(0, 99) }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"batch" } },
    "aws": {
      dimensions: { JobQueueName:jobQueue, JobDefinition:jobName },
      batch: {
        job: { name:jobName, id:jobId, status:level==="error"?"FAILED":"SUCCEEDED" },
        job_queue: jobQueue,
        compute_environment: `ce-${rand(["spot","ondemand"])}`,
        structured_logging: useStructuredLogging,
        metrics: {
          PendingJobCount: { avg: randInt(0, 50) },
          RunnableJobCount: { avg: randInt(0, 20) },
          RunningJobCount: { avg: randInt(0, 100) },
          SucceededJobCount: { sum: level==="error" ? 0 : randInt(1, 50) },
          FailedJobCount: { sum: level==="error" ? randInt(1, 5) : 0 },
        }
      }
    },
    "log": { level },
    "event": { outcome:level==="error"?"failure":"success", category:"process", dataset:"aws.batch", provider:"batch.amazonaws.com", duration:durationSec * 1e9 },
    "message": message,
    ...(level === "error" ? { error: { code: rand(BATCH_ERROR_CODES), message: rand(MSGS.error), type: "process" } } : {})
  };
}

function generateBeanstalkLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["my-web-app","admin-portal","api-service","worker-app"]);
  const env = `${app}-${rand(["production","staging","dev"])}`;
  const status = isErr ? rand([500,502,503]) : rand([200,200,201,204,301]);
  const MSGS = { error:["ERROR: Failed to deploy application version","ENV_ERROR: Deployment failed, rolling back","Application version rejected: validation failed"],warn:["WARN: Enhanced health reporting: Warning","CPU utilization above 75%","Response time above 3s threshold"],info:["Deployment completed successfully","Environment health: OK","Auto Scaling event: +2 instances","Rolling update complete"] };
  const BEANSTALK_ERROR_CODES = ["DeploymentFailed","Rollback","ValidationFailed"];
  const durationSec = randInt(5, isErr ? 600 : 120);
  const plainMessage = rand(isErr?MSGS.error:status>=400?MSGS.warn:MSGS.info);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ application: app, environment: env, status, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"elasticbeanstalk" } },
    "aws": {
      dimensions: { EnvironmentName:env },
      elasticbeanstalk: {
        application: app, environment: env,
        structured_logging: useStructuredLogging,
        platform: rand(["Node.js 18","Python 3.11","Docker"]),
        version_label: `v${randInt(1,200)}`,
        metrics: {
          EnvironmentHealth: { avg: isErr ? rand([15,20,25]) : rand([0,5,10]) }, // 0=Green,5=Yellow,10=Red,15=Grey,20=NoData,25=Unknown
          ApplicationRequests5xx: { sum: status>=500 ? randInt(1,100) : 0 },
          ApplicationRequests4xx: { sum: status>=400&&status<500 ? randInt(1,200) : 0 },
          ApplicationRequests2xx: { sum: status<300 ? randInt(100,1000) : 0 },
          ApplicationLatencyP99: { avg: randInt(50, isErr?5000:1000) },
          ApplicationLatencyP90: { avg: randInt(20, isErr?3000:500) },
          InstancesOk: { avg: isErr ? 0 : randInt(1, 10) },
          InstancesDegraded: { avg: isErr ? randInt(1,3) : 0 },
        }
      }
    },
    "http": { response:{ status_code:status } },
    "log": { level:isErr?"error":"info" },
    "event": { outcome:isErr?"failure":"success", dataset:"aws.elasticbeanstalk", provider:"elasticbeanstalk.amazonaws.com", duration:durationSec * 1e9 },
    "message": message,
    ...(isErr ? { error: { code: rand(BEANSTALK_ERROR_CODES), message: rand(MSGS.error), type: "application" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 3 — NETWORKING & CDN
// ═══════════════════════════════════════════════════════════════════════════

function generateAlbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const method = rand(HTTP_METHODS); const path = rand(HTTP_PATHS);
  const isErr = Math.random() < er; const status = isErr ? rand([400,403,404,500,502,503,504]) : rand([200,200,200,201,204,301]);
  const reqProc = parseFloat(randFloat(0.001, isErr?2:0.5));
  const backendProc = parseFloat(randFloat(0.01, isErr?30:2));
  const respProc = parseFloat(randFloat(0.001, 0.1));
  const lbName = `app/prod-alb-${region}/${randId(16).toLowerCase()}`;
  const tgArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:targetgroup/tg-${rand(["web","api","admin"])}/${randId(16).toLowerCase()}`;
  const az = `${region}${rand(["a","b","c"])}`;
  const backendIp = randIp();
  const backendPort = randInt(3000, 9000);
  const targetStatusCode = status;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"alb" } },
    "aws": {
      dimensions: { LoadBalancer:lbName, TargetGroup:tgArn.replace(/.*targetgroup\//,"targetgroup/"), AvailabilityZone:az },
      elb: {
        name: lbName,
        type: "application",
        "target_group.arn": tgArn,
        listener: `arn:aws:elasticloadbalancing:${region}:${acct.id}:listener/app/prod-alb/${randId(16).toLowerCase()}/${randId(16).toLowerCase()}`,
        protocol: "HTTPS",
        "request_processing_time.sec": reqProc,
        "backend_processing_time.sec": backendProc,
        "response_processing_time.sec": respProc,
        "backend.ip": backendIp,
        "backend.port": String(backendPort),
        "backend.http.response.status_code": targetStatusCode,
        ssl_protocol: "TLSv1.3",
        ssl_cipher: "ECDHE-RSA-AES128-GCM-SHA256",
        trace_id: `Root=1-${randId(8)}-${randId(24)}`,
        target_port: `${backendIp}:${backendPort}`,
        target_status_code: String(targetStatusCode),
        "error.reason": isErr && status >= 500 ? "TargetResponseError" : undefined,
      },
      alb: {
        load_balancer: lbName,
        target_group: tgArn,
        request_processing_time: reqProc,
        ssl_protocol: "TLSv1.3",
        metrics: {
          ActiveConnectionCount: { sum: randInt(10, 5000) },
          NewConnectionCount: { sum: randInt(1, 500) },
          RequestCount: { sum: randInt(1, 10000) },
          HTTPCode_Target_2XX_Count: { sum: status<300 ? randInt(100,10000) : 0 },
          HTTPCode_Target_4XX_Count: { sum: status>=400&&status<500 ? randInt(1,500) : 0 },
          HTTPCode_Target_5XX_Count: { sum: status>=500 ? randInt(1,100) : 0 },
          HTTPCode_ELB_5XX_Count: { sum: status>=500 ? randInt(0,20) : 0 },
          TargetResponseTime: { avg: backendProc, p99: backendProc*3 },
          HealthyHostCount: { avg: randInt(2, 20) },
          UnHealthyHostCount: { avg: isErr ? randInt(1,3) : 0 },
          RejectedConnectionCount: { sum: randInt(0, 10) },
          ProcessedBytes: { sum: randInt(1e6, 1e9) },
        }
      }
    },
    "http": { request:{ method, bytes:randInt(200,8000) }, response:{ status_code:status, bytes:randInt(500,50000) } },
    "url": { path, domain:"api.example.com" },
    "client": { ip:randIp(), port:randInt(1024,65535) },
    "user_agent": { original:rand(USER_AGENTS) },
    "event": { duration:(reqProc+backendProc+respProc)*1e9, outcome:status>=400?"failure":"success", dataset:"aws.elb_logs", provider:"elasticloadbalancing.amazonaws.com" },
    "message": `${method} ${path} ${status} ${((reqProc+backendProc+respProc)*1000).toFixed(0)}ms`,
    "log": { level:status>=500?"error":status>=400?"warn":"info" },
    ...(status >= 400 ? { error: { code: status >= 500 ? "TargetResponseError" : "ClientError", message: `HTTP ${status}`, type: "server" } } : {})
  };
}

function generateCloudFrontLog(ts, er) {
  const acct = randAccount();
  const isErr = Math.random() < er; const status = isErr ? rand([400,403,404,500,503]) : rand([200,200,200,304,301]);
  const edges = ["LHR","IAD","SFO","SIN","FRA","SYD","NRT","GRU"]; const edge = rand(edges);
  const paths = ["/index.html","/assets/app.js","/assets/style.css","/images/hero.webp","/fonts/inter.woff2"];
  const path = rand(paths);
  const distId = `E${randId(13)}`;
  const requests = randInt(100, 100000);
  const edgeRequestId = randId(24);
  const timeTaken = parseFloat(randFloat(0.001, isErr?5:0.5));
  const bytes = randInt(500, 500000);
  const clientIp = randIp();
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region:"us-east-1", account:{ id:acct.id, name:acct.name }, service:{ name:"cloudfront" } },
    "aws": {
      dimensions: { DistributionId:distId, Region:"Global" },
      cloudfront_logs: {
        x_edge_location: edge,
        sc_bytes: bytes,
        c_ip: clientIp,
        cs_method: "GET",
        cs_uri_stem: path,
        sc_status: String(status),
        x_edge_request_id: edgeRequestId,
        time_taken: timeTaken.toFixed(3),
        x_edge_result_type: isErr ? "Error" : rand(["Hit","Miss","RefreshHit"]),
        x_edge_response_result_type: isErr ? "Error" : "Hit",
      },
      cloudfront: {
        distribution_id: distId,
        edge_location: edge,
        result_type: isErr?"Error":rand(["Hit","Miss","Hit","RefreshHit"]),
        edge_request_id: edgeRequestId,
        time_to_first_byte: timeTaken,
        metrics: {
          Requests: { sum: requests },
          BytesDownloaded: { sum: randInt(1e6, 10e9) },
          BytesUploaded: { sum: randInt(0, 1e6) },
          "4xxErrorRate": { avg: isErr&&status<500 ? parseFloat(randFloat(0.5,10)) : parseFloat(randFloat(0,0.5)) },
          "5xxErrorRate": { avg: isErr&&status>=500 ? parseFloat(randFloat(0.1,5)) : 0 },
          TotalErrorRate: { avg: isErr ? parseFloat(randFloat(1,15)) : parseFloat(randFloat(0,1)) },
          CacheHitRate: { avg: isErr ? parseFloat(randFloat(0,40)) : parseFloat(randFloat(50,95)) },
          OriginLatency: { avg: randInt(10, isErr?2000:200) },
        }
      }
    },
    "http": { request:{ method:"GET", bytes:randInt(0,1000) }, response:{ status_code:status, bytes } },
    "url": { path, domain:`d${randId(12).toLowerCase()}.cloudfront.net` },
    "client": { ip:clientIp },
    "event": { outcome:status>=400?"failure":"success", category:"web", dataset:"aws.cloudfront_logs", provider:"cloudfront.amazonaws.com", duration:Math.round(timeTaken * 1e9) },
    "message": `GET ${path} ${status} [${edge}]`,
    "log": { level:status>=500?"error":status>=400?"warn":"info" },
    ...(status >= 400 ? { error: { code: status >= 500 ? "OriginError" : "ClientError", message: `HTTP ${status}`, type: "server" } } : {})
  };
}

function generateWafLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isBlock = Math.random() < (er + 0.2);
  const rules = ["AWSManagedRulesSQLiRuleSet","AWSManagedRulesCommonRuleSet","AWSManagedRulesKnownBadInputsRuleSet","RateLimitRule","GeoBlockRule"];
  const rule = rand(rules); const webAclName = rand(["prod-waf","api-waf","admin-waf"]);
  const webAclId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const uri = rand(HTTP_PATHS);
  const clientIp = randIp();
  const ua = rand(USER_AGENTS);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"waf" } },
    "aws": {
      dimensions: { WebACL:webAclName, Rule:rule, Region:region },
      waf: {
        web_acl_id: webAclId,
        web_acl_name: webAclName,
        terminating_rule_id: rule,
        rule_group_list: [{ rule_group_id: rule, terminating_rule: rule, rule_group_override_action: "NONE", excluded_rules: [] }],
        action: isBlock?"BLOCK":"ALLOW",
        http_request: { client_ip: clientIp, country: rand(["GB","US","DE","IE"]), uri, uri_query: "", method: rand(HTTP_METHODS), headers: [{ name: "User-Agent", value: ua }] },
        http_source_name: "ALB",
        metrics: {
          AllowedRequests: { sum: isBlock ? 0 : randInt(100,10000) },
          BlockedRequests: { sum: isBlock ? randInt(1,500) : 0 },
          CountedRequests: { sum: randInt(0,100) },
          PassedRequests: { sum: isBlock ? 0 : randInt(100,10000) },
        }
      }
    },
    "http": { request:{ method:rand(HTTP_METHODS), bytes:randInt(100,10000) }, uri },
    "client": { ip:clientIp },
    "user_agent": { original:ua },
    "event": { action:isBlock?"block":"allow", outcome:isBlock?"failure":"success", category:"intrusion_detection", dataset:"aws.waf", provider:"wafv2.amazonaws.com" },
    "message": `WAF ${isBlock?"BLOCKED":"ALLOWED"} request - Rule: ${rule}`,
    "log": { level:isBlock?"warn":"info" },
    ...(isBlock ? { error: { code: "WAFBlock", message: `Request blocked by rule: ${rule}`, type: "security" } } : {})
  };
}

function generateRoute53Log(ts, er) {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domains = ["api.example.com","www.example.com","mail.example.com","app.internal","db.internal"];
  const types = ["A","AAAA","CNAME","MX","TXT"]; const rcode = isErr ? rand(["NXDOMAIN","SERVFAIL","REFUSED"]) : "NOERROR";
  const hostedZoneId = `Z${randId(21)}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region:"us-east-1", account:{ id:acct.id, name:acct.name }, service:{ name:"route53" } },
    "aws": {
      dimensions: { HostedZoneId:hostedZoneId },
      route53: {
        query_name: rand(domains), query_type: rand(types), response_code: rcode,
        edge_location: `${rand(["IAD","LHR","SFO"])}${randInt(50,99)}`,
        hosted_zone_id: hostedZoneId,
        metrics: {
          DNSQueries: { sum: randInt(1, 100000) },
          HealthCheckStatus: { avg: isErr ? 0 : 1 },
          HealthCheckPercentageHealthy: { avg: isErr ? randInt(0,80) : randInt(95,100) },
          ConnectionTime: { avg: randInt(1, isErr?500:50) },
          TimeToFirstByte: { avg: randInt(1, isErr?1000:100) },
        }
      }
    },
    "dns": { question:{ name:rand(domains), type:rand(types) }, response_code:rcode },
    "client": { ip:randIp() },
    "event": { outcome:isErr?"failure":"success", category:"network", dataset:"aws.route53", provider:"route53.amazonaws.com", duration:randInt(1, isErr ? 500 : 50) * 1e6 },
    "message": `DNS ${rand(types)} query for ${rand(domains)} -> ${rcode}`,
    "log": { level:isErr?"warn":"info" },
    ...(isErr ? { error: { code: rcode, message: `DNS query failed: ${rcode}`, type: "network" } } : {})
  };
}

function generateNetworkFirewallLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const action = Math.random() < (er + 0.15) ? "DROP" : "PASS"; const proto = rand([6,17,1]);
  const fwName = `fw-${region}`;
  const az = `${region}${rand(["a","b","c"])}`;
  const srcIp = randIp(); const dstIp = randIp();
  const srcPort = randInt(1024, 65535); const dstPort = rand([80,443,22,3306,5432]);
  const flowId = randInt(100000, 999999);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"network-firewall" } },
    "aws": {
      dimensions: { FirewallName:fwName, AvailabilityZone:az },
      firewall_logs: {
        flow_id: flowId,
        event_timestamp: ts,
        action,
        src_ip: srcIp,
        dest_ip: dstIp,
        src_port: srcPort,
        dest_port: dstPort,
        protocol: PROTOCOLS[proto] || "TCP",
        firewall_name: fwName,
        availability_zone: az,
      },
      network_firewall: {
        firewall_name: fwName,
        availability_zone: az,
        policy_name: "prod-fw-policy",
        metrics: {
          DroppedPackets: { sum: action==="DROP" ? randInt(1,1000) : 0 },
          PassedPackets: { sum: action==="PASS" ? randInt(1000,100000) : 0 },
          RejectedPackets: { sum: 0 },
          Packets: { sum: randInt(1000, 100000) },
        }
      }
    },
    "source": { ip:srcIp, port:srcPort },
    "destination": { ip:dstIp, port:dstPort },
    "network": { transport:PROTOCOLS[proto]?.toLowerCase()||"tcp", bytes:randInt(64,65535), packets:randInt(1,50) },
    "event": { action:action.toLowerCase(), outcome:action==="PASS"?"success":"failure", category:"network", dataset:"aws.firewall_logs", provider:"network-firewall.amazonaws.com" },
    "message": `${action} ${PROTOCOLS[proto]||"TCP"} flow`,
    "log": { level:action==="DROP"?"warn":"info" },
    ...(action === "DROP" ? { error: { code: "FlowDropped", message: "Packet dropped by firewall rule", type: "network" } } : {})
  };
}

function generateShieldLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isAttack = Math.random() < (er + 0.1);
  const vectors = ["SYN_FLOOD","UDP_REFLECTION","HTTP_FLOOD","DNS_AMPLIFICATION","VOLUMETRIC"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"shield" } },
    "aws": {
      dimensions: { AttackVector: isAttack ? rand(vectors) : "NONE" },
      shield: {
        attack_id: isAttack ? `${randId(8)}-${randId(4)}`.toLowerCase() : null,
        attack_vector: isAttack ? rand(vectors) : null,
        mitigation_started: isAttack,
        subscription_type: "ADVANCED",
        protected_resource: `arn:aws:elasticloadbalancing:${region}:${acct.id}:loadbalancer/app/prod/${randId(16).toLowerCase()}`,
        metrics: {
          DDoSAttackBitsPerSecond: { avg: isAttack ? randInt(1e9,100e9) : 0 },
          DDoSAttackPacketsPerSecond: { avg: isAttack ? randInt(1e6,100e6) : 0 },
          DDoSAttackRequestsPerSecond: { avg: isAttack ? randInt(1e4,1e6) : 0 },
        }
      }
    },
    "network": { bytes:randInt(1e6,1e9), packets:randInt(1000,1000000) },
    "event": { action:isAttack?"ddos_detected":"health_check", outcome:isAttack?"failure":"success", category:"network", dataset:"aws.shield", provider:"shield.amazonaws.com" },
    "message": isAttack ? `DDoS attack detected: ${rand(vectors)} at ${randFloat(1,120)}Gbps - mitigation active` : `Shield health check: protected resource OK`,
    "log": { level:isAttack?"warn":"info" },
    ...(isAttack ? { error: { code: "DDoSAttack", message: `Attack vector: ${rand(vectors)} - mitigation active`, type: "network" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 4 — SECURITY & COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════

function generateGuardDutyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.3);
  const findingTypes = ["UnauthorizedAccess:EC2/SSHBruteForce","Recon:EC2/PortProbeUnprotectedPort","Trojan:EC2/DropPoint","CryptoCurrency:EC2/BitcoinTool.B!DNS","UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B","Stealth:IAMUser/CloudTrailLoggingDisabled","Exfiltration:S3/ObjectRead.Unusual","Policy:S3/BucketPublicAccessGranted","CredentialAccess:IAMUser/AnomalousBehavior"];
  const ft = rand(findingTypes); const sev = isFinding ? rand([2,5,7,8,9]) : 0;
  const findingId = randId(32).toLowerCase();
  const detectorId = randId(32).toLowerCase();
  const instanceId = `i-${randId(17).toLowerCase()}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"guardduty" } },
    "aws": {
      dimensions: { DetectorId:detectorId },
      guardduty: {
        schema_version: "2.0",
        account_id: acct.id,
        region,
        partition: "aws",
        id: findingId,
        arn: `arn:aws:guardduty:${region}:${acct.id}:detector/${detectorId}/finding/${findingId}`,
        type: ft,
        title: ft.replace(/^[^:]+:/,"").replace(/[/.]/g," "),
        description: isFinding ? `GuardDuty detected suspicious activity: ${ft}` : "Routine check completed.",
        created_at: ts,
        updated_at: ts,
        severity: sev,
        confidence: parseFloat(randFloat(60,99)),
        finding_id: findingId,
        finding_type: ft,
        detector_id: detectorId,
        resource_type: rand(["Instance","AccessKey","S3Bucket","EKSCluster"]),
        action_type: rand(["NETWORK_CONNECTION","PORT_PROBE","DNS_REQUEST","AWS_API_CALL"]),
        count: randInt(1,500),
        resource: isFinding ? {
          instance_details: {
            availability_zone: `${region}${rand(["a","b","c"])}`,
            instance: { id:instanceId, type:rand(["t3.medium","m5.large"]), state:"running" },
            image: { id:`ami-${randId(8).toLowerCase()}`, description:"Amazon Linux 2" },
            network_interfaces: [{ network_interface_id:`eni-${randId(8).toLowerCase()}`, private_ip_address:randIp(), subnet_id:`subnet-${randId(8).toLowerCase()}`, vpc_id:`vpc-${randId(8).toLowerCase()}`, security_groups:[{ group_id:`sg-${randId(8).toLowerCase()}`, group_name:"default" }] }],
          }
        } : undefined,
        service: isFinding ? { action: { action_type: rand(["NETWORK_CONNECTION","PORT_PROBE","DNS_REQUEST","AWS_API_CALL"]) } } : undefined,
        metrics: {
          FindingCount: { sum: isFinding ? randInt(1,50) : 0 },
          HighSeverityFindingCount: { sum: isFinding&&sev>=7 ? randInt(1,10) : 0 },
          MediumSeverityFindingCount: { sum: isFinding&&sev>=4&&sev<7 ? randInt(1,20) : 0 },
          LowSeverityFindingCount: { sum: isFinding&&sev<4 ? randInt(1,30) : 0 },
        }
      }
    },
    "threat": { indicator:[{ type:rand(["ip","domain"]), value:randIp() }] },
    "event": { kind:"alert", severity:sev, outcome:isFinding?"failure":"success", category:"intrusion_detection", dataset:"aws.guardduty", provider:"guardduty.amazonaws.com" },
    "message": isFinding ? `GuardDuty finding [Severity ${sev}]: ${ft}` : `GuardDuty: no threats detected`,
    "log": { level:sev>=7?"error":sev>=4?"warn":"info" },
    ...(isFinding ? { error: { code: "ThreatFinding", message: `GuardDuty finding: ${ft}`, type: "security" } } : {})
  };
}

function generateSecurityHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.25);
  const standards = ["aws-foundational-security-best-practices","cis-aws-foundations-benchmark","pci-dss"];
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM"]) : "INFORMATIONAL";
  const findingId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const controlId = `CIS.${randInt(1,5)}.${randInt(1,20)}`;
  const createdTs = new Date(Date.parse(ts) - randInt(0, 86400000)).toISOString();
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"securityhub" } },
    "aws": {
      dimensions: { ComplianceStandard:rand(standards), ControlId:controlId },
      securityhub_findings: {
        id: findingId,
        aws_account_id: acct.id,
        description: isFinding ? `Security check failed: ${controlId} - ${rand(["MFA not enabled for root","S3 bucket is publicly accessible","Default security group allows all traffic"])}` : "Control passed.",
        created_at: createdTs,
        first_observed_at: createdTs,
        last_observed_at: ts,
        generator: { id: controlId },
        compliance: { security_control_id: controlId, status: isFinding ? "FAILED" : "PASSED" },
        criticality: sev === "CRITICAL" ? 9 : sev === "HIGH" ? 7 : 4,
        confidence: randInt(70, 99),
      },
      securityhub: {
        finding_id: `arn:aws:securityhub:${region}:${acct.id}:finding/${findingId}`,
        standard: rand(standards),
        control_id: controlId,
        compliance_status: isFinding?"FAILED":"PASSED",
        severity_label: sev,
        workflow_status: rand(["NEW","NOTIFIED","RESOLVED","SUPPRESSED"]),
        account_id: acct.id,
        metrics: {
          Findings: { sum: isFinding ? randInt(1,100) : 0 },
          FailedChecks: { sum: isFinding ? randInt(1,50) : 0 },
          PassedChecks: { sum: isFinding ? 0 : randInt(50,200) },
        }
      }
    },
    "event": { kind:"alert", severity:sev==="CRITICAL"?9:sev==="HIGH"?7:4, outcome:isFinding?"failure":"success", category:"compliance", dataset:"aws.securityhub_findings", provider:"securityhub.amazonaws.com" },
    "message": isFinding ? `Security Hub [${sev}]: Compliance check failed` : `Security Hub: control passed`,
    "log": { level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info" },
    ...(isFinding ? { error: { code: "ComplianceFailed", message: `Control ${controlId} failed`, type: "compliance" } } : {})
  };
}

function generateMacieLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.2);
  const dataTypes = ["SensitiveData:S3Object/Personal","SensitiveData:S3Object/Financial","SensitiveData:S3Object/Credentials","SensitiveData:S3Object/Medical","Policy:IAMUser/S3BucketPublic"];
  const bucket = rand(["prod-data","raw-uploads","customer-exports","analytics-output","backup-bucket"]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"macie" } },
    "aws": {
      dimensions: { BucketName:`${bucket}-${region}` },
      macie: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        finding_type: isFinding?rand(dataTypes):"none",
        severity: isFinding?rand(["HIGH","MEDIUM","LOW"]):"INFORMATIONAL",
        s3_bucket: { name:`${bucket}-${region}`, arn:`arn:aws:s3:::${bucket}-${region}` },
        occurrences: isFinding?randInt(1,50000):0,
        sensitive_data_categories: isFinding?[rand(["PII","FINANCIAL","CREDENTIALS","MEDICAL"])]:[]
      }
    },
    "event": { kind:"alert", outcome:isFinding?"failure":"success", category:"data", dataset:"aws.macie", provider:"macie2.amazonaws.com" },
    "message": isFinding ? `Macie detected sensitive data in s3://${bucket}-${region}: ${rand(dataTypes)}` : `Macie scan complete: no sensitive data found`,
    "log": { level:isFinding?"warn":"info" },
    ...(isFinding ? { error: { code: "SensitiveDataFound", message: `Sensitive data in s3://${bucket}-${region}`, type: "data" } } : {})
  };
}

function generateInspectorLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.35);
  const vulns = ["CVE-2023-44487","CVE-2024-3094","CVE-2023-38545","CVE-2022-3602","CVE-2024-21626"];
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM","LOW"]) : "INFORMATIONAL";
  const pkgs = ["openssl","curl","libssl","glibc","python3","nodejs","log4j","spring-core"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"inspector" } },
    "aws": {
      dimensions: { ResourceType:rand(["AWS_EC2_INSTANCE","AWS_ECR_CONTAINER_IMAGE","AWS_LAMBDA_FUNCTION"]) },
      inspector: {
        finding_id: `arn:aws:inspector2:${region}:${acct.id}:finding/${randId(8)}-${randId(4)}`,
        finding_type: isFinding?rand(["PACKAGE_VULNERABILITY","NETWORK_REACHABILITY","CODE_VULNERABILITY"]):"NONE",
        severity: sev, inspector_score: isFinding?parseFloat(randFloat(4,10)):0,
        vulnerable_package: { name:rand(pkgs), version:`${randInt(1,5)}.${randInt(0,20)}.${randInt(0,10)}` },
        cve_id: isFinding?rand(vulns):null,
        resource_type: rand(["AWS_EC2_INSTANCE","AWS_ECR_CONTAINER_IMAGE","AWS_LAMBDA_FUNCTION"]),
        metrics: {
          TotalFindings: { sum: isFinding ? randInt(1,20) : 0 },
          CriticalFindings: { sum: isFinding&&sev==="CRITICAL" ? randInt(1,5) : 0 },
          HighFindings: { sum: isFinding&&sev==="HIGH" ? randInt(1,10) : 0 },
        }
      }
    },
    "vulnerability": { id:isFinding?rand(vulns):null, severity:sev },
    "event": { kind:"alert", outcome:isFinding?"failure":"success", category:"vulnerability", dataset:"aws.inspector", provider:"inspector2.amazonaws.com" },
    "message": isFinding ? `Inspector [${sev}]: ${rand(vulns)} found in ${rand(pkgs)}` : `Inspector scan: no vulnerabilities found`,
    "log": { level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info" },
    ...(isFinding ? { error: { code: "VulnerabilityFound", message: `CVE found: ${rand(vulns)}`, type: "vulnerability" } } : {})
  };
}

function generateConfigLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isNonCompliant = Math.random() < (er + 0.2);
  const rules = ["required-tags","encrypted-volumes","s3-bucket-public-read-prohibited","restricted-ssh","iam-password-policy","cloudtrail-enabled","vpc-flow-logs-enabled","mfa-enabled-for-iam-console"];
  const resources = ["AWS::EC2::Instance","AWS::S3::Bucket","AWS::IAM::User","AWS::RDS::DBInstance","AWS::EC2::SecurityGroup"];
  const rule = rand(rules); const resource = rand(resources);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"config" } },
    "aws": {
      dimensions: { ConfigRuleName:rule, ResourceType:resource },
      config: {
        rule_name: rule, compliance_type: isNonCompliant?"NON_COMPLIANT":"COMPLIANT",
        resource_type: resource,
        resource_id: `${rand(["i","sg","s3","db"])}-${randId(8).toLowerCase()}`,
        annotation: isNonCompliant?rand(["Resource is not compliant","Missing required tag","Encryption not enabled","Public access enabled"]):"Resource is compliant",
        metrics: {
          ComplianceByConfigRule: { avg: isNonCompliant ? 0 : 1 },
          NonCompliantRules: { sum: isNonCompliant ? 1 : 0 },
          CompliantRules: { sum: isNonCompliant ? 0 : 1 },
          ConfigurationItemsRecorded: { sum: randInt(1,100) },
        }
      }
    },
    "event": { outcome:isNonCompliant?"failure":"success", category:"compliance", dataset:"aws.config", provider:"config.amazonaws.com" },
    "message": isNonCompliant ? `Config rule FAILED: ${rule}` : `Config rule PASSED: ${rule}`,
    "log": { level:isNonCompliant?"warn":"info" },
    ...(isNonCompliant ? { error: { code: "NonCompliant", message: `Config rule ${rule} failed`, type: "compliance" } } : {})
  };
}

function generateAccessAnalyzerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isFinding = Math.random() < (er + 0.15);
  const resourceTypes = ["AWS::S3::Bucket","AWS::IAM::Role","AWS::KMS::Key","AWS::Lambda::Function","AWS::SQS::Queue"];
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"access-analyzer" } },
    "aws": {
      dimensions: { AnalyzerName:`analyzer-${region}` },
      access_analyzer: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        analyzer_name: `analyzer-${region}`,
        finding_type: isFinding?rand(["ExternalAccess","UnusedAccess"]):"none",
        resource_type: rand(resourceTypes),
        resource_arn: `arn:aws:s3:::${rand(["prod","staging","dev"])}-bucket`,
        principal: isFinding?"*":null,
        status: isFinding?rand(["ACTIVE","ARCHIVED"]):"RESOLVED"
      }
    },
    "event": { kind:isFinding?"alert":"event", outcome:isFinding?"failure":"success", category:"iam", dataset:"aws.access_analyzer", provider:"access-analyzer.amazonaws.com" },
    "message": isFinding ? `IAM Access Analyzer: external access found on ${rand(resourceTypes)}` : `Access Analyzer: no external access paths detected`,
    "log": { level:isFinding?"warn":"info" },
    ...(isFinding ? { error: { code: "ExternalAccess", message: "External access path detected", type: "access" } } : {})
  };
}
// ═══════════════════════════════════════════════════════════════════════════
// GROUP 5 — STORAGE & DATABASES
// ═══════════════════════════════════════════════════════════════════════════

function generateS3Log(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const bucket = rand(["prod-assets","raw-data","backups","logs","media-uploads","artifacts"]);
  const op = rand(["REST.GET.OBJECT","REST.PUT.OBJECT","REST.DELETE.OBJECT","REST.HEAD.OBJECT","REST.GET.BUCKET"]);
  const key = `${rand(["data","uploads","exports","reports"])}/${randId(8).toLowerCase()}.${rand(["json","csv","parquet","gz","zip"])}`;
  const status = isErr ? rand([400,403,404,500,503]) : rand([200,200,204,206]);
  const bucketName = `${bucket}-${region}`;
  const remoteIp = randIp();
  const requestId = randId(16);
  const bytesSent = randInt(0, 1073741824);
  const totalTime = randInt(1, isErr ? 5000 : 500);
  const requester = Math.random() < 0.1 ? "-" : `AIDA${randId(20).toUpperCase()}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"s3" } },
    "aws": {
      dimensions: { BucketName:bucketName, StorageType:rand(["StandardStorage","IntelligentTieringStorage","GlacierStorage"]) },
      s3access: {
        bucket_owner: acct.id,
        bucket: bucketName,
        remote_ip: remoteIp,
        requester,
        request_id: requestId,
        operation: op,
        key: op.includes("BUCKET") ? "-" : key,
        request_uri: `/${bucketName}/${key}`,
        http_status: status,
        error_code: isErr ? rand(["NoSuchKey","AccessDenied","InternalError"]) : "-",
        bytes_sent: bytesSent,
        object_size: op.includes("GET") ? randInt(1024, 1073741824) : "-",
        total_time: totalTime,
        turn_around_time: Math.floor(totalTime * 0.8),
        referrer: Math.random() < 0.3 ? "https://console.aws.amazon.com/s3/" : "-",
        user_agent: rand(USER_AGENTS),
        host_id: `${randId(12)}+${randId(6)}`,
        signature_version: "SigV4",
        authentication_type: requester === "-" ? "-" : "AuthHeader",
        host_header: `${bucketName}.s3.${region}.amazonaws.com`,
        tls_version: "TLSv1.2",
      },
      s3: {
        bucket: { name:bucketName, arn:`arn:aws:s3:::${bucketName}` },
        object: { key, size:randInt(1024,1073741824), etag:randId(32).toLowerCase() },
        operation: op,
        request_id: requestId,
        error_code: isErr?rand(["NoSuchKey","AccessDenied","InternalError"]):null,
        metrics: {
          NumberOfObjects: { avg: randInt(1000, 10000000) },
          BucketSizeBytes: { avg: randInt(1e9, 1e12) },
          AllRequests: { sum: randInt(100, 100000) },
          GetRequests: { sum: randInt(50, 50000) },
          PutRequests: { sum: randInt(10, 10000) },
          DeleteRequests: { sum: randInt(0, 1000) },
          "4xxErrors": { sum: isErr&&status<500 ? randInt(1,500) : 0 },
          "5xxErrors": { sum: isErr&&status>=500 ? randInt(1,100) : 0 },
          FirstByteLatency: { avg: randInt(1, isErr?5000:200) },
          TotalRequestLatency: { avg: randInt(5, isErr?10000:500) },
          BytesDownloaded: { sum: randInt(0, 1e9) },
          BytesUploaded: { sum: randInt(0, 1e8) },
        }
      }
    },
    "http": { response:{ status_code:status, bytes:bytesSent } },
    "client": { ip:remoteIp },
    "user_agent": { original:rand(USER_AGENTS) },
    "event": { outcome:isErr?"failure":"success", category:"file", dataset:"aws.s3", provider:"s3.amazonaws.com" },
    "message": `${op} s3://${bucketName}/${key} ${status}`,
    "log": { level:isErr?"warn":"info" },
    ...(isErr ? { error: { code: rand(["NoSuchKey","AccessDenied","InternalError"]), message: `S3 ${op} failed: ${status}`, type: "storage" } } : {})
  };
}

function generateDynamoDbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const tables = ["users","sessions","products","orders","events","cache"]; const table = rand(tables);
  const op = rand(["GetItem","PutItem","UpdateItem","DeleteItem","Query","Scan","BatchWriteItem"]);
  const rcu = parseFloat(randFloat(0.5, isErr?500:50));
  const wcu = parseFloat(randFloat(0.5, 50));
  const plainMessage = isErr ? `DynamoDB ${op} ${table}: ${rand(["ProvisionedThroughputExceededException","ConditionalCheckFailedException","ResourceNotFoundException"])}` : `DynamoDB ${op} ${table}: consumed ${rcu} RCU, ${wcu} WCU`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ table, operation: op, consumedReadCapacityUnits: rcu, consumedWriteCapacityUnits: wcu, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"dynamodb" } },
    "aws": {
      dimensions: { TableName:table, Operation:op },
      dynamodb: {
        table_name: table, operation: op,
        consumed_read_capacity_units: rcu,
        consumed_write_capacity_units: wcu,
        items_count: randInt(0,1000),
        structured_logging: useStructuredLogging,
        error_code: isErr?rand(["ProvisionedThroughputExceededException","ConditionalCheckFailedException","ResourceNotFoundException"]):null,
        metrics: {
          ConsumedReadCapacityUnits: { sum: rcu },
          ConsumedWriteCapacityUnits: { sum: wcu },
          ProvisionedReadCapacityUnits: { avg: randInt(100, 10000) },
          ProvisionedWriteCapacityUnits: { avg: randInt(50, 5000) },
          SuccessfulRequestLatency: { avg: randInt(1, isErr?1000:50), p99: randInt(5, isErr?5000:200) },
          SystemErrors: { sum: isErr ? randInt(1,10) : 0 },
          UserErrors: { sum: isErr ? randInt(1,5) : 0 },
          ThrottledRequests: { sum: isErr ? randInt(1,100) : 0 },
          TransactionConflict: { sum: Math.random()<0.05 ? randInt(1,10) : 0 },
          ReturnedItemCount: { avg: randInt(0, 1000) },
        }
      }
    },
    "db": { name:table, operation:op, type:"nosql" },
    "event": { outcome:isErr?"failure":"success", category:"database", dataset:"aws.dynamodb", provider:"dynamodb.amazonaws.com", duration:randInt(1, isErr?500:50)*1e6 },
    "message": message,
    "log": { level:isErr?"error":rcu>100?"warn":"info" },
    ...(isErr ? { error: { code: rand(["ProvisionedThroughputExceededException","ConditionalCheckFailedException","ResourceNotFoundException"]), message: `DynamoDB ${op} failed`, type: "db" } } : {})
  };
}

function generateElastiCacheLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterId = `prod-redis-${randInt(1,5)}`;
  const nodeId = `${randInt(1,5).toString().padStart(4,"0")}`;
  const cmd = rand(["GET","SET","DEL","EXPIRE","HGET","HSET","LPUSH","RPOP","ZADD","ZRANGE","SCAN"]);
  const lat = parseFloat(randFloat(0.01, isErr?5000:50));
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"elasticache" } },
    "aws": {
      dimensions: { CacheClusterId:clusterId, CacheNodeId:nodeId },
      elasticache: {
        cluster_id: clusterId, node_id: nodeId,
        engine: "redis", engine_version: "7.1.0",
        replication_group_id: "prod-cache",
        command: cmd, latency_us: lat,
        cache_hit: !isErr&&Math.random()>0.3,
        connected_clients: randInt(10,500),
        used_memory_mb: randInt(256,16384),
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(1, isErr?95:50)) },
          FreeableMemory: { avg: randInt(100e6, 8e9) },
          NetworkBytesIn: { sum: randInt(1e6, 100e6) },
          NetworkBytesOut: { sum: randInt(1e6, 100e6) },
          CacheHits: { sum: randInt(0, 100000) },
          CacheMisses: { sum: randInt(0, 10000) },
          CurrConnections: { avg: randInt(10, 500) },
          NewConnections: { sum: randInt(1, 100) },
          Evictions: { sum: isErr ? randInt(1,1000) : 0 },
          ReplicationLag: { avg: parseFloat(randFloat(0, isErr?60:1)) },
          SaveInProgress: { avg: 0 },
        }
      }
    },
    "db": { type:"keyvalue", operation:cmd },
    "event": { duration:lat*1000, outcome:isErr?"failure":"success", category:"database", dataset:"aws.elasticache", provider:"elasticache.amazonaws.com" },
    "message": isErr ? `Redis ${cmd} failed: ${rand(["LOADING","READONLY","OOM command not allowed"])}` : `Redis ${cmd} ${lat.toFixed(2)}us`,
    "log": { level:isErr?"error":lat>1000?"warn":"info" },
    ...(isErr ? { error: { code: "RedisError", message: rand(["LOADING","READONLY","OOM command not allowed"]), type: "db" } } : {})
  };
}

function generateRedshiftLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const queries = ["SELECT COUNT(*) FROM fact_events WHERE event_date >= CURRENT_DATE - 7","INSERT INTO staging_orders SELECT * FROM raw_orders WHERE processed_at IS NULL","COPY events FROM 's3://data-lake/events/' IAM_ROLE 'arn:aws:iam::...'","VACUUM DELETE ONLY dim_products TO 95 PERCENT","ANALYZE dim_customers PREDICATE COLUMNS"];
  const dur = parseFloat(randFloat(0.1, isErr?300:60)); const dbUser = rand(["etl_user","analyst","bi_service","dbt_runner"]);
  const clusterId = `prod-dw-${region}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"redshift" } },
    "aws": {
      dimensions: { ClusterIdentifier:clusterId, NodeID:rand(["Leader","Compute-0","Compute-1"]) },
      redshift: {
        cluster_id: clusterId, database: "analytics", user: dbUser,
        pid: randInt(10000,99999), query_id: randInt(1000000,9999999),
        duration_seconds: dur, rows_returned: isErr?0:randInt(0,5000000),
        error_code: isErr?rand(["1006","8001","30000","32000"]):null,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(5, isErr?99:70)) },
          PercentageDiskSpaceUsed: { avg: parseFloat(randFloat(10, isErr?95:60)) },
          DatabaseConnections: { avg: randInt(1, isErr?500:100) },
          HealthStatus: { avg: isErr ? 0 : 1 },
          MaintenanceMode: { avg: 0 },
          ReadIOPS: { avg: randInt(0, 10000) },
          WriteIOPS: { avg: randInt(0, 10000) },
          ReadLatency: { avg: parseFloat(randFloat(0.001, 0.1)) },
          WriteLatency: { avg: parseFloat(randFloat(0.001, 0.1)) },
          NetworkReceiveThroughput: { avg: randInt(1e6, 100e6) },
          NetworkTransmitThroughput: { avg: randInt(1e6, 100e6) },
          QueriesCompletedPerSecond: { avg: parseFloat(randFloat(0.1, 100)) },
        }
      }
    },
    "db": { user:{ name:dbUser }, name:"analytics", statement:rand(queries), type:"sql" },
    "event": { duration:dur*1e9, outcome:isErr?"failure":"success", category:"database", dataset:"aws.redshift", provider:"redshift.amazonaws.com" },
    "message": isErr ? `Redshift query failed after ${dur}s` : `Redshift query completed in ${dur.toFixed(2)}s`,
    "log": { level:isErr?"error":dur>60?"warn":"info" },
    ...(isErr ? { error: { code: rand(["1006","8001","30000","32000"]), message: "Redshift query failed", type: "db" } } : {})
  };
}

function generateOpenSearchLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const indices = ["logs-2024","metrics","traces","audit-events","app-logs"]; const idx = rand(indices);
  const op = rand(["index","search","bulk","delete","update","get","msearch"]);
  const dur = parseFloat(randFloat(1, isErr?30000:2000)); const status = isErr ? rand([400,429,500,503]) : rand([200,200,201]);
  const domainName = `prod-search-${region}`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"opensearch" } },
    "aws": {
      dimensions: { DomainName:domainName, ClientId:acct.id },
      opensearch: {
        domain_name: domainName, index: idx, operation: op,
        took_ms: Math.round(dur),
        shards: { total:5, successful:isErr?randInt(1,4):5, failed:isErr?randInt(1,3):0 },
        hits_total: isErr?0:randInt(0,100000),
        status_code: status,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(5, isErr?95:60)) },
          FreeStorageSpace: { avg: randInt(5e9, 500e9) },
          ClusterStatus: { green: isErr?0:1, yellow: isErr?1:0, red: 0 },
          Nodes: { avg: randInt(3, 20) },
          SearchableDocuments: { avg: randInt(1e6, 1e9) },
          IndexingLatency: { avg: randInt(1, isErr?5000:500) },
          SearchLatency: { avg: randInt(1, isErr?10000:1000) },
          IndexingRate: { avg: randInt(100, 100000) },
          SearchRate: { avg: randInt(10, 10000) },
          JVMMemoryPressure: { avg: parseFloat(randFloat(10, isErr?95:70)) },
          AutomatedSnapshotFailure: { sum: isErr ? 1 : 0 },
        }
      }
    },
    "http": { response:{ status_code:status } },
    "event": { duration:dur*1e6, outcome:isErr?"failure":"success", category:"database", dataset:"aws.opensearch", provider:"es.amazonaws.com" },
    "message": isErr ? `OpenSearch ${op} on ${idx} failed [${status}] after ${dur.toFixed(0)}ms` : `OpenSearch ${op} on ${idx}: ${dur.toFixed(0)}ms`,
    "log": { level:isErr?"error":dur>5000?"warn":"info" },
    ...(isErr ? { error: { code: String(status), message: `OpenSearch ${op} failed`, type: "db" } } : {})
  };
}

function generateDocumentDbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const op = rand(["find","insert","update","delete","aggregate","createIndex"]); const col = rand(["users","orders","products","sessions","events"]);
  const dur = parseFloat(randFloat(0.1, isErr?10000:500));
  const clusterId = `docdb-${region}-cluster`;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"docdb" } },
    "aws": {
      dimensions: { DBClusterIdentifier:clusterId, Role:rand(["WRITER","READER"]) },
      docdb: {
        cluster_id: clusterId, database: "appdb", collection: col,
        operation: op, duration_ms: Math.round(dur),
        documents_affected: isErr?0:randInt(1,1000),
        error: isErr?rand(["CursorNotFound","DuplicateKey","WriteConflict","ExceededTimeLimit"]):null,
        metrics: {
          CPUUtilization: { avg: parseFloat(randFloat(2, isErr?95:60)) },
          DatabaseConnections: { avg: randInt(1, isErr?500:100) },
          FreeLocalStorage: { avg: randInt(1e9, 100e9) },
          FreeableMemory: { avg: randInt(500e6, 8e9) },
          ReadIOPS: { avg: randInt(0, 5000) },
          WriteIOPS: { avg: randInt(0, 5000) },
          ReadLatency: { avg: parseFloat(randFloat(0.0001, 0.05)) },
          WriteLatency: { avg: parseFloat(randFloat(0.0001, 0.05)) },
          DocumentsInserted: { sum: op==="insert" ? randInt(1,1000) : 0 },
          DocumentsDeleted: { sum: op==="delete" ? randInt(1,100) : 0 },
          DocumentsUpdated: { sum: op==="update" ? randInt(1,500) : 0 },
          DocumentsReturned: { sum: op==="find"||op==="aggregate" ? randInt(0,10000) : 0 },
        }
      }
    },
    "db": { name:"appdb", operation:op, type:"document" },
    "event": { duration:dur*1e6, outcome:isErr?"failure":"success", category:"database", dataset:"aws.docdb", provider:"docdb.amazonaws.com" },
    "message": isErr ? `DocumentDB ${op} on ${col} failed: ${rand(["DuplicateKey","WriteConflict"])}` : `DocumentDB ${op} on ${col}: ${dur.toFixed(1)}ms`,
    "log": { level:isErr?"error":dur>1000?"warn":"info" },
    ...(isErr ? { error: { code: rand(["CursorNotFound","DuplicateKey","WriteConflict","ExceededTimeLimit"]), message: `DocumentDB ${op} failed`, type: "db" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 6 — STREAMING & MESSAGING
// ═══════════════════════════════════════════════════════════════════════════

function generateKinesisStreamsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const stream = rand(["clickstream","user-events","transaction-feed","iot-telemetry","audit-trail"]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"kinesis" } },
    "aws": {
      dimensions: { StreamName:stream, ShardId:`shardId-${String(randInt(0,15)).padStart(12,"0")}` },
      kinesis: {
        stream_name: stream,
        shard_id: `shardId-${String(randInt(0,15)).padStart(12,"0")}`,
        sequence_number: randId(56),
        partition_key: randId(8).toLowerCase(),
        incoming_records: randInt(1,10000),
        incoming_bytes: randInt(1000,1048576),
        iterator_age_ms: isErr?randInt(10000,3600000):randInt(0,1000),
        write_provisioned_throughput_exceeded: isErr,
        metrics: {
          IncomingRecords: { sum: randInt(1,10000) },
          IncomingBytes: { sum: randInt(1000,10e6) },
          OutgoingRecords: { sum: randInt(1,10000) },
          OutgoingBytes: { sum: randInt(1000,10e6) },
          WriteProvisionedThroughputExceeded: { sum: isErr ? randInt(1,100) : 0 },
          ReadProvisionedThroughputExceeded: { sum: isErr ? randInt(1,50) : 0 },
          IteratorAgeMilliseconds: { avg: isErr?randInt(10000,3600000):randInt(0,1000) },
          GetRecords_IteratorAgeMilliseconds: { avg: isErr?randInt(10000,3600000):randInt(0,500) },
          PutRecord_Success: { sum: isErr?0:randInt(100,10000) },
          PutRecords_Success: { sum: isErr?0:randInt(100,10000) },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.kinesis", provider:"kinesis.amazonaws.com", duration:randInt(1, isErr?60000:5000)*1e6 },
    "message": isErr ? `Kinesis WriteProvisionedThroughputExceeded on ${stream}` : `Kinesis ${stream}: ${randInt(1,10000)} records ingested`,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "WriteProvisionedThroughputExceeded", message: "Kinesis throughput exceeded", type: "stream" } } : {})
  };
}

function generateFirehoseLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const stream = rand(["logs-to-s3","events-to-redshift","metrics-to-opensearch","clickstream-backup"]);
  const dest = rand(["S3","Redshift","OpenSearch","HTTPEndpoint"]);
  const recs = randInt(100,50000);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"firehose" } },
    "aws": {
      dimensions: { DeliveryStreamName:stream },
      firehose: {
        delivery_stream_name: stream, destination: dest,
        incoming_records: recs, incoming_bytes: recs*randInt(200,2000),
        delivery_success: !isErr, delivery_records: isErr?0:recs,
        data_freshness_seconds: randInt(60,isErr?3600:300),
        metrics: {
          IncomingRecords: { sum: recs },
          IncomingBytes: { sum: recs*randInt(200,2000) },
          DeliveryToS3_Records: { sum: dest==="S3"&&!isErr ? recs : 0 },
          DeliveryToS3_Success: { sum: dest==="S3" ? (isErr?0:1) : null },
          DeliveryToRedshift_Records: { sum: dest==="Redshift"&&!isErr ? recs : 0 },
          DeliveryToElasticsearch_Records: { sum: dest==="OpenSearch"&&!isErr ? recs : 0 },
          FailedConversionRecords: { sum: isErr ? randInt(1,100) : 0 },
          DataReadFromKinesisStream_Records: { sum: recs },
          DeliveryToS3_DataFreshness: { avg: randInt(60,isErr?3600:300) },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.firehose", provider:"firehose.amazonaws.com", duration:randInt(1, isErr?300:60)*1e9 },
    "message": isErr ? `Firehose ${stream} delivery failure: ${rand(["S3 PutObject failed","Conversion error","Buffer full"])}` : `Firehose ${stream}: ${recs} records delivered`,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "DeliveryFailure", message: "Firehose delivery failed", type: "stream" } } : {})
  };
}

function generateMskLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const topic = rand(["user-events","order-updates","inventory-changes","notifications","payments"]); const partition = randInt(0,23);
  const clusterName = `prod-kafka-${region}`;
  const brokerId = randInt(1,6);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"msk" } },
    "aws": {
      dimensions: { "Cluster Name":clusterName, "Broker ID":String(brokerId), Topic:topic },
      msk: {
        cluster_name: clusterName, broker_id: brokerId, kafka_version: "3.5.1",
        topic, partition, offset: randInt(0,100000000),
        consumer_group: rand(["analytics-consumer","etl-pipeline","alerting-service"]),
        lag: isErr?randInt(10000,1000000):randInt(0,100),
        under_replicated_partitions: isErr?randInt(1,20):0,
        metrics: {
          BytesInPerSec: { avg: randInt(1000,10e6) },
          BytesOutPerSec: { avg: randInt(1000,10e6) },
          MessagesInPerSec: { avg: randInt(100,100000) },
          UnderReplicatedPartitions: { avg: isErr?randInt(1,20):0 },
          OfflinePartitionsCount: { avg: isErr?randInt(1,5):0 },
          ActiveControllerCount: { avg: 1 },
          LeaderCount: { avg: randInt(1,100) },
          NetworkProcessorAvgIdlePercent: { avg: parseFloat(randFloat(20,90)) },
          RequestHandlerAvgIdlePercent: { avg: parseFloat(randFloat(20,90)) },
          KafkaDataLogsDiskUsed: { avg: parseFloat(randFloat(10,isErr?90:60)) },
          CpuUser: { avg: parseFloat(randFloat(5,isErr?95:60)) },
          MemoryFree: { avg: randInt(500e6, 8e9) },
        }
      }
    },
    "kafka": { topic, partition },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.msk", provider:"kafka.amazonaws.com", duration:randInt(1, isErr?5000:100)*1e6 },
    "message": isErr ? `MSK broker issue: under-replicated partitions on ${topic}` : `MSK ${topic}[${partition}] offset=${randInt(0,100000000)}`,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "UnderReplicatedPartitions", message: "MSK partition replication lag", type: "stream" } } : {})
  };
}

function generateSqsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const queue = rand(["order-processing","email-queue","notification-dlq","webhook-events","job-queue"]); const isDlq = queue.includes("dlq");
  const sent = randInt(1,10000); const received = randInt(0, sent); const deleted = randInt(0, received);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"sqs" } },
    "aws": {
      dimensions: { QueueName:queue },
      sqs: {
        queue_name: queue,
        queue_url: `https://sqs.${region}.amazonaws.com/${acct.id}/${queue}`,
        messages_sent: sent, messages_deleted: deleted,
        approximate_number_of_messages: randInt(0,isErr?100000:1000),
        approximate_age_of_oldest_message_seconds: randInt(0,isErr?86400:300),
        is_dlq: isDlq,
        metrics: {
          NumberOfMessagesSent: { sum: sent },
          NumberOfMessagesReceived: { sum: received },
          NumberOfMessagesDeleted: { sum: deleted },
          ApproximateNumberOfMessagesVisible: { avg: randInt(0,isErr?100000:1000) },
          ApproximateNumberOfMessagesNotVisible: { avg: randInt(0,100) },
          ApproximateNumberOfMessagesDelayed: { avg: randInt(0,50) },
          ApproximateAgeOfOldestMessage: { avg: randInt(0,isErr?86400:300) },
          SentMessageSize: { avg: randInt(1,256000) },
          NumberOfEmptyReceives: { sum: randInt(0,1000) },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.sqs", provider:"sqs.amazonaws.com", duration:randInt(1, isErr?30000:500)*1e6 },
    "message": isErr||isDlq ? `SQS ${queue}: ${randInt(1,1000)} messages dead-lettered after max retries` : `SQS ${queue}: ${sent} messages processed`,
    "log": { level:isErr||isDlq?"warn":"info" },
    ...(isErr||isDlq ? { error: { code: "MessagesDeadLettered", message: "Messages moved to DLQ after max retries", type: "queue" } } : {})
  };
}

function generateEventBridgeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const rule = rand(["order-created-rule","user-signup-trigger","scheduled-cleanup","cost-alert-rule","security-event-forwarder"]);
  const source = rand(["aws.ec2","aws.s3","custom.app","aws.health","com.partner.events"]);
  const eventBus = rand(["default","custom-events","app-events"]);
  const eventId = randUUID();
  const plainMessage = isErr ? `EventBridge rule ${rule}: target invocations failed` : `EventBridge event routed: ${source} -> ${rule}`;
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ id: eventId, source, detailType: rand(["EC2 Instance State-change Notification","Object Created","Order Placed","Health Event"]), rule, eventBus, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"events" } },
    "aws": {
      dimensions: { EventBusName:eventBus, RuleName:rule },
      eventbridge: {
        event_bus: eventBus, rule, source,
        detail_type: rand(["EC2 Instance State-change Notification","Object Created","Order Placed","Health Event"]),
        targets_invoked: randInt(1,5), targets_failed: isErr?randInt(1,3):0,
        event_id: eventId,
        structured_logging: useStructuredLogging,
        metrics: {
          Invocations: { sum: randInt(1,10000) },
          FailedInvocations: { sum: isErr ? randInt(1,100) : 0 },
          TriggeredRules: { sum: randInt(1,1000) },
          MatchedEvents: { sum: randInt(1,10000) },
          ThrottledRules: { sum: isErr ? randInt(1,10) : 0 },
          DeadLetterInvocations: { sum: isErr ? randInt(1,20) : 0 },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.eventbridge", provider:"events.amazonaws.com", duration:randInt(1, isErr?5000:200)*1e6 },
    "message": message,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "TargetInvocationFailed", message: "EventBridge target invocations failed", type: "event" } } : {})
  };
}

function generateStepFunctionsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const machine = rand(["order-fulfillment","user-onboarding","data-pipeline","approval-workflow","batch-processor"]);
  const state = rand(["ValidateInput","ProcessPayment","SendNotification","UpdateDatabase","HandleError"]);
  const dur = parseFloat(randFloat(0.1, isErr?600:30));
  const executionArn = `arn:aws:states:${region}:${acct.id}:execution:${machine}:${randId(8).toLowerCase()}`;
  const plainMessage = isErr ? `Step Functions ${machine} FAILED at state ${state}: ${rand(["Lambda error","Timeout","States.TaskFailed"])}` : `Step Functions ${machine} SUCCEEDED in ${dur.toFixed(1)}s`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ executionArn, stateMachine: machine, state, status: isErr?"FAILED":"SUCCEEDED", durationSeconds: dur, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"states" } },
    "aws": {
      dimensions: { StateMachineArn:`arn:aws:states:${region}:${acct.id}:stateMachine:${machine}` },
      stepfunctions: {
        state_machine_name: machine,
        state_machine_arn: `arn:aws:states:${region}:${acct.id}:stateMachine:${machine}`,
        execution_arn: executionArn,
        state_name: state, status: isErr?"FAILED":"SUCCEEDED", duration_seconds: dur,
        structured_logging: useStructuredLogging,
        metrics: {
          ExecutionsStarted: { sum: randInt(1,1000) },
          ExecutionsSucceeded: { sum: isErr ? 0 : randInt(1,1000) },
          ExecutionsFailed: { sum: isErr ? randInt(1,50) : 0 },
          ExecutionsAborted: { sum: randInt(0,5) },
          ExecutionsTimedOut: { sum: isErr ? randInt(0,10) : 0 },
          ExecutionThrottled: { sum: isErr ? randInt(0,20) : 0 },
          ExecutionTime: { avg: dur*1000, max: dur*2000 },
        }
      }
    },
    "event": { duration:dur*1e9, outcome:isErr?"failure":"success", category:"process", dataset:"aws.stepfunctions", provider:"states.amazonaws.com" },
    "message": message,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "States.TaskFailed", message: `Step Functions failed at ${state}`, type: "workflow" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 7 — DEVELOPER & CI/CD
// ═══════════════════════════════════════════════════════════════════════════

function generateCodeBuildLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const project = rand(["web-app-build","api-service-build","infra-terraform","docker-build","test-runner","release-build"]);
  const dur = randInt(30, isErr?3600:900);
  const phase = rand(["DOWNLOAD_SOURCE","INSTALL","PRE_BUILD","BUILD","POST_BUILD","UPLOAD_ARTIFACTS","COMPLETED"]);
  const buildId = `${project}:${randId(8)}-${randId(4)}`.toLowerCase();
  const plainMessage = isErr ? `CodeBuild ${project} FAILED at phase ${phase} after ${dur}s` : `CodeBuild ${project} SUCCEEDED in ${dur}s`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ buildId, project, phase, status: isErr?"FAILED":"SUCCEEDED", durationSeconds: dur, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"codebuild" } },
    "aws": {
      dimensions: { ProjectName:project },
      codebuild: {
        project_name: project,
        build_id: buildId,
        build_status: isErr?"FAILED":"SUCCEEDED",
        current_phase: phase,
        duration_seconds: dur,
        queued_duration_seconds: randInt(1,60),
        build_number: randInt(1,5000),
        initiator: rand(["codepipeline","github-webhook","manual"]),
        source_version: randId(40).toLowerCase(),
        structured_logging: useStructuredLogging,
        metrics: {
          Builds: { sum: 1 },
          SucceededBuilds: { sum: isErr ? 0 : 1 },
          FailedBuilds: { sum: isErr ? 1 : 0 },
          Duration: { avg: dur },
          QueuedDuration: { avg: randInt(1, 60) },
          BuildDuration: { avg: dur },
        }
      }
    },
    "event": { duration:dur*1e9, outcome:isErr?"failure":"success", category:"process", dataset:"aws.codebuild", provider:"codebuild.amazonaws.com" },
    "message": message,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "BuildFailed", message: `CodeBuild failed at phase ${phase}`, type: "build" } } : {})
  };
}

function generateCodePipelineLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const pipeline = rand(["web-prod-pipeline","api-deploy","infra-pipeline","release-train","hotfix-pipeline"]);
  const stage = rand(["Source","Build","Test","Staging","Approval","Production"]);
  const executionId = randUUID();
  const plainMessage = isErr ? `CodePipeline ${pipeline} FAILED at ${stage}` : `CodePipeline ${pipeline} SUCCEEDED`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ pipeline, executionId, stage, state: isErr?"Failed":"Succeeded", timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"codepipeline" } },
    "aws": {
      dimensions: { PipelineName:pipeline },
      codepipeline: {
        pipeline_name: pipeline,
        pipeline_arn: `arn:aws:codepipeline:${region}:${acct.id}:${pipeline}`,
        execution_id: executionId,
        stage_name: stage,
        action_name: rand(["Source","CodeBuild","Deploy","Manual","Lambda"]),
        state: isErr?"Failed":"Succeeded",
        revision_id: randId(40).toLowerCase(),
        structured_logging: useStructuredLogging,
        metrics: {
          PipelineExecutionAttempts: { sum: 1 },
          PipelineSuccessCount: { sum: isErr ? 0 : 1 },
          PipelineFailureCount: { sum: isErr ? 1 : 0 },
          ActionExecutionAttempts: { sum: 1 },
          ActionSuccessCount: { sum: isErr ? 0 : 1 },
          ActionFailureCount: { sum: isErr ? 1 : 0 },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"process", dataset:"aws.codepipeline", provider:"codepipeline.amazonaws.com", duration:randInt(10, isErr?600:120)*1e9 },
    "message": message,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: "StageFailed", message: `Pipeline stage ${stage} failed`, type: "pipeline" } } : {})
  };
}

function generateCodeDeployLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["web-app","api-service","worker-service","background-jobs"]);
  const dur = randInt(30, isErr?1200:600);
  const ev = rand(["BeforeInstall","AfterInstall","ApplicationStart","ValidateService","BeforeAllowTraffic","AfterAllowTraffic"]);
  const depGroup = rand(["prod","staging","canary"]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"codedeploy" } },
    "aws": {
      dimensions: { Application:app, DeploymentGroup:depGroup },
      codedeploy: {
        application_name: app,
        deployment_group: depGroup,
        deployment_id: `d-${randId(9)}`,
        deployment_type: rand(["BLUE_GREEN","IN_PLACE"]),
        lifecycle_event: ev,
        event_status: isErr?"Failed":"Succeeded",
        duration_seconds: dur,
        error_code: isErr?rand(["SCRIPT_FAILED","AGENT_ISSUE","HEALTH_CONSTRAINTS_INVALID"]):null,
        instances_succeeded: isErr?randInt(0,5):randInt(1,10),
        instances_failed: isErr?randInt(1,3):0,
        metrics: {
          DeploymentAttempts: { sum: 1 },
          DeploymentSuccesses: { sum: isErr ? 0 : 1 },
          DeploymentFailures: { sum: isErr ? 1 : 0 },
          DeploymentDuration: { avg: dur },
          InstanceSuccesses: { sum: isErr?randInt(0,5):randInt(1,10) },
          InstanceFailures: { sum: isErr?randInt(1,3):0 },
        }
      }
    },
    "event": { duration:dur*1e9, outcome:isErr?"failure":"success", category:"process", dataset:"aws.codedeploy", provider:"codedeploy.amazonaws.com" },
    "message": isErr ? `CodeDeploy ${app} FAILED at ${ev}: ${rand(["Script exited with code 1","Health check failed","Timeout"])}` : `CodeDeploy ${app} deployment SUCCEEDED in ${dur}s`,
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: rand(["SCRIPT_FAILED","AGENT_ISSUE","HEALTH_CONSTRAINTS_INVALID"]), message: `CodeDeploy failed at ${ev}`, type: "deployment" } } : {})
  };
}

function generateXRayLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const svc = rand(["web-frontend","api-gateway","user-service","payment-service","db-proxy","cache-layer"]);
  const dur = parseFloat(randFloat(0.001, isErr?30:5)); const status = isErr ? rand([500,502,503]) : rand([200,200,201]);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"xray" } },
    "aws": {
      dimensions: { GroupName:"Default", ServiceType:rand(["AWS::Lambda::Function","AWS::EC2::Instance","client"]) },
      xray: {
        trace_id: `1-${Math.floor(Date.now()/1000).toString(16)}-${randId(24).toLowerCase()}`,
        segment_id: randId(16).toLowerCase(),
        parent_id: randId(16).toLowerCase(),
        service: { name:svc, type:rand(["AWS::Lambda::Function","AWS::EC2::Instance","client"]) },
        duration: dur,
        http: { request:{ method:rand(HTTP_METHODS), url:rand(HTTP_PATHS) }, response:{ status } },
        fault: isErr,
        annotations: { env:"prod", version:`v${randInt(1,20)}` },
        metrics: {
          ErrorRate: { avg: isErr ? parseFloat(randFloat(1,20)) : parseFloat(randFloat(0,1)) },
          FaultRate: { avg: isErr ? parseFloat(randFloat(1,15)) : parseFloat(randFloat(0,0.5)) },
          ThrottleRate: { avg: parseFloat(randFloat(0,2)) },
          TotalCount: { sum: randInt(1,10000) },
          Latency: { avg: dur*1000, p99: dur*3000 },
        }
      }
    },
    "event": { duration:dur*1e9, outcome:isErr?"failure":"success", category:"network", dataset:"aws.xray", provider:"xray.amazonaws.com" },
    "message": isErr ? `X-Ray trace FAULT: ${svc} ${dur.toFixed(3)}s [${status}]` : `X-Ray trace: ${svc} ${dur.toFixed(3)}s`,
    "log": { level:isErr?"error":dur>5?"warn":"info" },
    ...(isErr ? { error: { code: "TraceFault", message: `Trace fault: HTTP ${status}`, type: "trace" } } : {})
  };
}

function generateEbsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const az = `${region}${rand(["a","b","c"])}`;
  const volumeId = `vol-${randId(17).toLowerCase()}`;
  const volumeTypes = ["gp3","gp2","io1","io2","st1","sc1"];
  const volType = rand(volumeTypes);
  const sizeGb = rand([8,20,50,100,200,500,1000,2000]);
  const provisionedIops = volType==="io1"||volType==="io2" ? randInt(3000,64000) : volType==="gp3" ? randInt(3000,16000) : null;
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const device = rand(["/dev/xvda","/dev/xvdb","/dev/sdf","/dev/sdg","/dev/nvme0n1","/dev/nvme1n1"]);

  const eventType = rand(["performance","state_change","snapshot","modification","alarm"]);

  let eventData = {};
  let message = "";
  let level = "info";

  if (eventType === "performance") {
    const iopsConsumed = randInt(100, isErr ? (provisionedIops||16000)*1.1 : (provisionedIops||3000)*0.8);
    const throughputMbps = parseFloat(randFloat(1, isErr ? 1200 : 500));
    const queueDepth = randInt(0, isErr ? 64 : 8);
    const latencyMs = parseFloat(randFloat(0.1, isErr ? 50 : 5));
    const burstBalance = volType==="gp2"||volType==="st1"||volType==="sc1" ? randInt(isErr?0:50, 100) : null;
    level = isErr ? "warn" : queueDepth > 32 ? "warn" : "info";
    eventData = { volume_id:volumeId, volume_type:volType, size_gb:sizeGb, attached_instance:instanceId, device,
      iops_consumed:iopsConsumed, provisioned_iops:provisionedIops, throughput_mbps:throughputMbps,
      queue_depth:queueDepth, latency_ms:latencyMs, burst_balance_percent:burstBalance,
      read_ops:randInt(0,5000), write_ops:randInt(0,5000), read_bytes:randInt(0,536870912), write_bytes:randInt(0,536870912) };
    message = isErr
      ? `EBS ${volumeId} IOPS throttled: consumed ${Math.round(iopsConsumed)} vs provisioned ${provisionedIops||3000}, queue depth ${queueDepth}`
      : `EBS ${volumeId} performance: ${Math.round(iopsConsumed)} IOPS, ${throughputMbps.toFixed(1)} MB/s, latency ${latencyMs.toFixed(2)}ms`;

  } else if (eventType === "state_change") {
    const fromState = rand(["available","in-use","available"]);
    const toState = isErr ? rand(["error","error-deleting"]) : rand(["in-use","available","available"]);
    level = isErr ? "error" : "info";
    eventData = { volume_id:volumeId, volume_type:volType, size_gb:sizeGb, availability_zone:az,
      previous_state:fromState, current_state:toState, attached_instance:toState==="in-use"?instanceId:null, device:toState==="in-use"?device:null };
    message = isErr
      ? `EBS volume ${volumeId} entered error state from ${fromState}: ${rand(["I/O error","hardware failure","data integrity issue"])}`
      : `EBS volume ${volumeId} state change: ${fromState} -> ${toState}${toState==="in-use"?" on "+instanceId+" ("+device+")":""}`;

  } else if (eventType === "snapshot") {
    const snapshotId = `snap-${randId(17).toLowerCase()}`;
    const snapshotState = isErr ? "error" : rand(["pending","completed","completed"]);
    const progress = snapshotState==="completed" ? "100%" : snapshotState==="pending" ? `${randInt(10,90)}%` : "0%";
    const duration = randInt(30, isErr ? 3600 : 900);
    level = isErr ? "error" : snapshotState==="pending" ? "info" : "info";
    eventData = { volume_id:volumeId, volume_type:volType, size_gb:sizeGb, snapshot_id:snapshotId,
      snapshot_state:snapshotState, progress, duration_seconds:duration,
      encrypted:rand([true,true,false]), kms_key_id:rand([`arn:aws:kms:${region}:${acct.id}:key/${randId(8)}-${randId(4)}`.toLowerCase(), null]) };
    message = isErr
      ? `EBS snapshot ${snapshotId} of volume ${volumeId} FAILED: ${rand(["Insufficient permissions","Volume in use by unsupported configuration","Concurrent snapshot limit exceeded"])}`
      : `EBS snapshot ${snapshotId} of volume ${volumeId} [${sizeGb}GB]: ${snapshotState} (${progress})`;

  } else if (eventType === "modification") {
    const oldType = rand(volumeTypes); const newType = rand(volumeTypes);
    const oldSize = sizeGb; const newSize = oldSize + rand([0,0,50,100,200]);
    const oldIops = randInt(3000,16000); const newIops = randInt(3000,16000);
    const modState = isErr ? "failed" : rand(["modifying","optimizing","completed"]);
    level = isErr ? "error" : "info";
    eventData = { volume_id:volumeId, modification_state:modState,
      original_volume_type:oldType, target_volume_type:newType,
      original_size_gb:oldSize, target_size_gb:newSize,
      original_iops:oldIops, target_iops:newIops,
      progress_percent:modState==="completed"?100:modState==="failed"?0:randInt(10,90) };
    message = isErr
      ? `EBS volume modification FAILED for ${volumeId}: ${rand(["Instance type does not support requested volume type","Insufficient capacity for io2 in AZ","IOPS exceeds maximum for volume size"])}`
      : `EBS volume ${volumeId} modification: ${oldType}/${oldSize}GB -> ${newType}/${newSize}GB [${modState}]`;

  } else {
    // alarm
    const metric = rand(["VolumeQueueLength","BurstBalance","VolumeReadOps","VolumeWriteOps","VolumeThroughputPercentage","VolumeConsumedReadWriteOps"]);
    const alarmState = isErr ? rand(["ALARM","INSUFFICIENT_DATA"]) : "OK";
    level = alarmState==="ALARM" ? "warn" : "info";
    eventData = { volume_id:volumeId, volume_type:volType, size_gb:sizeGb,
      alarm_name:`ebs-${metric.toLowerCase()}-${volumeId}`, alarm_state:alarmState, metric_name:metric,
      threshold:randInt(1,100), current_value:alarmState==="ALARM"?randInt(80,200):randInt(0,60) };
    message = alarmState==="ALARM"
      ? `EBS CloudWatch alarm TRIGGERED: ${metric} on ${volumeId} exceeded threshold`
      : `EBS CloudWatch alarm OK: ${metric} on ${volumeId} within normal range`;
  }

  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, availability_zone:az, account:{ id:acct.id, name:acct.name }, service:{name:"ebs"} },
    "aws": {
      dimensions: { VolumeId:volumeId, VolumeType:volType },
      ebs: {
        ...eventData, event_type:eventType,
        metrics: {
          VolumeReadOps: { sum: randInt(0,10000) },
          VolumeWriteOps: { sum: randInt(0,10000) },
          VolumeReadBytes: { sum: randInt(0,536870912) },
          VolumeWriteBytes: { sum: randInt(0,536870912) },
          VolumeTotalReadTime: { sum: parseFloat(randFloat(0,10)) },
          VolumeTotalWriteTime: { sum: parseFloat(randFloat(0,10)) },
          VolumeIdleTime: { sum: parseFloat(randFloat(0,60)) },
          VolumeQueueLength: { avg: randInt(0, isErr?64:8) },
          VolumeThroughputPercentage: { avg: parseFloat(randFloat(10, isErr?100:80)) },
          VolumeConsumedReadWriteOps: { sum: randInt(100, isErr?(provisionedIops||16000)*1.1:(provisionedIops||3000)*0.8) },
          BurstBalance: { avg: volType==="gp2"||volType==="st1"||volType==="sc1" ? randInt(isErr?0:50,100) : null },
        }
      }
    },
    "event": { outcome:isErr?"failure":"success", category:"host", dataset:"aws.ebs", provider:"ec2.amazonaws.com" },
    "message": message,
    "log": { level },
    ...(isErr ? { error: { code: "EbsError", message, type: "storage" } } : {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 8 — ANALYTICS & AI
// ═══════════════════════════════════════════════════════════════════════════

function generateEmrLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const app = rand(["spark","hive","flink","presto","hadoop"]);
  const job = rand(["etl-daily-aggregation","clickstream-processing","ml-feature-pipeline","log-enrichment","revenue-attribution"]);
  const level = Math.random() < er ? "error" : Math.random() < 0.15 ? "warn" : "info";
  const clusterId = `j-${randId(13)}`;
  const appId = `application_${Date.now()}_${randInt(1000,9999)}`;
  const executorCount = randInt(4, 64);
  const MSGS = { info:["Stage 0 (Map) completed in 12.4s","Executor 7 registered with 4 cores and 8.0 GB RAM","Shuffle read: 2.3 GB, Shuffle write: 1.8 GB","Job submitted to YARN ResourceManager","Writing Parquet to s3://data-lake/processed/"],warn:["GC overhead limit approaching: 88% heap used","Executor 3 lost, rescheduling 12 tasks","Shuffle spill to disk: 4.1 GB (insufficient memory)"],error:["ExecutorLostFailure: Executor 11 exited with code 137 (OOMKilled)","Job aborted due to stage failure: Stage 3 failed 4 times","S3 access denied: s3://restricted-bucket/data/","YARN: Container killed on request. Exit code is 143"] };
  const plainMessage = rand(MSGS[level]);
  const durationSec = randInt(60, level==="error"?7200:3600);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({ clusterId, applicationId: appId, containerId: `container_${Date.now()}_${randInt(1,9999)}_01_${randInt(100000,999999)}`, logLevel: level.toUpperCase(), message: plainMessage, timestamp: new Date(ts).toISOString(), component: rand(["driver","executor","yarn","spark"]) })
    : plainMessage;
  const emrMetrics = { executor_count: executorCount, running_step_count: level === "error" ? 0 : randInt(1, 5), failed_step_count: level === "error" ? randInt(1, 3) : 0, hdfs_utilization_pct: randInt(20, 95), yarn_memory_used_mb: randInt(1024, 65536) };
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"emr" } },
    "aws": {
      emr: {
        cluster_id: clusterId,
        cluster_name: `${job}-cluster`,
        application: app,
        release: `emr-6.${randInt(8,15)}.0`,
        instance_group: rand(["MASTER","CORE","TASK"]),
        executor_count: executorCount,
        job: { name: job, id: appId },
        structured_logging: useStructuredLogging,
        metrics: emrMetrics,
      }
    },
    "log": { level },
    "event": { outcome: level==="error"?"failure":"success", category:"process", dataset:"aws.emr", provider:"elasticmapreduce.amazonaws.com", duration: durationSec*1e9 },
    "message": message,
    ...(level==="error"?{ error:{ code:"JobFailed", message: rand(MSGS.error), type:"process" } } : {}),
  };
}

function generateGlueLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const job = rand(["s3-to-redshift-etl","raw-to-curated","pii-masking","schema-handler","incremental-sync","data-quality"]);
  const runId = `jr_${randId(20).toLowerCase()}`;
  const jobType = rand(["glueetl","pythonshell","gluestreaming"]);
  const db = rand(["raw_data","curated","analytics","staging"]); const dpus = rand([2,5,10,20,50]);
  const recordsRead = randInt(10000,50000000);
  const recordsWritten = Math.floor(recordsRead * 0.99);
  const recordsFailed = level === "error" ? randInt(1, 1000) : 0;
  const runState = level === "error" ? "FAILED" : level === "warn" && Math.random() < 0.3 ? "STOPPED" : Math.random() < 0.05 ? "RUNNING" : "SUCCEEDED";
  const durationSec = level === "error" ? randInt(10, 300) : randInt(60, 7200);
  const ERROR_CODES = ["GlueException","AccessDenied","ConnectionFailure","ResourceNotFound","ValidationException"];
  const ERROR_MSGS = ["Access Denied calling getDynamicFrame","ClassCastException: StringType to LongType","Connection to Redshift failed: max_connections exceeded","GlueException: Could not find table"];
  const isErr = level === "error";
  const MSGS = { info:["Job run started with 10 DPUs","Reading from S3 path: s3://data-lake/raw/","Schema inferred: 47 columns detected","Writing 2,847,291 records to target","Crawler completed: 3 tables updated","Bookmark updated: processed up to offset 9823741"],warn:["Schema mismatch: column type changed","Null values in non-nullable column","DPU utilization at 94%","Duplicate primary keys detected"],error:ERROR_MSGS };
  const plainMessage = rand(MSGS[level]);
  // Continuous logging: emit JSON in message so ingest pipeline can parse into glue.parsed
  const useContinuousLogging = Math.random() < 0.65;
  const message = useContinuousLogging
    ? JSON.stringify({
        jobName: job,
        jobRunId: runId,
        level: level.toUpperCase(),
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        thread: `driver-${randId(8).toLowerCase()}`,
        logger: rand(["org.apache.spark","com.amazonaws.glue","org.apache.hadoop"]),
        ...(isErr ? { errorCode: rand(ERROR_CODES) } : {}),
      })
    : plainMessage;
  // Job metrics (when "Enable job metrics" is on in Glue)
  const glueMetrics = {
    driver: {
      aggregate: { numRecords: recordsRead, numFailedRecords: recordsFailed },
      BlockManager: { disk: { diskSpaceUsed_MB: randInt(128, 2048) } },
    },
    executor: {
      aggregate: { numCompletedTasks: randInt(10, 500), numFailedTasks: isErr ? randInt(1, 20) : 0 },
    },
  };
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"glue" } },
    "aws": {
      dimensions: { JobName: job, JobRunId: runId, Type: jobType },
      glue: {
        job: { name: job, run_id: runId, type: jobType, run_state: runState },
        database: db,
        table: rand(["events","users","transactions","sessions","products"]),
        dpu_seconds: dpus * randInt(60, 3600),
        worker: { type: rand(["G.1X","G.2X","G.4X"]), count: dpus },
        records: { read: recordsRead, written: recordsWritten, errors: recordsFailed },
        glue_version: rand(["3.0","4.0"]),
        crawler_name: Math.random() < 0.3 ? rand(["raw-crawler","curated-crawler","analytics-crawler"]) : null,
        connection_name: Math.random() < 0.25 ? rand(["redshift-prod","jdbc-staging","s3-data"]) : null,
        continuous_logging: useContinuousLogging,
        metrics: glueMetrics,
      }
    },
    "log": { level },
    "event": { duration: durationSec * 1e9, outcome: isErr ? "failure" : "success", category: "process", dataset: "aws.glue", provider: "glue.amazonaws.com" },
    "message": message,
    ...(isErr ? { error: { code: rand(ERROR_CODES), message: rand(ERROR_MSGS), type: "service" } } : {}),
  };
}

function generateSageMakerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const domain = rand(["ds-platform","ml-research","cv-team","nlp-experiments","risk-models"]);
  const domainId = `d-${randId(10).toLowerCase()}`;
  const user = rand(["alice-ds","bob-ml","carol-research","dan-platform"]);
  const model = rand(["xgboost-classifier","bert-finetuned","resnet50-custom","lstm-timeseries","llama-finetuned"]);
  const jobType = rand(["Training","Processing","Transform","HyperparameterTuning","Pipeline","Endpoint"]);
  const jobName = `${model}-${jobType.toLowerCase()}-${randId(6).toLowerCase()}`;
  const isErr = level === "error";
  const isStudio = Math.random() < 0.45;
  const STUDIO_APP_TYPES = ["JupyterServer","KernelGateway","JupyterLab","CodeEditor","RStudio","RSession"];
  const STUDIO_SPACES = ["ml-research","cv-team","ds-platform","nlp-experiments","risk-models"];
  const CLASSIC_ACTIONS = ["TrainingJobStarted","TrainingJobCompleted","ProcessingJobStarted","EndpointInService","PipelineExecutionStarted","ModelRegistered"];
  const STUDIO_ACTIONS = ["AppCreated","AppReady","AppDeleted","LifecycleConfigOnStart","SpaceCreated"];
  const action = isStudio ? rand(STUDIO_ACTIONS) : rand(CLASSIC_ACTIONS);
  const lifecycleConfig = isStudio && action === "LifecycleConfigOnStart";
  const durationSec = parseFloat(randFloat(isErr ? 5 : 60, isErr ? 600 : 14400));
  const ERROR_CODES = ["CapacityError","ResourceNotFound","ValidationException","InternalServerError"];
  const ERROR_MSGS = ["Training job failed: CUDA out of memory","Endpoint creation failed: No capacity for ml.p4d.24xlarge","Model deployment failed: health check timeout"];
  const MSGS = { info:["Training job started on ml.p3.2xlarge (4 GPUs)","Epoch 12/50 - loss: 0.2341, val_loss: 0.2518, accuracy: 0.9124","Model artifact uploaded to s3://models/output/","Endpoint InService: latency p50=12ms p99=47ms","Feature Store ingestion complete: 4,829,201 records","Model registered: fraud-detector v12 (AUC: 0.9923)"],warn:["GPU utilization low: 34%","Training loss plateau detected at epoch 28","Model drift detected: PSI=0.18","Spot instance interruption, checkpointing..."],error:ERROR_MSGS };
  const plainMessage = rand(MSGS[level]);
  const spaceName = rand(STUDIO_SPACES);
  const appType = rand(STUDIO_APP_TYPES);
  const useStudioLogging = isStudio && Math.random() < 0.55;
  const message = useStudioLogging
    ? JSON.stringify({ domainId, space: spaceName, appType, user, level: level.toUpperCase(), message: plainMessage, timestamp: new Date(ts).toISOString(), event: action })
    : plainMessage;
  const trainingMetrics = { training_loss: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)), accuracy: parseFloat((Math.random() * 0.3 + 0.7).toFixed(4)), epoch: randInt(1, 100), gpu_utilization_pct: randInt(40, 99), cpu_utilization_pct: randInt(30, 90) };
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"sagemaker" } },
    "aws": {
      sagemaker: {
        domain_id: domainId,
        domain_name: domain,
        user_profile: user,
        job: { name: jobName, type: jobType, arn: `arn:aws:sagemaker:${region}:${acct.id}:training-job/${jobName}` },
        model: { name: model, version: randInt(1, 25) },
        pipeline: { name: rand(["feature-engineering-pipeline","model-training-pipeline"]), execution_id: `pipe-${randId(12).toLowerCase()}` },
        instance: { type: rand(["ml.p3.2xlarge","ml.g4dn.xlarge","ml.m5.xlarge"]), count: rand([1,1,2,4]) },
        metrics: trainingMetrics,
        studio: isStudio ? { space_name: spaceName, app_type: appType, app_name: rand(["default", `instance-${randId(8).toLowerCase()}`]), lifecycle_config: lifecycleConfig, continuous_logging: useStudioLogging } : { space_name: null, app_type: null, app_name: null, lifecycle_config: false, continuous_logging: false },
      }
    },
    "log": { level },
    "user": { name: user },
    "event": { action, duration: durationSec * 1e9, outcome: isErr ? "failure" : "success", category: "machine_learning", dataset: "aws.sagemaker", provider: "sagemaker.amazonaws.com" },
    "message": message,
    ...(isErr ? { error: { code: rand(ERROR_CODES), message: rand(ERROR_MSGS), type: "service" } } : {}),
  };
}

function generateAthenaLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const queries = ["SELECT date_trunc('day', event_time), count(*) FROM events GROUP BY 1","SELECT user_id, sum(revenue) FROM transactions WHERE dt >= '2024-01-01' GROUP BY 1","CREATE TABLE analytics.daily_summary AS SELECT * FROM raw.events","SELECT p.name, count(o.id) FROM products p JOIN orders o ON p.id = o.product_id GROUP BY 1"];
  const dur = parseFloat(randFloat(0.5, isErr?300:60)); const dataScanned = isErr?0:randInt(1024,10737418240);
  const queryId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const workgroup = rand(["primary","analytics","bi-users"]); const database = rand(["analytics","raw","staging"]);
  const plainMessage = isErr ? `Athena query FAILED after ${dur.toFixed(1)}s: ${rand(["QUERY_TIMED_OUT","TABLE_NOT_FOUND","PERMISSION_DENIED"])}` : `Athena query SUCCEEDED in ${dur.toFixed(1)}s, scanned ${Math.round(dataScanned/1048576)}MB`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ queryId, workgroup, database, state: isErr?"FAILED":"SUCCEEDED", durationSeconds: dur, dataScannedBytes: dataScanned, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"athena" } },
    "aws": { athena: { query_id: queryId, workgroup, database, state: isErr?"FAILED":"SUCCEEDED", duration_seconds: dur, data_scanned_bytes: dataScanned, data_scanned_mb: Math.round(dataScanned/1048576), engine_version: rand(["Athena engine version 3","DuckDB 0.9.1"]), structured_logging: useStructuredLogging, error_code: isErr ? rand(["QUERY_TIMED_OUT","PERMISSION_DENIED","TABLE_NOT_FOUND"]) : null } },
    "db": { statement: rand(queries), type: "sql" },
    "event": { duration: dur*1e9, outcome: isErr?"failure":"success", category: "database", dataset: "aws.athena", provider: "athena.amazonaws.com" },
    "message": message,
    "log": { level: isErr?"error":dur>30?"warn":"info" },
    ...(isErr ? { error: { code: rand(["QUERY_TIMED_OUT","PERMISSION_DENIED","TABLE_NOT_FOUND"]), message: "Athena query failed", type: "db" } } : {}),
  };
}

function generateBedrockLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const models = ["anthropic.claude-3-5-sonnet-20241022-v2:0","anthropic.claude-3-haiku-20240307-v1:0","amazon.titan-text-express-v1","meta.llama3-70b-instruct-v1:0","mistral.mixtral-8x7b-instruct-v0:1","amazon.nova-pro-v1:0"];
  const model = rand(models); const inputTokens = randInt(50,8000); const outputTokens = randInt(50,isErr?0:4000);
  const lat = parseFloat(randFloat(0.5, isErr?30:15));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"bedrock"}},"aws":{bedrock:{model_id:model,invocation_latency_ms:Math.round(lat*1000),input_token_count:inputTokens,output_token_count:outputTokens,total_token_count:inputTokens+outputTokens,stop_reason:isErr?null:rand(["end_turn","max_tokens","stop_sequence"]),error_code:isErr?rand(["ThrottlingException","ModelTimeoutException","ModelErrorException"]):null,use_case:rand(["text-generation","summarization","classification","extraction","qa"]),guardrail_action:rand(["NONE","NONE","NONE","INTERVENED"])}},"event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.bedrock",provider:"bedrock.amazonaws.com",duration:lat*1e9},"message":isErr?`Bedrock ${model.split(".")[1].split("-")[0]} invocation FAILED: ${rand(["ThrottlingException","ModelTimeoutException"])}`:`Bedrock ${model.split(".")[1].split("-")[0]} ${inputTokens}->${outputTokens} tokens ${lat.toFixed(2)}s`,"log":{level:isErr?"error":lat>10?"warn":"info"},...(isErr?{error:{code:rand(["ThrottlingException","ModelTimeoutException","ModelErrorException"]),message:"Bedrock invocation failed",type:"ml"}}:{}) };
}

function generateBedrockAgentLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const agentId = `T${randId(11).toUpperCase()}`;
  const aliasId = rand(["TSTALIASID", "LIVE"]);
  const sessionId = randId(32).toLowerCase();
  const action = rand(["InvokeAgent","Retrieve","InvokeAgentWithResponseStream"]);
  const kbId = `KB${randId(9).toUpperCase()}`;
  const inputTokens = randInt(100, 4000); const outputTokens = randInt(50, isErr ? 0 : 2000);
  const dur = parseFloat(randFloat(0.3, isErr ? 15 : 8));
  return {
    "@timestamp": ts,
    "cloud": { provider: "aws", region, account: { id: acct.id, name: acct.name }, service: { name: "bedrock-agent" } },
    "aws": {
      bedrockagent: {
        agent_id: agentId,
        agent_alias_id: aliasId,
        session_id: sessionId,
        action,
        knowledge_base_id: action === "Retrieve" ? kbId : null,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        invocation_latency_ms: Math.round(dur * 1000),
        orchestration_trace: rand([null, { model_invocation: { model_arn: `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-5-sonnet-v2` } }]),
        guardrail_action: rand(["NONE", "NONE", "INTERVENED"]),
        error_code: isErr ? rand(["ValidationException", "ThrottlingException", "ServiceQuotaExceededException"]) : null,
      },
    },
    "event": { outcome: isErr ? "failure" : "success", category: "machine_learning", dataset: "aws.bedrockagent", provider: "bedrock-agent-runtime.amazonaws.com", duration: dur * 1e9 },
    "message": isErr ? `Bedrock Agent ${agentId} ${action} FAILED` : `Bedrock Agent ${agentId}: ${action} ${inputTokens}→${outputTokens} tokens ${dur.toFixed(2)}s`,
    "log": { level: isErr ? "error" : "info" },
    ...(isErr ? { error: { code: "BedrockAgentError", message: "Agent invocation failed", type: "ml" } } : {}),
  };
}

function generateBillingLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const service = rand(["AmazonEC2", "AmazonS3", "AWSDataTransfer", "AmazonRDS", "AmazonCloudWatch", "AmazonLambda", "AWSSupport"]);
  const usageType = rand(["USE2-BoxUsage", "Requests-Tier1", "DataTransfer-Out-Bytes", "InstanceUsage", "Lambda-Request"]);
  const amount = parseFloat(randFloat(0.01, isErr ? 5000 : 500));
  const currency = "USD";
  const period = new Date(ts); period.setUTCDate(1); period.setUTCHours(0,0,0,0);
  return {
    "@timestamp": ts,
    "cloud": { provider: "aws", region, account: { id: acct.id, name: acct.name }, service: { name: "billing" } },
    "aws": {
      billing: {
        service: service,
        usage_type: usageType,
        estimated_charges: amount,
        currency,
        period_start: period.toISOString().slice(0, 10),
        linked_account_id: acct.id,
        dimensions: { Service: service, LinkedAccount: acct.id, UsageType: usageType },
        metrics: { EstimatedCharges: { sum: amount }, NumberOfRequests: { sum: randInt(1, 1000000) } },
      },
    },
    "event": { outcome: isErr ? "failure" : "success", category: "metric", dataset: "aws.billing", provider: "ce.amazonaws.com", duration: 0 },
    "message": isErr ? `Billing anomaly: ${service} ${amount.toFixed(2)} ${currency}` : `Billing: ${service} ${amount.toFixed(2)} ${currency}`,
    "log": { level: isErr ? "warn" : "info" },
    ...(isErr ? { error: { code: "BillingAnomaly", message: "Unusual cost detected", type: "billing" } } : {}),
  };
}

function generateKinesisAnalyticsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["clickstream-analytics","fraud-detection-stream","real-time-metrics","session-aggregator","anomaly-detector"]);
  const rps = randInt(100, isErr?50000:10000);
  const lagMs = randInt(0, isErr?60000:1000);
  const plainMessage = isErr ? `Kinesis Analytics ${app} error: ${rand(["CheckpointFailure","KPU_LIMIT_EXCEEDED","OOM"])}` : `Kinesis Analytics ${app}: ${rps} rec/s, lag ${randInt(0,500)}ms`;
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging ? JSON.stringify({ applicationName: app, recordsPerSecond: rps, inputWatermarkLagMs: lagMs, level: isErr?"error":"info", message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  const metrics = { records_in_per_second: rps, input_watermark_lag_ms: lagMs, kpu_utilization_pct: randInt(20, isErr?99:80), checkpoint_duration_ms: randInt(100, isErr?30000:2000) };
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"kinesisanalytics" } },
    "aws": {
      kinesisanalytics: {
        application_name: app,
        application_arn: `arn:aws:kinesisanalytics:${region}:${acct.id}:application/${app}`,
        runtime: rand(["FLINK-1_18","FLINK-1_15","SQL-1_0"]),
        records_per_second: rps,
        input_watermark_lag_ms: lagMs,
        checkpointing_enabled: true,
        last_checkpoint_duration_ms: randInt(100, isErr?30000:2000),
        kpu_count: randInt(1,64),
        structured_logging: useStructuredLogging,
        metrics,
        error: isErr ? rand(["CheckpointFailure","OutOfMemory","KPU_LIMIT_EXCEEDED"]) : null,
      }
    },
    "event": { outcome: isErr?"failure":"success", category:"process", dataset:"aws.kinesisanalytics", provider:"kinesisanalytics.amazonaws.com", duration: randInt(100, isErr?30000:2000)*1e6 },
    "message": message,
    "log": { level: isErr?"error":"info" },
    ...(isErr ? { error: { code: rand(["CheckpointFailure","OutOfMemory","KPU_LIMIT_EXCEEDED"]), message: "Kinesis Analytics application error", type: "stream" } } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE & CONTAINERS (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateEcrLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const repo = rand(["web-app","api-service","worker","base-image","ml-inference","nginx-custom"]);
  const tag = rand(["latest","v1.2.3","main","release-42","sha-a3f1bc"]);
  const action = rand(["push","pull","pull","pull","scan","delete"]);
  const SCAN_SEVS = ["CRITICAL","HIGH","MEDIUM"];
  const ECR_ERROR_CODES = ["ScanFindings","ImageNotFound","AccessDenied","RateLimitExceeded"];
  const errMsg = isErr ? `ECR scan: ${repo}:${tag} found ${randInt(1,30)} vulnerabilities [${rand(SCAN_SEVS)}]` : null;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"ecr"}},
    "aws":{ecr:{repository_name:repo,registry_id:`${acct.id}`,image_tag:tag,
      image_digest:`sha256:${randId(40).toLowerCase()}`,action,
      image_size_bytes:randInt(5e6,2e9),
      pushed_by:rand(["codebuild","github-actions","developer","ci-pipeline"]),
      scan_status:isErr?"COMPLETE_WITH_FINDINGS":action==="scan"?"COMPLETE":"NOT_STARTED",
      finding_severity:isErr?rand(SCAN_SEVS):null,
      finding_count:isErr?randInt(1,30):0,
      vulnerability_scan_enabled:true}},
    "event":{outcome:isErr?"failure":"success",category:"package",dataset:"aws.ecr",provider:"ecr.amazonaws.com"},
    "message":isErr?errMsg:`ECR ${action}: ${repo}:${tag}`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(ECR_ERROR_CODES), message: errMsg, type: "package" } } : {})};
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
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"fargate"}},
    "aws":{
      dimensions: { ClusterName:clusterName, TaskId:taskId, TaskDefinition:taskDef },
      fargate:{cluster_name:clusterName,task_id:taskId,
        task_definition:taskDef,
        structured_logging:useStructuredLogging,
        cpu_units:rand([256,512,1024,2048,4096]),memory_mb:rand([512,1024,2048,4096,8192]),
        platform_version:rand(["1.4.0","LATEST"]),
        cpu_utilized_percent:level==="error"?randInt(90,100):randInt(10,80),
        memory_utilized_percent:level==="error"?randInt(90,100):randInt(20,75)}},
    "container":{name:task},"log":{level},
    "event":{outcome:level==="error"?"failure":"success",category:"container",dataset:"aws.ecs_fargate",provider:"ecs.amazonaws.com",duration:durationSec*1e9},
    "message":message,
    ...(level === "error" ? { error: { code: rand(FARGATE_ERROR_CODES), message: rand(MSGS.error), type: "container" } } : {})};
}

function generateAutoScalingLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const asg = rand(["web-asg","api-asg","worker-asg","batch-asg","spot-fleet"]);
  const action = rand(["Launch","Terminate","Launch","Launch","HealthCheck"]);
  const reason = action==="Launch" ? rand(["Scale out triggered: capacity below desired","Scheduled action triggered","Unhealthy instance replaced"]) :
    action==="Terminate" ? rand(["Scale in: reducing to desired","Spot interruption","Instance unhealthy"]) :
    rand(["EC2 health check passed","ELB health check: InService"]);
  const failReasons = ["No capacity","Launch template error","VPC limit"];
  const errMsg = isErr ? `AutoScaling ${asg}: ${action} FAILED - ${rand(failReasons)}` : null;
  const ASG_ERROR_CODES = ["InsufficientCapacity","LaunchTemplateError","VpcLimitExceeded"];
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"autoscaling"}},
    "aws":{autoscaling:{group_name:asg,
      activity_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      action_type:action,instance_id:`i-${randId(17).toLowerCase()}`,
      instance_type:rand(["t3.medium","m5.xlarge","c5.2xlarge","r5.large"]),
      desired_capacity:randInt(2,20),min_size:2,max_size:50,
      current_capacity:randInt(2,20),cause:reason,
      status_code:isErr?"Failed":"Successful",
      launch_template:rand(["web-lt:5","api-lt:3","worker-lt:8"])}},
    "event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.autoscaling",provider:"autoscaling.amazonaws.com"},
    "message":isErr?errMsg:`AutoScaling ${asg}: ${action} instance`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(ASG_ERROR_CODES), message: errMsg, type: "host" } } : {})};
}

function generateImageBuilderLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const pipeline = rand(["golden-ami-pipeline","container-base-pipeline","windows-hardened","amazon-linux-cis"]);
  const phase = rand(["BUILD","TEST","DISTRIBUTE","DEPROVISION"]);
  const dur = randInt(300, isErr?3600:1800);
  const IB_FAIL_MSGS = ["Component script error","Test validation failed","SSM agent timeout"];
  const errMsg = isErr ? `Image Builder ${pipeline} FAILED at ${phase}: ${rand(IB_FAIL_MSGS)}` : null;
  const IMAGEBUILDER_ERROR_CODES = ["ComponentError","ValidationFailed","SsmTimeout"];
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"imagebuilder"}},
    "aws":{
      dimensions: { PipelineName:pipeline, Phase:phase },
      imagebuilder:{pipeline_name:pipeline,image_version:`${randInt(1,5)}.${randInt(0,20)}.${randInt(0,10)}/1`,
        phase,phase_status:isErr?"FAILED":"COMPLETED",duration_seconds:dur,
        os:rand(["Amazon Linux 2023","Ubuntu 22.04","Windows Server 2022","RHEL 9"]),
        recipe_name:rand(["web-server-recipe","hardened-base","docker-host"]),
        ami_id:isErr?null:`ami-${randId(8).toLowerCase()}`}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.imagebuilder",provider:"imagebuilder.amazonaws.com"},
    "message":isErr?errMsg:`Image Builder ${pipeline} ${phase} COMPLETED in ${dur}s`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(IMAGEBUILDER_ERROR_CODES), message: errMsg, type: "process" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORKING (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateNlbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const proto = rand(["TCP","TLS","UDP"]);
  const port = rand([443,80,22,3306,5432,6379,8080]);
  const status = isErr ? rand(["connection_error","timeout","target_not_found"]) : "success";
  const lbName = `net/prod-nlb-${region}/${randId(16).toLowerCase()}`;
  const connDuration = randInt(1, isErr ? 30000 : 5000);
  const bytes = randInt(64, 1048576);
  const targetIp = randIp();
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"nlb" } },
    "aws": {
      dimensions: { LoadBalancer:lbName, Protocol:proto, Port:String(port) },
      elb: {
        name: lbName,
        type: "network",
        listener: `arn:aws:elasticloadbalancing:${region}:${acct.id}:listener/net/prod-nlb/${randId(16).toLowerCase()}/${randId(16).toLowerCase()}`,
        protocol: proto,
        "connection_duration.sec": connDuration / 1000,
        "tls.cipher_suite": proto === "TLS" ? "ECDHE-RSA-AES128-GCM-SHA256" : undefined,
        "tls.protocol_version": proto === "TLS" ? "TLSv1.3" : undefined,
        "backend.ip": targetIp,
        "backend.port": String(port),
        "error.reason": isErr ? status : undefined,
        "received_bytes": bytes,
        "sent_bytes": randInt(64, 1048576),
      },
      nlb: {
        load_balancer: lbName,
        listener_port: port,
        protocol: proto,
        connection_duration_ms: connDuration,
        tls_cipher: proto === "TLS" ? "ECDHE-RSA-AES128-GCM-SHA256" : null,
        tls_protocol: proto === "TLS" ? "TLSv1.3" : null,
        target_ip: targetIp,
        target_port: port,
        connection_log_status: status,
        bytes,
        packets: randInt(1, 100),
      }
    },
    "source": { ip:randIp(), port:randInt(1024,65535) },
    "network": { transport:proto.toLowerCase(), bytes },
    "event": { outcome:isErr?"failure":"success", category:"network", dataset:"aws.elb_logs", provider:"elasticloadbalancing.amazonaws.com", duration:connDuration * 1e6 },
    "message": isErr ? `NLB ${proto}:${port} connection ${status}` : `NLB ${proto}:${port} ${bytes}B in ${connDuration}ms`,
    "log": { level:isErr?"warn":"info" },
    ...(isErr ? { error: { code: status, message: `NLB connection ${status}`, type: "network" } } : {})
  };
}

function generateGlobalAcceleratorLog(ts, er) {
  const acct = randAccount(); const region = rand(REGIONS); const isErr = Math.random() < er;
  const ep = rand(["us-east-1-alb","eu-west-2-alb","us-east-1-nlb"]);
  const health = isErr ? "UNHEALTHY" : "HEALTHY";
  const rttMs = randInt(5, isErr ? 500 : 80);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"globalaccelerator"}},
    "aws":{globalaccelerator:{
      accelerator_arn:`arn:aws:globalaccelerator::${acct.id}:accelerator/${randId(8)}`.toLowerCase(),
      listener_port:rand([80,443]),protocol:rand(["TCP","UDP"]),
      endpoint_group_region:rand(REGIONS),endpoint_id:ep,
      endpoint_health:health,client_ip:randIp(),
      rtt_ms:rttMs,processing_time_ms:randInt(1,20)}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.globalaccelerator",provider:"globalaccelerator.amazonaws.com",duration:rttMs*1e6},
    "message":isErr?`Global Accelerator: ${ep} UNHEALTHY - traffic rerouting`:
      `Global Accelerator: ${ep} healthy, RTT ${rttMs}ms`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: "EndpointUnhealthy", message: `Endpoint ${ep} UNHEALTHY - traffic rerouting`, type: "network" } } : {})};
}

function generateTransitGatewayLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const tgwId = `tgw-${randId(17).toLowerCase()}`;
  const action = isErr ? "drop" : rand(["accept","accept","accept","blackhole"]);
  const proto = rand([6,17,1]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"transitgateway"}},
    "aws":{transitgateway:{tgw_id:tgwId,
      tgw_attachment_id:`tgw-attach-${randId(17).toLowerCase()}`,
      resource_type:rand(["vpc","vpn","direct-connect-gateway","peering"]),
      src_vpc_id:`vpc-${randId(8).toLowerCase()}`,dst_vpc_id:`vpc-${randId(8).toLowerCase()}`,
      action,bytes:randInt(64,65535),packets:randInt(1,100),
      protocol:PROTOCOLS[proto]||"TCP"}},
    "source":{ip:randIp(),port:randInt(1024,65535)},
    "destination":{ip:randIp(),port:rand([80,443,22,3306,5432])},
    "network":{transport:(PROTOCOLS[proto]||"TCP").toLowerCase(),bytes:randInt(64,65535)},
    "event":{action,outcome:action==="drop"||action==="blackhole"?"failure":"success",category:"network",dataset:"aws.transitgateway",provider:"ec2.amazonaws.com"},
    "message":`TGW ${tgwId} ${action.toUpperCase()} ${PROTOCOLS[proto]||"TCP"} flow`,
    "log":{level:action==="drop"||action==="blackhole"?"warn":"info"},
    ...(action==="drop"||action==="blackhole" ? { error: { code: "FlowDropped", message: `TGW ${action} - no route or blackhole`, type: "network" } } : {})};
}

function generateDirectConnectLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const connId = `dxcon-${randId(8).toLowerCase()}`;
  const bandwidth = rand(["1Gbps","10Gbps","100Gbps"]);
  const state = isErr ? rand(["down","deleted"]) : "available";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"directconnect"}},
    "aws":{directconnect:{connection_id:connId,
      connection_name:`dx-${rand(["primary","secondary","backup"])}`,
      bandwidth,connection_state:state,
      vlan:randInt(100,4000),asn:randInt(64512,65534),
      bgp_status:isErr?"down":"up",bgp_peer_ip:randIp(),
      bytes_in:randInt(0,1e9),bytes_out:randInt(0,1e9),
      location:rand(["EQC2","DFW2","LAX","LHR1"])}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.directconnect",provider:"directconnect.amazonaws.com"},
    "message":isErr?`Direct Connect ${connId} (${bandwidth}) DOWN - BGP session lost`:
      `Direct Connect ${connId} (${bandwidth}): BGP up, ${rand(["12.4","45.2","123.8"])} Mbps`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: "BgpSessionDown", message: `Direct Connect ${connId} DOWN - BGP session lost`, type: "network" } } : {})};
}

function generateVpnLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const vpnId = `vpn-${randId(8).toLowerCase()}`;
  const tunnelState = isErr ? "DOWN" : "UP";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"vpn"}},
    "aws":{vpn:{vpn_connection_id:vpnId,
      vpn_gateway_id:`vgw-${randId(8).toLowerCase()}`,
      customer_gateway_ip:randIp(),
      tunnel_state:tunnelState,
      tunnel_outside_ip:randIp(),
      tunnel_inside_cidr:rand(["169.254.10.0/30","169.254.11.0/30"]),
      phase1_status:tunnelState==="UP"?"ESTABLISHED":"FAILED",
      phase2_status:tunnelState==="UP"?"ESTABLISHED":"FAILED",
      bytes_in:randInt(0,1e8),bytes_out:randInt(0,1e8)}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.vpn",provider:"ec2.amazonaws.com"},
    "message":isErr?`Site-to-Site VPN ${vpnId} tunnel DOWN - IKE negotiation failed`:
      `Site-to-Site VPN ${vpnId} tunnel UP`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: "TunnelDown", message: "VPN tunnel DOWN - IKE negotiation failed", type: "network" } } : {})};
}

function generatePrivateLinkLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const svcName = `com.amazonaws.vpce.${region}.${rand(["s3","dynamodb","execute-api","secretsmanager","ssm"])}`;
  const endpointId = `vpce-${randId(17).toLowerCase()}`;
  const state = isErr ? rand(["rejected","failed"]) : rand(["available","pending"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"privatelink"}},
    "aws":{privatelink:{endpoint_id:endpointId,service_name:svcName,
      endpoint_type:rand(["Interface","Gateway","GatewayLoadBalancer"]),
      vpc_id:`vpc-${randId(8).toLowerCase()}`,state,
      private_dns_enabled:Math.random()>0.3}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.privatelink",provider:"ec2.amazonaws.com"},
    "message":isErr?`PrivateLink endpoint ${endpointId}: ${state} - ${rand(["Request rejected","Service unavailable"])}`:
      `PrivateLink endpoint ${endpointId} for ${svcName}: ${state}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: state, message: `PrivateLink endpoint ${endpointId}: ${state}`, type: "network" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY & IDENTITY (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateCognitoLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const pool = rand(["us-users","eu-users","mobile-users","b2b-customers"]);
  const action = rand(["SignIn","SignUp","ForgotPassword","ConfirmSignUp","TokenRefresh","AdminCreateUser","SignIn","SignIn"]);
  const user = `user-${randId(8).toLowerCase()}@example.com`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"cognito"}},
    "aws":{cognito:{user_pool_id:`${region}_${randId(9)}`,user_pool_name:pool,
      event_type:action,username:isErr?null:user,
      error_code:isErr?rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]):null,
      source_ip:randIp(),mfa_type:Math.random()>0.7?rand(["SOFTWARE_TOKEN_MFA","SMS_MFA"]):null}},
    "user":{name:isErr?null:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"authentication",dataset:"aws.cognito",provider:"cognito-idp.amazonaws.com"},
    "message":isErr?`Cognito ${action} FAILED: ${rand(["Incorrect password","User not found","Rate limit exceeded"])}`:
      `Cognito ${action} success [${pool}]`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(["NotAuthorizedException","UserNotFoundException","TooManyRequestsException"]), message: "Authentication failed", type: "authentication" } } : {})};
}

function generateKmsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const keyId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const op = rand(["Decrypt","Encrypt","GenerateDataKey","Sign","Verify","DescribeKey","EnableKeyRotation","ScheduleKeyDeletion"]);
  const keyAlias = rand(["alias/prod-s3-key","alias/rds-encryption","alias/backup-key","alias/secrets-key"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"kms"}},
    "aws":{kms:{key_id:keyId,key_alias:keyAlias,operation:op,
      principal_arn:`arn:aws:iam::${acct.id}:${rand(["user/alice","role/lambda-role","role/ecs-task-role"])}`,
      key_state:isErr?"PendingDeletion":"Enabled",
      encryption_algorithm:rand(["SYMMETRIC_DEFAULT","RSAES_OAEP_SHA_256"]),
      error_code:isErr?rand(["DisabledException","AccessDeniedException","KMSInvalidStateException"]):null}},
    "event":{action:op,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.kms",provider:"kms.amazonaws.com"},
    "message":isErr?`KMS ${op} FAILED on ${keyAlias}: ${rand(["Key disabled","Access denied","Key pending deletion"])}`:
      `KMS ${op}: ${keyAlias}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["DisabledException","AccessDeniedException","KMSInvalidStateException"]), message: "KMS operation failed", type: "access" } } : {})};
}

function generateSecretsManagerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const secret = rand(["prod/db/password","prod/api/key","staging/redis/auth","prod/oauth/secret","prod/stripe/api-key"]);
  const op = rand(["GetSecretValue","PutSecretValue","RotateSecret","CreateSecret","DeleteSecret","GetSecretValue","GetSecretValue"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"secretsmanager"}},
    "aws":{secretsmanager:{secret_name:secret,operation:op,
      rotation_enabled:op==="RotateSecret",
      accessed_by:rand(["lambda-function","ecs-task","ec2-instance","developer"]),
      last_rotated_date:new Date(Date.now()-randInt(0,30)*86400000).toISOString(),
      error_code:isErr?rand(["ResourceNotFoundException","AccessDeniedException"]):null}},
    "event":{action:op,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.secretsmanager",provider:"secretsmanager.amazonaws.com"},
    "message":isErr?`Secrets Manager ${op} on ${secret} FAILED: ${rand(["Access denied","Secret not found"])}`:
      `Secrets Manager ${op}: ${secret}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["ResourceNotFoundException","AccessDeniedException"]), message: "Secrets Manager operation failed", type: "access" } } : {})};
}

function generateAcmLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const domain = rand(["*.example.com","api.example.com","www.example.com","*.internal.corp"]);
  const status = isErr ? rand(["FAILED","REVOKED","EXPIRED"]) : rand(["ISSUED","ISSUED","PENDING_VALIDATION"]);
  const daysToExpiry = isErr ? randInt(-30,30) : randInt(30,365);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"acm"}},
    "aws":{acm:{
      certificate_arn:`arn:aws:acm:${region}:${acct.id}:certificate/${randId(8)}-${randId(4)}`.toLowerCase(),
      domain_name:domain,status,type:rand(["AMAZON_ISSUED","IMPORTED"]),
      days_to_expiry:daysToExpiry,key_algorithm:rand(["RSA_2048","EC_prime256v1"]),
      validation_method:rand(["DNS","EMAIL"]),
      renewal_status:isErr?"FAILED":"SUCCESS"}},
    "event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.acm",provider:"acm.amazonaws.com"},
    "message":isErr?`ACM certificate for ${domain}: ${status}${daysToExpiry<0?` (expired ${Math.abs(daysToExpiry)}d ago)`:""}`:
      `ACM certificate for ${domain}: ${status}, ${daysToExpiry}d remaining`,
    "log":{level:isErr?"error":daysToExpiry<30?"warn":"info"},
    ...(isErr ? { error: { code: status, message: `Certificate ${domain}: ${status}`, type: "certificate" } } : {})};
}

function generateIamIdentityCenterLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const user = rand(["alice@corp.com","bob@corp.com","carol@corp.com","svc-account@corp.com"]);
  const action = rand(["Authenticate","Authorize","ProvisionUser","AssignPermissionSet","RevokeAccess","MFAChallenge"]);
  const app = rand(["AWS Console","Salesforce","Slack","GitHub Enterprise","Jira","DataDog"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"identitycenter"}},
    "aws":{iam_identity_center:{event_type:action,user_name:user,application_name:app,
      permission_set:rand(["AdministratorAccess","ReadOnlyAccess","PowerUserAccess","BillingAccess"]),
      account_id:`${acct.id}`,
      error_code:isErr?rand(["AccessDeniedException","MFARequired"]):null,
      mfa_authenticated:Math.random()>0.2}},
    "user":{name:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"authentication",dataset:"aws.identitycenter",provider:"sso.amazonaws.com"},
    "message":isErr?`IAM Identity Center ${action} FAILED for ${user} on ${app}`:
      `IAM Identity Center ${action}: ${user} -> ${app}`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(["AccessDeniedException","MFARequired"]), message: "SSO authentication failed", type: "authentication" } } : {})};
}

function generateDetectiveLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isFinding = Math.random() < (er + 0.2);
  const behavior = rand(["Impossible Travel","New ASN","Unusual API Calls","Credential Compromise","Lateral Movement","Data Exfiltration","Brute Force"]);
  const sev = isFinding ? rand(["CRITICAL","HIGH","MEDIUM"]) : "LOW";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"detective"}},
    "aws":{detective:{entity_type:rand(["AwsAccount","AwsIamRole","AwsIamUser","Ec2Instance"]),
      entity_id:rand([`arn:aws:iam::${acct.id}:user/suspicious`,`i-${randId(17).toLowerCase()}`]),
      behavior_type:isFinding?behavior:"Normal",
      severity_score:isFinding?parseFloat(randFloat(50,99)):parseFloat(randFloat(0,30)),
      finding_count:isFinding?randInt(1,20):0}},
    "event":{kind:isFinding?"alert":"event",outcome:isFinding?"failure":"success",category:"intrusion_detection",dataset:"aws.detective",provider:"detective.amazonaws.com"},
    "message":isFinding?`Detective [${sev}]: ${behavior} detected - ${randInt(1,20)} related findings`:
      `Detective: entity behavior within normal baseline`,
    "log":{level:sev==="CRITICAL"?"error":sev==="HIGH"?"warn":"info"},
    ...(isFinding ? { error: { code: "AnomalousBehavior", message: `${behavior} detected`, type: "security" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE & TRANSFER (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateEfsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const fsId = `fs-${randId(8).toLowerCase()}`;
  const throughput = parseFloat(randFloat(1, isErr?500:200));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"efs"}},
    "aws":{efs:{file_system_id:fsId,
      file_system_name:rand(["prod-shared","jenkins-home","wordpress-content","ml-datasets"]),
      mount_target_id:`fsmt-${randId(8).toLowerCase()}`,
      availability_zone:`${region}${rand(["a","b","c"])}`,
      throughput_mode:rand(["bursting","provisioned","elastic"]),
      performance_mode:rand(["generalPurpose","maxIO"]),
      throughput_mbps:throughput,iops:randInt(100,isErr?50000:5000),
      client_connections:randInt(1,500),
      percent_io_limit:isErr?randInt(90,100):randInt(10,80),
      error_code:isErr?rand(["ThroughputLimitExceeded","FileLimitExceeded"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.efs",provider:"elasticfilesystem.amazonaws.com"},
    "message":isErr?`EFS ${fsId}: ${rand(["ThroughputLimitExceeded","I/O limit reached"])}`:
      `EFS ${fsId}: ${throughput.toFixed(1)} MB/s, ${randInt(1,500)} connections`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["ThroughputLimitExceeded","FileLimitExceeded"]), message: "EFS operation failed", type: "storage" } } : {})};
}

function generateFsxLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const fsType = rand(["WINDOWS","LUSTRE","NETAPP_ONTAP","OPENZFS"]);
  const MSGS = {
    error:["Storage capacity critically low (<10%)","Backup failed: snapshot error","Self-managed AD connectivity lost","Replication lag exceeded threshold"],
    warn:["Storage utilization above 80%","Throughput utilization above 70%","Backup RPO threshold approaching"],
    info:["Backup completed successfully","Storage capacity scaling complete","File system available","Snapshot created"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"fsx"}},
    "aws":{fsx:{file_system_id:`fs-${randId(17).toLowerCase()}`,file_system_type:fsType,
      deployment_type:fsType==="LUSTRE"?rand(["PERSISTENT_2","SCRATCH_2"]):rand(["MULTI_AZ_1","SINGLE_AZ_2"]),
      storage_capacity_gb:rand([1200,2400,4800,9600]),
      throughput_capacity_mbps:rand([128,256,512,1024,2048]),
      storage_used_percent:isErr?randInt(90,100):randInt(10,80)}},
    "event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.fsx",provider:"fsx.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(isErr ? { error: { code: "FsxError", message: rand(MSGS.error), type: "storage" } } : {})};
}

function generateDataSyncLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const src = rand(["nfs://on-prem-server/data","s3://source-bucket","smb://file-server/share"]);
  const dst = rand(["s3://prod-backup","efs://fs-prod/backup","s3://archive-bucket"]);
  const filesXfr = isErr?0:randInt(100,1000000);
  const durationSec = randInt(60, isErr?7200:3600);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"datasync"}},
    "aws":{datasync:{task_arn:`arn:aws:datasync:${region}:${acct.id}:task/task-${randId(17).toLowerCase()}`,
      source_location_uri:src,destination_location_uri:dst,
      status:isErr?"ERROR":"SUCCESS",
      files_transferred:filesXfr,
      bytes_transferred:filesXfr*randInt(1024,1048576),
      files_failed:isErr?randInt(1,100):0,
      duration_seconds:durationSec,
      error_code:isErr?rand(["InvalidS3Config","NfsPermissionError","NetworkError"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.datasync",provider:"datasync.amazonaws.com",duration:durationSec*1e9},
    "message":isErr?`DataSync FAILED: ${rand(["NFS permission denied","S3 access denied","Network timeout"])}`:
      `DataSync: ${filesXfr.toLocaleString()} files transferred from ${src.split("//")[0]}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["InvalidS3Config","NfsPermissionError","NetworkError"]), message: "DataSync task failed", type: "storage" } } : {})};
}

function generateBackupLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const resource = rand(["ec2/i-prod","rds/prod-db","dynamodb/users-table","efs/fs-prod","fsx/fs-prod"]);
  const plan = rand(["daily-backup-plan","critical-data-plan","compliance-backup","weekly-cold"]);
  const jobStatus = isErr ? rand(["FAILED","ABORTED","EXPIRED"]) : rand(["COMPLETED","COMPLETED","RUNNING"]);
  const backupSizeGb = isErr ? 0 : parseFloat(randFloat(0.1, 2000));
  const durationSec = randInt(60, isErr?3600:7200);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"backup"}},
    "aws":{backup:{backup_job_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      backup_plan_name:plan,resource_type:rand(["EC2","RDS","DynamoDB","EFS","FSx"]),
      backup_vault_name:rand(["Default","prod-vault","compliance-vault"]),
      status:jobStatus,backup_size_gb:backupSizeGb,
      lifecycle_delete_after_days:rand([7,30,90,365]),
      error_code:isErr?rand(["LIMIT_EXCEEDED","IAM_ROLE_ERROR","RESOURCE_NOT_FOUND"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.backup",provider:"backup.amazonaws.com",duration:durationSec*1e9},
    "message":isErr?`AWS Backup FAILED for ${resource}: ${rand(["IAM role insufficient","Resource locked","Vault full"])}`:
      `AWS Backup ${jobStatus}: ${resource} -> ${rand(["Default","prod-vault"])} (${backupSizeGb.toFixed(1)}GB)`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["LIMIT_EXCEEDED","IAM_ROLE_ERROR","RESOURCE_NOT_FOUND"]), message: "Backup job failed", type: "storage" } } : {})};
}

function generateStorageGatewayLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const gwType = rand(["FILE_S3","FILE_FSX","VOLUME","TAPE"]);
  const MSGS = {
    error:["Gateway offline: connection to AWS lost","Cache disk error: I/O failure","Upload buffer full","SMB authentication failed"],
    warn:["Cache disk usage above 80%","Upload buffer usage above 75%","Bandwidth throttling active"],
    info:["File uploaded to S3 successfully","Gateway activated","Cache refreshed","Volume snapshot complete"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"storagegateway"}},
    "aws":{storagegateway:{gateway_id:`sgw-${randId(8).toLowerCase()}`,
      gateway_name:`prod-sgw-${rand(["primary","backup","office"])}`,
      gateway_type:gwType,
      cache_used_percent:isErr?randInt(90,100):randInt(10,70),
      upload_buffer_used_percent:isErr?randInt(85,100):randInt(5,60),
      cloud_bytes_uploaded:randInt(0,1e9)}},
    "event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.storagegateway",provider:"storagegateway.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(isErr ? { error: { code: "GatewayError", message: rand(MSGS.error), type: "storage" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASES (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateAuroraLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const engine = rand(["aurora-mysql","aurora-postgresql"]);
  const cluster = rand(["prod-aurora-cluster","staging-aurora","analytics-aurora"]);
  const MSGS = {
    error:["Aurora failover initiated: primary instance unhealthy","ERROR 2013: Lost connection to MySQL","Replica lag exceeded 60 seconds","Deadlock detected","Storage auto-scaling failed"],
    warn:["Aurora replica lag: 8.4 seconds","Long-running query: 45s","Connections approaching max_connections","Slow query: full table scan"],
    info:["Aurora auto-scaling: adding replica","Multi-AZ failover completed in 22s","Global Database replication lag: 0.8s","Cluster endpoint updated"],
  };
  const level = isErr ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const durationSec = isErr ? randInt(5, 300) : randInt(1, 60);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"aurora"}},
    "aws":{aurora:{cluster_id:cluster,instance_id:`${cluster}-instance-${randInt(1,5)}`,
      engine,engine_version:engine.includes("mysql")?"8.0.36":"15.4",
      replica_lag_seconds:isErr?randInt(30,3600):parseFloat(randFloat(0,5)),
      db_connections:randInt(10,isErr?1000:500),max_connections:1000,
      failover_in_progress:isErr&&Math.random()>0.5}},
    "event":{outcome:isErr?"failure":"success",category:"database",dataset:"aws.aurora",provider:"rds.amazonaws.com",duration:durationSec*1e9},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(isErr ? { error: { code: "AuroraError", message: rand(MSGS.error), type: "db" } } : {})};
}

function generateNeptuneLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const cluster = rand(["prod-neptune","knowledge-graph","fraud-graph","recommendation-engine"]);
  const queryLang = rand(["Gremlin","SPARQL","openCypher"]);
  const dur = parseFloat(randFloat(1, isErr?30000:5000));
  const QUERIES = {
    Gremlin:["g.V().hasLabel('user').out('follows').count()","g.V(userId).repeat(out('knows')).times(3).path()"],
    SPARQL:["SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100","SELECT ?entity WHERE { ?entity rdf:type :Product }"],
    openCypher:["MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN count(f)","MATCH (n)-[r]->(m) WHERE n.id=$id RETURN n,r,m"],
  };
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"neptune"}},
    "aws":{neptune:{cluster_id:cluster,query_language:queryLang,
      query:rand(QUERIES[queryLang]),duration_ms:Math.round(dur),
      http_status:isErr?rand([400,429,500]):200,
      db_connections:randInt(1,isErr?500:200),
      error_code:isErr?rand(["QueryTimeout","ReadOnlyEngineException","ConcurrentModificationException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"database",dataset:"aws.neptune",provider:"neptune.amazonaws.com"},
    "message":isErr?`Neptune ${queryLang} FAILED after ${dur.toFixed(0)}ms: ${rand(["QueryTimeout","ConcurrentModification"])}`:
      `Neptune ${queryLang}: ${dur.toFixed(0)}ms`,
    "log":{level:isErr?"error":dur>5000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["QueryTimeout","ReadOnlyEngineException","ConcurrentModificationException"]), message: "Neptune query failed", type: "db" } } : {})};
}

function generateTimestreamLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const db = rand(["iot-metrics","infra-metrics","application-telemetry","financial-ticks"]);
  const table = rand(["device_telemetry","cpu_metrics","api_latency","sensor_readings"]);
  const op = rand(["WriteRecords","Query","Query","DescribeTable"]);
  const dur = parseFloat(randFloat(1, isErr?10000:2000));
  const records = randInt(100, isErr?0:50000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"timestream"}},
    "aws":{timestream:{database_name:db,table_name:table,operation:op,
      records_ingested:op==="WriteRecords"?records:0,
      rows_returned:op==="Query"?randInt(0,10000):0,
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["ThrottlingException","ResourceNotFoundException","RejectedRecordsException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"database",dataset:"aws.timestream",provider:"timestream.amazonaws.com"},
    "message":isErr?`Timestream ${op} FAILED on ${db}.${table}: ${rand(["RejectedRecords","Throttling","Not found"])}`:
      `Timestream ${op} on ${db}.${table}: ${op==="WriteRecords"?records+" records":dur.toFixed(0)+"ms"}`,
    "log":{level:isErr?"error":dur>5000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["ThrottlingException","ResourceNotFoundException","RejectedRecordsException"]), message: "Timestream operation failed", type: "db" } } : {})};
}

function generateQldbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const ledger = rand(["vehicle-registrations","supply-chain","financial-records","audit-trail"]);
  const table = rand(["Vehicles","Orders","Transactions","Users"]);
  const op = rand(["INSERT","UPDATE","SELECT","CREATE_INDEX","HISTORY"]);
  const dur = parseFloat(randFloat(1, isErr?5000:500));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"qldb"}},
    "aws":{qldb:{ledger_name:ledger,table_name:table,operation:op,
      transaction_id:randId(22).toLowerCase(),
      document_id:randId(22).toLowerCase(),
      revision_hash:randId(44).toLowerCase(),
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["TransactionExpiredException","OccConflictException","InvalidSessionException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"database",dataset:"aws.qldb",provider:"qldb.amazonaws.com"},
    "message":isErr?`QLDB ${op} on ${ledger}.${table} FAILED: ${rand(["OCC conflict","Transaction expired"])}`:
      `QLDB ${op} on ${ledger}.${table}: ${dur.toFixed(0)}ms`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["TransactionExpiredException","OccConflictException","InvalidSessionException"]), message: "QLDB transaction failed", type: "db" } } : {})};
}

function generateKeyspacesLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const keyspace = rand(["prod_keyspace","analytics","user_data","sensor_data"]);
  const table = rand(["users","sessions","time_series","inventory"]);
  const op = rand(["SELECT","INSERT","UPDATE","DELETE","BATCH"]);
  const dur = parseFloat(randFloat(1, isErr?5000:200));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"keyspaces"}},
    "aws":{keyspaces:{keyspace_name:keyspace,table_name:table,operation:op,
      read_capacity_units:isErr?0:parseFloat(randFloat(0.5,50)),
      write_capacity_units:isErr?0:parseFloat(randFloat(0.5,50)),
      rows_returned:op==="SELECT"?randInt(0,10000):0,
      duration_ms:Math.round(dur),cql_version:"3.11.2",
      error_code:isErr?rand(["ProvisionedThroughputExceededException","WriteConflictException","TimeoutException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"database",dataset:"aws.keyspaces",provider:"cassandra.amazonaws.com"},
    "message":isErr?`Keyspaces ${op} on ${keyspace}.${table} FAILED: ${rand(["Throughput exceeded","Write conflict","Timeout"])}`:
      `Keyspaces ${op} on ${keyspace}.${table}: ${dur.toFixed(0)}ms`,
    "log":{level:isErr?"error":dur>1000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["ProvisionedThroughputExceededException","WriteConflictException","TimeoutException"]), message: "Keyspaces operation failed", type: "db" } } : {})};
}

function generateMemoryDbLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const cluster = rand(["prod-memorydb","session-store","leaderboard","rate-limiter"]);
  const cmd = rand(["GET","SET","ZADD","ZRANGE","HSET","XADD","SETEX","INCR","DEL"]);
  const lat = parseFloat(randFloat(0.01, isErr?2000:50));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"memorydb"}},
    "aws":{memorydb:{cluster_name:cluster,node_name:`${cluster}-0001-001`,
      engine_version:"7.1",command:cmd,latency_us:lat,
      cache_hit_rate:isErr?0:parseFloat(randFloat(80,99)),
      connected_clients:randInt(10,500),
      used_memory_mb:randInt(256,65536),
      replication_lag_ms:randInt(0,isErr?5000:100),
      error_code:isErr?rand(["READONLY","OOM","WRONGTYPE"]):null}},
    "event":{duration:lat*1000,outcome:isErr?"failure":"success",category:"database",dataset:"aws.memorydb",provider:"memory-db.amazonaws.com"},
    "message":isErr?`MemoryDB ${cluster} ${cmd} FAILED: ${rand(["READONLY replica","OOM","WRONGTYPE"])}`:
      `MemoryDB ${cluster} ${cmd}: ${lat.toFixed(2)}us`,
    "log":{level:isErr?"error":lat>500?"warn":"info"},
    ...(isErr ? { error: { code: rand(["READONLY","OOM","WRONGTYPE"]), message: "MemoryDB command failed", type: "db" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING & MESSAGING (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateSnsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const topic = rand(["order-notifications","user-alerts","system-events","security-alarms","deployment-events"]);
  const protocol = rand(["email","sqs","lambda","http","sms"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"sns"}},
    "aws":{sns:{topic_arn:`arn:aws:sns:${region}:${acct.id}:${topic}`,
      message_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      protocol,delivery_status:isErr?rand(["FAILED","THROTTLED"]):"SUCCESS",
      message_size_bytes:randInt(100,256000),delivery_attempt:isErr?randInt(1,3):1,
      status_code:isErr?rand([400,500,429]):200,
      error_message:isErr?rand(["Endpoint disabled","HTTP timeout","Lambda error","SQS full"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.sns",provider:"sns.amazonaws.com"},
    "message":isErr?`SNS delivery FAILED: ${topic} -> ${protocol}: ${rand(["Endpoint disabled","Timeout","Lambda error"])}`:
      `SNS delivered: ${topic} -> ${protocol} (${randInt(100,50000)}B)`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: "DeliveryFailure", message: "SNS delivery failed", type: "messaging" } } : {})};
}

function generateAmazonMqLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const brokerType = rand(["ActiveMQ","RabbitMQ"]);
  const broker = rand(["prod-broker","events-broker","order-processor"]);
  const queue = rand(["order.queue","notification.exchange","payment.queue","dlq.orders"]);
  const MSGS = {
    error:["Broker disk usage exceeded 90%","Connection to secondary broker lost","Message redelivery limit: DLQ","JVM heap exhausted"],
    warn:["Queue depth above threshold: 45000 messages","Slow consumer: 10 msg/s","Broker memory usage: 78%"],
    info:["Message consumed successfully","Producer connected","Consumer registered","Queue purged"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"amazonmq"}},
    "aws":{amazonmq:{broker_id:`b-${randId(8)}-${randId(4)}`.toLowerCase(),
      broker_name:broker,broker_engine:brokerType,
      engine_version:brokerType==="ActiveMQ"?"5.17.6":"3.12.1",
      deployment_mode:rand(["SINGLE_INSTANCE","ACTIVE_STANDBY_MULTI_AZ"]),
      queue_name:queue,messages_in:randInt(0,10000),messages_out:randInt(0,10000),
      queue_depth:isErr?randInt(50000,500000):randInt(0,5000),
      broker_memory_percent:isErr?randInt(80,100):randInt(20,70)}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.amazonmq",provider:"mq.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(isErr ? { error: { code: "BrokerError", message: rand(MSGS.error), type: "messaging" } } : {})};
}

function generateAppSyncLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const api = rand(["prod-graphql-api","mobile-api","partner-api"]);
  const op = rand(["query","mutation","subscription"]);
  const resolver = rand(["getUserById","listOrders","createProduct","updateInventory","searchItems"]);
  const dur = parseFloat(randFloat(1, isErr?5000:500));
  const status = isErr ? rand([400,401,403,500]) : 200;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"appsync"}},
    "aws":{appsync:{api_id:randId(26),api_name:api,
      operation_type:op,operation_name:resolver,
      data_source_type:rand(["AMAZON_DYNAMODB","AWS_LAMBDA","HTTP","AMAZON_ELASTICSEARCH"]),
      duration_ms:Math.round(dur),status_code:status,
      error_type:isErr?rand(["UnauthorizedException","MappingTemplate","ExecutionTimeout","DatasourceError"]):null}},
    "http":{response:{status_code:status}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"api",dataset:"aws.appsync",provider:"appsync.amazonaws.com"},
    "message":isErr?`AppSync ${op}.${resolver} FAILED [${status}]: ${rand(["Unauthorized","MappingTemplate error","DatasourceError"])}`:
      `AppSync ${op}.${resolver}: ${dur.toFixed(0)}ms [${api}]`,
    "log":{level:isErr?"error":dur>1000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["UnauthorizedException","MappingTemplate","ExecutionTimeout","DatasourceError"]), message: "AppSync operation failed", type: "api" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPER & CI/CD (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateCodeCommitLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const repo = rand(["web-app","api-service","infrastructure","ml-models","shared-libs"]);
  const ev = rand(["ReferenceCreated","ReferenceUpdated","ReferenceDeleted","PullRequestCreated","PullRequestMerged","PullRequestApproved"]);
  const branch = rand(["main","develop","feature/new-auth","release/v2.1","hotfix/payment-bug"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"codecommit"}},
    "aws":{codecommit:{repository_name:repo,
      repository_arn:`arn:aws:codecommit:${region}:${acct.id}:${repo}`,
      event_type:ev,reference_name:branch,
      commit_id:randId(40).toLowerCase(),
      author:rand(["alice","bob","carol","github-actions","codebuild"]),
      files_changed:randInt(1,50),lines_added:randInt(0,500),lines_deleted:randInt(0,200),
      pull_request_id:ev.includes("PullRequest")?`${randInt(1,500)}`:null,
      merge_strategy:ev==="PullRequestMerged"?rand(["fast-forward","squash","three-way"]):null,
      error_code:isErr?rand(["EncryptionKeyUnavailableException","InvalidBranchNameException"]):null}},
    "user":{name:rand(["alice","bob","carol"])},
    "event":{action:ev,outcome:isErr?"failure":"success",category:"process",dataset:"aws.codecommit",provider:"codecommit.amazonaws.com"},
    "message":isErr?`CodeCommit ${ev} FAILED on ${repo}: ${rand(["Encryption key unavailable","Repository size limit"])}`:
      `CodeCommit ${ev}: ${repo}/${branch}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["EncryptionKeyUnavailableException","InvalidBranchNameException"]), message: "CodeCommit operation failed", type: "vcs" } } : {})};
}

function generateCodeArtifactLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const domain = rand(["corp-packages","internal","platform"]);
  const repo = rand(["npm-store","pypi-store","maven-central","nuget-store"]);
  const format = rand(["npm","pypi","maven","nuget"]);
  const pkg = rand(["my-lib","utils","api-client","shared-components"]);
  const ver = `${randInt(1,5)}.${randInt(0,20)}.${randInt(0,10)}`;
  const action = rand(["PublishPackageVersion","GetPackageVersionAsset","DeletePackageVersions","CopyPackageVersions"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"codeartifact"}},
    "aws":{codeartifact:{domain_name:domain,repository_name:repo,
      package_format:format,package_name:pkg,package_version:ver,action,
      asset_name:format==="npm"?`${pkg}-${ver}.tgz`:null,
      download_size_bytes:randInt(10000,50000000),
      upstream_repository:rand([null,"npm-upstream","pypi-upstream"]),
      error_code:isErr?rand(["ResourceNotFoundException","AccessDeniedException","ResourceAlreadyExistsException"]):null}},
    "event":{action,outcome:isErr?"failure":"success",category:"package",dataset:"aws.codeartifact",provider:"codeartifact.amazonaws.com"},
    "message":isErr?`CodeArtifact ${action} FAILED: ${pkg}@${ver} in ${domain}/${repo}`:
      `CodeArtifact ${action}: ${pkg}@${ver} [${format}] in ${domain}/${repo}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["ResourceNotFoundException","AccessDeniedException","ResourceAlreadyExistsException"]), message: "CodeArtifact operation failed", type: "package" } } : {})};
}

function generateAmplifyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["web-portal","mobile-backend","partner-dashboard","docs-site"]);
  const branch = rand(["main","staging","develop","feature-auth","production"]);
  const buildStatus = isErr ? rand(["FAILED","CANCELLED","TIMED_OUT"]) : rand(["SUCCEED","SUCCEED","RUNNING"]);
  const dur = randInt(60, isErr?1800:600);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"amplify"}},
    "aws":{amplify:{app_id:randId(10),app_name:app,branch_name:branch,
      job_id:`${randInt(1,1000)}`,job_type:rand(["RELEASE","RETRY","MANUAL","WEB_HOOK"]),
      build_status:buildStatus,duration_seconds:dur,
      commit_id:randId(40).toLowerCase(),
      commit_message:rand(["feat: add auth","fix: payment bug","chore: update deps"]),
      framework:rand(["React","Next.js","Vue","Gatsby","Angular"]),
      error_message:isErr?rand(["Build script failed","npm install error","Timeout"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.amplify",provider:"amplify.amazonaws.com"},
    "message":isErr?`Amplify build FAILED: ${app}/${branch} - ${rand(["Build script failed","npm error","Timeout"])}`:
      `Amplify build ${buildStatus}: ${app}/${branch} in ${dur}s`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: "BuildFailed", message: "Amplify build failed", type: "build" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateLakeFormationLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const db = rand(["analytics","raw_data","curated","data_lake"]);
  const table = rand(["events","users","transactions","products","clickstream"]);
  const action = rand(["Grant","Revoke","BatchGrantPermissions","GetDataAccess","CreateLakeFormationTag"]);
  const perms = rand([["SELECT"],["SELECT","INSERT"],["ALL"],["DESCRIBE"]]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lakeformation"}},
    "aws":{lakeformation:{database:db,table:table,action,
      principal_arn:`arn:aws:iam::${acct.id}:${rand(["role/analyst-role","user/alice","role/glue-role"])}`,
      permissions:perms,
      lf_tag_key:rand(["team","environment","classification","pii"]),
      lf_tag_values:rand([["prod"],["dev","staging"],["pii"]]),
      error_code:isErr?rand(["AccessDeniedException","EntityNotFoundException"]):null}},
    "event":{action,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.lakeformation",provider:"lakeformation.amazonaws.com"},
    "message":isErr?`Lake Formation ${action} FAILED on ${db}.${table}: ${rand(["Access denied","Entity not found"])}`:
      `Lake Formation ${action}: ${perms.join(",")} on ${db}.${table}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(["AccessDeniedException","EntityNotFoundException"]), message: "Lake Formation operation failed", type: "access" } } : {})};
}

function generateQuickSightLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const dashboard = rand(["sales-dashboard","executive-overview","marketing-funnel","ops-metrics"]);
  const user = rand(["alice@corp.com","bob@corp.com","carol@corp.com"]);
  const action = rand(["DescribeDashboard","GetDashboardEmbedUrl","CreateAnalysis","RefreshDataSet","ListDashboards"]);
  const dur = randInt(200, isErr?30000:5000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"quicksight"}},
    "aws":{quicksight:{dashboard_id:randId(36).toLowerCase(),dashboard_name:dashboard,
      action,user_name:user,
      data_source_type:rand(["AURORA","ATHENA","S3","REDSHIFT","RDS"]),
      query_duration_ms:dur,rows_returned:randInt(0,100000),
      error_code:isErr?rand(["AccessDeniedException","ResourceNotFoundException","ThrottlingException"]):null}},
    "user":{name:user},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"database",dataset:"aws.quicksight",provider:"quicksight.amazonaws.com"},
    "message":isErr?`QuickSight ${action} FAILED: ${dashboard} for ${user}`:
      `QuickSight ${action}: ${dashboard} loaded in ${dur}ms for ${user}`,
    "log":{level:isErr?"error":dur>10000?"warn":"info"},
    ...(isErr ? { error: { code: rand(["AccessDeniedException","ResourceNotFoundException","ThrottlingException"]), message: "QuickSight operation failed", type: "bi" } } : {})};
}

function generateDataBrewLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const dataset = rand(["customer-data","sales-csv","product-catalog","event-logs"]);
  const recipe = rand(["clean-customer-data","normalize-dates","remove-pii","fix-encoding"]);
  const dur = randInt(30, isErr?3600:600);
  const rowsProcessed = isErr?0:randInt(1000,10000000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"databrew"}},
    "aws":{databrew:{project_name:`${dataset}-project`,recipe_name:recipe,
      job_name:`${recipe}-job`,job_type:rand(["RECIPE","PROFILE"]),
      dataset_name:dataset,job_status:isErr?"FAILED":"SUCCEEDED",
      duration_seconds:dur,rows_processed:rowsProcessed,
      transform_steps:randInt(3,25),
      output_location:`s3://databrew-output/${dataset}/`,
      error_message:isErr?rand(["Input dataset not found","Data type mismatch","Access denied"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.databrew",provider:"databrew.amazonaws.com"},
    "message":isErr?`DataBrew job ${recipe} FAILED on ${dataset}: ${rand(["Type mismatch","Access denied","Schema error"])}`:
      `DataBrew job ${recipe}: ${rowsProcessed.toLocaleString()} rows in ${dur}s`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: "JobFailed", message: "DataBrew job failed", type: "process" } } : {})};
}

function generateAppFlowLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const flow = rand(["salesforce-to-s3","hubspot-sync","zendesk-export","marketo-to-redshift"]);
  const src = rand(["Salesforce","HubSpot","Zendesk","Marketo","ServiceNow","Slack"]);
  const dst = rand(["S3","Redshift","Snowflake","Salesforce","EventBridge"]);
  const records = isErr?0:randInt(100,1000000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"appflow"}},
    "aws":{appflow:{flow_name:flow,
      flow_arn:`arn:aws:appflow:${region}:${acct.id}:flow/${flow}`,
      source_connector_type:src,destination_connector_type:dst,
      trigger_type:rand(["Scheduled","Event","OnDemand"]),
      execution_status:isErr?"ExecutionFailed":"ExecutionSuccessful",
      records_processed:records,
      duration_ms:randInt(1000,isErr?300000:60000),
      error_message:isErr?rand(["Credentials expired","Rate limit exceeded","Schema mismatch"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.appflow",provider:"appflow.amazonaws.com",duration:randInt(1000,isErr?300000:60000)*1e6},
    "message":isErr?`AppFlow ${flow} (${src}->${dst}) FAILED: ${rand(["Credentials expired","Rate limit","Schema mismatch"])}`:
      `AppFlow ${flow}: ${records.toLocaleString()} records ${src}->${dst}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: "ExecutionFailed", message: "AppFlow execution failed", type: "integration" } } : {})};
}

// ═══════════════════════════════════════════════════════════════════════════
// AI & ML SERVICES (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateRekognitionLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectLabels","DetectFaces","RecognizeCelebrities","DetectModerationLabels","IndexFaces","SearchFacesByImage","DetectText"]);
  const dur = parseFloat(randFloat(50, isErr?5000:1000));
  const confidence = parseFloat(randFloat(70,99));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"rekognition"}},
    "aws":{rekognition:{operation:op,
      input_source:rand(["S3Object","Base64Image","Video"]),
      image_bytes:randInt(10000,10485760),duration_ms:Math.round(dur),
      labels_detected:isErr?0:randInt(1,50),faces_detected:isErr?0:randInt(0,20),
      max_confidence:isErr?0:confidence,confidence_threshold:70,
      moderation_labels:op==="DetectModerationLabels"&&!isErr?[rand(["Explicit Content","Violence"])]:null,
      error_code:isErr?rand(["InvalidS3ObjectException","AccessDeniedException","ThrottlingException","ImageTooLargeException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.rekognition",provider:"rekognition.amazonaws.com"},
    "message":isErr?`Rekognition ${op} FAILED: ${rand(["Image too large","Access denied","Throttled"])}`:
      `Rekognition ${op}: ${randInt(1,50)} results, ${confidence.toFixed(1)}% confidence`,
    ...(isErr?{error:{code:"RekognitionError",message:"Rekognition operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateTextractLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectDocumentText","AnalyzeDocument","StartDocumentAnalysis","GetDocumentAnalysis","AnalyzeExpense","AnalyzeID"]);
  const docType = rand(["invoice","tax-form","id-card","contract","receipt","bank-statement"]);
  const pages = randInt(1, isErr?0:50);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"textract"}},
    "aws":{textract:{operation:op,document_type:docType,
      job_id:op.startsWith("Start")||op.startsWith("Get")?randId(36).toLowerCase():null,
      job_status:op.startsWith("Get")?(isErr?"FAILED":"SUCCEEDED"):null,
      pages_processed:pages,blocks_detected:pages*randInt(10,200),
      words_detected:pages*randInt(50,500),
      form_key_value_pairs:op==="AnalyzeDocument"?randInt(0,50):0,
      tables_detected:op==="AnalyzeDocument"?randInt(0,10):0,
      confidence_mean:parseFloat(randFloat(85,99)),
      error_code:isErr?rand(["UnsupportedDocumentException","DocumentTooLargeException","BadDocumentException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.textract",provider:"textract.amazonaws.com"},
    "message":isErr?`Textract ${op} FAILED on ${docType}: ${rand(["Unsupported format","Document too large"])}`:
      `Textract ${op}: ${docType}, ${pages} pages, ${pages*randInt(50,500)} words`,
    ...(isErr?{error:{code:"TextractError",message:"Textract operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateComprehendLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectSentiment","DetectEntities","DetectKeyPhrases","DetectLanguage","ClassifyDocument","DetectPiiEntities"]);
  const lang = rand(["en","es","fr","de","it","pt","ja","zh"]);
  const sentiment = rand(["POSITIVE","NEGATIVE","NEUTRAL","MIXED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"comprehend"}},
    "aws":{comprehend:{operation:op,language_code:lang,
      text_bytes:randInt(100,100000),
      sentiment:op==="DetectSentiment"?sentiment:null,
      entities_detected:op==="DetectEntities"?randInt(0,20):0,
      key_phrases_detected:op==="DetectKeyPhrases"?randInt(0,30):0,
      pii_entities_detected:op==="DetectPiiEntities"?randInt(0,10):0,
      error_code:isErr?rand(["TextSizeLimitExceededException","UnsupportedLanguageException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.comprehend",provider:"comprehend.amazonaws.com"},
    "message":isErr?`Comprehend ${op} FAILED: ${rand(["Text too large","Unsupported language"])}`:
      `Comprehend ${op}: lang=${lang}${op==="DetectSentiment"?`, sentiment=${sentiment}`:""}`,
    ...(isErr?{error:{code:"ComprehendError",message:"Comprehend operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateTranslateLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const langs = ["en","es","fr","de","it","pt","ja","zh","ko","ar","ru","hi"];
  const srcLang = rand(langs); const tgtLang = rand(langs.filter(l=>l!==srcLang));
  const chars = randInt(100, isErr?0:500000);
  const dur = parseFloat(randFloat(50, isErr?5000:1000));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"translate"}},
    "aws":{translate:{source_language_code:srcLang,target_language_code:tgtLang,
      characters_translated:chars,
      applied_terminology:rand([null,"tech-glossary","product-terms"]),
      formality:rand([null,"FORMAL","INFORMAL"]),
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["DetectedLanguageLowConfidenceException","UnsupportedLanguagePairException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.translate",provider:"translate.amazonaws.com"},
    "message":isErr?`Translate FAILED (${srcLang}->${tgtLang}): ${rand(["Unsupported pair","Low confidence"])}`:
      `Translate ${srcLang}->${tgtLang}: ${chars.toLocaleString()} chars in ${dur.toFixed(0)}ms`,
    ...(isErr?{error:{code:"TranslateError",message:"Translate failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateTranscribeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const jobName = `transcribe-${randId(8).toLowerCase()}`;
  const lang = rand(["en-US","en-GB","es-US","fr-FR","de-DE","ja-JP"]);
  const audioMins = parseFloat(randFloat(0.5, isErr?0:120));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"transcribe"}},
    "aws":{transcribe:{transcription_job_name:jobName,
      transcription_job_status:isErr?"FAILED":"COMPLETED",
      language_code:lang,media_format:rand(["mp3","mp4","wav","flac","ogg"]),
      media_uri:`s3://audio-bucket/${jobName}.mp3`,
      audio_duration_minutes:audioMins,
      word_count:isErr?0:Math.round(audioMins*150),
      vocabulary_name:rand([null,"custom-medical-terms","legal-terminology"]),
      speaker_count:rand([null,1,2,rand([3,4])]),
      content_redaction_enabled:Math.random()>0.7,
      error_code:isErr?rand(["InternalFailure","BadRequestException","LimitExceededException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.transcribe",provider:"transcribe.amazonaws.com"},
    "message":isErr?`Transcribe job ${jobName} FAILED (${lang}): ${rand(["Audio too noisy","Unsupported codec","Access denied"])}`:
      `Transcribe job ${jobName}: ${audioMins.toFixed(1)} min audio (${lang})`,
    ...(isErr?{error:{code:"TranscribeError",message:"Transcribe job failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generatePollyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const voice = rand(["Joanna","Matthew","Amy","Brian","Celine","Hans","Mizuki","Lupe"]);
  const chars = randInt(50, isErr?0:100000);
  const engine = rand(["standard","neural","long-form"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"polly"}},
    "aws":{polly:{voice_id:voice,engine,
      language_code:rand(["en-US","en-GB","fr-FR","de-DE","es-US"]),
      output_format:rand(["mp3","ogg_vorbis","pcm"]),
      text_type:rand(["text","ssml"]),
      characters_synthesized:chars,
      sample_rate:rand(["8000","16000","22050","24000"]),
      error_code:isErr?rand(["TextLengthExceededException","InvalidSsmlException","LanguageNotSupportedException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.polly",provider:"polly.amazonaws.com"},
    "message":isErr?`Polly SynthesizeSpeech FAILED (${voice}): ${rand(["Text too long","Invalid SSML","Language not supported"])}`:
      `Polly SynthesizeSpeech: ${voice} (${engine}), ${chars} chars`,
    ...(isErr?{error:{code:"PollyError",message:"Polly synthesis failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateForecastLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const dataset = rand(["demand-forecast","sales-prediction","energy-consumption","web-traffic"]);
  const action = rand(["CreatePredictor","CreateForecast","CreateDatasetImportJob","GetAccuracyMetrics"]);
  const dur = randInt(300, isErr?86400:7200);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"forecast"}},
    "aws":{forecast:{dataset_group:dataset,
      predictor_name:isErr?null:`${dataset}-predictor-v${randInt(1,20)}`,
      action,algorithm:rand(["AutoML","CNN-QR","DeepAR+","NPTS","Prophet","ETS"]),
      forecast_horizon:rand([7,14,30,60,90]),
      weighted_quantile_loss:isErr?null:parseFloat(randFloat(0.05,0.25)),
      duration_seconds:dur,status:isErr?"FAILED":"ACTIVE",
      error_message:isErr?rand(["Insufficient training data","AutoML timed out","Invalid target field"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.forecast",provider:"forecast.amazonaws.com"},
    "message":isErr?`Forecast ${action} FAILED for ${dataset}: ${rand(["Insufficient data","Training timeout"])}`:
      `Forecast ${action}: ${dataset}, WQL=${parseFloat(randFloat(0.05,0.25)).toFixed(3)}`,
    ...(isErr?{error:{code:"ForecastError",message:"Forecast operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generatePersonalizeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const campaign = rand(["product-recommendations","content-discovery","similar-items","personalized-ranking"]);
  const userId = `user-${randId(8).toLowerCase()}`;
  const action = rand(["GetRecommendations","GetPersonalizedRanking","CreateSolution","PutEvents","CreateCampaign"]);
  const numResults = isErr?0:randInt(5,25);
  const dur = parseFloat(randFloat(10, isErr?5000:300));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"personalize"}},
    "aws":{personalize:{campaign_name:campaign,action,user_id:userId,
      num_results_returned:numResults,
      recipe:rand(["aws-similar-items","aws-user-personalization","aws-hrnn"]),
      solution_version:rand(["1.0.0","1.1.2","2.0.0"]),
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["ResourceNotFoundException","InvalidInputException"]):null}},
    "user":{name:userId},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.personalize",provider:"personalize.amazonaws.com"},
    "message":isErr?`Personalize ${action} FAILED for ${campaign}`:
      `Personalize ${action}: ${numResults} recs for ${userId} in ${dur.toFixed(0)}ms`,
    ...(isErr?{error:{code:"PersonalizeError",message:"Personalize operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateLexLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const bot = rand(["customer-service-bot","order-bot","faq-bot","booking-assistant"]);
  const intent = rand(["OrderProduct","CheckStatus","CancelOrder","GetHelp","BookAppointment","TransferToAgent"]);
  const nluScore = parseFloat(randFloat(0.6,0.99));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lex"}},
    "aws":{lex:{bot_id:randId(10),bot_name:bot,bot_version:rand(["DRAFT","1","2"]),
      locale_id:rand(["en_US","en_GB","es_US","fr_FR"]),
      session_id:randId(36).toLowerCase(),
      input_transcript:rand(["I want to order a product","What is my order status","Cancel my order"]),
      intent_name:intent,intent_nlu_confidence_score:nluScore,
      dialog_state:isErr?"Failed":"Fulfilled",
      sentiment:rand(["POSITIVE","NEUTRAL","NEGATIVE"]),
      error_code:isErr?rand(["NoSuchBotException","BadRequestException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.lex",provider:"lex.amazonaws.com"},
    "message":isErr?`Lex ${bot} FAILED: intent ${intent} - ${rand(["NLU confidence too low","Slot validation failed"])}`:
      `Lex ${bot}: intent=${intent} (${(nluScore*100).toFixed(0)}%)`,
    ...(isErr?{error:{code:"LexError",message:"Lex intent failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":nluScore<0.7?"warn":"info"}};
}

// ═══════════════════════════════════════════════════════════════════════════
// IOT
// ═══════════════════════════════════════════════════════════════════════════

function generateIotCoreLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const device = rand(["sensor-001","gateway-prod-1","thermostat-floor-3","camera-entrance","robot-arm-7"]);
  const action = rand(["CONNECT","DISCONNECT","PUBLISH","SUBSCRIBE","RECEIVE","REJECT"]);
  const topic = rand(["dt/factory/sensors/temperature","dt/home/thermostat/status","cmd/device/update","telemetry/metrics"]);
  const plainMessage = isErr ? `IoT Core ${action} FAILED for ${device}: ${rand(["Unauthorized","Certificate revoked","Rate limited"])}` : `IoT Core ${action}: ${device} on ${topic}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ clientId: device, action, topic, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotcore"}},
    "aws":{iotcore:{client_id:device,thing_name:device,
      thing_group:rand(["factory-sensors","home-devices","fleet","building-management"]),
      action,topic,protocol:rand(["MQTT","MQTT_WS","HTTP","LoRaWAN"]),
      qos:rand([0,1]),message_bytes:randInt(20,65536),
      policy_name:rand(["IoTDevicePolicy","FleetPolicy","SensorPolicy"]),
      structured_logging:useStructuredLogging,
      error_code:isErr?rand(["UnauthorizedException","ThrottlingException","DeviceDisconnected"]):null,
      rules_evaluated:randInt(0,5)}},
    "source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"network",dataset:"aws.iot",provider:"iot.amazonaws.com"},
    "message":message,
    "log":{level:isErr?"error":"info"},
    ...(isErr?{error:{code:rand(["UnauthorizedException","ThrottlingException","DeviceDisconnected"]),message:"IoT Core operation failed",type:"iot"}}:{})};
}

function generateIotGreengrassLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const group = rand(["factory-edge","home-hub","retail-kiosk","vehicle-edge"]);
  const component = rand(["com.example.temperature-monitor","com.aws.greengrass.Nucleus","com.example.inference","com.aws.greengrass.StreamManager"]);
  const MSGS = {
    error:["Component failed to start: missing dependency","Deployment rollback initiated","Kernel connection lost","OOM: component process killed"],
    warn:["Component health check failed, retrying","Certificate expiring in 7 days","Disk space below 10%"],
    info:["Component started successfully","Deployment completed","Health check passed","Nucleus updated to 2.12.0"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"greengrass"}},
    "aws":{greengrass:{core_device_name:group,component_name:component,
      component_version:`${randInt(1,3)}.${randInt(0,10)}.${randInt(0,10)}`,
      nucleus_version:"2.12.0",platform:rand(["linux/amd64","linux/arm64","linux/armv7l"]),
      deployment_id:randId(36).toLowerCase(),
      status:isErr?"FAILED":"COMPLETED"}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.greengrass",provider:"greengrass.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(level==="error"?{error:{code:"GreengrassError",message:rand(MSGS.error),type:"iot"}}:{})};
}

function generateIotAnalyticsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["temperature-channel","gps-channel","metrics-channel","alerts-channel"]);
  const pipeline = rand(["enrichment-pipeline","filter-pipeline","math-pipeline","device-registry-enrich"]);
  const msgs = randInt(100, isErr?0:100000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotanalytics"}},
    "aws":{iotanalytics:{channel_name:channel,pipeline_name:pipeline,
      dataset_name:rand(["daily-aggregates","anomaly-detection-output","fleet-summary"]),
      messages_processed:msgs,bytes_processed:msgs*randInt(50,500),
      activity_name:rand(["lambda-enrich","filter","math","selectAttributes"]),
      pipeline_status:isErr?"REPROCESSING_FAILED":"SUCCEEDED",
      error_message:isErr?rand(["Pipeline activity failed","Lambda timeout","Query error"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.iotanalytics",provider:"iotanalytics.amazonaws.com"},
    "message":isErr?`IoT Analytics FAILED in ${pipeline}: ${rand(["Activity error","Lambda timeout"])}`:
      `IoT Analytics: ${msgs.toLocaleString()} messages via ${pipeline}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr?{error:{code:"PipelineError",message:"IoT Analytics pipeline failed",type:"iot"}}:{})};
}

// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT & GOVERNANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateCloudFormationLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const stack = rand(["prod-web-stack","vpc-infra","rds-cluster","ecs-services","api-gateway-stack"]);
  const action = rand(["CREATE_STACK","UPDATE_STACK","DELETE_STACK","DETECT_DRIFT"]);
  const status = isErr ? rand(["CREATE_FAILED","UPDATE_ROLLBACK_COMPLETE","DELETE_FAILED"]) :
    rand(["CREATE_COMPLETE","UPDATE_COMPLETE","DELETE_COMPLETE","CREATE_IN_PROGRESS"]);
  const resource = rand(["AWS::EC2::VPC","AWS::ECS::Service","AWS::RDS::DBInstance","AWS::Lambda::Function","AWS::IAM::Role"]);
  const plainMessage = isErr ? `CloudFormation ${stack} ${status}: ${resource} failed - ${rand(["Capacity","IAM denied","Limit exceeded"])}` : `CloudFormation ${stack}: ${action} -> ${status}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ stackName: stack, action, stackStatus: status, resourceType: resource, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"cloudformation"}},
    "aws":{cloudformation:{stack_name:stack,
      stack_id:`arn:aws:cloudformation:${region}:${acct.id}:stack/${stack}/${randId(8)}`.toLowerCase(),
      action,stack_status:status,resource_type:resource,
      logical_resource_id:rand(["WebServerASG","DatabaseCluster","ApiFunction","TaskRole","VPC"]),
      resource_status_reason:isErr?rand(["Resource creation failed","Insufficient capacity","IAM policy error"]):null,
      drift_status:rand(["NOT_CHECKED","IN_SYNC","DRIFTED"]),
      structured_logging:useStructuredLogging}},
    "event":{outcome:isErr?"failure":"success",category:"configuration",dataset:"aws.cloudformation",provider:"cloudformation.amazonaws.com"},
    "message":message,
    ...(isErr?{error:{code:"StackError",message:"CloudFormation stack operation failed",type:"configuration"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateSsmLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const instance = `i-${randId(17).toLowerCase()}`;
  const action = rand(["RunCommand","StartSession","SendCommand","PatchInstance","GetParameter","PutParameter"]);
  const document = rand(["AWS-RunShellScript","AWS-RunPowerShellScript","AWS-ApplyPatchBaseline","AWS-ConfigureAWSPackage"]);
  const commandId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const plainMessage = isErr ? `SSM ${action} FAILED on ${instance}: exit code ${rand([1,2,127])}` : `SSM ${action} on ${instance}: ${document}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ commandId, documentName: document, instanceId: instance, action, status: isErr?"Failed":"Success", timestamp: new Date(ts).toISOString() }) : plainMessage;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"systemsmanager"}},
    "aws":{ssm:{command_id:commandId,
      document_name:document,instance_id:instance,action,
      execution_status:isErr?"Failed":"Success",
      response_code:isErr?rand([1,2,127]):0,
      session_id:action==="StartSession"?randId(36).toLowerCase():null,
      parameter_name:action.includes("Parameter")?rand(["/prod/db/password","/prod/api/key"]):null,
      patch_compliance:action.includes("Patch")?rand(["Compliant","NonCompliant","NotApplicable"]):null,
      structured_logging:useStructuredLogging}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.ssm",provider:"ssm.amazonaws.com"},
    "message":message,
    ...(isErr?{error:{code:"SSMError",message:"SSM command failed",type:"process"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateCloudWatchAlarmsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const ns = rand(["AWS/EC2","AWS/RDS","AWS/Lambda","AWS/ECS","Custom/Application","AWS/ApplicationELB"]);
  const metric = rand(["CPUUtilization","DatabaseConnections","Duration","MemoryUtilization","RequestCount","QueueDepth"]);
  const alarmName = rand(["high-cpu-alarm","rds-connections","lambda-errors","ecs-memory","api-latency"]);
  const alarmState = isErr ? rand(["ALARM","INSUFFICIENT_DATA"]) : rand(["OK","OK","ALARM"]);
  const val = parseFloat(randFloat(0, isErr?100:80));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"cloudwatchalarms"}},
    "aws":{cloudwatch:{alarm_name:alarmName,alarm_state:alarmState,
      previous_state:rand(["OK","ALARM","INSUFFICIENT_DATA"]),
      namespace:ns,metric_name:metric,
      threshold:rand([80,85,90,95]),evaluation_periods:rand([1,2,3]),
      metric_value:val,statistic:rand(["Average","Maximum","Sum","p99"]),
      period_seconds:rand([60,300,3600]),
      treat_missing_data:rand(["missing","notBreaching","breaching"])}},
    "event":{kind:"alert",outcome:alarmState==="OK"?"success":"failure",category:"configuration",dataset:"aws.cloudwatch",provider:"monitoring.amazonaws.com"},
    "message":`CloudWatch alarm "${alarmName}": ${alarmState} (${ns}/${metric}=${val.toFixed(1)})`,
    "log":{level:alarmState==="ALARM"?"warn":"info"},
    ...(alarmState!=="OK"?{error:{code:"AlarmTriggered",message:`Alarm ${alarmName}: ${alarmState}`,type:"monitoring"}}:{})};
}

function generateHealthLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isIssue = Math.random() < (er + 0.1);
  const svc = rand(["EC2","RDS","Lambda","S3","ECS","CloudFront","Route53","SQS","DynamoDB"]);
  const statuses = isIssue ? ["open","upcoming"] : ["closed","resolved"];
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"health"}},
    "aws":{health:{event_arn:`arn:aws:health:${region}::event/${svc}/${randId(8)}/${randId(36)}`.toLowerCase(),
      event_type_code:`AWS_${svc.toUpperCase()}_${rand(["OPERATIONAL_ISSUE","MAINTENANCE_SCHEDULED","API_ISSUE"])}`,
      event_type_category:rand(["issue","scheduledChange","accountNotification"]),
      service:svc,region:rand([region,"global"]),
      status_code:rand(statuses),
      event_scope:rand(["ACCOUNT","PUBLIC"]),
      affected_entities_count:randInt(1,50),
      description:`${svc} ${rand(["Increased error rates","Degraded performance","Scheduled maintenance","Connectivity issues"])} in ${region}`}},
    "event":{kind:"alert",outcome:isIssue?"failure":"success",category:"configuration",dataset:"aws.health",provider:"health.amazonaws.com"},
    "message":isIssue?`AWS Health: ${svc} service issue in ${region} - ${rand(["Increased errors","Degraded performance"])}`:
      `AWS Health: ${svc} event resolved in ${region}`,
    ...(isIssue?{error:{code:"HealthIssue",message:"AWS Health service issue",type:"configuration"}}:{}),
    "log":{level:isIssue?"warn":"info"}};
}

function generateTrustedAdvisorLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isFinding = Math.random() < (er + 0.2);
  const cat = rand(["security","cost_optimizing","performance","fault_tolerance","service_limits"]);
  const checks = {
    security:["Security Groups - Ports Unrestricted","MFA on Root Account","S3 Bucket Permissions","CloudTrail Logging"],
    cost_optimizing:["Underutilized Amazon EC2 Instances","Idle Load Balancers","Underutilized Amazon RDS"],
    performance:["High Utilization Amazon EC2 Instances","Large Number of Rules in Security Group"],
    fault_tolerance:["Amazon S3 Bucket Versioning","Multi-AZ for RDS","Amazon RDS Backups"],
    service_limits:["EC2 On-Demand Instances","RDS DB Instances","VPCs"],
  };
  const check = rand(checks[cat]);
  const status = isFinding ? rand(["error","warning"]) : "ok";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"trustedadvisor"}},
    "aws":{trustedadvisor:{check_name:check,category:cat,status,
      affected_resource:rand([`i-${randId(17).toLowerCase()}`,`sg-${randId(8).toLowerCase()}`,`arn:aws:s3:::my-bucket`]),
      estimated_monthly_savings:cat==="cost_optimizing"&&isFinding?parseFloat(randFloat(10,5000)):null,
      flagged_resources:isFinding?randInt(1,20):0}},
    "event":{kind:"alert",outcome:isFinding?"failure":"success",category:"configuration",dataset:"aws.trustedadvisor",provider:"trustedadvisor.amazonaws.com"},
    "message":isFinding?`Trusted Advisor [${status.toUpperCase()}]: ${check} - ${randInt(1,20)} resources affected`:
      `Trusted Advisor OK: ${check}`,
    ...(isFinding?{error:{code:"TrustedAdvisorFinding",message:`${check}: ${status}`,type:"configuration"}}:{}),
    "log":{level:status==="error"?"error":status==="warning"?"warn":"info"}};
}

function generateControlTowerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const action = rand(["CreateManagedAccount","EnableGuardrail","DisableGuardrail","UpdateLandingZone","RegisterOrganizationalUnit"]);
  const guardrail = rand(["AWS-GR_RESTRICT_ROOT_USER","AWS-GR_REQUIRE_MFA_FOR_ROOT","AWS-GR_ENCRYPTED_VOLUMES","AWS-GR_S3_PUBLIC_WRITE_PROHIBITED"]);
  const status = isErr ? rand(["FAILED","ERRORED"]) : rand(["SUCCEEDED","IN_PROGRESS"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"controltower"}},
    "aws":{controltower:{operation_id:randId(36).toLowerCase(),action,
      account_id:`${acct.id}`,
      organizational_unit:rand(["Sandbox","Production","Workloads","Infrastructure"]),
      guardrail_id:action.includes("Guardrail")?guardrail:null,
      guardrail_compliance:isErr?"NONCOMPLIANT":rand(["COMPLIANT","NOT_APPLICABLE"]),
      landing_zone_version:rand(["3.1","3.2","3.3"]),
      status,error_message:isErr?rand(["Enrollment failed","SCP error","Compliance check failed"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"configuration",dataset:"aws.controltower",provider:"controltower.amazonaws.com"},
    "message":isErr?`Control Tower ${action} FAILED: ${rand(["SCP error","Enrollment failed","Guardrail issue"])}`:
      `Control Tower ${action}: ${status}`,
    ...(isErr?{error:{code:"ControlTowerError",message:"Control Tower operation failed",type:"configuration"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateOrganizationsLog(ts, er) {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const action = rand(["CreateAccount","MoveAccount","InviteAccountToOrganization","AttachPolicy","DetachPolicy","CreateOrganizationalUnit"]);
  const policyType = rand(["SERVICE_CONTROL_POLICY","TAG_POLICY","BACKUP_POLICY"]);
  const ous = ["Root","Production","Sandbox","Infrastructure","Security","Workloads"];
  return { "@timestamp":ts,"cloud":{provider:"aws",region:"us-east-1",account:{id:acct.id,name:acct.name},service:{name:"organizations"}},
    "aws":{organizations:{action,account_id:`${acct.id}`,
      account_name:rand(["prod-workloads","security-audit","shared-services","sandbox-dev"]),
      organizational_unit:rand(ous),
      policy_id:action.includes("Policy")?`p-${randId(8).toLowerCase()}`:null,
      policy_type:action.includes("Policy")?policyType:null,
      policy_name:action.includes("Policy")?rand(["DenyRootUserActions","RequireS3Encryption","TagCompliance"]):null,
      error_code:isErr?rand(["DuplicateAccountException","ConstraintViolationException","AccessDeniedException"]):null}},
    "event":{action,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.organizations",provider:"organizations.amazonaws.com"},
    "message":isErr?`Organizations ${action} FAILED: ${rand(["Duplicate account","Constraint violation","Access denied"])}`:
      `Organizations ${action}: ${rand(ous)}`,
    ...(isErr?{error:{code:"OrganizationsError",message:"Organizations operation failed",type:"iam"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateDmsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const taskName = rand(["prod-mysql-to-aurora","oracle-to-rds","on-prem-to-rds","mongodb-to-documentdb"]);
  const srcEngine = rand(["oracle","mysql","sqlserver","postgresql","mongodb"]);
  const dstEngine = rand(["aurora-mysql","aurora-postgresql","redshift","dynamodb","docdb"]);
  const migrationType = rand(["full-load","cdc","full-load-and-cdc"]);
  const rows = isErr?0:randInt(1000,10000000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"dms"}},
    "aws":{dms:{replication_task_id:taskName,migration_type:migrationType,
      source_engine:srcEngine,target_engine:dstEngine,
      replication_instance_class:rand(["dms.t3.medium","dms.r5.large","dms.r5.xlarge"]),
      task_status:isErr?"Failed":"Load complete",
      full_load_rows_transferred:rows,
      cdc_incoming_changes:migrationType.includes("cdc")?randInt(0,100000):0,
      latency_ms:migrationType.includes("cdc")?randInt(100,isErr?60000:2000):0,
      tables_loaded:randInt(1,500),tables_errored:isErr?randInt(1,20):0,
      error_message:isErr?rand(["Table does not exist","Column mapping failure","Connection timeout"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"database",dataset:"aws.dms",provider:"dms.amazonaws.com"},
    "message":isErr?`DMS ${taskName} FAILED (${srcEngine}->${dstEngine}): ${rand(["Table mapping error","Connection lost"])}`:
      `DMS ${taskName}: ${rows.toLocaleString()} rows (${srcEngine}->${dstEngine} ${migrationType})`,
    ...(isErr?{error:{code:"DMSError",message:"DMS task failed",type:"migration"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA & END USER COMPUTING (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function generateMediaConvertLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const jobId = `${randInt(1234567890,9999999999)}-${randId(6).toLowerCase()}`;
  const input = rand(["s3://media-input/raw/interview.mov","s3://media-input/broadcast/live.mxf","s3://uploads/user-video.mp4"]);
  const outputGroup = rand(["HLS","DASH","MP4","CMAF"]);
  const dur = randInt(30, isErr?3600:1800);
  const audioMins = parseFloat(randFloat(0.5,120));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"mediaconvert"}},
    "aws":{mediaconvert:{job_id:jobId,
      queue_arn:`arn:aws:mediaconvert:${region}:${acct.id}:queues/${rand(["Default","premium","batch"])}`,
      job_status:isErr?"ERROR":"COMPLETE",output_group_type:outputGroup,
      input_file:input,input_duration_minutes:audioMins,
      video_codec:rand(["H_264","H_265","AV1","MPEG2"]),audio_codec:rand(["AAC","MP3","AC3"]),
      width:rand([1280,1920,3840]),height:rand([720,1080,2160]),
      bitrate_kbps:rand([1500,3000,5000,8000]),duration_seconds:dur,
      error_message:isErr?rand(["Invalid input file","Unsupported codec","Output permissions denied"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.mediaconvert",provider:"mediaconvert.amazonaws.com"},
    "message":isErr?`MediaConvert job ${jobId} ERROR: ${rand(["Invalid format","Codec unsupported","S3 write denied"])}`:
      `MediaConvert job ${jobId} COMPLETE: ${audioMins.toFixed(1)} min -> ${outputGroup}`,
    ...(isErr?{error:{code:"JobError",message:"MediaConvert job failed",type:"media"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateMediaLiveLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["live-news","sports-event-1","concert-stream","corporate-broadcast"]);
  const MSGS = {
    error:["Input loss detected: primary input failed","Encoder error: resolution mismatch","Output error: CDN origin unreachable","Audio track desync detected"],
    warn:["Bitrate below target: 2.1 Mbps vs 5 Mbps","Input redundancy switch triggered","Buffer underflow: 2 frames dropped"],
    info:["Channel started successfully","Input switch to backup completed","Pipeline A running, Pipeline B standby"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"medialive"}},
    "aws":{medialive:{channel_id:randId(11),channel_name:channel,
      channel_state:isErr?"ERROR":rand(["RUNNING","RUNNING","IDLE"]),
      pipeline:rand(["PIPELINE_0","PIPELINE_1"]),
      input_type:rand(["RTMP_PUSH","RTP_PUSH","UDP_PUSH","MEDIACONNECT"]),
      output_type:rand(["HLS","DASH","RTMP","MEDIAPACKAGE"]),
      video_bitrate_kbps:isErr?randInt(500,2000):randInt(3000,15000),
      input_loss_frames:isErr?randInt(1,1000):0,
      encoder_fps:isErr?randInt(5,24):rand([24,25,29.97,30,60])}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.medialive",provider:"medialive.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(level==="error"?{error:{code:"MediaLiveError",message:rand(MSGS.error),type:"media"}}:{})};
}

function generateWorkSpacesLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const user = rand(["alice","bob","carol","david","eva"]);
  const wsId = `ws-${randId(10).toLowerCase()}`;
  const action = rand(["Connect","Disconnect","StartWorkspace","StopWorkspace","RebuildWorkspace"]);
  const state = isErr ? rand(["ERROR","UNHEALTHY","STOPPED"]) : rand(["AVAILABLE","AVAILABLE","CONNECTED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"workspaces"}},
    "aws":{workspaces:{workspace_id:wsId,user_name:user,
      bundle_type:rand(["Performance","Standard","Power","Graphics"]),
      workspace_state:state,action,
      compute_type:rand(["VALUE","STANDARD","PERFORMANCE","POWER"]),
      running_mode:rand(["AUTO_STOP","ALWAYS_ON"]),
      client_ip:randIp(),client_os:rand(["Windows 11","macOS 14","Ubuntu 22.04"]),
      error_code:isErr?rand(["InvalidUser","OperationNotSupportedException"]):null}},
    "user":{name:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"session",dataset:"aws.workspaces",provider:"workspaces.amazonaws.com"},
    "message":isErr?`WorkSpaces ${action} FAILED for ${user} (${wsId})`:
      `WorkSpaces ${action}: ${user} on ${wsId} [${state}]`,
    ...(isErr?{error:{code:"WorkSpacesError",message:"WorkSpaces operation failed",type:"session"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateConnectLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const action = rand(["INBOUND_CALL","OUTBOUND_CALL","CHAT","TASK","TRANSFER","DISCONNECT"]);
  const queue = rand(["BasicQueue","TechSupport","Billing","Sales","Priority-Enterprise"]);
  const agent = rand(["agent-alice","agent-bob","agent-carol",null]);
  const dur = randInt(10, 1800);
  const sentiment = rand(["POSITIVE","NEUTRAL","NEGATIVE","MIXED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"connect"}},
    "aws":{connect:{instance_id:randId(36).toLowerCase(),
      contact_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      channel:rand(["VOICE","CHAT","TASK"]),initiation_method:action,
      queue_name:queue,agent_id:agent,
      duration_seconds:dur,
      hold_duration_seconds:randInt(0,120),
      queue_wait_time_seconds:randInt(0,300),
      disconnect_reason:rand(["CUSTOMER_DISCONNECT","AGENT_DISCONNECT","EXPIRED"]),
      sentiment_overall:sentiment,
      contact_lens_enabled:Math.random()>0.5,
      lex_bot_interacted:Math.random()>0.5,
      error_code:isErr?rand(["ContactNotFoundException","QueueCapacityExceeded"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"session",dataset:"aws.connect",provider:"connect.amazonaws.com"},
    "message":isErr?`Connect ${action} FAILED: ${rand(["Queue capacity exceeded","Flow error","Agent unavailable"])}`:
      `Connect ${action}: ${queue}${agent?` agent=${agent}`:""}, ${dur}s, ${sentiment}`,
    ...(isErr?{error:{code:"ConnectError",message:"Connect operation failed",type:"session"}}:{}),
    "log":{level:isErr?"error":dur>600?"warn":"info"}};
}

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL SERVICES — BATCH 2
// ═══════════════════════════════════════════════════════════════════════════

function generateSesLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const event = rand(["Send","Delivery","Bounce","Complaint","Open","Click","Reject","RenderingFailure"]);
  const from = rand(["noreply@company.com","alerts@company.com","no-reply@app.io"]);
  const to = `user_${randId(6).toLowerCase()}@${rand(["gmail.com","yahoo.com","company.org","outlook.com"])}`;
  const msgId = `${randId(20)}.${randId(10)}@${region}.amazonses.com`.toLowerCase();
  const bounceType = event==="Bounce"?rand(["Permanent","Transient"]):null;
  const bounceSubType = bounceType?rand(["General","NoEmail","Suppressed","MailboxFull","MessageTooLarge"]):null;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"ses"}},"aws":{ses:{message_id:msgId,event_type:event,from_address:from,destination:to,configuration_set:rand(["transactional","marketing","alerts",null]),bounce:{bounce_type:bounceType,bounce_sub_type:bounceSubType},complaint:{feedback_type:event==="Complaint"?rand(["abuse","fraud","virus","not-spam"]):null},sending_account_id:`${acct.id}`,delivery:{recipients:[to],timestamp:ts,processing_time_ms:randInt(50,3000),smtp_response:isErr?null:"250 2.0.0 OK"}}},"event":{outcome:isErr||["Bounce","Complaint","Reject"].includes(event)?"failure":"success",category:"email",dataset:"aws.ses",provider:"email.amazonaws.com"},"message":isErr?`SES ${event} FAILED for ${to}: ${rand(["Rendering failure","Account suspended","Rate limit exceeded"])}`:event==="Bounce"?`SES Bounce [${bounceType}/${bounceSubType}]: ${to}`:event==="Complaint"?`SES Complaint from ${to}:`:`SES ${event}: ${from} -> ${to}`,"log":{level:["Bounce","Complaint","Reject"].includes(event)?"warn":isErr?"error":"info"},...(isErr||["Bounce","Complaint","Reject"].includes(event)?{error:{code:"SESDeliveryFailure",message:"SES delivery failed",type:"email"}}:{}) };
}

function generatePinpointLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["EMAIL","SMS","PUSH","IN_APP","VOICE"]);
  const event = rand(["_email.send","_email.delivered","_email.bounced","_sms.sent","_sms.buffered","_push.notification_received","_campaign.send","_journey.send","_custom.purchase"]);
  const campaign = rand(["welcome-series","re-engagement","promo-black-friday","onboarding-flow","churn-prevention"]);
  const user = `user_${randId(10).toLowerCase()}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"pinpoint"}},"aws":{pinpoint:{application_id:randId(32).toLowerCase(),event_type:event,channel,campaign_id:randId(24).toLowerCase(),campaign_name:campaign,journey_id:randId(24).toLowerCase(),segment_id:randId(24).toLowerCase(),endpoint_id:user,message_id:randId(36).toLowerCase(),delivery_status:isErr?"DUPLICATE":rand(["SUCCESSFUL","SUCCESSFUL","PENDING","FAILED"]),status_message:isErr?"Address on suppression list":null,destination:channel==="EMAIL"?`${user}@example.com`:channel==="SMS"?`+1555${randInt(1000000,9999999)}`:user,iso_country_code:rand(["US","GB","DE","FR","AU"])}},"event":{outcome:isErr?"failure":"success",category:"email",dataset:"aws.pinpoint",provider:"mobiletargeting.amazonaws.com"},"message":isErr?`Pinpoint ${channel} FAILED [${campaign}]: ${rand(["Suppression list","Invalid endpoint","Quota exceeded"])}:`:`Pinpoint ${event} [${campaign}]: ${user} via ${channel}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"DeliveryFailure",message:"Pinpoint delivery failed",type:"messaging"}}:{}) };
}

function generateTransferFamilyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const protocol = rand(["SFTP","FTPS","FTP","AS2"]);
  const user = rand(["sftp-partner","data-ingest","backup-user","etl-transfer","vendor-upload"]);
  const file = rand(["/inbound/orders.csv","/uploads/inventory.xml","/reports/daily-sales.xlsx","/backup/db-export.sql.gz","/data/events.json"]);
  const bytes = randInt(1024,5e9);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"transferfamily"}},"aws":{transferfamily:{server_id:`s-${randId(17).toLowerCase()}`,protocol,user_name:user,session_id:randId(32).toLowerCase(),file_path:file,operation:rand(["PUT","GET","DELETE","MKDIR","RENAME"]),bytes_transferred:bytes,transfer_rate_mbps:parseFloat(randFloat(0.1,500)),duration_seconds:parseFloat(randFloat(0.1,300)),s3_bucket:rand(["sftp-inbound","partner-data","transfer-landing"]),as2_message_id:protocol==="AS2"?randId(36).toLowerCase():null,error_code:isErr?rand(["AUTH_FAILURE","PERMISSION_DENIED","CONNECTION_RESET","FILE_NOT_FOUND"]):null}},"source":{ip:randIp()},"event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.transfer",provider:"transfer.amazonaws.com"},"message":isErr?`Transfer Family ${protocol} FAILED [${user}] ${file}: ${rand(["Auth failure","Permission denied","Connection reset"])}:`:`Transfer Family ${protocol} [${user}] ${file}: ${(bytes/1024/1024).toFixed(1)}MB`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["AUTH_FAILURE","PERMISSION_DENIED","CONNECTION_RESET","FILE_NOT_FOUND"]),message:"Transfer Family operation failed",type:"file"}}:{}) };
}

function generateLightsailLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const instance = rand(["wordpress-prod","dev-server","game-server","portfolio-site","api-prototype"]);
  const event = rand(["INSTANCE_STATE_CHANGE","SNAPSHOT_CREATED","STATIC_IP_ATTACHED","ALERT_TRIGGERED","MONTHLY_TRANSFER_EXCEEDED","SSL_RENEWED"]);
  const state = isErr?"ERROR":rand(["running","stopped","pending"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lightsail"}},"aws":{lightsail:{resource_name:instance,resource_type:rand(["Instance","Database","Bucket","ContainerService","Distribution"]),bundle_id:rand(["nano_2_0","micro_2_0","small_2_0","medium_2_0","large_2_0"]),blueprint:rand(["wordpress","lamp","nodejs","django","ubuntu_22_04","amazon_linux_2"]),state,event_type:event,public_ip:randIp(),snapshot_name:event.includes("SNAPSHOT")?`${instance}-snap-${randInt(1,100)}`:null,monthly_transfer:{used_gb:randInt(0,2000),limit_gb:rand([1024,3072,6144,12288])},alert:{name:event==="ALERT_TRIGGERED"?rand(["CPUUtilization","NetworkOut","StatusCheckFailed"]):null,threshold:event==="ALERT_TRIGGERED"?randInt(80,100):null}}},"event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.lightsail",provider:"lightsail.amazonaws.com"},"message":isErr?`Lightsail ${instance} ERROR: ${rand(["Instance unreachable","Snapshot failed","SSL renewal error"])}:`:`Lightsail ${instance}: ${event} [${state}]`,"log":{level:isErr?"error":event.includes("EXCEEDED")?"warn":"info"},...(isErr?{error:{code:"LightsailError",message:"Lightsail instance error",type:"host"}}:{}) };
}

function generateBudgetsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const budget = rand(["monthly-total","ec2-prod","data-transfer","rds-cluster","dev-sandbox","quarterly-compute"]);
  const budgetType = rand(["COST","USAGE","RI_UTILIZATION","RI_COVERAGE","SAVINGS_PLANS_UTILIZATION"]);
  const limit = parseFloat(randFloat(100,10000)); const actual = isErr ? limit*(1+parseFloat(randFloat(0.05,0.5))) : limit*parseFloat(randFloat(0.3,0.95));
  const threshold = isErr?rand([80,90,100]):rand([50,60,70]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"budgets"}},"aws":{budgets:{budget_name:budget,budget_type:budgetType,time_period:rand(["MONTHLY","QUARTERLY","ANNUALLY"]),currency:"USD",budget_limit:parseFloat(limit.toFixed(2)),actual_spend:parseFloat(actual.toFixed(2)),forecasted_spend:parseFloat((actual*1.15).toFixed(2)),threshold_exceeded:isErr,threshold_percentage:threshold,notification_type:rand(["ACTUAL","FORECASTED"]),subscribers:rand(["ops@company.com","finance@company.com"])}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.budgets",provider:"budgets.amazonaws.com"},"message":isErr?`Budget ALERT: ${budget} exceeded ${threshold}% — ${actual.toFixed(0)} of ${limit.toFixed(0)}`:`Budget OK: ${budget} at ${actual.toFixed(0)}/${limit.toFixed(0)} (${Math.round(actual/limit*100)}%)`,"log":{level:isErr?"warn":"info"},...(isErr?{error:{code:"BudgetExceeded",message:"Budget threshold exceeded",type:"billing"}}:{}) };
}

function generateServiceCatalogLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const product = rand(["Standard EC2 Instance","RDS PostgreSQL","EKS Cluster","S3 Static Site","Data Pipeline"]);
  const user = rand(["developer-alice","team-lead-bob","sre-carol","contractor-dan"]);
  const action = rand(["ProvisionProduct","UpdateProvisionedProduct","TerminateProvisionedProduct","SearchProducts","AssociatePrincipal"]);
  const status = isErr?rand(["FAILED","TAINTED","ERROR"]):rand(["SUCCEEDED","AVAILABLE"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"servicecatalog"}},"aws":{servicecatalog:{operation:action,product_name:product,product_id:`prod-${randId(13)}`,portfolio_id:`port-${randId(13)}`,provisioned_product_name:`${product.toLowerCase().replace(/ /g,"-")}-${randId(6).toLowerCase()}`,record_id:`rec-${randId(13)}`,status,requester_arn:`arn:aws:iam::${acct.id}:user/${user}`,launch_role:rand([null,"arn:aws:iam::123456789:role/ServiceCatalogLaunchRole"]),error:isErr?rand(["Launch role not authorized","Resource limit exceeded","Invalid parameters"]):null}},"user":{name:user},"event":{action,outcome:isErr?"failure":"success",category:"process",dataset:"aws.servicecatalog",provider:"servicecatalog.amazonaws.com"},"message":isErr?`ServiceCatalog ${action} FAILED [${product}]: ${rand(["Unauthorized","Resource limit","Invalid params"])}:`:`ServiceCatalog ${action}: ${user} → ${product} [${status}]`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"ProvisioningFailed",message:"Service Catalog operation failed",type:"provisioning"}}:{}) };
}

function generateIotEventsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const model = rand(["temperature-alert-model","motor-health-detector","pressure-monitor","door-sensor-model","conveyor-fault"]);
  const detector = rand(["unit-01","unit-02","zone-A","zone-B","machine-prod-1"]);
  const event = rand(["StateTransition","AlarmActivated","AlarmAcknowledged","AlarmReset","ActionExecuted","TriggerFired"]);
  const fromState = rand(["Normal","Warning","Alarm","Acknowledged"]);
  const toState = isErr?rand(["Error","Alarm"]):rand(["Normal","Warning","Alarm"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotevents"}},"aws":{iotevents:{detector_model_name:model,detector_id:detector,key_value:detector,event_name:event,from_state:fromState,to_state:toState,input_name:rand(["SensorInput","CommandInput","HealthCheck"]),action_type:rand(["SetVariable","SetTimer","SNS","Lambda","SQS"]),timer_name:rand([null,"idleTimer","alarmTimer"]),condition_expression:rand([null,"$input.SensorInput.temperature > 85","$input.data.value < threshold"]),error_code:isErr?rand(["ResourceNotFound","ThrottlingException","InvalidRequestException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.iotevents",provider:"iotevents.amazonaws.com"},"message":isErr?`IoT Events ${model}/${detector} ERROR: ${rand(["State machine error","Action failed","Input validation error"])}:`:`IoT Events ${model}/${detector}: ${fromState} → ${toState} [${event}]`,"log":{level:isErr?"error":toState==="Alarm"?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFound","ThrottlingException","InvalidRequestException"]),message:"IoT Events error",type:"iot"}}:{}) };
}

function generateIotSiteWiseLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const asset = rand(["conveyor-belt-1","hvac-unit-prod","pump-station-2","solar-array-roof","turbine-gen-3"]);
  const property = rand(["Temperature","Pressure","RPM","PowerOutput","FlowRate","Vibration","OEE","MTBF"]);
  const quality = isErr?rand(["BAD","UNCERTAIN"]):rand(["GOOD","GOOD","GOOD"]);
  const value = parseFloat(randFloat(isErr?-999:0, isErr?9999:500));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotsitewise"}},"aws":{iotsitewise:{asset_id:`${randId(36).toLowerCase()}`,asset_name:asset,asset_model_id:randId(36).toLowerCase(),property_alias:`/company/plant/${asset}/${property.toLowerCase()}`,property_name:property,data_type:rand(["DOUBLE","INTEGER","BOOLEAN","STRING"]),value,quality,timestamp_offset_ms:randInt(0,1000),gateway_id:rand([`gateway-${randId(8).toLowerCase()}`,null]),portal_id:randId(36).toLowerCase(),error:isErr?rand(["BatchPutAssetPropertyValue failed","Property not found","Quota exceeded"]):null}},"event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.iotsitewise",provider:"iotsitewise.amazonaws.com"},"message":isErr?`IoT SiteWise ${asset}/${property} BAD quality: ${rand(["Sensor offline","Out of range","Connection lost"])}:`:`IoT SiteWise ${asset}/${property}: ${value} [${quality}]`,"log":{level:isErr?"error":quality==="UNCERTAIN"?"warn":"info"},...(isErr?{error:{code:"SiteWiseError",message:"IoT SiteWise quality/error",type:"iot"}}:{}) };
}

function generateFraudDetectorLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const model = rand(["online-fraud-v2","account-takeover","card-fraud-detector","identity-fraud","transaction-risk"]);
  const entity = `entity_${randId(10).toLowerCase()}`;
  const outcome = isErr?rand(["BLOCK","HIGH_RISK"]):rand(["APPROVE","REVIEW","APPROVE"]);
  const score = isErr?randInt(800,999):rand([outcome==="REVIEW"?randInt(400,799):randInt(0,399)]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"frauddetector"}},"aws":{frauddetector:{detector_id:model,detector_version_id:randInt(1,5).toString(),event_id:randId(36).toLowerCase(),event_type:rand(["account_registration","online_purchase","login","wire_transfer","card_transaction"]),entity_type:"customer",entity_id:entity,outcomes:[outcome],risk_score:score,model_scores:{[model]:score},used_rules:rand([["block-high-risk"],["review-medium"],["approve-low"]]),ip_address:randIp(),event_variables:{billing_postal:randInt(10000,99999).toString(),phone_verified:rand(["true","false"])}}},"event":{outcome:outcome==="BLOCK"?"failure":"success",category:"intrusion_detection",dataset:"aws.frauddetector",provider:"frauddetector.amazonaws.com"},"message":isErr?`Fraud Detector BLOCK [${model}]: entity ${entity} score ${score}/1000`:`Fraud Detector ${outcome} [${model}]: entity ${entity} score ${score}/1000`,"log":{level:outcome==="BLOCK"?"warn":outcome==="HIGH_RISK"?"warn":"info"},...(outcome==="BLOCK"?{error:{code:"FraudBlock",message:"Fraud Detector block decision",type:"security"}}:{}) };
}

function generateLookoutMetricsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const detector = rand(["revenue-anomaly","traffic-spike-detector","error-rate-monitor","latency-outlier","conversion-drop"]);
  const metric = rand(["revenue","page_views","error_rate","p99_latency","conversion_rate","api_calls"]);
  const severity = isErr?rand(["HIGH","MEDIUM"]):rand(["LOW","MEDIUM"]);
  const anomalyScore = isErr?parseFloat(randFloat(70,99)):parseFloat(randFloat(0,40));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lookoutmetrics"}},"aws":{lookoutmetrics:{anomaly_detector_arn:`arn:aws:lookoutmetrics:${region}:${acct.id}:AnomalyDetector:${detector}`,anomaly_group_id:randId(36).toLowerCase(),metric_name:metric,severity,anomaly_score:anomalyScore,relevant_dates:rand([3,7,14,30]),impact_value:parseFloat(randFloat(-50,200)),expected_value:parseFloat(randFloat(100,10000)),actual_value:parseFloat(randFloat(50,15000)),dimension:rand([{region:"us-east-1"},{service:"checkout"},{environment:"prod"}]),sensitivity:rand(["LOW","MEDIUM","HIGH"]),action_taken:isErr?rand(["SNS_ALERT","LAMBDA_TRIGGER"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.lookoutmetrics",provider:"lookoutmetrics.amazonaws.com"},"message":isErr?`Lookout for Metrics ANOMALY [${detector}]: ${metric} score=${anomalyScore.toFixed(0)} [${severity}]`:`Lookout for Metrics [${detector}]: ${metric} anomaly_score=${anomalyScore.toFixed(0)}`,"log":{level:isErr?"warn":"info"},...(isErr?{error:{code:"AnomalyDetected",message:"Lookout for Metrics anomaly",type:"process"}}:{}) };
}

function generateComprehendMedicalLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const action = rand(["DetectEntitiesV2","DetectPHI","InferICD10CM","InferRxNorm","InferSNOMEDCT","StartEntitiesDetectionV2Job"]);
  const entityCount = randInt(2,50); const phiCount = isErr?0:randInt(0,10);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"comprehendmedical"}},"aws":{comprehendmedical:{operation:action,entities_detected:entityCount,phi_entities:phiCount,icd10_concepts:action.includes("ICD")?randInt(1,20):null,rxnorm_concepts:action.includes("Rx")?randInt(1,15):null,snomedct_concepts:action.includes("SNOMED")?randInt(1,30):null,text_characters:randInt(100,10000),job_id:action.includes("Job")?randId(36).toLowerCase():null,data_access_role_arn:`arn:aws:iam::${acct.id}:role/ComprehendMedicalRole`,s3_bucket:rand(["medical-records","clinical-notes","ehr-processed"]),error_code:isErr?rand(["InvalidRequestException","TextSizeLimitExceededException","TooManyRequestsException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.comprehendmedical",provider:"comprehendmedical.amazonaws.com"},"message":isErr?`Comprehend Medical ${action} FAILED: ${rand(["Text too long","Invalid request","Rate limit exceeded"])}:`:`Comprehend Medical ${action}: ${entityCount} entities, ${phiCount} PHI`,"log":{level:isErr?"error":phiCount>5?"warn":"info"},...(isErr?{error:{code:rand(["InvalidRequestException","TextSizeLimitExceededException","TooManyRequestsException"]),message:"Comprehend Medical failed",type:"ml"}}:{}) };
}

function generateGameLiftLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const fleet = rand(["game-fleet-prod","matchmaking-fleet","us-east-realtime","eu-west-battle"]);
  const event = rand(["GameSessionCreated","PlayerSessionCreated","PlayerSessionTerminated","FleetCapacityChanged","InstanceStatusChanged","MatchmakingSucceeded","MatchmakingTimedOut"]);
  const gameSessionId = `arn:aws:gamelift:${region}::gamesession/${fleet}/${randId(36).toLowerCase()}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"gamelift"}},"aws":{gamelift:{fleet_id:`fleet-${randId(8).toLowerCase()}`,fleet_name:fleet,event_type:event,game_session_id:gameSessionId,player_session_id:event.includes("Player")?`psess-${randId(36).toLowerCase()}`:null,current_player_sessions:randInt(0,100),maximum_player_sessions:rand([10,50,100,200]),instance_type:rand(["c5.large","c5.xlarge","c5.2xlarge","m5.large"]),instance_count:randInt(1,50),desired_instances:randInt(1,50),idle_instances:randInt(0,10),matchmaking_configuration:rand(["FastMatch","BalancedMatch","RegionalMatch"]),matchmaking_ticket_id:event.includes("Matchmaking")?randId(36).toLowerCase():null,matchmaking_duration_seconds:event.includes("Matchmaking")?randInt(5,120):null,error_code:isErr?rand(["InvalidFleetStatus","FleetCapacityExceeded","InvalidGameSession"]):null}},"event":{outcome:isErr?"failure":"success",category:"session",dataset:"aws.gamelift",provider:"gamelift.amazonaws.com"},"message":isErr?`GameLift ${fleet} ${event} FAILED: ${rand(["Fleet at capacity","Invalid session","Instance unavailable"])}:`:`GameLift ${fleet}: ${event}`,"log":{level:isErr?"error":event.includes("TimedOut")?"warn":"info"},...(isErr?{error:{code:rand(["InvalidFleetStatus","FleetCapacityExceeded","InvalidGameSession"]),message:"GameLift operation failed",type:"session"}}:{}) };
}

function generateAppStreamLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const stack = rand(["dev-tools-stack","design-apps","data-analytics","browser-isolation","secure-access"]);
  const fleet = rand(["on-demand-fleet","always-on-fleet","elastic-fleet"]);
  const user = `user_${randId(8).toLowerCase()}@company.com`;
  const event = rand(["SESSION_STARTED","SESSION_ENDED","APPLICATION_LAUNCHED","FILE_DOWNLOAD","FILE_UPLOAD","CLIPBOARD_COPY","CAPACITY_CHANGED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"appstream"}},"aws":{appstream:{stack_name:stack,fleet_name:fleet,user_id:user,session_id:randId(36).toLowerCase(),event_type:event,application_name:event.includes("APP")?rand(["Notepad++","MATLAB","AutoCAD","Chrome","VS Code","Tableau"]):null,instance_type:rand(["stream.standard.medium","stream.compute.large","stream.memory.xlarge"]),session_duration_minutes:event.includes("ENDED")?randInt(1,480):null,storage_connector:rand([null,"HomeFolder","OneDrive","GoogleDrive"]),idle_disconnect_timeout_minutes:rand([15,30,60]),max_user_duration_hours:rand([2,4,8,12]),error_code:isErr?rand(["FLEET_CAPACITY_EXCEEDED","IAM_SERVICE_ROLE_ERROR","USER_NOT_AUTHORIZED"]):null}},"user":{name:user},"event":{outcome:isErr?"failure":"success",category:"session",dataset:"aws.appstream",provider:"appstream2.amazonaws.com"},"message":isErr?`AppStream ${stack} ${event} FAILED: ${rand(["Fleet at capacity","IAM role error","User not authorized"])}:`:`AppStream ${event}: ${user} [${stack}]`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["FLEET_CAPACITY_EXCEEDED","IAM_SERVICE_ROLE_ERROR","USER_NOT_AUTHORIZED"]),message:"AppStream operation failed",type:"session"}}:{}) };
}

function generateLocationServiceLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const operation = rand(["SearchPlaceIndex","CalculateRoute","BatchEvaluateGeofences","GetDevicePosition","UpdateDevicePosition","ListGeofences","CreateRouteCalculator"]);
  const tracker = rand(["fleet-tracker","delivery-devices","asset-monitor","field-worker-track"]);
  const deviceId = `device-${randId(8).toLowerCase()}`;
  const lat = parseFloat(randFloat(-90,90)); const lon = parseFloat(randFloat(-180,180));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"location"}},"aws":{locationservice:{operation,tracker_name:operation.includes("Device")?tracker:null,geofence_collection:operation.includes("Geofence")?rand(["delivery-zones","restricted-areas","customer-sites"]):null,place_index:operation.includes("Place")?rand(["here-place-index","esri-place-index"]):null,route_calculator:operation.includes("Route")?rand(["truck-router","walking-calculator"]):null,device_id:operation.includes("Device")?deviceId:null,position:operation.includes("Device")?{lat,lon}:null,query:operation.includes("Search")?rand(["coffee shop","gas station","hospital","airport"]):null,distance_meters:operation.includes("Route")?randInt(100,500000):null,duration_seconds:operation.includes("Route")?randInt(60,18000):null,geofence_ids_entered:operation.includes("Geofences")?randInt(0,3):null,geofence_ids_exited:operation.includes("Geofences")?randInt(0,2):null,error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","ValidationException"]):null}},"event":{outcome:isErr?"failure":"success",category:"geo",dataset:"aws.location",provider:"geo.amazonaws.com"},"message":isErr?`Location Service ${operation} FAILED: ${rand(["Resource not found","Throttled","Invalid coordinates"])}:`:`Location Service ${operation}: ${operation.includes("Device")?deviceId:rand(["place search","route calc","geofence check"])}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ThrottlingException","ValidationException"]),message:"Location Service failed",type:"geo"}}:{}) };
}

function generateManagedBlockchainLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const network = rand(["Hyperledger Fabric","Ethereum"]);
  const networkId = `n-${randId(26)}`;
  const event = rand(["ProposalCreated","VoteCompleted","MemberCreated","NodeCreated","TransactionSubmitted","ChaincodeDefined","ChannelCreated"]);
  const txId = randId(64).toLowerCase();
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"managedblockchain"}},"aws":{managedblockchain:{network_id:networkId,network_name:rand(["supply-chain-net","financial-consortium","logistics-network"]),framework:network,framework_version:network==="Hyperledger Fabric"?rand(["2.2","2.4"]):"Ethereum",member_id:`m-${randId(26)}`,member_name:rand(["Company-A","Company-B","Auditor","Bank-1"]),node_id:`nd-${randId(26)}`,event_type:event,transaction_id:event.includes("Transaction")?txId:null,proposal_id:event.includes("Proposal")||event.includes("Vote")?randId(26):null,channel_name:network==="Hyperledger Fabric"?rand(["mychannel","supply-channel","audit-channel"]):null,chaincode_id:event.includes("Chaincode")?rand(["asset-transfer","token-contract","escrow"]):null,status:isErr?"FAILED":"SUCCEEDED",error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","IllegalActionException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.blockchain",provider:"managedblockchain.amazonaws.com"},"message":isErr?`ManagedBlockchain ${event} FAILED [${network}]: ${rand(["Unauthorized","Proposal rejected","Node unavailable"])}:`:`ManagedBlockchain ${event} [${network}]: ${txId?txId.substring(0,16)+"...":event}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"BlockchainError",message:"Managed Blockchain operation failed",type:"process"}}:{}) };
}

function generateServiceQuotasLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const svc = rand(["ec2","lambda","rds","s3","dynamodb","ecs","vpc","iam"]);
  const quotaName = rand(["Running On-Demand Standard instances","Concurrent executions","DB instances","Buckets per account","Provisioned write capacity units","Running tasks","VPCs per region","Roles per account"]);
  const limit = rand([5,10,20,50,100,500,1000,5000,10000]);
  const current = isErr?Math.floor(limit*parseFloat(randFloat(0.9,1.1))):Math.floor(limit*parseFloat(randFloat(0.5,0.89)));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"servicequotas"}},"aws":{servicequotas:{service_code:svc,quota_code:`L-${randId(8)}`,quota_name:quotaName,quota_value:limit,current_utilization:current,utilization_percent:Math.round(current/limit*100),adjustable:rand([true,false]),request_id:isErr?`${randId(8)}-${randId(4)}`.toLowerCase():null,request_status:isErr?rand(["PENDING","CASE_OPENED"]):null,applied_level:rand(["ACCOUNT","RESOURCE"])}},"event":{outcome:isErr?"failure":"success",category:"configuration",dataset:"aws.servicequotas",provider:"servicequotas.amazonaws.com"},"message":current>=limit?`Service Quotas EXCEEDED: ${svc} ${quotaName} at ${current}/${limit} (${Math.round(current/limit*100)}%)`:`Service Quotas: ${svc} ${quotaName} at ${current}/${limit} (${Math.round(current/limit*100)}%)`,"log":{level:current>=limit?"error":current/limit>=0.9?"warn":"info"},...(current>=limit?{error:{code:"QuotaExceeded",message:"Service Quota exceeded",type:"quota"}}:{}) };
}

function generateComputeOptimizerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const resourceType = rand(["EC2_INSTANCE","EBS_VOLUME","LAMBDA_FUNCTION","ECS_SERVICE_FARGATE","AUTO_SCALING_GROUP"]);
  const finding = isErr?rand(["OVERPROVISIONED","UNDERPROVISIONED"]):rand(["OPTIMIZED","OPTIMIZED","OVERPROVISIONED"]);
  const currentType = rand(["t3.medium","m5.xlarge","c5.2xlarge","r5.large","t3.large"]);
  const recommendedType = rand(["t3.small","m5.large","c5.xlarge","r5.medium","t3.medium"]);
  const saving = finding==="OVERPROVISIONED"?parseFloat(randFloat(5,500)):0;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"computeoptimizer"}},"aws":{computeoptimizer:{resource_type:resourceType,resource_arn:`arn:aws:ec2:${region}:${acct.id}:instance/i-${randId(17).toLowerCase()}`,finding,current_configuration:{instance_type:currentType,vcpu:randInt(2,32),memory_gb:randInt(4,128)},recommended_configuration:{instance_type:recommendedType,vcpu:randInt(1,16),memory_gb:randInt(2,64)},estimated_monthly_savings_usd:saving,estimated_monthly_savings_percent:saving>0?parseFloat(randFloat(10,60)):0,lookback_period_days:rand([14,32,93]),utilization:{cpu_max:parseFloat(randFloat(5,95)),memory_max:parseFloat(randFloat(10,95))},performance_risk:rand(["VeryLow","Low","Medium","High"])}},"event":{outcome:isErr?"failure":"success",category:"configuration",dataset:"aws.computeoptimizer",provider:"compute-optimizer.amazonaws.com"},"message":finding==="OVERPROVISIONED"?`Compute Optimizer: ${resourceType} OVERPROVISIONED — downsize ${currentType}→${recommendedType}, save ${saving.toFixed(0)}/mo`:finding==="UNDERPROVISIONED"?`Compute Optimizer: ${resourceType} UNDERPROVISIONED — consider upgrading ${currentType}→${recommendedType}:`:`Compute Optimizer: ${resourceType} OPTIMIZED (${currentType})`,"log":{level:finding==="UNDERPROVISIONED"?"warn":"info"},...(isErr?{error:{code:"OptimizerFinding",message:"Compute Optimizer finding",type:"configuration"}}:{}) };
}

function generateRamLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const resourceType = rand(["ec2:Subnet","ec2:TransitGateway","ram:ResourceShare","route53resolver:ResolverRule","license-manager:LicenseConfiguration","networkmanager:CoreNetwork"]);
  const action = rand(["CreateResourceShare","AssociateResourceShare","GetResourceShareInvitations","AcceptResourceShareInvitation","DisassociateResourceShare","RejectResourceShareInvitation"]);
  const accountId = `${acct.id}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"ram"}},"aws":{ram:{resource_share_arn:`arn:aws:ram:${region}:${acct.id}:resource-share/${randId(36).toLowerCase()}`,resource_share_name:rand(["shared-subnets","transit-gateway-share","resolver-rules-share"]),resource_type:resourceType,action,principal:accountId,allow_external_principals:rand([true,false]),status:isErr?"FAILED":rand(["ACTIVE","PENDING"]),invitation_status:action.includes("Invitation")?rand(["PENDING","ACCEPTED","REJECTED"]):null,error_code:isErr?rand(["UnknownResourceException","OperationNotPermittedException","MissingRequiredParameterException"]):null}},"event":{action,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.ram",provider:"ram.amazonaws.com"},"message":isErr?`RAM ${action} FAILED: ${rand(["Permission denied","Resource not found","Invalid principal"])}:`:`RAM ${action}: ${resourceType} shared with account ${accountId}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"RAMError",message:"RAM operation failed",type:"iam"}}:{}) };
}

function generateCodeGuruLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const repo = rand(["backend-api","data-pipeline","auth-service","ml-platform","frontend-app"]);
  const product = rand(["Reviewer","Profiler"]);
  const REVIEWER_FINDINGS = ["Security:TaintedDataUsedInSecurityCheck","CodeMaintainability:LongMethod","Performance:InefficientContainerSize","AWSBestPractices:S3BucketMissingServerSideEncryption","Logging:SensitiveDataInLogs"];
  const PROFILER_FINDINGS = ["HighCPUFrames:Base64Encoding","Excessive GC overhead","Hot method: HashMap.get","Lambda cold start overhead","Database N+1 queries"];
  const finding = product==="Reviewer"?rand(REVIEWER_FINDINGS):rand(PROFILER_FINDINGS);
  const severity = rand(["Critical","High","Medium","Low","Info"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"codeguru"}},"aws":{codeguru:{product,repository_name:repo,association_id:randId(36).toLowerCase(),finding_id:randId(36).toLowerCase(),category:product==="Reviewer"?rand(["Security","CodeMaintainability","Performance","AWSBestPractices","Logging"]):rand(["CPU","Memory","Latency","IO"]),severity,finding_description:finding,code_file:rand([`src/main/${repo.replace("-","")}/Handler.java`,"lambda_function.py","app/models.py","server/routes.js"]),line_number:randInt(1,500),pull_request_id:product==="Reviewer"?randInt(1,200):null,profiling_group:product==="Profiler"?`${repo}-profiling`:null,frame_percent:product==="Profiler"?parseFloat(randFloat(1,50)):null,error_code:isErr?rand(["InternalServerException","ThrottlingException","ResourceNotFoundException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.codeguru",provider:"codeguru.amazonaws.com"},"message":isErr?`CodeGuru ${product} FAILED [${repo}]: ${rand(["Internal error","Repository not found","Throttled"])}:`:`CodeGuru ${product} [${repo}] ${severity}: ${finding.split(":")[0]}`,"log":{level:isErr?"error":["Critical","High"].includes(severity)?"warn":"info"},...(isErr?{error:{code:rand(["InternalServerException","ThrottlingException","ResourceNotFoundException"]),message:"CodeGuru operation failed",type:"process"}}:{}) };
}

function generateDevOpsGuruLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const svc = rand(["lambda-api","rds-prod","ecs-workers","dynamodb-sessions","sqs-orders","elasticache-cache"]);
  const insightType = rand(["PROACTIVE","REACTIVE"]);
  const severity = rand(["HIGH","MEDIUM","LOW"]);
  const anomaly = rand(["Unusual increase in Lambda error rate","RDS CPU spike correlated with API latency","Memory utilization anomaly on ECS tasks","DynamoDB throttling pattern detected","SQS queue depth growing abnormally","ElastiCache eviction rate spike"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"devopsguru"}},"aws":{devopsguru:{insight_id:randId(36).toLowerCase(),insight_type:insightType,severity,resource_collection:{cloud_formation:{stack_names:[rand(["prod-stack","api-stack","data-stack"])]},tags:[{key:"environment",value:"production"}]},anomaly_id:randId(36).toLowerCase(),anomaly_description:anomaly,anomaly_sources:[svc],start_time:new Date(Date.now()-randInt(0,3600000)).toISOString(),end_time:isErr?null:new Date().toISOString(),status:isErr?"ONGOING":"CLOSED",recommendation:rand(["Scale up resource","Check recent deployments","Review alarm thresholds","Enable enhanced monitoring"]),ssm_ops_items:isErr?[`oi-${randId(8).toLowerCase()}`]:[]}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.devopsguru",provider:"devops-guru.amazonaws.com"},"message":isErr?`DevOps Guru ONGOING [${severity}]: ${anomaly}`:`DevOps Guru ${insightType} insight [${severity}]: ${anomaly}`,"log":{level:isErr?"error":severity==="HIGH"?"warn":"info"},...(isErr?{error:{code:"InsightOngoing",message:"DevOps Guru ongoing anomaly",type:"process"}}:{}) };
}

function generateIotDefenderLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const thingName = rand(["sensor-001","gateway-prod","controller-a4","camera-lobby","valve-plant-2"]);
  const auditFinding = rand(["DEVICE_CERTIFICATE_EXPIRING","REVOKED_CA_CERTIFICATE","IOT_POLICY_OVERLY_PERMISSIVE","UNAUTHENTICATED_COGNITO_ROLE_OVERLY_PERMISSIVE","AUTHENTICATION_FAILURES","LOGGING_DISABLED"]);
  const severity = rand(["CRITICAL","HIGH","MEDIUM","LOW"]);
  const violationType = rand(["large-msg-size","blanket-request","authorization-failure","device-cert-expiring","cell-data-transfer"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotdefender"}},"aws":{iotdefender:{thing_name:thingName,audit_check_name:auditFinding,finding_id:randId(36).toLowerCase(),severity,violation_id:randId(36).toLowerCase(),violation_type:violationType,security_profile_name:rand(["baseline-security-profile","factory-floor-profile","critical-devices"]),behavior_name:rand(["authorized-ip-range","msg-size","data-bytes-out"]),current_value:randInt(1,1000),threshold_value:randInt(1,100),consecutive_datapoints_to_alarm:randInt(2,5),error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","InternalFailureException"]):null}},"event":{kind:"alert",outcome:isErr?"failure":"success",category:"intrusion_detection",dataset:"aws.iotdefender",provider:"iot.amazonaws.com"},"message":isErr?`IoT Defender audit ERROR [${thingName}]: ${rand(["Internal failure","Resource not found"])}:`:`IoT Defender ${severity} [${thingName}]: ${auditFinding}`,"log":{level:isErr?"error":["CRITICAL","HIGH"].includes(severity)?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ThrottlingException","InternalFailureException"]),message:"IoT Defender audit error",type:"iot"}}:{}) };
}

function generateNetworkManagerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const event = rand(["LINK_STATUS_UP","LINK_STATUS_DOWN","TOPOLOGY_CHANGE","ROUTE_ANALYSIS_COMPLETE","CONNECTION_STATUS_UP","CONNECTION_STATUS_DOWN"]);
  const network = rand(["global-network-prod","global-network-dr","enterprise-wan"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"networkmanager"}},"aws":{networkmanager:{global_network_id:`network-${randId(17).toLowerCase()}`,global_network_name:network,event_type:event,device_id:`device-${randId(17).toLowerCase()}`,link_id:`link-${randId(17).toLowerCase()}`,site_id:`site-${randId(17).toLowerCase()}`,site_name:rand(["hq-london","dc-us-east","branch-tokyo","colo-frankfurt"]),bandwidth_mbps:rand([10,50,100,500,1000,10000]),provider:rand(["AT&T","BT","NTT","Telstra","Zayo"]),type:rand(["broadband","mpls","vpn","direct-connect"]),state:isErr?"DOWN":"UP",error_code:isErr?rand(["ThrottlingException","ResourceNotFoundException","ValidationException"]):null}},"event":{outcome:isErr?"failure":"success",category:"network",dataset:"aws.networkmanager",provider:"networkmanager.amazonaws.com"},"message":isErr?`Network Manager ${event} [${network}]: connection degraded`:`Network Manager ${event} [${network}]: ${rand(["hq-london","dc-us-east","branch-tokyo"])} link ${isErr?"DOWN":"UP"}`,"log":{level:isErr?"error":event.includes("DOWN")?"warn":"info"},...(isErr?{error:{code:rand(["ThrottlingException","ResourceNotFoundException"]),message:"Network Manager connection degraded",type:"network"}}:{}) };
}

function generateMigrationHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["web-tier-migration","database-rehost","legacy-erp","analytics-platform","on-prem-k8s"]);
  const status = isErr?rand(["MIGRATION_FAILED","NOT_STARTED"]):rand(["MIGRATION_IN_PROGRESS","MIGRATION_COMPLETE","MIGRATION_IN_PROGRESS"]);
  const server = `server-${randId(8).toLowerCase()}`;
  const tool = rand(["ApplicationMigrationService","DatabaseMigrationService","CloudEndure","Carbonite","ATADATA"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"migrationhub"}},"aws":{migrationhub:{application_id:`app-${randId(17).toLowerCase()}`,application_name:app,server_id:`d-server-${randId(13)}`,server_name:server,migration_status:status,migration_tool:tool,progress_update_stream:rand(["DMS-stream","SMS-stream","MGN-stream"]),task:{status:isErr?"FAILED":"IN_PROGRESS",progress_percent:isErr?randInt(10,90):randInt(50,100),total_objects:randInt(10,1000),replicated_objects:randInt(0,1000)},error_code:isErr?rand(["AccessDeniedException","ResourceNotFoundException","UnauthorizedOperation"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.migrationhub",provider:"mgh.amazonaws.com"},"message":isErr?`Migration Hub ${app} FAILED [${tool}]: ${rand(["Replication failed","Agent offline","Insufficient permissions"])}:`:`Migration Hub ${app} [${tool}]: ${status} — ${server}`,"log":{level:isErr?"error":status.includes("FAILED")?"warn":"info"},...(isErr?{error:{code:"MigrationFailed",message:"Migration Hub task failed",type:"migration"}}:{}) };
}

function generateResilienceHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["ecommerce-platform","payment-gateway","data-pipeline","customer-portal","inventory-service"]);
  const action = rand(["RunResiliencyAssessment","PublishRecommendations","ImportResourcesToDraft","DeleteResiliencyPolicy","CreateApp","CreateRecommendationTemplate"]);
  const rto = randInt(60, 3600); const rpo = randInt(60, 3600);
  const resiliencyScore = isErr?randInt(0,50):randInt(60,100);
  const tier = rand(["Critical","Core","Non-Critical","Important"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"resiliencehub"}},"aws":{resiliencehub:{app_arn:`arn:aws:resiliencehub:${region}:${acct.id}:app/${randId(36).toLowerCase()}`,app_name:app,operation:action,resiliency_score:resiliencyScore,compliance_status:isErr?"POLICY_BREACHED":"POLICY_MET",current_rto_seconds:rto,target_rto_seconds:isErr?Math.floor(rto*0.5):rto*2,current_rpo_seconds:rpo,target_rpo_seconds:isErr?Math.floor(rpo*0.5):rpo*2,tier,disruption_type:rand(["AZ","Hardware","Software","Region","all"]),recommendation_count:randInt(0,20),error_code:isErr?rand(["ResourceNotFoundException","ValidationException","ThrottlingException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.resiliencehub",provider:"resiliencehub.amazonaws.com"},"message":isErr?`Resilience Hub ${app} POLICY BREACHED [${tier}]: score=${resiliencyScore}, RTO ${rto}s exceeds target`:`Resilience Hub ${app} [${tier}]: score=${resiliencyScore}, RTO=${rto}s, RPO=${rpo}s`,"log":{level:isErr?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ValidationException","ThrottlingException"]),message:"Resilience Hub policy breached",type:"resilience"}}:{}) };
}

function generateWafv2Log(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const webAcl = rand(["prod-api-acl","cdn-waf","admin-portal-waf","regional-waf"]);
  const action = isErr?rand(["BLOCK","CAPTCHA","COUNT"]):rand(["ALLOW","ALLOW","BLOCK"]);
  const ruleGroup = rand(["AWSManagedRulesCommonRuleSet","AWSManagedRulesSQLiRuleSet","AWSManagedRulesKnownBadInputsRuleSet","RateBasedRule","CustomRules"]);
  const rule = rand(["SizeRestrictions_BODY","CrossSiteScripting_BODY","SQLi_QUERYARGUMENTS","GenericRFI_BODY","NoUserAgent_HEADER","RateLimitRule"]);
  const ip = randIp();
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"wafv2"}},"aws":{wafv2:{web_acl_name:webAcl,rule_group_name:ruleGroup,rule_name:rule,action,terminating_rule_id:rule,source_ip:ip,country:rand(["US","CN","RU","DE","GB","FR","BR","IN"]),uri:rand(HTTP_PATHS),method:rand(HTTP_METHODS),user_agent:rand(USER_AGENTS),blocked_reason:action==="BLOCK"?rand(["SQL injection","XSS attempt","Rate limit exceeded","Bad input pattern","Known bad IP"]):null,request_id:randId(36).toLowerCase(),labels:action==="BLOCK"?[rand(["awswaf:managed:aws:core-rule-set:CrossSiteScripting","awswaf:managed:aws:sql-database:SQLi_Args"])]:[]}},"source":{ip},"event":{action:action.toLowerCase(),outcome:action==="ALLOW"?"success":"failure",category:"intrusion_detection",dataset:"aws.waf",provider:"wafv2.amazonaws.com"},"message":action==="BLOCK"?`WAFv2 BLOCK [${webAcl}] ${ip}: ${ruleGroup}/${rule}`:`WAFv2 ${action} [${webAcl}] ${ip} ${rand(HTTP_METHODS)} ${rand(HTTP_PATHS)}`,"log":{level:action==="BLOCK"?"warn":"info"},...(action==="BLOCK"?{error:{code:"WAFBlock",message:"WAFv2 request blocked",type:"security"}}:{}) };
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY & SERVICE GROUP DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const GENERATORS = {
  // Group 1 — Serverless & Core
  lambda:generateLambdaLog, apigateway:generateApiGatewayLog, vpc:generateVpcFlowLog,
  cloudtrail:generateCloudTrailLog, rds:generateRdsLog, ecs:generateEcsLog,
  // Group 2 — Compute & Containers
  ec2:generateEc2Log, eks:generateEksLog, apprunner:generateAppRunnerLog,
  batch:generateBatchLog, elasticbeanstalk:generateBeanstalkLog,
  ecr:generateEcrLog, fargate:generateFargateLog, autoscaling:generateAutoScalingLog, imagebuilder:generateImageBuilderLog,
  // Group 3 — Networking & CDN
  alb:generateAlbLog, cloudfront:generateCloudFrontLog, waf:generateWafLog,
  route53:generateRoute53Log, networkfirewall:generateNetworkFirewallLog, shield:generateShieldLog,
  nlb:generateNlbLog, globalaccelerator:generateGlobalAcceleratorLog, transitgateway:generateTransitGatewayLog,
  directconnect:generateDirectConnectLog, vpn:generateVpnLog, privatelink:generatePrivateLinkLog,
  // Group 4 — Security & Compliance
  guardduty:generateGuardDutyLog, securityhub:generateSecurityHubLog, macie:generateMacieLog,
  inspector:generateInspectorLog, config:generateConfigLog, accessanalyzer:generateAccessAnalyzerLog,
  cognito:generateCognitoLog, kms:generateKmsLog, secretsmanager:generateSecretsManagerLog,
  acm:generateAcmLog, identitycenter:generateIamIdentityCenterLog, detective:generateDetectiveLog,
  // Group 5 — Storage & Databases
  s3:generateS3Log, dynamodb:generateDynamoDbLog, elasticache:generateElastiCacheLog,
  redshift:generateRedshiftLog, opensearch:generateOpenSearchLog, docdb:generateDocumentDbLog, ebs:generateEbsLog,
  efs:generateEfsLog, fsx:generateFsxLog, datasync:generateDataSyncLog,
  backup:generateBackupLog, storagegateway:generateStorageGatewayLog,
  aurora:generateAuroraLog, neptune:generateNeptuneLog, timestream:generateTimestreamLog,
  qldb:generateQldbLog, keyspaces:generateKeyspacesLog, memorydb:generateMemoryDbLog,
  // Group 6 — Streaming & Messaging
  kinesis:generateKinesisStreamsLog, firehose:generateFirehoseLog, msk:generateMskLog,
  sqs:generateSqsLog, eventbridge:generateEventBridgeLog, stepfunctions:generateStepFunctionsLog,
  sns:generateSnsLog, amazonmq:generateAmazonMqLog, appsync:generateAppSyncLog,
  // Group 7 — Developer & CI/CD
  codebuild:generateCodeBuildLog, codepipeline:generateCodePipelineLog,
  codedeploy:generateCodeDeployLog, xray:generateXRayLog,
  codecommit:generateCodeCommitLog, codeartifact:generateCodeArtifactLog, amplify:generateAmplifyLog,
  // Group 8 — Analytics
  emr:generateEmrLog, glue:generateGlueLog, athena:generateAthenaLog, kinesisanalytics:generateKinesisAnalyticsLog,
  lakeformation:generateLakeFormationLog, quicksight:generateQuickSightLog,
  databrew:generateDataBrewLog, appflow:generateAppFlowLog,
  // Group 9 — AI & ML
  sagemaker:generateSageMakerLog, bedrock:generateBedrockLog, bedrockagent:generateBedrockAgentLog,
  rekognition:generateRekognitionLog, textract:generateTextractLog, comprehend:generateComprehendLog,
  translate:generateTranslateLog, transcribe:generateTranscribeLog, polly:generatePollyLog,
  forecast:generateForecastLog, personalize:generatePersonalizeLog, lex:generateLexLog,
  // Group 10 — IoT
  iotcore:generateIotCoreLog, greengrass:generateIotGreengrassLog, iotanalytics:generateIotAnalyticsLog,
  // Group 11 — Management & Governance
  cloudformation:generateCloudFormationLog, ssm:generateSsmLog, cloudwatch:generateCloudWatchAlarmsLog,
  health:generateHealthLog, trustedadvisor:generateTrustedAdvisorLog,
  controltower:generateControlTowerLog, organizations:generateOrganizationsLog, dms:generateDmsLog,
  servicequotas:generateServiceQuotasLog, computeoptimizer:generateComputeOptimizerLog,
  ram:generateRamLog, resiliencehub:generateResilienceHubLog, migrationhub:generateMigrationHubLog,
  networkmanager:generateNetworkManagerLog, servicecatalog:generateServiceCatalogLog,
  budgets:generateBudgetsLog, billing:generateBillingLog,
  // Group 12 — Media & End User Computing
  mediaconvert:generateMediaConvertLog, medialive:generateMediaLiveLog,
  workspaces:generateWorkSpacesLog, connect:generateConnectLog,
  appstream:generateAppStreamLog,
  // Group 13 — Messaging & Communications
  ses:generateSesLog, pinpoint:generatePinpointLog,
  // Group 14 — Additional Services
  transferfamily:generateTransferFamilyLog, lightsail:generateLightsailLog,
  frauddetector:generateFraudDetectorLog, lookoutmetrics:generateLookoutMetricsLog,
  comprehendmedical:generateComprehendMedicalLog, gamelift:generateGameLiftLog,
  locationservice:generateLocationServiceLog, managedblockchain:generateManagedBlockchainLog,
  codeguru:generateCodeGuruLog, devopsguru:generateDevOpsGuruLog,
  iotevents:generateIotEventsLog, iotsitewise:generateIotSiteWiseLog,
  iotdefender:generateIotDefenderLog, wafv2:generateWafv2Log,
};

// ═══════════════════════════════════════════════════════════════════════════
// ELASTIC DATA STREAM DATASET MAPPING
// Maps app service ID → Elastic AWS integration data_stream.dataset
// So generated logs land in the correct integration dashboards/rules.
// See: https://github.com/elastic/integrations/tree/main/packages/aws/data_stream
// ═══════════════════════════════════════════════════════════════════════════

const ELASTIC_DATASET_MAP = {
  cloudtrail: "aws.cloudtrail",
  vpc: "aws.vpcflow",
  alb: "aws.elb_logs",
  nlb: "aws.elb_logs",
  guardduty: "aws.guardduty",
  s3: "aws.s3access",
  apigateway: "aws.apigateway_logs",
  cloudfront: "aws.cloudfront_logs",
  lambda: "aws.lambda_logs",
  networkfirewall: "aws.firewall_logs",
  securityhub: "aws.securityhub_findings",
  waf: "aws.waf",
  wafv2: "aws.waf",
  rds: "aws.rds",
  route53: "aws.route53_public_logs",
  emr: "aws.emr_logs",
  ec2: "aws.ec2_logs",
  ecs: "aws.ecs_metrics",
  config: "aws.config",
  inspector: "aws.inspector",
  dynamodb: "aws.dynamodb",
  redshift: "aws.redshift",
  ebs: "aws.ebs",
  kinesis: "aws.kinesis",
  msk: "aws.kafka_metrics",
  sns: "aws.sns",
  sqs: "aws.sqs",
  transitgateway: "aws.transitgateway",
  vpn: "aws.vpn",
  health: "aws.awshealth",
  bedrockagent: "aws.bedrockagent",
  billing: "aws.billing",
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES WITH METRICS IN ELASTIC AWS INTEGRATION
// When event type is "metrics", only these can be selected (integration has metrics data streams).
// See: https://github.com/elastic/integrations/tree/main/packages/aws (manifest policy_templates).
// ═══════════════════════════════════════════════════════════════════════════

// Services that have metrics in the Elastic AWS integration (or expose CloudWatch metrics). See Elastic docs & integration data streams.
const METRICS_SUPPORTED_SERVICE_IDS = new Set([
  "lambda", "apigateway", "rds", "ec2", "ecs", "fargate", "alb", "nlb", "dynamodb", "redshift", "ebs", "aurora",
  "kinesis", "msk", "firehose", "sns", "sqs", "s3", "cloudwatch", "transitgateway", "vpn", "waf", "wafv2",
  "networkfirewall", "emr", "health", "billing", "cloudfront", "stepfunctions", "eventbridge", "eks", "glue",
  "sagemaker", "bedrock", "bedrockagent",
  "athena", "elasticache", "opensearch", "docdb", "codebuild", "batch", "apprunner",
]);

// Dataset for metrics mode when it differs from logs (ELASTIC_DATASET_MAP). Omitted = use ELASTIC_DATASET_MAP.
const ELASTIC_METRICS_DATASET_MAP = {
  lambda:       "aws.lambda",
  apigateway:   "aws.apigateway_metrics",
  ecs:          "aws.ecs_metrics",
  fargate:      "aws.ecs_metrics",
  msk:          "aws.kafka_metrics",
  emr:          "aws.emr_metrics",
  s3:           "aws.s3_daily_storage",
  cloudwatch:   "aws.cloudwatch_metrics",
  alb:          "aws.elb",
  nlb:          "aws.elb",
  networkfirewall: "aws.firewall",
  billing:      "aws.billing",
  sagemaker:    "aws.sagemaker",
  bedrock:      "aws.bedrock",
  bedrockagent: "aws.bedrockagent",
};
export { GENERATORS, METRICS_SUPPORTED_SERVICE_IDS, ELASTIC_METRICS_DATASET_MAP, ELASTIC_DATASET_MAP };

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT INGESTION SOURCE PER SERVICE
// Based on how each AWS service natively delivers logs/findings to Elastic
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_INGESTION_DEFAULTS = {
  // ── S3 (logs written natively to S3 buckets, read via SQS/polling) ───────
  cloudtrail:      "s3",   // Trails deliver to S3
  alb:             "s3",   // ALB access logs → S3
  nlb:             "s3",   // NLB access logs → S3
  cloudfront:      "s3",   // CloudFront access logs → S3
  waf:             "s3",   // WAF via Firehose → S3
  wafv2:           "s3",   // WAFv2 via Firehose → S3
  vpc:             "s3",   // VPC Flow Logs (S3 preferred over CW for Elastic)
  networkfirewall: "s3",   // Network Firewall logs → S3
  s3:              "s3",   // S3 server access logs → S3

  // ── Firehose (push to Elastic HTTP endpoint, no polling) ─────────────────
  firehose:        "firehose", // Firehose IS the delivery mechanism

  // ── Direct API (Elastic polls AWS service APIs for findings/compliance) ──
  guardduty:       "api",  // GuardDuty Findings API
  securityhub:     "api",  // Security Hub GetFindingsV2 API (OCSF)
  inspector:       "api",  // Inspector findings API
  config:          "api",  // DescribeConfigRules / GetComplianceDetails
  accessanalyzer:  "api",  // Access Analyzer findings API
  macie:           "api",  // Macie findings API
  detective:       "api",  // Detective graph API
  trustedadvisor:  "api",  // Trusted Advisor check results API
  computeoptimizer:"api",  // Compute Optimizer recommendations API
  budgets:         "api",  // Cost Explorer / Budgets API
  billing:         "api",  // Cost and Usage Report / Cost Explorer API
  servicequotas:   "api",  // Service Quotas utilization API
  frauddetector:   "api",  // Fraud Detector API
  xray:            "api",  // X-Ray traces API

  // ── OTel (instrumented workloads via OTLP collector) ─────────────────────
  // (Most compute services also support OTel, but CloudWatch is the typical
  //  default for non-instrumented workloads)

  // ── CloudWatch Logs (everything else logs to CloudWatch log groups) ───────
  lambda:          "cloudwatch",
  apigateway:      "cloudwatch",
  rds:             "cloudwatch",
  aurora:          "cloudwatch",
  ecs:             "cloudwatch",
  fargate:         "cloudwatch",
  ec2:             "cloudwatch",
  eks:             "cloudwatch",
  apprunner:       "cloudwatch",
  elasticbeanstalk:"cloudwatch",
  batch:           "cloudwatch",
  autoscaling:     "cloudwatch",
  ecr:             "cloudwatch",
  imagebuilder:    "cloudwatch",
  route53:         "cloudwatch",
  globalaccelerator:"cloudwatch",
  transitgateway:  "cloudwatch",
  directconnect:   "cloudwatch",
  vpn:             "cloudwatch",
  privatelink:     "cloudwatch",
  shield:          "cloudwatch",
  cognito:         "cloudwatch",
  kms:             "cloudwatch",
  secretsmanager:  "cloudwatch",
  acm:             "cloudwatch",
  identitycenter:  "cloudwatch",
  dynamodb:        "cloudwatch",
  elasticache:     "cloudwatch",
  redshift:        "cloudwatch",
  opensearch:      "cloudwatch",
  docdb:           "cloudwatch",
  ebs:             "cloudwatch",
  efs:             "cloudwatch",
  fsx:             "cloudwatch",
  datasync:        "cloudwatch",
  backup:          "cloudwatch",
  storagegateway:  "cloudwatch",
  memorydb:        "cloudwatch",
  timestream:      "cloudwatch",
  qldb:            "cloudwatch",
  keyspaces:       "cloudwatch",
  neptune:         "cloudwatch",
  kinesis:         "cloudwatch",
  msk:             "cloudwatch",
  sqs:             "cloudwatch",
  eventbridge:     "cloudwatch",
  stepfunctions:   "cloudwatch",
  sns:             "cloudwatch",
  amazonmq:        "cloudwatch",
  appsync:         "cloudwatch",
  emr:             "cloudwatch",
  glue:            "cloudwatch",
  athena:          "cloudwatch",
  kinesisanalytics:"cloudwatch",
  lakeformation:   "cloudwatch",
  quicksight:      "cloudwatch",
  databrew:        "cloudwatch",
  appflow:         "cloudwatch",
  sagemaker:       "cloudwatch",
  bedrock:         "cloudwatch",
  bedrockagent:    "cloudwatch",
  rekognition:     "cloudwatch",
  textract:        "cloudwatch",
  comprehend:      "cloudwatch",
  translate:       "cloudwatch",
  transcribe:      "cloudwatch",
  polly:           "cloudwatch",
  forecast:        "cloudwatch",
  personalize:     "cloudwatch",
  lex:             "cloudwatch",
  iotcore:         "cloudwatch",
  greengrass:      "cloudwatch",
  iotanalytics:    "cloudwatch",
  iotevents:       "cloudwatch",
  iotsitewise:     "cloudwatch",
  iotdefender:     "cloudwatch",
  cloudformation:  "cloudwatch",
  ssm:             "cloudwatch",
  cloudwatch:      "cloudwatch",
  health:          "cloudwatch",
  controltower:    "cloudwatch",
  organizations:   "cloudwatch",
  servicecatalog:  "cloudwatch",
  dms:             "cloudwatch",
  networkmanager:  "cloudwatch",
  migrationhub:    "cloudwatch",
  resiliencehub:   "cloudwatch",
  ram:             "cloudwatch",
  codebuild:       "cloudwatch",
  codepipeline:    "cloudwatch",
  codedeploy:      "cloudwatch",
  codecommit:      "cloudwatch",
  codeartifact:    "cloudwatch",
  amplify:         "cloudwatch",
  codeguru:        "cloudwatch",
  devopsguru:      "cloudwatch",
  mediaconvert:    "cloudwatch",
  medialive:       "cloudwatch",
  workspaces:      "cloudwatch",
  connect:         "cloudwatch",
  appstream:       "cloudwatch",
  gamelift:        "cloudwatch",
  ses:             "cloudwatch",
  pinpoint:        "cloudwatch",
  transferfamily:  "cloudwatch",
  lightsail:       "cloudwatch",
  comprehendmedical:"cloudwatch",
  locationservice: "cloudwatch",
  managedblockchain:"cloudwatch",
  lookoutmetrics:  "cloudwatch",
};

const INGESTION_META = {
  s3:         { label:"S3",         color:"#FF9900", inputType:"aws-s3" },
  cloudwatch: { label:"CloudWatch", color:"#1BA9F5", inputType:"aws-cloudwatch" },
  firehose:   { label:"Firehose",   color:"#F04E98", inputType:"aws-firehose" },
  api:        { label:"API",        color:"#00BFB3", inputType:"http_endpoint" },
  otel:       { label:"OTel",       color:"#93C90E", inputType:"opentelemetry" },
  agent:      { label:"Agent",      color:"#a78bfa", inputType:"logfile" },
};

// Official AWS Architecture Icons (stored locally in public/aws-icons/). Service id → SVG filename. Fallback: keep Unicode icon.
const AWS_ICON_BASE = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL + "aws-icons" : "/aws-icons";
const AWS_SERVICE_ICON_MAP = {
  lambda: "AWSLambda", apigateway: "AmazonAPIGateway", vpc: "AmazonVirtualPrivateCloud", cloudtrail: "AWSCloudTrail",
  rds: "AmazonRDS", ecs: "AmazonElasticContainerService", ec2: "AmazonEC2", eks: "AmazonElasticKubernetesService",
  apprunner: "AWSAppRunner", batch: "AWSBatch", elasticbeanstalk: "AWSElasticBeanstalk", ecr: "AmazonElasticContainerRegistry",
  fargate: "AWSFargate", autoscaling: "AmazonEC2AutoScaling", imagebuilder: "AmazonEC2ImageBuilder",
  alb: "ElasticLoadBalancing", nlb: "ElasticLoadBalancing", cloudfront: "AmazonCloudFront", waf: "AWSWAF", wafv2: "AWSWAF",
  route53: "AmazonRoute53", networkfirewall: "AWSNetworkFirewall", shield: "AWSShield", globalaccelerator: "AWSGlobalAccelerator",
  transitgateway: "AWSTransitGateway", directconnect: "AWSDirectConnect", vpn: "AWSSitetoSiteVPN", privatelink: "AWSPrivateLink",
  guardduty: "AmazonGuardDuty", securityhub: "AWSSecurityHub", macie: "AmazonMacie", inspector: "AmazonInspector",
  config: "AWSConfig", accessanalyzer: "AWSIdentityandAccessManagement", cognito: "AmazonCognito", kms: "AWSKeyManagementService",
  secretsmanager: "AWSSecretsManager", acm: "AWSCertificateManager", identitycenter: "AWSIAMIdentityCenter", detective: "AmazonDetective",
  s3: "AmazonSimpleStorageService", dynamodb: "AmazonDynamoDB", elasticache: "AmazonElastiCache", redshift: "AmazonRedshift",
  opensearch: "AmazonOpenSearchService", docdb: "AmazonDocumentDB", ebs: "AmazonElasticBlockStore", efs: "AmazonEFS",
  fsx: "AmazonFSx", datasync: "AWSDataSync", backup: "AWSBackup", storagegateway: "AWSStorageGateway",
  aurora: "AmazonAurora", neptune: "AmazonNeptune", timestream: "AmazonTimestream", qldb: "AmazonQuantumLedgerDatabase",
  keyspaces: "AmazonKeyspaces", memorydb: "AmazonMemoryDB", kinesis: "AmazonKinesisDataStreams", firehose: "AmazonDataFirehose",
  kinesisanalytics: "AmazonManagedServiceforApacheFlink", msk: "AmazonManagedStreamingforApacheKafka",
  sqs: "AmazonSimpleQueueService", sns: "AmazonSimpleNotificationService", amazonmq: "AmazonMQ", eventbridge: "AmazonEventBridge",
  stepfunctions: "AWSStepFunctions", appsync: "AWSAppSync", codebuild: "AWSCodeBuild", codepipeline: "AWSCodePipeline",
  codedeploy: "AWSCodeDeploy", codecommit: "AWSCodeCommit", codeartifact: "AWSCodeArtifact", amplify: "AWSAmplify", xray: "AWSXRay",
  emr: "AmazonEMR", glue: "AWSGlue", athena: "AmazonAthena", lakeformation: "AWSLakeFormation", quicksight: "AmazonQuickSuite",
  databrew: "AWSGlueDataBrew", appflow: "AmazonAppFlow", sagemaker: "AmazonSageMaker", bedrock: "AmazonBedrock",
  bedrockagent: "AmazonBedrockAgentCore", rekognition: "AmazonRekognition", textract: "AmazonTextract", comprehend: "AmazonComprehend",
  translate: "AmazonTranslate", transcribe: "AmazonTranscribe", polly: "AmazonPolly", forecast: "AmazonForecast",
  personalize: "AmazonPersonalize", lex: "AmazonLex", iotcore: "AWSIoTCore", greengrass: "AWSIoTGreengrass",
  iotanalytics: "AmazonKinesisDataStreams", cloudformation: "AWSCloudFormation", ssm: "AWSSystemsManager",
  cloudwatch: "AmazonCloudWatch", health: "AWSHealthDashboard", trustedadvisor: "AWSTrustedAdvisor", controltower: "AWSControlTower",
  organizations: "AWSOrganizations", servicecatalog: "AWSServiceCatalog", servicequotas: "AWSConfig", computeoptimizer: "AWSComputeOptimizer",
  budgets: "AWSBudgets", billing: "AWSCostExplorer", ram: "AWSResourceAccessManager", resiliencehub: "AWSResilienceHub",
  migrationhub: "AWSMigrationHub", networkmanager: "AWSCloudWAN", dms: "AWSDatabaseMigrationService",
  mediaconvert: "AWSElementalMediaConvert", medialive: "AWSElementalMediaLive", workspaces: "AmazonWorkSpaces",
  connect: "AmazonConnect", appstream: "AmazonWorkSpaces", gamelift: "AmazonGameLiftServers", ses: "AmazonSimpleEmailService",
  pinpoint: "AmazonPinpoint", transferfamily: "AWSTransferFamily", lightsail: "AmazonLightsail", frauddetector: "AmazonFraudDetector",
  lookoutmetrics: "AmazonLookoutforMetrics", comprehendmedical: "AmazonComprehendMedical", locationservice: "AmazonLocationService",
  managedblockchain: "AmazonManagedBlockchain", codeguru: "AmazonCodeGuru", devopsguru: "AmazonDevOpsGuru",
  iotevents: "AWSIoTEvents", iotsitewise: "AWSIoTSiteWise", iotdefender: "AWSIoTDeviceDefender",
};

const SERVICE_GROUPS = [
  { id:"serverless", label:"Serverless & Core", color:"#FF9900", icon:"λ", services:[
    {id:"lambda",label:"Lambda",icon:"λ",desc:"Function execution logs"},
    {id:"apigateway",label:"API Gateway",icon:"⇌",desc:"HTTP access logs"},
    {id:"vpc",label:"VPC Flow",icon:"⟳",desc:"Network flow records"},
    {id:"cloudtrail",label:"CloudTrail",icon:"☁",desc:"API audit events"},
    {id:"rds",label:"RDS",icon:"⊞",desc:"Database query logs"},
    {id:"ecs",label:"ECS",icon:"▣",desc:"Container task logs"},
  ]},
  { id:"compute", label:"Compute & Containers", color:"#F04E98", icon:"□", services:[
    {id:"ec2",label:"EC2",icon:"□",desc:"System & auth logs"},
    {id:"eks",label:"EKS",icon:"☸",desc:"Kubernetes pod/node logs"},
    {id:"fargate",label:"Fargate",icon:"▷",desc:"Serverless container logs"},
    {id:"ecr",label:"ECR",icon:"◫",desc:"Container image & scan logs"},
    {id:"apprunner",label:"App Runner",icon:"▷",desc:"Container web app logs"},
    {id:"batch",label:"Batch",icon:"≡",desc:"Job queue & execution"},
    {id:"elasticbeanstalk",label:"Beanstalk",icon:"⊕",desc:"App deployment logs"},
    {id:"autoscaling",label:"Auto Scaling",icon:"⤢",desc:"Scale in/out events"},
    {id:"imagebuilder",label:"Image Builder",icon:"⊙",desc:"AMI pipeline logs"},
  ]},
  { id:"networking", label:"Networking & CDN", color:"#1BA9F5", icon:"⇆", services:[
    {id:"alb",label:"ALB",icon:"⚖",desc:"Load balancer access logs"},
    {id:"nlb",label:"NLB",icon:"⚡",desc:"TCP/TLS load balancer logs"},
    {id:"cloudfront",label:"CloudFront",icon:"◌",desc:"CDN access & cache logs"},
    {id:"waf",label:"WAF",icon:"◈",desc:"Web ACL block/allow events"},
    {id:"route53",label:"Route 53",icon:"◉",desc:"DNS query logs"},
    {id:"networkfirewall",label:"Network FW",icon:"⊘",desc:"Firewall flow logs"},
    {id:"shield",label:"Shield",icon:"⬡",desc:"DDoS detection events"},
    {id:"globalaccelerator",label:"Global Accelerator",icon:"⊛",desc:"Anycast routing logs"},
    {id:"transitgateway",label:"Transit Gateway",icon:"⟺",desc:"Cross-VPC routing logs"},
    {id:"directconnect",label:"Direct Connect",icon:"⌁",desc:"Dedicated circuit logs"},
    {id:"vpn",label:"Site-to-Site VPN",icon:"⊔",desc:"IPSec tunnel logs"},
    {id:"privatelink",label:"PrivateLink",icon:"⊗",desc:"VPC endpoint logs"},
  ]},
  { id:"security", label:"Security & Compliance", color:"#00BFB3", icon:"⚿", services:[
    {id:"guardduty",label:"GuardDuty",icon:"⚠",desc:"Threat detection findings"},
    {id:"securityhub",label:"Security Hub",icon:"◈",desc:"Aggregated security findings"},
    {id:"macie",label:"Macie",icon:"⊛",desc:"S3 sensitive data findings"},
    {id:"inspector",label:"Inspector",icon:"◎",desc:"Vulnerability findings"},
    {id:"config",label:"Config",icon:"⚙",desc:"Resource compliance events"},
    {id:"accessanalyzer",label:"Access Analyzer",icon:"⊕",desc:"IAM access path findings"},
    {id:"cognito",label:"Cognito",icon:"◯",desc:"User auth & sign-in events"},
    {id:"kms",label:"KMS",icon:"🔑",desc:"Key usage & rotation logs"},
    {id:"secretsmanager",label:"Secrets Manager",icon:"⊚",desc:"Secret access & rotation"},
    {id:"acm",label:"ACM",icon:"⊠",desc:"Certificate lifecycle logs"},
    {id:"identitycenter",label:"IAM Identity Center",icon:"⊕",desc:"SSO auth & provisioning"},
    {id:"detective",label:"Detective",icon:"⊙",desc:"Behavioral analysis findings"},
  ]},
  { id:"storage", label:"Storage & Databases", color:"#93C90E", icon:"⊞", services:[
    {id:"s3",label:"S3",icon:"○",desc:"Object access logs"},
    {id:"efs",label:"EFS",icon:"◫",desc:"NFS throughput & I/O logs"},
    {id:"fsx",label:"FSx",icon:"⊟",desc:"File system ops & backups"},
    {id:"ebs",label:"EBS",icon:"◫",desc:"Volume perf, state & snapshots"},
    {id:"backup",label:"AWS Backup",icon:"⊙",desc:"Backup job status logs"},
    {id:"datasync",label:"DataSync",icon:"⟺",desc:"Data transfer task logs"},
    {id:"storagegateway",label:"Storage Gateway",icon:"⊔",desc:"Hybrid storage logs"},
    {id:"dynamodb",label:"DynamoDB",icon:"⟐",desc:"NoSQL operation logs"},
    {id:"aurora",label:"Aurora",icon:"✦",desc:"Cluster failover & perf"},
    {id:"elasticache",label:"ElastiCache",icon:"⚡",desc:"Redis command logs"},
    {id:"memorydb",label:"MemoryDB",icon:"⚡",desc:"Durable Redis logs"},
    {id:"redshift",label:"Redshift",icon:"◇",desc:"Data warehouse query logs"},
    {id:"opensearch",label:"OpenSearch",icon:"◎",desc:"Search & index logs"},
    {id:"docdb",label:"DocumentDB",icon:"⊙",desc:"MongoDB-compat query logs"},
    {id:"neptune",label:"Neptune",icon:"⬡",desc:"Graph DB query logs"},
    {id:"timestream",label:"Timestream",icon:"⌚",desc:"Time-series write & query"},
    {id:"qldb",label:"QLDB",icon:"⊛",desc:"Ledger transaction logs"},
    {id:"keyspaces",label:"Keyspaces",icon:"⊕",desc:"Cassandra-compat logs"},
  ]},
  { id:"streaming", label:"Streaming & Messaging", color:"#FEC514", icon:"⟿", services:[
    {id:"kinesis",label:"Kinesis Streams",icon:"〜",desc:"Data stream ingestion"},
    {id:"firehose",label:"Firehose",icon:"⤳",desc:"Delivery stream logs"},
    {id:"kinesisanalytics",label:"Kinesis Analytics",icon:"⟿",desc:"Real-time analytics logs"},
    {id:"msk",label:"MSK (Kafka)",icon:"⊕",desc:"Kafka broker logs"},
    {id:"sqs",label:"SQS",icon:"☰",desc:"Queue & DLQ events"},
    {id:"sns",label:"SNS",icon:"◉",desc:"Topic delivery logs"},
    {id:"amazonmq",label:"Amazon MQ",icon:"⊛",desc:"ActiveMQ/RabbitMQ logs"},
    {id:"eventbridge",label:"EventBridge",icon:"⬡",desc:"Event routing logs"},
    {id:"stepfunctions",label:"Step Functions",icon:"⤶",desc:"State machine execution"},
    {id:"appsync",label:"AppSync",icon:"⟺",desc:"GraphQL API logs"},
  ]},
  { id:"devtools", label:"Developer & CI/CD", color:"#7C3AED", icon:"⚙", services:[
    {id:"codebuild",label:"CodeBuild",icon:"⚙",desc:"Build job logs"},
    {id:"codepipeline",label:"CodePipeline",icon:"⟿",desc:"Pipeline stage events"},
    {id:"codedeploy",label:"CodeDeploy",icon:"⤳",desc:"Deployment lifecycle"},
    {id:"codecommit",label:"CodeCommit",icon:"⊙",desc:"Git push/PR events"},
    {id:"codeartifact",label:"CodeArtifact",icon:"⊛",desc:"Package publish & pull"},
    {id:"amplify",label:"Amplify",icon:"⚡",desc:"Frontend build & deploy"},
    {id:"xray",label:"X-Ray",icon:"◎",desc:"Distributed trace logs"},
  ]},
  { id:"analytics", label:"Analytics", color:"#F59E0B", icon:"◈", services:[
    {id:"emr",label:"EMR",icon:"⚙",desc:"Spark/Hadoop cluster logs"},
    {id:"glue",label:"Glue",icon:"⟺",desc:"ETL job execution logs"},
    {id:"athena",label:"Athena",icon:"◇",desc:"S3 SQL query logs"},
    {id:"lakeformation",label:"Lake Formation",icon:"◫",desc:"Data lake permissions"},
    {id:"quicksight",label:"QuickSight",icon:"◎",desc:"BI dashboard usage logs"},
    {id:"databrew",label:"DataBrew",icon:"⊕",desc:"Data prep job logs"},
    {id:"appflow",label:"AppFlow",icon:"⟿",desc:"SaaS integration logs"},
  ]},
  { id:"aiml", label:"AI & Machine Learning", color:"#E91E63", icon:"✦", services:[
    {id:"sagemaker",label:"SageMaker",icon:"✦",desc:"Training & inference logs"},
    {id:"bedrock",label:"Bedrock",icon:"⊙",desc:"Foundation model invocations"},
    {id:"bedrockagent",label:"Bedrock Agent",icon:"◇",desc:"Agent & knowledge base invocations"},
    {id:"rekognition",label:"Rekognition",icon:"◎",desc:"Image & video analysis"},
    {id:"textract",label:"Textract",icon:"⊟",desc:"Document text extraction"},
    {id:"comprehend",label:"Comprehend",icon:"⊛",desc:"NLP & entity detection"},
    {id:"translate",label:"Translate",icon:"⇌",desc:"Language translation logs"},
    {id:"transcribe",label:"Transcribe",icon:"⊙",desc:"Speech-to-text jobs"},
    {id:"polly",label:"Polly",icon:"◉",desc:"Text-to-speech synthesis"},
    {id:"forecast",label:"Forecast",icon:"⌚",desc:"Time-series prediction logs"},
    {id:"personalize",label:"Personalize",icon:"⊕",desc:"Recommendation engine logs"},
    {id:"lex",label:"Lex",icon:"◯",desc:"Chatbot intent & session"},
  ]},
  { id:"iot", label:"IoT", color:"#06B6D4", icon:"⊛", services:[
    {id:"iotcore",label:"IoT Core",icon:"⊛",desc:"Device connect & message"},
    {id:"greengrass",label:"Greengrass",icon:"⊙",desc:"Edge compute deployment"},
    {id:"iotanalytics",label:"IoT Analytics",icon:"⟿",desc:"Device data pipeline"},
  ]},
  { id:"management", label:"Management & Governance", color:"#64748B", icon:"⚙", services:[
    {id:"cloudformation",label:"CloudFormation",icon:"⊟",desc:"Stack create/update events"},
    {id:"ssm",label:"Systems Manager",icon:"⚙",desc:"Run Command & Patch logs"},
    {id:"cloudwatch",label:"CloudWatch Alarms",icon:"⚠",desc:"Metric alarm state changes"},
    {id:"health",label:"AWS Health",icon:"⊕",desc:"Service health events"},
    {id:"trustedadvisor",label:"Trusted Advisor",icon:"◎",desc:"Cost & security checks"},
    {id:"controltower",label:"Control Tower",icon:"⊛",desc:"Guardrail & account mgmt"},
    {id:"organizations",label:"Organizations",icon:"⟺",desc:"Account & policy events"},
    {id:"servicecatalog",label:"Service Catalog",icon:"⊙",desc:"Self-service provisioning"},
    {id:"servicequotas",label:"Service Quotas",icon:"⊠",desc:"Quota utilization & alerts"},
    {id:"computeoptimizer",label:"Compute Optimizer",icon:"⟳",desc:"Right-sizing recommendations"},
    {id:"budgets",label:"Budgets",icon:"◇",desc:"Cost threshold alerts"},
    {id:"billing",label:"Billing",icon:"$",desc:"Cost & usage (Elastic)"},
    {id:"ram",label:"Resource Access Manager",icon:"⊕",desc:"Cross-account sharing logs"},
    {id:"resiliencehub",label:"Resilience Hub",icon:"⊛",desc:"RTO/RPO assessment logs"},
    {id:"migrationhub",label:"Migration Hub",icon:"⟺",desc:"Server migration tracking"},
    {id:"networkmanager",label:"Network Manager",icon:"⊙",desc:"Global WAN topology logs"},
    {id:"dms",label:"DMS",icon:"⟺",desc:"Database migration logs"},
  ]},
  { id:"media", label:"Media & End User Computing", color:"#BE185D", icon:"▷", services:[
    {id:"mediaconvert",label:"MediaConvert",icon:"▷",desc:"Video transcoding jobs"},
    {id:"medialive",label:"MediaLive",icon:"◉",desc:"Live video channel logs"},
    {id:"workspaces",label:"WorkSpaces",icon:"□",desc:"Virtual desktop sessions"},
    {id:"connect",label:"Amazon Connect",icon:"◯",desc:"Contact centre call logs"},
    {id:"appstream",label:"AppStream",icon:"⊙",desc:"App streaming sessions"},
    {id:"gamelift",label:"GameLift",icon:"⬡",desc:"Game server & matchmaking"},
  ]},
  { id:"messaging", label:"Messaging & Communications", color:"#DB2777", icon:"◉", services:[
    {id:"ses",label:"SES",icon:"◉",desc:"Email send/bounce/complaint"},
    {id:"pinpoint",label:"Pinpoint",icon:"◎",desc:"Campaign & journey delivery"},
  ]},
  { id:"additional", label:"Additional Services", color:"#7C3AED", icon:"⊛", services:[
    {id:"transferfamily",label:"Transfer Family",icon:"⟺",desc:"SFTP/FTPS/AS2 transfers"},
    {id:"lightsail",label:"Lightsail",icon:"⊙",desc:"Simple compute instance logs"},
    {id:"frauddetector",label:"Fraud Detector",icon:"⚠",desc:"ML fraud risk decisions"},
    {id:"lookoutmetrics",label:"Lookout for Metrics",icon:"⌚",desc:"Anomaly detection alerts"},
    {id:"comprehendmedical",label:"Comprehend Medical",icon:"⊛",desc:"Clinical NLP & PHI logs"},
    {id:"locationservice",label:"Location Service",icon:"◉",desc:"Geofence & routing logs"},
    {id:"managedblockchain",label:"Managed Blockchain",icon:"⟺",desc:"Transaction & network logs"},
    {id:"codeguru",label:"CodeGuru",icon:"◎",desc:"Code quality findings"},
    {id:"devopsguru",label:"DevOps Guru",icon:"⊙",desc:"ML ops anomaly insights"},
    {id:"iotevents",label:"IoT Events",icon:"⬡",desc:"Device state machine logs"},
    {id:"iotsitewise",label:"IoT SiteWise",icon:"⌚",desc:"Industrial asset telemetry"},
    {id:"iotdefender",label:"IoT Defender",icon:"⚠",desc:"Device security audit logs"},
    {id:"wafv2",label:"WAF v2",icon:"◈",desc:"Web ACL allow/block rules"},
  ]},
];

const ALL_SERVICE_IDS = SERVICE_GROUPS.flatMap(g => g.services.map(s => s.id));

export default function App() {
  const [selectedServices, setSelectedServices] = useState(["lambda","apigateway"]);
  const [logsPerService, setLogsPerService] = useState(500);
  const [errorRate, setErrorRate] = useState(0.05);
  const [batchSize, setBatchSize] = useState(250);
  const [elasticUrl, setElasticUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [logsIndexPrefix, setLogsIndexPrefix] = useState("logs-aws");
  const [metricsIndexPrefix, setMetricsIndexPrefix] = useState("metrics-aws");
  const [eventType, setEventType] = useState("logs"); // "logs" | "metrics"
  const indexPrefix = eventType === "metrics" ? metricsIndexPrefix : logsIndexPrefix;
  const setIndexPrefix = eventType === "metrics" ? setMetricsIndexPrefix : setLogsIndexPrefix;
  const [ingestionSource, setIngestionSource] = useState("default");
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState({ sent:0, total:0, errors:0 });
  const [log, setLog] = useState([]);
  const [preview, setPreview] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const abortRef = useRef(false);

  const addLog = (msg, type="info") => setLog(prev => [...prev.slice(-100), {msg,type,ts:new Date().toLocaleTimeString()}]);

  const toggleService = (id) => {
    if (eventType === "metrics" && !METRICS_SUPPORTED_SERVICE_IDS.has(id) && !selectedServices.includes(id)) return;
    setSelectedServices(prev => prev.includes(id) ? prev.filter(s=>s!==id) : [...prev,id]);
  };

  const toggleGroup = (gid) => {
    const groupIds = SERVICE_GROUPS.find(g=>g.id===gid).services.map(s=>s.id);
    const selectableIds = eventType === "metrics" ? groupIds.filter(id => METRICS_SUPPORTED_SERVICE_IDS.has(id)) : groupIds;
    const allSel = selectableIds.length > 0 && selectableIds.every(id => selectedServices.includes(id));
    setSelectedServices(prev => allSel ? prev.filter(id => !groupIds.includes(id)) : [...new Set([...prev,...selectableIds])]);
  };

  const selectAll = () => setSelectedServices(eventType === "metrics" ? ALL_SERVICE_IDS.filter(id => METRICS_SUPPORTED_SERVICE_IDS.has(id)) : [...ALL_SERVICE_IDS]);
  const selectNone = () => setSelectedServices([]);
  const toggleCollapse = (gid) => setCollapsedGroups(prev => ({...prev,[gid]:!prev[gid]}));

  const getEffectiveSource = useCallback((svcId) => {
    if (ingestionSource !== "default") return ingestionSource;
    return SERVICE_INGESTION_DEFAULTS[svcId] || "cloudwatch";
  }, [ingestionSource]);

  const generatePreview = () => {
    if (!selectedServices.length) return;
    const svc = rand(selectedServices);
    setPreview(JSON.stringify(stripNulls(enrichDoc(GENERATORS[svc](new Date().toISOString(), errorRate), svc, getEffectiveSource(svc), eventType)), null, 2));
  };

  const enrichDoc = useCallback((doc, svc, source, evType) => {
    const region = doc.cloud?.region || rand(REGIONS);
    const accountId = doc.cloud?.account?.id || randAccount().id;
    const dataset = evType === "metrics"
      ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
      : (ELASTIC_DATASET_MAP[svc] || `aws.${svc}`);
    const bucket = `aws-${svc}-logs-${accountId}`;
    const key = `AWSLogs/${accountId}/${svc}/${region}/${new Date().toISOString().slice(0,10).replace(/-/g,"/")}/${svc}_${randId(20)}.log.gz`;
    const logGroup = `/aws/${svc}/logs`;
    const logStream = `${region}/${randId(8).toLowerCase()}`;

    const inputTypeMap = {
      s3:           "aws-s3",
      cloudwatch:   "aws-cloudwatch",
      firehose:     "aws-firehose",
      api:          "http_endpoint",
      otel:         "opentelemetry",
      agent:        "logfile",
    };

    const agentMeta = source === "agent"
      ? { type:"elastic-agent", version:"8.17.0", name:`elastic-agent-${region}`, id:randId(36).toLowerCase() }
      : source === "otel"
      ? { type:"otel", version:"0.115.0", name:`otel-collector-${region}` }
      : { type:"filebeat", version:"8.17.0", name:`filebeat-aws-${region}` };

    const otelFields = source === "otel" ? {
      "telemetry": {
        sdk: { name:"opentelemetry", language:"go", version:"1.31.0" },
        distro: { name:"elastic", version:"8.17.0" },
      },
    } : {};

    const firehoseFields = source === "firehose" ? {
      "aws": {
        ...doc.aws,
        s3:          { bucket:{ name:bucket, arn:`arn:aws:s3:::${bucket}` }, object:{ key } },
        cloudwatch:  { log_group:logGroup, log_stream:logStream, ingestion_time:new Date().toISOString() },
        firehose:    { arn:`arn:aws:firehose:${region}:${accountId}:deliverystream/aws-${svc}-stream`, request_id:randId(36).toLowerCase() },
      },
    } : {
      "aws": {
        ...doc.aws,
        s3:         { bucket:{ name:bucket, arn:`arn:aws:s3:::${bucket}` }, object:{ key } },
        cloudwatch: { log_group:logGroup, log_stream:logStream, ingestion_time:new Date().toISOString() },
      },
    };

    // ECS baseline: fill missing ECS fields so every service is searchable in ECS indices
    const ecsBaseline = {};
    if (!doc.source?.ip) ecsBaseline.source = { ...doc.source, ip: randIp(), port: doc.source?.port ?? randInt(1024, 65535) };
    if (!doc.destination?.ip && (doc.network || doc.source?.ip)) ecsBaseline.destination = { ...doc.destination, ip: randIp(), port: doc.destination?.port ?? rand([80, 443, 22, 3306, 5432]) };
    if (!doc.network?.transport && !doc.network?.bytes) ecsBaseline.network = { ...doc.network, transport: "tcp", direction: rand(["inbound", "outbound"]) };
    if (!doc.host?.name) ecsBaseline.host = { ...doc.host, name: `ip-${randIp().replace(/\./g, "-")}.ec2.internal`, hostname: `${svc}-${randId(8).toLowerCase()}` };
    if (!doc.process?.name) ecsBaseline.process = { ...doc.process, name: svc };
    if (!doc.user_agent?.original) ecsBaseline.user_agent = { ...doc.user_agent, original: rand(USER_AGENTS) };
    if (!doc.url?.path && !doc.url?.domain) ecsBaseline.url = { ...doc.url, path: rand(HTTP_PATHS), domain: `${svc}.${region}.amazonaws.com` };
    if (doc.event?.outcome === "failure" && !doc.error?.message) ecsBaseline.error = { ...doc.error, message: (typeof doc.message === "string" ? doc.message : null) || "Operation failed", type: "service" };
    if (!doc.user?.name && !doc.user?.id) ecsBaseline.user = { ...doc.user, name: "system" };
    if (!doc.service?.name) ecsBaseline.service = { ...doc.service, name: svc, type: doc.service?.type ?? "aws" };
    if (!doc.file?.path && !doc.file?.name && (doc.event?.category === "file" || doc.db)) ecsBaseline.file = { ...doc.file, path: `/var/log/aws/${svc}.log`, name: `${svc}.log` };

    const eventCategory = doc.event?.category || "event";
    const isMetrics = evType === "metrics";
    const base = {
      ...doc,
      ...ecsBaseline,
      ...firehoseFields,
      ...otelFields,
      "data_stream": { type: isMetrics ? "metrics" : "logs", dataset, namespace: "default" },
      "agent": agentMeta,
      "event": { ...doc.event, module: "aws", dataset, category: eventCategory },
      "input": { type: inputTypeMap[source] },
      "log": doc.log ? { ...doc.log, level: doc.log.level || "info" } : { level: "info" },
    };
    if (isMetrics) base.metricset = { name: "cloudwatch", period: 300000 };
    if (base.message == null) base.message = `AWS ${svc} event`;
    return base;
  }, []);

  const ship = useCallback(async () => {
    if (!selectedServices.length) { addLog("No services selected","error"); return; }
    if (!elasticUrl) { addLog("Elastic URL required","error"); return; }
    if (!apiKey) { addLog("API key required","error"); return; }
    abortRef.current = false;
    setStatus("running"); setLog([]);
    try {
    const url = elasticUrl.replace(/\/$/,"");
    const headers = {
      "Content-Type":   "application/x-ndjson",
      "x-elastic-url":  url,
      "x-elastic-key":  apiKey,
    };
    const endDate = new Date(); const startDate = new Date(endDate.getTime()-86400000);
    let totalSent=0, totalErrors=0;
    const totalLogs = selectedServices.length * logsPerService;
    setProgress({sent:0,total:totalLogs,errors:0});
    const eventLabel = eventType === "metrics" ? "metrics" : "logs";
    addLog(`Starting: ${totalLogs.toLocaleString()} ${eventLabel} across ${selectedServices.length} service(s)`);
    const effectivePrefix = indexPrefix;
    for (const svc of selectedServices) {
      if (abortRef.current) break;
      const dataset = eventType === "metrics"
        ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
        : (ELASTIC_DATASET_MAP[svc] || `aws.${svc}`);
      const indexSuffix = dataset.replace(/^aws\./, "");
      const gen = GENERATORS[svc]; const indexName = `${effectivePrefix}.${indexSuffix}`;
      const src = getEffectiveSource(svc);
      addLog(`▶ ${svc} → ${indexName} [${INGESTION_META[src]?.label||src}]`, "info");
      const allDocs = Array.from({length:logsPerService}, () => stripNulls(enrichDoc(gen(randTs(startDate,endDate), errorRate), svc, src, eventType)));
      let batchNum = 0;
      for (let i=0; i<allDocs.length; i+=batchSize) {
        if (abortRef.current) break;
        batchNum++;
        const batch = allDocs.slice(i, i+batchSize);
        const ndjson = batch.flatMap(doc => [JSON.stringify({create:{_index:indexName}}), JSON.stringify(doc)]).join("\n")+"\n";
        try {
          const res = await fetch(`/proxy/_bulk`, {method:"POST",headers,body:ndjson});
          const json = await res.json();
          if (!res.ok) { totalErrors+=batch.length; addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason||res.status}`,"error"); }
          else {
            const failedItems = json.items?.filter(i=>i.create?.error||i.index?.error)||[];
            const errs = failedItems.length;
            totalErrors+=errs; totalSent+=batch.length-errs;
            if (errs > 0) {
              const firstErr = failedItems[0]?.create?.error || failedItems[0]?.index?.error;
              addLog(`  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0,120)}`,"warn");
            } else {
              addLog(`  ✓ batch ${batchNum}: ${batch.length} indexed`, "ok");
            }
          }
        } catch(e) { totalErrors+=batch.length; addLog(`  ✗ network error: ${e.message}`,"error"); }
        setProgress({sent:totalSent,total:totalLogs,errors:totalErrors});
        await new Promise(r=>setTimeout(r,20));
      }
      addLog(`✓ ${svc} complete`,"ok");
    }
    setStatus(abortRef.current?"aborted":"done");
    addLog(abortRef.current?`Aborted. ${totalSent} shipped.`:`Done! ${totalSent.toLocaleString()} indexed, ${totalErrors} errors.`, totalErrors>0?"warn":"ok");
    } catch(fatal) {
      setStatus("done");
      addLog(`Fatal error: ${fatal.message}`, "error");
      console.error("Ship error:", fatal);
    }
  }, [selectedServices,logsPerService,errorRate,batchSize,elasticUrl,apiKey,logsIndexPrefix,metricsIndexPrefix,ingestionSource,enrichDoc,getEffectiveSource,eventType]);

  const pct = progress.total>0 ? Math.round((progress.sent/progress.total)*100) : 0;
  const totalSelected = selectedServices.length;
  const totalServices = ALL_SERVICE_IDS.length;

  return (
    <div style={{minHeight:"100vh",background:"#e5e7eb",color:"#0f172a",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>

      {/* Announcement bar */}
      <div style={{background:"#ffffff",borderBottom:"1px solid #e2e8f0",padding:"8px 0",textAlign:"center"}}>
        <span style={{fontSize:12,color:"#64748b"}}>
          {["#FEC514","#F04E98","#1BA9F5","#00BFB3","#93C90E"].map((c,i)=>(
            <span key={i} style={{color:c,marginRight:3}}>●</span>
          ))}
          {" "}{totalServices} AWS services · 14 themed groups · ECS-compliant · per-service ingestion defaults · ships directly to Elastic Cloud
        </span>
      </div>

      {/* Nav */}
      <nav style={{borderBottom:"1px solid #e2e8f0",padding:"0 40px",display:"flex",alignItems:"center",height:62,background:"#ffffff"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <PipelineLogo size={36}/>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#0f172a",letterSpacing:"-0.02em",lineHeight:1.1}}>AWS → Elastic Load Generator</div>
            <div style={{fontSize:10,color:"#64748b",letterSpacing:"0.04em"}}>AWS → Elastic Cloud</div>
          </div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:16}}>
          <span style={{fontSize:12,color:"#64748b"}}>{totalSelected}/{totalServices} services</span>
          {status==="running" && <StatusPill color="#f59e0b" dot>Shipping</StatusPill>}
          {status==="done"    && <StatusPill color="#10b981">Complete</StatusPill>}
          {status==="aborted" && <StatusPill color="#ef4444">Aborted</StatusPill>}
        </div>
      </nav>

      {/* Hero */}
      <div style={{textAlign:"center",padding:"36px 40px 24px"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:99,padding:"5px 16px",fontSize:12,color:"#64748b",marginBottom:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
          <PipelineLogo size={16}/> <span>Bulk AWS → Elastic Load Generator for Elastic Cloud</span>
        </div>
        <h1 style={{fontSize:36,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em",lineHeight:1.12,marginBottom:10}}>
          Generate &amp; ship<br/>
          <span style={{background:"linear-gradient(90deg,#FEC514,#F04E98,#1BA9F5)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            realistic AWS logs
          </span>
        </h1>
        <p style={{color:"#475569",fontSize:14,maxWidth:580,margin:"0 auto"}}>
          {totalServices} services across 14 groups — each pre-configured with its real-world ingestion source (S3, CloudWatch, API, Firehose, OTel). Override per-service or globally.
        </p>
      </div>

      {/* Main grid */}
      <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:20,maxWidth:1220,margin:"0 auto",padding:"0 32px 60px",alignItems:"start"}}>

        {/* LEFT — Service selection */}
        <div>
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <span style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>Select Services</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <QuickBtn onClick={selectAll}>All {totalServices}</QuickBtn>
                <QuickBtn onClick={selectNone}>None</QuickBtn>
                {totalSelected>0&&(
                  <span style={{fontSize:11,fontWeight:600,color:"#10b981",background:"#10b98118",border:"1px solid #10b98144",borderRadius:99,padding:"2px 10px"}}>
                    {totalSelected} selected
                  </span>
                )}
              </div>
            </div>
            {/* Ingestion source legend */}
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,padding:"8px 10px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
              <span style={{fontSize:10,color:"#64748b",marginRight:4,alignSelf:"center"}}>Ingestion:</span>
              {Object.entries(INGESTION_META).map(([key,m])=>(
                <span key={key} style={{fontSize:9,fontWeight:600,color:m.color,background:`${m.color}18`,border:`1px solid ${m.color}44`,borderRadius:4,padding:"2px 7px"}}>{m.label}</span>
              ))}
              {ingestionSource!=="default"&&(
                <span style={{fontSize:9,color:"#f59e0b",marginLeft:4,alignSelf:"center"}}>⚠ Override active: all services using {INGESTION_META[ingestionSource]?.label}</span>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {SERVICE_GROUPS.map(group => {
                const groupIds = group.services.map(s=>s.id);
                const selectableInGroup = eventType === "metrics" ? groupIds.filter(id=>METRICS_SUPPORTED_SERVICE_IDS.has(id)) : groupIds;
                const selCount = selectableInGroup.filter(id=>selectedServices.includes(id)).length;
                const allSel = selectableInGroup.length > 0 && selCount === selectableInGroup.length;
                const someSel = selCount > 0 && !allSel;
                const collapsed = collapsedGroups[group.id];
                return (
                  <div key={group.id} style={{border:`1px solid ${allSel?group.color+"88":someSel?group.color+"66":"#e2e8f0"}`,borderRadius:10,overflow:"hidden",background:allSel?`${group.color}12`:someSel?`${group.color}08`:"#ffffff",transition:"border-color 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",userSelect:"none"}} onClick={()=>toggleCollapse(group.id)}>
                      {AWS_SERVICE_ICON_MAP[group.services[0]?.id] ? (
                        <img src={`${AWS_ICON_BASE}/${AWS_SERVICE_ICON_MAP[group.services[0].id]}.svg`} alt="" style={{ width:18, height:18, objectFit:"contain" }} />
                      ) : (
                        <span style={{fontSize:14,minWidth:18,color:selCount>0?group.color:"#64748b"}}>{group.icon}</span>
                      )}
                      <span style={{fontSize:12,fontWeight:600,color:selCount>0?group.color:"#475569",flex:1}}>{group.label}</span>
                      <span style={{fontSize:10,color:"#64748b"}}>{eventType==="metrics"?`${selectableInGroup.length} metrics` : `${group.services.length} services`}</span>
                      {selCount>0&&(
                        <span style={{fontSize:10,fontWeight:700,color:group.color,background:`${group.color}20`,border:`1px solid ${group.color}44`,borderRadius:99,padding:"1px 8px"}}>{selCount}/{selectableInGroup.length}</span>
                      )}
                      <button onClick={e=>{e.stopPropagation();toggleGroup(group.id);}} style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`1px solid ${group.color}44`,background:allSel?`${group.color}22`:"transparent",color:group.color,cursor:"pointer",fontFamily:"inherit",fontWeight:600,transition:"all 0.15s"}}>
                        {allSel?"Deselect all":"Select all"}
                      </button>
                      <span style={{color:"#94a3b8",fontSize:10,marginLeft:2}}>{collapsed?"▶":"▼"}</span>
                    </div>
                    {!collapsed&&(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:"0 10px 10px"}}>
                        {group.services.map(svc=>{
                          const sel = selectedServices.includes(svc.id);
                          const metricsDisabled = eventType === "metrics" && !METRICS_SUPPORTED_SERVICE_IDS.has(svc.id);
                          const src = getEffectiveSource(svc.id);
                          const meta = INGESTION_META[src];
                          return (
                            <button key={svc.id} onClick={()=>!metricsDisabled&&toggleService(svc.id)} style={{
                              border:`1px solid ${sel?group.color+"99":metricsDisabled?"#e2e8f0":"#cbd5e1"}`,
                              borderRadius:8,padding:"9px 8px",
                              background:sel?`${group.color}18`:metricsDisabled?"#e5e7eb":"#f8fafc",
                              cursor:metricsDisabled?"not-allowed":"pointer",
                              textAlign:"left",transition:"all 0.15s",position:"relative",overflow:"hidden",
                              opacity:metricsDisabled?0.7:1,
                            }}>
                              {sel&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:group.color,borderRadius:"8px 8px 0 0"}}/>}
                              {AWS_SERVICE_ICON_MAP[svc.id] ? (
                                <img src={`${AWS_ICON_BASE}/${AWS_SERVICE_ICON_MAP[svc.id]}.svg`} alt="" style={{ width:28, height:28, objectFit:"contain" }} />
                              ) : (
                                <div style={{fontSize:15,marginBottom:4}}>{svc.icon}</div>
                              )}
                              <div style={{fontSize:10,fontWeight:700,color:sel?group.color:metricsDisabled?"#94a3b8":"#475569",marginBottom:2}}>{svc.label}</div>
                              <div style={{fontSize:9,color:metricsDisabled?"#94a3b8":"#64748b",lineHeight:1.3,marginBottom:5}}>{svc.desc}</div>
                              {metricsDisabled ? <div style={{fontSize:9,color:"#94a3b8",fontWeight:600}}>No metrics</div> : <div style={{fontSize:9,fontWeight:600,color:meta?.color||"#64748b",background:`${meta?.color||"#64748b"}18`,border:`1px solid ${meta?.color||"#64748b"}44`,borderRadius:4,padding:"1px 5px",display:"inline-block"}}>{meta?.label||src}</div>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* RIGHT — Config + progress + log */}
        <div style={{display:"flex",flexDirection:"column",gap:14,position:"sticky",top:16}}>

          <Card>
            <CardHeader label="Volume & Settings"/>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#475569",marginBottom:6}}>Event type</div>
                <div style={{display:"inline-flex",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden",background:"#f8fafc"}}>
                  <button onClick={()=>{ setEventType("logs"); }} style={{
                    padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",
                    background:eventType==="logs"?"#ffffff":"transparent",color:eventType==="logs"?"#0f172a":"#64748b",transition:"all 0.15s",boxShadow:eventType==="logs"?"0 1px 2px rgba(0,0,0,0.05)":"none",
                  }}>Logs</button>
                  <button onClick={()=>{ setEventType("metrics"); setSelectedServices(prev=>prev.filter(id=>METRICS_SUPPORTED_SERVICE_IDS.has(id))); }} style={{
                    padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",
                    background:eventType==="metrics"?"#ffffff":"transparent",color:eventType==="metrics"?"#0f172a":"#64748b",transition:"all 0.15s",boxShadow:eventType==="metrics"?"0 1px 2px rgba(0,0,0,0.05)":"none",
                  }}>Metrics</button>
                </div>
                {eventType==="metrics"&&<div style={{fontSize:10,color:"#64748b",marginTop:4}}>Only services with metrics in the Elastic AWS integration are selectable. Index: metrics-aws.*</div>}
              </div>
              <SliderField label={eventType==="metrics"?"Metrics per service":"Logs per service"} value={logsPerService} min={50} max={5000} step={50}
                onChange={setLogsPerService} display={`${logsPerService.toLocaleString()} docs`}
                sublabel={`${(totalSelected*logsPerService).toLocaleString()} total docs across ${totalSelected} service(s)`}/>
              <SliderField label="Error rate" value={errorRate} min={0} max={0.5} step={0.01}
                onChange={v=>setErrorRate(parseFloat(v))} display={`${(errorRate*100).toFixed(0)}%`}
                sublabel="Percentage generated as errors or failures"/>
              <SliderField label="Bulk batch size" value={batchSize} min={50} max={1000} step={50}
                onChange={setBatchSize} display={`${batchSize}/request`}
                sublabel="Documents per Elasticsearch _bulk request"/>
            </div>
          </Card>

          <Card>
            <CardHeader label="Elastic Cloud Connection"/>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label="Elasticsearch URL">
                <input value={elasticUrl} onChange={e=>setElasticUrl(e.target.value)}
                  placeholder="https://my-deployment.es.us-east-1.aws.elastic.cloud" style={inputStyle}/>
              </Field>
              <Field label="API Key">
                <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
                  placeholder="base64-encoded-api-key" style={inputStyle}/>
              </Field>
              <Field label="Index prefix">
                <input value={indexPrefix} onChange={e=>setIndexPrefix(e.target.value)}
                  placeholder="logs-aws" style={inputStyle}/>
                <div style={{fontSize:10,color:"#64748b",marginTop:5}}>
                  e.g. <span style={{color:"#7c3aed"}}>{indexPrefix}-lambda</span>, <span style={{color:"#7c3aed"}}>{indexPrefix}-guardduty</span>…
                </div>
              </Field>
              <Field label="Ingestion source">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  {/* Default option spanning full width */}
                  <button onClick={()=>setIngestionSource("default")} style={{
                    gridColumn:"1/-1",
                    padding:"9px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${ingestionSource==="default"?"#10b981":"#e2e8f0"}`,
                    background:ingestionSource==="default"?"rgba(16,185,129,0.12)":"#f8fafc",
                    color:ingestionSource==="default"?"#10b981":"#475569",
                    transition:"all 0.15s",display:"flex",alignItems:"center",gap:8,textAlign:"left",
                  }}>
                    <span style={{fontSize:14}}>⚙</span>
                    <div>
                      <div>Default (per-service)</div>
                      <div style={{fontSize:9,fontWeight:400,opacity:0.7,marginTop:1}}>S3 · CloudWatch · API · Firehose — each service uses its real-world default</div>
                    </div>
                    {ingestionSource==="default" && <span style={{marginLeft:"auto",fontSize:11}}>✓</span>}
                  </button>
                </div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:6,fontWeight:500}}>Override all services:</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[
                    ["s3",         "S3 Bucket",    "#FF9900"],
                    ["cloudwatch", "CloudWatch",   "#1BA9F5"],
                    ["firehose",   "Firehose",     "#F04E98"],
                    ["api",        "API",          "#00BFB3"],
                    ["otel",       "OTel",         "#93C90E"],
                    ["agent",      "Elastic Agent","#a78bfa"],
                  ].map(([val,lbl,col]) => (
                    <button key={val} onClick={()=>setIngestionSource(val)} style={{
                      padding:"7px 6px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                      border:`1.5px solid ${ingestionSource===val?col:col+"33"}`,
                      background:ingestionSource===val?`${col}22`:"#f8fafc",
                      color:ingestionSource===val?col:col+"cc",transition:"all 0.15s",
                    }}>{lbl}</button>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#64748b",marginTop:8,padding:"6px 8px",background:"#f8fafc",borderRadius:6,border:"1px solid #e2e8f0"}}>
                  {ingestionSource==="default" ? (
                    <span>Each service uses its correct real-world ingestion method. Badges on service cards show the source.</span>
                  ) : {
                    s3:         <><span style={{color:"#FF9900"}}>aws-s3</span> · All services read from S3 bucket via SQS notifications</>,
                    cloudwatch: <><span style={{color:"#1BA9F5"}}>aws-cloudwatch</span> · All services polled from CloudWatch log groups</>,
                    firehose:   <><span style={{color:"#F04E98"}}>aws-firehose</span> · All services pushed via Firehose delivery stream</>,
                    api:        <><span style={{color:"#00BFB3"}}>http_endpoint</span> · All services via direct REST API ingestion</>,
                    otel:       <><span style={{color:"#93C90E"}}>opentelemetry</span> · All services via OTLP collector (telemetry.sdk fields added)</>,
                    agent:      <><span style={{color:"#a78bfa"}}>logfile</span> · All services collected by Elastic Agent from log files</>,
                  }[ingestionSource]}
                </div>
              </Field>
            </div>
          </Card>

          <div style={{display:"flex",gap:8}}>
            <button onClick={generatePreview} style={{...btnSecondary,flex:"0 0 auto"}}>Preview doc</button>
            {status==="running"
              ? <button onClick={()=>{abortRef.current=true;}} style={{...btnDanger,flex:1}}>Stop shipping</button>
              : <button onClick={ship} disabled={!totalSelected||!elasticUrl||!apiKey} style={{...btnPrimary,flex:1,opacity:(totalSelected&&elasticUrl&&apiKey)?1:0.4,cursor:(totalSelected&&elasticUrl&&apiKey)?"pointer":"not-allowed"}}>
                  ⚡ Ship {totalSelected>0?`${(totalSelected*logsPerService).toLocaleString()} logs`:"logs"}
                </button>}
          </div>

          {status&&(
            <Card>
              <CardHeader label="Progress" badge={`${pct}%`} badgeColor={pct===100?"#10b981":"#f59e0b"}/>
              <div style={{height:6,background:"#e2e8f0",borderRadius:99,overflow:"hidden",marginBottom:14}}>
                <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#FEC514,#F04E98,#1BA9F5)",borderRadius:99,transition:"width 0.3s"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <StatCard label="Indexed" value={progress.sent.toLocaleString()} color="#10b981"/>
                <StatCard label="Total" value={progress.total.toLocaleString()} color="#64748b"/>
                <StatCard label="Errors" value={progress.errors.toLocaleString()} color={progress.errors>0?"#ef4444":"#94a3b8"}/>
              </div>
            </Card>
          )}

          {preview&&(
            <Card>
              <CardHeader label="Sample Document"/>
              <pre style={{fontSize:10,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:12,overflowX:"auto",color:"#475569",maxHeight:220,overflowY:"auto",lineHeight:1.6,fontFamily:"'JetBrains Mono','Fira Code',monospace"}}>{preview}</pre>
            </Card>
          )}

          <Card>
            <CardHeader label="Activity Log"/>
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",minHeight:72,maxHeight:240,overflowY:"auto",fontFamily:"'JetBrains Mono','Fira Code',monospace",fontSize:10,lineHeight:1.9}}>
              {log.length===0
                ? <span style={{color:"#94a3b8",fontStyle:"italic"}}>Waiting for activity…</span>
                : log.map((e,i)=>(
                  <div key={i} style={{color:{ok:"#10b981",error:"#ef4444",warn:"#f59e0b",info:"#64748b"}[e.type]||"#64748b"}}>
                    <span style={{color:"#94a3b8"}}>[{e.ts}] </span>{e.msg}
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html:`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        input::placeholder { color: #94a3b8 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #e5e7eb; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
        input:focus { outline: none !important; border-color: #7c3aed !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.15) !important; }
        button { transition: all 0.15s; }
        button:not(:disabled):hover { filter: brightness(0.97); transform: translateY(-1px); }
        button:not(:disabled):active { transform: translateY(0); }
        input[type=range] { -webkit-appearance:none; height:6px; border-radius:99px; background:#e2e8f0; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#7c3aed; cursor:pointer; border:2px solid #4f46e5; }
      `}}/>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const inputStyle = {width:"100%",background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",color:"#0f172a",fontSize:13,fontFamily:"inherit",transition:"border-color 0.15s,box-shadow 0.15s"};
const btnPrimary  = {padding:"11px 22px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff"};
const btnSecondary = {padding:"11px 18px",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit",background:"#f8fafc",border:"1px solid #cbd5e1",color:"#475569"};
const btnDanger   = {padding:"11px 22px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626"};

function Card({children,style={}}) {
  return <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:"18px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",...style}}>{children}</div>;
}
function CardHeader({label,badge,badgeColor="#7c3aed"}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
    <span style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{label}</span>
    {badge&&<span style={{fontSize:11,fontWeight:600,color:badgeColor,background:`${badgeColor}18`,border:`1px solid ${badgeColor}44`,borderRadius:99,padding:"2px 10px"}}>{badge}</span>}
  </div>;
}
function QuickBtn({children,onClick}) {
  return <button onClick={onClick} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid #cbd5e1",background:"#f8fafc",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>{children}</button>;
}
function StatusPill({children,color,dot}) {
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:500,color,background:`${color}18`,border:`1px solid ${color}44`,borderRadius:99,padding:"3px 10px"}}>
    {dot&&<span style={{width:6,height:6,borderRadius:"50%",background:color,animation:"pulse 1.2s infinite"}}/>}{children}
  </span>;
}
function Field({label,children}) {
  return <div><div style={{fontSize:12,fontWeight:500,color:"#475569",marginBottom:6}}>{label}</div>{children}</div>;
}
function SliderField({label,value,min,max,step,onChange,display,sublabel}) {
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontSize:12,fontWeight:500,color:"#475569"}}>{label}</span>
      <span style={{fontSize:12,fontWeight:600,color:"#7c3aed",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:6,padding:"2px 8px"}}>{display}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",accentColor:"#7c3aed",cursor:"pointer"}}/>
    {sublabel&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>{sublabel}</div>}
  </div>;
}
function StatCard({label,value,color}) {
  return <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
    <div style={{fontSize:11,color:"#475569",marginBottom:4}}>{label}</div>
    <div style={{fontSize:20,fontWeight:700,color}}>{value}</div>
  </div>;
}
function PipelineLogo({size=32}) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="8"  r="2.8" fill="#FEC514"/>
    <circle cx="4" cy="16" r="2.8" fill="#F04E98"/>
    <circle cx="4" cy="24" r="2.8" fill="#1BA9F5"/>
    <circle cx="4" cy="32" r="2.8" fill="#00BFB3"/>
    <circle cx="4" cy="20" r="2.8" fill="#93C90E" opacity="0.85"/>
    <line x1="7"  y1="8"  x2="18" y2="20" stroke="#FEC514" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
    <line x1="7"  y1="16" x2="18" y2="20" stroke="#F04E98" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
    <line x1="7"  y1="24" x2="18" y2="20" stroke="#1BA9F5" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
    <line x1="7"  y1="32" x2="18" y2="20" stroke="#00BFB3" strokeWidth="1.6" strokeLinecap="round" opacity="0.9"/>
    <line x1="7"  y1="20" x2="18" y2="20" stroke="#93C90E" strokeWidth="1.6" strokeLinecap="round" opacity="0.85"/>
    <rect x="18.5" y="13.5" width="3" height="13" rx="1.5" fill="url(#cg)"/>
    <line x1="22" y1="20" x2="33" y2="20" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/>
    <circle cx="36" cy="20" r="3.5" fill="white" opacity="0.95"/>
    <circle cx="36" cy="20" r="2"   fill="#1e293b"/>
    <circle cx="36" cy="20" r="1"   fill="white" opacity="0.8"/>
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stopColor="#FEC514"/>
      <stop offset="25%"  stopColor="#F04E98"/>
      <stop offset="50%"  stopColor="#93C90E"/>
      <stop offset="75%"  stopColor="#1BA9F5"/>
      <stop offset="100%" stopColor="#00BFB3"/>
    </linearGradient></defs>
  </svg>;
}
