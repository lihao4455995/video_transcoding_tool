import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createLicenseCode, verifyLicenseCode } from "./license";
import type { LicensePayload } from "./types";

function fixture(expiresAt: string | null = null) {
  const keys = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  const payload: LicensePayload = {
    version: 1,
    licenseId: randomUUID(),
    customer: "后期制作部",
    edition: "TEAM",
    installationId: "ABCDE-FGHIJ-KLMNO-PQRST",
    issuedAt: "2026-09-04T00:00:00.000Z",
    expiresAt,
    features: ["transcode", "batch"],
  };
  return { keys, payload, code: createLicenseCode(payload, keys.privateKey) };
}

describe("offline license", () => {
  it("accepts a correctly signed license for the target installation", () => {
    const { keys, payload, code } = fixture();
    const result = verifyLicenseCode(code, keys.publicKey, payload.installationId);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.customer).toBe("后期制作部");
  });

  it("rejects a license copied to another installation", () => {
    const { keys, code } = fixture();
    expect(verifyLicenseCode(code, keys.publicKey, "OTHER-INSTALLATION")).toEqual({
      valid: false,
      reason: "注册码与本机安装码不匹配",
    });
  });

  it("rejects tampering and expiry", () => {
    const { keys, payload, code } = fixture("2025-01-01T00:00:00.000Z");
    expect(verifyLicenseCode(code, keys.publicKey, payload.installationId, new Date("2026-01-01"))).toMatchObject({ valid: false, reason: "注册码已过期" });
    expect(verifyLicenseCode(`${code}x`, keys.publicKey, payload.installationId)).toMatchObject({ valid: false });
  });
});
