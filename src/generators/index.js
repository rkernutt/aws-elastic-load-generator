/**
 * Central registry of all AWS service log generators.
 * Each key is a service id (e.g. "lambda", "s3"); each value is a function (ts, er) => doc.
 * Used by the UI and by scripts/export-samples.mjs.
 * @module generators/index
 */

import { generateLambdaLog, generateApiGatewayLog, generateAppSyncLog, generateAppRunnerLog, generateFargateLog } from "./serverless.js";
import { generateEc2Log, generateEcsLog, generateEksLog, generateBatchLog, generateBeanstalkLog, generateEcrLog, generateAutoScalingLog, generateImageBuilderLog } from "./compute.js";
import { generateAlbLog, generateNlbLog, generateCloudFrontLog, generateWafLog, generateWafv2Log, generateRoute53Log, generateNetworkFirewallLog, generateShieldLog, generateGlobalAcceleratorLog, generateTransitGatewayLog, generateDirectConnectLog, generateVpnLog, generatePrivateLinkLog, generateNetworkManagerLog, generateNatGatewayLog, generateVpcFlowLog } from "./networking.js";
import { generateGuardDutyLog, generateSecurityHubLog, generateMacieLog, generateInspectorLog, generateConfigLog, generateAccessAnalyzerLog, generateCognitoLog, generateKmsLog, generateSecretsManagerLog, generateAcmLog, generateIamIdentityCenterLog, generateDetectiveLog, generateCloudTrailLog, generateVerifiedAccessLog, generateSecurityLakeLog } from "./security.js";
import { generateS3Log, generateS3StorageLensLog, generateEbsLog, generateEfsLog, generateFsxLog, generateDataSyncLog, generateBackupLog, generateStorageGatewayLog } from "./storage.js";
import { generateDynamoDbLog, generateElastiCacheLog, generateRedshiftLog, generateOpenSearchLog, generateDocumentDbLog, generateAuroraLog, generateNeptuneLog, generateTimestreamLog, generateQldbLog, generateKeyspacesLog, generateMemoryDbLog, generateRdsLog } from "./databases.js";
import { generateKinesisStreamsLog, generateFirehoseLog, generateKinesisAnalyticsLog, generateMskLog, generateSqsLog, generateSnsLog, generateAmazonMqLog, generateEventBridgeLog, generateStepFunctionsLog } from "./streaming.js";
import { generateCodeBuildLog, generateCodePipelineLog, generateCodeDeployLog, generateCodeCommitLog, generateCodeArtifactLog, generateAmplifyLog, generateXRayLog, generateCodeGuruLog } from "./devtools.js";
import { generateEmrLog, generateGlueLog, generateAthenaLog, generateLakeFormationLog, generateQuickSightLog, generateDataBrewLog, generateAppFlowLog } from "./analytics.js";
import { generateSageMakerLog, generateBedrockLog, generateBedrockAgentLog, generateRekognitionLog, generateTextractLog, generateComprehendLog, generateComprehendMedicalLog, generateTranslateLog, generateTranscribeLog, generatePollyLog, generateForecastLog, generatePersonalizeLog, generateLexLog, generateLookoutMetricsLog, generateQBusinessLog } from "./ml.js";
import { generateIotCoreLog, generateIotGreengrassLog, generateIotAnalyticsLog, generateIotDefenderLog, generateIotEventsLog, generateIotSiteWiseLog } from "./iot.js";
import { generateCloudFormationLog, generateSsmLog, generateCloudWatchAlarmsLog, generateHealthLog, generateTrustedAdvisorLog, generateControlTowerLog, generateOrganizationsLog, generateServiceCatalogLog, generateServiceQuotasLog, generateComputeOptimizerLog, generateBudgetsLog, generateBillingLog, generateDmsLog } from "./management.js";
import { generateWorkSpacesLog, generateConnectLog, generateAppStreamLog, generateGameLiftLog, generateSesLog, generatePinpointLog, generateTransferFamilyLog, generateLightsailLog, generateFraudDetectorLog, generateLocationServiceLog, generateMediaConvertLog, generateMediaLiveLog, generateManagedBlockchainLog, generateResilienceHubLog, generateRamLog, generateMigrationHubLog, generateDevOpsGuruLog } from "./enduser.js";

const GENERATORS = {
  // Group 1 — Serverless & Core
  lambda: generateLambdaLog,
  apigateway: generateApiGatewayLog,
  vpc: generateVpcFlowLog,
  cloudtrail: generateCloudTrailLog,
  rds: generateRdsLog,
  ecs: generateEcsLog,
  // Group 2 — Compute & Containers
  ec2: generateEc2Log,
  eks: generateEksLog,
  apprunner: generateAppRunnerLog,
  batch: generateBatchLog,
  elasticbeanstalk: generateBeanstalkLog,
  ecr: generateEcrLog,
  fargate: generateFargateLog,
  autoscaling: generateAutoScalingLog,
  imagebuilder: generateImageBuilderLog,
  // Group 3 — Networking & CDN
  alb: generateAlbLog,
  cloudfront: generateCloudFrontLog,
  waf: generateWafLog,
  route53: generateRoute53Log,
  networkfirewall: generateNetworkFirewallLog,
  shield: generateShieldLog,
  nlb: generateNlbLog,
  globalaccelerator: generateGlobalAcceleratorLog,
  transitgateway: generateTransitGatewayLog,
  directconnect: generateDirectConnectLog,
  vpn: generateVpnLog,
  privatelink: generatePrivateLinkLog,
  networkmanager: generateNetworkManagerLog,
  natgateway: generateNatGatewayLog,
  // Group 4 — Security & Compliance
  guardduty: generateGuardDutyLog,
  securityhub: generateSecurityHubLog,
  macie: generateMacieLog,
  inspector: generateInspectorLog,
  config: generateConfigLog,
  accessanalyzer: generateAccessAnalyzerLog,
  cognito: generateCognitoLog,
  kms: generateKmsLog,
  secretsmanager: generateSecretsManagerLog,
  acm: generateAcmLog,
  identitycenter: generateIamIdentityCenterLog,
  detective: generateDetectiveLog,
  verifiedaccess: generateVerifiedAccessLog,
  securitylake: generateSecurityLakeLog,
  // Group 5 — Storage
  s3: generateS3Log,
  storagelens: generateS3StorageLensLog,
  ebs: generateEbsLog,
  efs: generateEfsLog,
  fsx: generateFsxLog,
  datasync: generateDataSyncLog,
  backup: generateBackupLog,
  storagegateway: generateStorageGatewayLog,
  // Group 5 — Databases
  dynamodb: generateDynamoDbLog,
  elasticache: generateElastiCacheLog,
  redshift: generateRedshiftLog,
  opensearch: generateOpenSearchLog,
  docdb: generateDocumentDbLog,
  aurora: generateAuroraLog,
  neptune: generateNeptuneLog,
  timestream: generateTimestreamLog,
  qldb: generateQldbLog,
  keyspaces: generateKeyspacesLog,
  memorydb: generateMemoryDbLog,
  // Group 6 — Streaming & Messaging
  kinesis: generateKinesisStreamsLog,
  firehose: generateFirehoseLog,
  msk: generateMskLog,
  sqs: generateSqsLog,
  eventbridge: generateEventBridgeLog,
  stepfunctions: generateStepFunctionsLog,
  sns: generateSnsLog,
  amazonmq: generateAmazonMqLog,
  appsync: generateAppSyncLog,
  kinesisanalytics: generateKinesisAnalyticsLog,
  // Group 7 — Developer & CI/CD
  codebuild: generateCodeBuildLog,
  codepipeline: generateCodePipelineLog,
  codedeploy: generateCodeDeployLog,
  xray: generateXRayLog,
  codecommit: generateCodeCommitLog,
  codeartifact: generateCodeArtifactLog,
  amplify: generateAmplifyLog,
  codeguru: generateCodeGuruLog,
  // Group 8 — Analytics
  emr: generateEmrLog,
  glue: generateGlueLog,
  athena: generateAthenaLog,
  lakeformation: generateLakeFormationLog,
  quicksight: generateQuickSightLog,
  databrew: generateDataBrewLog,
  appflow: generateAppFlowLog,
  // Group 9 — AI & ML
  sagemaker: generateSageMakerLog,
  bedrock: generateBedrockLog,
  bedrockagent: generateBedrockAgentLog,
  rekognition: generateRekognitionLog,
  textract: generateTextractLog,
  comprehend: generateComprehendLog,
  translate: generateTranslateLog,
  transcribe: generateTranscribeLog,
  polly: generatePollyLog,
  forecast: generateForecastLog,
  personalize: generatePersonalizeLog,
  lex: generateLexLog,
  qbusiness: generateQBusinessLog,
  // Group 10 — IoT
  iotcore: generateIotCoreLog,
  greengrass: generateIotGreengrassLog,
  iotanalytics: generateIotAnalyticsLog,
  // Group 11 — Management & Governance
  cloudformation: generateCloudFormationLog,
  ssm: generateSsmLog,
  cloudwatch: generateCloudWatchAlarmsLog,
  health: generateHealthLog,
  trustedadvisor: generateTrustedAdvisorLog,
  controltower: generateControlTowerLog,
  organizations: generateOrganizationsLog,
  dms: generateDmsLog,
  servicequotas: generateServiceQuotasLog,
  computeoptimizer: generateComputeOptimizerLog,
  ram: generateRamLog,
  resiliencehub: generateResilienceHubLog,
  migrationhub: generateMigrationHubLog,
  servicecatalog: generateServiceCatalogLog,
  budgets: generateBudgetsLog,
  billing: generateBillingLog,
  // Group 12 — Media & End User Computing
  mediaconvert: generateMediaConvertLog,
  medialive: generateMediaLiveLog,
  workspaces: generateWorkSpacesLog,
  connect: generateConnectLog,
  appstream: generateAppStreamLog,
  // Group 13 — Messaging & Communications
  ses: generateSesLog,
  pinpoint: generatePinpointLog,
  // Group 14 — Additional Services
  transferfamily: generateTransferFamilyLog,
  lightsail: generateLightsailLog,
  frauddetector: generateFraudDetectorLog,
  lookoutmetrics: generateLookoutMetricsLog,
  comprehendmedical: generateComprehendMedicalLog,
  gamelift: generateGameLiftLog,
  locationservice: generateLocationServiceLog,
  managedblockchain: generateManagedBlockchainLog,
  devopsguru: generateDevOpsGuruLog,
  iotevents: generateIotEventsLog,
  iotsitewise: generateIotSiteWiseLog,
  iotdefender: generateIotDefenderLog,
  wafv2: generateWafv2Log,
};

/**
 * Map of service id → generator function.
 * @type {Record<string, (ts: string, er: number) => Object>}
 */
export { GENERATORS };
