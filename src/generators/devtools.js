import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateCodeBuildLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount();
  const isErr = Math.random() < er;
  const project = rand(["web-app-build","api-service-build","infra-terraform","docker-build","test-runner","release-build"]);
  const dur = randInt(30, isErr?3600:900);
  const phase = rand(["DOWNLOAD_SOURCE","INSTALL","PRE_BUILD","BUILD","POST_BUILD","UPLOAD_ARTIFACTS","COMPLETED"]);
  const buildId = `${project}:${randId(8)}-${randId(4)}`.toLowerCase();
  const phaseDur = randInt(5, 300);
  const buildMsgs = isErr ? ["Build failed",`CodeBuild ${project} FAILED at phase ${phase} after ${dur}s`] : ["Build started","Build succeeded",`CodeBuild ${project} SUCCEEDED in ${dur}s`,`Phase ${phase} completed in ${phaseDur}s`];
  const plainMessage = rand(buildMsgs);
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
  const pipelineMsgPool = isErr ? ["Pipeline execution failed",`CodePipeline ${pipeline} FAILED at ${stage}`] : ["Pipeline execution started","Pipeline execution succeeded",`CodePipeline ${pipeline} SUCCEEDED`];
  const plainMessage = rand(pipelineMsgPool);
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
    "message": rand(isErr ? ["Deployment failed",`CodeDeploy ${app} FAILED at ${ev}: ${rand(["Script exited with code 1","Health check failed","Timeout"])}`] : ["Deployment started","Deployment succeeded",`CodeDeploy ${app} deployment SUCCEEDED in ${dur}s`]),
    "log": { level:isErr?"error":"info" },
    ...(isErr ? { error: { code: rand(["SCRIPT_FAILED","AGENT_ISSUE","HEALTH_CONSTRAINTS_INVALID"]), message: `CodeDeploy failed at ${ev}`, type: "deployment" } } : {})
  };
}

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

export { generateCodeBuildLog, generateCodePipelineLog, generateCodeDeployLog, generateCodeCommitLog, generateCodeArtifactLog, generateAmplifyLog, generateXRayLog, generateCodeGuruLog };
