export type DefaultHostPreference = Preferences.OpenDevPorts["defaultHost"];
export type PreferredTerminalPreference = Preferences.OpenDevPorts["preferredTerminal"];
export type PreferredIDEPreference = Preferences.OpenDevPorts["preferredIDE"];

export type ProcessStats = {
  pid: number;
  parentPid?: number;
  user?: string;
  tty?: string;
  command?: string;
  cpuPercent?: number;
  memoryBytes?: number;
  uptime?: string;
};

export type PortProcess = {
  id: string;
  pid: number;
  port: number;
  protocol: "tcp";
  boundAddress: string;
  boundAddresses: string[];
  url: string;
  lanUrls: string[];
  processName: string;
  displayName: string;
  command?: string;
  cwd?: string;
  user?: string;
  tty?: string;
  terminalTtys?: string[];
  terminalCommands?: string[];
  cpuPercent?: number;
  memoryBytes?: number;
  uptime?: string;
  isDevServer: boolean;
  devReasons: string[];
};
