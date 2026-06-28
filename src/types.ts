export type DefaultHostPreference = "localhost" | "127.0.0.1" | "bound-address";
export type PreferredTerminalPreference = "auto" | "iterm" | "terminal";
export type PreferredIDEPreference =
  | "auto"
  | "cursor"
  | "visual-studio-code"
  | "zed"
  | "webstorm"
  | "intellij-idea"
  | "pycharm"
  | "sublime-text"
  | "xcode"
  | "system";

export type Preferences = {
  showAllPortsByDefault?: boolean;
  defaultHost: DefaultHostPreference;
  preferredTerminal: PreferredTerminalPreference;
  preferredIDE: PreferredIDEPreference;
  confirmBeforeKill?: boolean;
  confirmBeforeForceKill?: boolean;
  closeAfterOpening?: boolean;
};

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
