import { workoutPlanWeekdays, type WorkoutPlan } from "@fuel-log/shared";
import { z } from "zod";

const workoutPlanPreferencesSchema = z.object({
  focus: z.enum(["fat-loss", "strength", "general-fitness", "stamina"]),
  daysPerWeek: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  equipment: z.enum(["bodyweight", "dumbbells", "gym"]),
  sessionMinutes: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  trainingStyle: z.enum(["balanced", "push-pull-legs", "body-part"]).optional(),
}).strict();

export const workoutPlanSchema = z.object({
  days: z.array(z.object({
    day: z.enum(workoutPlanWeekdays),
    label: z.string().min(1).max(80).optional(),
    warmUp: z.string().min(1).max(240).optional(),
    coolDown: z.string().min(1).max(240).optional(),
    exercises: z.array(z.object({
      id: z.string().min(1).max(80),
      name: z.string().trim().min(1).max(120),
      sets: z.number().int().min(1).max(20),
      reps: z.string().trim().min(1).max(40),
      notes: z.string().max(200),
    }).strict()).max(20),
  }).strict()).length(workoutPlanWeekdays.length),
  preferences: workoutPlanPreferencesSchema.nullable(),
}).strict().refine(
  (plan) => plan.days.every((day, index) => day.day === workoutPlanWeekdays[index]),
  { message: "Workout plan days must be in Monday-to-Sunday order." },
).refine(
  (plan) => {
    const ids = plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.id));
    return new Set(ids).size === ids.length;
  },
  { message: "Workout plan exercise IDs must be unique." },
);

export const emptyWorkoutPlan = (): WorkoutPlan => ({
  days: workoutPlanWeekdays.map((day) => ({ day, exercises: [] })),
  preferences: null,
});

export const parseWorkoutPlan = (serializedDays: string, serializedPreferences: string): WorkoutPlan =>
  workoutPlanSchema.parse({
    days: JSON.parse(serializedDays),
    preferences: serializedPreferences === "{}" ? null : JSON.parse(serializedPreferences),
  });
