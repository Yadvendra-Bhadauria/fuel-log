import type { WeightPlan, WeightPlanInput } from "@fuel-log/shared";

export function estimateCalorieTarget(input: {
  sex: "female" | "male";
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
  goalType: "lose" | "maintain" | "gain";
}): number {
  const sexAdjustment = input.sex === "male" ? 5 : -161;
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexAdjustment;
  const tdee = bmr * input.activityFactor;
  const goalCalories = input.goalType === "lose" ? tdee - 500 : input.goalType === "gain" ? tdee + 300 : tdee;
  return Math.round(Math.max(input.sex === "female" ? 1200 : 1500, goalCalories));
}

export function buildWeightPlan(input: WeightPlanInput): WeightPlan {
  const difference = input.targetWeightKg - input.currentWeightKg;
  if (input.goalType === "lose" && difference >= 0) {
    throw new RangeError("For a loss plan, target weight must be below current weight.");
  }
  if (input.goalType === "gain" && difference <= 0) {
    throw new RangeError("For a gain plan, target weight must be above current weight.");
  }
  if (input.goalType === "maintain" && Math.abs(difference) > 0.5) {
    throw new RangeError("Choose lose or gain when your target differs from current weight.");
  }

  const sexAdjustment = input.sex === "male" ? 5 : -161;
  const bmr = 10 * input.currentWeightKg + 6.25 * input.heightCm - 5 * input.age + sexAdjustment;
  const maintenanceCalories = Math.round(bmr * input.activityFactor);
  const calorieTarget = estimateCalorieTarget({ ...input, weightKg: input.currentWeightKg });
  const dailyAdjustment = input.goalType === "lose"
    ? maintenanceCalories - calorieTarget
    : input.goalType === "gain" ? calorieTarget - maintenanceCalories : 0;
  const weeklyChangeExact = Math.max(0, dailyAdjustment) * 7 / 7700;
  const weeklyChangeKg = Math.round(weeklyChangeExact * 100) / 100;
  const estimatedWeeks = input.goalType === "maintain"
    ? 0
    : weeklyChangeExact > 0 ? Math.ceil(Math.abs(difference) / weeklyChangeExact) : null;
  const note = input.goalType === "maintain"
    ? "A maintenance estimate, not a deadline. Your needs can shift over time."
    : estimatedWeeks === null
      ? "The calorie minimum leaves no estimated deficit or surplus for this goal. Get individualized guidance rather than lowering the target."
      : "An approximate timeline based on a steady rate. Real weight change varies; review progress and adjust gradually.";

  return {
    goalType: input.goalType,
    currentWeightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    calorieTarget,
    maintenanceCalories,
    weeklyChangeKg,
    estimatedWeeks,
    note,
  };
}