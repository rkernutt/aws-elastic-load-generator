/**
 * Registry of trace generators.
 * Each generator returns an array of APM documents (transaction + child spans).
 */

import { generateLambdaTrace }        from "./lambda.js";
import { generateEmrTrace }           from "./emr.js";
import {
  generateEcommerceOrderTrace,
  generateMlInferenceTrace,
  generateDataIngestionTrace,
  generateStepFunctionsWorkflowTrace,
  generateCascadingFailureTrace,
} from "./workflow.js";
import { generateApiGatewayTrace }    from "./apigateway.js";
import { generateS3Trace }            from "./s3.js";
import { generateGlueTrace }          from "./glue.js";
import { generateEventBridgeTrace }   from "./eventbridge.js";
import { generateSageMakerTrace }     from "./sagemaker.js";
import { generateEcsTrace }           from "./ecs.js";
import { generateStepFunctionsTrace } from "./stepfunctions.js";
import { generateEksTrace }           from "./eks.js";
import { generateSqsTrace }           from "./sqs.js";
import { generateKinesisTrace }       from "./kinesis.js";
import { generateDynamoDbTrace }      from "./dynamodb.js";
import { generateRdsTrace }           from "./rds.js";
import { generateBedrockTrace }       from "./bedrock.js";

/**
 * Map of service id → trace generator function.
 * Signature: (ts: string, er: number) => Object[]
 */
const TRACE_GENERATORS = {
  lambda:        generateLambdaTrace,
  emr:           generateEmrTrace,
  "workflow-ecommerce":     generateEcommerceOrderTrace,
  "workflow-ml":            generateMlInferenceTrace,
  "workflow-ingestion":     generateDataIngestionTrace,
  "workflow-stepfunctions":  generateStepFunctionsWorkflowTrace,
  "workflow-cascading":      generateCascadingFailureTrace,
  apigateway:    generateApiGatewayTrace,
  s3:            generateS3Trace,
  glue:          generateGlueTrace,
  eventbridge:   generateEventBridgeTrace,
  sagemaker:     generateSageMakerTrace,
  ecs:           generateEcsTrace,
  stepfunctions: generateStepFunctionsTrace,
  eks:           generateEksTrace,
  sqs:           generateSqsTrace,
  kinesis:       generateKinesisTrace,
  dynamodb:      generateDynamoDbTrace,
  rds:           generateRdsTrace,
  bedrock:       generateBedrockTrace,
};

/**
 * Metadata for the traces UI: label, description, icon.
 */
const TRACE_SERVICES = [
  {
    id:    "lambda",
    label: "Lambda",
    desc:  "Function invocations — SDK calls via EDOT/ADOT OTel layer",
    icon:  "AWS-Lambda",
  },
  {
    id:    "emr",
    label: "EMR Spark",
    desc:  "Spark job stages — instrumented via EDOT Java agent bootstrap action",
    icon:  "Amazon-EMR",
  },
  {
    id:    "workflow-ecommerce",
    label: "E-commerce Order Flow",
    desc:  "API Gateway → Lambda (order-processor) → DynamoDB + SQS → Lambda (notification) → SES",
    icon:  "AWS-Lambda",
  },
  {
    id:    "workflow-ml",
    label: "ML Inference Pipeline",
    desc:  "API Gateway → Lambda (inference-router) → S3 + Bedrock InvokeModel → DynamoDB (results cache)",
    icon:  "Amazon-Bedrock",
  },
  {
    id:    "workflow-ingestion",
    label: "Data Ingestion Pipeline",
    desc:  "Kinesis → Lambda (stream-processor) → S3 + Glue → EMR Spark ETL job",
    icon:  "Amazon-Kinesis",
  },
  {
    id:    "workflow-stepfunctions",
    label: "Step Functions Orchestration",
    desc:  "EventBridge → Step Functions → Lambda (validate) → DynamoDB → Lambda (payment) → RDS → Lambda (notify) → SES",
    icon:  "AWS-Step-Functions",
  },
  {
    id:    "workflow-cascading",
    label: "Cascading Failure",
    desc:  "API Gateway → Lambda → DynamoDB throttle → DLQ → Lambda recovery — always an error scenario",
    icon:  "AWS-Lambda",
  },
  {
    id:    "apigateway",
    label: "API Gateway",
    desc:  "REST/HTTP/WebSocket API requests — instrumented via Lambda Powertools or ADOT layer",
    icon:  "Amazon-API-Gateway",
  },
  {
    id:    "ecs",
    label: "ECS / Fargate",
    desc:  "Containerised microservices — instrumented via EDOT sidecar or language agent",
    icon:  "Amazon-Elastic-Container-Service",
  },
  {
    id:    "stepfunctions",
    label: "Step Functions",
    desc:  "State machine executions — X-Ray or OTel SDK with Lambda state instrumentation",
    icon:  "AWS-Step-Functions",
  },
  {
    id:    "eks",
    label: "EKS / Kubernetes",
    desc:  "K8s workloads — auto-instrumented via EDOT operator or OTel collector DaemonSet",
    icon:  "Amazon-Elastic-Kubernetes-Service",
  },
  {
    id:    "sqs",
    label: "SQS Consumer",
    desc:  "Message queue consumers — traceparent propagated via message attributes",
    icon:  "Amazon-Simple-Queue-Service",
  },
  {
    id:    "kinesis",
    label: "Kinesis Consumer",
    desc:  "Stream shard consumers — spans covering record batches per shard",
    icon:  "Amazon-Kinesis",
  },
  {
    id:    "dynamodb",
    label: "DynamoDB",
    desc:  "Direct DynamoDB service traces — read/write operations on named tables",
    icon:  "Amazon-DynamoDB",
  },
  {
    id:    "rds",
    label: "RDS / Aurora",
    desc:  "PostgreSQL/MySQL queries — instrumented via EDOT or upstream OTel DB spans",
    icon:  "Amazon-RDS",
  },
  {
    id:    "bedrock",
    label: "Amazon Bedrock",
    desc:  "GenAI invocations — token usage, RAG retrieval, and guardrail spans",
    icon:  "Amazon-Bedrock",
  },
  {
    id:    "s3",
    label: "S3",
    desc:  "Direct S3 operation traces — GetObject, PutObject, CopyObject with latency spans",
    icon:  "Amazon-Simple-Storage-Service",
  },
  {
    id:    "glue",
    label: "AWS Glue",
    desc:  "ETL job execution phases — extract, transform, load spans via EDOT Java agent",
    icon:  "AWS-Glue",
  },
  {
    id:    "eventbridge",
    label: "EventBridge",
    desc:  "Rule evaluation and target invocation spans — Lambda, SQS, SNS fan-out",
    icon:  "Amazon-EventBridge",
  },
  {
    id:    "sagemaker",
    label: "SageMaker Inference",
    desc:  "Real-time endpoint invocations — InvokeEndpoint spans with optional S3 pre-fetch and DynamoDB caching",
    icon:  "Amazon-SageMaker",
  },
];

export { TRACE_GENERATORS, TRACE_SERVICES };
