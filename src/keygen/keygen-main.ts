import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { channels } from "../shared/channels";
import { createLicenseCode } from "../shared/license";
import type { KeygenInput, LicensePayload } from "../shared/types";
import { captureSmokeScreenshot } from "../main/smoke";

let window: BrowserWindow | undefined;

function createWindow(): void {
  window = new BrowserWindow({
    width: 780,
    height: 720,
    minWidth: 680,
    minHeight: 620,
    title: "山水映帧授权中心",
    backgroundColor: "#f5f6f7",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith("file:") || (!app.isPackaged && url.startsWith("http://localhost:5173"));
    if (!allowed) event.preventDefault();
  });
  if (app.isPackaged || process.env.FRAMEBRIDGE_USE_DIST === "1") window.loadFile(join(__dirname, "../dist/index.html"), { query: { mode: "keygen" } });
  else window.loadURL("http://localhost:5173/?mode=keygen");
  window.once("ready-to-show", () => window?.show());
  captureSmokeScreenshot(window);
}

app.whenReady().then(() => {
  ipcMain.handle(channels.keygenChooseKey, async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "选择许可证私钥",
      properties: ["openFile"],
      filters: [{ name: "PEM 私钥", extensions: ["pem", "key"] }],
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle(channels.keygenGenerate, (_event, input: KeygenInput) => {
    if (!input.privateKeyPath || !input.installationId.trim() || !input.customer.trim()) {
      throw new Error("私钥、安装码和客户名称不能为空");
    }
    const payload: LicensePayload = {
      version: 1,
      licenseId: randomUUID(),
      customer: input.customer.trim(),
      edition: input.edition,
      installationId: input.installationId.trim().toUpperCase(),
      issuedAt: new Date().toISOString(),
      expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59+08:00`).toISOString() : null,
      features: ["transcode", "batch", "presets"],
    };
    return createLicenseCode(payload, readFileSync(input.privateKeyPath, "utf8"));
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
