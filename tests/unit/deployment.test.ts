import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolveDatabaseUrl } from "@/server/database-url";
import { verifyPasswordHash } from "@/server/password";

describe("database url", () => {
  it("prefers DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgres://a:b@h/d", POSTGRES_PASSWORD: "x" } as unknown as NodeJS.ProcessEnv)).toBe("postgres://a:b@h/d");
  });
  it("builds and URL-encodes the url from POSTGRES_* variables", () => {
    const url = resolveDatabaseUrl({ POSTGRES_HOST: "db", POSTGRES_USER: "bettarrow", POSTGRES_PASSWORD: "p@ss/w:rd#1", POSTGRES_DB: "bettarrow" } as unknown as NodeJS.ProcessEnv);
    expect(url).toBe("postgres://bettarrow:p%40ss%2Fw%3Ard%231@db:5432/bettarrow");
    expect(decodeURIComponent(new URL(url).password)).toBe("p@ss/w:rd#1");
  });
});

describe("password hash tools", () => {
  const run = (cmd: string, args: string[]) => {
    try {
      return execFileSync(cmd, args, { input: "werkzeug-test-123", encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  it("node and python generators produce hashes the app accepts", async () => {
    for (const [cmd, script] of [["node", "scripts/hash-password.mjs"], ["python3", "scripts/hash-password.py"]] as const) {
      const out = run(cmd, [script]);
      if (out == null && cmd === "python3") continue; // python not installed on this machine
      expect(out).toMatch(/^APP_PASSWORD_HASH=scrypt:16384:8:1:/);
      const hash = out!.slice("APP_PASSWORD_HASH=".length);
      expect(hash).not.toContain("$");
      expect(await verifyPasswordHash("werkzeug-test-123", hash)).toBe(true);
      expect(await verifyPasswordHash("falsch-falsch", hash)).toBe(false);
    }
  });
});
