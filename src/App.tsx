import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import K from "./theme";
import {
  rand,
  randIp,
  randId,
  randAccount,
  randTs,
  REGIONS,
  USER_AGENTS,
  HTTP_PATHS,
  stripNulls,
} from "./helpers";
import { GENERATORS } from "./generators";
import { TRACE_SERVICES } from "./generators/traces/services";
import { ServiceGrid } from "./components/ServiceGrid";

// Lazy-load heavy generator chunks — only downloaded on first use (logs mode = no download).
// The browser module cache ensures each chunk is fetched at most once per session.
const loadMetricsGenerators = () =>
  import("./generators/metrics").then((m) => m.METRICS_GENERATORS);
const loadTraceGenerators = () => import("./generators/traces").then((m) => m.TRACE_GENERATORS);
import {
  ELASTIC_DATASET_MAP,
  ELASTIC_METRICS_DATASET_MAP,
  METRICS_SUPPORTED_SERVICE_IDS,
} from "./data/elasticMaps";
import { SERVICE_INGESTION_DEFAULTS, INGESTION_META } from "./data/ingestion";
import { AWS_SERVICE_ICON_MAP, TRACE_SERVICE_ICON_MAP, iconSrc } from "./data/iconMap";
import { SERVICE_GROUPS, ALL_SERVICE_IDS } from "./data/serviceGroups";
import { Card, CardHeader, QuickBtn, Field, SliderField, StatCard } from "./components/Card";
import { StatusPill } from "./components/StatusPill";
import { AwsLogo, PipelineRoute } from "./components/Logo";
import { validateElasticUrl, validateApiKey, validateIndexPrefix } from "./utils/validation";
import { loadAndScrubSavedConfig, toPersistedStorageObject } from "./utils/persistedConfig";
import styles from "./App.module.css";

type LogEntry = { id: number; msg: string; type: string; ts: string };
type ShipStatus = "running" | "done" | "aborted" | null;
type ShipProgressPhase = "main" | "injection";
type ShipProgress = { sent: number; total: number; errors: number; phase: ShipProgressPhase };
/** Generator / enrich output — intentionally loose (ECS-shaped JSON). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ECS docs are dynamic per service
type LooseDoc = Record<string, any>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── localStorage config persistence ─────────────────────────────────────────
const LS_KEY = "awsElasticConfig";
const savedConfig = loadAndScrubSavedConfig(LS_KEY);

export default function App() {
  const [selectedServices, setSelectedServices] = useState(["lambda", "apigateway"]);
  const [selectedTraceServices, setSelectedTraceServices] = useState(["lambda", "emr"]);
  const [logsPerService, setLogsPerService] = useState(savedConfig.logsPerService ?? 500);
  const [tracesPerService, setTracesPerService] = useState(savedConfig.tracesPerService ?? 100);
  const [errorRate, setErrorRate] = useState(savedConfig.errorRate ?? 0.05);
  const [batchSize, setBatchSize] = useState(savedConfig.batchSize ?? 250);
  const [elasticUrl, setElasticUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [logsIndexPrefix, setLogsIndexPrefix] = useState(savedConfig.logsIndexPrefix ?? "logs-aws");
  const [metricsIndexPrefix, setMetricsIndexPrefix] = useState(
    savedConfig.metricsIndexPrefix ?? "metrics-aws"
  );
  const [eventType, setEventType] = useState(savedConfig.eventType ?? "logs");
  const [ingestionSource, setIngestionSource] = useState(savedConfig.ingestionSource ?? "default");
  const [batchDelayMs, setBatchDelayMs] = useState(savedConfig.batchDelayMs ?? 20);
  const [injectAnomalies, setInjectAnomalies] = useState(savedConfig.injectAnomalies ?? false);
  const [scheduleEnabled, setScheduleEnabled] = useState(savedConfig.scheduleEnabled ?? false);
  const [scheduleTotalRuns, setScheduleTotalRuns] = useState(savedConfig.scheduleTotalRuns ?? 12);
  const [scheduleIntervalMin, setScheduleIntervalMin] = useState(
    savedConfig.scheduleIntervalMin ?? 15
  );
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleCurrentRun, setScheduleCurrentRun] = useState(0);
  const [nextRunAt, setNextRunAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [validationErrors, setValidationErrors] = useState({
    elasticUrl: "",
    apiKey: "",
    indexPrefix: "",
  });

  const isTracesMode = eventType === "traces";
  const indexPrefix = eventType === "metrics" ? metricsIndexPrefix : logsIndexPrefix;
  const setIndexPrefix = eventType === "metrics" ? setMetricsIndexPrefix : setLogsIndexPrefix;

  const [status, setStatus] = useState<ShipStatus>(null);
  const [progress, setProgress] = useState<ShipProgress>({
    sent: 0,
    total: 0,
    errors: 0,
    phase: "main",
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const abortRef = useRef(false);
  const scheduleLoopRef = useRef<AbortController | null>(null);
  const logSeqRef = useRef(0);

  const traceServiceGroups = useMemo(() => {
    const order = ["Multi-Service Workflow", "Data Pipeline", "Single-Service"];
    const m = new Map<string, (typeof TRACE_SERVICES)[number][]>();
    for (const s of TRACE_SERVICES) {
      const g = s.group;
      const list = m.get(g) ?? [];
      list.push(s);
      m.set(g, list);
    }
    const tail = [...m.keys()].filter((g) => !order.includes(g));
    return [...order.filter((g) => m.has(g)), ...tail].map((title) => ({
      title,
      items: m.get(title)!,
    }));
  }, []);

  // ─── Persist config to localStorage (allowlisted keys only — no URL/API key) ─
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify(
          toPersistedStorageObject({
            logsIndexPrefix,
            metricsIndexPrefix,
            logsPerService,
            tracesPerService,
            errorRate,
            batchSize,
            batchDelayMs,
            ingestionSource,
            eventType,
            injectAnomalies,
            scheduleEnabled,
            scheduleTotalRuns,
            scheduleIntervalMin,
          })
        )
      );
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[LS] Failed to save config:", e);
    }
  }, [
    logsIndexPrefix,
    metricsIndexPrefix,
    logsPerService,
    tracesPerService,
    errorRate,
    batchSize,
    batchDelayMs,
    ingestionSource,
    eventType,
    injectAnomalies,
    scheduleEnabled,
    scheduleTotalRuns,
    scheduleIntervalMin,
  ]);

  const clearSavedConfig = () => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
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
    setScheduleEnabled(false);
    setScheduleTotalRuns(12);
    setScheduleIntervalMin(15);
  };

  // ─── Scheduled mode countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!nextRunAt) {
      setCountdown(0);
      return;
    }
    const tick = () =>
      setCountdown(Math.max(0, Math.ceil((nextRunAt.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRunAt]);

  const toggleTraceService = (id) => {
    setSelectedTraceServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };
  const selectAllTraces = () => setSelectedTraceServices(TRACE_SERVICES.map((s) => s.id));
  const selectNoneTraces = () => setSelectedTraceServices([]);

  const addLog = (msg: string, type = "info") =>
    setLog((prev) => [
      ...prev.slice(-5000),
      {
        id: logSeqRef.current++,
        msg,
        type,
        ts: new Date().toLocaleTimeString(),
      },
    ]);

  const downloadLog = () => {
    const lines = log
      .map((e) => `[${e.ts}] [${e.type.toUpperCase().padEnd(5)}] ${e.msg}`)
      .join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `load-generator-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleService = useCallback(
    (id: string) => {
      if (
        eventType === "metrics" &&
        !METRICS_SUPPORTED_SERVICE_IDS.has(id) &&
        !selectedServices.includes(id)
      )
        return;
      setSelectedServices((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
      );
    },
    [eventType, selectedServices]
  );

  const toggleGroup = useCallback(
    (gid: string) => {
      const grp = SERVICE_GROUPS.find((g) => g.id === gid);
      if (!grp) return;
      const groupIds = grp.services.map((s) => s.id);
      const selectableIds =
        eventType === "metrics"
          ? groupIds.filter((id) => METRICS_SUPPORTED_SERVICE_IDS.has(id))
          : groupIds;
      const allSel =
        selectableIds.length > 0 && selectableIds.every((id) => selectedServices.includes(id));
      setSelectedServices((prev) =>
        allSel
          ? prev.filter((id) => !groupIds.includes(id))
          : [...new Set([...prev, ...selectableIds])]
      );
    },
    [eventType, selectedServices]
  );

  const selectAll = useCallback(
    () =>
      setSelectedServices(
        eventType === "metrics"
          ? ALL_SERVICE_IDS.filter((id) => METRICS_SUPPORTED_SERVICE_IDS.has(id))
          : [...ALL_SERVICE_IDS]
      ),
    [eventType]
  );
  const selectNone = useCallback(() => setSelectedServices([]), []);
  const toggleCollapse = useCallback(
    (gid: string) => setCollapsedGroups((prev) => ({ ...prev, [gid]: !prev[gid] })),
    []
  );

  const getEffectiveSource = useCallback(
    (svcId) => {
      if (ingestionSource !== "default") return ingestionSource;
      return SERVICE_INGESTION_DEFAULTS[svcId] || "cloudwatch";
    },
    [ingestionSource]
  );

  const enrichDoc = useCallback(
    (doc: LooseDoc, svc: string, source: string, evType: string): LooseDoc => {
      const region = doc.cloud?.region || rand(REGIONS);
      const accountId = doc.cloud?.account?.id || randAccount().id;
      const dataset =
        evType === "metrics"
          ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
          : ELASTIC_DATASET_MAP[svc] || `aws.${svc}`;
      const bucket = `aws-${svc}-logs-${accountId}`;
      const key = `AWSLogs/${accountId}/${svc}/${region}/${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}/${svc}_${randId(20)}.log.gz`;
      const logGroup = `/aws/${svc}/logs`;
      const logStream = `${region}/${randId(8).toLowerCase()}`;

      const inputTypeMap = {
        s3: "aws-s3",
        cloudwatch: "aws-cloudwatch",
        firehose: "aws-firehose",
        api: "http_endpoint",
        otel: "opentelemetry",
        agent: "logfile",
      };

      const agentMeta =
        source === "agent"
          ? {
              type: "elastic-agent",
              version: "8.17.0",
              name: `elastic-agent-${region}`,
              id: randId(36).toLowerCase(),
            }
          : source === "otel"
            ? { type: "otel", version: "0.115.0", name: `otel-collector-${region}` }
            : { type: "filebeat", version: "8.17.0", name: `filebeat-aws-${region}` };

      const otelFields =
        source === "otel"
          ? {
              telemetry: {
                sdk: { name: "opentelemetry", language: "go", version: "1.31.0" },
                distro: { name: "elastic", version: "8.17.0" },
              },
            }
          : {};

      const firehoseFields =
        source === "firehose"
          ? {
              aws: {
                ...doc.aws,
                s3: { bucket: { name: bucket, arn: `arn:aws:s3:::${bucket}` }, object: { key } },
                cloudwatch: {
                  log_group: logGroup,
                  log_stream: logStream,
                  ingestion_time: new Date().toISOString(),
                },
                firehose: {
                  arn: `arn:aws:firehose:${region}:${accountId}:deliverystream/aws-${svc}-stream`,
                  request_id: randId(36).toLowerCase(),
                },
              },
            }
          : {
              aws: {
                ...doc.aws,
                s3: { bucket: { name: bucket, arn: `arn:aws:s3:::${bucket}` }, object: { key } },
                cloudwatch: {
                  log_group: logGroup,
                  log_stream: logStream,
                  ingestion_time: new Date().toISOString(),
                },
              },
            };

      const ecsBaseline: LooseDoc = {};
      if (!doc.network?.transport && !doc.network?.bytes)
        ecsBaseline.network = {
          ...doc.network,
          transport: "tcp",
          direction: rand(["inbound", "outbound"]),
        };
      if (!doc.host?.name)
        ecsBaseline.host = {
          ...doc.host,
          name: `ip-${randIp().replace(/\./g, "-")}.ec2.internal`,
          hostname: `${svc}-${randId(8).toLowerCase()}`,
        };
      if (!doc.process?.name) ecsBaseline.process = { ...doc.process, name: svc };
      if (!doc.user_agent?.original)
        ecsBaseline.user_agent = { ...doc.user_agent, original: rand(USER_AGENTS) };
      if (!doc.url?.path && !doc.url?.domain)
        ecsBaseline.url = {
          ...doc.url,
          path: rand(HTTP_PATHS),
          domain: `${svc}.${region}.amazonaws.com`,
        };
      if (doc.event?.outcome === "failure" && !doc.error?.message)
        ecsBaseline.error = {
          ...doc.error,
          message: (typeof doc.message === "string" ? doc.message : null) || "Operation failed",
          type: "service",
        };
      if (!doc.user?.name && !doc.user?.id) ecsBaseline.user = { ...doc.user, name: "system" };
      if (!doc.service?.name)
        ecsBaseline.service = { ...doc.service, name: svc, type: doc.service?.type ?? "aws" };
      if (!doc.file?.path && !doc.file?.name && (doc.event?.category === "file" || doc.db))
        ecsBaseline.file = { ...doc.file, path: `/var/log/aws/${svc}.log`, name: `${svc}.log` };

      const eventCategory = doc.event?.category || "event";
      const isMetrics = evType === "metrics";
      const base: LooseDoc = {
        ...doc,
        ...ecsBaseline,
        ...firehoseFields,
        ...otelFields,
        data_stream: {
          type: isMetrics ? "metrics" : svc === "xray" ? "traces" : "logs",
          dataset,
          namespace: "default",
        },
        agent: agentMeta,
        event: { ...doc.event, module: "aws", dataset, category: eventCategory },
        input: { type: inputTypeMap[source] },
        log: doc.log ? { ...doc.log, level: doc.log.level || "info" } : { level: "info" },
      };
      if (isMetrics) base.metricset = { name: "cloudwatch", period: 300000 };
      if (base.message == null) base.message = `AWS ${svc} event`;
      return base;
    },
    []
  );

  const generatePreview = async () => {
    if (isTracesMode) {
      if (!selectedTraceServices.length) return;
      const svc = rand(selectedTraceServices);
      const TRACE_GENERATORS = await loadTraceGenerators();
      const traceDocs = TRACE_GENERATORS[svc](new Date().toISOString(), errorRate);
      setPreview(JSON.stringify(stripNulls(traceDocs[0]), null, 2));
    } else {
      if (!selectedServices.length) return;
      const svc = rand(selectedServices);
      if (eventType === "metrics") {
        const METRICS_GENERATORS = await loadMetricsGenerators();
        if (METRICS_GENERATORS[svc]) {
          const docs = METRICS_GENERATORS[svc](new Date().toISOString(), errorRate);
          setPreview(JSON.stringify(stripNulls(docs[0]), null, 2));
          return;
        }
      }
      const result = GENERATORS[svc](new Date().toISOString(), errorRate);
      if (Array.isArray(result)) {
        const row = stripNulls(result[0]) as LooseDoc;
        const { __dataset: _omitDataset, ...cleanDoc } = row;
        setPreview(JSON.stringify(cleanDoc, null, 2));
      } else {
        setPreview(
          JSON.stringify(
            stripNulls(enrichDoc(result as LooseDoc, svc, getEffectiveSource(svc), eventType)),
            null,
            2
          )
        );
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
    if (!activeServices.length) {
      addLog("No services selected", "error");
      return;
    }
    if (!runConnectionValidation()) {
      addLog("Fix connection field errors before shipping.", "error");
      return;
    }
    abortRef.current = false;

    // Run up to CONCURRENCY service shippers in parallel. Workers pull from a shared
    // index so fast services don't block behind slow ones.
    const CONCURRENCY = 4;
    const runPool = async <T,>(
      items: string[],
      task: (item: string, index: number) => Promise<T>
    ): Promise<T[]> => {
      const results: T[] = new Array(items.length);
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          if (abortRef.current) return;
          const i = next++;
          results[i] = await task(items[i], i);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
      return results;
    };
    setStatus("running");
    setLog([]);
    // Throttle progress bar updates — accumulate deltas and flush at most every 120 ms.
    // Each service worker has its own accumulator; React batches the resulting setState calls.
    const makeProgressFlusher = (phase: ShipProgressPhase) => {
      let pendingSent = 0,
        pendingErrs = 0,
        lastFlush = 0;
      const flush = (force = false) => {
        const now = Date.now();
        if (!force && now - lastFlush < 120) return;
        if (pendingSent === 0 && pendingErrs === 0) return;
        const s = pendingSent,
          e = pendingErrs;
        pendingSent = 0;
        pendingErrs = 0;
        lastFlush = now;
        setProgress((prev) => ({
          ...prev,
          phase,
          sent: prev.sent + s,
          errors: prev.errors + e,
        }));
      };
      return {
        add: (sent: number, errs: number) => {
          pendingSent += sent;
          pendingErrs += errs;
          flush();
        },
        done: () => flush(true),
      };
    };
    try {
      const url = elasticUrl.replace(/\/$/, "");
      const headers = {
        "Content-Type": "application/x-ndjson",
        "x-elastic-url": url,
        "x-elastic-key": apiKey,
      };
      const endDate = new Date();
      // Metrics mode uses a 2-hour window: TSDS data streams only accept documents within
      // their writable range (~2h look-back by default on Elastic Cloud). Millisecond-precision
      // timestamps from randTs make dimension+timestamp collisions effectively impossible.
      // Logs and traces stay at 30 minutes — their IDs are not timestamp-derived.
      const windowMs = eventType === "metrics" ? 2 * 3600 * 1000 : 1800000;
      const startDate = new Date(endDate.getTime() - windowMs);

      /** ── Traces mode: each "trace" = 1 transaction + N spans ─────────────── */
      if (isTracesMode) {
        const TRACE_GENERATORS = await loadTraceGenerators();
        const APM_INDEX = "traces-apm-default";
        const totalTraces = activeServices.length * tracesPerService;
        setProgress({ sent: 0, total: totalTraces, errors: 0, phase: "main" });
        addLog(
          `Starting: ${totalTraces.toLocaleString()} traces across ${activeServices.length} service(s) → ${APM_INDEX}`
        );
        let totalSent = 0,
          totalErrors = 0;

        const shipTraceService = async (svc: string, _svcIndex: number) => {
          addLog(`▶ ${svc} → ${APM_INDEX} [OTel / OTLP]`, "info");
          const traceChunks = Array.from({ length: tracesPerService }, () =>
            TRACE_GENERATORS[svc](randTs(startDate, endDate), errorRate).map((d) => stripNulls(d))
          );
          const prefixEnd: number[] = [];
          let acc = 0;
          for (const ch of traceChunks) {
            acc += ch.length;
            prefixEnd.push(acc);
          }
          const allDocs = traceChunks.flat();
          const progress = makeProgressFlusher("main");
          let svcSent = 0,
            svcErrors = 0,
            batchNum = 0,
            lastReportedTraces = 0;
          for (let i = 0; i < allDocs.length; i += batchSize) {
            if (abortRef.current) break;
            batchNum++;
            const batch = allDocs.slice(i, i + batchSize);
            const apmMeta = JSON.stringify({ create: { _index: APM_INDEX } });
            let ndjson = "";
            for (const doc of batch) {
              ndjson += apmMeta + "\n" + JSON.stringify(doc) + "\n";
            }
            let errDelta = 0;
            try {
              const res = await fetch(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
              const json = await res.json();
              if (!res.ok) {
                svcErrors += batch.length;
                errDelta = batch.length;
                addLog(
                  `  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`,
                  "error"
                );
              } else {
                const failedItems =
                  json.items?.filter((it) => it.create?.error || it.index?.error) || [];
                const errs = failedItems.length;
                svcErrors += errs;
                errDelta = errs;
                svcSent += batch.length - errs;
                if (errs > 0) {
                  const firstErr = failedItems[0]?.create?.error || failedItems[0]?.index?.error;
                  addLog(
                    `  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`,
                    "warn"
                  );
                } else {
                  addLog(`  ✓ batch ${batchNum}: ${batch.length} span docs indexed`, "ok");
                }
              }
            } catch (e: unknown) {
              svcErrors += batch.length;
              errDelta = batch.length;
              addLog(`  ✗ network error: ${errMsg(e)}`, "error");
            }
            let tComplete = 0;
            while (tComplete < prefixEnd.length && prefixEnd[tComplete] <= svcSent) {
              tComplete++;
            }
            const currentTraces = Math.min(tracesPerService, tComplete);
            const sentDelta = currentTraces - lastReportedTraces;
            lastReportedTraces = currentTraces;
            progress.add(sentDelta, errDelta);
            if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
          }
          progress.done();
          addLog(`✓ ${svc} complete (${svcSent} span docs for ${tracesPerService} traces)`, "ok");
          return { sent: tracesPerService, errors: svcErrors > 0 ? 1 : 0 };
        };

        const traceResults = await runPool(activeServices, shipTraceService);
        for (const r of traceResults) {
          if (r) {
            totalSent += r.sent;
            totalErrors += r.errors;
          }
        }

        // ── Anomaly injection pass (traces) ────────────────────────────────
        if (injectAnomalies && !abortRef.current) {
          addLog("⚡ Anomaly injection pass — shipping spike traces at current time…", "info");
          const injCount = Math.max(50, Math.round(tracesPerService * 0.3));
          const injEnd = new Date();
          const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
          const injWork: { svc: string; docs: LooseDoc[] }[] = [];
          for (const svc of activeServices) {
            if (!TRACE_GENERATORS[svc]) continue;
            const docs = Array.from({ length: injCount }, () =>
              TRACE_GENERATORS[svc](randTs(injStart, injEnd), 1.0).map((d) => {
                const out = stripNulls(d) as LooseDoc;
                if (out["transaction.duration.us"]) out["transaction.duration.us"] *= 15;
                if (out["span.duration.us"]) out["span.duration.us"] *= 15;
                return out;
              })
            ).flat();
            injWork.push({ svc, docs });
          }
          const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
          if (injWork.length > 0) {
            setProgress({
              phase: "injection",
              sent: 0,
              total: Math.max(1, injTotalDocs),
              errors: 0,
            });
            const injFlush = makeProgressFlusher("injection");
            for (const { svc, docs: injDocs } of injWork) {
              if (abortRef.current) break;
              let injIndexed = 0,
                injErrs = 0;
              for (let i = 0; i < injDocs.length; i += batchSize) {
                if (abortRef.current) break;
                const batch = injDocs.slice(i, i + batchSize);
                const apmMetaInj = JSON.stringify({ create: { _index: APM_INDEX } });
                let ndjsonInj = "";
                for (const doc of batch) {
                  ndjsonInj += apmMetaInj + "\n" + JSON.stringify(doc) + "\n";
                }
                let sentDelta = 0;
                let errDelta = 0;
                try {
                  const res = await fetch(`/proxy/_bulk`, {
                    method: "POST",
                    headers,
                    body: ndjsonInj,
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    injErrs += batch.length;
                    errDelta = batch.length;
                    addLog(
                      `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                      "error"
                    );
                  } else {
                    const bErrs =
                      json.items?.filter((it) => it.create?.error || it.index?.error).length ?? 0;
                    injIndexed += batch.length - bErrs;
                    injErrs += bErrs;
                    sentDelta = batch.length - bErrs;
                    errDelta = bErrs;
                  }
                } catch (e: unknown) {
                  addLog(`  ✗ anomaly injection network error (${svc}): ${errMsg(e)}`, "error");
                  injErrs += batch.length;
                  errDelta = batch.length;
                }
                injFlush.add(sentDelta, errDelta);
              }
              injFlush.done();
              addLog(
                `  ⚡ ${svc}: ${injIndexed} anomaly trace docs injected`,
                injErrs > 0 ? "warn" : "ok"
              );
            }
          }
        }

        setProgress((p) => ({ ...p, phase: "main" }));
        setStatus(abortRef.current ? "aborted" : "done");
        addLog(
          abortRef.current
            ? `Aborted. ${totalSent} traces shipped.`
            : `Done! ${totalSent.toLocaleString()} traces indexed, ${totalErrors} errors.`,
          totalErrors > 0 ? "warn" : "ok"
        );
        return;
      }

      /** ── Logs / Metrics mode ──────────────────────────────────────────────── */
      const METRICS_GENERATORS = eventType === "metrics" ? await loadMetricsGenerators() : null;
      setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
      addLog(
        `Starting: ${activeServices.length} service(s) [${eventType}] — ${logsPerService.toLocaleString()} calls each`
      );
      let totalSent = 0,
        totalErrors = 0;

      const docCountByIdx: number[] = new Array(activeServices.length);

      const shipService = async (svc: string, svcIndex: number) => {
        const dataset =
          eventType === "metrics"
            ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
            : ELASTIC_DATASET_MAP[svc] || `aws.${svc}`;
        const dsPrefix = dataset === "aws.xray" ? "traces-aws" : indexPrefix;
        const indexName = `${dsPrefix}.${dataset.replace(/^aws\./, "")}-default`;
        const src = getEffectiveSource(svc);
        addLog(`▶ ${svc} → ${indexName} [${INGESTION_META[src]?.label || src}]`, "info");
        // In metrics mode, prefer dimensional generators that produce per-resource docs
        const isDimensionalMetrics = METRICS_GENERATORS?.[svc] != null;
        const allDocs = isDimensionalMetrics
          ? Array.from({ length: logsPerService }, () =>
              METRICS_GENERATORS![svc](randTs(startDate, endDate), errorRate)
            )
              .flat()
              .map((d) => stripNulls(d))
          : Array.from({ length: logsPerService }, () => {
              const result = GENERATORS[svc](randTs(startDate, endDate), errorRate);
              if (Array.isArray(result)) {
                return result.map((d) => stripNulls(d));
              }
              return [stripNulls(enrichDoc(result, svc, src, eventType))];
            }).flat();
        docCountByIdx[svcIndex] = allDocs.length;
        setProgress((prev) => {
          const t = docCountByIdx.reduce((s, x) => s + (typeof x === "number" ? x : 0), 0);
          return { ...prev, phase: "main", total: t };
        });
        const svcProgress = makeProgressFlusher("main");
        let svcSent = 0,
          svcErrors = 0,
          batchNum = 0;
        for (let i = 0; i < allDocs.length; i += batchSize) {
          if (abortRef.current) break;
          batchNum++;
          const batch = allDocs.slice(i, i + batchSize);
          let ndjson = "";
          for (const doc of batch) {
            const { __dataset, ...cleanDoc } = doc as LooseDoc;
            const idx = __dataset
              ? __dataset.startsWith("aws.")
                ? `${indexPrefix}.${__dataset.replace(/^aws\./, "")}-default`
                : `logs-${__dataset}-default`
              : indexName;
            ndjson +=
              JSON.stringify({ create: { _index: idx } }) + "\n" + JSON.stringify(cleanDoc) + "\n";
          }
          let sentDelta = 0;
          let errDelta = 0;
          try {
            const res = await fetch(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
            const json = await res.json();
            if (!res.ok) {
              svcErrors += batch.length;
              errDelta = batch.length;
              addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`, "error");
            } else {
              const failedItems =
                json.items?.filter((i) => i.create?.error || i.index?.error) || [];
              const conflictItems = failedItems.filter(
                (i) =>
                  (i.create?.error?.type || i.index?.error?.type) ===
                  "version_conflict_engine_exception"
              );
              const realErrors = failedItems.filter(
                (i) =>
                  (i.create?.error?.type || i.index?.error?.type) !==
                  "version_conflict_engine_exception"
              );
              const conflicts = conflictItems.length;
              const errs = realErrors.length;
              svcErrors += errs;
              errDelta = errs;
              sentDelta = batch.length - errs - conflicts;
              svcSent += sentDelta;
              if (errs > 0) {
                const firstErr = realErrors[0]?.create?.error || realErrors[0]?.index?.error;
                addLog(
                  `  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`,
                  "warn"
                );
              } else if (conflicts > 0) {
                addLog(
                  `  ↷ batch ${batchNum}: ${batch.length - conflicts} indexed, ${conflicts} skipped (already exists)`,
                  "ok"
                );
              } else {
                addLog(`  ✓ batch ${batchNum}: ${batch.length} indexed`, "ok");
              }
            }
          } catch (e: unknown) {
            svcErrors += batch.length;
            errDelta = batch.length;
            addLog(`  ✗ network error: ${errMsg(e)}`, "error");
          }
          svcProgress.add(sentDelta, errDelta);
          if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
        }
        svcProgress.done();
        addLog(`✓ ${svc} complete`, "ok");
        return { sent: svcSent, errors: svcErrors };
      };

      const svcResults = await runPool(activeServices, shipService);
      for (const r of svcResults) {
        if (r) {
          totalSent += r.sent;
          totalErrors += r.errors;
        }
      }

      // ── Anomaly injection pass (logs / metrics) ──────────────────────────
      if (injectAnomalies && !abortRef.current) {
        addLog("⚡ Anomaly injection pass — shipping spike events at current time…", "info");
        const injCount = Math.max(50, Math.round(logsPerService * 0.3));
        const injEnd = new Date();
        const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
        const injWork: { svc: string; indexName: string; docs: LooseDoc[] }[] = [];
        for (const svc of activeServices) {
          const dataset =
            eventType === "metrics"
              ? (ELASTIC_METRICS_DATASET_MAP[svc] ?? ELASTIC_DATASET_MAP[svc] ?? `aws.${svc}`)
              : ELASTIC_DATASET_MAP[svc] || `aws.${svc}`;
          const dsPrefix = dataset === "aws.xray" ? "traces-aws" : indexPrefix;
          const indexName = `${dsPrefix}.${dataset.replace(/^aws\./, "")}-default`;
          const isDimensional = METRICS_GENERATORS?.[svc] != null;
          let injDocs: LooseDoc[] | undefined;
          if (isDimensional) {
            injDocs = Array.from({ length: injCount }, () => {
              const docs = METRICS_GENERATORS![svc](randTs(injStart, injEnd), 1.0);
              return (Array.isArray(docs) ? docs : [docs]).map((d) => {
                const out = stripNulls(d) as LooseDoc;
                for (const [k, v] of Object.entries(out)) {
                  if (typeof v === "number" && !k.startsWith("@") && k !== "_doc_count") {
                    out[k] = v * 20;
                  }
                }
                return out;
              });
            }).flat() as LooseDoc[];
          } else if (GENERATORS[svc]) {
            injDocs = Array.from({ length: injCount }, () => {
              const result = GENERATORS[svc](randTs(injStart, injEnd), 1.0);
              return (
                Array.isArray(result)
                  ? result
                  : [stripNulls(enrichDoc(result, svc, getEffectiveSource(svc), eventType))]
              ).map((d) => stripNulls(d));
            }).flat() as LooseDoc[];
          }
          if (injDocs?.length) injWork.push({ svc, indexName, docs: injDocs });
        }
        const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
        if (injWork.length > 0) {
          setProgress({
            phase: "injection",
            sent: 0,
            total: Math.max(1, injTotalDocs),
            errors: 0,
          });
          const injFlush = makeProgressFlusher("injection");
          for (const { svc, indexName, docs: injDocs } of injWork) {
            if (abortRef.current) break;
            let injIndexed = 0,
              injRealErrs = 0;
            for (let i = 0; i < injDocs.length; i += batchSize) {
              if (abortRef.current) break;
              const batch = injDocs.slice(i, i + batchSize);
              let ndjsonInj = "";
              for (const doc of batch) {
                const { __dataset, ...cleanDoc } = doc;
                const idx = __dataset
                  ? __dataset.startsWith("aws.")
                    ? `${indexPrefix}.${__dataset.replace(/^aws\./, "")}-default`
                    : `logs-${__dataset}-default`
                  : indexName;
                ndjsonInj +=
                  JSON.stringify({ create: { _index: idx } }) +
                  "\n" +
                  JSON.stringify(cleanDoc) +
                  "\n";
              }
              let sentDelta = 0;
              let errDelta = 0;
              try {
                const res = await fetch(`/proxy/_bulk`, {
                  method: "POST",
                  headers,
                  body: ndjsonInj,
                });
                const json = await res.json();
                if (!res.ok) {
                  injRealErrs += batch.length;
                  errDelta = batch.length;
                  addLog(
                    `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                    "error"
                  );
                } else {
                  const failedInj =
                    json.items?.filter((it) => it.create?.error || it.index?.error) || [];
                  const conflictInj = failedInj.filter(
                    (it) =>
                      (it.create?.error?.type || it.index?.error?.type) ===
                      "version_conflict_engine_exception"
                  );
                  const realErrInj = failedInj.filter(
                    (it) =>
                      (it.create?.error?.type || it.index?.error?.type) !==
                      "version_conflict_engine_exception"
                  );
                  const conflicts = conflictInj.length;
                  const errs = realErrInj.length;
                  injIndexed += batch.length - errs - conflicts;
                  injRealErrs += errs;
                  sentDelta = batch.length - errs - conflicts;
                  errDelta = errs;
                }
              } catch (e: unknown) {
                addLog(`  ✗ anomaly injection network error (${svc}): ${errMsg(e)}`, "error");
                injRealErrs += batch.length;
                errDelta = batch.length;
              }
              injFlush.add(sentDelta, errDelta);
            }
            injFlush.done();
            addLog(
              `  ⚡ ${svc}: ${injIndexed} anomaly docs injected${injRealErrs > 0 ? `, ${injRealErrs} errors` : ""}`,
              injRealErrs > 0 ? "warn" : "ok"
            );
          }
        }
      }

      setProgress((p) => ({ ...p, phase: "main" }));
      setStatus(abortRef.current ? "aborted" : "done");
      addLog(
        abortRef.current
          ? `Aborted. ${totalSent} shipped.`
          : `Done! ${totalSent.toLocaleString()} indexed, ${totalErrors} errors.`,
        totalErrors > 0 ? "warn" : "ok"
      );
    } catch (fatal: unknown) {
      setProgress((p) => ({ ...p, phase: "main" }));
      setStatus("done");
      addLog(`Fatal error: ${errMsg(fatal)}`, "error");
      console.error("Ship error:", fatal);
    }
    // indexPrefix already reflects logs vs metrics; enrichDoc is stable ([] deps).
  }, [
    selectedServices,
    selectedTraceServices,
    logsPerService,
    tracesPerService,
    errorRate,
    batchSize,
    batchDelayMs,
    elasticUrl,
    apiKey,
    indexPrefix,
    enrichDoc,
    getEffectiveSource,
    eventType,
    isTracesMode,
    runConnectionValidation,
    injectAnomalies,
  ]);

  // ─── Scheduled mode loop ─────────────────────────────────────────────────────
  const startSchedule = useCallback(async () => {
    const controller = new AbortController();
    scheduleLoopRef.current = controller;
    setScheduleActive(true);

    for (let run = 1; run <= scheduleTotalRuns; run++) {
      if (controller.signal.aborted) break;
      setScheduleCurrentRun(run);
      setNextRunAt(null);
      await ship();
      // If the user stopped the current run, cancel the whole schedule too
      if (abortRef.current) controller.abort();
      if (controller.signal.aborted || run === scheduleTotalRuns) break;

      const nextTime = new Date(Date.now() + scheduleIntervalMin * 60 * 1000);
      setNextRunAt(nextTime);
      await new Promise<void>((resolve) => {
        const id = setTimeout(resolve, scheduleIntervalMin * 60 * 1000);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true }
        );
      });
    }

    scheduleLoopRef.current = null;
    setScheduleActive(false);
    setScheduleCurrentRun(0);
    setNextRunAt(null);
  }, [ship, scheduleTotalRuns, scheduleIntervalMin]);

  const pct = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;
  const progressBarColor =
    pct === 100 ? K.success : progress.phase === "injection" ? "#7c3aed" : K.primary;
  const totalSelected = isTracesMode ? selectedTraceServices.length : selectedServices.length;
  const totalServices = isTracesMode
    ? TRACE_SERVICES.length
    : eventType === "metrics"
      ? METRICS_SUPPORTED_SERVICE_IDS.size
      : ALL_SERVICE_IDS.length;

  // ─── Estimated volume ──────────────────────────────────────────────────────
  const estimatedDocs = isTracesMode
    ? totalSelected * tracesPerService
    : totalSelected * logsPerService;
  const estimatedBatches = totalSelected > 0 ? Math.ceil(estimatedDocs / batchSize) : 0;

  return (
    <div className={styles.root} style={{ background: K.body, color: K.text }}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <AwsLogo height={26} />
          <PipelineRoute height={22} />
          <img src="/elastic-logo.svg" alt="Elastic" height={28} style={{ display: "block" }} />
          <div className={styles.headerRule} />
          <span className={styles.headerTitle}>Load Generator</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerSubdued}>
            {totalSelected} / {totalServices} services
          </span>
          {status === "running" && (
            <StatusPill color="#FACB3D" dot light>
              Shipping
            </StatusPill>
          )}
          {status === "done" && (
            <StatusPill color="#24C292" light>
              Complete
            </StatusPill>
          )}
          {status === "aborted" && (
            <StatusPill color="#EE4C48" light>
              Aborted
            </StatusPill>
          )}
          {scheduleActive && (
            <StatusPill color={K.primary} dot light>
              Run {scheduleCurrentRun}/{scheduleTotalRuns}
            </StatusPill>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageTitleWrap}>
          <h1 className={styles.pageTitle}>Generate and ship AWS logs &amp; metrics to Elastic</h1>
          <p className={styles.pageDesc}>
            {isTracesMode
              ? `${totalServices} OTel-style APM scenarios (single-service + workflows) · EDOT / ADOT paths · Ships to traces-apm-default`
              : eventType === "metrics"
                ? `${totalServices} AWS services with Elastic metrics support`
                : `${totalServices} AWS services across ${SERVICE_GROUPS.length} groups`}
            {isTracesMode
              ? ""
              : " · ECS-compliant · Per-service ingestion (S3, CloudWatch, API, Firehose, OTel). Ships directly to Elasticsearch."}
          </p>
        </div>

        <div className={styles.grid}>
          {/* LEFT — Service selection */}
          <div>
            {isTracesMode ? (
              <Card>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: K.textHeading }}>
                    Select Trace Services
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <QuickBtn onClick={selectAllTraces}>All</QuickBtn>
                    <QuickBtn onClick={selectNoneTraces}>None</QuickBtn>
                    {totalSelected > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#8b5cf6",
                          background: "#8b5cf614",
                          border: "1px solid #8b5cf644",
                          borderRadius: 99,
                          padding: "2px 10px",
                        }}
                      >
                        {totalSelected} selected
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: K.textSubdued,
                    marginBottom: 12,
                    padding: "8px 10px",
                    background: "#8b5cf608",
                    border: "1px solid #8b5cf622",
                    borderRadius: K.radiusSm,
                  }}
                >
                  Documents match Elastic APM shape (OTLP-style). Single-service and workflow traces use{" "}
                  <span style={{ color: "#8b5cf6", fontWeight: 600 }}>EDOT</span> or{" "}
                  <span style={{ color: "#8b5cf6", fontWeight: 600 }}>ADOT</span> conventions; ship to{" "}
                  <span style={{ color: "#8b5cf6", fontWeight: 600 }}>traces-apm-default</span>.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {traceServiceGroups.map(({ title, items }) => (
                    <div key={title}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: K.textSubdued,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 8,
                        }}
                      >
                        {title}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {items.map((svc) => {
                          const sel = selectedTraceServices.includes(svc.id);
                          const iconFile =
                            AWS_SERVICE_ICON_MAP[svc.id as keyof typeof AWS_SERVICE_ICON_MAP] ??
                            TRACE_SERVICE_ICON_MAP[svc.id];
                          return (
                            <button
                              key={svc.id}
                              onClick={() => toggleTraceService(svc.id)}
                              style={{
                                border: `1.5px solid ${sel ? "#8b5cf6" : "#e2e8f0"}`,
                                borderRadius: K.radius,
                                padding: "12px 14px",
                                background: sel ? "#8b5cf60e" : "#f8fafc",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.15s",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {sel && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 2,
                                    background: "#8b5cf6",
                                    borderRadius: "8px 8px 0 0",
                                  }}
                                />
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {iconFile ? (
                                  <img
                                    src={iconSrc(iconFile)}
                                    alt=""
                                    style={{ width: 32, height: 32, objectFit: "contain" }}
                                  />
                                ) : (
                                  <div
                                    style={{ fontSize: 22, minWidth: 32, textAlign: "center" }}
                                  >
                                    ⚡
                                  </div>
                                )}
                                <div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: sel ? "#8b5cf6" : "#334155",
                                      marginBottom: 2,
                                    }}
                                  >
                                    {svc.label}
                                  </div>
                                  <div
                                    style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}
                                  >
                                    {svc.desc}
                                  </div>
                                </div>
                                {sel && (
                                  <span
                                    style={{
                                      marginLeft: "auto",
                                      color: "#8b5cf6",
                                      fontSize: 14,
                                      fontWeight: 700,
                                    }}
                                  >
                                    ✓
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: K.subdued,
                    borderRadius: K.radiusSm,
                    border: `1px solid ${K.border}`,
                  }}
                >
                  <div
                    style={{ fontSize: 11, fontWeight: 600, color: K.textHeading, marginBottom: 6 }}
                  >
                    OTel instrumentation paths
                  </div>
                  <div style={{ fontSize: 10, color: K.textSubdued, lineHeight: 1.6 }}>
                    <div>
                      <span style={{ color: "#8b5cf6", fontWeight: 600 }}>Lambda</span> — EDOT or ADOT
                      layer, OTLP → APM / Elastic
                    </div>
                    <div>
                      <span style={{ color: "#8b5cf6", fontWeight: 600 }}>Containers / Spark</span> — EDOT
                      Java agent or sidecar; workflows add HTTP, messaging, and AWS SDK spans
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <ServiceGrid
                eventType={eventType}
                selectedServices={selectedServices}
                totalServices={totalServices}
                totalSelected={totalSelected}
                collapsedGroups={collapsedGroups}
                ingestionSource={ingestionSource}
                selectAll={selectAll}
                selectNone={selectNone}
                toggleService={toggleService}
                toggleGroup={toggleGroup}
                toggleCollapse={toggleCollapse}
                getEffectiveSource={getEffectiveSource}
              />
            )}
          </div>

          <div className={styles.rightCol}>
            <Card>
              <CardHeader label="Volume & Settings" />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div
                    style={{ fontSize: 12, fontWeight: 500, color: K.textSubdued, marginBottom: 6 }}
                  >
                    Event type
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      borderRadius: K.radiusSm,
                      border: `1px solid ${K.border}`,
                      overflow: "hidden",
                      background: K.subdued,
                    }}
                  >
                    <button
                      onClick={() => {
                        setEventType("logs");
                      }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "none",
                        fontFamily: "inherit",
                        background: eventType === "logs" ? K.plain : "transparent",
                        color: eventType === "logs" ? K.textHeading : K.textSubdued,
                        transition: "all 0.15s",
                        boxShadow: eventType === "logs" ? K.shadow : "none",
                      }}
                    >
                      Logs
                    </button>
                    <button
                      onClick={() => {
                        setEventType("metrics");
                        setSelectedServices((prev) =>
                          prev.filter((id) => METRICS_SUPPORTED_SERVICE_IDS.has(id))
                        );
                      }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "none",
                        fontFamily: "inherit",
                        background: eventType === "metrics" ? K.plain : "transparent",
                        color: eventType === "metrics" ? K.textHeading : K.textSubdued,
                        transition: "all 0.15s",
                        boxShadow: eventType === "metrics" ? K.shadow : "none",
                      }}
                    >
                      Metrics
                    </button>
                    <button
                      onClick={() => {
                        setEventType("traces");
                      }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "none",
                        fontFamily: "inherit",
                        background: isTracesMode ? K.plain : "transparent",
                        color: isTracesMode ? "#8b5cf6" : K.textSubdued,
                        transition: "all 0.15s",
                        boxShadow: isTracesMode ? K.shadow : "none",
                      }}
                    >
                      Traces
                    </button>
                  </div>
                  {eventType === "metrics" && (
                    <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 4 }}>
                      Only services with metrics in the Elastic AWS integration. Index:
                      metrics-aws.*
                    </div>
                  )}
                  {isTracesMode && (
                    <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 4 }}>
                      OTel-style APM traces for the selected scenarios (services and multi-step workflows).
                      Ships to <strong>traces-apm-default</strong>.
                    </div>
                  )}
                </div>
                {isTracesMode ? (
                  <SliderField
                    label="Traces per service"
                    value={tracesPerService}
                    min={10}
                    max={500}
                    step={10}
                    onChange={setTracesPerService}
                    display={`${tracesPerService.toLocaleString()} traces`}
                    sublabel={`~${(totalSelected * tracesPerService).toLocaleString()} traces (each trace = transaction + spans)`}
                  />
                ) : (
                  <SliderField
                    label={eventType === "metrics" ? "Metrics per service" : "Logs per service"}
                    value={logsPerService}
                    min={50}
                    max={5000}
                    step={50}
                    onChange={setLogsPerService}
                    display={`${logsPerService.toLocaleString()} docs`}
                    sublabel={`${(totalSelected * logsPerService).toLocaleString()} total docs across ${totalSelected} service(s)`}
                  />
                )}
                <SliderField
                  label="Error rate"
                  value={errorRate}
                  min={0}
                  max={0.5}
                  step={0.01}
                  onChange={setErrorRate}
                  display={`${(errorRate * 100).toFixed(0)}%`}
                  sublabel="Percentage generated as errors or failures"
                />
                <SliderField
                  label="Bulk batch size"
                  value={batchSize}
                  min={50}
                  max={1000}
                  step={50}
                  onChange={setBatchSize}
                  display={`${batchSize}/request`}
                  sublabel="Documents per Elasticsearch _bulk request"
                />
                <SliderField
                  label="Batch delay (ms)"
                  value={batchDelayMs}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(v) => setBatchDelayMs(Number(v))}
                  display={`${batchDelayMs} ms`}
                  sublabel="Delay between bulk requests (0 = minimal)"
                />
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    padding: "10px 12px",
                    background: injectAnomalies ? "#7c3aed11" : "transparent",
                    border: `1px solid ${injectAnomalies ? "#7c3aed44" : K.border}`,
                    borderRadius: K.radiusSm,
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={injectAnomalies}
                    onChange={(e) => setInjectAnomalies(e.target.checked)}
                    style={{
                      marginTop: 2,
                      accentColor: "#7c3aed",
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: injectAnomalies ? "#7c3aed" : K.text,
                      }}
                    >
                      Inject anomalies
                    </div>
                    <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 2 }}>
                      After the main run, ship a second spike pass at current time — extreme values
                      that ML anomaly detection jobs will score highly.
                    </div>
                  </div>
                </label>
              </div>
            </Card>

            <Card>
              <CardHeader label="Scheduled Mode" />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    padding: "10px 12px",
                    background: scheduleEnabled ? "#0B64DD11" : "transparent",
                    border: `1px solid ${scheduleEnabled ? "#0B64DD44" : K.border}`,
                    borderRadius: K.radiusSm,
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    style={{
                      marginTop: 2,
                      accentColor: K.primary,
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: scheduleEnabled ? K.primary : K.text,
                      }}
                    >
                      Enable scheduled mode
                    </div>
                    <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 2 }}>
                      Automatically repeat shipping runs to build an ML baseline (for example 12
                      runs × 15 min ≈ 3 hours of spaced loads). If &quot;Inject anomalies&quot; is
                      on, each run ships the main load and then the anomaly spike pass — not only
                      after the last run.
                    </div>
                  </div>
                </label>
                {scheduleEnabled && (
                  <>
                    <SliderField
                      label="Total runs"
                      min={1}
                      max={24}
                      step={1}
                      value={scheduleTotalRuns}
                      onChange={(v) => setScheduleTotalRuns(v)}
                      display={`${scheduleTotalRuns} run${scheduleTotalRuns !== 1 ? "s" : ""}`}
                      sublabel={`~${((scheduleTotalRuns * scheduleIntervalMin) / 60).toFixed(1).replace(/\.0$/, "")} hours total`}
                    />
                    <SliderField
                      label="Interval between runs"
                      min={5}
                      max={60}
                      step={5}
                      value={scheduleIntervalMin}
                      onChange={(v) => setScheduleIntervalMin(v)}
                      display={`${scheduleIntervalMin} min`}
                      sublabel="Wait between shipping runs"
                    />
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader label="Elastic Cloud Connection" />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Elasticsearch URL">
                  <input
                    value={elasticUrl}
                    onChange={(e) => {
                      setElasticUrl(e.target.value);
                      setValidationErrors((prev) => ({ ...prev, elasticUrl: "" }));
                    }}
                    onBlur={() =>
                      setValidationErrors((prev) => ({
                        ...prev,
                        elasticUrl: validateElasticUrl(elasticUrl).valid
                          ? ""
                          : (validateElasticUrl(elasticUrl).message ?? ""),
                      }))
                    }
                    placeholder="https://my-deployment.es.us-east-1.aws.elastic.cloud"
                    className={`${styles.input} ${validationErrors.elasticUrl ? styles.inputError : ""}`}
                  />
                  {validationErrors.elasticUrl && (
                    <div className={styles.validationError}>{validationErrors.elasticUrl}</div>
                  )}
                </Field>
                <Field label="API Key">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setValidationErrors((prev) => ({ ...prev, apiKey: "" }));
                    }}
                    onBlur={() =>
                      setValidationErrors((prev) => ({
                        ...prev,
                        apiKey: validateApiKey(apiKey).valid
                          ? ""
                          : (validateApiKey(apiKey).message ?? ""),
                      }))
                    }
                    placeholder="base64-encoded-api-key"
                    className={`${styles.input} ${validationErrors.apiKey ? styles.inputError : ""}`}
                  />
                  {validationErrors.apiKey && (
                    <div className={styles.validationError}>{validationErrors.apiKey}</div>
                  )}
                </Field>
                {!isTracesMode && (
                  <Field label="Index prefix">
                    <input
                      value={indexPrefix}
                      onChange={(e) => {
                        setIndexPrefix(e.target.value);
                        setValidationErrors((prev) => ({ ...prev, indexPrefix: "" }));
                      }}
                      onBlur={() =>
                        setValidationErrors((prev) => ({
                          ...prev,
                          indexPrefix: validateIndexPrefix(indexPrefix).valid
                            ? ""
                            : (validateIndexPrefix(indexPrefix).message ?? ""),
                        }))
                      }
                      placeholder="logs-aws"
                      className={`${styles.input} ${validationErrors.indexPrefix ? styles.inputError : ""}`}
                    />
                    {validationErrors.indexPrefix && (
                      <div className={styles.validationError}>{validationErrors.indexPrefix}</div>
                    )}
                    <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 5 }}>
                      e.g.{" "}
                      <span style={{ color: K.primaryText }}>{indexPrefix}.lambda-default</span>,{" "}
                      <span style={{ color: K.primaryText }}>{indexPrefix}.vpcflow-default</span>…
                    </div>
                  </Field>
                )}
                {isTracesMode && (
                  <Field label="APM index">
                    <div
                      style={{
                        padding: "8px 12px",
                        background: K.subdued,
                        borderRadius: K.radiusSm,
                        border: `1px solid #8b5cf633`,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#8b5cf6",
                      }}
                    >
                      traces-apm-default
                    </div>
                    <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 5 }}>
                      Fixed APM data stream — requires Elastic APM Server or Fleet integration.
                    </div>
                  </Field>
                )}
                {!isTracesMode && (
                  <Field label="Ingestion source">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <button
                        onClick={() => setIngestionSource("default")}
                        style={{
                          gridColumn: "1/-1",
                          padding: "8px 12px",
                          borderRadius: K.radiusSm,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${ingestionSource === "default" ? K.success : K.border}`,
                          background: ingestionSource === "default" ? K.successBg : K.subdued,
                          color: ingestionSource === "default" ? K.success : K.textSubdued,
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 14 }}>⚙</span>
                        <div>
                          <div>Default (per-service)</div>
                          <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>
                            S3 · CloudWatch · API · Firehose — each service uses its real-world
                            default
                          </div>
                        </div>
                        {ingestionSource === "default" && (
                          <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>
                        )}
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: K.textSubdued,
                        marginBottom: 6,
                        fontWeight: 500,
                      }}
                    >
                      Override all services:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        ["s3", "S3 Bucket", "#FF9900"],
                        ["cloudwatch", "CloudWatch", "#1BA9F5"],
                        ["firehose", "Firehose", "#F04E98"],
                        ["api", "API", "#00BFB3"],
                        ["otel", "OTel", "#93C90E"],
                        ["agent", "Elastic Agent", "#a78bfa"],
                      ].map(([val, lbl, col]) => (
                        <button
                          key={val}
                          onClick={() => setIngestionSource(val)}
                          style={{
                            padding: "7px 6px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            border: `1.5px solid ${ingestionSource === val ? col : col + "33"}`,
                            background: ingestionSource === val ? `${col}22` : "#f8fafc",
                            color: ingestionSource === val ? col : col + "cc",
                            transition: "all 0.15s",
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: K.textSubdued,
                        marginTop: 8,
                        padding: "8px 10px",
                        background: K.subdued,
                        borderRadius: K.radiusSm,
                        border: `1px solid ${K.border}`,
                      }}
                    >
                      {ingestionSource === "default" ? (
                        <span>
                          Each service uses its correct real-world ingestion method. Badges on
                          service cards show the source.
                        </span>
                      ) : (
                        {
                          s3: (
                            <>
                              <span style={{ color: "#FF9900" }}>aws-s3</span> · All services read
                              from S3 bucket via SQS notifications
                            </>
                          ),
                          cloudwatch: (
                            <>
                              <span style={{ color: "#1BA9F5" }}>aws-cloudwatch</span> · All
                              services polled from CloudWatch log groups
                            </>
                          ),
                          firehose: (
                            <>
                              <span style={{ color: "#F04E98" }}>aws-firehose</span> · All services
                              pushed via Firehose delivery stream
                            </>
                          ),
                          api: (
                            <>
                              <span style={{ color: "#00BFB3" }}>http_endpoint</span> · All services
                              via direct REST API ingestion
                            </>
                          ),
                          otel: (
                            <>
                              <span style={{ color: "#93C90E" }}>opentelemetry</span> · All services
                              via OTLP collector (telemetry.sdk fields added)
                            </>
                          ),
                          agent: (
                            <>
                              <span style={{ color: "#a78bfa" }}>logfile</span> · All services
                              collected by Elastic Agent from log files
                            </>
                          ),
                        }[ingestionSource]
                      )}
                    </div>
                  </Field>
                )}
                <button type="button" onClick={clearSavedConfig} className={styles.clearConfigBtn}>
                  Clear saved config
                </button>
              </div>
            </Card>

            <div className={styles.actionsRow}>
              <button
                type="button"
                onClick={generatePreview}
                style={{ flex: "0 0 auto" }}
                className={styles.btnSecondary}
              >
                Preview doc
              </button>
              {status === "running" ? (
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current = true;
                    scheduleLoopRef.current?.abort();
                  }}
                  style={{ flex: 1 }}
                  className={styles.btnDanger}
                >
                  {scheduleActive ? "Stop schedule" : "Stop shipping"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={scheduleEnabled ? startSchedule : ship}
                  disabled={
                    !totalSelected ||
                    !elasticUrl ||
                    !apiKey ||
                    !!(
                      validationErrors.elasticUrl ||
                      validationErrors.apiKey ||
                      (!isTracesMode && validationErrors.indexPrefix)
                    )
                  }
                  style={{
                    flex: 1,
                    opacity:
                      totalSelected &&
                      elasticUrl &&
                      apiKey &&
                      !(
                        validationErrors.elasticUrl ||
                        validationErrors.apiKey ||
                        (!isTracesMode && validationErrors.indexPrefix)
                      )
                        ? 1
                        : 0.5,
                    cursor:
                      totalSelected &&
                      elasticUrl &&
                      apiKey &&
                      !(
                        validationErrors.elasticUrl ||
                        validationErrors.apiKey ||
                        (!isTracesMode && validationErrors.indexPrefix)
                      )
                        ? "pointer"
                        : "not-allowed",
                  }}
                  className={styles.btnPrimary}
                >
                  ⚡ Ship{" "}
                  {totalSelected > 0
                    ? isTracesMode
                      ? `${(totalSelected * tracesPerService).toLocaleString()} traces`
                      : `${(totalSelected * logsPerService).toLocaleString()} ${eventType === "metrics" ? "metrics" : "logs"}`
                    : isTracesMode
                      ? "traces"
                      : eventType === "metrics"
                        ? "metrics"
                        : "logs"}
                </button>
              )}
            </div>
            {totalSelected > 0 && (
              <div className={styles.costEstimate}>
                {isTracesMode
                  ? `~${estimatedDocs.toLocaleString()} traces across ${totalSelected} service${totalSelected !== 1 ? "s" : ""} (each trace = transaction + spans)`
                  : eventType === "metrics"
                    ? `~${estimatedDocs.toLocaleString()} calls across ${totalSelected} service${totalSelected !== 1 ? "s" : ""} — actual doc count varies by service (dimensional metrics generate multiple docs per call)`
                    : `~${estimatedDocs.toLocaleString()} documents across ${totalSelected} service${totalSelected !== 1 ? "s" : ""} (${estimatedBatches} batch${estimatedBatches !== 1 ? "es" : ""})`}
              </div>
            )}

            {status && (
              <Card>
                <CardHeader
                  label="Progress"
                  badge={`${pct}%`}
                  badgeColor={
                    progress.phase === "injection" ? "#a78bfa" : pct === 100 ? K.success : K.warning
                  }
                />
                {progress.phase === "injection" && (
                  <div
                    style={{
                      fontSize: 11,
                      color: K.textSubdued,
                      marginTop: -4,
                      marginBottom: 10,
                    }}
                  >
                    Phase 2 — anomaly injection (documents indexed toward total below)
                  </div>
                )}
                <div
                  style={{
                    height: 6,
                    background: K.border,
                    borderRadius: 99,
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: progressBarColor,
                      borderRadius: 99,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <StatCard
                    label={progress.phase === "injection" ? "Injected" : "Indexed"}
                    value={progress.sent.toLocaleString()}
                    color={K.success}
                  />
                  <StatCard
                    label="Total"
                    value={progress.total.toLocaleString()}
                    color={K.textSubdued}
                  />
                  <StatCard
                    label="Errors"
                    value={progress.errors.toLocaleString()}
                    color={progress.errors > 0 ? K.danger : K.textSubdued}
                  />
                </div>
                {scheduleActive && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "6px 10px",
                      background: K.highlight,
                      borderRadius: K.radiusSm,
                      fontSize: 11,
                      color: K.primaryText,
                      textAlign: "center",
                    }}
                  >
                    {nextRunAt
                      ? `Run ${scheduleCurrentRun} / ${scheduleTotalRuns} complete · next run in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
                      : `Run ${scheduleCurrentRun} / ${scheduleTotalRuns} · shipping…`}
                  </div>
                )}
              </Card>
            )}

            {preview && (
              <Card>
                <CardHeader label="Sample Document" />
                <pre className={styles.previewPre}>{preview}</pre>
              </Card>
            )}

            <Card>
              <CardHeader label="Activity Log">
                {log.length > 0 && <QuickBtn onClick={downloadLog}>↓ Download</QuickBtn>}
              </CardHeader>
              <div className={styles.logBox}>
                {log.length === 0 ? (
                  <span style={{ color: K.textSubdued, fontStyle: "italic" }}>
                    Waiting for activity…
                  </span>
                ) : (
                  log.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        color:
                          { ok: K.success, error: K.danger, warn: K.warning, info: K.textSubdued }[
                            e.type
                          ] || K.textSubdued,
                      }}
                    >
                      <span style={{ color: K.textSubdued }}>[{e.ts}] </span>
                      {e.msg}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
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
      `,
        }}
      />
    </div>
  );
}

// Inline styles still used where dynamic (e.g. group.color, K.*) — see App.module.css for shared classes
