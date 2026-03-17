import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

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

export { generateDynamoDbLog, generateElastiCacheLog, generateRedshiftLog, generateOpenSearchLog, generateDocumentDbLog, generateAuroraLog, generateNeptuneLog, generateTimestreamLog, generateQldbLog, generateKeyspacesLog, generateMemoryDbLog, generateRdsLog };
