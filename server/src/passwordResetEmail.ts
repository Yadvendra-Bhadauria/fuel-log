type PasswordResetEmailConfig = {
  apiKey: string;
  from: string;
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail(
  config: PasswordResetEmailConfig,
  send: typeof fetch = fetch,
): Promise<void> {
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: "Reset your Fitbiter password",
      text: `Use this link to reset your Fitbiter password. The link expires in 30 minutes and can only be used once:\n\n${config.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the link below to reset your Fitbiter password. It expires in 30 minutes and can only be used once.</p><p><a href="${config.resetUrl}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned status ${response.status}.`);
}
