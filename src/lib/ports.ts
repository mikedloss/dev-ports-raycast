import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { DefaultHostPreference, PortProcess } from "../types";
import { getProcessAncestors, getProcessCwds, getProcessStats } from "./processes";
import { detectUrlScheme } from "./probe";

const execFileAsync = promisify(execFile);

const DEV_PROCESS_PATTERNS = [
  "air",
  "astro",
  "bun",
  "cargo",
  "deno",
  "django",
  "esbuild",
  "flask",
  "go run",
  "gunicorn",
  "http-server",
  "next",
  "next-server",
  "node",
  "nodemon",
  "nuxt",
  "python",
  "python3",
  "rails",
  "rails-server",
  "react-scripts",
  "remix",
  "ruby",
  "svelte-kit",
  "ts-node",
  "tsx",
  "uvicorn",
  "vite",
  "webpack",
];

const PROJECT_MARKERS = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "mix.exs",
  "deno.json",
  "deno.jsonc",
];

type LsofEntry = {
  pid: number;
  processName: string;
  user?: string;
  boundAddress: string;
  port: number;
};

export async function discoverPorts(defaultHost: DefaultHostPreference): Promise<PortProcess[]> {
  const entries = groupEquivalentEntries(await getListeningPorts());
  const pids = entries.map((entry) => entry.pid);
  const lanHosts = getLanHosts();
  const [statsByPid, cwdByPid, ancestorsByPid] = await Promise.all([
    getProcessStats(pids),
    getProcessCwds(pids),
    getProcessAncestors(pids),
  ]);

  const ports = await Promise.all(
    entries.map(async (entry) => {
      const stats = statsByPid.get(entry.pid);
      const ancestors = ancestorsByPid.get(entry.pid) ?? [];
      const cwd = cwdByPid.get(entry.pid);
      const command = stats?.command;
      const devReasons = await getDevReasons(entry.processName, command, cwd);
      const displayName = getDisplayName(entry.processName, cwd);
      const url = await buildLocalUrl(entry.boundAddress, entry.port, defaultHost);
      const lanUrls = await buildLanUrls(entry.boundAddress, entry.port, lanHosts);

      return {
        id: `${entry.pid}:${entry.boundAddress}:${entry.port}`,
        pid: entry.pid,
        port: entry.port,
        protocol: "tcp" as const,
        boundAddress: entry.boundAddress,
        boundAddresses: entry.boundAddresses,
        url,
        lanUrls,
        processName: entry.processName,
        displayName,
        command,
        cwd,
        user: stats?.user ?? entry.user,
        tty: stats?.tty,
        terminalTtys: uniqueDefined([stats?.tty, ...ancestors.map((ancestor) => ancestor.tty)]),
        terminalCommands: uniqueDefined([command, ...ancestors.map((ancestor) => ancestor.command)]),
        cpuPercent: stats?.cpuPercent,
        memoryBytes: stats?.memoryBytes,
        uptime: stats?.uptime,
        isDevServer: devReasons.length > 0,
        devReasons,
      };
    }),
  );

  return ports.sort(comparePorts);
}

function groupEquivalentEntries(entries: LsofEntry[]): Array<LsofEntry & { boundAddresses: string[] }> {
  const grouped = new Map<string, LsofEntry & { boundAddresses: string[] }>();

  for (const entry of entries) {
    const scope = getAddressScope(entry.boundAddress);
    const key = `${entry.pid}:${entry.port}:${scope}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.boundAddresses = uniqueDefined([...existing.boundAddresses, entry.boundAddress]).sort(compareAddresses);
      existing.boundAddress = choosePrimaryAddress(existing.boundAddresses);
      continue;
    }

    grouped.set(key, {
      ...entry,
      boundAddresses: [entry.boundAddress],
    });
  }

  return Array.from(grouped.values());
}

function getAddressScope(boundAddress: string): string {
  if (isLocalOnlyAddress(boundAddress)) {
    return "local";
  }

  if (isWildcardAddress(boundAddress)) {
    return "lan";
  }

  return boundAddress;
}

function choosePrimaryAddress(boundAddresses: string[]): string {
  return [...boundAddresses].sort(compareAddresses)[0] ?? "*";
}

function compareAddresses(a: string, b: string): number {
  return getAddressRank(a) - getAddressRank(b) || a.localeCompare(b);
}

function getAddressRank(boundAddress: string): number {
  if (boundAddress === "127.0.0.1") {
    return 0;
  }

  if (boundAddress === "::1" || boundAddress === "[::1]") {
    return 1;
  }

  if (boundAddress === "localhost") {
    return 2;
  }

  if (isWildcardAddress(boundAddress)) {
    return 3;
  }

  return 4;
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || value === "??" || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function comparePorts(a: PortProcess, b: PortProcess): number {
  if (a.isDevServer !== b.isDevServer) {
    return a.isDevServer ? -1 : 1;
  }

  if (a.port !== b.port) {
    return a.port - b.port;
  }

  return a.displayName.localeCompare(b.displayName);
}

async function getListeningPorts(): Promise<LsofEntry[]> {
  const { stdout } = await execFileAsync("/usr/sbin/lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcnL"]);
  const entries: LsofEntry[] = [];
  let currentProcess: Pick<LsofEntry, "pid" | "processName" | "user"> | undefined;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const field = line[0];
    const value = line.slice(1);

    if (field === "p") {
      currentProcess = {
        pid: Number(value),
        processName: "Unknown",
      };
      continue;
    }

    if (!currentProcess) {
      continue;
    }

    if (field === "c") {
      currentProcess.processName = value;
      continue;
    }

    if (field === "L") {
      currentProcess.user = value;
      continue;
    }

    if (field === "n") {
      const address = parseListenAddress(value);

      if (!address || !Number.isFinite(currentProcess.pid)) {
        continue;
      }

      entries.push({
        ...currentProcess,
        boundAddress: address.host,
        port: address.port,
      });
    }
  }

  return dedupeEntries(entries);
}

function dedupeEntries(entries: LsofEntry[]): LsofEntry[] {
  const seen = new Set<string>();
  const deduped: LsofEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.pid}:${entry.boundAddress}:${entry.port}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function parseListenAddress(value: string): { host: string; port: number } | undefined {
  const normalized = value.replace(/\s+\(LISTEN\)$/i, "");
  const match = normalized.match(/^(.*):(\d+)$/);

  if (!match) {
    return undefined;
  }

  const [, hostValue, portValue] = match;
  const port = Number(portValue);

  if (!Number.isInteger(port)) {
    return undefined;
  }

  return {
    host: hostValue || "*",
    port,
  };
}

async function buildLocalUrl(boundAddress: string, port: number, defaultHost: DefaultHostPreference): Promise<string> {
  const host = getUrlHost(boundAddress, defaultHost);
  const scheme = await detectUrlScheme(host, port);

  return `${scheme}://${host}:${port}`;
}

async function buildLanUrls(boundAddress: string, port: number, lanHosts: string[]): Promise<string[]> {
  if (isLocalOnlyAddress(boundAddress) || lanHosts.length === 0) {
    return [];
  }

  return Promise.all(
    lanHosts.map(async (host) => {
      const scheme = await detectUrlScheme(host, port);
      return `${scheme}://${host}:${port}`;
    }),
  );
}

function getLanHosts(): string[] {
  const addresses = new Set<string>();

  for (const networkAddresses of Object.values(os.networkInterfaces())) {
    for (const address of networkAddresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        addresses.add(address.address);
      }
    }
  }

  return Array.from(addresses).sort();
}

function isLocalOnlyAddress(boundAddress: string): boolean {
  return ["127.0.0.1", "::1", "[::1]", "localhost"].includes(boundAddress);
}

function isWildcardAddress(boundAddress: string): boolean {
  return ["*", "0.0.0.0", "::", "[::]"].includes(boundAddress);
}

function getUrlHost(boundAddress: string, defaultHost: DefaultHostPreference): string {
  if (defaultHost !== "bound-address") {
    return defaultHost;
  }

  if (boundAddress === "*" || boundAddress === "0.0.0.0" || boundAddress === "::" || boundAddress === "[::]") {
    return "localhost";
  }

  if (boundAddress.startsWith("[") && boundAddress.endsWith("]")) {
    return boundAddress;
  }

  if (boundAddress.includes(":")) {
    return `[${boundAddress}]`;
  }

  return boundAddress;
}

async function getDevReasons(processName: string, command?: string, cwd?: string): Promise<string[]> {
  const reasons = new Set<string>();
  const searchable = `${processName} ${command ?? ""}`.toLowerCase();

  for (const pattern of DEV_PROCESS_PATTERNS) {
    if (searchable.includes(pattern)) {
      reasons.add(`process:${pattern}`);
    }
  }

  if (cwd) {
    const marker = await findProjectMarker(cwd);

    if (marker) {
      reasons.add(`project:${marker}`);
    }
  }

  return Array.from(reasons);
}

async function findProjectMarker(cwd: string): Promise<string | undefined> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await access(path.join(cwd, marker));
      return marker;
    } catch {
      // Keep checking other project marker files.
    }
  }

  return undefined;
}

function getDisplayName(processName: string, cwd?: string): string {
  if (!cwd) {
    return processName;
  }

  const basename = path.basename(cwd);
  return basename || processName;
}
