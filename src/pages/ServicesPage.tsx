import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiBadge,
  EuiSpacer,
  EuiAccordion,
  EuiCheckableCard,
  EuiText,
} from "@elastic/eui";
import { ServiceGrid } from "../components/ServiceGrid";
import { TRACE_SERVICES } from "../generators/traces/services";
import { useMemo } from "react";

interface ServicesPageProps {
  isTracesMode: boolean;
  eventType: string;
  selectedServices: string[];
  selectedTraceServices: string[];
  onSelectedServicesChange: (services: string[]) => void;
  onSelectedTraceServicesChange: (services: string[]) => void;
  totalSelected: number;
  totalServices: number;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (gid: string) => void;
  ingestionSource: string;
  selectAll: () => void;
  selectNone: () => void;
  toggleService: (id: string) => void;
  toggleGroupSelection: (gid: string) => void;
  getEffectiveSource: (id: string) => string;
}

export function ServicesPage({
  isTracesMode,
  eventType,
  selectedServices,
  selectedTraceServices,
  onSelectedServicesChange: _onSelectedServicesChange,
  onSelectedTraceServicesChange,
  totalSelected,
  totalServices,
  collapsedGroups,
  onToggleGroup,
  ingestionSource,
  selectAll,
  selectNone,
  toggleService,
  toggleGroupSelection,
  getEffectiveSource,
}: ServicesPageProps) {
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

  const toggleTraceService = (id: string) => {
    const next = selectedTraceServices.includes(id)
      ? selectedTraceServices.filter((s) => s !== id)
      : [...selectedTraceServices, id];
    onSelectedTraceServicesChange(next);
  };

  const selectAllTraces = () => {
    onSelectedTraceServicesChange(TRACE_SERVICES.map((s) => s.id));
  };

  const selectNoTraces = () => {
    onSelectedTraceServicesChange([]);
  };

  if (isTracesMode) {
    return (
      <>
        <EuiTitle size="s">
          <h2>Trace Services</h2>
        </EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={selectAllTraces}>
              All
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={selectNoTraces}>
              None
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{selectedTraceServices.length} selected</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {traceServiceGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 12 }}>
            <EuiAccordion
              id={`trace-group-${group.title}`}
              buttonContent={
                <EuiText size="s">
                  <strong>{group.title}</strong>{" "}
                  <EuiBadge color="hollow">{group.items.length}</EuiBadge>
                </EuiText>
              }
              initialIsOpen
              paddingSize="s"
            >
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {group.items.map((svc) => {
                  const checked = selectedTraceServices.includes(svc.id);
                  return (
                    <EuiFlexItem key={svc.id} grow={false} style={{ minWidth: 220, maxWidth: 300 }}>
                      <EuiCheckableCard
                        id={`trace-svc-${svc.id}`}
                        label={
                          <>
                            <strong>{svc.label}</strong>
                            <br />
                            <EuiText size="xs" color="subdued">
                              {svc.desc}
                            </EuiText>
                          </>
                        }
                        checked={checked}
                        onChange={() => toggleTraceService(svc.id)}
                      />
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            </EuiAccordion>
          </div>
        ))}
      </>
    );
  }

  // Logs / Metrics mode — render existing ServiceGrid
  return (
    <>
      <EuiTitle size="s">
        <h2>Services</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiPanel>
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
          toggleGroup={toggleGroupSelection}
          toggleCollapse={onToggleGroup}
          getEffectiveSource={getEffectiveSource}
        />
      </EuiPanel>
    </>
  );
}
