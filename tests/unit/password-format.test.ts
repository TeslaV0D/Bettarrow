import { describe, expect, it } from "vitest";
import { hashPassword, verifyPasswordHash, verifyPlainPassword } from "@/server/password";
import { formatClock, formatDuration, kgToUnit, unitToKg } from "@/lib/format";

describe("password hashing", () => {
  it("verifies correct and rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery", { N: 1024, r: 8, p: 1 });
    expect(hash.startsWith("scrypt:1024:8:1:")).toBe(true);
    expect(hash).not.toContain("$");
    expect(await verifyPasswordHash("correct horse battery", hash)).toBe(true);
    expect(await verifyPasswordHash("wrong", hash)).toBe(false);
    expect(await verifyPasswordHash("x", "garbage")).toBe(false);
  });
  it("compares plain passwords", () => {
    expect(verifyPlainPassword("abc12345", "abc12345")).toBe(true);
    expect(verifyPlainPassword("abc12345", "abc1234")).toBe(false);
  });
});

describe("formatting and units", () => {
  it("converts units", () => {
    expect(unitToKg(225, "lb")).toBeCloseTo(102.058, 3);
    expect(kgToUnit(unitToKg(225, "lb"), "lb")).toBeCloseTo(225, 2);
    expect(unitToKg(80, "kg")).toBe(80);
  });
  it("formats durations", () => {
    expect(formatDuration(3725)).toBe("1 h 2 min");
    expect(formatDuration(3725, true)).toBe("1:02:05");
    expect(formatClock(90)).toBe("1:30");
  });
});
