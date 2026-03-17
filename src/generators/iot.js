import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, makeSetup, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateIotCoreLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const device = rand(["sensor-001","gateway-prod-1","thermostat-floor-3","camera-entrance","robot-arm-7"]);
  const action = rand(["CONNECT","DISCONNECT","PUBLISH","SUBSCRIBE","RECEIVE","REJECT"]);
  const topic = rand(["dt/factory/sensors/temperature","dt/home/thermostat/status","cmd/device/update","telemetry/metrics"]);
  const plainMessage = isErr ? `IoT Core ${action} FAILED for ${device}: ${rand(["Unauthorized","Certificate revoked","Rate limited"])}` : `IoT Core ${action}: ${device} on ${topic}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify({ clientId: device, action, topic, message: plainMessage, timestamp: new Date(ts).toISOString() }) : plainMessage;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotcore"}},
    "aws":{iotcore:{client_id:device,thing_name:device,
      thing_group:rand(["factory-sensors","home-devices","fleet","building-management"]),
      action,topic,protocol:rand(["MQTT","MQTT_WS","HTTP","LoRaWAN"]),
      qos:rand([0,1]),message_bytes:randInt(20,65536),
      policy_name:rand(["IoTDevicePolicy","FleetPolicy","SensorPolicy"]),
      structured_logging:useStructuredLogging,
      error_code:isErr?rand(["UnauthorizedException","ThrottlingException","DeviceDisconnected"]):null,
      rules_evaluated:randInt(0,5)}},
    "source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"network",dataset:"aws.iot",provider:"iot.amazonaws.com",duration:randInt(1,isErr?5000:200)*1e6},
    "message":message,
    "log":{level:isErr?"error":"info"},
    ...(isErr?{error:{code:rand(["UnauthorizedException","ThrottlingException","DeviceDisconnected"]),message:"IoT Core operation failed",type:"iot"}}:{})};
}

function generateIotGreengrassLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const group = rand(["factory-edge","home-hub","retail-kiosk","vehicle-edge"]);
  const component = rand(["com.example.temperature-monitor","com.aws.greengrass.Nucleus","com.example.inference","com.aws.greengrass.StreamManager"]);
  const MSGS = {
    error:["Component failed to start: missing dependency","Deployment rollback initiated","Kernel connection lost","OOM: component process killed"],
    warn:["Component health check failed, retrying","Certificate expiring in 7 days","Disk space below 10%"],
    info:["Component started successfully","Deployment completed","Health check passed","Nucleus updated to 2.12.0"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"greengrass"}},
    "aws":{greengrass:{core_device_name:group,component_name:component,
      component_version:`${randInt(1,3)}.${randInt(0,10)}.${randInt(0,10)}`,
      nucleus_version:"2.12.0",platform:rand(["linux/amd64","linux/arm64","linux/armv7l"]),
      deployment_id:randId(36).toLowerCase(),
      status:isErr?"FAILED":"COMPLETED"}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.greengrass",provider:"greengrass.amazonaws.com",duration:randInt(5,isErr?600:120)*1e9},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(level==="error"?{error:{code:"GreengrassError",message:rand(MSGS.error),type:"iot"}}:{})};
}

function generateIotAnalyticsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["temperature-channel","gps-channel","metrics-channel","alerts-channel"]);
  const pipeline = rand(["enrichment-pipeline","filter-pipeline","math-pipeline","device-registry-enrich"]);
  const msgs = randInt(100, isErr?0:100000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotanalytics"}},
    "aws":{iotanalytics:{channel_name:channel,pipeline_name:pipeline,
      dataset_name:rand(["daily-aggregates","anomaly-detection-output","fleet-summary"]),
      messages_processed:msgs,bytes_processed:msgs*randInt(50,500),
      activity_name:rand(["lambda-enrich","filter","math","selectAttributes"]),
      pipeline_status:isErr?"REPROCESSING_FAILED":"SUCCEEDED",
      error_message:isErr?rand(["Pipeline activity failed","Lambda timeout","Query error"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.iotanalytics",provider:"iotanalytics.amazonaws.com",duration:randInt(500,isErr?120000:30000)*1e6},
    "message":isErr?`IoT Analytics FAILED in ${pipeline}: ${rand(["Activity error","Lambda timeout"])}`:
      `IoT Analytics: ${msgs.toLocaleString()} messages via ${pipeline}`,
    "log":{level:isErr?"error":"info"},
    ...(isErr?{error:{code:"PipelineError",message:"IoT Analytics pipeline failed",type:"iot"}}:{})};
}

function generateIotDefenderLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const thingName = rand(["sensor-001","gateway-prod","controller-a4","camera-lobby","valve-plant-2"]);
  const auditFinding = rand(["DEVICE_CERTIFICATE_EXPIRING","REVOKED_CA_CERTIFICATE","IOT_POLICY_OVERLY_PERMISSIVE","UNAUTHENTICATED_COGNITO_ROLE_OVERLY_PERMISSIVE","AUTHENTICATION_FAILURES","LOGGING_DISABLED"]);
  const severity = rand(["CRITICAL","HIGH","MEDIUM","LOW"]);
  const violationType = rand(["large-msg-size","blanket-request","authorization-failure","device-cert-expiring","cell-data-transfer"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotdefender"}},"aws":{iotdefender:{thing_name:thingName,audit_check_name:auditFinding,finding_id:randId(36).toLowerCase(),severity,violation_id:randId(36).toLowerCase(),violation_type:violationType,security_profile_name:rand(["baseline-security-profile","factory-floor-profile","critical-devices"]),behavior_name:rand(["authorized-ip-range","msg-size","data-bytes-out"]),current_value:randInt(1,1000),threshold_value:randInt(1,100),consecutive_datapoints_to_alarm:randInt(2,5),error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","InternalFailureException"]):null}},"event":{kind:"alert",outcome:isErr?"failure":"success",category:"intrusion_detection",dataset:"aws.iotdefender",provider:"iot.amazonaws.com",duration:randInt(30,isErr?600:300)*1e9},"message":isErr?`IoT Defender audit ERROR [${thingName}]: ${rand(["Internal failure","Resource not found"])}:`:`IoT Defender ${severity} [${thingName}]: ${auditFinding}`,"log":{level:isErr?"error":["CRITICAL","HIGH"].includes(severity)?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ThrottlingException","InternalFailureException"]),message:"IoT Defender audit error",type:"iot"}}:{}) };
}

function generateIotEventsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const model = rand(["temperature-alert-model","motor-health-detector","pressure-monitor","door-sensor-model","conveyor-fault"]);
  const detector = rand(["unit-01","unit-02","zone-A","zone-B","machine-prod-1"]);
  const event = rand(["StateTransition","AlarmActivated","AlarmAcknowledged","AlarmReset","ActionExecuted","TriggerFired"]);
  const fromState = rand(["Normal","Warning","Alarm","Acknowledged"]);
  const toState = isErr?rand(["Error","Alarm"]):rand(["Normal","Warning","Alarm"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotevents"}},"aws":{iotevents:{detector_model_name:model,detector_id:detector,key_value:detector,event_name:event,from_state:fromState,to_state:toState,input_name:rand(["SensorInput","CommandInput","HealthCheck"]),action_type:rand(["SetVariable","SetTimer","SNS","Lambda","SQS"]),timer_name:rand([null,"idleTimer","alarmTimer"]),condition_expression:rand([null,"$input.SensorInput.temperature > 85","$input.data.value < threshold"]),error_code:isErr?rand(["ResourceNotFound","ThrottlingException","InvalidRequestException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.iotevents",provider:"iotevents.amazonaws.com",duration:randInt(1,isErr?5000:500)*1e6},"message":isErr?`IoT Events ${model}/${detector} ERROR: ${rand(["State machine error","Action failed","Input validation error"])}:`:`IoT Events ${model}/${detector}: ${fromState} → ${toState} [${event}]`,"log":{level:isErr?"error":toState==="Alarm"?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFound","ThrottlingException","InvalidRequestException"]),message:"IoT Events error",type:"iot"}}:{}) };
}

function generateIotSiteWiseLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const asset = rand(["conveyor-belt-1","hvac-unit-prod","pump-station-2","solar-array-roof","turbine-gen-3"]);
  const property = rand(["Temperature","Pressure","RPM","PowerOutput","FlowRate","Vibration","OEE","MTBF"]);
  const quality = isErr?rand(["BAD","UNCERTAIN"]):rand(["GOOD","GOOD","GOOD"]);
  const value = parseFloat(randFloat(isErr?-999:0, isErr?9999:500));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"iotsitewise"}},"aws":{iotsitewise:{asset_id:`${randId(36).toLowerCase()}`,asset_name:asset,asset_model_id:randId(36).toLowerCase(),property_alias:`/company/plant/${asset}/${property.toLowerCase()}`,property_name:property,data_type:rand(["DOUBLE","INTEGER","BOOLEAN","STRING"]),value,quality,timestamp_offset_ms:randInt(0,1000),gateway_id:rand([`gateway-${randId(8).toLowerCase()}`,null]),portal_id:randId(36).toLowerCase(),error:isErr?rand(["BatchPutAssetPropertyValue failed","Property not found","Quota exceeded"]):null}},"event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.iotsitewise",provider:"iotsitewise.amazonaws.com",duration:randInt(1,isErr?2000:200)*1e6},"message":isErr?`IoT SiteWise ${asset}/${property} BAD quality: ${rand(["Sensor offline","Out of range","Connection lost"])}:`:`IoT SiteWise ${asset}/${property}: ${value} [${quality}]`,"log":{level:isErr?"error":quality==="UNCERTAIN"?"warn":"info"},...(isErr?{error:{code:"SiteWiseError",message:"IoT SiteWise quality/error",type:"iot"}}:{}) };
}

export { generateIotCoreLog, generateIotGreengrassLog, generateIotAnalyticsLog, generateIotDefenderLog, generateIotEventsLog, generateIotSiteWiseLog };
