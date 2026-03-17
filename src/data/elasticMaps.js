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
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES WITH METRICS IN ELASTIC AWS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const METRICS_SUPPORTED_SERVICE_IDS = new Set([
  // Core compute & serverless
  "lambda", "ec2", "ecs", "fargate", "eks", "apprunner", "elasticbeanstalk", "batch",
  // Networking & CDN
  "alb", "nlb", "cloudfront", "natgateway", "transitgateway", "vpn", "networkfirewall",
  "globalaccelerator", "directconnect", "vpc",
  // Databases & storage
  "rds", "aurora", "dynamodb", "redshift", "ebs", "s3", "storagelens",
  "elasticache", "opensearch", "docdb", "neptune", "keyspaces", "memorydb", "qldb", "timestream",
  "efs", "fsx", "backup",
  // Streaming & messaging
  "kinesis", "kinesisanalytics", "msk", "firehose", "sns", "sqs", "eventbridge", "amazonmq",
  // Security
  "waf", "wafv2", "shield", "kms", "cognito",
  // Analytics & ML
  "glue", "athena", "emr", "sagemaker", "bedrock", "bedrockagent",
  // Developer & CI/CD
  "codebuild", "codepipeline", "codedeploy", "amplify",
  // Management & observability
  "cloudwatch", "stepfunctions", "appsync", "health", "billing",
  // IoT
  "iotcore",
  // End-user & media
  "workspaces", "connect", "gamelift", "transferfamily",
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
};

export { ELASTIC_DATASET_MAP, METRICS_SUPPORTED_SERVICE_IDS, ELASTIC_METRICS_DATASET_MAP };
