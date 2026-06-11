export function formatBytes(bytes?: number): string {
  if (bytes === undefined) {
    return "Unknown";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPercent(percent?: number): string {
  if (percent === undefined) {
    return "Unknown";
  }

  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%`;
}

export function truncateCommand(command?: string): string | undefined {
  if (!command) {
    return undefined;
  }

  return command.length > 120 ? `${command.slice(0, 117)}...` : command;
}
