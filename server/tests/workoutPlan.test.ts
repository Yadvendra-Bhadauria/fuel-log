import { describe, expect, it } from "vitest";
import { emptyWorkoutPlan, parseWorkoutPlan, workoutPlanSchema } from "../src/workoutPlan.js";
import { createBeginnerWorkoutPlan } from "../../shared/src/workoutPlans.js";

describe("workout plan validation", () => {
  it("starts with an empty entry for each weekday", () => {
    expect(emptyWorkoutPlan().days.map((day) => day.day)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    expect(emptyWorkoutPlan().days.every((day) => day.exercises.length === 0)).toBe(true);
  });

  it("accepts and parses a complete editable weekly plan", () => {
    const plan = emptyWorkoutPlan();
    plan.preferences = { focus: "general-fitness", daysPerWeek: 3, equipment: "bodyweight", sessionMinutes: 30 };
    plan.days[0]!.exercises.push({ id: "exercise-1", name: "Squats", sets: 3, reps: "8-12", notes: "Use a comfortable weight." });

    expect(workoutPlanSchema.parse(plan)).toEqual(plan);
    expect(parseWorkoutPlan(JSON.stringify(plan.days), JSON.stringify(plan.preferences))).toEqual(plan);
  });

  it("rejects missing, reordered, or invalid plan days and exercises", () => {
    const plan = emptyWorkoutPlan();
    expect(workoutPlanSchema.safeParse({ days: plan.days.slice(1) }).success).toBe(false);

    const reordered = emptyWorkoutPlan();
    [reordered.days[0], reordered.days[1]] = [reordered.days[1]!, reordered.days[0]!];
    expect(workoutPlanSchema.safeParse(reordered).success).toBe(false);

    const invalidExercise = emptyWorkoutPlan();
    invalidExercise.days[0]!.exercises.push({ id: "bad", name: "", sets: 0, reps: "", notes: "" });
    expect(workoutPlanSchema.safeParse(invalidExercise).success).toBe(false);

    const duplicateIds = emptyWorkoutPlan();
    duplicateIds.days[0]!.exercises.push({ id: "duplicate", name: "Squats", sets: 3, reps: "8-12", notes: "" });
    duplicateIds.days[1]!.exercises.push({ id: "duplicate", name: "Rows", sets: 3, reps: "8-12", notes: "" });
    expect(workoutPlanSchema.safeParse(duplicateIds).success).toBe(false);
  });

  it("generates a beginner plan with the requested days, equipment, and saved preferences", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "fat-loss",
      daysPerWeek: 5,
      equipment: "dumbbells",
      sessionMinutes: 45,
    });

    expect(plan.preferences).toEqual({
      focus: "fat-loss",
      daysPerWeek: 5,
      equipment: "dumbbells",
      sessionMinutes: 45,
    });
    expect(plan.days.filter((day) => day.exercises.length > 0)).toHaveLength(5);
    expect(plan.days.flatMap((day) => day.exercises).some((exercise) => exercise.name.includes("Dumbbell"))).toBe(true);
    expect(plan.days.flatMap((day) => day.exercises).some((exercise) => exercise.name.includes("walk"))).toBe(true);
  });

  it("balances a three-day week with two strength sessions and a cardio day", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "general-fitness",
      daysPerWeek: 3,
      equipment: "bodyweight",
      sessionMinutes: 30,
    });

    expect(plan.days.filter((day) => day.exercises.some((exercise) => exercise.name.includes("walk")))).toHaveLength(1);
    expect(plan.days.filter((day) => day.exercises.some((exercise) => exercise.name.includes("walk")))[0]?.exercises[0]?.reps).toBe("30 minutes");
    expect(plan.days.filter((day) => day.exercises.length > 0)).toHaveLength(3);
  });

  it("uses a six-day push/pull/legs split with Sunday as a rest day", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "strength",
      daysPerWeek: 6,
      equipment: "gym",
      sessionMinutes: 45,
    });

    expect(plan.days.map((day) => day.label ?? "Rest day")).toEqual([
      "Push · Chest, shoulders & triceps",
      "Pull · Back & biceps",
      "Legs · Lower body & core",
      "Push · Chest, shoulders & triceps",
      "Pull · Back & biceps",
      "Legs · Lower body & core",
      "Rest day",
    ]);
    expect(plan.days[0]?.exercises.map((exercise) => exercise.name)).toEqual([
      "Machine chest press",
      "Machine shoulder press",
      "Cable triceps pressdown",
    ]);
    expect(plan.days[1]?.exercises.map((exercise) => exercise.name)).toEqual([
      "Seated cable row",
      "Lat pulldown",
      "Cable biceps curl",
    ]);
    expect(plan.days[2]?.exercises.some((exercise) => exercise.name.includes("triceps"))).toBe(false);
    expect(plan.days[6]?.exercises).toEqual([]);
    expect(plan.days.slice(0, 6).every((day) => day.warmUp && day.coolDown)).toBe(true);
    expect(workoutPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("generates a gym body-part plan for an experienced seven-day schedule with recovery", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "strength",
      daysPerWeek: 7,
      equipment: "gym",
      sessionMinutes: 60,
      trainingStyle: "body-part",
    });

    expect(plan.days.map((day) => day.label)).toEqual([
      "Chest focus",
      "Back focus",
      "Legs focus",
      "Shoulders focus",
      "Arms focus",
      "Core focus",
      "Recovery · Easy cardio or mobility",
    ]);
    expect(plan.days.slice(0, 6).every((day) => day.exercises.length === 4)).toBe(true);
    expect(plan.days.slice(0, 6).every((day) => day.warmUp && day.coolDown)).toBe(true);
    expect(plan.days[6]?.exercises[0]?.name).toBe("Easy walk, cycle or mobility");
    expect(workoutPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("adapts exercise selection, sets, and prep time to a 20-minute session", () => {
    const shortPlan = createBeginnerWorkoutPlan({
      focus: "strength",
      daysPerWeek: 7,
      equipment: "gym",
      sessionMinutes: 20,
      trainingStyle: "body-part",
    });
    const longPlan = createBeginnerWorkoutPlan({
      focus: "strength",
      daysPerWeek: 7,
      equipment: "gym",
      sessionMinutes: 60,
      trainingStyle: "body-part",
    });
    const shortDay = shortPlan.days[0]!;
    const longDay = longPlan.days[0]!;

    expect(shortDay.exercises.map((exercise) => exercise.name)).toEqual([
      "Machine chest press",
      "Pec deck",
    ]);
    expect(shortDay.exercises.length).toBeLessThan(longDay.exercises.length);
    expect(shortDay.exercises.every((exercise) => exercise.sets === 2)).toBe(true);
    expect(longDay.exercises[0]?.sets).toBe(3);
    expect(shortDay.warmUp).toContain("3-5 minutes");
    expect(longDay.warmUp).toContain("5-10 minutes");
    expect(shortDay.coolDown).toContain("2-3 minutes");
    expect(longDay.coolDown).toContain("5-10 minutes");
  });

  it("does not apply experienced gym split styles to non-gym equipment", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "general-fitness",
      daysPerWeek: 6,
      equipment: "dumbbells",
      sessionMinutes: 30,
      trainingStyle: "body-part",
    });

    expect(plan.days[0]?.label).toBeUndefined();
    expect(plan.days.flatMap((day) => day.exercises).some((exercise) => exercise.name.includes("Machine"))).toBe(false);
    expect(plan.days[6]?.exercises).toEqual([]);
  });

  it("generates a seven-day plan with lighter recovery sessions", () => {
    const plan = createBeginnerWorkoutPlan({
      focus: "general-fitness",
      daysPerWeek: 7,
      equipment: "bodyweight",
      sessionMinutes: 30,
    });

    expect(plan.preferences?.daysPerWeek).toBe(7);
    expect(plan.days.every((day) => day.exercises.length > 0)).toBe(true);
    expect(plan.days.filter((day) => day.exercises.some((exercise) => exercise.name.includes("walk")))).toHaveLength(4);
    expect(plan.days[6]?.exercises[0]?.name).toBe("Gentle walk or mobility");
    expect(plan.days.every((day) => day.warmUp && day.coolDown)).toBe(true);
    expect(workoutPlanSchema.safeParse(plan).success).toBe(true);
  });
});
