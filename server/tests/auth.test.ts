import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "../src/auth.js";

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
});
