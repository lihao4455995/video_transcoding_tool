import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statfsSync, readdirSync } from "node:fs";
import { dirname, extname, join, basename } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { TranscodeJob } from "../shared/types";
import type { AppDatabase } from "./database";
import type { MediaTools } from "./tools";
import { buildFfmpegArgs, commandForDisplay } from "./command-builder";
import { getPreset } from "./presets";

type JobUpdate = (job: TranscodeJob) => void;

function tempPathFor(job: TranscodeJob): string {
  const extension = extname(job.outputPath);
  const base = job.outputPath.slice(0, -extension.length);
  return `${base}.${job.id}.partial${extension}`;
}

function removeHlsSegments(job: TranscodeJob): void {
  if (job.presetId !== "m3u8") return;
  const directory = dirname(job.outputPath);
  const prefix = `${job.outputPath.slice(0, -5)}.seg`;
  try {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (path.startsWith(prefix) && name.endsWith(".ts")) rmSync(path, { force: true });
    }
  } catch { /* The output directory may not exist yet. */ }
}

export class JobRunner {
  private active?: { jobId: string; process: ChildProcessWithoutNullStreams; canceled: boolean };
  private runningQueue = false;

  constructor(
    private readonly db: AppDatabase,
    private readonly tools: MediaTools,
    private readonly logDirectory: string,
    private readonly update: JobUpdate,
  ) {
    mkdirSync(logDirectory, { recursive: true });
  }

  isRunning(): boolean {
    return this.runningQueue;
  }

  async start(): Promise<void> {
    if (this.runningQueue) return;
    this.runningQueue = true;
    try {
      while (true) {
        const job = this.db.listJobs().reverse().find((item) => item.status === "queued");
        if (!job) break;
        await this.runOne(job);
      }
    } finally {
      this.runningQueue = false;
    }
  }

  cancel(jobId: string): boolean {
    if (this.active?.jobId !== jobId) return false;
    this.active.canceled = true;
    if (process.platform === "win32" && this.active.process.pid) {
      spawn("taskkill.exe", ["/pid", String(this.active.process.pid), "/t", "/f"], { windowsHide: true });
    } else {
      this.active.process.kill("SIGTERM");
    }
    return true;
  }

  cancelCurrent(): void {
    if (this.active) this.cancel(this.active.jobId);
  }

  private save(job: TranscodeJob): void {
    job.updatedAt = new Date().toISOString();
    this.db.saveJob(job);
    this.update(job);
  }

  private async runOne(job: TranscodeJob): Promise<void> {
    const preset = getPreset(job.presetId);
    const toolsStatus = await this.tools.status();
    if (!toolsStatus.ready) {
      job.status = "failed";
      job.error = toolsStatus.message ?? "FFmpeg 未配置";
      this.save(job);
      return;
    }
    if (preset.encoder && !toolsStatus.encoders.includes(preset.encoder)) {
      job.status = "failed";
      job.error = `当前 FFmpeg 不包含编码器 ${preset.encoder}`;
      this.save(job);
      return;
    }
    if (existsSync(job.outputPath)) {
      job.status = "failed";
      job.error = "目标文件已存在，未执行覆盖";
      this.save(job);
      return;
    }

    mkdirSync(dirname(job.outputPath), { recursive: true });
    const disk = statfsSync(dirname(job.outputPath));
    const freeBytes = disk.bavail * disk.bsize;
    if (freeBytes < 512 * 1024 * 1024) {
      job.status = "failed";
      job.error = "输出磁盘剩余空间不足 512 MB";
      this.save(job);
      return;
    }

    const temporaryPath = tempPathFor(job);
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
    const logPath = join(this.logDirectory, `${job.id}.log`);
    const log = createWriteStream(logPath, { flags: "w", encoding: "utf8" });
    const ffmpeg = this.tools.executable("ffmpeg");
    removeHlsSegments(job);
    const args = buildFfmpegArgs(job, preset, temporaryPath);
    log.write(`${new Date().toISOString()}\n${commandForDisplay(ffmpeg, args)}\n\n`);

    job.status = "running";
    job.progress = 0;
    job.error = undefined;
    job.logPath = logPath;
    this.save(job);

    await new Promise<void>((resolve) => {
      const child = spawn(ffmpeg, args, { windowsHide: true });
      this.active = { jobId: job.id, process: child, canceled: false };
      let stdoutBuffer = "";
      let lastSaved = 0;

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const index = line.indexOf("=");
          if (index < 0) continue;
          const key = line.slice(0, index);
          const value = line.slice(index + 1);
          if (key === "out_time_ms" || key === "out_time_us") {
            const seconds = Number(value) / 1_000_000;
            if (job.media?.duration) job.progress = Math.min(99.5, (seconds / job.media.duration) * 100);
          }
          if (key === "speed") job.speed = value;
        }
        const now = Date.now();
        if (now - lastSaved > 500) {
          lastSaved = now;
          this.save(job);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => log.write(chunk));
      child.on("error", (error) => log.write(`\nPROCESS ERROR: ${error.message}\n`));
      child.on("close", async (code) => {
        const wasCanceled = this.active?.canceled ?? false;
        this.active = undefined;
        try {
          if (wasCanceled) {
            job.status = "canceled";
            job.error = "任务已取消";
          } else if (code !== 0 || !existsSync(temporaryPath)) {
            job.status = "failed";
            job.error = `FFmpeg 执行失败（退出码 ${code ?? "unknown"}），请查看任务日志`;
          } else {
            const outputInfo = await this.tools.analyze(temporaryPath);
            if (!outputInfo.streams.some((stream) => stream.type === "video")) {
              throw new Error("输出文件缺少视频流");
            }
            if (job.media?.duration && Math.abs(outputInfo.duration - job.media.duration) > Math.max(1.5, job.media.duration * 0.02)) {
              throw new Error("输出时长与源文件偏差超过允许范围");
            }
            renameSync(temporaryPath, job.outputPath);
            job.status = "succeeded";
            job.progress = 100;
            job.error = undefined;
          }
        } catch (error) {
          job.status = "failed";
          job.error = `输出校验失败：${error instanceof Error ? error.message : String(error)}`;
        } finally {
          if (job.status !== "succeeded" && existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
          if (job.status !== "succeeded") removeHlsSegments(job);
          log.end();
          this.save(job);
          resolve();
        }
      });
    });
  }
}
