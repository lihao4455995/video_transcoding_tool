import { randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const index = argument.indexOf("=");
  return index > 2 && argument.startsWith("--")
    ? [argument.slice(2, index), argument.slice(index + 1)]
    : [argument.slice(2), "true"];
}));

if (!values.key || !values.installation || !values.customer) {
  console.error("Usage: pnpm license:issue --key=private.pem --installation=XXXXX-... --customer=Name [--edition=TEAM] [--expires=YYYY-MM-DD]");
  process.exit(1);
}

const payload = {
  version: 1,
  licenseId: randomUUID(),
  customer: values.customer,
  edition: values.edition === "PRO" ? "PRO" : "TEAM",
  installationId: values.installation.toUpperCase(),
  issuedAt: new Date().toISOString(),
  expiresAt: values.expires ? new Date(`${values.expires}T23:59:59+08:00`).toISOString() : null,
  features: ["batch", "presets", "transcode"],
};
const body = JSON.stringify(payload);
const signature = sign(null, Buffer.from(body), readFileSync(values.key, "utf8"));
process.stdout.write(`VTL1.${Buffer.from(body).toString("base64url")}.${signature.toString("base64url")}`);
