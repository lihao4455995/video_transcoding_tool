import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { channels } from "../shared/channels";
import type { AppSnapshot, OutputResolution, PresetId, TranscodeJob } from "../shared/types";
import { AppDatabase } from "./database";
import { JobRunner } from "./job-runner";
import { LicenseService } from "./license-service";
import { getPreset, PRESETS } from "./presets";
import { MediaTools } from "./tools";
import { captureSmokeScreenshot } from "./smoke";

let mainWindow: BrowserWindow | undefined;
let db: AppDatabase;
let tools: MediaTools;
let licenses: LicenseService;
let runner: JobRunner;

function requireLicense(): void {
  if (!licenses.state().active) throw new Error("软件尚未激活，请先输入有效注册码");
}

function notify(): void {
  mainWindow?.webContents.send(channels.stateChanged);
}

async function snapshot(): Promise<AppSnapshot> {
  return {
    license: licenses.state(),
    tools: await tools.status(),
    jobs: db.listJobs(),
    presets: PRESETS,
    outputDirectory: db.getSetting("outputDirectory") ?? "",
  };
}

function uniqueOutput(inputPath: string, outputDirectory: string, presetId: PresetId, resolution: OutputResolution, reservedPaths?: ReadonlySet<string>): string {
  const preset = getPreset(presetId);
  const source = parse(inputPath);
  const resolutionLabel = resolution === "source" ? "original" : `${resolution}p`;
  const suffix = `_${resolutionLabel}_${preset.id}`;
  const directory = outputDirectory || join(source.dir, "山水映帧输出");
  let candidate = join(directory, `${source.name}${suffix}${preset.extension}`);
  let number = 2;
  const reserved = reservedPaths ?? new Set(db.listJobs().map((job) => job.outputPath.toLowerCase()));
  while (existsSync(candidate) || reserved.has(candidate.toLowerCase())) {
    candidate = join(directory, `${source.name}${suffix}_${number}${preset.extension}`);
    number += 1;
  }
  return candidate;
}

function rebaseQueuedOutputPaths(outputDirectory: string): void {
  const jobs = db.listJobs();
  const queuedIds = new Set(jobs.filter((job) => job.status === "queued").map((job) => job.id));
  const reserved = new Set(jobs.filter((job) => !queuedIds.has(job.id)).map((job) => job.outputPath.toLowerCase()));
  for (const job of jobs.filter((item) => item.status === "queued").reverse()) {
    const outputPath = uniqueOutput(job.inputPath, outputDirectory, job.presetId, job.resolution ?? "source", reserved);
    reserved.add(outputPath.toLowerCase());
    if (outputPath !== job.outputPath) {
      job.outputPath = outputPath;
      db.saveJob(job);
    }
  }
}

const supportedExtensions = new Set([".mp4", ".mov", ".mkv", ".avi", ".mxf", ".m4v", ".webm", ".ts", ".mts", ".m2ts", ".wav", ".mp3", ".flac"]);

function mediaFilesIn(directory: string): string[] {
  const result: string[] = [];
  const pending = [directory];
  while (pending.length && result.length < 2000) {
    const current = pending.pop()!;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && supportedExtensions.has(parse(entry.name).ext.toLowerCase())) result.push(fullPath);
    }
  }
  return result;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#f5f6f7",
    show: false,
    title: "山水映帧",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith("file:") || (!app.isPackaged && url.startsWith("http://localhost:5173"));
    if (!allowed) event.preventDefault();
  });
  if (app.isPackaged || process.env.FRAMEBRIDGE_USE_DIST === "1") mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  else mainWindow.loadURL("http://localhost:5173");
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = undefined; });
  captureSmokeScreenshot(mainWindow);
}

function registerIpc(): void {
  ipcMain.handle(channels.snapshot, snapshot);
  ipcMain.handle(channels.chooseFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择待转码文件",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "媒体文件", extensions: ["mp4", "mov", "mkv", "avi", "mxf", "m4v", "webm", "ts", "mts", "m2ts", "wav", "mp3", "flac"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle(channels.chooseFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "选择素材文件夹", properties: ["openDirectory"] });
    return result.canceled ? [] : mediaFilesIn(result.filePaths[0]);
  });
  ipcMain.handle(channels.setOutputDirectory, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "选择输出目录", properties: ["openDirectory", "createDirectory"] });
    if (!result.canceled && result.filePaths[0]) {
      db.setSetting("outputDirectory", result.filePaths[0]);
      rebaseQueuedOutputPaths(result.filePaths[0]);
    }
    notify();
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle(channels.chooseTool, async (_event, kind: "ffmpeg" | "ffprobe") => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: `选择 ${kind}.exe`,
      properties: ["openFile"],
      filters: process.platform === "win32" ? [{ name: "可执行文件", extensions: ["exe"] }] : undefined,
    });
    if (!result.canceled && result.filePaths[0]) tools.setPath(kind, result.filePaths[0]);
    notify();
    return tools.status();
  });
  ipcMain.handle(channels.addJobs, async (_event, paths: string[], presetId: PresetId, resolution: OutputResolution) => {
    requireLicense();
    const targetResolution: OutputResolution = resolution === "source" || resolution === 720 ? resolution : 1080;
    const outputDirectory = db.getSetting("outputDirectory") ?? "";
    const added: TranscodeJob[] = [];
    const expandedPaths = paths.flatMap((path) => {
      try { return statSync(path).isDirectory() ? mediaFilesIn(path) : [path]; }
      catch { return []; }
    });
    for (const inputPath of expandedPaths) {
      if (!existsSync(inputPath)) continue;
      const now = new Date().toISOString();
      const preset = getPreset(presetId);
      const job: TranscodeJob = {
        id: randomUUID(), inputPath, outputPath: uniqueOutput(inputPath, outputDirectory, presetId, targetResolution),
        presetId, presetName: preset.name, resolution: targetResolution, status: "analyzing", progress: 0, createdAt: now, updatedAt: now,
      };
      db.saveJob(job);
      notify();
      try {
        job.media = await tools.analyze(inputPath);
        const hasVideo = job.media.streams.some((stream) => stream.type === "video");
        const hasAudio = job.media.streams.some((stream) => stream.type === "audio");
        if (!hasVideo) throw new Error("没有视频流");
        job.status = "queued";
      } catch (error) {
        job.status = "failed";
        job.error = `媒体分析失败：${error instanceof Error ? error.message : String(error)}`;
      }
      job.updatedAt = new Date().toISOString();
      db.saveJob(job);
      added.push(job);
    }
    notify();
    return added;
  });
  ipcMain.handle(channels.removeJob, (_event, id: string) => { db.deleteJob(id); notify(); });
  ipcMain.handle(channels.clearFinished, () => { db.clearFinished(); notify(); });
  ipcMain.handle(channels.startQueue, async () => {
    requireLicense();
     rebaseQueuedOutputPaths(db.getSetting("outputDirectory") ?? "");
   void runner.start().then(notify);
    notify();
  });
  ipcMain.handle(channels.cancelJob, (_event, id: string) => runner.cancel(id));
  ipcMain.handle(channels.retryJob, (_event, id: string) => {
    requireLicense();
    const job = db.listJobs().find((item) => item.id === id);
    if (job && ["failed", "canceled", "interrupted"].includes(job.status)) {
      job.status = "queued"; job.progress = 0; job.error = undefined; job.updatedAt = new Date().toISOString(); db.saveJob(job); notify();
    }
  });
  ipcMain.handle(channels.revealOutput, (_event, path: string) => {
    if (existsSync(path)) shell.showItemInFolder(path);
    else shell.openPath(dirname(path));
  });
  ipcMain.handle(channels.readLog, (_event, id: string) => {
    const job = db.listJobs().find((item) => item.id === id);
    return job?.logPath && existsSync(job.logPath) ? readFileSync(job.logPath, "utf8") : "暂无日志";
  });
  ipcMain.handle(channels.activate, (_event, code: string) => { const state = licenses.activate(code); notify(); return state; });
  ipcMain.handle(channels.deactivate, () => { const state = licenses.deactivate(); notify(); return state; });
}

app.whenReady().then(() => {
  if (process.env.FRAMEBRIDGE_SMOKE_PROFILE) app.setPath("userData", process.env.FRAMEBRIDGE_SMOKE_PROFILE);
  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  db = new AppDatabase(join(userData, "framebridge-state.json"));
  tools = new MediaTools(db);
  licenses = new LicenseService(db);
  if (!app.isPackaged && process.env.FRAMEBRIDGE_SMOKE_RESET === "1") licenses.deactivate();
  if (!app.isPackaged && process.env.FRAMEBRIDGE_SCREENSHOT && process.env.FRAMEBRIDGE_SMOKE_LICENSE) {
    licenses.activate(process.env.FRAMEBRIDGE_SMOKE_LICENSE);
  }
  runner = new JobRunner(db, tools, join(userData, "logs"), () => notify());
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => runner?.cancelCurrent());
app.on("will-quit", () => db?.close());
