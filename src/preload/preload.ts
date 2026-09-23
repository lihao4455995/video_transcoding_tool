import { contextBridge, ipcRenderer, webUtils } from "electron";
import { channels } from "../shared/channels";
import type { AppSnapshot, KeygenInput, LicenseState, OutputResolution, PresetId, ToolStatus, TranscodeJob } from "../shared/types";

const api = {
  snapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke(channels.snapshot),
  chooseFiles: (): Promise<string[]> => ipcRenderer.invoke(channels.chooseFiles),
  chooseFolder: (): Promise<string[]> => ipcRenderer.invoke(channels.chooseFolder),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  setOutputDirectory: (): Promise<string | undefined> => ipcRenderer.invoke(channels.setOutputDirectory),
  chooseTool: (kind: "ffmpeg" | "ffprobe"): Promise<ToolStatus> => ipcRenderer.invoke(channels.chooseTool, kind),
  addJobs: (paths: string[], presetId: PresetId, resolution: OutputResolution): Promise<TranscodeJob[]> => ipcRenderer.invoke(channels.addJobs, paths, presetId, resolution),
  removeJob: (id: string): Promise<void> => ipcRenderer.invoke(channels.removeJob, id),
  clearFinished: (): Promise<void> => ipcRenderer.invoke(channels.clearFinished),
  startQueue: (): Promise<void> => ipcRenderer.invoke(channels.startQueue),
  cancelJob: (id: string): Promise<boolean> => ipcRenderer.invoke(channels.cancelJob, id),
  retryJob: (id: string): Promise<void> => ipcRenderer.invoke(channels.retryJob, id),
  revealOutput: (path: string): Promise<void> => ipcRenderer.invoke(channels.revealOutput, path),
  readLog: (id: string): Promise<string> => ipcRenderer.invoke(channels.readLog, id),
  activate: (code: string): Promise<LicenseState> => ipcRenderer.invoke(channels.activate, code),
  deactivate: (): Promise<LicenseState> => ipcRenderer.invoke(channels.deactivate),
  onStateChanged: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(channels.stateChanged, handler);
    return () => ipcRenderer.off(channels.stateChanged, handler);
  },
  keygenChooseKey: (): Promise<string | undefined> => ipcRenderer.invoke(channels.keygenChooseKey),
  keygenGenerate: (input: KeygenInput): Promise<string> => ipcRenderer.invoke(channels.keygenGenerate, input),
};

contextBridge.exposeInMainWorld("framebridge", api);

export type FrameBridgeApi = typeof api;
