import { useState } from "react";
import { Check, FileKey2, KeyRound, ShieldCheck } from "lucide-react";

export function KeygenApp() {
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [customer, setCustomer] = useState("");
  const [edition, setEdition] = useState<"TEAM" | "PRO">("TEAM");
  const [expiresAt, setExpiresAt] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    try {
      setError("");
      setCode(await window.framebridge.keygenGenerate({ privateKeyPath, installationId, customer, edition, expiresAt: expiresAt || null }));
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
  }

  return <div className="keygen-shell"><header><div className="brand"><div className="brand-mark small"><span>山</span></div><div><strong>山水映帧授权中心</strong><small>OFFLINE LICENSE ISSUER</small></div></div><span className="secure-label"><ShieldCheck size={16} />仅限授权管理员</span></header><main className="keygen-main"><div><p className="eyebrow">LICENSE OPERATIONS</p><h1>签发离线注册码</h1><p>注册码使用 Ed25519 私钥签名，并绑定目标电脑的安装码。私钥只应保存在授权管理员的离线设备中。</p></div><section className="keygen-form"><label>许可证私钥</label><button className="key-path" onClick={async () => { const path = await window.framebridge.keygenChooseKey(); if (path) setPrivateKeyPath(path); }}><FileKey2 size={18} /><span>{privateKeyPath || "选择 license-private.pem"}</span></button><div className="form-grid"><label>客户 / 部门<input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="例如：后期制作部" /></label><label>授权版本<select value={edition} onChange={(event) => setEdition(event.target.value as "TEAM" | "PRO")}><option value="TEAM">TEAM</option><option value="PRO">PRO</option></select></label></div><label>目标电脑安装码<input value={installationId} onChange={(event) => setInstallationId(event.target.value.toUpperCase())} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" /></label><label>到期日期 <span>留空表示永久</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>{error && <p className="error-line">{error}</p>}<button className="primary wide" disabled={!privateKeyPath || !installationId.trim() || !customer.trim()} onClick={() => void generate()}><KeyRound size={17} />生成注册码</button></section>{code && <section className="code-result"><div><strong>注册码已生成</strong><span>发送给对应安装码的使用者</span></div><textarea readOnly rows={6} value={code} /><button onClick={() => navigator.clipboard.writeText(code)}><Check size={16} />复制注册码</button></section>}</main></div>;
}
