import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ProcessStats } from "../types";

const execFileAsync = promisify(execFile);

export async function getProcessStats(pids: number[]): Promise<Map<number, ProcessStats>> {
  const uniquePids = Array.from(new Set(pids)).filter((pid) => Number.isInteger(pid) && pid > 0);
  const statsByPid = new Map<number, ProcessStats>();

  if (uniquePids.length === 0) {
    return statsByPid;
  }

  const { stdout } = await execFileAsync("/bin/ps", [
    "-p",
    uniquePids.join(","),
    "-o",
    "pid=",
    "-o",
    "ppid=",
    "-o",
    "user=",
    "-o",
    "tty=",
    "-o",
    "pcpu=",
    "-o",
    "rss=",
    "-o",
    "etime=",
    "-o",
    "command=",
  ]);

  for (const line of stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, pidValue, parentPidValue, user, tty, cpuValue, rssValue, uptime, command] = match;
    const pid = Number(pidValue);
    const parentPid = Number(parentPidValue);
    const cpuPercent = Number(cpuValue);
    const rssKilobytes = Number(rssValue);

    statsByPid.set(pid, {
      pid,
      parentPid: Number.isFinite(parentPid) ? parentPid : undefined,
      user,
      tty,
      command,
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : undefined,
      memoryBytes: Number.isFinite(rssKilobytes) ? rssKilobytes * 1024 : undefined,
      uptime,
    });
  }

  return statsByPid;
}

export async function getProcessCwds(pids: number[]): Promise<Map<number, string>> {
  const uniquePids = Array.from(new Set(pids)).filter((pid) => Number.isInteger(pid) && pid > 0);
  const cwdByPid = new Map<number, string>();

  if (uniquePids.length === 0) {
    return cwdByPid;
  }

  try {
    const { stdout } = await execFileAsync("/usr/sbin/lsof", [
      "-nP",
      "-a",
      "-p",
      uniquePids.join(","),
      "-d",
      "cwd",
      "-Fn",
    ]);
    let currentPid: number | undefined;

    for (const rawLine of stdout.split("\n")) {
      const line = rawLine.trim();

      if (line.startsWith("p")) {
        currentPid = Number(line.slice(1));
        continue;
      }

      if (currentPid !== undefined && line.startsWith("n")) {
        cwdByPid.set(currentPid, line.slice(1));
      }
    }
  } catch {
    // Some protected processes do not expose cwd. Missing cwd should not block the port list.
  }

  return cwdByPid;
}

export async function getProcessAncestors(pids: number[]): Promise<Map<number, ProcessStats[]>> {
  const uniquePids = Array.from(new Set(pids)).filter((pid) => Number.isInteger(pid) && pid > 0);
  const ancestorsByPid = new Map<number, ProcessStats[]>();

  if (uniquePids.length === 0) {
    return ancestorsByPid;
  }

  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=", "-o", "ppid=", "-o", "tty=", "-o", "command="]);
  const processesByPid = new Map<number, ProcessStats>();

  for (const line of stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, pidValue, parentPidValue, tty, command] = match;
    const pid = Number(pidValue);
    const parentPid = Number(parentPidValue);

    processesByPid.set(pid, {
      pid,
      parentPid: Number.isFinite(parentPid) ? parentPid : undefined,
      tty,
      command,
    });
  }

  for (const pid of uniquePids) {
    const ancestors: ProcessStats[] = [];
    const seen = new Set<number>([pid]);
    let current = processesByPid.get(pid);

    while (current?.parentPid && current.parentPid > 1 && !seen.has(current.parentPid)) {
      seen.add(current.parentPid);
      const parent = processesByPid.get(current.parentPid);

      if (!parent) {
        break;
      }

      ancestors.push(parent);
      current = parent;
    }

    ancestorsByPid.set(pid, ancestors);
  }

  return ancestorsByPid;
}

export async function killProcess(pid: number, signal: NodeJS.Signals): Promise<void> {
  process.kill(pid, signal);
}
