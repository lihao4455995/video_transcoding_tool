import { app, type BrowserWindow } from "electron";
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

export function captureSmokeScreenshot(window: BrowserWindow): void {
  const target = process.env.FRAMEBRIDGE_SCREENSHOT;
  if (!target || app.isPackaged) return;
  window.webContents.once("did-finish-load", () => {
    setTimeout(async () => {
      mkdirSync(dirname(target), { recursive: true });
      const image = await window.webContents.capturePage();
      writeFileSync(target, image.toPNG());
      app.quit();
    }, 800);
  });
}
