export type JobStatus =
  | "queued"
  | "analyzing"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "interrupted";

export type PresetId =
  | "mp4"
  | "m3u8";

export type OutputResolution = "source" | 720 | 1080;

export interface MediaStream {
  index: number;
  type: string;
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  language?: string;
  pixelFormat?: string;
  bitsPerRawSample?: number;
  colorSpace?: string;
  colorRange?: string;
  colorPrimaries?: string;
  colorTransfer?: string;
}

export interface MediaInfo {
  path: string;
  fileName: string;
  format: string;
  duration: number;
  size: number;
  bitRate?: number;
  streams: MediaStream[];
}

export interface TranscodePreset {
  id: PresetId;
  name: string;
  description: string;
  extension: string;
  category: "交付" | "流媒体";
  args: string[];
  encoder?: string;
}

export interface TranscodeJob {
  id: string;
  inputPath: string;
  outputPath: string;
  presetId: PresetId;
  resolution?: OutputResolution;
  presetName: string;
  status: JobStatus;
  progress: number;
  speed?: string;
  etaSeconds?: number;
  media?: MediaInfo;
  error?: string;
  logPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolStatus {
  ffmpegPath?: string;
  ffprobePath?: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  ready: boolean;
  encoders: string[];
  message?: string;
}

export interface LicensePayload {
  version: 1;
  licenseId: string;
  customer: string;
  edition: "TEAM" | "PRO";
  installationId: string;
  issuedAt: string;
  expiresAt: string | null;
  features: string[];
}

export interface LicenseState {
  active: boolean;
  installationId: string;
  payload?: LicensePayload;
  reason?: string;
}

export interface KeygenInput {
  privateKeyPath: string;
  installationId: string;
  customer: string;
  edition: "TEAM" | "PRO";
  expiresAt: string | null;
}

export interface AppSnapshot {
  license: LicenseState;
  tools: ToolStatus;
  jobs: TranscodeJob[];
  presets: TranscodePreset[];
  outputDirectory: string;
}
