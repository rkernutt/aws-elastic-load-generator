import React from "react";
import {
  EuiPageTemplate,
  EuiSideNav,
  EuiIcon,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiStepsHorizontal,
} from "@elastic/eui";
import { PipelineLogo } from "./Logo";

interface AppLayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  status: "running" | "done" | "aborted" | null;
  totalSelected: number;
  totalServices: number;
  scheduleActive: boolean;
  scheduleCurrentRun: number;
  scheduleTotalRuns: number;
  isConnected: boolean;
  hasServicesSelected: boolean;
}

/** Wizard steps in logical order */
const STEPS = [
  { id: "connection", title: "Connect" },
  { id: "services", title: "Select" },
  { id: "config", title: "Configure" },
  { id: "ship", title: "Ship" },
] as const;

const STEP_IDS = STEPS.map((s) => s.id);

/** Secondary nav items below the wizard */
const EXTRA_NAV = [
  { id: "schedule", label: "Scheduling", icon: "clock" },
  { id: "anomalies", label: "Anomalies", icon: "bug" },
  { id: "log", label: "Activity Log", icon: "list" },
] as const;

export function AppLayout({
  activePage,
  onNavigate,
  children,
  status,
  totalSelected,
  totalServices,
  scheduleActive,
  scheduleCurrentRun,
  scheduleTotalRuns,
  isConnected,
  hasServicesSelected,
}: AppLayoutProps) {
  /** Determine step status for the horizontal stepper */
  const activeStepIdx = STEP_IDS.indexOf(activePage as (typeof STEP_IDS)[number]);

  const stepStatuses = STEPS.map((step, idx) => {
    // Determine completion
    let isComplete = false;
    if (step.id === "connection") isComplete = isConnected;
    if (step.id === "services") isComplete = hasServicesSelected;
    if (step.id === "config") isComplete = hasServicesSelected; // config has defaults, always "ready"
    if (step.id === "ship") isComplete = status === "done";

    let stepStatus: "complete" | "current" | "incomplete" | "disabled";
    if (idx === activeStepIdx) {
      stepStatus = "current";
    } else if (isComplete) {
      stepStatus = "complete";
    } else {
      stepStatus = "incomplete";
    }

    return {
      title: step.title,
      status: stepStatus,
      onClick: () => onNavigate(step.id),
    };
  });

  const sideNavItems = [
    {
      name: "More",
      id: "nav-extra",
      items: EXTRA_NAV.map((item) => ({
        id: item.id,
        name: item.label,
        icon: <EuiIcon type={item.icon} />,
        isSelected: activePage === item.id,
        onClick: () => onNavigate(item.id),
      })),
    },
  ];

  const statusBadge = (() => {
    if (status === "running") return <EuiBadge color="primary">Shipping</EuiBadge>;
    if (status === "done") return <EuiBadge color="success">Complete</EuiBadge>;
    if (status === "aborted") return <EuiBadge color="danger">Aborted</EuiBadge>;
    return null;
  })();

  return (
    <EuiPageTemplate restrictWidth={false} grow>
      <EuiPageTemplate.Sidebar sticky={{ offset: 0 }} minWidth={210}>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <PipelineLogo size={36} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>AWS → Elastic</strong>
            </EuiText>
            <EuiText size="xs" color="subdued">
              Load Generator
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />
        <EuiSideNav items={sideNavItems} />
        <EuiSpacer size="l" />
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">v12.0.0</EuiBadge>
            </EuiFlexItem>
            {statusBadge && <EuiFlexItem grow={false}>{statusBadge}</EuiFlexItem>}
            {scheduleActive && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="accent">
                  Run {scheduleCurrentRun}/{scheduleTotalRuns}
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </div>
      </EuiPageTemplate.Sidebar>

      <EuiPageTemplate.Section>
        {/* Wizard stepper at top of content area */}
        <EuiStepsHorizontal steps={stepStatuses} />
        <EuiSpacer size="m" />

        {/* Top bar with service count */}
        <EuiFlexGroup justifyContent="flexEnd" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              {totalSelected} / {totalServices} services
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {children}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
