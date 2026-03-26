// ═══════════════════════════════════════════════════════════════════════════
// ELASTIC DATA STREAM DATASET MAPPING
// Maps app service ID → Elastic AWS integration data_stream.dataset
// ═══════════════════════════════════════════════════════════════════════════

const ELASTIC_DATASET_MAP = {
  cloudtrail: "aws.cloudtrail",
  vpc: "aws.vpcflow",
  alb: "aws.elb_logs",
  nlb: "aws.elb_logs",
  guardduty: "aws.guardduty",
  s3: "aws.s3access",
  storagelens: "aws.s3_storage_lens",
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
  natgateway: "aws.natgateway",
  // Elastic Security posture (non-AWS dataset path)
  cspm:        "cloud_security_posture.findings",
  kspm:        "cloud_security_posture.findings",
  kendra:           "aws.kendra",
  vpclattice:       "aws.vpclattice",
  mwaa:             "aws.mwaa",
  fis:              "aws.fis",
  cleanrooms:       "aws.cleanrooms",
  datazone:         "aws.datazone",
  securityir:       "aws.securityir",
  cloudhsm:         "aws.cloudhsm",
  managedgrafana:   "aws.managedgrafana",
  supplychain:      "aws.supplychain",
  iottwinmaker:     "aws.iottwinmaker",
  iotfleetwise:     "aws.iotfleetwise",
  codecatalyst:     "aws.codecatalyst",
  entityresolution: "aws.entityresolution",
  dataexchange:     "aws.dataexchange",
  devicefarm:       "aws.devicefarm",
  mskconnect:       "aws.mskconnect",
  a2i:              "aws.a2i",
  deadlinecloud:    "aws.deadlinecloud",
  healthlake:       "aws.healthlake",
  arc:              "aws.arc",
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES WITH METRICS IN ELASTIC AWS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const METRICS_SUPPORTED_SERVICE_IDS = new Set([
  // Core compute & serverless
  "lambda", "ec2", "ecs", "fargate", "eks", "apprunner", "elasticbeanstalk", "batch",
  // Compute (container registry & API layer)
  "ecr", "apigateway",
  // Networking & CDN
  "alb", "nlb", "cloudfront", "natgateway", "transitgateway", "vpn", "networkfirewall",
  "globalaccelerator", "directconnect", "vpc",
  // Networking (private connectivity & WAN)
  "privatelink", "networkmanager",
  // Databases & storage
  "rds", "aurora", "dynamodb", "redshift", "ebs", "s3", "storagelens",
  "elasticache", "opensearch", "docdb", "neptune", "keyspaces", "memorydb", "qldb", "timestream",
  "efs", "fsx", "backup",
  // Storage (migration & hybrid)
  "datasync", "storagegateway",
  // Streaming & messaging
  "kinesis", "kinesisanalytics", "msk", "firehose", "sns", "sqs", "eventbridge", "amazonmq",
  // Security
  "waf", "wafv2", "shield", "kms", "cognito",
  // Security (extended)
  "guardduty", "macie", "inspector", "config", "accessanalyzer", "secretsmanager",
  "acm", "identitycenter", "detective", "verifiedaccess", "securitylake", "cloudtrail", "securityhub",
  // Analytics & ML
  "glue", "athena", "emr", "sagemaker", "bedrock", "bedrockagent",
  // Analytics (extended)
  "lakeformation", "databrew", "appflow",
  // ML / AI services
  "rekognition", "textract", "comprehend", "comprehendmedical", "translate", "transcribe",
  "polly", "forecast", "personalize", "lex", "lookoutmetrics", "qbusiness",
  // Developer & CI/CD
  "codebuild", "codepipeline", "codedeploy", "amplify",
  // Developer tools (extended)
  "codecommit", "codeartifact", "codeguru",
  // Management & observability
  "cloudwatch", "stepfunctions", "appsync", "health", "billing",
  // Management (extended)
  "cloudformation", "ssm", "trustedadvisor", "controltower", "organizations",
  "servicecatalog", "servicequotas", "computeoptimizer", "budgets", "dms",
  "resiliencehub", "ram", "migrationhub", "devopsguru",
  // IoT
  "iotcore",
  // IoT (extended)
  "greengrass", "iotanalytics", "iotevents", "iotsitewise", "iotdefender",
  // End-user & media
  "workspaces", "connect", "gamelift", "transferfamily",
  // End-user & media (extended)
  "appstream", "pinpoint", "lightsail", "frauddetector", "locationservice",
  "mediaconvert", "medialive", "managedblockchain",
  // Additional CloudWatch-capable
  "route53", "autoscaling", "quicksight", "imagebuilder", "xray", "ses",
]);

// Dataset for metrics mode when it differs from logs. Omitted = use ELASTIC_DATASET_MAP.
const ELASTIC_METRICS_DATASET_MAP = {
  lambda:          "aws.lambda",
  apigateway:      "aws.apigateway_metrics",
  ecs:             "aws.ecs_metrics",
  fargate:         "aws.ecs_metrics",
  msk:             "aws.kafka_metrics",
  emr:             "aws.emr_metrics",
  s3:              "aws.s3_daily_storage",
  cloudwatch:      "aws.cloudwatch_metrics",
  alb:             "aws.elb",
  nlb:             "aws.elb",
  networkfirewall: "aws.firewall",
  billing:         "aws.billing",
  sagemaker:       "aws.sagemaker",
  bedrock:         "aws.bedrock",
  bedrockagent:    "aws.bedrockagent",
  storagelens:     "aws.s3_storage_lens",
  vpc:             "aws.vpcflow",
  route53:         "aws.route53_public_logs",
  // Security services
  guardduty:       "aws.guardduty",
  cloudtrail:      "aws.cloudtrail",
  ssm:             "aws.ssm",
  cloudformation:  "aws.cloudformation",
  // Developer tools
  codecommit:      "aws.codecommit",
  codedeploy:      "aws.codedeploy",
  // ML / AI services
  rekognition:     "aws.rekognition",
  // IoT
  iotcore:         "aws.iot",
};

export { ELASTIC_DATASET_MAP, METRICS_SUPPORTED_SERVICE_IDS, ELASTIC_METRICS_DATASET_MAP };
