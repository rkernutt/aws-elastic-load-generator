import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

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

function generateKinesisAnalyticsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["clickstream-analytics","fraud-detection-stream","real-time-metrics","session-aggregator","anomaly-detector"]);
  const rps = randInt(100, isErr?50000:10000);
  const lagMs = randInt(0, isErr?60000:1000);
  const kinesisAnalyticsMsgs = isErr ? ["Application run failed","Checkpoint failed",`Kinesis Analytics ${app} error: ${rand(["CheckpointFailure","KPU_LIMIT_EXCEEDED","OOM"])}`] : ["Application run started","Checkpoint completed",`Kinesis Analytics ${app}: ${rps} rec/s, lag ${randInt(0,500)}ms`];
  const plainMessage = rand(kinesisAnalyticsMsgs);
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

function generateSnsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const topic = rand(["order-notifications","user-alerts","system-events","security-alarms","deployment-events"]);
  const protocol = rand(["email","sqs","lambda","http","sms"]);
  const published = randInt(1, 10000);
  const delivered = isErr ? randInt(0, Math.max(0, published - 100)) : published;
  const failed = published - delivered;
  const deliveryLatencyMs = parseFloat(randFloat(5, isErr ? 30000 : 500));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"sns"}},
    "aws":{sns:{topic_arn:`arn:aws:sns:${region}:${acct.id}:${topic}`,
      message_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      protocol,delivery_status:isErr?rand(["FAILED","THROTTLED"]):"SUCCESS",
      message_size_bytes:randInt(100,256000),delivery_attempt:isErr?randInt(1,3):1,
      status_code:isErr?rand([400,500,429]):200,
      error_message:isErr?rand(["Endpoint disabled","HTTP timeout","Lambda error","SQS full"]):null,
      metrics:{
        NumberOfMessagesPublished: { sum: published },
        NumberOfNotificationsDelivered: { sum: delivered },
        NumberOfNotificationsFailed: { sum: failed },
        PublishSize: { avg: randInt(200, 64000) },
        SmsSuccessRate: { avg: protocol==="sms" ? parseFloat(randFloat(0.85, 1)) : null },
      }}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.sns",provider:"sns.amazonaws.com",duration:deliveryLatencyMs*1e6},
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
  const messagesIn = randInt(0, 10000);
  const messagesOut = randInt(0, 10000);
  const queueDepth = isErr ? randInt(50000, 500000) : randInt(0, 5000);
  const brokerMemPct = isErr ? randInt(80, 100) : randInt(20, 70);
  const durSec = parseFloat(randFloat(0.01, isErr ? 30 : 2));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"amazonmq"}},
    "aws":{amazonmq:{broker_id:`b-${randId(8)}-${randId(4)}`.toLowerCase(),
      broker_name:broker,broker_engine:brokerType,
      engine_version:brokerType==="ActiveMQ"?"5.17.6":"3.12.1",
      deployment_mode:rand(["SINGLE_INSTANCE","ACTIVE_STANDBY_MULTI_AZ"]),
      queue_name:queue,messages_in:messagesIn,messages_out:messagesOut,
      queue_depth:queueDepth,
      broker_memory_percent:brokerMemPct,
      metrics:{
        QueueDepth: { avg: queueDepth },
        ProducerCount: { avg: randInt(1, 50) },
        ConsumerCount: { avg: randInt(1, 30) },
        MessageCount: { sum: messagesIn + messagesOut },
        BrokerMemoryUsage: { avg: brokerMemPct },
        StorePercentUsage: { avg: isErr ? randInt(75, 98) : randInt(10, 60) },
      }}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.amazonmq",provider:"mq.amazonaws.com",duration:durSec*1e9},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(isErr ? { error: { code: "BrokerError", message: rand(MSGS.error), type: "messaging" } } : {})};
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
  const stepMsgPool = isErr ? ["Execution failed",`Step Functions ${machine} FAILED at state ${state}: ${rand(["Lambda error","Timeout","States.TaskFailed"])}`] : ["Execution started","Execution succeeded",`Step Functions ${machine} SUCCEEDED in ${dur.toFixed(1)}s`];
  const plainMessage = rand(stepMsgPool);
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

export { generateKinesisStreamsLog, generateFirehoseLog, generateKinesisAnalyticsLog, generateMskLog, generateSqsLog, generateSnsLog, generateAmazonMqLog, generateEventBridgeLog, generateStepFunctionsLog };
