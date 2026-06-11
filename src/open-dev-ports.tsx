import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  closeMainWindow,
  getPreferenceValues,
  Icon,
  List,
  open,
  openExtensionPreferences,
  showToast,
  Toast,
  Keyboard,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatBytes, formatPercent, truncateCommand } from "./lib/format";
import { getProcessCwds, getProcessStats, killProcess } from "./lib/processes";
import { discoverPorts } from "./lib/ports";
import { getPreferredIDE, IDE_CONFIGS } from "./lib/project";
import { focusTerminalSession as focusPortTerminalSession } from "./lib/terminal";
import { PortProcess } from "./types";

type CommandPreferences = Preferences.OpenDevPorts;

export default function Command() {
  const preferences = getPreferenceValues<CommandPreferences>();
  const [showAllPorts, setShowAllPorts] = useState(Boolean(preferences.showAllPortsByDefault));
  const [showDetails, setShowDetails] = useState(true);
  const lastErrorMessageRef = useRef<string | undefined>(undefined);
  const { data: ports = [], error, isLoading, revalidate } = usePromise(discoverPorts, [preferences.defaultHost]);

  const visiblePorts = useMemo(
    () => (showAllPorts ? ports : ports.filter((port) => port.isDevServer)),
    [ports, showAllPorts],
  );
  const devPorts = useMemo(() => ports.filter((port) => port.isDevServer), [ports]);
  const navigationTitle = showAllPorts
    ? `Open Dev Ports (${ports.length} ${ports.length === 1 ? "Port" : "Ports"})`
    : `Open Dev Ports (${devPorts.length} ${devPorts.length === 1 ? "Dev Port" : "Dev Ports"})`;

  useEffect(() => {
    const interval = setInterval(() => {
      revalidate();
    }, 2000);

    return () => clearInterval(interval);
  }, [revalidate]);

  useEffect(() => {
    if (!error) {
      lastErrorMessageRef.current = undefined;
      return;
    }

    if (lastErrorMessageRef.current === error.message) {
      return;
    }

    lastErrorMessageRef.current = error.message;

    showToast({
      style: Toast.Style.Failure,
      title: "Could not load listening ports",
      message: error.message,
    });
  }, [error]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetails}
      navigationTitle={navigationTitle}
      searchBarPlaceholder="Search by port, process, command, PID, or directory"
    >
      <List.EmptyView
        icon={Icon.Network}
        title={showAllPorts ? "No listening ports" : "No dev servers running"}
        description={
          showAllPorts ? "No local TCP listeners were found." : "Toggle Show All Ports to include system ports."
        }
        actions={
          <ActionPanel>
            <Action
              title={showAllPorts ? "Show Dev Ports Only" : "Show All Ports"}
              icon={showAllPorts ? Icon.Filter : Icon.Eye}
              onAction={() => setShowAllPorts((value) => !value)}
            />
            <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
          </ActionPanel>
        }
      />
      {visiblePorts.map((port) => (
        <PortListItem
          key={port.id}
          port={port}
          preferences={preferences}
          devPorts={devPorts}
          showAllPorts={showAllPorts}
          showDetails={showDetails}
          onToggleShowAllPorts={() => setShowAllPorts((value) => !value)}
          onToggleDetails={() => setShowDetails((value) => !value)}
          onRefresh={revalidate}
        />
      ))}
    </List>
  );
}

function PortListItem({
  port,
  preferences,
  devPorts,
  showAllPorts,
  showDetails,
  onToggleShowAllPorts,
  onToggleDetails,
  onRefresh,
}: {
  port: PortProcess;
  preferences: CommandPreferences;
  devPorts: PortProcess[];
  showAllPorts: boolean;
  showDetails: boolean;
  onToggleShowAllPorts: () => void;
  onToggleDetails: () => void;
  onRefresh: () => void;
}) {
  const accessories = isLocalOnlyAddress(port.boundAddress)
    ? []
    : [{ icon: Icon.Network, tooltip: "Available on LAN" }];

  return (
    <List.Item
      icon={port.isDevServer ? Icon.Terminal : Icon.Circle}
      title={`${port.displayName} :${port.port}`}
      keywords={[
        String(port.port),
        String(port.pid),
        port.processName,
        port.command ?? "",
        port.cwd ?? "",
        port.boundAddress,
        port.url,
      ]}
      accessories={accessories}
      detail={<PortDetail port={port} />}
      actions={
        <PortActions
          port={port}
          preferences={preferences}
          devPorts={devPorts}
          showAllPorts={showAllPorts}
          showDetails={showDetails}
          onToggleShowAllPorts={onToggleShowAllPorts}
          onToggleDetails={onToggleDetails}
          onRefresh={onRefresh}
        />
      }
    />
  );
}

function isLocalOnlyAddress(boundAddress: string): boolean {
  return ["127.0.0.1", "::1", "[::1]", "localhost"].includes(boundAddress);
}

function PortActions({
  port,
  preferences,
  devPorts,
  showAllPorts,
  showDetails,
  onToggleShowAllPorts,
  onToggleDetails,
  onRefresh,
}: {
  port: PortProcess;
  preferences: CommandPreferences;
  devPorts: PortProcess[];
  showAllPorts: boolean;
  showDetails: boolean;
  onToggleShowAllPorts: () => void;
  onToggleDetails: () => void;
  onRefresh: () => void;
}) {
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action title="Open URL" icon={Icon.Globe} onAction={() => openPortUrl(port, preferences)} />
        <Action
          title="Focus Terminal Session"
          icon={Icon.Terminal}
          shortcut={{ modifiers: ["cmd"], key: "t" }}
          onAction={() => focusTerminalForPort(port, preferences)}
        />
        <Action.CopyToClipboard title="Copy URL" content={port.url} shortcut={Keyboard.Shortcut.Common.Pin} />
      </ActionPanel.Section>
      {port.cwd ? (
        <ActionPanel.Section title="Project">
          <Action.Open
            title={getOpenProjectTitle(preferences)}
            icon={Icon.Code}
            target={port.cwd}
            application={getPreferredIDE(preferences.preferredIDE)?.application}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
          <Action.Open title="Open Project Folder" icon={Icon.Folder} target={port.cwd} />
          <Action.ShowInFinder path={port.cwd} />
          <ActionPanel.Submenu title="Open Project with…" icon={Icon.Code}>
            {IDE_CONFIGS.map((ide) => (
              <Action.Open
                key={ide.id}
                title={`Open in ${ide.title}`}
                target={port.cwd ?? ""}
                application={ide.application}
              />
            ))}
            <Action.Open title="Open with System Default" icon={Icon.Folder} target={port.cwd} />
            <Action.OpenWith title="Choose Application…" path={port.cwd} />
          </ActionPanel.Submenu>
        </ActionPanel.Section>
      ) : null}
      <ActionPanel.Section title="Copy">
        <Action.CopyToClipboard title="Copy Port" content={String(port.port)} />
        <Action.CopyToClipboard title="Copy PID" content={String(port.pid)} />
        {port.lanUrls.length > 0 ? (
          <Action.CopyToClipboard title="Copy LAN URLs" content={port.lanUrls.join("\n")} />
        ) : null}
        {port.command ? <Action.CopyToClipboard title="Copy Command" content={port.command} /> : null}
        {port.cwd ? <Action.CopyToClipboard title="Copy Directory" content={port.cwd} /> : null}
      </ActionPanel.Section>
      <ActionPanel.Section title="Process">
        <Action
          title="Kill Process"
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "k" }}
          onAction={() => killPortProcess(port, "SIGTERM", Boolean(preferences.confirmBeforeKill), onRefresh)}
        />
        <Action
          title="Kill All Dev Ports"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
          onAction={() => killAllDevPorts(devPorts, Boolean(preferences.confirmBeforeKill), onRefresh)}
        />
        <Action
          title="Force Kill Process"
          icon={Icon.ExclamationMark}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
          onAction={() => killPortProcess(port, "SIGKILL", Boolean(preferences.confirmBeforeForceKill), onRefresh)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="View">
        <Action
          title={showAllPorts ? "Show Dev Ports Only" : "Show All Ports"}
          icon={showAllPorts ? Icon.Filter : Icon.Eye}
          shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
          onAction={onToggleShowAllPorts}
        />
        <Action
          title={showDetails ? "Hide Details" : "Show Details"}
          icon={showDetails ? Icon.Sidebar : Icon.AppWindowSidebarLeft}
          shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
          onAction={onToggleDetails}
        />
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={onRefresh}
        />
        <Action title="Configure Dev Ports" icon={Icon.Gear} onAction={openExtensionPreferences} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function PortDetail({ port }: { port: PortProcess }) {
  const command = truncateCommand(port.command);
  const markdownSections = [
    `# ${port.displayName} :${port.port}`,
    `\`${port.url}\``,
    port.cwd ? `**Directory**\n\n\`${port.cwd}\`` : undefined,
    port.lanUrls.length > 0 ? `**LAN URLs**\n\n${port.lanUrls.map((url) => `- \`${url}\``).join("\n")}` : undefined,
    command ? `**Command**\n\n\`\`\`sh\n${command}\n\`\`\`` : undefined,
  ].filter((section): section is string => Boolean(section));
  const markdown = markdownSections.join("\n\n");

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Port" text={String(port.port)} />
          <List.Item.Detail.Metadata.Label title="PID" text={String(port.pid)} />
          <List.Item.Detail.Metadata.Label title="Process" text={port.processName} />
          <List.Item.Detail.Metadata.Label title="Bound Address" text={port.boundAddresses.join(", ")} />
          <List.Item.Detail.Metadata.Label title="URL" text={port.url} />
          {port.lanUrls.map((url, index) => (
            <List.Item.Detail.Metadata.Label key={url} title={index === 0 ? "LAN URL" : "LAN URL "} text={url} />
          ))}
          {port.user ? <List.Item.Detail.Metadata.Label title="User" text={port.user} /> : null}
          {port.tty ? <List.Item.Detail.Metadata.Label title="TTY" text={port.tty} /> : null}
          {port.cwd ? <List.Item.Detail.Metadata.Label title="Directory" text={port.cwd} /> : null}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.TagList title="Classification">
            <List.Item.Detail.Metadata.TagList.Item
              text={port.isDevServer ? "Development server" : "Listening port"}
              color={port.isDevServer ? Color.Green : Color.SecondaryText}
            />
          </List.Item.Detail.Metadata.TagList>
          {port.devReasons.length > 0 ? (
            <List.Item.Detail.Metadata.TagList title="Matched By">
              {port.devReasons.map((reason) => (
                <List.Item.Detail.Metadata.TagList.Item key={reason} text={reason} color={Color.Blue} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="CPU" text={formatPercent(port.cpuPercent)} />
          <List.Item.Detail.Metadata.Label title="Memory" text={formatBytes(port.memoryBytes)} />
          <List.Item.Detail.Metadata.Label title="Uptime" text={port.uptime ?? "Unknown"} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

async function openPortUrl(port: PortProcess, preferences: CommandPreferences) {
  await open(port.url);

  if (preferences.closeAfterOpening) {
    await closeMainWindow();
  }
}

async function focusTerminalForPort(port: PortProcess, preferences: CommandPreferences) {
  try {
    const title = await focusPortTerminalSession(port, preferences.preferredTerminal);
    await showToast({
      style: Toast.Style.Success,
      title,
      message: `${port.displayName} (${port.pid})`,
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not focus terminal session",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getOpenProjectTitle(preferences: CommandPreferences): string {
  const preferredIDE = getPreferredIDE(preferences.preferredIDE);

  return preferredIDE ? `Open Project in ${preferredIDE.title}` : "Open Project";
}

async function killPortProcess(
  port: PortProcess,
  signal: NodeJS.Signals,
  shouldConfirm: boolean,
  onRefresh: () => void,
) {
  const runKill = async () => {
    try {
      await assertProcessStillMatches(port);
      await killProcess(port.pid, signal);
      await showToast({
        style: Toast.Style.Success,
        title: signal === "SIGKILL" ? "Force killed process" : "Killed process",
        message: `${port.displayName} (${port.pid})`,
      });
      onRefresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not kill process",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!shouldConfirm) {
    await runKill();
    return;
  }

  await confirmAlert({
    title: signal === "SIGKILL" ? "Force kill this process?" : "Kill this process?",
    message: `${port.displayName} is listening on ${port.url}. PID ${port.pid} will receive ${signal}.`,
    primaryAction: {
      title: signal === "SIGKILL" ? "Force Kill" : "Kill",
      style: Alert.ActionStyle.Destructive,
      onAction: runKill,
    },
  });
}

async function killAllDevPorts(devPorts: PortProcess[], shouldConfirm: boolean, onRefresh: () => void) {
  const processes = getUniqueProcesses(devPorts);

  if (processes.length === 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No dev ports to kill",
    });
    return;
  }

  const runKillAll = async () => {
    const failures: string[] = [];

    for (const port of processes) {
      try {
        await assertProcessStillMatches(port);
        await killProcess(port.pid, "SIGTERM");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${port.displayName} (${port.pid}): ${message}`);
      }
    }

    if (failures.length > 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Killed ${processes.length - failures.length} of ${processes.length} processes`,
        message: failures[0],
      });
    } else {
      await showToast({
        style: Toast.Style.Success,
        title: `Killed ${processes.length} dev ${processes.length === 1 ? "process" : "processes"}`,
      });
    }

    onRefresh();
  };

  if (!shouldConfirm) {
    await runKillAll();
    return;
  }

  await confirmAlert({
    title: "Kill all dev ports?",
    message: `${processes.length} dev ${processes.length === 1 ? "process" : "processes"} will receive SIGTERM.`,
    primaryAction: {
      title: "Kill All",
      style: Alert.ActionStyle.Destructive,
      onAction: runKillAll,
    },
  });
}

async function assertProcessStillMatches(port: PortProcess): Promise<void> {
  const [statsByPid, cwdByPid] = await Promise.all([getProcessStats([port.pid]), getProcessCwds([port.pid])]);
  const stats = statsByPid.get(port.pid);

  if (!stats) {
    throw new Error("Process is no longer running.");
  }

  if (!port.command || !stats.command) {
    throw new Error("Process identity could not be verified. Refresh and try again.");
  }

  if (stats.command !== port.command) {
    throw new Error("Process changed since the list was refreshed. Refresh and try again.");
  }

  const cwd = cwdByPid.get(port.pid);

  if (port.cwd) {
    if (!cwd) {
      throw new Error("Process directory could not be verified. Refresh and try again.");
    }

    if (cwd !== port.cwd) {
      throw new Error("Process changed directory since the list was refreshed. Refresh and try again.");
    }
  }
}

function getUniqueProcesses(ports: PortProcess[]): PortProcess[] {
  const processByPid = new Map<number, PortProcess>();

  for (const port of ports) {
    if (!processByPid.has(port.pid)) {
      processByPid.set(port.pid, port);
    }
  }

  return Array.from(processByPid.values());
}
