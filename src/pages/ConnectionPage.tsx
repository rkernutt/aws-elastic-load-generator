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

type DeploymentType = "self-managed" | "cloud-hosted" | "serverless";

interface ConnectionPageProps {
  deploymentType: DeploymentType;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  indexPrefix: string;
  isTracesMode: boolean;
  eventType: string;
  connectionStatus: "idle" | "testing" | "ok" | "fail";
  connectionMsg: string;
  validationErrors: { elasticUrl: string; apiKey: string; indexPrefix: string };
  ingestionSource: string;
  onDeploymentTypeChange: (val: DeploymentType) => void;
  onElasticUrlChange: (val: string) => void;
  onKibanaUrlChange: (val: string) => void;
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

const DEPLOYMENT_OPTIONS = [
  { id: "self-managed", label: "Self-Managed" },
  { id: "cloud-hosted", label: "Cloud Hosted" },
  { id: "serverless", label: "Cloud Serverless" },
];

const EVENT_TYPE_OPTIONS = [
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "traces", label: "Traces" },
];

// 7 options laid out as 4 + 3
const INGESTION_ROW1 = [
  { id: "default", label: "Default" },
  { id: "s3", label: "S3" },
  { id: "cloudwatch", label: "CloudWatch" },
  { id: "firehose", label: "Firehose" },
];
const INGESTION_ROW2 = [
  { id: "api", label: "API" },
  { id: "otel", label: "OTel" },
  { id: "agent", label: "Agent" },
];

function esUrlPlaceholder(deploymentType: DeploymentType): string {
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  if (deploymentType === "cloud-hosted")
    return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
  return "http://localhost:9200";
}

function kbUrlPlaceholder(deploymentType: DeploymentType): string {
  if (deploymentType === "serverless")
    return "https://my-deployment.kb.eu-west-2.aws.elastic.cloud";
  if (deploymentType === "cloud-hosted")
    return "https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243";
  return "http://localhost:5601";
}

export function ConnectionPage({
  deploymentType,
  elasticUrl,
  kibanaUrl,
  apiKey,
  indexPrefix,
  isTracesMode,
  eventType,
  connectionStatus,
  connectionMsg,
  validationErrors,
  ingestionSource,
  onDeploymentTypeChange,
  onElasticUrlChange,
  onKibanaUrlChange,
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

      {/* Deployment type — first thing the user selects */}
      <EuiFormRow
        label="Deployment Type"
        helpText="Determines how Kibana URL is derived and which features are available"
      >
        <EuiButtonGroup
          legend="Deployment type selection"
          options={DEPLOYMENT_OPTIONS}
          idSelected={deploymentType}
          onChange={(id) => onDeploymentTypeChange(id as DeploymentType)}
        />
      </EuiFormRow>

      <EuiSpacer size="l" />

      {/* Event type */}
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
        helpText={`e.g. ${esUrlPlaceholder(deploymentType)}`}
      >
        <EuiFieldText
          value={elasticUrl}
          onChange={(e) => onElasticUrlChange(e.target.value)}
          onBlur={onBlurElasticUrl}
          isInvalid={!!validationErrors.elasticUrl}
          placeholder={esUrlPlaceholder(deploymentType)}
        />
      </EuiFormRow>

      {/* Kibana URL — auto-derived for cloud, manual for self-managed */}
      <EuiFormRow
        label="Kibana URL"
        helpText={
          deploymentType !== "self-managed"
            ? "Auto-derived from ES URL — edit to override. Required for Dashboard and Integration installs."
            : "Required for Dashboard and Integration installs."
        }
      >
        <EuiFieldText
          value={kibanaUrl}
          onChange={(e) => onKibanaUrlChange(e.target.value)}
          placeholder={kbUrlPlaceholder(deploymentType)}
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

      {/* Index prefix */}
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

      {/* Ingestion source — 4 on top row, 3 on bottom row */}
      <EuiFormRow
        label="Ingestion Source"
        helpText="Override default per-service ingestion path"
        fullWidth
      >
        <>
          <EuiButtonGroup
            legend="Ingestion source selection (row 1)"
            options={INGESTION_ROW1}
            idSelected={ingestionSource}
            onChange={(id) => onIngestionSourceChange(id)}
            isFullWidth
          />
          <EuiSpacer size="xs" />
          <EuiButtonGroup
            legend="Ingestion source selection (row 2)"
            options={INGESTION_ROW2}
            idSelected={ingestionSource}
            onChange={(id) => onIngestionSourceChange(id)}
            isFullWidth
          />
        </>
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
