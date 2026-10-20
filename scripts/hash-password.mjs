#!/usr/bin/env node
/*
 * Creates an APP_PASSWORD_HASH value for .env (no dependencies, works inside the Docker image).
 *   node scripts/hash-password.mjs               (prompts, input hidden)
 *   printf '%s' 'secret' | node scripts/hash-password.mjs
 * Format: scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>  (must match src/server/password.ts)
 */
import { randomBytes, scrypt } from "node:crypto";

function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const password = process.stdin.isTTY ? await readHidden("Passwort: ") : await readStdin();
if (password.length < 8) {
  console.error("Das Passwort muss mindestens 8 Zeichen lang sein.");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const key = await new Promise((res, rej) =>
  scrypt(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))),
);
console.log(`APP_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}`);
