import { describe, expect, it, vi } from "vitest";
import { coachingEnquirySchema } from "../src/coaching.js";
import { sendCoachingEnquiryNotification } from "../src/coachingEmail.js";

const enquiry = coachingEnquirySchema.parse({
  name: "<script>alert('x')</script>",
  email: "user@example.com",
  goal: "build-strength",
  availability: "Weekday evenings",
  message: "<img src=x onerror=alert(1)>",
});

const config = {
  apiKey: "resend-test-key",
  from: "Fitbiter <coach@example.com>",
  to: "bhadauria.ravi8@gmail.com",
};

describe("coaching enquiry email notifications", () => {
  it("reports missing email configuration without attempting delivery", async () => {
    const send = vi.fn<typeof fetch>();

    await expect(sendCoachingEnquiryNotification(enquiry, { ...config, apiKey: "" }, send))
      .resolves.toBe("not-configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("emails the configured coach with reply-to and escaped enquiry details", async () => {
    let request: RequestInit | undefined;
    const send = vi.fn<typeof fetch>(async (_input, init) => {
      request = init;
      return new Response(null, { status: 200 });
    });

    await expect(sendCoachingEnquiryNotification(enquiry, config, send)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: config.from,
      to: [config.to],
      reply_to: enquiry.email,
      subject: "New Fitbiter coaching enquiry",
      text: expect.stringContaining(enquiry.email),
      html: expect.stringContaining("&lt;script&gt;"),
    });
    expect(JSON.parse(String(request?.body)).html).not.toContain("<script>");
  });

  it("reports provider and network failures without throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(sendCoachingEnquiryNotification(enquiry, config, async () =>
        new Response(null, { status: 503 }))).resolves.toBe("failed");
      await expect(sendCoachingEnquiryNotification(enquiry, config, async () => {
        throw new Error("network unavailable");
      })).resolves.toBe("failed");
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});
