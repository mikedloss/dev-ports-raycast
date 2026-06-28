import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PortProcess, PreferredTerminalPreference } from "../types";

const execFileAsync = promisify(execFile);

const FOCUS_ITERM_SESSION_SCRIPT = `
on normalizeTty(ttyValue)
  set ttyText to ttyValue as text
  if ttyText is "" or ttyText is "??" then return ""
  if ttyText starts with "/dev/" then return ttyText
  return "/dev/" & ttyText
end normalizeTty

on hasNeedle(haystack, needle)
  if needle is "" then return false
  if (count of needle) < 12 then return false
  return haystack contains needle
end hasNeedle

on hasAnyNeedle(haystack, needlesText)
  repeat with needle in paragraphs of needlesText
    if my hasNeedle(haystack, needle as text) then return true
  end repeat
  return false
end hasAnyNeedle

on isTargetTty(sessionTty, targetTtysText)
  if sessionTty is "" then return false
  repeat with targetTty in paragraphs of targetTtysText
    if sessionTty is my normalizeTty(targetTty as text) then return true
  end repeat
  return false
end isTargetTty

on run argv
  set targetTtysText to item 1 of argv
  set targetCwd to item 2 of argv
  set targetProcessName to item 3 of argv
  set targetCommand to item 4 of argv
  set targetCommandsText to item 5 of argv

  tell application "iTerm2"
    if (count of windows) is 0 then error "No iTerm windows are open."

    repeat with aWindow in windows
      repeat with aTab in tabs of aWindow
        repeat with aSession in sessions of aTab
          set sessionTty to ""
          set visibleText to ""

          try
            set sessionTty to my normalizeTty(tty of aSession)
          end try

          try
            set visibleText to text of aSession as text
          end try

          if my isTargetTty(sessionTty, targetTtysText) or my hasNeedle(visibleText, targetCwd) or my hasNeedle(visibleText, targetCommand) or my hasAnyNeedle(visibleText, targetCommandsText) or my hasNeedle(visibleText, targetProcessName) then
            select aWindow
            select aTab
            select aSession
            activate
            return "Focused iTerm session"
          end if
        end repeat
      end repeat
    end repeat
  end tell

  error "No matching iTerm session found."
end run
`;

const FOCUS_TERMINAL_TAB_SCRIPT = `
on normalizeTty(ttyValue)
  set ttyText to ttyValue as text
  if ttyText is "" or ttyText is "??" then return ""
  if ttyText starts with "/dev/" then return ttyText
  return "/dev/" & ttyText
end normalizeTty

on hasNeedle(haystack, needle)
  if needle is "" then return false
  if (count of needle) < 12 then return false
  return haystack contains needle
end hasNeedle

on hasAnyNeedle(haystack, needlesText)
  repeat with needle in paragraphs of needlesText
    if my hasNeedle(haystack, needle as text) then return true
  end repeat
  return false
end hasAnyNeedle

on isTargetTty(tabTty, targetTtysText)
  if tabTty is "" then return false
  repeat with targetTty in paragraphs of targetTtysText
    if tabTty is my normalizeTty(targetTty as text) then return true
  end repeat
  return false
end isTargetTty

on run argv
  set targetTtysText to item 1 of argv
  set targetCwd to item 2 of argv
  set targetProcessName to item 3 of argv
  set targetCommand to item 4 of argv
  set targetCommandsText to item 5 of argv

  tell application "Terminal"
    if (count of windows) is 0 then error "No Terminal windows are open."

    repeat with aWindow in windows
      repeat with aTab in tabs of aWindow
        set tabTty to ""
        set visibleText to ""

        try
          set tabTty to my normalizeTty(tty of aTab)
        end try

        try
          set visibleText to contents of aTab as text
        end try

        if my isTargetTty(tabTty, targetTtysText) or my hasNeedle(visibleText, targetCwd) or my hasNeedle(visibleText, targetCommand) or my hasAnyNeedle(visibleText, targetCommandsText) or my hasNeedle(visibleText, targetProcessName) then
          set selected tab of aWindow to aTab
          set index of aWindow to 1
          set frontmost of aWindow to true
          activate
          return "Focused Terminal tab"
        end if
      end repeat
    end repeat
  end tell

  error "No matching Terminal tab found."
end run
`;

type TerminalApp = "iterm" | "terminal";

export async function focusTerminalSession(
  port: PortProcess,
  preferredTerminal: PreferredTerminalPreference,
): Promise<string> {
  const terminals = getTerminalSearchOrder(preferredTerminal);
  const errors: string[] = [];

  for (const terminal of terminals) {
    try {
      await focusTerminalAppSession(port, terminal);
      return terminal === "iterm" ? "Focused iTerm session" : "Focused Terminal tab";
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.find((error) => !error.includes("not running")) ?? errors[0] ?? "No matching terminal found.");
}

function getTerminalSearchOrder(preferredTerminal: PreferredTerminalPreference): TerminalApp[] {
  if (preferredTerminal === "terminal") {
    return ["terminal", "iterm"];
  }

  return ["iterm", "terminal"];
}

async function focusTerminalAppSession(port: PortProcess, terminal: TerminalApp): Promise<void> {
  await ensureTerminalIsRunning(terminal);

  const script = terminal === "iterm" ? FOCUS_ITERM_SESSION_SCRIPT : FOCUS_TERMINAL_TAB_SCRIPT;

  try {
    await execFileAsync(
      "/usr/bin/osascript",
      [
        "-e",
        script,
        normalizeListArgument(port.terminalTtys ?? [port.tty]),
        normalizeArgument(port.cwd),
        normalizeArgument(port.processName),
        normalizeArgument(port.command),
        normalizeListArgument(port.terminalCommands ?? [port.command]),
      ],
      { timeout: 5000 },
    );
  } catch (error) {
    throw new Error(getExecutionErrorMessage(error));
  }
}

async function ensureTerminalIsRunning(terminal: TerminalApp): Promise<void> {
  const applicationName = terminal === "iterm" ? "iTerm2" : "Terminal";
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", `application "${applicationName}" is running`], {
    timeout: 3000,
  });

  if (stdout.trim() !== "true") {
    throw new Error(`${applicationName} is not running.`);
  }
}

function normalizeArgument(value: string | undefined): string {
  return value ?? "";
}

function normalizeListArgument(values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join("\n");
}

function getExecutionErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string") {
    const message = error.stderr.trim().replace(/^\d+:\d+: execution error: /, "");
    return message || "AppleScript failed.";
  }

  return error instanceof Error ? error.message : String(error);
}
