# Dev Ports

Inspect and manage local development servers from Raycast.

## Features

- List active local listening ports.
- Filter likely development servers by default.
- Search by port, process, command, PID, bound address, or project directory.
- Open and copy local URLs with HTTP/HTTPS scheme detection.
- View process details including PID, command, directory, TTY, uptime, CPU, and memory.
- Kill a process, force kill a process, or kill all detected dev ports.
- Focus the matching iTerm2 session or Apple Terminal tab when available.
- Open a project directory in a preferred editor or IDE.
- Refresh the list automatically while the command is open.

## Terminal Focusing

Terminal focusing is best effort. Dev Ports matches terminal sessions by TTY first, then falls back to visible terminal text when useful.

The first time you use terminal focusing, macOS may ask for Automation permission so Raycast can control iTerm2 or Terminal. If focusing fails because of permissions, open System Settings, then enable Raycast under Privacy & Security > Automation for the terminal app you want to control.

## Preferences

Preferences are shown by Raycast the first time the extension runs. To change them later, use the **Configure Dev Ports** action from the main command or open Raycast Extensions preferences.

- **Show All Ports by Default**: Include every listening TCP port instead of only likely development servers.
- **Default URL Host**: Choose `localhost`, `127.0.0.1`, or the bound address for opened/copied URLs.
- **Preferred Terminal**: Choose Auto, iTerm2, or Apple Terminal.
- **Preferred IDE**: Choose Auto-detect, a specific editor/IDE, or the system default.
- **Confirm Before Kill**: Confirm before sending SIGTERM.
- **Confirm Before Force Kill**: Confirm before sending SIGKILL.
- **Close Raycast After Opening URL**: Close Raycast after opening a local URL.

## Requirements

Dev Ports is macOS-only. It uses macOS system tools and APIs including `lsof`, `ps`, AppleScript, Finder, Terminal, and iTerm2 automation.
