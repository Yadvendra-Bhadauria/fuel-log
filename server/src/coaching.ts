import { z } from "zod";

export const coachingEnquirySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  goal: z.enum(["lose-weight", "build-strength", "improve-fitness", "other"]),
  availability: z.string().trim().min(1).max(120),
  message: z.string().trim().max(1000).default(""),
}).strict();

export const coachingEnquiryStatusSchema = z.object({
  status: z.enum(["new", "contacted", "closed"]),
}).strict();

export type CoachingEnquiryInput = z.infer<typeof coachingEnquirySchema>;
export type CoachingEnquiryStatus = z.infer<typeof coachingEnquiryStatusSchema>["status"];
