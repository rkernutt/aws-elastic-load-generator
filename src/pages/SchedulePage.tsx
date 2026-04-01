import {
  EuiSwitch,
  EuiFormRow,
  EuiRange,
  EuiCallOut,
  EuiText,
  EuiSpacer,
  EuiTitle,
} from "@elastic/eui";

interface SchedulePageProps {
  scheduleEnabled: boolean;
  scheduleTotalRuns: number;
  scheduleIntervalMin: number;
  onScheduleEnabledChange: (val: boolean) => void;
  onScheduleTotalRunsChange: (val: number) => void;
  onScheduleIntervalMinChange: (val: number) => void;
}

export function SchedulePage({
  scheduleEnabled,
  scheduleTotalRuns,
  scheduleIntervalMin,
  onScheduleEnabledChange,
  onScheduleTotalRunsChange,
  onScheduleIntervalMinChange,
}: SchedulePageProps) {
  const totalMinutes = scheduleTotalRuns * scheduleIntervalMin;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <>
      <EuiTitle size="s">
        <h2>Scheduling</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiCallOut title="Scheduled shipping mode" color="primary" iconType="clock" size="s">
        <p>
          When enabled, clicking Ship will automatically repeat the shipping process at the
          configured interval. This is useful for generating continuous data over time to build
          realistic time-series patterns.
        </p>
      </EuiCallOut>

      <EuiSpacer size="m" />

      <EuiSwitch
        label="Enable scheduled shipping"
        checked={scheduleEnabled}
        onChange={(e) => onScheduleEnabledChange(e.target.checked)}
      />

      <EuiSpacer size="m" />

      <EuiFormRow label="Total runs" helpText={`Will ship ${scheduleTotalRuns} times`}>
        <EuiRange
          min={2}
          max={100}
          step={1}
          value={scheduleTotalRuns}
          onChange={(e) => onScheduleTotalRunsChange(Number(e.currentTarget.value))}
          showInput
          showLabels
          disabled={!scheduleEnabled}
        />
      </EuiFormRow>

      <EuiFormRow
        label="Interval (minutes)"
        helpText={`${scheduleIntervalMin} minutes between runs`}
      >
        <EuiRange
          min={1}
          max={120}
          step={1}
          value={scheduleIntervalMin}
          onChange={(e) => onScheduleIntervalMinChange(Number(e.currentTarget.value))}
          showInput
          showLabels
          disabled={!scheduleEnabled}
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiText size="s" color="subdued">
        <p>
          <strong>Estimated total time:</strong> {scheduleTotalRuns} runs x {scheduleIntervalMin}{" "}
          min = <strong>{timeStr}</strong>
        </p>
      </EuiText>
    </>
  );
}
