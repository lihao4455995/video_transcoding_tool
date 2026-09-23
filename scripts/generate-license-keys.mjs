import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyDir = resolve(root, "license-keys");
const privatePath = resolve(keyDir, "license-private.pem");
const publicPath = resolve(keyDir, "license-public.pem");
const sourcePath = resolve(root, "src/shared/license-public-key.ts");

mkdirSync(keyDir, { recursive: true });

if (existsSync(privatePath)) {
  console.error(`Refusing to overwrite existing private key: ${privatePath}`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

writeFileSync(privatePath, privateKey, { encoding: "utf8", mode: 0o600 });
writeFileSync(publicPath, publicKey, "utf8");
writeFileSync(
  sourcePath,
  `// Generated public key. Never place the matching private key in an application package.\nexport const LICENSE_PUBLIC_KEY = ${JSON.stringify(publicKey)};\n`,
  "utf8",
);

console.log(`Private key: ${privatePath}`);
console.log(`Public key:  ${publicPath}`);
console.log(`Application public key updated: ${sourcePath}`);
