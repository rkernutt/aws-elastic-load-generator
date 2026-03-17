import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateWorkSpacesLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const user = rand(["alice","bob","carol","david","eva"]);
  const wsId = `ws-${randId(10).toLowerCase()}`;
  const action = rand(["Connect","Disconnect","StartWorkspace","StopWorkspace","RebuildWorkspace"]);
  const state = isErr ? rand(["ERROR","UNHEALTHY","STOPPED"]) : rand(["AVAILABLE","AVAILABLE","CONNECTED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"workspaces"}},
    "aws":{workspaces:{workspace_id:wsId,user_name:user,
      bundle_type:rand(["Performance","Standard","Power","Graphics"]),
      workspace_state:state,action,
      compute_type:rand(["VALUE","STANDARD","PERFORMANCE","POWER"]),
      running_mode:rand(["AUTO_STOP","ALWAYS_ON"]),
      client_ip:randIp(),client_os:rand(["Windows 11","macOS 14","Ubuntu 22.04"]),
      error_code:isErr?rand(["InvalidUser","OperationNotSupportedException"]):null}},
    "user":{name:user},"source":{ip:randIp()},
    "event":{action,outcome:isErr?"failure":"success",category:"session",dataset:"aws.workspaces",provider:"workspaces.amazonaws.com"},
    "message":isErr?`WorkSpaces ${action} FAILED for ${user} (${wsId})`:
      `WorkSpaces ${action}: ${user} on ${wsId} [${state}]`,
    ...(isErr?{error:{code:"WorkSpacesError",message:"WorkSpaces operation failed",type:"session"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateConnectLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const action = rand(["INBOUND_CALL","OUTBOUND_CALL","CHAT","TASK","TRANSFER","DISCONNECT"]);
  const queue = rand(["BasicQueue","TechSupport","Billing","Sales","Priority-Enterprise"]);
  const agent = rand(["agent-alice","agent-bob","agent-carol",null]);
  const dur = randInt(10, 1800);
  const sentiment = rand(["POSITIVE","NEUTRAL","NEGATIVE","MIXED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"connect"}},
    "aws":{connect:{instance_id:randId(36).toLowerCase(),
      contact_id:`${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
      channel:rand(["VOICE","CHAT","TASK"]),initiation_method:action,
      queue_name:queue,agent_id:agent,
      duration_seconds:dur,
      hold_duration_seconds:randInt(0,120),
      queue_wait_time_seconds:randInt(0,300),
      disconnect_reason:rand(["CUSTOMER_DISCONNECT","AGENT_DISCONNECT","EXPIRED"]),
      sentiment_overall:sentiment,
      contact_lens_enabled:Math.random()>0.5,
      lex_bot_interacted:Math.random()>0.5,
      error_code:isErr?rand(["ContactNotFoundException","QueueCapacityExceeded"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"session",dataset:"aws.connect",provider:"connect.amazonaws.com"},
    "message":isErr?`Connect ${action} FAILED: ${rand(["Queue capacity exceeded","Flow error","Agent unavailable"])}`:
      `Connect ${action}: ${queue}${agent?` agent=${agent}`:""}, ${dur}s, ${sentiment}`,
    ...(isErr?{error:{code:"ConnectError",message:"Connect operation failed",type:"session"}}:{}),
    "log":{level:isErr?"error":dur>600?"warn":"info"}};
}

function generateAppStreamLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const stack = rand(["dev-tools-stack","design-apps","data-analytics","browser-isolation","secure-access"]);
  const fleet = rand(["on-demand-fleet","always-on-fleet","elastic-fleet"]);
  const user = `user_${randId(8).toLowerCase()}@company.com`;
  const event = rand(["SESSION_STARTED","SESSION_ENDED","APPLICATION_LAUNCHED","FILE_DOWNLOAD","FILE_UPLOAD","CLIPBOARD_COPY","CAPACITY_CHANGED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"appstream"}},"aws":{appstream:{stack_name:stack,fleet_name:fleet,user_id:user,session_id:randId(36).toLowerCase(),event_type:event,application_name:event.includes("APP")?rand(["Notepad++","MATLAB","AutoCAD","Chrome","VS Code","Tableau"]):null,instance_type:rand(["stream.standard.medium","stream.compute.large","stream.memory.xlarge"]),session_duration_minutes:event.includes("ENDED")?randInt(1,480):null,storage_connector:rand([null,"HomeFolder","OneDrive","GoogleDrive"]),idle_disconnect_timeout_minutes:rand([15,30,60]),max_user_duration_hours:rand([2,4,8,12]),error_code:isErr?rand(["FLEET_CAPACITY_EXCEEDED","IAM_SERVICE_ROLE_ERROR","USER_NOT_AUTHORIZED"]):null}},"user":{name:user},"event":{outcome:isErr?"failure":"success",category:"session",dataset:"aws.appstream",provider:"appstream2.amazonaws.com"},"message":isErr?`AppStream ${stack} ${event} FAILED: ${rand(["Fleet at capacity","IAM role error","User not authorized"])}:`:`AppStream ${event}: ${user} [${stack}]`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["FLEET_CAPACITY_EXCEEDED","IAM_SERVICE_ROLE_ERROR","USER_NOT_AUTHORIZED"]),message:"AppStream operation failed",type:"session"}}:{}) };
}

function generateGameLiftLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const fleet = rand(["game-fleet-prod","matchmaking-fleet","us-east-realtime","eu-west-battle"]);
  const event = rand(["GameSessionCreated","PlayerSessionCreated","PlayerSessionTerminated","FleetCapacityChanged","InstanceStatusChanged","MatchmakingSucceeded","MatchmakingTimedOut"]);
  const gameSessionId = `arn:aws:gamelift:${region}::gamesession/${fleet}/${randId(36).toLowerCase()}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"gamelift"}},"aws":{gamelift:{fleet_id:`fleet-${randId(8).toLowerCase()}`,fleet_name:fleet,event_type:event,game_session_id:gameSessionId,player_session_id:event.includes("Player")?`psess-${randId(36).toLowerCase()}`:null,current_player_sessions:randInt(0,100),maximum_player_sessions:rand([10,50,100,200]),instance_type:rand(["c5.large","c5.xlarge","c5.2xlarge","m5.large"]),instance_count:randInt(1,50),desired_instances:randInt(1,50),idle_instances:randInt(0,10),matchmaking_configuration:rand(["FastMatch","BalancedMatch","RegionalMatch"]),matchmaking_ticket_id:event.includes("Matchmaking")?randId(36).toLowerCase():null,matchmaking_duration_seconds:event.includes("Matchmaking")?randInt(5,120):null,error_code:isErr?rand(["InvalidFleetStatus","FleetCapacityExceeded","InvalidGameSession"]):null}},"event":{outcome:isErr?"failure":"success",category:"session",dataset:"aws.gamelift",provider:"gamelift.amazonaws.com"},"message":isErr?`GameLift ${fleet} ${event} FAILED: ${rand(["Fleet at capacity","Invalid session","Instance unavailable"])}:`:`GameLift ${fleet}: ${event}`,"log":{level:isErr?"error":event.includes("TimedOut")?"warn":"info"},...(isErr?{error:{code:rand(["InvalidFleetStatus","FleetCapacityExceeded","InvalidGameSession"]),message:"GameLift operation failed",type:"session"}}:{}) };
}

function generateSesLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const event = rand(["Send","Delivery","Bounce","Complaint","Open","Click","Reject","RenderingFailure"]);
  const from = rand(["noreply@company.com","alerts@company.com","no-reply@app.io"]);
  const to = `user_${randId(6).toLowerCase()}@${rand(["gmail.com","yahoo.com","company.org","outlook.com"])}`;
  const msgId = `${randId(20)}.${randId(10)}@${region}.amazonses.com`.toLowerCase();
  const bounceType = event==="Bounce"?rand(["Permanent","Transient"]):null;
  const bounceSubType = bounceType?rand(["General","NoEmail","Suppressed","MailboxFull","MessageTooLarge"]):null;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"ses"}},"aws":{ses:{message_id:msgId,event_type:event,from_address:from,destination:to,configuration_set:rand(["transactional","marketing","alerts",null]),bounce:{bounce_type:bounceType,bounce_sub_type:bounceSubType},complaint:{feedback_type:event==="Complaint"?rand(["abuse","fraud","virus","not-spam"]):null},sending_account_id:`${acct.id}`,delivery:{recipients:[to],timestamp:ts,processing_time_ms:randInt(50,3000),smtp_response:isErr?null:"250 2.0.0 OK"}}},"event":{outcome:isErr||["Bounce","Complaint","Reject"].includes(event)?"failure":"success",category:"email",dataset:"aws.ses",provider:"email.amazonaws.com"},"message":isErr?`SES ${event} FAILED for ${to}: ${rand(["Rendering failure","Account suspended","Rate limit exceeded"])}`:event==="Bounce"?`SES Bounce [${bounceType}/${bounceSubType}]: ${to}`:event==="Complaint"?`SES Complaint from ${to}:`:`SES ${event}: ${from} -> ${to}`,"log":{level:["Bounce","Complaint","Reject"].includes(event)?"warn":isErr?"error":"info"},...(isErr||["Bounce","Complaint","Reject"].includes(event)?{error:{code:"SESDeliveryFailure",message:"SES delivery failed",type:"email"}}:{}) };
}

function generatePinpointLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["EMAIL","SMS","PUSH","IN_APP","VOICE"]);
  const event = rand(["_email.send","_email.delivered","_email.bounced","_sms.sent","_sms.buffered","_push.notification_received","_campaign.send","_journey.send","_custom.purchase"]);
  const campaign = rand(["welcome-series","re-engagement","promo-black-friday","onboarding-flow","churn-prevention"]);
  const user = `user_${randId(10).toLowerCase()}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"pinpoint"}},"aws":{pinpoint:{application_id:randId(32).toLowerCase(),event_type:event,channel,campaign_id:randId(24).toLowerCase(),campaign_name:campaign,journey_id:randId(24).toLowerCase(),segment_id:randId(24).toLowerCase(),endpoint_id:user,message_id:randId(36).toLowerCase(),delivery_status:isErr?"DUPLICATE":rand(["SUCCESSFUL","SUCCESSFUL","PENDING","FAILED"]),status_message:isErr?"Address on suppression list":null,destination:channel==="EMAIL"?`${user}@example.com`:channel==="SMS"?`+1555${randInt(1000000,9999999)}`:user,iso_country_code:rand(["US","GB","DE","FR","AU"])}},"event":{outcome:isErr?"failure":"success",category:"email",dataset:"aws.pinpoint",provider:"mobiletargeting.amazonaws.com"},"message":isErr?`Pinpoint ${channel} FAILED [${campaign}]: ${rand(["Suppression list","Invalid endpoint","Quota exceeded"])}:`:`Pinpoint ${event} [${campaign}]: ${user} via ${channel}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"DeliveryFailure",message:"Pinpoint delivery failed",type:"messaging"}}:{}) };
}

function generateTransferFamilyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const protocol = rand(["SFTP","FTPS","FTP","AS2"]);
  const user = rand(["sftp-partner","data-ingest","backup-user","etl-transfer","vendor-upload"]);
  const file = rand(["/inbound/orders.csv","/uploads/inventory.xml","/reports/daily-sales.xlsx","/backup/db-export.sql.gz","/data/events.json"]);
  const bytes = randInt(1024,5e9);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"transferfamily"}},"aws":{transferfamily:{server_id:`s-${randId(17).toLowerCase()}`,protocol,user_name:user,session_id:randId(32).toLowerCase(),file_path:file,operation:rand(["PUT","GET","DELETE","MKDIR","RENAME"]),bytes_transferred:bytes,transfer_rate_mbps:parseFloat(randFloat(0.1,500)),duration_seconds:parseFloat(randFloat(0.1,300)),s3_bucket:rand(["sftp-inbound","partner-data","transfer-landing"]),as2_message_id:protocol==="AS2"?randId(36).toLowerCase():null,error_code:isErr?rand(["AUTH_FAILURE","PERMISSION_DENIED","CONNECTION_RESET","FILE_NOT_FOUND"]):null}},"source":{ip:randIp()},"event":{outcome:isErr?"failure":"success",category:"file",dataset:"aws.transfer",provider:"transfer.amazonaws.com"},"message":isErr?`Transfer Family ${protocol} FAILED [${user}] ${file}: ${rand(["Auth failure","Permission denied","Connection reset"])}:`:`Transfer Family ${protocol} [${user}] ${file}: ${(bytes/1024/1024).toFixed(1)}MB`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["AUTH_FAILURE","PERMISSION_DENIED","CONNECTION_RESET","FILE_NOT_FOUND"]),message:"Transfer Family operation failed",type:"file"}}:{}) };
}

function generateLightsailLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const instance = rand(["wordpress-prod","dev-server","game-server","portfolio-site","api-prototype"]);
  const event = rand(["INSTANCE_STATE_CHANGE","SNAPSHOT_CREATED","STATIC_IP_ATTACHED","ALERT_TRIGGERED","MONTHLY_TRANSFER_EXCEEDED","SSL_RENEWED"]);
  const state = isErr?"ERROR":rand(["running","stopped","pending"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lightsail"}},"aws":{lightsail:{resource_name:instance,resource_type:rand(["Instance","Database","Bucket","ContainerService","Distribution"]),bundle_id:rand(["nano_2_0","micro_2_0","small_2_0","medium_2_0","large_2_0"]),blueprint:rand(["wordpress","lamp","nodejs","django","ubuntu_22_04","amazon_linux_2"]),state,event_type:event,public_ip:randIp(),snapshot_name:event.includes("SNAPSHOT")?`${instance}-snap-${randInt(1,100)}`:null,monthly_transfer:{used_gb:randInt(0,2000),limit_gb:rand([1024,3072,6144,12288])},alert:{name:event==="ALERT_TRIGGERED"?rand(["CPUUtilization","NetworkOut","StatusCheckFailed"]):null,threshold:event==="ALERT_TRIGGERED"?randInt(80,100):null}}},"event":{outcome:isErr?"failure":"success",category:"host",dataset:"aws.lightsail",provider:"lightsail.amazonaws.com"},"message":isErr?`Lightsail ${instance} ERROR: ${rand(["Instance unreachable","Snapshot failed","SSL renewal error"])}:`:`Lightsail ${instance}: ${event} [${state}]`,"log":{level:isErr?"error":event.includes("EXCEEDED")?"warn":"info"},...(isErr?{error:{code:"LightsailError",message:"Lightsail instance error",type:"host"}}:{}) };
}

function generateFraudDetectorLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const model = rand(["online-fraud-v2","account-takeover","card-fraud-detector","identity-fraud","transaction-risk"]);
  const entity = `entity_${randId(10).toLowerCase()}`;
  const outcome = isErr?rand(["BLOCK","HIGH_RISK"]):rand(["APPROVE","REVIEW","APPROVE"]);
  const score = isErr?randInt(800,999):rand([outcome==="REVIEW"?randInt(400,799):randInt(0,399)]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"frauddetector"}},"aws":{frauddetector:{detector_id:model,detector_version_id:randInt(1,5).toString(),event_id:randId(36).toLowerCase(),event_type:rand(["account_registration","online_purchase","login","wire_transfer","card_transaction"]),entity_type:"customer",entity_id:entity,outcomes:[outcome],risk_score:score,model_scores:{[model]:score},used_rules:rand([["block-high-risk"],["review-medium"],["approve-low"]]),ip_address:randIp(),event_variables:{billing_postal:randInt(10000,99999).toString(),phone_verified:rand(["true","false"])}}},"event":{outcome:outcome==="BLOCK"?"failure":"success",category:"intrusion_detection",dataset:"aws.frauddetector",provider:"frauddetector.amazonaws.com"},"message":isErr?`Fraud Detector BLOCK [${model}]: entity ${entity} score ${score}/1000`:`Fraud Detector ${outcome} [${model}]: entity ${entity} score ${score}/1000`,"log":{level:outcome==="BLOCK"?"warn":outcome==="HIGH_RISK"?"warn":"info"},...(outcome==="BLOCK"?{error:{code:"FraudBlock",message:"Fraud Detector block decision",type:"security"}}:{}) };
}

function generateLocationServiceLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const operation = rand(["SearchPlaceIndex","CalculateRoute","BatchEvaluateGeofences","GetDevicePosition","UpdateDevicePosition","ListGeofences","CreateRouteCalculator"]);
  const tracker = rand(["fleet-tracker","delivery-devices","asset-monitor","field-worker-track"]);
  const deviceId = `device-${randId(8).toLowerCase()}`;
  const lat = parseFloat(randFloat(-90,90)); const lon = parseFloat(randFloat(-180,180));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"location"}},"aws":{locationservice:{operation,tracker_name:operation.includes("Device")?tracker:null,geofence_collection:operation.includes("Geofence")?rand(["delivery-zones","restricted-areas","customer-sites"]):null,place_index:operation.includes("Place")?rand(["here-place-index","esri-place-index"]):null,route_calculator:operation.includes("Route")?rand(["truck-router","walking-calculator"]):null,device_id:operation.includes("Device")?deviceId:null,position:operation.includes("Device")?{lat,lon}:null,query:operation.includes("Search")?rand(["coffee shop","gas station","hospital","airport"]):null,distance_meters:operation.includes("Route")?randInt(100,500000):null,duration_seconds:operation.includes("Route")?randInt(60,18000):null,geofence_ids_entered:operation.includes("Geofences")?randInt(0,3):null,geofence_ids_exited:operation.includes("Geofences")?randInt(0,2):null,error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","ValidationException"]):null}},"event":{outcome:isErr?"failure":"success",category:"geo",dataset:"aws.location",provider:"geo.amazonaws.com"},"message":isErr?`Location Service ${operation} FAILED: ${rand(["Resource not found","Throttled","Invalid coordinates"])}:`:`Location Service ${operation}: ${operation.includes("Device")?deviceId:rand(["place search","route calc","geofence check"])}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ThrottlingException","ValidationException"]),message:"Location Service failed",type:"geo"}}:{}) };
}

function generateMediaConvertLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const jobId = `${randInt(1234567890,9999999999)}-${randId(6).toLowerCase()}`;
  const input = rand(["s3://media-input/raw/interview.mov","s3://media-input/broadcast/live.mxf","s3://uploads/user-video.mp4"]);
  const outputGroup = rand(["HLS","DASH","MP4","CMAF"]);
  const dur = randInt(30, isErr?3600:1800);
  const audioMins = parseFloat(randFloat(0.5,120));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"mediaconvert"}},
    "aws":{mediaconvert:{job_id:jobId,
      queue_arn:`arn:aws:mediaconvert:${region}:${acct.id}:queues/${rand(["Default","premium","batch"])}`,
      job_status:isErr?"ERROR":"COMPLETE",output_group_type:outputGroup,
      input_file:input,input_duration_minutes:audioMins,
      video_codec:rand(["H_264","H_265","AV1","MPEG2"]),audio_codec:rand(["AAC","MP3","AC3"]),
      width:rand([1280,1920,3840]),height:rand([720,1080,2160]),
      bitrate_kbps:rand([1500,3000,5000,8000]),duration_seconds:dur,
      error_message:isErr?rand(["Invalid input file","Unsupported codec","Output permissions denied"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"process",dataset:"aws.mediaconvert",provider:"mediaconvert.amazonaws.com"},
    "message":isErr?`MediaConvert job ${jobId} ERROR: ${rand(["Invalid format","Codec unsupported","S3 write denied"])}`:
      `MediaConvert job ${jobId} COMPLETE: ${audioMins.toFixed(1)} min -> ${outputGroup}`,
    ...(isErr?{error:{code:"JobError",message:"MediaConvert job failed",type:"media"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateMediaLiveLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const channel = rand(["live-news","sports-event-1","concert-stream","corporate-broadcast"]);
  const MSGS = {
    error:["Input loss detected: primary input failed","Encoder error: resolution mismatch","Output error: CDN origin unreachable","Audio track desync detected"],
    warn:["Bitrate below target: 2.1 Mbps vs 5 Mbps","Input redundancy switch triggered","Buffer underflow: 2 frames dropped"],
    info:["Channel started successfully","Input switch to backup completed","Pipeline A running, Pipeline B standby"],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"medialive"}},
    "aws":{medialive:{channel_id:randId(11),channel_name:channel,
      channel_state:isErr?"ERROR":rand(["RUNNING","RUNNING","IDLE"]),
      pipeline:rand(["PIPELINE_0","PIPELINE_1"]),
      input_type:rand(["RTMP_PUSH","RTP_PUSH","UDP_PUSH","MEDIACONNECT"]),
      output_type:rand(["HLS","DASH","RTMP","MEDIAPACKAGE"]),
      video_bitrate_kbps:isErr?randInt(500,2000):randInt(3000,15000),
      input_loss_frames:isErr?randInt(1,1000):0,
      encoder_fps:isErr?randInt(5,24):rand([24,25,29.97,30,60])}},
    "event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.medialive",provider:"medialive.amazonaws.com"},
    "message":rand(MSGS[level]),
    "log":{level},
    ...(level==="error"?{error:{code:"MediaLiveError",message:rand(MSGS.error),type:"media"}}:{})};
}

function generateManagedBlockchainLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const network = rand(["Hyperledger Fabric","Ethereum"]);
  const networkId = `n-${randId(26)}`;
  const event = rand(["ProposalCreated","VoteCompleted","MemberCreated","NodeCreated","TransactionSubmitted","ChaincodeDefined","ChannelCreated"]);
  const txId = randId(64).toLowerCase();
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"managedblockchain"}},"aws":{managedblockchain:{network_id:networkId,network_name:rand(["supply-chain-net","financial-consortium","logistics-network"]),framework:network,framework_version:network==="Hyperledger Fabric"?rand(["2.2","2.4"]):"Ethereum",member_id:`m-${randId(26)}`,member_name:rand(["Company-A","Company-B","Auditor","Bank-1"]),node_id:`nd-${randId(26)}`,event_type:event,transaction_id:event.includes("Transaction")?txId:null,proposal_id:event.includes("Proposal")||event.includes("Vote")?randId(26):null,channel_name:network==="Hyperledger Fabric"?rand(["mychannel","supply-channel","audit-channel"]):null,chaincode_id:event.includes("Chaincode")?rand(["asset-transfer","token-contract","escrow"]):null,status:isErr?"FAILED":"SUCCEEDED",error_code:isErr?rand(["ResourceNotFoundException","ThrottlingException","IllegalActionException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.blockchain",provider:"managedblockchain.amazonaws.com"},"message":isErr?`ManagedBlockchain ${event} FAILED [${network}]: ${rand(["Unauthorized","Proposal rejected","Node unavailable"])}:`:`ManagedBlockchain ${event} [${network}]: ${txId?txId.substring(0,16)+"...":event}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"BlockchainError",message:"Managed Blockchain operation failed",type:"process"}}:{}) };
}

function generateResilienceHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["ecommerce-platform","payment-gateway","data-pipeline","customer-portal","inventory-service"]);
  const action = rand(["RunResiliencyAssessment","PublishRecommendations","ImportResourcesToDraft","DeleteResiliencyPolicy","CreateApp","CreateRecommendationTemplate"]);
  const rto = randInt(60, 3600); const rpo = randInt(60, 3600);
  const resiliencyScore = isErr?randInt(0,50):randInt(60,100);
  const tier = rand(["Critical","Core","Non-Critical","Important"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"resiliencehub"}},"aws":{resiliencehub:{app_arn:`arn:aws:resiliencehub:${region}:${acct.id}:app/${randId(36).toLowerCase()}`,app_name:app,operation:action,resiliency_score:resiliencyScore,compliance_status:isErr?"POLICY_BREACHED":"POLICY_MET",current_rto_seconds:rto,target_rto_seconds:isErr?Math.floor(rto*0.5):rto*2,current_rpo_seconds:rpo,target_rpo_seconds:isErr?Math.floor(rpo*0.5):rpo*2,tier,disruption_type:rand(["AZ","Hardware","Software","Region","all"]),recommendation_count:randInt(0,20),error_code:isErr?rand(["ResourceNotFoundException","ValidationException","ThrottlingException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.resiliencehub",provider:"resiliencehub.amazonaws.com"},"message":isErr?`Resilience Hub ${app} POLICY BREACHED [${tier}]: score=${resiliencyScore}, RTO ${rto}s exceeds target`:`Resilience Hub ${app} [${tier}]: score=${resiliencyScore}, RTO=${rto}s, RPO=${rpo}s`,"log":{level:isErr?"warn":"info"},...(isErr?{error:{code:rand(["ResourceNotFoundException","ValidationException","ThrottlingException"]),message:"Resilience Hub policy breached",type:"resilience"}}:{}) };
}

function generateRamLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const resourceType = rand(["ec2:Subnet","ec2:TransitGateway","ram:ResourceShare","route53resolver:ResolverRule","license-manager:LicenseConfiguration","networkmanager:CoreNetwork"]);
  const action = rand(["CreateResourceShare","AssociateResourceShare","GetResourceShareInvitations","AcceptResourceShareInvitation","DisassociateResourceShare","RejectResourceShareInvitation"]);
  const accountId = `${acct.id}`;
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"ram"}},"aws":{ram:{resource_share_arn:`arn:aws:ram:${region}:${acct.id}:resource-share/${randId(36).toLowerCase()}`,resource_share_name:rand(["shared-subnets","transit-gateway-share","resolver-rules-share"]),resource_type:resourceType,action,principal:accountId,allow_external_principals:rand([true,false]),status:isErr?"FAILED":rand(["ACTIVE","PENDING"]),invitation_status:action.includes("Invitation")?rand(["PENDING","ACCEPTED","REJECTED"]):null,error_code:isErr?rand(["UnknownResourceException","OperationNotPermittedException","MissingRequiredParameterException"]):null}},"event":{action,outcome:isErr?"failure":"success",category:"iam",dataset:"aws.ram",provider:"ram.amazonaws.com"},"message":isErr?`RAM ${action} FAILED: ${rand(["Permission denied","Resource not found","Invalid principal"])}:`:`RAM ${action}: ${resourceType} shared with account ${accountId}`,"log":{level:isErr?"error":"info"},...(isErr?{error:{code:"RAMError",message:"RAM operation failed",type:"iam"}}:{}) };
}

function generateMigrationHubLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const app = rand(["web-tier-migration","database-rehost","legacy-erp","analytics-platform","on-prem-k8s"]);
  const status = isErr?rand(["MIGRATION_FAILED","NOT_STARTED"]):rand(["MIGRATION_IN_PROGRESS","MIGRATION_COMPLETE","MIGRATION_IN_PROGRESS"]);
  const server = `server-${randId(8).toLowerCase()}`;
  const tool = rand(["ApplicationMigrationService","DatabaseMigrationService","CloudEndure","Carbonite","ATADATA"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"migrationhub"}},"aws":{migrationhub:{application_id:`app-${randId(17).toLowerCase()}`,application_name:app,server_id:`d-server-${randId(13)}`,server_name:server,migration_status:status,migration_tool:tool,progress_update_stream:rand(["DMS-stream","SMS-stream","MGN-stream"]),task:{status:isErr?"FAILED":"IN_PROGRESS",progress_percent:isErr?randInt(10,90):randInt(50,100),total_objects:randInt(10,1000),replicated_objects:randInt(0,1000)},error_code:isErr?rand(["AccessDeniedException","ResourceNotFoundException","UnauthorizedOperation"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.migrationhub",provider:"mgh.amazonaws.com"},"message":isErr?`Migration Hub ${app} FAILED [${tool}]: ${rand(["Replication failed","Agent offline","Insufficient permissions"])}:`:`Migration Hub ${app} [${tool}]: ${status} — ${server}`,"log":{level:isErr?"error":status.includes("FAILED")?"warn":"info"},...(isErr?{error:{code:"MigrationFailed",message:"Migration Hub task failed",type:"migration"}}:{}) };
}

function generateDevOpsGuruLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const svc = rand(["lambda-api","rds-prod","ecs-workers","dynamodb-sessions","sqs-orders","elasticache-cache"]);
  const insightType = rand(["PROACTIVE","REACTIVE"]);
  const severity = rand(["HIGH","MEDIUM","LOW"]);
  const anomaly = rand(["Unusual increase in Lambda error rate","RDS CPU spike correlated with API latency","Memory utilization anomaly on ECS tasks","DynamoDB throttling pattern detected","SQS queue depth growing abnormally","ElastiCache eviction rate spike"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"devopsguru"}},"aws":{devopsguru:{insight_id:randId(36).toLowerCase(),insight_type:insightType,severity,resource_collection:{cloud_formation:{stack_names:[rand(["prod-stack","api-stack","data-stack"])]},tags:[{key:"environment",value:"production"}]},anomaly_id:randId(36).toLowerCase(),anomaly_description:anomaly,anomaly_sources:[svc],start_time:new Date(Date.now()-randInt(0,3600000)).toISOString(),end_time:isErr?null:new Date().toISOString(),status:isErr?"ONGOING":"CLOSED",recommendation:rand(["Scale up resource","Check recent deployments","Review alarm thresholds","Enable enhanced monitoring"]),ssm_ops_items:isErr?[`oi-${randId(8).toLowerCase()}`]:[]}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.devopsguru",provider:"devops-guru.amazonaws.com"},"message":isErr?`DevOps Guru ONGOING [${severity}]: ${anomaly}`:`DevOps Guru ${insightType} insight [${severity}]: ${anomaly}`,"log":{level:isErr?"error":severity==="HIGH"?"warn":"info"},...(isErr?{error:{code:"InsightOngoing",message:"DevOps Guru ongoing anomaly",type:"process"}}:{}) };
}

export { generateWorkSpacesLog, generateConnectLog, generateAppStreamLog, generateGameLiftLog, generateSesLog, generatePinpointLog, generateTransferFamilyLog, generateLightsailLog, generateFraudDetectorLog, generateLocationServiceLog, generateMediaConvertLog, generateMediaLiveLog, generateManagedBlockchainLog, generateResilienceHubLog, generateRamLog, generateMigrationHubLog, generateDevOpsGuruLog };
