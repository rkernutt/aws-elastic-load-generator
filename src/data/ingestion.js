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
  natgateway:      "cloudwatch",
};

const INGESTION_META = {
  s3:         { label:"S3",         color:"#FF9900", inputType:"aws-s3" },
  cloudwatch: { label:"CloudWatch", color:"#1BA9F5", inputType:"aws-cloudwatch" },
  firehose:   { label:"Firehose",   color:"#F04E98", inputType:"aws-firehose" },
  api:        { label:"API",        color:"#00BFB3", inputType:"http_endpoint" },
  otel:       { label:"OTel",       color:"#93C90E", inputType:"opentelemetry" },
  agent:      { label:"Agent",      color:"#8144CC", inputType:"logfile" },
};

export { SERVICE_INGESTION_DEFAULTS, INGESTION_META };
