import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { TranscodeJob } from "../shared/types";

interface StoredState {
  version: 1;
  settings: Record<string, string>;
  jobs: TranscodeJob[];
}

export class AppDatabase {
  private state: StoredState;

  constructor(private readonly path: string) {
    this.state = this.load();
    let changed = false;
    for (const job of this.state.jobs) {
      if (!["mp4", "m3u8"].includes(job.presetId)) {
        job.status = "failed";
        job.error = "该任务来自旧版本预设，请按新的 MP4/M3U8 格式重新添加素材";
        job.updatedAt = new Date().toISOString();
        changed = true;
        continue;
      }
      if (job.status === "running" || job.status === "analyzing") {
        job.status = "interrupted";
        job.error = "应用上次退出时任务仍在运行，可重新执行";
        job.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.flush();
  }

  private load(): StoredState {
    if (!existsSync(this.path)) return { version: 1, settings: {}, jobs: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as StoredState;
      if (parsed.version === 1 && parsed.settings && Array.isArray(parsed.jobs)) return parsed;
    } catch {
      renameSync(this.path, `${this.path}.${Date.now()}.broken`);
    }
    return { version: 1, settings: {}, jobs: [] };
  }

  private flush(): void {
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), "utf8");
    renameSync(temporary, this.path);
  }

  getSetting(key: string): string | undefined { return this.state.settings[key]; }

  setSetting(key: string, value: string): void {
    this.state.settings[key] = value;
    this.flush();
  }

  deleteSetting(key: string): void {
    delete this.state.settings[key];
    this.flush();
  }

  listJobs(): TranscodeJob[] {
    return structuredClone(this.state.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  saveJob(job: TranscodeJob): void {
    const index = this.state.jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) this.state.jobs[index] = structuredClone(job);
    else this.state.jobs.push(structuredClone(job));
    this.flush();
  }

  deleteJob(id: string): void {
    this.state.jobs = this.state.jobs.filter((job) => job.id !== id || ["running", "analyzing"].includes(job.status));
    this.flush();
  }

  clearFinished(): void {
    this.state.jobs = this.state.jobs.filter((job) => !["succeeded", "failed", "canceled"].includes(job.status));
    this.flush();
  }

  close(): void { this.flush(); }
}
