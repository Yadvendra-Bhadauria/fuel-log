import type { CoachingEnquiryInput } from "./coaching.js";

export type CoachingEmailStatus = "sent" | "not-configured" | "failed";

type CoachingEmailConfig = {
  apiKey: string;
  from: string;
  to: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]!);

export async function sendCoachingEnquiryNotification(
  enquiry: CoachingEnquiryInput,
  config: CoachingEmailConfig,
  send: typeof fetch = fetch,
): Promise<CoachingEmailStatus> {
  if (!config.apiKey || !config.from || !config.to) return "not-configured";

  const goal = enquiry.goal.replaceAll("-", " ");
  const text = [
    "A new Fitbiter coaching enquiry was submitted.",
    "",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Goal: ${goal}`,
    `Availability: ${enquiry.availability}`,
    `Message: ${enquiry.message || "(none)"}`,
  ].join("\n");
  const html = `<p>A new Fitbiter coaching enquiry was submitted.</p><dl><dt>Name</dt><dd>${escapeHtml(enquiry.name)}</dd><dt>Email</dt><dd>${escapeHtml(enquiry.email)}</dd><dt>Goal</dt><dd>${escapeHtml(goal)}</dd><dt>Availability</dt><dd>${escapeHtml(enquiry.availability)}</dd><dt>Message</dt><dd>${escapeHtml(enquiry.message || "(none)")}</dd></dl>`;

  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        reply_to: enquiry.email,
        subject: "New Fitbiter coaching enquiry",
        text,
        html,
      }),
    });
    if (!response.ok) {
      console.error("Coaching enquiry email delivery failed with status", response.status);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("Coaching enquiry email delivery failed:", error);
    return "failed";
  }
}
