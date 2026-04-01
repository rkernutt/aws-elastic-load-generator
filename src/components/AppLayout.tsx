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
  EuiTitle,
} from "@elastic/eui";

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
}

const NAV_ITEMS = [
  { id: "ship", label: "Ship & Monitor", icon: "play" },
  { id: "connection", label: "Connection", icon: "link" },
  { id: "services", label: "Services", icon: "apps" },
  { id: "config", label: "Configuration", icon: "controlsHorizontal" },
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
}: AppLayoutProps) {
  const sideNavItems = [
    {
      name: "Navigation",
      id: "nav-root",
      items: NAV_ITEMS.map((item) => ({
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
      <EuiPageTemplate.Sidebar sticky={{ offset: 0 }} minWidth={200}>
        <EuiSpacer size="m" />
        <EuiTitle size="xs">
          <h2>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="logoAWS" size="l" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIcon type="sortRight" size="m" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIcon type="logoElastic" size="l" />
              </EuiFlexItem>
            </EuiFlexGroup>
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <p>Load Generator</p>
        </EuiText>
        <EuiSpacer size="l" />
        <EuiSideNav items={sideNavItems} />
        <EuiSpacer size="l" />
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <EuiBadge color="hollow">v12.0.0</EuiBadge>
        </div>
      </EuiPageTemplate.Sidebar>

      <EuiPageTemplate.Section>
        <EuiPageTemplate.Header
          pageTitle=""
          rightSideItems={[
            statusBadge,
            <EuiBadge key="svc-count" color="hollow">
              {totalSelected} / {totalServices} services
            </EuiBadge>,
            scheduleActive ? (
              <EuiBadge key="sched" color="accent">
                Run {scheduleCurrentRun} / {scheduleTotalRuns}
              </EuiBadge>
            ) : null,
          ].filter(Boolean)}
          tabs={[]}
        />
        {children}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
