import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, CircleStop, FileVideo2, FolderOpen,
  Gauge, KeyRound, ListVideo, LoaderCircle, Play, Plus, RotateCcw, Settings2, Trash2,
  X, Zap,
} from "lucide-react";
import type { AppSnapshot, JobStatus, OutputResolution, PresetId, TranscodeJob } from "../shared/types";
import { formatBytes, formatDuration, shortPath } from "./format";

const statusText: Record<JobStatus, string> = {
  queued: "等待中", analyzing: "分析中", running: "转码中", succeeded: "已完成",
  failed: "失败", canceled: "已取消", interrupted: "已中断",
};

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "running" || status === "analyzing") return <LoaderCircle className="spin" size={16} />;
  if (status === "succeeded") return <CheckCircle2 size={16} />;
  if (status === "failed") return <AlertCircle size={16} />;
  return <span className="status-dot" />;
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [presetId, setPresetId] = useState<PresetId>("mp4");
  const [resolution, setResolution] = useState<OutputResolution>("source");
  const [activationCode, setActivationCode] = useState("");
  const [activationError, setActivationError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [log, setLog] = useState<{ title: string; content: string }>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setSnapshot(await window.framebridge.snapshot()), []);
  useEffect(() => {
    void refresh();
    return window.framebridge.onStateChanged(() => void refresh());
  }, [refresh]);

  const running = snapshot?.jobs.some((job) => ["running", "analyzing"].includes(job.status)) ?? false;
  const queued = snapshot?.jobs.filter((job) => job.status === "queued").length ?? 0;
  const selectedPreset = snapshot?.presets.find((preset) => preset.id === presetId);
  const stats = useMemo(() => ({
    total: snapshot?.jobs.length ?? 0,
    done: snapshot?.jobs.filter((job) => job.status === "succeeded").length ?? 0,
    duration: snapshot?.jobs.reduce((sum, job) => sum + (job.media?.duration ?? 0), 0) ?? 0,
  }), [snapshot]);

  async function addPaths(paths: string[]) {
    if (!paths.length || busy) return;
    setBusy(true);
    try { await window.framebridge.addJobs(paths, presetId, resolution); await refresh(); }
    catch (error) { setActivationError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function chooseFiles() { await addPaths(await window.framebridge.chooseFiles()); }

  async function chooseOutputDirectory() {
    await window.framebridge.setOutputDirectory();
    await refresh();
  }

  async function activate() {
    const state = await window.framebridge.activate(activationCode);
    if (!state.active) setActivationError(state.reason ?? "激活失败");
    else { setActivationCode(""); setActivationError(""); }
    await refresh();
  }

  if (!snapshot) return <div className="splash"><LoaderCircle className="spin" /><span>正在打开工作台</span></div>;

  if (!snapshot.license.active) {
    return (
      <div className="activation-shell">
        <section className="activation-panel">
          <div className="brand-mark"><span>山</span></div>
          <p className="eyebrow">SHANSHUI STUDIO</p>
          <h1>山水映帧</h1>
          <p className="muted lead">面向剪辑团队的本地批量转码工作台</p>
          <div className="license-box">
            <label>本机安装码</label>
            <div className="install-id"><code>{snapshot.license.installationId}</code><button title="复制安装码" onClick={() => navigator.clipboard.writeText(snapshot.license.installationId)}><Check size={16} /></button></div>
            <label htmlFor="license">注册码</label>
            <textarea id="license" rows={5} value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="粘贴由公司授权中心签发的注册码" />
            {activationError && <p className="error-line"><AlertCircle size={15} />{activationError}</p>}
            <button className="primary wide" disabled={!activationCode.trim()} onClick={() => void activate()}><KeyRound size={17} />激活此电脑</button>
          </div>
          <p className="privacy-note">许可证只绑定本机安装码。视频素材始终在本地处理。</p>
        </section>
        <aside className="activation-aside">
          <div><p className="eyebrow light">POST-PRODUCTION WORKFLOW</p><h2>少等一次转码，<br />多留一点创作时间。</h2></div>
          <div className="aside-spec"><span>LOCAL</span><span>BATCH</span><span>VERIFIED</span></div>
        </aside>
      </div>
    );
  }

  return (
    <div className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      void addPaths(Array.from(event.dataTransfer.files).map((file) => window.framebridge.pathForFile(file)).filter(Boolean));
    }}>
      <header className="topbar">
        <div className="brand"><div className="brand-mark small"><span>山</span></div><div><strong>山水映帧</strong><small>SHANSHUI STUDIO</small></div></div>
        <div className="top-actions">
          <span className={`tool-pill ${snapshot.tools.ready ? "ok" : "warn"}`}><span />{snapshot.tools.ready ? "FFmpeg 就绪" : "需配置 FFmpeg"}</span>
          <span className="license-pill"><KeyRound size={14} />{snapshot.license.payload?.customer} · {snapshot.license.payload?.edition}</span>
          <button className="icon-button" title="设置" onClick={() => setSettingsOpen(true)}><Settings2 size={19} /></button>
        </div>
      </header>

      <main>
        <section className="workspace-head">
          <div><p className="eyebrow">TRANSCODE QUEUE</p><h1>转码工作台</h1><p>素材分析、压缩转码和流媒体切片在一个队列中完成。</p></div>
          <div className="stats"><div><strong>{stats.total}</strong><span>队列任务</span></div><div><strong>{stats.done}</strong><span>今日完成</span></div><div><strong>{formatDuration(stats.duration)}</strong><span>素材时长</span></div></div>
        </section>

        <section className="controls-band">
          <div className="preset-control"><label htmlFor="preset">输出格式</label><div className="select-wrap"><select id="preset" value={presetId} onChange={(event) => setPresetId(event.target.value as PresetId)}>{snapshot.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><ChevronDown size={17} /></div><p>{selectedPreset?.description}</p></div>
          <div className="preset-control"><label htmlFor="resolution">输出分辨率</label><div className="select-wrap"><select id="resolution" value={resolution} onChange={(event) => setResolution(event.target.value === "source" ? "source" : Number(event.target.value) as OutputResolution)}><option value="source">原始分辨率</option><option value={720}>720p</option><option value={1080}>1080p</option></select><ChevronDown size={17} /></div><p>原始分辨率保持源视频尺寸；720p/1080p 仅限制最大高度，不会放大。</p></div>
          <div className="output-control"><label>输出位置</label><button className="path-button" onClick={() => void chooseOutputDirectory()}><FolderOpen size={17} /><span>{snapshot.outputDirectory ? shortPath(snapshot.outputDirectory, 58) : "跟随素材，保存到“山水映帧输出”"}</span></button><p>永不覆盖源文件，完成校验后再生成最终文件。</p></div>
          <div className="add-actions"><button className="folder-button" title="递归导入文件夹" disabled={busy || !snapshot.tools.ready} onClick={async () => addPaths(await window.framebridge.chooseFolder())}><FolderOpen size={18} /></button><button className="primary add-button" disabled={busy || !snapshot.tools.ready} onClick={() => void chooseFiles()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}添加素材</button></div>
        </section>

        {!snapshot.tools.ready && <div className="warning-banner"><AlertCircle size={18} /><div><strong>转码内核尚未配置</strong><span>{snapshot.tools.message}</span></div><button onClick={() => setSettingsOpen(true)}>立即配置</button></div>}

        <section className="queue-panel">
          <div className="panel-head"><div><ListVideo size={19} /><h2>任务队列</h2><span>{snapshot.jobs.length}</span></div><div><button className="text-button" onClick={() => void window.framebridge.clearFinished()}><Trash2 size={16} />清理已结束</button><button className="primary" disabled={!queued || running || !snapshot.tools.ready} onClick={() => void window.framebridge.startQueue()}><Play size={17} fill="currentColor" />开始队列 {queued > 0 && `(${queued})`}</button></div></div>
          {!snapshot.jobs.length ? (
            <button className="drop-zone" disabled={!snapshot.tools.ready} onClick={() => void chooseFiles()}><div className="drop-icon"><FileVideo2 size={30} /></div><strong>将素材拖到这里</strong><span>或点击选择多个视频文件</span><small>MP4 · MOV · MKV · MXF · MTS · WEBM</small></button>
          ) : (
            <div className="job-list">{snapshot.jobs.map((job) => <JobRow key={job.id} job={job} onRefresh={refresh} onLog={async () => setLog({ title: job.media?.fileName ?? "任务日志", content: await window.framebridge.readLog(job.id) })} />)}</div>
          )}
        </section>
      </main>

      {settingsOpen && <Settings snapshot={snapshot} close={() => setSettingsOpen(false)} refresh={refresh} />}
      {log && <div className="modal-backdrop" onMouseDown={() => setLog(undefined)}><section className="modal log-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>{log.title}</h2><p>FFmpeg 执行日志</p></div><button className="icon-button" onClick={() => setLog(undefined)}><X /></button></div><pre>{log.content}</pre></section></div>}
    </div>
  );
}

function JobRow({ job, onRefresh, onLog }: { job: TranscodeJob; onRefresh: () => Promise<void>; onLog: () => void }) {
  const video = job.media?.streams.find((stream) => stream.type === "video");
  const isError = ["failed", "canceled", "interrupted"].includes(job.status);
  return <article className={`job-row ${job.status}`}>
    <div className="file-icon"><FileVideo2 size={22} /></div>
    <div className="job-main"><div className="job-title"><strong title={job.inputPath}>{job.media?.fileName ?? job.inputPath.split(/[\\/]/).pop()}</strong><span className={`status ${job.status}`}><StatusIcon status={job.status} />{statusText[job.status]}</span></div><div className="meta"><span>{job.presetName} · {job.resolution === "source" ? "原始分辨率" : `${job.resolution ?? 1080}p`}</span>{video && <span>{video.width}×{video.height}</span>}<span>{formatDuration(job.media?.duration ?? 0)}</span><span>{formatBytes(job.media?.size ?? 0)}</span></div>{job.status === "running" && <div className="progress-line"><div><span style={{ width: `${job.progress}%` }} /></div><small>{job.progress.toFixed(1)}% · {job.speed ?? "--"}</small></div>}{isError && <p className="job-error">{job.error}</p>}</div>
    <div className="job-actions">{job.status === "running" && <button title="取消任务" className="icon-button danger" onClick={() => void window.framebridge.cancelJob(job.id)}><CircleStop size={18} /></button>}{isError && <button title="重新排队" className="icon-button" onClick={async () => { await window.framebridge.retryJob(job.id); await onRefresh(); }}><RotateCcw size={18} /></button>}{job.status === "succeeded" && <button title="在文件夹中显示" className="icon-button" onClick={() => void window.framebridge.revealOutput(job.outputPath)}><FolderOpen size={18} /></button>}{job.logPath && <button className="log-link" onClick={onLog}>日志</button>}{job.status !== "running" && <button title="移除任务" className="icon-button" onClick={async () => { await window.framebridge.removeJob(job.id); await onRefresh(); }}><X size={17} /></button>}</div>
  </article>;
}

function Settings({ snapshot, close, refresh }: { snapshot: AppSnapshot; close: () => void; refresh: () => Promise<void> }) {
  return <div className="modal-backdrop" onMouseDown={close}><section className="modal settings-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>工作台设置</h2><p>转码内核与软件授权</p></div><button className="icon-button" onClick={close}><X /></button></div><div className="settings-section"><div className="section-title"><Gauge size={18} /><div><strong>FFmpeg 工具链</strong><span>安装包已内置，可按需替换为其他构建</span></div></div><div className="path-setting"><label>ffmpeg.exe</label><code>{snapshot.tools.ffmpegPath ?? "未配置"}</code><button onClick={async () => { await window.framebridge.chooseTool("ffmpeg"); await refresh(); }}>选择</button></div><div className="path-setting"><label>ffprobe.exe</label><code>{snapshot.tools.ffprobePath ?? "未配置"}</code><button onClick={async () => { await window.framebridge.chooseTool("ffprobe"); await refresh(); }}>选择</button></div>{snapshot.tools.ready && <div className="capabilities"><Zap size={16} /><span>可用编码器：{snapshot.tools.encoders.join(" · ") || "未识别内置预设编码器"}</span></div>}</div><div className="settings-section"><div className="section-title"><KeyRound size={18} /><div><strong>软件授权</strong><span>{snapshot.license.payload?.customer} · {snapshot.license.payload?.licenseId}</span></div></div><div className="license-summary"><span>版本</span><strong>{snapshot.license.payload?.edition}</strong><span>有效期</span><strong>{snapshot.license.payload?.expiresAt ? new Date(snapshot.license.payload.expiresAt).toLocaleDateString("zh-CN") : "永久"}</strong></div><button className="outline-danger" onClick={async () => { await window.framebridge.deactivate(); close(); await refresh(); }}>解除本机激活</button></div></section></div>;
}
