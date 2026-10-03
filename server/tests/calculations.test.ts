import { describe, expect, it } from "vitest";
import { scaleNutrition } from "@fuel-log/shared";
import { buildWeightPlan, estimateCalorieTarget } from "../src/calculations.js";

describe("calorie target estimate", () => {
  it("uses Mifflin-St Jeor with the maintenance activity factor", () => {
    expect(estimateCalorieTarget({
      sex: "female", age: 30, heightCm: 165, weightKg: 65, activityFactor: 1.2, goalType: "maintain",
    })).toBe(1644);
  });

  it("applies the sex-specific minimum for a weight-loss estimate", () => {
    expect(estimateCalorieTarget({
      sex: "female", age: 30, heightCm: 150, weightKg: 45, activityFactor: 1.2, goalType: "lose",
    })).toBe(1200);
  });

  it("adds 300 calories for a gain goal", () => {
    expect(estimateCalorieTarget({
      sex: "male", age: 30, heightCm: 180, weightKg: 80, activityFactor: 1.2, goalType: "gain",
    })).toBe(2436);
  });
});

describe("target weight plan", () => {
  const input = {
    currentWeightKg: 80,
    targetWeightKg: 70,
    sex: "female" as const,
    age: 30,
    heightCm: 165,
    activityFactor: 1.45,
    goalType: "lose" as const,
  };

  it("returns a daily intake and estimated time to target", () => {
    expect(buildWeightPlan(input)).toMatchObject({
      calorieTarget: 1704,
      maintenanceCalories: 2204,
      weeklyChangeKg: 0.45,
      estimatedWeeks: 22,
    });
  });

  it("rejects a target that conflicts with the selected goal", () => {
    expect(() => buildWeightPlan({ ...input, targetWeightKg: 85 })).toThrow("below current weight");
  });
});

describe("nutrition scaling", () => {
  const item = { name: "Oats", grams: 150, kcal: 585, protein_g: 25.4, carbs_g: 99.5, fat_g: 10.4 };

  it("scales calories and macros from the original portion", () => {
    expect(scaleNutrition(item, 75)).toEqual({
      ...item, grams: 75, kcal: 293, protein_g: 12.7, carbs_g: 49.8, fat_g: 5.2,
    });
  });

  it("rejects negative or non-finite portions", () => {
    expect(() => scaleNutrition(item, -1)).toThrow(RangeError);
    expect(() => scaleNutrition(item, Number.NaN)).toThrow(RangeError);
  });
});