import { createPublicKey, sign, verify } from "node:crypto";
import type { LicensePayload } from "./types";

const PREFIX = "VTL1";

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function serializePayload(payload: LicensePayload): string {
  return JSON.stringify({
    version: payload.version,
    licenseId: payload.licenseId,
    customer: payload.customer,
    edition: payload.edition,
    installationId: payload.installationId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    features: [...payload.features].sort(),
  });
}

export function createLicenseCode(payload: LicensePayload, privateKeyPem: string): string {
  const body = serializePayload(payload);
  const signature = sign(null, Buffer.from(body), privateKeyPem);
  return `${PREFIX}.${base64UrlEncode(body)}.${base64UrlEncode(signature)}`;
}

export function verifyLicenseCode(
  code: string,
  publicKeyPem: string,
  installationId: string,
  now = new Date(),
): { valid: true; payload: LicensePayload } | { valid: false; reason: string } {
  try {
    const [prefix, bodyPart, signaturePart, extra] = code.trim().split(".");
    if (prefix !== PREFIX || !bodyPart || !signaturePart || extra) {
      return { valid: false, reason: "注册码格式无效" };
    }
    const body = base64UrlDecode(bodyPart);
    const signature = base64UrlDecode(signaturePart);
    if (!verify(null, body, createPublicKey(publicKeyPem), signature)) {
      return { valid: false, reason: "注册码签名无效" };
    }
    const payload = JSON.parse(body.toString("utf8")) as LicensePayload;
    if (payload.version !== 1 || payload.installationId !== installationId) {
      return { valid: false, reason: "注册码与本机安装码不匹配" };
    }
    if (payload.expiresAt && new Date(payload.expiresAt).getTime() < now.getTime()) {
      return { valid: false, reason: "注册码已过期" };
    }
    if (!payload.features.includes("transcode")) {
      return { valid: false, reason: "注册码不包含转码功能" };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "注册码无法解析" };
  }
}
