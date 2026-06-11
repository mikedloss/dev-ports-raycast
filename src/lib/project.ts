import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PreferredIDEPreference } from "../types";

export type IDEConfig = {
  id: Exclude<PreferredIDEPreference, "auto" | "system">;
  title: string;
  application: string;
};

export const IDE_CONFIGS: IDEConfig[] = [
  { id: "cursor", title: "Cursor", application: "Cursor" },
  { id: "visual-studio-code", title: "Visual Studio Code", application: "Visual Studio Code" },
  { id: "zed", title: "Zed", application: "Zed" },
  { id: "webstorm", title: "WebStorm", application: "WebStorm" },
  { id: "intellij-idea", title: "IntelliJ IDEA", application: "IntelliJ IDEA" },
  { id: "pycharm", title: "PyCharm", application: "PyCharm" },
  { id: "sublime-text", title: "Sublime Text", application: "Sublime Text" },
  { id: "xcode", title: "Xcode", application: "Xcode" },
];

export function getPreferredIDE(preference: PreferredIDEPreference): IDEConfig | undefined {
  if (preference === "system") {
    return undefined;
  }

  if (preference !== "auto") {
    return IDE_CONFIGS.find((ide) => ide.id === preference);
  }

  return IDE_CONFIGS.find((ide) => isApplicationInstalled(ide.application));
}

function isApplicationInstalled(application: string): boolean {
  return [
    path.join("/Applications", `${application}.app`),
    path.join(os.homedir(), "Applications", `${application}.app`),
  ].some((applicationPath) => existsSync(applicationPath));
}
