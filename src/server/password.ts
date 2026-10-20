import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";

/*
 * Password hashing with Node's built-in scrypt (no native dependencies).
 * Format: scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
 * The format intentionally avoids "$" so it can be pasted into .env files used by Docker Compose
 * without escaping.
 */

const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, params = { N: 16384, r: 8, p: 1 }): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...params, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (![N, R, P].every((x) => Number.isInteger(x) && x > 0)) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length < 32) return false;
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}

/** Constant-time comparison for a plain-text password from the environment. */
export function verifyPlainPassword(password: string, expected: string): boolean {
  const a = createHash("sha256").update(password.normalize("NFKC")).digest();
  const b = createHash("sha256").update(expected.normalize("NFKC")).digest();
  return timingSafeEqual(a, b);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
