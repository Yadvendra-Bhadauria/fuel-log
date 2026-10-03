import { describe, expect, it } from "vitest";
import { createPasswordResetToken, createSessionToken, hashPassword, hashPasswordResetToken, hashSessionToken, isValidPassword, verifyPassword } from "../src/auth.js";

describe("account authentication helpers", () => {
  it("hashes passwords and verifies only the matching password", async () => {
    const passwordHash = await hashPassword("a-long-test-password");

    expect(passwordHash).not.toContain("a-long-test-password");
    await expect(verifyPassword("a-long-test-password", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("a-different-password", passwordHash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("anything", "plain-text-password")).resolves.toBe(false);
  });

  it("generates opaque session tokens and stores only their digest", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(hashSessionToken(first)).not.toBe(first);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
  });

  it("accepts passwords containing any six or more characters", () => {
    expect(isValidPassword("12345")).toBe(false);
    expect(isValidPassword("123456")).toBe(true);
    expect(isValidPassword("password@q")).toBe(true);
    expect(isValidPassword("      ")).toBe(true);
  });

  it("generates opaque password-reset tokens and stores only their digest", () => {
    const token = createPasswordResetToken();
    expect(hashPasswordResetToken(token)).not.toBe(token);
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
  });
});
