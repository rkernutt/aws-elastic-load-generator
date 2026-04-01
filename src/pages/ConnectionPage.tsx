import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFieldText,
  EuiFieldPassword,
  EuiFormRow,
  EuiCallOut,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiText,
} from "@elastic/eui";

interface ConnectionPageProps {
  elasticUrl: string;
  apiKey: string;
  indexPrefix: string;
  isTracesMode: boolean;
  eventType: string;
  connectionStatus: "idle" | "testing" | "ok" | "fail";
  connectionMsg: string;
  validationErrors: { elasticUrl: string; apiKey: string; indexPrefix: string };
  ingestionSource: string;
  onElasticUrlChange: (val: string) => void;
  onApiKeyChange: (val: string) => void;
  onIndexPrefixChange: (val: string) => void;
  onEventTypeChange: (val: string) => void;
  onTestConnection: () => void;
  onIngestionSourceChange: (val: string) => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
  onResetConfig: () => void;
  onBlurElasticUrl: () => void;
  onBlurApiKey: () => void;
  onBlurIndexPrefix: () => void;
}

const EVENT_TYPE_OPTIONS = [
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "traces", label: "Traces" },
];

const INGESTION_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "s3", label: "S3" },
  { id: "cloudwatch", label: "CloudWatch" },
  { id: "firehose", label: "Firehose" },
  { id: "api", label: "API" },
  { id: "otel", label: "OTel" },
  { id: "agent", label: "Agent" },
];

export function ConnectionPage({
  elasticUrl,
  apiKey,
  indexPrefix,
  isTracesMode,
  eventType,
  connectionStatus,
  connectionMsg,
  validationErrors,
  ingestionSource,
  onElasticUrlChange,
  onApiKeyChange,
  onIndexPrefixChange,
  onEventTypeChange,
  onTestConnection,
  onIngestionSourceChange,
  onExportConfig,
  onImportConfig,
  onResetConfig,
  onBlurElasticUrl,
  onBlurApiKey,
  onBlurIndexPrefix,
}: ConnectionPageProps) {
  const prefixLabel = isTracesMode
    ? "Traces Index Prefix"
    : eventType === "metrics"
      ? "Metrics Index Prefix"
      : "Logs Index Prefix";

  return (
    <>
      <EuiTitle size="s">
        <h2>Start</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      {/* Event type — choose what to generate */}
      <EuiFormRow label="Event Type" helpText="Choose what type of data to generate">
        <EuiButtonGroup
          legend="Event type selection"
          options={EVENT_TYPE_OPTIONS}
          idSelected={eventType}
          onChange={(id) => onEventTypeChange(id)}
        />
      </EuiFormRow>

      <EuiSpacer size="l" />

      <EuiFormRow
        label="Elasticsearch URL"
        error={validationErrors.elasticUrl || undefined}
        isInvalid={!!validationErrors.elasticUrl}
        helpText="e.g. https://my-deployment.es.eu-west-2.aws.elastic-cloud.com"
      >
        <EuiFieldText
          value={elasticUrl}
          onChange={(e) => onElasticUrlChange(e.target.value)}
          onBlur={onBlurElasticUrl}
          isInvalid={!!validationErrors.elasticUrl}
          placeholder="https://..."
        />
      </EuiFormRow>

      <EuiFormRow
        label="API Key"
        error={validationErrors.apiKey || undefined}
        isInvalid={!!validationErrors.apiKey}
      >
        <EuiFieldPassword
          type="dual"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          onBlur={onBlurApiKey}
          isInvalid={!!validationErrors.apiKey}
          placeholder="Base64-encoded API key"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={onTestConnection}
            isLoading={connectionStatus === "testing"}
            iconType="link"
          >
            Test Connection
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {connectionStatus === "ok" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Connection successful" color="success" iconType="check" size="s">
            <p>{connectionMsg}</p>
          </EuiCallOut>
        </>
      )}
      {connectionStatus === "fail" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Connection failed" color="danger" iconType="cross" size="s">
            <p>{connectionMsg}</p>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="l" />

      {/* Index prefix — dynamic label based on event type */}
      {!isTracesMode && (
        <EuiFormRow
          label={prefixLabel}
          error={validationErrors.indexPrefix || undefined}
          isInvalid={!!validationErrors.indexPrefix}
        >
          <EuiFieldText
            value={indexPrefix}
            onChange={(e) => onIndexPrefixChange(e.target.value)}
            onBlur={onBlurIndexPrefix}
            isInvalid={!!validationErrors.indexPrefix}
          />
        </EuiFormRow>
      )}

      {/* APM index display for traces mode */}
      {isTracesMode && (
        <EuiPanel color="subdued">
          <EuiText size="s">
            <p>
              <strong>APM Indices:</strong> Traces are sent to the APM intake endpoint. Data appears
              in <code>traces-apm*</code>, <code>logs-apm*</code>, and <code>metrics-apm*</code>{" "}
              data streams.
            </p>
          </EuiText>
        </EuiPanel>
      )}

      <EuiSpacer size="l" />

      {/* Ingestion source selector */}
      <EuiFormRow label="Ingestion Source" helpText="Override default per-service ingestion path">
        <EuiButtonGroup
          legend="Ingestion source selection"
          options={INGESTION_OPTIONS}
          idSelected={ingestionSource}
          onChange={(id) => onIngestionSourceChange(id)}
        />
      </EuiFormRow>

      <EuiSpacer size="l" />

      {/* Export / Import / Reset */}
      <EuiFlexGroup gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="exportAction" size="s" onClick={onExportConfig}>
            Export Config
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="importAction" size="s" onClick={onImportConfig}>
            Import Config
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="refresh" size="s" color="danger" onClick={onResetConfig}>
            Reset Config
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
