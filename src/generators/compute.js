import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

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

function generateBatchLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const jobName = rand(["nightly-etl","report-generation","data-export","ml-training-prep","cleanup-job"]);
  const jobQueue = `${jobName}-queue`;
  const jobId = `${randId(8)}-${randId(4)}`.toLowerCase();
  const durationSec = randInt(10, level === "error" ? 7200 : 3600);
  const MSGS = { error:["Job run failed","Job failed with exit code 1","Container instance terminated unexpectedly","Job queue capacity exceeded","IAM role permission denied","Spot instance reclaimed during execution"],warn:["Job retry attempt 2/3","vCPU limit approaching: 980/1000","Job timeout warning: 80% elapsed"],info:["Job run started","Job run succeeded","Job submitted to queue","Container started on ECS instance","Job completed successfully","Job definition registered"] };
  const BATCH_ERROR_CODES = ["JobFailed","ContainerTerminated","CapacityExceeded","PermissionDenied","SpotReclaimed"];
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
          elapsedTime: durationSec,
          Duration: { avg: durationSec },
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
    "event":{outcome:isErr?"failure":"success",category:"package",dataset:"aws.ecr",provider:"ecr.amazonaws.com",duration:randInt(100,isErr?30000:5000)*1e6},
    "message":isErr?errMsg:`ECR ${action}: ${repo}:${tag}`,
    "log":{level:isErr?"warn":"info"},
    ...(isErr ? { error: { code: rand(ECR_ERROR_CODES), message: errMsg, type: "package" } } : {})};
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
  const desired = randInt(2, 20);
  const inService = isErr ? Math.max(0, desired - randInt(1, 3)) : desired;
  const activityDurationSec = randInt(30, 600);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"autoscaling"}},
    "aws":{autoscaling:{group_name:asg,
      activity_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      action_type:action,instance_id:`i-${randId(17).toLowerCase()}`,
      instance_type:rand(["t3.medium","m5.xlarge","c5.2xlarge","r5.large"]),
      desired_capacity:desired,min_size:2,max_size:50,
      current_capacity:inService,cause:reason,
      status_code:isErr?"Failed":"Successful",
      launch_template:rand(["web-lt:5","api-lt:3","worker-lt:8"]),
      metrics:{
        GroupDesiredCapacity: { avg: desired },
        GroupInServiceInstances: { avg: inService },
        GroupMinSize: { avg: 2 },
        GroupMaxSize: { avg: 50 },
        GroupPendingInstances: { avg: isErr ? randInt(1, 5) : 0 },
        GroupTerminatingInstances: { avg: action==="Terminate" ? randInt(1, 3) : 0 },
      }}},
    "event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.autoscaling",provider:"autoscaling.amazonaws.com",duration:activityDurationSec*1e9},
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
        ami_id:isErr?null:`ami-${randId(8).toLowerCase()}`,
        metrics:{
          BuildDuration: { avg: dur },
          ImageBuildSuccessCount: { sum: isErr ? 0 : 1 },
          ImageBuildFailureCount: { sum: isErr ? 1 : 0 },
          ComponentBuildDuration: { avg: randInt(60, Math.min(dur, 1200)) },
        }}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.imagebuilder",provider:"imagebuilder.amazonaws.com"},
    "message":isErr?errMsg:`Image Builder ${pipeline} ${phase} COMPLETED in ${dur}s`,
    "log":{level:isErr?"error":"info"},
    ...(isErr ? { error: { code: rand(IMAGEBUILDER_ERROR_CODES), message: errMsg, type: "process" } } : {})};
}

export { generateEc2Log, generateEcsLog, generateEksLog, generateBatchLog, generateBeanstalkLog, generateEcrLog, generateAutoScalingLog, generateImageBuilderLog };
