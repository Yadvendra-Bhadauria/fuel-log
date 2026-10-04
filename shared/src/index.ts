export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type GoalType = "lose" | "maintain" | "gain";
export type FoodSource = "manual" | "open_food_facts" | "usda" | "photo_ai";
export type Confidence = "low" | "medium" | "high";

export const workoutPlanWeekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type WorkoutPlanWeekday = typeof workoutPlanWeekdays[number];
export type WorkoutPlanFocus = "fat-loss" | "strength" | "general-fitness" | "stamina";
export type WorkoutPlanEquipment = "bodyweight" | "dumbbells" | "gym";
export type WorkoutPlanTrainingStyle = "balanced" | "push-pull-legs" | "body-part";

export interface WorkoutPlanPreferences {
  focus: WorkoutPlanFocus;
  daysPerWeek: 2 | 3 | 4 | 5 | 6 | 7;
  equipment: WorkoutPlanEquipment;
  sessionMinutes: 20 | 30 | 45 | 60;
  trainingStyle?: WorkoutPlanTrainingStyle;
}

export interface WorkoutPlanExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  notes: string;
}

export interface WorkoutPlanDay {
  day: WorkoutPlanWeekday;
  label?: string;
  warmUp?: string;
  coolDown?: string;
  exercises: WorkoutPlanExercise[];
}

export interface WorkoutPlan {
  days: WorkoutPlanDay[];
  preferences: WorkoutPlanPreferences | null;
}

export interface ExerciseCatalogEntry {
  id: number;
  name: string;
  category: string;
  equipment: string[];
  license: string;
  licenseUrl: string | null;
  author: string;
}

export interface FoodEntry {
  id: string;
  dayId: string;
  meal: Meal;
  name: string;
  grams: number | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  source: FoodSource;
  confidence: Confidence | null;
  createdAt: string;
}

export interface Workout {
  id: string;
  dayId: string;
  activity: string;
  minutes: number;
  calories: number;
  createdAt: string;
}

export interface DayRecord {
  id: string;
  date: string;
  weightKg: number | null;
  waterGlasses: number;
  foods: FoodEntry[];
  workouts: Workout[];
}

export interface Settings {
  goalType: GoalType | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbsTarget: number | null;
  fatTarget: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  weeklyActiveMinutes: number;
  includeExerciseCalories: boolean;
  keepPhotoThumbnails: boolean;
  sex: "female" | "male" | null;
  age: number | null;
  heightCm: number | null;
  activityFactor: number | null;
}

export interface WeightPlanInput {
  currentWeightKg: number;
  targetWeightKg: number;
  sex: "female" | "male";
  age: number;
  heightCm: number;
  activityFactor: number;
  goalType: GoalType;
}

export interface WeightPlan {
  goalType: GoalType;
  currentWeightKg: number;
  targetWeightKg: number;
  calorieTarget: number;
  maintenanceCalories: number;
  weeklyChangeKg: number;
  estimatedWeeks: number | null;
  note: string;
}

export interface MealAnalysisItem {
  name: string;
  estimated_portion: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: Confidence;
  source?: FoodSource;
}

export interface MealAnalysis {
  is_food: boolean;
  items: MealAnalysisItem[];
  total_kcal: number;
  notes: string;
}

export interface ProductMatch {
  name: string;
  brand?: string;
  barcode?: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: "open_food_facts" | "usda";
}

export function scaleNutrition<T extends {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}>(item: T, nextGrams: number): T {
  if (!Number.isFinite(nextGrams) || nextGrams < 0) throw new RangeError("Grams must be a non-negative number");
  if (item.grams <= 0) return { ...item, grams: nextGrams };
  const factor = nextGrams / item.grams;
  return {
    ...item,
    grams: nextGrams,
    kcal: Math.round(item.kcal * factor),
    protein_g: Math.round(item.protein_g * factor * 10) / 10,
    carbs_g: Math.round(item.carbs_g * factor * 10) / 10,
    fat_g: Math.round(item.fat_g * factor * 10) / 10,
  };
}

export { createBeginnerWorkoutPlan, defaultWorkoutFocus } from "./workoutPlans.js";