import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "./command-builder";
import { PRESETS } from "./presets";

describe("FFmpeg command builder", () => {
  it("keeps Windows paths as individual arguments and enables machine-readable progress", () => {
    const args = buildFfmpegArgs(
      { inputPath: "D:\\中文 素材\\A&B.mov" },
      PRESETS[0],
      "D:\\输出目录\\result.partial.mp4",
    );
    expect(args[args.indexOf("-i") + 1]).toBe("D:\\中文 素材\\A&B.mov");
    expect(args).toContain("pipe:1");
    expect(args.at(-1)).toBe("D:\\输出目录\\result.partial.mp4");
  });

  it("builds bounded-bitrate HLS output with the selected maximum height", () => {
    const args = buildFfmpegArgs(
      {
        inputPath: "source.mp4",
        outputPath: "D:\\输出目录\\clip_720p_m3u8.m3u8",
        resolution: 720,
        media: { path: "source.mp4", fileName: "source.mp4", format: "mov", duration: 60, size: 45_000_000, bitRate: 6_000_000, streams: [{ index: 0, type: "video", codec: "h264", width: 1920, height: 1080 }] },
      },
      PRESETS[1],
      "D:\\输出目录\\clip_720p_m3u8.job.partial.m3u8",
    );
    expect(args).toContain("-f");
    expect(args[args.indexOf("-f") + 1]).toBe("hls");
    expect(args).toContain("scale=-2:min(720\\,ih):flags=lanczos");
    expect(args).toContain("-maxrate");
  });
});
