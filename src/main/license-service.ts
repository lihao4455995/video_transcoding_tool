import { app, safeStorage } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { LicenseState } from "../shared/types";
import { verifyLicenseCode } from "../shared/license";
import { LICENSE_PUBLIC_KEY } from "../shared/license-public-key";
import type { AppDatabase } from "./database";

export class LicenseService {
  readonly installationId: string;

  constructor(private readonly db: AppDatabase) {
    this.installationId = this.createInstallationId();
  }

  private createInstallationId(): string {
    let machineSource = "unknown-machine";
    if (process.platform === "win32") {
      try {
        const output = execFileSync(
          "reg.exe",
          ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
          { encoding: "utf8", windowsHide: true },
        );
        machineSource = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim() ?? machineSource;
      } catch {
        // The persisted fallback still keeps the license stable for this installation.
      }
    }
    let installSalt = this.db.getSetting("installationSalt");
    if (!installSalt) {
      installSalt = randomUUID();
      this.db.setSetting("installationSalt", installSalt);
    }
    const digest = createHash("sha256").update(`framebridge:${machineSource}:${installSalt}`).digest("hex").toUpperCase();
    return `${digest.slice(0, 5)}-${digest.slice(5, 10)}-${digest.slice(10, 15)}-${digest.slice(15, 20)}`;
  }

  private readCode(): string | undefined {
    const stored = this.db.getSetting("licenseCode");
    if (!stored) return undefined;
    try {
      if (stored.startsWith("plain:")) return stored.slice(6);
      return safeStorage.decryptString(Buffer.from(stored, "base64"));
    } catch {
      return undefined;
    }
  }

  state(): LicenseState {
    if (LICENSE_PUBLIC_KEY.includes("NOT_GENERATED")) {
      return { active: false, installationId: this.installationId, reason: "产品授权公钥尚未生成" };
    }
    const code = this.readCode();
    if (!code) return { active: false, installationId: this.installationId, reason: "尚未激活" };
    const result = verifyLicenseCode(code, LICENSE_PUBLIC_KEY, this.installationId);
    return result.valid
      ? { active: true, installationId: this.installationId, payload: result.payload }
      : { active: false, installationId: this.installationId, reason: result.reason };
  }

  activate(code: string): LicenseState {
    const result = verifyLicenseCode(code, LICENSE_PUBLIC_KEY, this.installationId);
    if (!result.valid) return { active: false, installationId: this.installationId, reason: result.reason };
    const stored = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(code.trim()).toString("base64")
      : `plain:${code.trim()}`;
    this.db.setSetting("licenseCode", stored);
    return { active: true, installationId: this.installationId, payload: result.payload };
  }

  deactivate(): LicenseState {
    this.db.deleteSetting("licenseCode");
    return this.state();
  }
}
