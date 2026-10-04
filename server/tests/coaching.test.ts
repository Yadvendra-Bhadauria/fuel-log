import { describe, expect, it } from "vitest";
import { coachingEnquirySchema, coachingEnquiryStatusSchema } from "../src/coaching.js";

describe("coaching enquiry validation", () => {
  it("normalizes email addresses and accepts a complete enquiry", () => {
    expect(coachingEnquirySchema.parse({
      name: "  Sam  ",
      email: "SAM@example.com",
      goal: "build-strength",
      availability: "Weekday evenings",
      message: "New to exercise",
    })).toEqual({
      name: "Sam",
      email: "sam@example.com",
      goal: "build-strength",
      availability: "Weekday evenings",
      message: "New to exercise",
    });
  });

  it("rejects invalid email addresses, unknown goals, and oversized messages", () => {
    const base = {
      name: "Sam",
      email: "sam@example.com",
      goal: "improve-fitness",
      availability: "Weekends",
      message: "",
    };
    expect(coachingEnquirySchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(coachingEnquirySchema.safeParse({ ...base, goal: "medical-advice" }).success).toBe(false);
    expect(coachingEnquirySchema.safeParse({ ...base, message: "x".repeat(1001) }).success).toBe(false);
  });

  it("allows only supported inbox statuses", () => {
    expect(coachingEnquiryStatusSchema.safeParse({ status: "contacted" }).success).toBe(true);
    expect(coachingEnquiryStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
