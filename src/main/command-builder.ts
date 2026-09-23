import type { TranscodeJob, TranscodePreset } from "../shared/types";

function targetVideoBitrate(job: Pick<TranscodeJob, "media">): string {
  const sourceBitrate = job.media?.bitRate ?? (job.media?.duration ? (job.media.size * 8) / job.media.duration : 0);
  const audioBitrate = job.media?.streams.some((stream) => stream.type === "audio") ? 96_000 : 0;
  const target = sourceBitrate > 0 ? Math.floor(sourceBitrate / 8 - audioBitrate) : 1_200_000;
  return `${Math.max(250_000, target)}`;
}

export function buildFfmpegArgs(
  job: Pick<TranscodeJob, "inputPath" | "media" | "resolution"> & Partial<Pick<TranscodeJob, "outputPath">>,
  preset: TranscodePreset,
  temporaryOutputPath: string,
): string[] {
  const height = job.resolution ?? 1080;
  const bitrate = targetVideoBitrate(job);
  const codec = preset.id === "m3u8" ? "libx264" : "libx265";
  const crf = preset.id === "m3u8" ? "23" : "27";
  const video = job.media?.streams.find((stream) => stream.type === "video");
  const range = video?.colorRange === "pc" || video?.colorRange === "jpeg" ? "full" : video?.colorRange === "tv" ? "limited" : undefined;
  const scale = height === "source" ? undefined : `scale=-2:min(${height}\\,ih):flags=lanczos${range ? `:in_range=${range}:out_range=${range}` : ""}`;
  const sourceIs10Bit = Boolean(video?.bitsPerRawSample && video.bitsPerRawSample >= 10) || Boolean(video?.pixelFormat?.includes("10"));
  const pixelFormat = preset.id === "mp4" && sourceIs10Bit ? "yuv420p10le" : "yuv420p";
  const colorMetadata: string[] = [];
  if (video?.colorSpace) colorMetadata.push("-colorspace", video.colorSpace);
  if (video?.colorPrimaries) colorMetadata.push("-color_primaries", video.colorPrimaries);
  if (video?.colorTransfer) colorMetadata.push("-color_trc", video.colorTransfer);
  if (video?.colorRange) colorMetadata.push("-color_range", video.colorRange);
  const common = [
    "-map", "0:v:0", "-map", "0:a?",
    "-c:v", codec, "-preset", "slow", "-crf", crf,
    "-maxrate", bitrate, "-bufsize", `${Math.max(500_000, Number(bitrate) * 2)}`,
    "-pix_fmt", pixelFormat,
    ...(scale ? ["-vf", scale] : []),
    "-map_metadata", "0", ...colorMetadata,
    "-c:a", "aac", "-b:a", "96k",
  ];
  const outputArgs = preset.id === "m3u8"
    ? [
      ...common,
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
      "-hls_segment_filename", `${(job.outputPath ?? temporaryOutputPath).slice(0, -5)}.seg%03d.ts`,
    ]
    : [...common, "-movflags", "+faststart", "-tag:v", "hvc1"];
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    job.inputPath,
    ...outputArgs,
    "-progress",
    "pipe:1",
    "-nostats",
    temporaryOutputPath,
  ];
}

export function commandForDisplay(executable: string, args: string[]): string {
  const quote = (value: string) => (/\s|["&|<>^]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value);
  return [executable, ...args].map(quote).join(" ");
}
