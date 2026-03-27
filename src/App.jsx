import { useState, useCallback, useRef, useEffect } from "react";
import K from "./theme/index.js";
import { rand, randInt, randIp, randId, randAccount, randTs, REGIONS, USER_AGENTS, HTTP_PATHS, stripNulls } from "./helpers/index.js";
import { GENERATORS } from "./generators/index.js";
import { METRICS_GENERATORS } from "./generators/metrics/index.js";
import { TRACE_GENERATORS, TRACE_SERVICES } from "./generators/traces/index.js";
import { ELASTIC_DATASET_MAP, ELASTIC_METRICS_DATASET_MAP, METRICS_SUPPORTED_SERVICE_IDS } from "./data/elasticMaps.js";
import { SERVICE_INGESTION_DEFAULTS, INGESTION_META } from "./data/ingestion.js";
import { AWS_ICON_BASE, AWS_SERVICE_ICON_MAP, CATEGORY_ICON_MAP, iconSrc } from "./data/iconMap.js";
import { SERVICE_GROUPS, ALL_SERVICE_IDS } from "./data/serviceGroups.js";
import { Card, CardHeader, QuickBtn, Field, SliderField, StatCard } from "./components/Card.jsx";
import { StatusPill } from "./components/StatusPill.jsx";
import { AwsLogo, PipelineRoute } from "./components/Logo.jsx";
import { validateElasticUrl, validateApiKey, validateIndexPrefix } from "./utils/validation.js";
import styles from "./App.module.css";

// ─── localStorage config persistence ─────────────────────────────────────────
const LS_KEY = "awsElasticConfig";

const savedConfig = (() => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) {
    if (import.meta.env.DEV) console.warn("[LS] Failed to read saved config:", e);
    return {};
  }
})();

export default function App() {
  const [selectedServices, setSelectedServices] = useState(["lambda","apigateway"]);
  const [selectedTraceServices, setSelectedTraceServices] = useState(["lambda","emr"]);
  const [logsPerService, setLogsPerService]     = useState(savedConfig.logsPerService    ?? 500);
  const [tracesPerService, setTracesPerService] = useState(savedConfig.tracesPerService  ?? 100);
  const [errorRate, setErrorRate]               = useState(savedConfig.errorRate         ?? 0.05);
  const [batchSize, setBatchSize]               = useState(savedConfig.batchSize         ?? 250);
  const [elasticUrl, setElasticUrl]             = useState("");
  const [apiKey, setApiKey]                     = useState("");
  const [logsIndexPrefix, setLogsIndexPrefix]   = useState(savedConfig.logsIndexPrefix   ?? "logs-aws");
  const [metricsIndexPrefix, setMetricsIndexPrefix] = useState(savedConfig.metricsIndexPrefix ?? "metrics-aws");
  const [eventType, setEventType]               = useState(savedConfig.eventType         ?? "logs");
  const [ingestionSource, setIngestionSource]   = useState(savedConfig.ingestionSource   ?? "default");
  const [batchDelayMs, setBatchDelayMs]         = useState(savedConfig.batchDelayMs     ?? 20);
  const [injectAnomalies, setInjectAnomalies]   = useState(savedConfig.injectAnomalies  ?? false);
  const [validationErrors, setValidationErrors] = useState({ elasticUrl: "", apiKey: "", indexPrefix: "" });

  const isTracesMode   = eventType === "traces";
  const indexPrefix    = eventType === "metrics" ? metricsIndexPrefix : logsIndexPrefix;
  const setIndexPrefix = eventType === "metrics" ? setMetricsIndexPrefix : setLogsIndexPrefix;

  const [status, setStatus]     = useState(null);
  const [progress, setProgress] = useState({ sent:0, total:0, errors:0 });
  const [log, setLog]           = useState([]);
  const [preview, setPreview]   = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const abortRef = useRef(false);

  // ─── Persist config to localStorage ────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        logsIndexPrefix, metricsIndexPrefix,
        logsPerService, tracesPerService, errorRate, batchSize, batchDelayMs, ingestionSource, eventType, injectAnomalies,
      }));
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[LS] Failed to save config:", e);
    }
  }, [logsIndexPrefix, metricsIndexPrefix, logsPerService, tracesPerService, errorRate, batchSize, batchDelayMs, ingestionSource, eventType, injectAnomalies]);

  const clearSavedConfig = () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setLogsPerService(500);
    setTracesPerService(100);
    setErrorRate(0.05);
    setBatchSize(250);
    setLogsIndexPrefix("logs-aws");
    setMetricsIndexPrefix("metrics-aws");
    setEventType("logs");
    setIngestionSource("default");
    setBatchDelayMs(20);
    setInjectAnomalies(false);
  };

  const toggleTraceService  = (id) => {
    setSelectedTraceServices(prev => prev.includes(id) ? prev.filter(s=>s!==id) : [...prev,id]);
  };
  const selectAllTraces  = () => setSelectedTraceServices(TRACE_SERVICES.map(s => s.id));
  const selectNoneTraces = () => setSelectedTraceServices([]);

  const addLog = (msg, type="info") => setLog(prev => [...prev.slice(-5000), {msg,type,ts:new Date().toLocaleTimeString()}]);

  const downloadLog = () => {
    const lines = log.map(e => `[${e.ts}] [${e.type.toUpperCase().padEnd(5)}] ${e.msg}`).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `load-generator-log-${new Date().toISOString().slice(0,19).replace(/[T:]/g,"-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleService = (id) => {
    if (eventType === "metrics" && !METRICS_SUPPORTED_SERVICE_IDS.has(id) && !selectedServices.includes(id)) return;
    setSelectedServices(prev => prev.includes(id) ? prev.filter(s=>s!==id) : [...prev,id]);
  };

  const toggleGroup = (gid) => {
    const groupIds = SERVICE_GROUPS.find(g=>g.id===gid).services.map(s=>s.id);
    const selectableIds = eventType === "metrics" ? groupIds.filter(id => METRICS_SUPPORTED_SERVICE_IDS.has(id)) : groupIds;
    const allSel = selectableIds.length > 0 && selectableIds.every(id => selectedServices.includes(id));
    setSelectedServices(prev => allSel ? prev.filter(id => !groupIds.includes(id)) : [...new Set([...prev,...selectableIds])]);
  };

  const selectAll  = () => setSelectedServices(eventType === "metrics" ? ALL_SERVICE_IDS.filter(id => METRICS_SUPPORTED_SERVICE_IDS.has(id)) : [...ALL_SERVICE_IDS]);
  const selectNone = () => setSelectedServices([]);
  const toggleCollapse = (gid) => setCollapsedGroups(prev => ({...prev,[gid]:!prev[gid]}));

  const getEffectiveSource = useCallback((svcId) => {
    if (ingestionSource !== "default") return ingestionSource;
    return SERVICE_INGESTION_DEFAULTS[svcId] || "cloudwatch";
  }, [ingestionSource]);

  const enrichDoc = useCallback((doc, svc, source, evType) => {
    const region    = doc.cloud?.region || rand(REGIONS);
    const accountId = doc.cloud?.account?.id || randAccount().id;
    const dataset   = evType === "metrics"
      ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
      : (ELASTIC_DATASET_MAP[svc] || `aws.${svc}`);
    const bucket    = `aws-${svc}-logs-${accountId}`;
    const key       = `AWSLogs/${accountId}/${svc}/${region}/${new Date().toISOString().slice(0,10).replace(/-/g,"/")}/${svc}_${randId(20)}.log.gz`;
    const logGroup  = `/aws/${svc}/logs`;
    const logStream = `${region}/${randId(8).toLowerCase()}`;

    const inputTypeMap = {
      s3:         "aws-s3",
      cloudwatch: "aws-cloudwatch",
      firehose:   "aws-firehose",
      api:        "http_endpoint",
      otel:       "opentelemetry",
      agent:      "logfile",
    };

    const agentMeta = source === "agent"
      ? { type:"elastic-agent", version:"8.17.0", name:`elastic-agent-${region}`, id:randId(36).toLowerCase() }
      : source === "otel"
      ? { type:"otel", version:"0.115.0", name:`otel-collector-${region}` }
      : { type:"filebeat", version:"8.17.0", name:`filebeat-aws-${region}` };

    const otelFields = source === "otel" ? {
      "telemetry": {
        sdk: { name:"opentelemetry", language:"go", version:"1.31.0" },
        distro: { name:"elastic", version:"8.17.0" },
      },
    } : {};

    const firehoseFields = source === "firehose" ? {
      "aws": {
        ...doc.aws,
        s3:         { bucket:{ name:bucket, arn:`arn:aws:s3:::${bucket}` }, object:{ key } },
        cloudwatch: { log_group:logGroup, log_stream:logStream, ingestion_time:new Date().toISOString() },
        firehose:   { arn:`arn:aws:firehose:${region}:${accountId}:deliverystream/aws-${svc}-stream`, request_id:randId(36).toLowerCase() },
      },
    } : {
      "aws": {
        ...doc.aws,
        s3:         { bucket:{ name:bucket, arn:`arn:aws:s3:::${bucket}` }, object:{ key } },
        cloudwatch: { log_group:logGroup, log_stream:logStream, ingestion_time:new Date().toISOString() },
      },
    };

    const ecsBaseline = {};
    if (!doc.network?.transport && !doc.network?.bytes) ecsBaseline.network = { ...doc.network, transport: "tcp", direction: rand(["inbound", "outbound"]) };
    if (!doc.host?.name) ecsBaseline.host = { ...doc.host, name: `ip-${randIp().replace(/\./g, "-")}.ec2.internal`, hostname: `${svc}-${randId(8).toLowerCase()}` };
    if (!doc.process?.name) ecsBaseline.process = { ...doc.process, name: svc };
    if (!doc.user_agent?.original) ecsBaseline.user_agent = { ...doc.user_agent, original: rand(USER_AGENTS) };
    if (!doc.url?.path && !doc.url?.domain) ecsBaseline.url = { ...doc.url, path: rand(HTTP_PATHS), domain: `${svc}.${region}.amazonaws.com` };
    if (doc.event?.outcome === "failure" && !doc.error?.message) ecsBaseline.error = { ...doc.error, message: (typeof doc.message === "string" ? doc.message : null) || "Operation failed", type: "service" };
    if (!doc.user?.name && !doc.user?.id) ecsBaseline.user = { ...doc.user, name: "system" };
    if (!doc.service?.name) ecsBaseline.service = { ...doc.service, name: svc, type: doc.service?.type ?? "aws" };
    if (!doc.file?.path && !doc.file?.name && (doc.event?.category === "file" || doc.db)) ecsBaseline.file = { ...doc.file, path: `/var/log/aws/${svc}.log`, name: `${svc}.log` };

    const eventCategory = doc.event?.category || "event";
    const isMetrics = evType === "metrics";
    const base = {
      ...doc,
      ...ecsBaseline,
      ...firehoseFields,
      ...otelFields,
      "data_stream": { type: isMetrics ? "metrics" : svc === "xray" ? "traces" : "logs", dataset, namespace: "default" },
      "agent": agentMeta,
      "event": { ...doc.event, module: "aws", dataset, category: eventCategory },
      "input": { type: inputTypeMap[source] },
      "log": doc.log ? { ...doc.log, level: doc.log.level || "info" } : { level: "info" },
    };
    if (isMetrics) base.metricset = { name: "cloudwatch", period: 300000 };
    if (base.message == null) base.message = `AWS ${svc} event`;
    return base;
  }, []);

  const generatePreview = () => {
    if (isTracesMode) {
      if (!selectedTraceServices.length) return;
      const svc = rand(selectedTraceServices);
      const traceDocs = TRACE_GENERATORS[svc](new Date().toISOString(), errorRate);
      setPreview(JSON.stringify(stripNulls(traceDocs[0]), null, 2));
    } else {
      if (!selectedServices.length) return;
      const svc = rand(selectedServices);
      if (eventType === "metrics" && METRICS_GENERATORS[svc]) {
        const docs = METRICS_GENERATORS[svc](new Date().toISOString(), errorRate);
        setPreview(JSON.stringify(stripNulls(docs[0]), null, 2));
      } else {
        const result = GENERATORS[svc](new Date().toISOString(), errorRate);
        if (Array.isArray(result)) {
          const { __dataset, ...cleanDoc } = stripNulls(result[0]);
          setPreview(JSON.stringify(cleanDoc, null, 2));
        } else {
          setPreview(JSON.stringify(stripNulls(enrichDoc(result, svc, getEffectiveSource(svc), eventType)), null, 2));
        }
      }
    }
  };

  const runConnectionValidation = useCallback(() => {
    const urlResult = validateElasticUrl(elasticUrl);
    const keyResult = validateApiKey(apiKey);
    const prefixResult = validateIndexPrefix(indexPrefix);
    setValidationErrors({
      elasticUrl: urlResult.valid ? "" : (urlResult.message ?? ""),
      apiKey: keyResult.valid ? "" : (keyResult.message ?? ""),
      indexPrefix: prefixResult.valid ? "" : (prefixResult.message ?? ""),
    });
    return urlResult.valid && keyResult.valid && prefixResult.valid;
  }, [elasticUrl, apiKey, indexPrefix]);

  const ship = useCallback(async () => {
    const activeServices = isTracesMode ? selectedTraceServices : selectedServices;
    if (!activeServices.length) { addLog("No services selected","error"); return; }
    if (!runConnectionValidation()) {
      addLog("Fix connection field errors before shipping.","error");
      return;
    }
    abortRef.current = false;
    setStatus("running"); setLog([]);
    try {
      const url = elasticUrl.replace(/\/$/,"");
      const headers = {
        "Content-Type":  "application/x-ndjson",
        "x-elastic-url": url,
        "x-elastic-key": apiKey,
      };
      const endDate   = new Date();
      // Metrics mode needs a wide window: TSDS deduplicates by (dimensions + @timestamp),
      // so a narrow window saturates quickly when re-running. 7 days gives plenty of entropy.
      // Logs and traces can stay short — their IDs are not timestamp-derived.
      const windowMs  = eventType === "metrics" ? 7 * 24 * 3600 * 1000 : 1800000;
      const startDate = new Date(endDate.getTime() - windowMs);

      /** ── Traces mode: each "trace" = 1 transaction + N spans ─────────────── */
      if (isTracesMode) {
        const APM_INDEX = "traces-apm-default";
        const totalTraces = activeServices.length * tracesPerService;
        setProgress({ sent:0, total:totalTraces, errors:0 });
        addLog(`Starting: ${totalTraces.toLocaleString()} traces across ${activeServices.length} service(s) → ${APM_INDEX}`);
        let totalSent = 0, totalErrors = 0;

        const shipTraceService = async (svc) => {
          addLog(`▶ ${svc} → ${APM_INDEX} [OTel / OTLP]`, "info");
          // Flatten all trace docs for this service (each trace = array of docs)
          const allDocs = Array.from({ length: tracesPerService }, () =>
            TRACE_GENERATORS[svc](randTs(startDate, endDate), errorRate).map(d => stripNulls(d))
          ).flat();
          let svcSent = 0, svcErrors = 0, batchNum = 0;
          for (let i = 0; i < allDocs.length; i += batchSize) {
            if (abortRef.current) break;
            batchNum++;
            const batch  = allDocs.slice(i, i + batchSize);
            const ndjson = batch.flatMap(doc => [JSON.stringify({ create:{ _index:APM_INDEX } }), JSON.stringify(doc)]).join("\n") + "\n";
            try {
              const res  = await fetch(`/proxy/_bulk`, { method:"POST", headers, body:ndjson });
              const json = await res.json();
              if (!res.ok) {
                svcErrors += batch.length;
                addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`, "error");
              } else {
                const failedItems = json.items?.filter(it => it.create?.error || it.index?.error) || [];
                const errs = failedItems.length;
                svcErrors += errs;
                svcSent += batch.length - errs;
                if (errs > 0) {
                  const firstErr = failedItems[0]?.create?.error || failedItems[0]?.index?.error;
                  addLog(`  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`, "warn");
                } else {
                  addLog(`  ✓ batch ${batchNum}: ${batch.length} span docs indexed`, "ok");
                }
              }
            } catch(e) {
              svcErrors += batch.length;
              addLog(`  ✗ network error: ${e.message}`, "error");
            }
            setProgress({ sent: totalSent + Math.floor(svcSent / (allDocs.length / tracesPerService)), total: totalTraces, errors: totalErrors + svcErrors });
            if (batchDelayMs > 0) await new Promise(r => setTimeout(r, batchDelayMs));
          }
          addLog(`✓ ${svc} complete (${svcSent} span docs for ${tracesPerService} traces)`, "ok");
          return { sent: tracesPerService, errors: svcErrors > 0 ? 1 : 0 };
        };

        for (const svc of activeServices) {
          if (abortRef.current) break;
          const { sent, errors } = await shipTraceService(svc);
          totalSent += sent;
          totalErrors += errors;
        }

        // ── Anomaly injection pass (traces) ────────────────────────────────
        if (injectAnomalies && !abortRef.current) {
          addLog("⚡ Anomaly injection pass — shipping spike traces at current time…", "info");
          const injCount = Math.max(50, Math.round(tracesPerService * 0.3));
          const injEnd   = new Date();
          const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
          for (const svc of activeServices) {
            if (abortRef.current) break;
            if (!TRACE_GENERATORS[svc]) continue;
            const injDocs = Array.from({ length: injCount }, () =>
              TRACE_GENERATORS[svc](randTs(injStart, injEnd), 1.0).map(d => {
                const out = stripNulls(d);
                if (out["transaction.duration.us"]) out["transaction.duration.us"] *= 15;
                if (out["span.duration.us"])        out["span.duration.us"]        *= 15;
                return out;
              })
            ).flat();
            const ndjson = injDocs.flatMap(doc => [JSON.stringify({ create:{ _index: APM_INDEX } }), JSON.stringify(doc)]).join("\n") + "\n";
            try {
              const res  = await fetch(`/proxy/_bulk`, { method:"POST", headers, body:ndjson });
              const json = await res.json();
              const errs = json.items?.filter(it => it.create?.error || it.index?.error).length ?? 0;
              addLog(`  ⚡ ${svc}: ${injDocs.length - errs} anomaly trace docs injected`, errs > 0 ? "warn" : "ok");
            } catch(e) {
              addLog(`  ✗ anomaly injection network error (${svc}): ${e.message}`, "error");
            }
          }
        }

        setStatus(abortRef.current ? "aborted" : "done");
        addLog(
          abortRef.current ? `Aborted. ${totalSent} traces shipped.` : `Done! ${totalSent.toLocaleString()} traces indexed, ${totalErrors} errors.`,
          totalErrors > 0 ? "warn" : "ok"
        );
        return;
      }

      /** ── Logs / Metrics mode ──────────────────────────────────────────────── */
      setProgress({ sent:0, total:0, errors:0 });
      addLog(`Starting: ${activeServices.length} service(s) [${eventType}] — ${logsPerService.toLocaleString()} calls each`);
      let totalSent = 0, totalErrors = 0, totalActual = 0;

      const shipService = async (svc) => {
        const dataset = eventType === "metrics"
          ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
          : (ELASTIC_DATASET_MAP[svc] || `aws.${svc}`);
        const dsPrefix  = dataset === "aws.xray" ? "traces-aws" : indexPrefix;
        const indexName = `${dsPrefix}.${dataset.replace(/^aws\./, "")}-default`;
        const src = getEffectiveSource(svc);
        addLog(`▶ ${svc} → ${indexName} [${INGESTION_META[src]?.label || src}]`, "info");
        // In metrics mode, prefer dimensional generators that produce per-resource docs
        const isDimensionalMetrics = eventType === "metrics" && METRICS_GENERATORS[svc];
        const allDocs = isDimensionalMetrics
          ? Array.from({ length: logsPerService }, () =>
              METRICS_GENERATORS[svc](randTs(startDate, endDate), errorRate)
            ).flat().map(d => stripNulls(d))
          : Array.from({ length: logsPerService }, () => {
              const result = GENERATORS[svc](randTs(startDate, endDate), errorRate);
              if (Array.isArray(result)) {
                return result.map(d => stripNulls(d));
              }
              return [stripNulls(enrichDoc(result, svc, src, eventType))];
            }).flat();
        totalActual += allDocs.length;
        let svcSent = 0, svcErrors = 0, batchNum = 0;
        for (let i = 0; i < allDocs.length; i += batchSize) {
          if (abortRef.current) break;
          batchNum++;
          const batch = allDocs.slice(i, i + batchSize);
          const ndjson = batch.flatMap(doc => {
            const { __dataset, ...cleanDoc } = doc;
            const idx = __dataset
              ? __dataset.startsWith("aws.")
                ? `${indexPrefix}.${__dataset.replace(/^aws\./, "")}-default`
                : `logs-${__dataset}-default`
              : indexName;
            return [JSON.stringify({ create:{ _index:idx } }), JSON.stringify(cleanDoc)];
          }).join("\n") + "\n";
          try {
            const res  = await fetch(`/proxy/_bulk`, { method:"POST", headers, body:ndjson });
            const json = await res.json();
            if (!res.ok) {
              svcErrors += batch.length;
              addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`, "error");
            } else {
              const failedItems = json.items?.filter(i => i.create?.error || i.index?.error) || [];
              const conflictItems = failedItems.filter(i => (i.create?.error?.type || i.index?.error?.type) === "version_conflict_engine_exception");
              const realErrors = failedItems.filter(i => (i.create?.error?.type || i.index?.error?.type) !== "version_conflict_engine_exception");
              const conflicts = conflictItems.length;
              const errs = realErrors.length;
              svcErrors += errs;
              svcSent += batch.length - errs - conflicts;
              if (errs > 0) {
                const firstErr = realErrors[0]?.create?.error || realErrors[0]?.index?.error;
                addLog(`  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`, "warn");
              } else if (conflicts > 0) {
                addLog(`  ↷ batch ${batchNum}: ${batch.length - conflicts} indexed, ${conflicts} skipped (already exists)`, "ok");
              } else {
                addLog(`  ✓ batch ${batchNum}: ${batch.length} indexed`, "ok");
              }
            }
          } catch(e) {
            svcErrors += batch.length;
            addLog(`  ✗ network error: ${e.message}`, "error");
          }
          setProgress({ sent: totalSent + svcSent, total: totalActual, errors: totalErrors + svcErrors });
          if (batchDelayMs > 0) await new Promise(r => setTimeout(r, batchDelayMs));
        }
        addLog(`✓ ${svc} complete`, "ok");
        return { sent: svcSent, errors: svcErrors };
      };

      for (const svc of activeServices) {
        if (abortRef.current) break;
        const { sent, errors } = await shipService(svc);
        totalSent += sent;
        totalErrors += errors;
      }

      // ── Anomaly injection pass (logs / metrics) ──────────────────────────
      if (injectAnomalies && !abortRef.current) {
        addLog("⚡ Anomaly injection pass — shipping spike events at current time…", "info");
        const injCount = Math.max(50, Math.round(logsPerService * 0.3));
        const injEnd   = new Date();
        const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
        for (const svc of activeServices) {
          if (abortRef.current) break;
          const dataset = eventType === "metrics"
            ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
            : (ELASTIC_DATASET_MAP[svc] || `aws.${svc}`);
          const dsPrefix  = dataset === "aws.xray" ? "traces-aws" : indexPrefix;
          const indexName = `${dsPrefix}.${dataset.replace(/^aws\./, "")}-default`;
          const isDimensional = eventType === "metrics" && METRICS_GENERATORS[svc];
          let injDocs;
          if (isDimensional) {
            injDocs = Array.from({ length: injCount }, () => {
              const docs = METRICS_GENERATORS[svc](randTs(injStart, injEnd), 1.0);
              return (Array.isArray(docs) ? docs : [docs]).map(d => {
                const out = stripNulls(d);
                // Inflate all numeric metric values to create anomalies
                for (const [k, v] of Object.entries(out)) {
                  if (typeof v === "number" && !k.startsWith("@") && k !== "_doc_count") {
                    out[k] = v * 20;
                  }
                }
                return out;
              });
            }).flat();
          } else if (GENERATORS[svc]) {
            injDocs = Array.from({ length: injCount }, () => {
              const result = GENERATORS[svc](randTs(injStart, injEnd), 1.0);
              return (Array.isArray(result) ? result : [stripNulls(enrichDoc(result, svc, getEffectiveSource(svc), eventType))]).map(d => stripNulls(d));
            }).flat();
          } else {
            continue;
          }
          const ndjson = injDocs.flatMap(doc => {
            const { __dataset, ...cleanDoc } = doc;
            const idx = __dataset
              ? __dataset.startsWith("aws.")
                ? `${indexPrefix}.${__dataset.replace(/^aws\./, "")}-default`
                : `logs-${__dataset}-default`
              : indexName;
            return [JSON.stringify({ create:{ _index:idx } }), JSON.stringify(cleanDoc)];
          }).join("\n") + "\n";
          try {
            const res  = await fetch(`/proxy/_bulk`, { method:"POST", headers, body:ndjson });
            const json = await res.json();
            const failedInj = json.items?.filter(it => it.create?.error || it.index?.error) || [];
            const realErrInj = failedInj.filter(it => (it.create?.error?.type || it.index?.error?.type) !== "version_conflict_engine_exception");
            addLog(`  ⚡ ${svc}: ${injDocs.length - failedInj.length} anomaly docs injected${realErrInj.length > 0 ? `, ${realErrInj.length} errors` : ""}`, realErrInj.length > 0 ? "warn" : "ok");
          } catch(e) {
            addLog(`  ✗ anomaly injection network error (${svc}): ${e.message}`, "error");
          }
        }
      }

      setStatus(abortRef.current ? "aborted" : "done");
      addLog(
        abortRef.current ? `Aborted. ${totalSent} shipped.` : `Done! ${totalSent.toLocaleString()} indexed, ${totalErrors} errors.`,
        totalErrors > 0 ? "warn" : "ok"
      );
    } catch(fatal) {
      setStatus("done");
      addLog(`Fatal error: ${fatal.message}`, "error");
      console.error("Ship error:", fatal);
    }
  }, [selectedServices,selectedTraceServices,logsPerService,tracesPerService,errorRate,batchSize,batchDelayMs,elasticUrl,apiKey,indexPrefix,logsIndexPrefix,metricsIndexPrefix,ingestionSource,enrichDoc,getEffectiveSource,eventType,isTracesMode,runConnectionValidation,injectAnomalies]);

  const pct            = progress.total>0 ? Math.round((progress.sent/progress.total)*100) : 0;
  const totalSelected  = isTracesMode ? selectedTraceServices.length : selectedServices.length;
  const totalServices  = isTracesMode ? TRACE_SERVICES.length : eventType === "metrics" ? METRICS_SUPPORTED_SERVICE_IDS.size : ALL_SERVICE_IDS.length;

  // ─── Estimated volume ──────────────────────────────────────────────────────
  const estimatedDocs    = isTracesMode ? totalSelected * tracesPerService : totalSelected * logsPerService;
  const estimatedBatches = totalSelected > 0 ? Math.ceil(estimatedDocs / batchSize) : 0;

  return (
    <div className={styles.root} style={{ background: K.body, color: K.text }}>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <AwsLogo height={26}/>
          <PipelineRoute height={22}/>
          <img src="/elastic-logo.svg" alt="Elastic" height={28} style={{ display:"block" }}/>
          <div className={styles.headerRule}/>
          <span className={styles.headerTitle}>Load Generator</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerSubdued}>{totalSelected} / {totalServices} services</span>
          {status==="running" && <StatusPill color="#FACB3D" dot light>Shipping</StatusPill>}
          {status==="done"    && <StatusPill color="#24C292" light>Complete</StatusPill>}
          {status==="aborted" && <StatusPill color="#EE4C48" light>Aborted</StatusPill>}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageTitleWrap}>
          <h1 className={styles.pageTitle}>
            Generate and ship AWS logs &amp; metrics to Elastic
          </h1>
          <p className={styles.pageDesc}>
            {isTracesMode ? `${totalServices} services with OTel/APM trace support · EDOT instrumentation · Ships to traces-apm-default` : eventType === "metrics" ? `${totalServices} AWS services with Elastic metrics support` : `${totalServices} AWS services across 14 groups`}{isTracesMode ? "" : " · ECS-compliant · Per-service ingestion (S3, CloudWatch, API, Firehose, OTel). Ships directly to Elasticsearch."}
          </p>
        </div>

        <div className={styles.grid}>

          {/* LEFT — Service selection */}
          <div>
            {isTracesMode ? (
              <Card>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span style={{fontSize:13,fontWeight:600,color:K.textHeading}}>Select Trace Services</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <QuickBtn onClick={selectAllTraces}>All</QuickBtn>
                    <QuickBtn onClick={selectNoneTraces}>None</QuickBtn>
                    {totalSelected>0&&(
                      <span style={{fontSize:11,fontWeight:600,color:"#8b5cf6",background:"#8b5cf614",border:"1px solid #8b5cf644",borderRadius:99,padding:"2px 10px"}}>
                        {totalSelected} selected
                      </span>
                    )}
                  </div>
                </div>
                <div style={{fontSize:11,color:K.textSubdued,marginBottom:12,padding:"8px 10px",background:"#8b5cf608",border:"1px solid #8b5cf622",borderRadius:K.radiusSm}}>
                  Traces are generated using <span style={{color:"#8b5cf6",fontWeight:600}}>OpenTelemetry (OTLP)</span> with EDOT instrumentation and shipped to <span style={{color:"#8b5cf6",fontWeight:600}}>traces-apm-default</span>.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {TRACE_SERVICES.map(svc => {
                    const sel = selectedTraceServices.includes(svc.id);
                    return (
                      <button key={svc.id} onClick={()=>toggleTraceService(svc.id)} style={{
                        border:`1.5px solid ${sel?"#8b5cf6":"#e2e8f0"}`,
                        borderRadius:K.radius, padding:"12px 14px",
                        background:sel?"#8b5cf60e":"#f8fafc",
                        cursor:"pointer", textAlign:"left", transition:"all 0.15s",
                        position:"relative", overflow:"hidden",
                      }}>
                        {sel&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"#8b5cf6",borderRadius:"8px 8px 0 0"}}/>}
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {AWS_SERVICE_ICON_MAP[svc.id] ? (
                            <img src={iconSrc(AWS_SERVICE_ICON_MAP[svc.id])} alt="" style={{width:32,height:32,objectFit:"contain"}}/>
                          ) : (
                            <div style={{fontSize:22,minWidth:32,textAlign:"center"}}>⚡</div>
                          )}
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:sel?"#8b5cf6":"#334155",marginBottom:2}}>{svc.label}</div>
                            <div style={{fontSize:11,color:"#64748b",lineHeight:1.4}}>{svc.desc}</div>
                          </div>
                          {sel&&<span style={{marginLeft:"auto",color:"#8b5cf6",fontSize:14,fontWeight:700}}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{marginTop:12,padding:"10px 12px",background:K.subdued,borderRadius:K.radiusSm,border:`1px solid ${K.border}`}}>
                  <div style={{fontSize:11,fontWeight:600,color:K.textHeading,marginBottom:6}}>OTel instrumentation paths</div>
                  <div style={{fontSize:10,color:K.textSubdued,lineHeight:1.6}}>
                    <div><span style={{color:"#8b5cf6",fontWeight:600}}>Lambda</span> — EDOT Lambda layer + OTLP → APM Server</div>
                    <div><span style={{color:"#8b5cf6",fontWeight:600}}>EMR Spark</span> — EDOT Java agent bootstrap action + OTLP → APM Server</div>
                  </div>
                </div>
              </Card>
            ) : (
            <Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:K.textHeading}}>Select Services</span>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <QuickBtn onClick={selectAll}>All {totalServices}</QuickBtn>
                  <QuickBtn onClick={selectNone}>None</QuickBtn>
                  {totalSelected>0&&(
                    <span style={{fontSize:11,fontWeight:600,color:K.success,background:K.successBg,border:`1px solid ${K.successBorder}`,borderRadius:99,padding:"2px 10px"}}>
                      {totalSelected} selected
                    </span>
                  )}
                </div>
              </div>
              {/* Ingestion source legend */}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,padding:"8px 10px",background:K.subdued,borderRadius:K.radiusSm,border:`1px solid ${K.border}`}}>
                <span style={{fontSize:10,color:K.textSubdued,marginRight:4,alignSelf:"center"}}>Ingestion:</span>
                {Object.entries(INGESTION_META).map(([key,m])=>(
                  <span key={key} style={{fontSize:9,fontWeight:600,color:m.color,background:`${m.color}18`,border:`1px solid ${m.color}44`,borderRadius:K.radiusSm,padding:"2px 7px"}}>{m.label}</span>
                ))}
                {ingestionSource!=="default"&&(
                  <span style={{fontSize:9,color:K.warning,marginLeft:4,alignSelf:"center"}}>Override: all using {INGESTION_META[ingestionSource]?.label}</span>
                )}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {SERVICE_GROUPS.map(group => {
                  const groupIds = group.services.map(s=>s.id);
                  const selectableInGroup = eventType === "metrics" ? groupIds.filter(id=>METRICS_SUPPORTED_SERVICE_IDS.has(id)) : groupIds;
                  const selCount = selectableInGroup.filter(id=>selectedServices.includes(id)).length;
                  const allSel = selectableInGroup.length > 0 && selCount === selectableInGroup.length;
                  const someSel = selCount > 0 && !allSel;
                  const collapsed = collapsedGroups[group.id];
                  return (
                    <div key={group.id} style={{border:`1px solid ${allSel?group.color+"88":someSel?group.color+"66":K.border}`,borderRadius:K.radius,overflow:"hidden",background:allSel?`${group.color}12`:someSel?`${group.color}08`:K.plain,transition:"border-color 0.2s",boxShadow:K.shadow}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",userSelect:"none"}} onClick={()=>toggleCollapse(group.id)}>
                        {CATEGORY_ICON_MAP[group.id] ? (
                          <img src={iconSrc(CATEGORY_ICON_MAP[group.id])} alt="" style={{width:22,height:22,objectFit:"contain"}}/>
                        ) : AWS_SERVICE_ICON_MAP[group.services[0]?.id] ? (
                          <img src={iconSrc(AWS_SERVICE_ICON_MAP[group.services[0].id])} alt="" style={{width:18,height:18,objectFit:"contain"}}/>
                        ) : (
                          <span style={{fontSize:14,minWidth:18,color:selCount>0?group.color:K.textSubdued}}>{group.icon}</span>
                        )}
                        <span style={{fontSize:12,fontWeight:600,color:selCount>0?group.color:"#475569",flex:1}}>{group.label}</span>
                        <span style={{fontSize:10,color:K.textSubdued}}>{eventType==="metrics"?`${selectableInGroup.length} metrics` : `${group.services.length} services`}</span>
                        {selCount>0&&(
                          <span style={{fontSize:10,fontWeight:700,color:group.color,background:`${group.color}20`,border:`1px solid ${group.color}44`,borderRadius:99,padding:"1px 8px"}}>{selCount}/{selectableInGroup.length}</span>
                        )}
                        <button onClick={e=>{e.stopPropagation();toggleGroup(group.id);}} style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`1px solid ${group.color}44`,background:allSel?`${group.color}22`:"transparent",color:group.color,cursor:"pointer",fontFamily:"inherit",fontWeight:600,transition:"all 0.15s"}}>
                          {allSel?"Deselect all":"Select all"}
                        </button>
                        <span style={{color:"#94a3b8",fontSize:10,marginLeft:2}}>{collapsed?"▶":"▼"}</span>
                      </div>
                      {!collapsed&&(
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:"0 10px 10px"}}>
                          {group.services.map(svc=>{
                            const sel = selectedServices.includes(svc.id);
                            const metricsDisabled = eventType === "metrics" && !METRICS_SUPPORTED_SERVICE_IDS.has(svc.id);
                            const src = getEffectiveSource(svc.id);
                            const meta = INGESTION_META[src];
                            return (
                              <button key={svc.id} onClick={()=>!metricsDisabled&&toggleService(svc.id)} style={{
                                border:`1px solid ${sel?group.color+"99":metricsDisabled?K.border:K.borderPlain}`,
                                borderRadius:K.radiusSm,padding:"8px",
                                background:sel?`${group.color}18`:metricsDisabled?K.controlDisabled:K.subdued,
                                cursor:metricsDisabled?"not-allowed":"pointer",
                                textAlign:"left",transition:"all 0.15s",position:"relative",overflow:"hidden",
                                opacity:metricsDisabled?0.7:1,
                              }}>
                                {sel&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:group.color,borderRadius:"8px 8px 0 0"}}/>}
                                {AWS_SERVICE_ICON_MAP[svc.id] ? (
                                  <img src={iconSrc(AWS_SERVICE_ICON_MAP[svc.id])} alt="" style={{width:28,height:28,objectFit:"contain"}}/>
                                ) : (
                                  <div style={{fontSize:15,marginBottom:4}}>{svc.icon}</div>
                                )}
                                <div style={{fontSize:11,fontWeight:700,color:sel?group.color:metricsDisabled?"#94a3b8":"#475569",marginBottom:2}}>{svc.label}</div>
                                <div style={{fontSize:10,color:metricsDisabled?"#94a3b8":"#64748b",lineHeight:1.3,marginBottom:5}}>{svc.desc}</div>
                                {metricsDisabled ? <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>No metrics</div> : <div style={{fontSize:10,fontWeight:600,color:meta?.color||"#64748b",background:`${meta?.color||"#64748b"}18`,border:`1px solid ${meta?.color||"#64748b"}44`,borderRadius:4,padding:"1px 5px",display:"inline-block"}}>{meta?.label||src}</div>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
            )}
          </div>

          <div className={styles.rightCol}>

            <Card>
              <CardHeader label="Volume & Settings"/>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div>
                  <div style={{fontSize:12,fontWeight:500,color:K.textSubdued,marginBottom:6}}>Event type</div>
                  <div style={{display:"inline-flex",borderRadius:K.radiusSm,border:`1px solid ${K.border}`,overflow:"hidden",background:K.subdued}}>
                    <button onClick={()=>{ setEventType("logs"); }} style={{
                      padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",
                      background:eventType==="logs"?K.plain:"transparent",color:eventType==="logs"?K.textHeading:K.textSubdued,transition:"all 0.15s",boxShadow:eventType==="logs"?K.shadow:"none",
                    }}>Logs</button>
                    <button onClick={()=>{ setEventType("metrics"); setSelectedServices(prev=>prev.filter(id=>METRICS_SUPPORTED_SERVICE_IDS.has(id))); }} style={{
                      padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",
                      background:eventType==="metrics"?K.plain:"transparent",color:eventType==="metrics"?K.textHeading:K.textSubdued,transition:"all 0.15s",boxShadow:eventType==="metrics"?K.shadow:"none",
                    }}>Metrics</button>
                    <button onClick={()=>{ setEventType("traces"); }} style={{
                      padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",
                      background:isTracesMode?K.plain:"transparent",color:isTracesMode?"#8b5cf6":K.textSubdued,transition:"all 0.15s",boxShadow:isTracesMode?K.shadow:"none",
                    }}>Traces</button>
                  </div>
                  {eventType==="metrics"&&<div style={{fontSize:11,color:K.textSubdued,marginTop:4}}>Only services with metrics in the Elastic AWS integration. Index: metrics-aws.*</div>}
                  {isTracesMode&&<div style={{fontSize:11,color:"#8b5cf6",marginTop:4}}>OTel APM traces for Lambda &amp; EMR Spark. Ships to <strong>traces-apm-default</strong>.</div>}
                </div>
                {isTracesMode ? (
                  <SliderField label="Traces per service" value={tracesPerService} min={10} max={500} step={10}
                    onChange={setTracesPerService} display={`${tracesPerService.toLocaleString()} traces`}
                    sublabel={`~${(totalSelected*tracesPerService).toLocaleString()} traces (each trace = transaction + spans)`}/>
                ) : (
                <SliderField label={eventType==="metrics"?"Metrics per service":"Logs per service"} value={logsPerService} min={50} max={5000} step={50}
                  onChange={setLogsPerService} display={`${logsPerService.toLocaleString()} docs`}
                  sublabel={`${(totalSelected*logsPerService).toLocaleString()} total docs across ${totalSelected} service(s)`}/>
                )}
                <SliderField label="Error rate" value={errorRate} min={0} max={0.5} step={0.01}
                  onChange={v=>setErrorRate(parseFloat(v))} display={`${(errorRate*100).toFixed(0)}%`}
                  sublabel="Percentage generated as errors or failures"/>
                <SliderField label="Bulk batch size" value={batchSize} min={50} max={1000} step={50}
                  onChange={setBatchSize} display={`${batchSize}/request`}
                  sublabel="Documents per Elasticsearch _bulk request"/>
                <SliderField label="Batch delay (ms)" value={batchDelayMs} min={0} max={2000} step={50}
                  onChange={v=>setBatchDelayMs(Number(v))} display={`${batchDelayMs} ms`}
                  sublabel="Delay between bulk requests (0 = minimal)"/>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",padding:"10px 12px",background:injectAnomalies?"#7c3aed11":"transparent",border:`1px solid ${injectAnomalies?"#7c3aed44":K.border}`,borderRadius:K.radiusSm,transition:"all 0.15s"}}>
                  <input
                    type="checkbox"
                    checked={injectAnomalies}
                    onChange={e=>setInjectAnomalies(e.target.checked)}
                    style={{marginTop:2,accentColor:"#7c3aed",width:14,height:14,flexShrink:0}}
                  />
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:injectAnomalies?"#7c3aed":K.text}}>Inject anomalies</div>
                    <div style={{fontSize:11,color:K.textSubdued,marginTop:2}}>After the main run, ship a second spike pass at current time — extreme values that ML anomaly detection jobs will score highly.</div>
                  </div>
                </label>
              </div>
            </Card>

            <Card>
              <CardHeader label="Elastic Cloud Connection"/>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <Field label="Elasticsearch URL">
                  <input
                    value={elasticUrl}
                    onChange={e=>{ setElasticUrl(e.target.value); setValidationErrors(prev=>({...prev, elasticUrl: ""})); }}
                    onBlur={()=> setValidationErrors(prev=>({...prev, elasticUrl: validateElasticUrl(elasticUrl).valid ? "" : (validateElasticUrl(elasticUrl).message ?? "") }))}
                    placeholder="https://my-deployment.es.us-east-1.aws.elastic.cloud"
                    className={`${styles.input} ${validationErrors.elasticUrl ? styles.inputError : ""}`}
                  />
                  {validationErrors.elasticUrl && <div className={styles.validationError}>{validationErrors.elasticUrl}</div>}
                </Field>
                <Field label="API Key">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e=>{ setApiKey(e.target.value); setValidationErrors(prev=>({...prev, apiKey: ""})); }}
                    onBlur={()=> setValidationErrors(prev=>({...prev, apiKey: validateApiKey(apiKey).valid ? "" : (validateApiKey(apiKey).message ?? "") }))}
                    placeholder="base64-encoded-api-key"
                    className={`${styles.input} ${validationErrors.apiKey ? styles.inputError : ""}`}
                  />
                  {validationErrors.apiKey && <div className={styles.validationError}>{validationErrors.apiKey}</div>}
                </Field>
                {!isTracesMode && (
                <Field label="Index prefix">
                  <input
                    value={indexPrefix}
                    onChange={e=>{ setIndexPrefix(e.target.value); setValidationErrors(prev=>({...prev, indexPrefix: ""})); }}
                    onBlur={()=> setValidationErrors(prev=>({...prev, indexPrefix: validateIndexPrefix(indexPrefix).valid ? "" : (validateIndexPrefix(indexPrefix).message ?? "") }))}
                    placeholder="logs-aws"
                    className={`${styles.input} ${validationErrors.indexPrefix ? styles.inputError : ""}`}
                  />
                  {validationErrors.indexPrefix && <div className={styles.validationError}>{validationErrors.indexPrefix}</div>}
                  <div style={{fontSize:11,color:K.textSubdued,marginTop:5}}>
                    e.g. <span style={{color:K.primaryText}}>{indexPrefix}.lambda-default</span>, <span style={{color:K.primaryText}}>{indexPrefix}.vpcflow-default</span>…
                  </div>
                </Field>
                )}
                {isTracesMode && (
                <Field label="APM index">
                  <div style={{padding:"8px 12px",background:K.subdued,borderRadius:K.radiusSm,border:`1px solid #8b5cf633`,fontSize:12,fontWeight:600,color:"#8b5cf6"}}>
                    traces-apm-default
                  </div>
                  <div style={{fontSize:11,color:K.textSubdued,marginTop:5}}>Fixed APM data stream — requires Elastic APM Server or Fleet integration.</div>
                </Field>
                )}
                {!isTracesMode && (
                <Field label="Ingestion source">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                    <button onClick={()=>setIngestionSource("default")} style={{
                      gridColumn:"1/-1",
                      padding:"8px 12px",borderRadius:K.radiusSm,fontSize:11,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${ingestionSource==="default"?K.success:K.border}`,
                      background:ingestionSource==="default"?K.successBg:K.subdued,
                      color:ingestionSource==="default"?K.success:K.textSubdued,
                      transition:"all 0.15s",display:"flex",alignItems:"center",gap:8,textAlign:"left",
                    }}>
                      <span style={{fontSize:14}}>⚙</span>
                      <div>
                        <div>Default (per-service)</div>
                        <div style={{fontSize:9,fontWeight:400,opacity:0.7,marginTop:1}}>S3 · CloudWatch · API · Firehose — each service uses its real-world default</div>
                      </div>
                      {ingestionSource==="default" && <span style={{marginLeft:"auto",fontSize:11}}>✓</span>}
                    </button>
                  </div>
                  <div style={{fontSize:11,color:K.textSubdued,marginBottom:6,fontWeight:500}}>Override all services:</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    {[
                      ["s3",         "S3 Bucket",    "#FF9900"],
                      ["cloudwatch", "CloudWatch",   "#1BA9F5"],
                      ["firehose",   "Firehose",     "#F04E98"],
                      ["api",        "API",          "#00BFB3"],
                      ["otel",       "OTel",         "#93C90E"],
                      ["agent",      "Elastic Agent","#a78bfa"],
                    ].map(([val,lbl,col]) => (
                      <button key={val} onClick={()=>setIngestionSource(val)} style={{
                        padding:"7px 6px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                        border:`1.5px solid ${ingestionSource===val?col:col+"33"}`,
                        background:ingestionSource===val?`${col}22`:"#f8fafc",
                        color:ingestionSource===val?col:col+"cc",transition:"all 0.15s",
                      }}>{lbl}</button>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:K.textSubdued,marginTop:8,padding:"8px 10px",background:K.subdued,borderRadius:K.radiusSm,border:`1px solid ${K.border}`}}>
                    {ingestionSource==="default" ? (
                      <span>Each service uses its correct real-world ingestion method. Badges on service cards show the source.</span>
                    ) : {
                      s3:         <><span style={{color:"#FF9900"}}>aws-s3</span> · All services read from S3 bucket via SQS notifications</>,
                      cloudwatch: <><span style={{color:"#1BA9F5"}}>aws-cloudwatch</span> · All services polled from CloudWatch log groups</>,
                      firehose:   <><span style={{color:"#F04E98"}}>aws-firehose</span> · All services pushed via Firehose delivery stream</>,
                      api:        <><span style={{color:"#00BFB3"}}>http_endpoint</span> · All services via direct REST API ingestion</>,
                      otel:       <><span style={{color:"#93C90E"}}>opentelemetry</span> · All services via OTLP collector (telemetry.sdk fields added)</>,
                      agent:      <><span style={{color:"#a78bfa"}}>logfile</span> · All services collected by Elastic Agent from log files</>,
                    }[ingestionSource]}
                  </div>
                </Field>
                )}
                <button type="button" onClick={clearSavedConfig} className={styles.clearConfigBtn}>
                  Clear saved config
                </button>
              </div>
            </Card>

            <div className={styles.actionsRow}>
              <button type="button" onClick={generatePreview} style={{ flex: "0 0 auto" }} className={styles.btnSecondary}>Preview doc</button>
              {status==="running"
                ? <button type="button" onClick={()=>{abortRef.current=true;}} style={{ flex: 1 }} className={styles.btnDanger}>Stop shipping</button>
                : <button type="button" onClick={ship} disabled={!totalSelected||!elasticUrl||!apiKey||!!(validationErrors.elasticUrl||validationErrors.apiKey||(!isTracesMode&&validationErrors.indexPrefix))} style={{ flex: 1, opacity: (totalSelected&&elasticUrl&&apiKey&&!(validationErrors.elasticUrl||validationErrors.apiKey||(!isTracesMode&&validationErrors.indexPrefix))) ? 1 : 0.5, cursor: (totalSelected&&elasticUrl&&apiKey&&!(validationErrors.elasticUrl||validationErrors.apiKey||(!isTracesMode&&validationErrors.indexPrefix))) ? "pointer" : "not-allowed" }} className={styles.btnPrimary}>
                    ⚡ Ship {totalSelected>0 ? isTracesMode ? `${(totalSelected*tracesPerService).toLocaleString()} traces` : `${(totalSelected*logsPerService).toLocaleString()} ${eventType==="metrics"?"metrics":"logs"}` : isTracesMode ? "traces" : eventType==="metrics"?"metrics":"logs"}
                  </button>}
            </div>
            {totalSelected > 0 && (
              <div className={styles.costEstimate}>
                {isTracesMode
                  ? `~${estimatedDocs.toLocaleString()} traces across ${totalSelected} service${totalSelected!==1?"s":""} (each trace = transaction + spans)`
                  : eventType === "metrics"
                    ? `~${estimatedDocs.toLocaleString()} calls across ${totalSelected} service${totalSelected!==1?"s":""} — actual doc count varies by service (dimensional metrics generate multiple docs per call)`
                    : `~${estimatedDocs.toLocaleString()} documents across ${totalSelected} service${totalSelected!==1?"s":""} (${estimatedBatches} batch${estimatedBatches!==1?"es":""})`
                }
              </div>
            )}

            {status&&(
              <Card>
                <CardHeader label="Progress" badge={`${pct}%`} badgeColor={pct===100?K.success:K.warning}/>
                <div style={{height:6,background:K.border,borderRadius:99,overflow:"hidden",marginBottom:12}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct===100?K.success:K.primary,borderRadius:99,transition:"width 0.3s"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <StatCard label="Indexed" value={progress.sent.toLocaleString()} color={K.success}/>
                  <StatCard label="Total"   value={progress.total.toLocaleString()} color={K.textSubdued}/>
                  <StatCard label="Errors"  value={progress.errors.toLocaleString()} color={progress.errors>0?K.danger:K.textSubdued}/>
                </div>
              </Card>
            )}

            {preview&&(
              <Card>
                <CardHeader label="Sample Document"/>
                <pre className={styles.previewPre}>{preview}</pre>
              </Card>
            )}

            <Card>
              <CardHeader label="Activity Log">
                {log.length > 0 && (
                  <QuickBtn onClick={downloadLog}>↓ Download</QuickBtn>
                )}
              </CardHeader>
              <div className={styles.logBox}>
                {log.length===0
                  ? <span style={{color:K.textSubdued,fontStyle:"italic"}}>Waiting for activity…</span>
                  : log.map((e,i)=>(
                    <div key={i} style={{color:{ok:K.success,error:K.danger,warn:K.warning,info:K.textSubdued}[e.type]||K.textSubdued}}>
                      <span style={{color:K.textSubdued}}>[{e.ts}] </span>{e.msg}
                    </div>
                  ))}
              </div>
            </Card>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html:`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body { font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        input::placeholder { color: #516381 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F6F9FC; }
        ::-webkit-scrollbar-thumb { background: #CAD3E2; border-radius: 99px; }
        input:focus { outline: none !important; border-color: #0B64DD !important; box-shadow: 0 0 0 2px rgba(11,100,221,0.2) !important; }
        button { transition: background 0.15s, border-color 0.15s; }
        button:not(:disabled):hover { background-color: rgba(23,80,186,0.04); }
        button:not(:disabled):active { opacity: 0.9; }
        input[type=range] { -webkit-appearance:none; height:6px; border-radius:99px; background:#E3E8F2; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#0B64DD; cursor:pointer; border:2px solid #0B64DD; }
      `}}/>
    </div>
  );
}

// Inline styles still used where dynamic (e.g. group.color, K.*) — see App.module.css for shared classes
