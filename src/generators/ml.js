import { rand, randInt, randFloat, randId, randIp, randUUID, randAccount, REGIONS, ACCOUNTS, USER_AGENTS, HTTP_METHODS, HTTP_PATHS, PROTOCOLS } from "../helpers/index.js";

function generateSageMakerLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const domain = rand(["ds-platform","ml-research","cv-team","nlp-experiments","risk-models"]);
  const domainId = `d-${randId(10).toLowerCase()}`;
  const user = rand(["alice-ds","bob-ml","carol-research","dan-platform"]);
  const model = rand(["xgboost-classifier","bert-finetuned","resnet50-custom","lstm-timeseries","llama-finetuned"]);
  const jobType = rand(["Training","Processing","Transform","HyperparameterTuning","Pipeline","Endpoint"]);
  const jobName = `${model}-${jobType.toLowerCase()}-${randId(6).toLowerCase()}`;
  const isErr = level === "error";
  const isStudio = Math.random() < 0.45;
  const STUDIO_APP_TYPES = ["JupyterServer","KernelGateway","JupyterLab","CodeEditor","RStudio","RSession"];
  const STUDIO_SPACES = ["ml-research","cv-team","ds-platform","nlp-experiments","risk-models"];
  const CLASSIC_ACTIONS = ["TrainingJobStarted","TrainingJobCompleted","ProcessingJobStarted","EndpointInService","PipelineExecutionStarted","ModelRegistered"];
  const STUDIO_ACTIONS = ["AppCreated","AppReady","AppDeleted","LifecycleConfigOnStart","SpaceCreated"];
  const action = isStudio ? rand(STUDIO_ACTIONS) : rand(CLASSIC_ACTIONS);
  const lifecycleConfig = isStudio && action === "LifecycleConfigOnStart";
  const durationSec = parseFloat(randFloat(isErr ? 5 : 60, isErr ? 600 : 14400));
  const ERROR_CODES = ["CapacityError","ResourceNotFound","ValidationException","InternalServerError"];
  const ERROR_MSGS = ["Training job failed: CUDA out of memory","Endpoint creation failed: No capacity for ml.p4d.24xlarge","Model deployment failed: health check timeout"];
  const MSGS = { info:["Training job started","Training job started on ml.p3.2xlarge (4 GPUs)","Training job succeeded","Epoch 12/50 - loss: 0.2341, val_loss: 0.2518, accuracy: 0.9124","Model artifact uploaded to s3://models/output/","Endpoint InService: latency p50=12ms p99=47ms","Feature Store ingestion complete: 4,829,201 records","Model registered: fraud-detector v12 (AUC: 0.9923)"],warn:["GPU utilization low: 34%","Training loss plateau detected at epoch 28","Model drift detected: PSI=0.18","Spot instance interruption, checkpointing..."],error:["Training job failed",...ERROR_MSGS] };
  const plainMessage = rand(MSGS[level]);
  const spaceName = rand(STUDIO_SPACES);
  const appType = rand(STUDIO_APP_TYPES);
  const useStudioLogging = isStudio && Math.random() < 0.55;
  const message = useStudioLogging
    ? JSON.stringify({ domainId, space: spaceName, appType, user, level: level.toUpperCase(), message: plainMessage, timestamp: new Date(ts).toISOString(), event: action })
    : plainMessage;
  const trainingMetrics = { training_loss: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)), accuracy: parseFloat((Math.random() * 0.3 + 0.7).toFixed(4)), epoch: randInt(1, 100), gpu_utilization_pct: randInt(40, 99), cpu_utilization_pct: randInt(30, 90) };
  const invocations = randInt(1, 5000);
  const modelLatencyMs = randInt(5, isErr ? 5000 : 200);
  const gpuUtil = randInt(40, isErr ? 99 : 85);
  const cpuUtil = randInt(30, isErr ? 95 : 75);
  return {
    "@timestamp": ts,
    "cloud": { provider:"aws", region, account:{ id:acct.id, name:acct.name }, service:{ name:"sagemaker" } },
    "aws": {
      sagemaker: {
        domain_id: domainId,
        domain_name: domain,
        user_profile: user,
        job: { name: jobName, type: jobType, arn: `arn:aws:sagemaker:${region}:${acct.id}:training-job/${jobName}` },
        model: { name: model, version: randInt(1, 25) },
        pipeline: { name: rand(["feature-engineering-pipeline","model-training-pipeline"]), execution_id: `pipe-${randId(12).toLowerCase()}` },
        instance: { type: rand(["ml.p3.2xlarge","ml.g4dn.xlarge","ml.m5.xlarge"]), count: rand([1,1,2,4]) },
        metrics: trainingMetrics,
        studio: isStudio ? { space_name: spaceName, app_type: appType, app_name: rand(["default", `instance-${randId(8).toLowerCase()}`]), lifecycle_config: lifecycleConfig, continuous_logging: useStudioLogging } : { space_name: null, app_type: null, app_name: null, lifecycle_config: false, continuous_logging: false },
        cloudwatch_metrics: {
          Invocations: { sum: invocations },
          ModelLatency: { avg: modelLatencyMs, p99: modelLatencyMs * 3 },
          GPUUtilization: { avg: gpuUtil },
          CPUUtilization: { avg: cpuUtil },
          DiskUtilization: { avg: randInt(10, isErr ? 95 : 60) },
          MemoryUtilization: { avg: randInt(50, isErr ? 98 : 80) },
          Invocations4XXError: { sum: isErr && Math.random() < 0.3 ? randInt(1, 50) : 0 },
          Invocations5XXError: { sum: isErr ? randInt(1, 100) : 0 },
        },
      }
    },
    "log": { level },
    "user": { name: user },
    "event": { action, duration: durationSec * 1e9, outcome: isErr ? "failure" : "success", category: "machine_learning", dataset: "aws.sagemaker", provider: "sagemaker.amazonaws.com" },
    "message": message,
    ...(isErr ? { error: { code: rand(ERROR_CODES), message: rand(ERROR_MSGS), type: "service" } } : {}),
  };
}

function generateBedrockLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const models = ["anthropic.claude-3-5-sonnet-20241022-v2:0","anthropic.claude-3-haiku-20240307-v1:0","amazon.titan-text-express-v1","meta.llama3-70b-instruct-v1:0","mistral.mixtral-8x7b-instruct-v0:1","amazon.nova-pro-v1:0"];
  const model = rand(models); const inputTokens = randInt(50,8000); const outputTokens = randInt(50,isErr?0:4000);
  const lat = parseFloat(randFloat(0.5, isErr?30:15));
  const invocations = randInt(1, 500);
  const latencyMs = Math.round(lat * 1000);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"bedrock"}},"aws":{bedrock:{model_id:model,invocation_latency_ms:latencyMs,input_token_count:inputTokens,output_token_count:outputTokens,total_token_count:inputTokens+outputTokens,stop_reason:isErr?null:rand(["end_turn","max_tokens","stop_sequence"]),error_code:isErr?rand(["ThrottlingException","ModelTimeoutException","ModelErrorException"]):null,use_case:rand(["text-generation","summarization","classification","extraction","qa"]),guardrail_action:rand(["NONE","NONE","NONE","INTERVENED"]),metrics:{Invocations:{sum:invocations},InvocationLatency:{avg:latencyMs,p99:latencyMs*2},InputTokenCount:{sum:inputTokens},OutputTokenCount:{sum:outputTokens},Throttles:{sum:isErr?randInt(1,20):0}}}},"event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.bedrock",provider:"bedrock.amazonaws.com",duration:lat*1e9},"message":isErr?`Bedrock ${model.split(".")[1].split("-")[0]} invocation FAILED: ${rand(["ThrottlingException","ModelTimeoutException"])}`:`Bedrock ${model.split(".")[1].split("-")[0]} ${inputTokens}->${outputTokens} tokens ${lat.toFixed(2)}s`,"log":{level:isErr?"error":lat>10?"warn":"info"},...(isErr?{error:{code:rand(["ThrottlingException","ModelTimeoutException","ModelErrorException"]),message:"Bedrock invocation failed",type:"ml"}}:{}) };
}

function generateBedrockAgentLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const agentId = `T${randId(11).toUpperCase()}`;
  const aliasId = rand(["TSTALIASID", "LIVE"]);
  const sessionId = randId(32).toLowerCase();
  const action = rand(["InvokeAgent","Retrieve","InvokeAgentWithResponseStream"]);
  const kbId = `KB${randId(9).toUpperCase()}`;
  const inputTokens = randInt(100, 4000); const outputTokens = randInt(50, isErr ? 0 : 2000);
  const dur = parseFloat(randFloat(0.3, isErr ? 15 : 8));
  const latencyMs = Math.round(dur * 1000);
  return {
    "@timestamp": ts,
    "cloud": { provider: "aws", region, account: { id: acct.id, name: acct.name }, service: { name: "bedrock-agent" } },
    "aws": {
      bedrockagent: {
        agent_id: agentId,
        agent_alias_id: aliasId,
        session_id: sessionId,
        action,
        knowledge_base_id: action === "Retrieve" ? kbId : null,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        invocation_latency_ms: latencyMs,
        orchestration_trace: rand([null, { model_invocation: { model_arn: `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-5-sonnet-v2` } }]),
        guardrail_action: rand(["NONE", "NONE", "INTERVENED"]),
        error_code: isErr ? rand(["ValidationException", "ThrottlingException", "ServiceQuotaExceededException"]) : null,
        metrics: {
          Invocations: { sum: randInt(1, 200) },
          InvocationLatency: { avg: latencyMs, p99: latencyMs * 2 },
          InputTokenCount: { sum: inputTokens },
          OutputTokenCount: { sum: outputTokens },
        },
      },
    },
    "event": { outcome: isErr ? "failure" : "success", category: "machine_learning", dataset: "aws.bedrockagent", provider: "bedrock-agent-runtime.amazonaws.com", duration: dur * 1e9 },
    "message": isErr ? `Bedrock Agent ${agentId} ${action} FAILED` : `Bedrock Agent ${agentId}: ${action} ${inputTokens}→${outputTokens} tokens ${dur.toFixed(2)}s`,
    "log": { level: isErr ? "error" : "info" },
    ...(isErr ? { error: { code: "BedrockAgentError", message: "Agent invocation failed", type: "ml" } } : {}),
  };
}

function generateRekognitionLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectLabels","DetectFaces","RecognizeCelebrities","DetectModerationLabels","IndexFaces","SearchFacesByImage","DetectText"]);
  const dur = parseFloat(randFloat(50, isErr?5000:1000));
  const confidence = parseFloat(randFloat(70,99));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"rekognition"}},
    "aws":{rekognition:{operation:op,
      input_source:rand(["S3Object","Base64Image","Video"]),
      image_bytes:randInt(10000,10485760),duration_ms:Math.round(dur),
      labels_detected:isErr?0:randInt(1,50),faces_detected:isErr?0:randInt(0,20),
      max_confidence:isErr?0:confidence,confidence_threshold:70,
      moderation_labels:op==="DetectModerationLabels"&&!isErr?[rand(["Explicit Content","Violence"])]:null,
      error_code:isErr?rand(["InvalidS3ObjectException","AccessDeniedException","ThrottlingException","ImageTooLargeException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.rekognition",provider:"rekognition.amazonaws.com"},
    "message":isErr?`Rekognition ${op} FAILED: ${rand(["Image too large","Access denied","Throttled"])}`:
      `Rekognition ${op}: ${randInt(1,50)} results, ${confidence.toFixed(1)}% confidence`,
    ...(isErr?{error:{code:"RekognitionError",message:"Rekognition operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateTextractLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectDocumentText","AnalyzeDocument","StartDocumentAnalysis","GetDocumentAnalysis","AnalyzeExpense","AnalyzeID"]);
  const docType = rand(["invoice","tax-form","id-card","contract","receipt","bank-statement"]);
  const pages = randInt(1, isErr?0:50);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"textract"}},
    "aws":{textract:{operation:op,document_type:docType,
      job_id:op.startsWith("Start")||op.startsWith("Get")?randId(36).toLowerCase():null,
      job_status:op.startsWith("Get")?(isErr?"FAILED":"SUCCEEDED"):null,
      pages_processed:pages,blocks_detected:pages*randInt(10,200),
      words_detected:pages*randInt(50,500),
      form_key_value_pairs:op==="AnalyzeDocument"?randInt(0,50):0,
      tables_detected:op==="AnalyzeDocument"?randInt(0,10):0,
      confidence_mean:parseFloat(randFloat(85,99)),
      error_code:isErr?rand(["UnsupportedDocumentException","DocumentTooLargeException","BadDocumentException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.textract",provider:"textract.amazonaws.com"},
    "message":isErr?`Textract ${op} FAILED on ${docType}: ${rand(["Unsupported format","Document too large"])}`:
      `Textract ${op}: ${docType}, ${pages} pages, ${pages*randInt(50,500)} words`,
    ...(isErr?{error:{code:"TextractError",message:"Textract operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateComprehendLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const op = rand(["DetectSentiment","DetectEntities","DetectKeyPhrases","DetectLanguage","ClassifyDocument","DetectPiiEntities"]);
  const lang = rand(["en","es","fr","de","it","pt","ja","zh"]);
  const sentiment = rand(["POSITIVE","NEGATIVE","NEUTRAL","MIXED"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"comprehend"}},
    "aws":{comprehend:{operation:op,language_code:lang,
      text_bytes:randInt(100,100000),
      sentiment:op==="DetectSentiment"?sentiment:null,
      entities_detected:op==="DetectEntities"?randInt(0,20):0,
      key_phrases_detected:op==="DetectKeyPhrases"?randInt(0,30):0,
      pii_entities_detected:op==="DetectPiiEntities"?randInt(0,10):0,
      error_code:isErr?rand(["TextSizeLimitExceededException","UnsupportedLanguageException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.comprehend",provider:"comprehend.amazonaws.com"},
    "message":isErr?`Comprehend ${op} FAILED: ${rand(["Text too large","Unsupported language"])}`:
      `Comprehend ${op}: lang=${lang}${op==="DetectSentiment"?`, sentiment=${sentiment}`:""}`,
    ...(isErr?{error:{code:"ComprehendError",message:"Comprehend operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateComprehendMedicalLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const action = rand(["DetectEntitiesV2","DetectPHI","InferICD10CM","InferRxNorm","InferSNOMEDCT","StartEntitiesDetectionV2Job"]);
  const entityCount = randInt(2,50); const phiCount = isErr?0:randInt(0,10);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"comprehendmedical"}},"aws":{comprehendmedical:{operation:action,entities_detected:entityCount,phi_entities:phiCount,icd10_concepts:action.includes("ICD")?randInt(1,20):null,rxnorm_concepts:action.includes("Rx")?randInt(1,15):null,snomedct_concepts:action.includes("SNOMED")?randInt(1,30):null,text_characters:randInt(100,10000),job_id:action.includes("Job")?randId(36).toLowerCase():null,data_access_role_arn:`arn:aws:iam::${acct.id}:role/ComprehendMedicalRole`,s3_bucket:rand(["medical-records","clinical-notes","ehr-processed"]),error_code:isErr?rand(["InvalidRequestException","TextSizeLimitExceededException","TooManyRequestsException"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.comprehendmedical",provider:"comprehendmedical.amazonaws.com"},"message":isErr?`Comprehend Medical ${action} FAILED: ${rand(["Text too long","Invalid request","Rate limit exceeded"])}:`:`Comprehend Medical ${action}: ${entityCount} entities, ${phiCount} PHI`,"log":{level:isErr?"error":phiCount>5?"warn":"info"},...(isErr?{error:{code:rand(["InvalidRequestException","TextSizeLimitExceededException","TooManyRequestsException"]),message:"Comprehend Medical failed",type:"ml"}}:{}) };
}

function generateTranslateLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const langs = ["en","es","fr","de","it","pt","ja","zh","ko","ar","ru","hi"];
  const srcLang = rand(langs); const tgtLang = rand(langs.filter(l=>l!==srcLang));
  const chars = randInt(100, isErr?0:500000);
  const dur = parseFloat(randFloat(50, isErr?5000:1000));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"translate"}},
    "aws":{translate:{source_language_code:srcLang,target_language_code:tgtLang,
      characters_translated:chars,
      applied_terminology:rand([null,"tech-glossary","product-terms"]),
      formality:rand([null,"FORMAL","INFORMAL"]),
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["DetectedLanguageLowConfidenceException","UnsupportedLanguagePairException"]):null}},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.translate",provider:"translate.amazonaws.com"},
    "message":isErr?`Translate FAILED (${srcLang}->${tgtLang}): ${rand(["Unsupported pair","Low confidence"])}`:
      `Translate ${srcLang}->${tgtLang}: ${chars.toLocaleString()} chars in ${dur.toFixed(0)}ms`,
    ...(isErr?{error:{code:"TranslateError",message:"Translate failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateTranscribeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const jobName = `transcribe-${randId(8).toLowerCase()}`;
  const lang = rand(["en-US","en-GB","es-US","fr-FR","de-DE","ja-JP"]);
  const audioMins = parseFloat(randFloat(0.5, isErr?0:120));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"transcribe"}},
    "aws":{transcribe:{transcription_job_name:jobName,
      transcription_job_status:isErr?"FAILED":"COMPLETED",
      language_code:lang,media_format:rand(["mp3","mp4","wav","flac","ogg"]),
      media_uri:`s3://audio-bucket/${jobName}.mp3`,
      audio_duration_minutes:audioMins,
      word_count:isErr?0:Math.round(audioMins*150),
      vocabulary_name:rand([null,"custom-medical-terms","legal-terminology"]),
      speaker_count:rand([null,1,2,rand([3,4])]),
      content_redaction_enabled:Math.random()>0.7,
      error_code:isErr?rand(["InternalFailure","BadRequestException","LimitExceededException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.transcribe",provider:"transcribe.amazonaws.com"},
    "message":isErr?`Transcribe job ${jobName} FAILED (${lang}): ${rand(["Audio too noisy","Unsupported codec","Access denied"])}`:
      `Transcribe job ${jobName}: ${audioMins.toFixed(1)} min audio (${lang})`,
    ...(isErr?{error:{code:"TranscribeError",message:"Transcribe job failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generatePollyLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const voice = rand(["Joanna","Matthew","Amy","Brian","Celine","Hans","Mizuki","Lupe"]);
  const chars = randInt(50, isErr?0:100000);
  const engine = rand(["standard","neural","long-form"]);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"polly"}},
    "aws":{polly:{voice_id:voice,engine,
      language_code:rand(["en-US","en-GB","fr-FR","de-DE","es-US"]),
      output_format:rand(["mp3","ogg_vorbis","pcm"]),
      text_type:rand(["text","ssml"]),
      characters_synthesized:chars,
      sample_rate:rand(["8000","16000","22050","24000"]),
      error_code:isErr?rand(["TextLengthExceededException","InvalidSsmlException","LanguageNotSupportedException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.polly",provider:"polly.amazonaws.com"},
    "message":isErr?`Polly SynthesizeSpeech FAILED (${voice}): ${rand(["Text too long","Invalid SSML","Language not supported"])}`:
      `Polly SynthesizeSpeech: ${voice} (${engine}), ${chars} chars`,
    ...(isErr?{error:{code:"PollyError",message:"Polly synthesis failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateForecastLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const dataset = rand(["demand-forecast","sales-prediction","energy-consumption","web-traffic"]);
  const action = rand(["CreatePredictor","CreateForecast","CreateDatasetImportJob","GetAccuracyMetrics"]);
  const dur = randInt(300, isErr?86400:7200);
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"forecast"}},
    "aws":{forecast:{dataset_group:dataset,
      predictor_name:isErr?null:`${dataset}-predictor-v${randInt(1,20)}`,
      action,algorithm:rand(["AutoML","CNN-QR","DeepAR+","NPTS","Prophet","ETS"]),
      forecast_horizon:rand([7,14,30,60,90]),
      weighted_quantile_loss:isErr?null:parseFloat(randFloat(0.05,0.25)),
      duration_seconds:dur,status:isErr?"FAILED":"ACTIVE",
      error_message:isErr?rand(["Insufficient training data","AutoML timed out","Invalid target field"]):null}},
    "event":{duration:dur*1e9,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.forecast",provider:"forecast.amazonaws.com"},
    "message":isErr?`Forecast ${action} FAILED for ${dataset}: ${rand(["Insufficient data","Training timeout"])}`:
      `Forecast ${action}: ${dataset}, WQL=${parseFloat(randFloat(0.05,0.25)).toFixed(3)}`,
    ...(isErr?{error:{code:"ForecastError",message:"Forecast operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generatePersonalizeLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const campaign = rand(["product-recommendations","content-discovery","similar-items","personalized-ranking"]);
  const userId = `user-${randId(8).toLowerCase()}`;
  const action = rand(["GetRecommendations","GetPersonalizedRanking","CreateSolution","PutEvents","CreateCampaign"]);
  const numResults = isErr?0:randInt(5,25);
  const dur = parseFloat(randFloat(10, isErr?5000:300));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"personalize"}},
    "aws":{personalize:{campaign_name:campaign,action,user_id:userId,
      num_results_returned:numResults,
      recipe:rand(["aws-similar-items","aws-user-personalization","aws-hrnn"]),
      solution_version:rand(["1.0.0","1.1.2","2.0.0"]),
      duration_ms:Math.round(dur),
      error_code:isErr?rand(["ResourceNotFoundException","InvalidInputException"]):null}},
    "user":{name:userId},
    "event":{duration:dur*1e6,outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.personalize",provider:"personalize.amazonaws.com"},
    "message":isErr?`Personalize ${action} FAILED for ${campaign}`:
      `Personalize ${action}: ${numResults} recs for ${userId} in ${dur.toFixed(0)}ms`,
    ...(isErr?{error:{code:"PersonalizeError",message:"Personalize operation failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":"info"}};
}

function generateLexLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const bot = rand(["customer-service-bot","order-bot","faq-bot","booking-assistant"]);
  const intent = rand(["OrderProduct","CheckStatus","CancelOrder","GetHelp","BookAppointment","TransferToAgent"]);
  const nluScore = parseFloat(randFloat(0.6,0.99));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lex"}},
    "aws":{lex:{bot_id:randId(10),bot_name:bot,bot_version:rand(["DRAFT","1","2"]),
      locale_id:rand(["en_US","en_GB","es_US","fr_FR"]),
      session_id:randId(36).toLowerCase(),
      input_transcript:rand(["I want to order a product","What is my order status","Cancel my order"]),
      intent_name:intent,intent_nlu_confidence_score:nluScore,
      dialog_state:isErr?"Failed":"Fulfilled",
      sentiment:rand(["POSITIVE","NEUTRAL","NEGATIVE"]),
      error_code:isErr?rand(["NoSuchBotException","BadRequestException"]):null}},
    "event":{outcome:isErr?"failure":"success",category:"machine_learning",dataset:"aws.lex",provider:"lex.amazonaws.com"},
    "message":isErr?`Lex ${bot} FAILED: intent ${intent} - ${rand(["NLU confidence too low","Slot validation failed"])}`:
      `Lex ${bot}: intent=${intent} (${(nluScore*100).toFixed(0)}%)`,
    ...(isErr?{error:{code:"LexError",message:"Lex intent failed",type:"ml"}}:{}),
    "log":{level:isErr?"error":nluScore<0.7?"warn":"info"}};
}

function generateLookoutMetricsLog(ts, er) {
  const region = rand(REGIONS); const acct = randAccount(); const isErr = Math.random() < er;
  const detector = rand(["revenue-anomaly","traffic-spike-detector","error-rate-monitor","latency-outlier","conversion-drop"]);
  const metric = rand(["revenue","page_views","error_rate","p99_latency","conversion_rate","api_calls"]);
  const severity = isErr?rand(["HIGH","MEDIUM"]):rand(["LOW","MEDIUM"]);
  const anomalyScore = isErr?parseFloat(randFloat(70,99)):parseFloat(randFloat(0,40));
  return { "@timestamp":ts,"cloud":{provider:"aws",region,account:{id:acct.id,name:acct.name},service:{name:"lookoutmetrics"}},"aws":{lookoutmetrics:{anomaly_detector_arn:`arn:aws:lookoutmetrics:${region}:${acct.id}:AnomalyDetector:${detector}`,anomaly_group_id:randId(36).toLowerCase(),metric_name:metric,severity,anomaly_score:anomalyScore,relevant_dates:rand([3,7,14,30]),impact_value:parseFloat(randFloat(-50,200)),expected_value:parseFloat(randFloat(100,10000)),actual_value:parseFloat(randFloat(50,15000)),dimension:rand([{region:"us-east-1"},{service:"checkout"},{environment:"prod"}]),sensitivity:rand(["LOW","MEDIUM","HIGH"]),action_taken:isErr?rand(["SNS_ALERT","LAMBDA_TRIGGER"]):null}},"event":{outcome:isErr?"failure":"success",category:"process",dataset:"aws.lookoutmetrics",provider:"lookoutmetrics.amazonaws.com"},"message":isErr?`Lookout for Metrics ANOMALY [${detector}]: ${metric} score=${anomalyScore.toFixed(0)} [${severity}]`:`Lookout for Metrics [${detector}]: ${metric} anomaly_score=${anomalyScore.toFixed(0)}`,"log":{level:isErr?"warn":"info"},...(isErr?{error:{code:"AnomalyDetected",message:"Lookout for Metrics anomaly",type:"process"}}:{}) };
}

export { generateSageMakerLog, generateBedrockLog, generateBedrockAgentLog, generateRekognitionLog, generateTextractLog, generateComprehendLog, generateComprehendMedicalLog, generateTranslateLog, generateTranscribeLog, generatePollyLog, generateForecastLog, generatePersonalizeLog, generateLexLog, generateLookoutMetricsLog };
