import { describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "../src/passwordResetEmail.js";

const config = {
  apiKey: "resend-test-key",
  from: "Fitbiter <hello@example.com>",
  to: "user@example.com",
  resetUrl: "https://fitbiter.example/?resetToken=opaque-token",
};

describe("password reset email", () => {
  it("sends the one-time Fitbiter reset link to the account email", async () => {
    let request: RequestInit | undefined;
    const send = vi.fn<typeof fetch>(async (_input, init) => {
      request = init;
      return new Response(null, { status: 200 });
    });

    await expect(sendPasswordResetEmail(config, send)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: config.from,
      to: [config.to],
      subject: "Reset your Fitbiter password",
      text: expect.stringContaining(config.resetUrl),
      html: expect.stringContaining(`href="${config.resetUrl}"`),
    });
  });

  it("surfaces provider and network delivery failures", async () => {
    await expect(sendPasswordResetEmail(config, async () => new Response(null, { status: 503 })))
      .rejects.toThrow("Resend returned status 503.");
    await expect(sendPasswordResetEmail(config, async () => {
      throw new Error("network unavailable");
    })).rejects.toThrow("network unavailable");
  });
});
