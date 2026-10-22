/**
 * RFC 4122 v4 UUID that also works outside secure contexts.
 * `crypto.randomUUID` only exists on HTTPS/localhost, but the app is commonly opened via
 * plain http://<lan-ip>:3000, where calling it throws. `getRandomValues` has no such restriction.
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
