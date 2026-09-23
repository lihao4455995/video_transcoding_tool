import { app } from "electron";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import type { MediaInfo, MediaStream, ToolStatus } from "../shared/types";
import type { AppDatabase } from "./database";

const execFileAsync = promisify(execFile);

function parseRate(value?: string): number | undefined {
  if (!value || value === "0/0") return undefined;
  const [a, b = 1] = value.split("/").map(Number);
  return b ? a / b : undefined;
}

async function firstLine(executable: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(executable, ["-version"], { windowsHide: true, timeout: 5000 });
  return `${stdout}${stderr}`.split(/\r?\n/)[0].trim();
}

function resolveCommand(command: string): string | undefined {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0].trim() : undefined;
}

export class MediaTools {
  constructor(private readonly db: AppDatabase) {}

  private candidate(name: "ffmpeg" | "ffprobe"): string | undefined {
    const saved = this.db.getSetting(`${name}Path`);
    if (saved && existsSync(saved)) return saved;
    const envValue = process.env[name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"];
    if (envValue && existsSync(envValue)) return envValue;
    const binary = process.platform === "win32" ? `${name}.exe` : name;
    const bundled = join(process.resourcesPath, "bin", binary);
    if (app.isPackaged && existsSync(bundled)) return bundled;
    return resolveCommand(name);
  }

  async status(): Promise<ToolStatus> {
    const ffmpegPath = this.candidate("ffmpeg");
    const ffprobePath = this.candidate("ffprobe");
    if (!ffmpegPath || !ffprobePath) {
      return {
        ready: false,
        ffmpegPath,
        ffprobePath,
        encoders: [],
        message: "未找到可用的内置 FFmpeg，请在设置中选择 ffmpeg.exe 和 ffprobe.exe。",
      };
    }
    try {
      const [ffmpegVersion, ffprobeVersion] = await Promise.all([firstLine(ffmpegPath), firstLine(ffprobePath)]);
      const { stdout } = await execFileAsync(ffmpegPath, ["-hide_banner", "-encoders"], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      const wanted = ["libx264", "libx265", "prores_ks", "dnxhd", "h264_nvenc", "hevc_nvenc", "h264_qsv", "hevc_qsv", "h264_amf", "hevc_amf"];
      return {
        ready: true,
        ffmpegPath,
        ffprobePath,
        ffmpegVersion,
        ffprobeVersion,
        encoders: wanted.filter((encoder) => new RegExp(`\\b${encoder}\\b`).test(stdout)),
      };
    } catch (error) {
      return { ready: false, ffmpegPath, ffprobePath, encoders: [], message: `工具无法执行：${String(error)}` };
    }
  }

  setPath(kind: "ffmpeg" | "ffprobe", value: string): void {
    this.db.setSetting(`${kind}Path`, value);
    if (kind === "ffmpeg" && basename(value).toLowerCase().startsWith("ffmpeg")) {
      const sibling = join(dirname(value), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
      if (existsSync(sibling)) this.db.setSetting("ffprobePath", sibling);
    }
  }

  executable(kind: "ffmpeg" | "ffprobe"): string {
    const found = this.candidate(kind);
    if (!found) throw new Error(`${kind} 尚未配置`);
    return found;
  }

  async analyze(inputPath: string): Promise<MediaInfo> {
    const ffprobe = this.executable("ffprobe");
    const { stdout } = await execFileAsync(
      ffprobe,
      ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", inputPath],
      { windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string };
      streams?: Array<Record<string, unknown>>;
    };
    const streams: MediaStream[] = (parsed.streams ?? []).map((stream) => ({
      index: Number(stream.index),
      type: String(stream.codec_type ?? "unknown"),
      codec: String(stream.codec_name ?? "unknown"),
      profile: stream.profile ? String(stream.profile) : undefined,
      width: stream.width ? Number(stream.width) : undefined,
      height: stream.height ? Number(stream.height) : undefined,
      frameRate: parseRate(String(stream.avg_frame_rate ?? stream.r_frame_rate ?? "")),
      sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
      channels: stream.channels ? Number(stream.channels) : undefined,
      language: (stream.tags as { language?: string } | undefined)?.language,
      pixelFormat: stream.pix_fmt ? String(stream.pix_fmt) : undefined,
      bitsPerRawSample: stream.bits_per_raw_sample ? Number(stream.bits_per_raw_sample) : undefined,
      colorSpace: stream.color_space ? String(stream.color_space) : undefined,
      colorRange: stream.color_range ? String(stream.color_range) : undefined,
      colorPrimaries: stream.color_primaries ? String(stream.color_primaries) : undefined,
      colorTransfer: stream.color_transfer ? String(stream.color_transfer) : undefined,
    }));
    if (!streams.length) throw new Error("文件中没有可识别的媒体流");
    return {
      path: inputPath,
      fileName: basename(inputPath),
      format: parsed.format?.format_name ?? "unknown",
      duration: Number(parsed.format?.duration ?? 0),
      size: Number(parsed.format?.size ?? 0),
      bitRate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : undefined,
      streams,
    };
  }
}
