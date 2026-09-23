import type { TranscodePreset } from "../shared/types";

export const PRESETS: TranscodePreset[] = [
  {
    id: "mp4",
    name: "MP4",
    description: "H.265 + AAC，保持比例并按目标码率压缩，适合本地播放和交付",
    extension: ".mp4",
    category: "交付",
    encoder: "libx265",
    args: [],
  },
  {
    id: "m3u8",
    name: "M3U8",
    description: "HLS 播放列表 + 分片，适合网页、点播和分发",
    extension: ".m3u8",
    category: "流媒体",
    encoder: "libx264",
    args: [],
  },
];

export function getPreset(id: string): TranscodePreset {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`未知预设：${id}`);
  return preset;
}
