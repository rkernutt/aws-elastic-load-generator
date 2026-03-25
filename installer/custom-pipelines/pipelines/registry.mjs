/**
 * Registry of custom Elasticsearch ingest pipelines for AWS services
 * not covered by the official Elastic AWS integration.
 *
 * Pipeline naming convention:  logs-aws.{dataset_suffix}-default
 * This matches the index pattern the load generator writes documents into,
 * so pipelines are applied automatically on ingest.
 *
 * Processor strategy:
 *   - Services with structured JSON logging → json + targeted rename processors
 *   - All other services → json with ignore_failure (passes through plain-text safely)
 *
 * Services already covered by the official Elastic AWS integration are omitted:
 * cloudtrail, vpcflow, alb/nlb, guardduty, s3access, apigateway, cloudfront,
 * networkfirewall, securityhub, waf, rds (official), route53, emr (official),
 * ec2 (official), ecs, config, inspector, dynamodb, redshift, ebs, kinesis,
 * msk/kafka, sns, sqs, transitgateway, vpn, awshealth, bedrockagent, billing, natgateway.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal pipeline: parse JSON message into {ns}.parsed, ignore on failure. */
function json(ns) {
  return [{ json: { field: "message", target_field: `${ns}.parsed`, ignore_failure: true } }];
}

// ─── registry ───────────────────────────────────────────────────────────────

export const PIPELINE_REGISTRY = [

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.glue-default",
    dataset: "aws.glue",
    group: "analytics",
    description: "Parse Glue continuous logging JSON from message field",
    processors: [
      { json: { field: "message", target_field: "glue.parsed", ignore_failure: true } },
      { rename: { field: "glue.parsed.jobName",   target_field: "glue.jobName",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "glue.parsed.jobRunId",  target_field: "glue.jobRunId",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "glue.parsed.level",     target_field: "log.level",      ignore_missing: true, ignore_failure: true } },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "glue.parsed.errorCode", target_field: "error.code",     ignore_missing: true, ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.emr_logs-default",
    dataset: "aws.emr_logs",
    group: "analytics",
    description: "Parse EMR container/application log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "emr.parsed", ignore_failure: true } },
      { rename: { field: "emr.parsed.logLevel",      target_field: "log.level",      ignore_missing: true, ignore_failure: true } },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "emr.parsed.clusterId",     target_field: "emr.clusterId",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "emr.parsed.applicationId", target_field: "emr.applicationId", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "emr.parsed.containerId",   target_field: "emr.containerId",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "emr.parsed.component",     target_field: "emr.component",     ignore_missing: true, ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.athena-default",
    dataset: "aws.athena",
    group: "analytics",
    description: "Parse Athena query execution JSON from message field",
    processors: [
      { json: { field: "message", target_field: "athena.parsed", ignore_failure: true } },
      { rename: { field: "athena.parsed.queryId",         target_field: "athena.queryId",         ignore_missing: true, ignore_failure: true } },
      { rename: { field: "athena.parsed.workgroup",       target_field: "athena.workgroup",       ignore_missing: true, ignore_failure: true } },
      { rename: { field: "athena.parsed.database",        target_field: "athena.database",        ignore_missing: true, ignore_failure: true } },
      { rename: { field: "athena.parsed.state",           target_field: "athena.state",           ignore_missing: true, ignore_failure: true } },
      { rename: { field: "athena.parsed.durationSeconds", target_field: "athena.durationSeconds", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "athena.parsed.dataScannedBytes", target_field: "athena.dataScannedBytes", ignore_missing: true, ignore_failure: true } },
    ],
  },

  { id: "logs-aws.lakeformation-default",  dataset: "aws.lakeformation",  group: "analytics",  description: "Parse Lake Formation permission event JSON",   processors: json("lakeformation")  },
  { id: "logs-aws.quicksight-default",     dataset: "aws.quicksight",     group: "analytics",  description: "Parse QuickSight dashboard usage JSON",         processors: json("quicksight")     },
  { id: "logs-aws.databrew-default",       dataset: "aws.databrew",       group: "analytics",  description: "Parse DataBrew job execution JSON",             processors: json("databrew")       },
  { id: "logs-aws.appflow-default",        dataset: "aws.appflow",        group: "analytics",  description: "Parse AppFlow connector run JSON",              processors: json("appflow")        },
  { id: "logs-aws.opensearch-default",     dataset: "aws.opensearch",     group: "analytics",  description: "Parse OpenSearch Service operation JSON",       processors: json("opensearch")     },

  // ═══════════════════════════════════════════════════════════════════════════
  // ML / AI
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.sagemaker-default",
    dataset: "aws.sagemaker",
    group: "ml",
    description: "Parse SageMaker training/inference/studio log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "sagemaker.parsed", ignore_failure: true } },
      { rename: { field: "sagemaker.parsed.level",   target_field: "log.level",         ignore_missing: true, ignore_failure: true } },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "sagemaker.parsed.event",   target_field: "sagemaker.event",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "sagemaker.parsed.space",   target_field: "sagemaker.space",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "sagemaker.parsed.appType", target_field: "sagemaker.appType", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "sagemaker.parsed.user",    target_field: "sagemaker.user",    ignore_missing: true, ignore_failure: true } },
    ],
  },

  { id: "logs-aws.bedrock-default",         dataset: "aws.bedrock",           group: "ml",  description: "Parse Bedrock model invocation JSON",               processors: json("bedrock")           },
  { id: "logs-aws.rekognition-default",     dataset: "aws.rekognition",       group: "ml",  description: "Parse Rekognition image/video analysis JSON",        processors: json("rekognition")       },
  { id: "logs-aws.textract-default",        dataset: "aws.textract",          group: "ml",  description: "Parse Textract document analysis JSON",              processors: json("textract")          },
  { id: "logs-aws.comprehend-default",      dataset: "aws.comprehend",        group: "ml",  description: "Parse Comprehend NLP analysis JSON",                 processors: json("comprehend")        },
  { id: "logs-aws.comprehendmedical-default", dataset: "aws.comprehendmedical", group: "ml", description: "Parse Comprehend Medical clinical NLP JSON",        processors: json("comprehendmedical") },
  { id: "logs-aws.translate-default",       dataset: "aws.translate",         group: "ml",  description: "Parse Translate language translation JSON",           processors: json("translate")         },
  { id: "logs-aws.transcribe-default",      dataset: "aws.transcribe",        group: "ml",  description: "Parse Transcribe speech-to-text job JSON",           processors: json("transcribe")        },
  { id: "logs-aws.polly-default",           dataset: "aws.polly",             group: "ml",  description: "Parse Polly text-to-speech synthesis JSON",          processors: json("polly")             },
  { id: "logs-aws.forecast-default",        dataset: "aws.forecast",          group: "ml",  description: "Parse Forecast time-series prediction JSON",         processors: json("forecast")          },
  { id: "logs-aws.personalize-default",     dataset: "aws.personalize",       group: "ml",  description: "Parse Personalize recommendation engine JSON",       processors: json("personalize")       },
  { id: "logs-aws.lex-default",             dataset: "aws.lex",               group: "ml",  description: "Parse Lex chatbot intent & session JSON",            processors: json("lex")               },
  { id: "logs-aws.lookoutmetrics-default",  dataset: "aws.lookoutmetrics",    group: "ml",  description: "Parse Lookout for Metrics anomaly detector JSON",    processors: json("lookoutmetrics")    },
  {
    id: "logs-aws.qbusiness-default",
    dataset: "aws.qbusiness",
    group: "ml",
    description: "Parse Q Business query/retrieval/plugin event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "qbusiness.parsed", ignore_failure: true } },
      { rename: { field: "qbusiness.parsed.event_type",      target_field: "qbusiness.event_type",      ignore_missing: true, ignore_failure: true } },
      { rename: { field: "qbusiness.parsed.application_id",  target_field: "qbusiness.application_id",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "qbusiness.parsed.conversation_id", target_field: "qbusiness.conversation_id", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "qbusiness.parsed.guardrail_action", target_field: "qbusiness.guardrail_action", ignore_missing: true, ignore_failure: true } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVERLESS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.lambda_logs-default",
    dataset: "aws.lambda_logs",
    group: "serverless",
    description: "Parse Lambda log lines — START/END/REPORT structured extraction plus JSON fallback",
    processors: [
      // Single grok with all three Lambda system-line patterns; stops at first match.
      // REPORT is listed first as it has the most fields to extract.
      {
        grok: {
          field: "message",
          patterns: [
            "REPORT RequestId: %{DATA:lambda.requestId}\\s+Duration: %{NUMBER:lambda.durationMs:float} ms\\s+Billed Duration: %{NUMBER:lambda.billedDurationMs:float} ms\\s+Memory Size: %{NUMBER:lambda.memorySizeMB:int} MB\\s+Max Memory Used: %{NUMBER:lambda.maxMemoryUsedMB:int} MB",
            "START RequestId: %{DATA:lambda.requestId}\\s+Version: %{DATA:lambda.version}",
            "END RequestId: %{DATA:lambda.requestId}",
          ],
          ignore_failure: true,
          ignore_missing: true,
        },
      },
      // JSON fallback for structured application logs
      { json: { field: "message", target_field: "lambda.parsed", ignore_failure: true } },
    ],
  },

  { id: "logs-aws.stepfunctions-default",  dataset: "aws.stepfunctions",  group: "serverless",  description: "Parse Step Functions execution event JSON",      processors: json("stepfunctions")  },
  { id: "logs-aws.apprunner-default",      dataset: "aws.apprunner",      group: "serverless",  description: "Parse App Runner container log JSON",            processors: json("apprunner")      },
  { id: "logs-aws.appsync-default",        dataset: "aws.appsync",        group: "serverless",  description: "Parse AppSync GraphQL request log JSON",         processors: json("appsync")        },
  { id: "logs-aws.fargate-default",        dataset: "aws.fargate",        group: "serverless",  description: "Parse Fargate task log JSON",                    processors: json("fargate")        },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTE
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.ec2_logs-default", dataset: "aws.ec2_logs", group: "compute", description: "Parse EC2 instance log JSON from message field", processors: json("ec2") },

  { id: "logs-aws.eks-default",              dataset: "aws.eks",              group: "compute",  description: "Parse EKS Kubernetes pod/node log JSON",            processors: json("eks")              },
  { id: "logs-aws.ecr-default",              dataset: "aws.ecr",              group: "compute",  description: "Parse ECR image scan and push log JSON",            processors: json("ecr")              },
  { id: "logs-aws.batch-default",            dataset: "aws.batch",            group: "compute",  description: "Parse Batch job execution log JSON",                processors: json("batch")            },
  { id: "logs-aws.elasticbeanstalk-default", dataset: "aws.elasticbeanstalk", group: "compute",  description: "Parse Elastic Beanstalk deployment log JSON",       processors: json("elasticbeanstalk") },
  { id: "logs-aws.autoscaling-default",      dataset: "aws.autoscaling",      group: "compute",  description: "Parse Auto Scaling scale-in/out event JSON",        processors: json("autoscaling")      },
  { id: "logs-aws.imagebuilder-default",     dataset: "aws.imagebuilder",     group: "compute",  description: "Parse Image Builder AMI pipeline log JSON",         processors: json("imagebuilder")     },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASES  (RDS and Redshift have official integration; listed here as
  //             supplement pipelines for structured log parsing)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.rds-default",
    dataset: "aws.rds",
    group: "databases",
    description: "Parse RDS continuous log JSON from message field (supplements official integration)",
    processors: [
      { json: { field: "message", target_field: "rds.parsed", ignore_failure: true } },
      { rename: { field: "rds.parsed.level",  target_field: "log.level",  ignore_missing: true, ignore_failure: true } },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "rds.parsed.thread", target_field: "rds.thread", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "rds.parsed.logger", target_field: "rds.logger", ignore_missing: true, ignore_failure: true } },
    ],
  },

  { id: "logs-aws.elasticache-default",  dataset: "aws.elasticache",  group: "databases",  description: "Parse ElastiCache Redis command log JSON",        processors: json("elasticache")  },
  { id: "logs-aws.aurora-default",       dataset: "aws.aurora",       group: "databases",  description: "Parse Aurora cluster event log JSON",             processors: json("aurora")       },
  { id: "logs-aws.docdb-default",        dataset: "aws.docdb",        group: "databases",  description: "Parse DocumentDB MongoDB-compat query log JSON",  processors: json("docdb")        },
  { id: "logs-aws.neptune-default",      dataset: "aws.neptune",      group: "databases",  description: "Parse Neptune graph DB query log JSON",           processors: json("neptune")      },
  { id: "logs-aws.timestream-default",   dataset: "aws.timestream",   group: "databases",  description: "Parse Timestream write/query log JSON",           processors: json("timestream")   },
  { id: "logs-aws.qldb-default",         dataset: "aws.qldb",         group: "databases",  description: "Parse QLDB ledger transaction log JSON",          processors: json("qldb")         },
  { id: "logs-aws.keyspaces-default",    dataset: "aws.keyspaces",    group: "databases",  description: "Parse Keyspaces Cassandra-compat log JSON",       processors: json("keyspaces")    },
  { id: "logs-aws.memorydb-default",     dataset: "aws.memorydb",     group: "databases",  description: "Parse MemoryDB durable Redis log JSON",           processors: json("memorydb")     },

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.s3storagelens-default",  dataset: "aws.s3storagelens",  group: "storage",  description: "Parse S3 Storage Lens analytics & metrics JSON",   processors: json("s3storagelens")  },
  { id: "logs-aws.efs-default",            dataset: "aws.efs",            group: "storage",  description: "Parse EFS NFS throughput/I/O log JSON",            processors: json("efs")            },
  { id: "logs-aws.fsx-default",            dataset: "aws.fsx",            group: "storage",  description: "Parse FSx file system ops log JSON",               processors: json("fsx")            },
  { id: "logs-aws.backup-default",         dataset: "aws.backup",         group: "storage",  description: "Parse AWS Backup job status log JSON",             processors: json("backup")         },
  { id: "logs-aws.datasync-default",       dataset: "aws.datasync",       group: "storage",  description: "Parse DataSync transfer task log JSON",            processors: json("datasync")       },
  { id: "logs-aws.storagegateway-default", dataset: "aws.storagegateway", group: "storage",  description: "Parse Storage Gateway hybrid storage log JSON",    processors: json("storagegateway") },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.macie-default",          dataset: "aws.macie",          group: "security",  description: "Parse Macie S3 sensitive data finding JSON",         processors: json("macie")          },
  { id: "logs-aws.accessanalyzer-default", dataset: "aws.accessanalyzer", group: "security",  description: "Parse IAM Access Analyzer finding JSON",             processors: json("accessanalyzer") },
  { id: "logs-aws.cognito-default",        dataset: "aws.cognito",        group: "security",  description: "Parse Cognito user auth & sign-in event JSON",       processors: json("cognito")        },
  { id: "logs-aws.kms-default",            dataset: "aws.kms",            group: "security",  description: "Parse KMS key usage & rotation log JSON",            processors: json("kms")            },
  { id: "logs-aws.secretsmanager-default", dataset: "aws.secretsmanager", group: "security",  description: "Parse Secrets Manager access & rotation log JSON",   processors: json("secretsmanager") },
  { id: "logs-aws.acm-default",            dataset: "aws.acm",            group: "security",  description: "Parse ACM certificate lifecycle log JSON",           processors: json("acm")            },
  { id: "logs-aws.identitycenter-default", dataset: "aws.identitycenter", group: "security",  description: "Parse IAM Identity Center SSO auth log JSON",        processors: json("identitycenter") },
  { id: "logs-aws.detective-default",      dataset: "aws.detective",      group: "security",  description: "Parse Detective behavioural analysis finding JSON",   processors: json("detective")      },
  {
    id: "logs-aws.verifiedaccess-default",
    dataset: "aws.verifiedaccess",
    group: "security",
    description: "Parse Verified Access session/request audit log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "verifiedaccess.parsed", ignore_failure: true } },
      { rename: { field: "verifiedaccess.parsed.verdict",           target_field: "verifiedaccess.verdict",           ignore_missing: true, ignore_failure: true } },
      { rename: { field: "verifiedaccess.parsed.deny_reason",       target_field: "verifiedaccess.deny_reason",       ignore_missing: true, ignore_failure: true } },
      { rename: { field: "verifiedaccess.parsed.device_posture",    target_field: "verifiedaccess.device_posture",    ignore_missing: true, ignore_failure: true } },
      { rename: { field: "verifiedaccess.parsed.trust_provider_type", target_field: "verifiedaccess.trust_provider_type", ignore_missing: true, ignore_failure: true } },
    ],
  },
  {
    id: "logs-aws.securitylake-default",
    dataset: "aws.securitylake",
    group: "security",
    description: "Parse Security Lake OCSF 1.1.0 event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "securitylake.parsed", ignore_failure: true } },
      { rename: { field: "securitylake.parsed.class_uid",    target_field: "securitylake.class_uid",    ignore_missing: true, ignore_failure: true } },
      { rename: { field: "securitylake.parsed.category_uid", target_field: "securitylake.category_uid", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "securitylake.parsed.activity_id",  target_field: "securitylake.activity_id",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "securitylake.parsed.severity_id",  target_field: "securitylake.severity_id",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "securitylake.parsed.class_name",   target_field: "securitylake.class_name",   ignore_missing: true, ignore_failure: true } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORKING
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.shield-default",              dataset: "aws.shield",              group: "networking",  description: "Parse Shield DDoS detection event JSON",            processors: json("shield")              },
  { id: "logs-aws.globalaccelerator-default",   dataset: "aws.globalaccelerator",   group: "networking",  description: "Parse Global Accelerator anycast routing log JSON", processors: json("globalaccelerator")   },
  { id: "logs-aws.directconnect-default",       dataset: "aws.directconnect",       group: "networking",  description: "Parse Direct Connect circuit log JSON",             processors: json("directconnect")       },
  { id: "logs-aws.privatelink-default",         dataset: "aws.privatelink",         group: "networking",  description: "Parse PrivateLink VPC endpoint log JSON",           processors: json("privatelink")         },

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.firehose-default",          dataset: "aws.firehose",          group: "streaming",  description: "Parse Firehose delivery stream log JSON",           processors: json("firehose")          },
  { id: "logs-aws.kinesisanalytics-default",  dataset: "aws.kinesisanalytics",  group: "streaming",  description: "Parse Kinesis Analytics real-time app log JSON",    processors: json("kinesisanalytics")  },
  { id: "logs-aws.amazonmq-default",          dataset: "aws.amazonmq",          group: "streaming",  description: "Parse Amazon MQ ActiveMQ/RabbitMQ log JSON",        processors: json("amazonmq")          },
  { id: "logs-aws.eventbridge-default",       dataset: "aws.eventbridge",       group: "streaming",  description: "Parse EventBridge event routing log JSON",          processors: json("eventbridge")       },

  // ═══════════════════════════════════════════════════════════════════════════
  // IOT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.iot-default",
    dataset: "aws.iot",
    group: "iot",
    description: "Parse IoT Core device connect/publish JSON from message field",
    processors: [
      { json: { field: "message", target_field: "iot.parsed", ignore_failure: true } },
      { rename: { field: "iot.parsed.clientId", target_field: "iot.clientId", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "iot.parsed.action",   target_field: "iot.action",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "iot.parsed.topic",    target_field: "iot.topic",    ignore_missing: true, ignore_failure: true } },
    ],
  },

  { id: "logs-aws.greengrass-default", dataset: "aws.greengrass", group: "iot", description: "Parse Greengrass edge component log JSON from message field", processors: json("greengrass") },

  { id: "logs-aws.iotanalytics-default", dataset: "aws.iotanalytics", group: "iot",  description: "Parse IoT Analytics pipeline log JSON",           processors: json("iotanalytics") },
  { id: "logs-aws.iotdefender-default",  dataset: "aws.iotdefender",  group: "iot",  description: "Parse IoT Defender audit finding JSON",           processors: json("iotdefender")  },
  { id: "logs-aws.iotevents-default",    dataset: "aws.iotevents",    group: "iot",  description: "Parse IoT Events detector state machine JSON",    processors: json("iotevents")    },
  { id: "logs-aws.iotsitewise-default",  dataset: "aws.iotsitewise",  group: "iot",  description: "Parse IoT SiteWise industrial asset telemetry JSON", processors: json("iotsitewise") },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT & GOVERNANCE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.cloudformation-default",
    dataset: "aws.cloudformation",
    group: "management",
    description: "Parse CloudFormation stack event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "cloudformation.parsed", ignore_failure: true } },
      { rename: { field: "cloudformation.parsed.stackName",   target_field: "cloudformation.stackName",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "cloudformation.parsed.stackStatus", target_field: "cloudformation.stackStatus", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "cloudformation.parsed.action",      target_field: "cloudformation.action",      ignore_missing: true, ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.ssm-default",
    dataset: "aws.ssm",
    group: "management",
    description: "Parse Systems Manager Run Command / Session log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "ssm.parsed", ignore_failure: true } },
      { rename: { field: "ssm.parsed.commandId",    target_field: "ssm.commandId",    ignore_missing: true, ignore_failure: true } },
      { rename: { field: "ssm.parsed.documentName", target_field: "ssm.documentName", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "ssm.parsed.instanceId",   target_field: "ssm.instanceId",   ignore_missing: true, ignore_failure: true } },
      { rename: { field: "ssm.parsed.status",       target_field: "ssm.status",       ignore_missing: true, ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.codebuild-default",
    dataset: "aws.codebuild",
    group: "management",
    description: "Parse CodeBuild build log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "codebuild.parsed", ignore_failure: true } },
      { rename: { field: "codebuild.parsed.buildId",  target_field: "codebuild.buildId",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codebuild.parsed.project",  target_field: "codebuild.project",  ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codebuild.parsed.phase",    target_field: "codebuild.phase",    ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codebuild.parsed.status",   target_field: "codebuild.status",   ignore_missing: true, ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.codepipeline-default",
    dataset: "aws.codepipeline",
    group: "management",
    description: "Parse CodePipeline execution event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "codepipeline.parsed", ignore_failure: true } },
      { rename: { field: "codepipeline.parsed.pipeline",    target_field: "codepipeline.pipeline",    ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codepipeline.parsed.executionId", target_field: "codepipeline.executionId", ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codepipeline.parsed.stage",       target_field: "codepipeline.stage",       ignore_missing: true, ignore_failure: true } },
      { rename: { field: "codepipeline.parsed.state",       target_field: "codepipeline.state",       ignore_missing: true, ignore_failure: true } },
    ],
  },

  { id: "logs-aws.cloudwatch-default",        dataset: "aws.cloudwatch",        group: "management",  description: "Parse CloudWatch Alarms state change JSON",          processors: json("cloudwatch")        },
  { id: "logs-aws.trustedadvisor-default",    dataset: "aws.trustedadvisor",    group: "management",  description: "Parse Trusted Advisor check result JSON",            processors: json("trustedadvisor")    },
  { id: "logs-aws.controltower-default",      dataset: "aws.controltower",      group: "management",  description: "Parse Control Tower guardrail/account event JSON",   processors: json("controltower")      },
  { id: "logs-aws.organizations-default",     dataset: "aws.organizations",     group: "management",  description: "Parse Organizations account & policy event JSON",    processors: json("organizations")     },
  { id: "logs-aws.servicecatalog-default",    dataset: "aws.servicecatalog",    group: "management",  description: "Parse Service Catalog provisioning event JSON",      processors: json("servicecatalog")    },
  { id: "logs-aws.servicequotas-default",     dataset: "aws.servicequotas",     group: "management",  description: "Parse Service Quotas utilisation alert JSON",        processors: json("servicequotas")     },
  { id: "logs-aws.computeoptimizer-default",  dataset: "aws.computeoptimizer",  group: "management",  description: "Parse Compute Optimizer recommendation JSON",        processors: json("computeoptimizer")  },
  { id: "logs-aws.budgets-default",           dataset: "aws.budgets",           group: "management",  description: "Parse Budgets cost threshold alert JSON",            processors: json("budgets")           },
  { id: "logs-aws.ram-default",               dataset: "aws.ram",               group: "management",  description: "Parse Resource Access Manager sharing event JSON",   processors: json("ram")               },
  { id: "logs-aws.resiliencehub-default",     dataset: "aws.resiliencehub",     group: "management",  description: "Parse Resilience Hub RTO/RPO assessment JSON",       processors: json("resiliencehub")     },
  { id: "logs-aws.migrationhub-default",      dataset: "aws.migrationhub",      group: "management",  description: "Parse Migration Hub server migration status JSON",   processors: json("migrationhub")      },
  { id: "logs-aws.networkmanager-default",    dataset: "aws.networkmanager",    group: "management",  description: "Parse Network Manager WAN topology log JSON",        processors: json("networkmanager")    },
  { id: "logs-aws.dms-default",               dataset: "aws.dms",               group: "management",  description: "Parse DMS database migration task log JSON",         processors: json("dms")               },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPER TOOLS & CI/CD
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.codedeploy-default",   dataset: "aws.codedeploy",   group: "devtools",  description: "Parse CodeDeploy deployment lifecycle JSON",      processors: json("codedeploy")   },
  { id: "logs-aws.codecommit-default",   dataset: "aws.codecommit",   group: "devtools",  description: "Parse CodeCommit git push/PR event JSON",         processors: json("codecommit")   },
  { id: "logs-aws.codeartifact-default", dataset: "aws.codeartifact", group: "devtools",  description: "Parse CodeArtifact package publish/pull JSON",    processors: json("codeartifact") },
  { id: "logs-aws.amplify-default",      dataset: "aws.amplify",      group: "devtools",  description: "Parse Amplify build & deploy event JSON",         processors: json("amplify")      },
  { id: "logs-aws.xray-default",         dataset: "aws.xray",         group: "devtools",  description: "Parse X-Ray distributed trace segment JSON",      processors: json("xray")         },
  { id: "logs-aws.codeguru-default",     dataset: "aws.codeguru",     group: "devtools",  description: "Parse CodeGuru code quality finding JSON",        processors: json("codeguru")     },

  // ═══════════════════════════════════════════════════════════════════════════
  // END USER & MEDIA
  // ═══════════════════════════════════════════════════════════════════════════

  { id: "logs-aws.workspaces-default",      dataset: "aws.workspaces",      group: "enduser",  description: "Parse WorkSpaces virtual desktop session JSON",       processors: json("workspaces")      },
  { id: "logs-aws.connect-default",         dataset: "aws.connect",         group: "enduser",  description: "Parse Amazon Connect contact centre call log JSON",   processors: json("connect")         },
  { id: "logs-aws.appstream-default",       dataset: "aws.appstream",       group: "enduser",  description: "Parse AppStream app streaming session JSON",          processors: json("appstream")       },
  { id: "logs-aws.gamelift-default",        dataset: "aws.gamelift",        group: "enduser",  description: "Parse GameLift game server & matchmaking JSON",       processors: json("gamelift")        },
  { id: "logs-aws.ses-default",             dataset: "aws.ses",             group: "enduser",  description: "Parse SES email send/bounce/complaint event JSON",    processors: json("ses")             },
  { id: "logs-aws.pinpoint-default",        dataset: "aws.pinpoint",        group: "enduser",  description: "Parse Pinpoint campaign & journey delivery JSON",     processors: json("pinpoint")        },
  { id: "logs-aws.transfer-default",        dataset: "aws.transfer",        group: "enduser",  description: "Parse Transfer Family SFTP/FTPS/AS2 transfer JSON",  processors: json("transfer")        },
  { id: "logs-aws.lightsail-default",       dataset: "aws.lightsail",       group: "enduser",  description: "Parse Lightsail instance event JSON",                processors: json("lightsail")       },
  { id: "logs-aws.frauddetector-default",   dataset: "aws.frauddetector",   group: "enduser",  description: "Parse Fraud Detector ML risk decision JSON",         processors: json("frauddetector")   },
  { id: "logs-aws.location-default",        dataset: "aws.location",        group: "enduser",  description: "Parse Location Service geofence & routing JSON",     processors: json("location")        },
  { id: "logs-aws.mediaconvert-default",    dataset: "aws.mediaconvert",    group: "enduser",  description: "Parse MediaConvert transcoding job JSON",            processors: json("mediaconvert")    },
  { id: "logs-aws.medialive-default",       dataset: "aws.medialive",       group: "enduser",  description: "Parse MediaLive live video channel log JSON",        processors: json("medialive")       },
  { id: "logs-aws.blockchain-default",      dataset: "aws.blockchain",      group: "enduser",  description: "Parse Managed Blockchain transaction/network JSON",  processors: json("blockchain")      },
  { id: "logs-aws.devopsguru-default",      dataset: "aws.devopsguru",      group: "enduser",  description: "Parse DevOps Guru ML anomaly insight JSON",          processors: json("devopsguru")      },
  { id: "logs-aws.wafv2-default",           dataset: "aws.wafv2",           group: "networking", description: "Parse WAF v2 web ACL allow/block event JSON",       processors: json("wafv2")           },
];
