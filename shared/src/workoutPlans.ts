import {
  workoutPlanWeekdays,
  type WorkoutPlan,
  type WorkoutPlanDay,
  type WorkoutPlanEquipment,
  type WorkoutPlanExercise,
  type WorkoutPlanFocus,
  type WorkoutPlanPreferences,
  type WorkoutPlanTrainingStyle,
  type WorkoutPlanWeekday,
} from "./index.js";

type ExerciseTemplate = Pick<WorkoutPlanExercise, "name" | "sets" | "reps" | "notes">;

const fullBodyExercises: Record<WorkoutPlanEquipment, [ExerciseTemplate[], ExerciseTemplate[]]> = {
  bodyweight: [
    [
      { name: "Chair squat", sets: 2, reps: "8-12", notes: "Tap a chair, then stand; keep the movement comfortable." },
      { name: "Wall or counter push-up", sets: 2, reps: "6-10", notes: "Use a higher surface to make it easier." },
      { name: "Backpack row", sets: 2, reps: "8-12 each side", notes: "Use a light backpack and support your free hand." },
      { name: "Glute bridge", sets: 2, reps: "10-12", notes: "Pause gently at the top; do not arch your back." },
      { name: "Bird dog", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your back steady." },
    ],
    [
      { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a wall or chair; use a short, comfortable range." },
      { name: "Incline push-up", sets: 2, reps: "6-10", notes: "Use a wall or counter and keep your body in a straight line." },
      { name: "Backpack row", sets: 2, reps: "8-12 each side", notes: "Use a light backpack and support your free hand." },
      { name: "Hip hinge", sets: 2, reps: "8-12", notes: "Practice pushing your hips back with a neutral back." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Keep your lower back comfortable against the floor." },
    ],
  ],
  dumbbells: [
    [
      { name: "Dumbbell goblet squat", sets: 2, reps: "8-12", notes: "Start light and use a comfortable depth." },
      { name: "Dumbbell floor press", sets: 2, reps: "8-12", notes: "Keep wrists stacked over elbows." },
      { name: "One-arm dumbbell row", sets: 2, reps: "8-12 each side", notes: "Support your free hand and avoid twisting." },
      { name: "Dumbbell Romanian deadlift", sets: 2, reps: "8-12", notes: "Keep weights close and move through your hips." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your lower back comfortable." },
    ],
    [
      { name: "Dumbbell step-up", sets: 2, reps: "6-8 each side", notes: "Use a low, stable step; begin without weights if needed." },
      { name: "Seated dumbbell shoulder press", sets: 2, reps: "8-12", notes: "Use light weights and a comfortable range." },
      { name: "One-arm dumbbell row", sets: 2, reps: "8-12 each side", notes: "Support your free hand and avoid twisting." },
      { name: "Dumbbell glute bridge", sets: 2, reps: "10-12", notes: "Only add a light weight if the movement feels comfortable." },
      { name: "Bird dog", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your back steady." },
    ],
  ],
  gym: [
    [
      { name: "Leg press", sets: 2, reps: "8-12", notes: "Use a light load and a comfortable range; do not lock your knees." },
      { name: "Machine chest press", sets: 2, reps: "8-12", notes: "Adjust the seat and keep shoulders relaxed." },
      { name: "Seated cable row", sets: 2, reps: "8-12", notes: "Sit tall and pull without leaning back." },
      { name: "Dumbbell Romanian deadlift", sets: 2, reps: "8-12", notes: "Start light and ask gym staff to check your form." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your lower back comfortable." },
    ],
    [
      { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a rail for support and use a comfortable range." },
      { name: "Lat pulldown", sets: 2, reps: "8-12", notes: "Pull toward your upper chest without swinging." },
      { name: "Machine chest press", sets: 2, reps: "8-12", notes: "Adjust the seat and keep shoulders relaxed." },
      { name: "Seated leg curl", sets: 2, reps: "8-12", notes: "Use a light load and a controlled pace." },
      { name: "Bird dog", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your back steady." },
    ],
  ],
};

const upperBodyExercises: Record<WorkoutPlanEquipment, ExerciseTemplate[]> = {
  bodyweight: [
    { name: "Wall or counter push-up", sets: 2, reps: "6-10", notes: "Use a higher surface to make it easier." },
    { name: "Backpack row", sets: 2, reps: "8-12 each side", notes: "Use a light backpack and support your free hand." },
    { name: "Wall slide", sets: 2, reps: "8-10", notes: "Keep the movement pain-free and controlled." },
    { name: "Prone W raise", sets: 2, reps: "8-10", notes: "Use a small range and keep your neck relaxed." },
  ],
  dumbbells: [
    { name: "Dumbbell floor press", sets: 2, reps: "8-12", notes: "Keep wrists stacked over elbows." },
    { name: "One-arm dumbbell row", sets: 2, reps: "8-12 each side", notes: "Support your free hand and avoid twisting." },
    { name: "Seated dumbbell shoulder press", sets: 2, reps: "8-12", notes: "Use light weights and a comfortable range." },
    { name: "Dumbbell curl", sets: 2, reps: "10-12", notes: "Keep elbows near your sides." },
  ],
  gym: [
    { name: "Machine chest press", sets: 2, reps: "8-12", notes: "Adjust the seat and keep shoulders relaxed." },
    { name: "Seated cable row", sets: 2, reps: "8-12", notes: "Sit tall and pull without leaning back." },
    { name: "Lat pulldown", sets: 2, reps: "8-12", notes: "Pull toward your upper chest without swinging." },
    { name: "Machine shoulder press", sets: 2, reps: "8-12", notes: "Use a light load and comfortable range." },
  ],
};

const lowerBodyExercises: Record<WorkoutPlanEquipment, ExerciseTemplate[]> = {
  bodyweight: [
    { name: "Chair squat", sets: 2, reps: "8-12", notes: "Tap a chair, then stand; keep the movement comfortable." },
    { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a wall or chair; use a short, comfortable range." },
    { name: "Glute bridge", sets: 2, reps: "10-12", notes: "Pause gently at the top; do not arch your back." },
    { name: "Calf raise", sets: 2, reps: "10-15", notes: "Hold a wall or chair for balance." },
  ],
  dumbbells: [
    { name: "Dumbbell goblet squat", sets: 2, reps: "8-12", notes: "Start light and use a comfortable depth." },
    { name: "Dumbbell Romanian deadlift", sets: 2, reps: "8-12", notes: "Keep weights close and move through your hips." },
    { name: "Dumbbell step-up", sets: 2, reps: "6-8 each side", notes: "Use a low, stable step; begin without weights if needed." },
    { name: "Dumbbell glute bridge", sets: 2, reps: "10-12", notes: "Only add a light weight if the movement feels comfortable." },
  ],
  gym: [
    { name: "Leg press", sets: 2, reps: "8-12", notes: "Use a light load and a comfortable range; do not lock your knees." },
    { name: "Seated leg curl", sets: 2, reps: "8-12", notes: "Use a light load and a controlled pace." },
    { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a rail for support and use a comfortable range." },
    { name: "Hip abduction machine", sets: 2, reps: "10-12", notes: "Use a comfortable range and a light load." },
  ],
};

const pushPullLegsExercises: Record<WorkoutPlanEquipment, Record<"push" | "pull" | "legs", ExerciseTemplate[]>> = {
  bodyweight: {
    push: [
      { name: "Incline push-up", sets: 2, reps: "6-10", notes: "Use a wall or counter; keep your body in a straight line." },
      { name: "Pike push-up", sets: 2, reps: "5-8", notes: "Bend your knees and use a small range; skip if uncomfortable." },
      { name: "Close-grip wall push-up", sets: 2, reps: "6-10", notes: "Keep elbows near your sides to emphasize the triceps." },
    ],
    pull: [
      { name: "Backpack row", sets: 2, reps: "8-12 each side", notes: "Use a light backpack, support your free hand, and avoid twisting." },
      { name: "Prone W raise", sets: 2, reps: "8-10", notes: "Use a small, controlled range and keep your neck relaxed." },
      { name: "Backpack biceps curl", sets: 2, reps: "8-12", notes: "Use a light backpack and keep elbows close to your sides." },
    ],
    legs: [
      { name: "Chair squat", sets: 2, reps: "8-12", notes: "Tap a chair, then stand; keep the movement comfortable." },
      { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a wall or chair and use a comfortable range." },
      { name: "Glute bridge", sets: 2, reps: "10-12", notes: "Pause gently at the top; do not arch your back." },
      { name: "Calf raise", sets: 2, reps: "10-15", notes: "Hold a wall or chair for balance." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your lower back comfortable." },
    ],
  },
  dumbbells: {
    push: [
      { name: "Dumbbell floor press", sets: 2, reps: "8-12", notes: "Keep wrists stacked over elbows and use a comfortable range." },
      { name: "Seated dumbbell shoulder press", sets: 2, reps: "8-12", notes: "Start light and stop if you feel shoulder pain." },
      { name: "Dumbbell triceps extension", sets: 2, reps: "8-12", notes: "Use one light dumbbell and keep the movement controlled." },
    ],
    pull: [
      { name: "One-arm dumbbell row", sets: 2, reps: "8-12 each side", notes: "Support your free hand and avoid twisting." },
      { name: "Dumbbell reverse fly", sets: 2, reps: "8-12", notes: "Use very light weights and a small, controlled range." },
      { name: "Dumbbell curl", sets: 2, reps: "8-12", notes: "Keep elbows near your sides and lower slowly." },
    ],
    legs: [
      { name: "Dumbbell goblet squat", sets: 2, reps: "8-12", notes: "Start light and use a comfortable depth." },
      { name: "Dumbbell Romanian deadlift", sets: 2, reps: "8-12", notes: "Keep weights close and move through your hips." },
      { name: "Dumbbell step-up", sets: 2, reps: "6-8 each side", notes: "Use a low, stable step; begin without weights if needed." },
      { name: "Calf raise", sets: 2, reps: "10-15", notes: "Hold a wall for balance; add weights only when ready." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your lower back comfortable." },
    ],
  },
  gym: {
    push: [
      { name: "Machine chest press", sets: 2, reps: "8-12", notes: "Adjust the seat and keep shoulders relaxed." },
      { name: "Machine shoulder press", sets: 2, reps: "8-12", notes: "Use a light load and a comfortable range." },
      { name: "Cable triceps pressdown", sets: 2, reps: "8-12", notes: "Keep elbows close to your sides and avoid swinging." },
      { name: "Incline chest press machine", sets: 2, reps: "8-12", notes: "Use a comfortable range and controlled repetitions." },
    ],
    pull: [
      { name: "Seated cable row", sets: 2, reps: "8-12", notes: "Sit tall and pull without leaning back." },
      { name: "Lat pulldown", sets: 2, reps: "8-12", notes: "Pull toward your upper chest without swinging." },
      { name: "Cable biceps curl", sets: 2, reps: "8-12", notes: "Keep elbows close to your sides and lower slowly." },
      { name: "Reverse pec deck", sets: 2, reps: "10-12", notes: "Keep shoulders relaxed and move with control." },
    ],
    legs: [
      { name: "Leg press", sets: 2, reps: "8-12", notes: "Use a light load and a comfortable range; do not lock your knees." },
      { name: "Seated leg curl", sets: 2, reps: "8-12", notes: "Use a light load and a controlled pace." },
      { name: "Supported split squat", sets: 2, reps: "6-8 each side", notes: "Hold a rail for support and use a comfortable range." },
      { name: "Calf raise machine", sets: 2, reps: "10-15", notes: "Use a comfortable range and controlled repetitions." },
      { name: "Leg extension", sets: 2, reps: "10-12", notes: "Use a comfortable range and stop if your knees hurt." },
      { name: "Dead bug", sets: 2, reps: "6-8 each side", notes: "Move slowly and keep your lower back comfortable." },
    ],
  },
};

const splitLabels: Record<"push" | "pull" | "legs", string> = {
  push: "Push · Chest, shoulders & triceps",
  pull: "Pull · Back & biceps",
  legs: "Legs · Lower body & core",
};

const bodyPartExercises: Record<"chest" | "back" | "legs" | "shoulders" | "arms" | "core", ExerciseTemplate[]> = {
  chest: [
    { name: "Machine chest press", sets: 3, reps: "8-12", notes: "Adjust the seat and keep shoulders relaxed." },
    { name: "Incline chest press machine", sets: 3, reps: "8-12", notes: "Use a comfortable range and controlled repetitions." },
    { name: "Pec deck", sets: 2, reps: "10-12", notes: "Keep the movement controlled; avoid stretching into discomfort." },
    { name: "Cable chest fly", sets: 2, reps: "10-12", notes: "Use a light load and a comfortable range." },
  ],
  back: [
    { name: "Lat pulldown", sets: 3, reps: "8-12", notes: "Pull toward your upper chest without swinging." },
    { name: "Seated cable row", sets: 3, reps: "8-12", notes: "Sit tall and pull without leaning back." },
    { name: "Back extension", sets: 2, reps: "8-12", notes: "Use a small, comfortable range and avoid overextending." },
    { name: "Straight-arm cable pulldown", sets: 2, reps: "10-12", notes: "Keep a slight elbow bend and avoid swinging." },
  ],
  legs: [
    { name: "Leg press", sets: 3, reps: "8-12", notes: "Use a comfortable range and do not lock your knees." },
    { name: "Seated leg curl", sets: 3, reps: "8-12", notes: "Use a light load and controlled repetitions." },
    { name: "Leg extension", sets: 2, reps: "10-12", notes: "Use a comfortable range and stop if your knees hurt." },
    { name: "Calf raise machine", sets: 2, reps: "10-15", notes: "Use a comfortable range and controlled repetitions." },
  ],
  shoulders: [
    { name: "Machine shoulder press", sets: 3, reps: "8-12", notes: "Use a light load and a comfortable range." },
    { name: "Cable lateral raise", sets: 2, reps: "10-12", notes: "Use a light load and raise only to a comfortable height." },
    { name: "Reverse pec deck", sets: 2, reps: "10-12", notes: "Keep shoulders relaxed and move with control." },
    { name: "Cable face pull", sets: 2, reps: "10-12", notes: "Pull toward face height with light resistance and control." },
  ],
  arms: [
    { name: "Cable biceps curl", sets: 3, reps: "8-12", notes: "Keep elbows close to your sides and lower slowly." },
    { name: "Cable triceps pressdown", sets: 3, reps: "8-12", notes: "Keep elbows close to your sides and avoid swinging." },
    { name: "Dumbbell hammer curl", sets: 2, reps: "10-12", notes: "Use a manageable weight and lower slowly." },
    { name: "Cable overhead triceps extension", sets: 2, reps: "10-12", notes: "Use a light load and keep the movement pain-free." },
  ],
  core: [
    { name: "Cable Pallof press", sets: 2, reps: "8-10 each side", notes: "Stand tall and resist rotation; use a light load." },
    { name: "Dead bug", sets: 2, reps: "8-10 each side", notes: "Move slowly and keep your lower back comfortable." },
    { name: "Plank", sets: 2, reps: "20-30 seconds", notes: "Keep a straight line; stop before your form changes." },
    { name: "Cable wood chop", sets: 2, reps: "8-10 each side", notes: "Use a light load and move under control." },
  ],
};

const bodyPartOrder = ["chest", "back", "legs", "shoulders", "arms", "core"] as const;

const addWarmUpAndCoolDown = (day: WorkoutPlanDay, sessionMinutes: number): WorkoutPlanDay => day.exercises.length === 0 ? day : ({
  ...day,
  warmUp: sessionMinutes === 20
    ? "Spend 3-5 minutes on easy cardio and dynamic, comfortable movement for the muscles you will train. Do one light rehearsal set before your first lift."
    : "Spend 5-10 minutes on easy cardio and dynamic, comfortable movement for the muscles you will train. Do a light rehearsal set before your first lift.",
  coolDown: sessionMinutes === 20
    ? "Finish with 2-3 minutes of easy movement and gentle, pain-free stretches for the muscles trained."
    : "Finish with 5-10 minutes of easy movement and gentle, pain-free stretches for the muscles trained. Hold each stretch comfortably; do not bounce.",
});

const makeExercise = (day: WorkoutPlanWeekday, index: number, template: ExerciseTemplate): WorkoutPlanExercise => ({
  id: `${day.toLowerCase()}-${index + 1}`,
  ...template,
});

const chooseExercisesForDuration = (
  exercises: ExerciseTemplate[],
  sessionMinutes: WorkoutPlanPreferences["sessionMinutes"],
): ExerciseTemplate[] => {
  if (sessionMinutes === 20) {
    const quickIndices = exercises.length >= 3 ? [0, 2] : [0, 1];
    return quickIndices.flatMap((index) => exercises[index] ? [exercises[index]!] : []);
  }
  const count = sessionMinutes === 30 || sessionMinutes === 45 ? 3 : 5;
  return exercises.slice(0, count);
};

const adjustSetsForDuration = (
  exercise: ExerciseTemplate,
  sessionMinutes: WorkoutPlanPreferences["sessionMinutes"],
): ExerciseTemplate => ({
  ...exercise,
  sets: sessionMinutes <= 30 ? 2 : exercise.sets,
});

const strengthDay = (
  day: WorkoutPlanWeekday,
  index: number,
  preferences: WorkoutPlanPreferences,
): WorkoutPlanDay => {
  const [first, second] = fullBodyExercises[preferences.equipment];
  const exercises = preferences.daysPerWeek === 4
    ? index % 2 === 0 ? upperBodyExercises[preferences.equipment] : lowerBodyExercises[preferences.equipment]
    : index % 2 === 0 ? first : second;
  const focusNote = preferences.focus === "fat-loss"
    ? "Keep a steady, sustainable pace; strength training supports a balanced fat-loss plan."
    : preferences.focus === "strength"
      ? "Focus on controlled technique and gradually increase resistance when ready."
      : preferences.focus === "stamina"
        ? "Keep rests comfortable and consistent; build your stamina gradually."
        : "Aim for smooth, controlled repetitions and build consistency.";
  return addWarmUpAndCoolDown({
    day,
    exercises: chooseExercisesForDuration(exercises, preferences.sessionMinutes).map((exercise, exerciseIndex) =>
      makeExercise(day, exerciseIndex, adjustSetsForDuration(
        exerciseIndex === 0 ? { ...exercise, notes: `${exercise.notes} ${focusNote}` } : exercise,
        preferences.sessionMinutes,
      )),
    ),
  }, preferences.sessionMinutes);
};

const pushPullLegsDay = (
  day: WorkoutPlanWeekday,
  dayIndex: number,
  preferences: WorkoutPlanPreferences,
): WorkoutPlanDay => {
  const split = (["push", "pull", "legs"] as const)[dayIndex % 3]!;
  const exercises = pushPullLegsExercises[preferences.equipment][split];
  const focusNote = preferences.focus === "strength"
    ? "Focus on controlled technique; add resistance gradually when all repetitions feel comfortable."
    : "Use a manageable effort and leave a few good repetitions in reserve.";
  return addWarmUpAndCoolDown({
    day,
    label: splitLabels[split],
    exercises: chooseExercisesForDuration(exercises, preferences.sessionMinutes).map((exercise, exerciseIndex) =>
      makeExercise(day, exerciseIndex, adjustSetsForDuration(
        exerciseIndex === 0 ? { ...exercise, notes: `${exercise.notes} ${focusNote}` } : exercise,
        preferences.sessionMinutes,
      )),
    ),
  }, preferences.sessionMinutes);
};

const bodyPartDay = (
  day: WorkoutPlanWeekday,
  dayIndex: number,
  preferences: WorkoutPlanPreferences,
): WorkoutPlanDay => {
  const part = bodyPartOrder[dayIndex % bodyPartOrder.length]!;
  const exercises = bodyPartExercises[part];
  const focusNote = "This is an experienced-gym template; use a controlled technique and reduce the load or stop if you feel pain.";
  return addWarmUpAndCoolDown({
    day,
    label: `${part[0]!.toUpperCase()}${part.slice(1)} focus`,
    exercises: chooseExercisesForDuration(exercises, preferences.sessionMinutes).map((exercise, exerciseIndex) =>
      makeExercise(day, exerciseIndex, adjustSetsForDuration(
        exerciseIndex === 0 ? { ...exercise, notes: `${exercise.notes} ${focusNote}` } : exercise,
        preferences.sessionMinutes,
      )),
    ),
  }, preferences.sessionMinutes);
};

const recoveryDay = (day: WorkoutPlanWeekday, index: number, sessionMinutes: WorkoutPlanPreferences["sessionMinutes"]): WorkoutPlanDay => addWarmUpAndCoolDown({
  day,
  label: "Recovery · Easy cardio or mobility",
  exercises: [makeExercise(day, index, {
    name: "Easy walk, cycle or mobility",
    sets: 1,
    reps: "20-30 minutes",
    notes: "Keep this light and comfortable; take a full rest day if you feel tired.",
  })],
}, sessionMinutes);

const walkingDay = (day: WorkoutPlanWeekday, index: number, preferences: WorkoutPlanPreferences): WorkoutPlanDay => addWarmUpAndCoolDown({
  day,
  exercises: [makeExercise(day, index, {
    name: preferences.focus === "stamina" ? "Steady walk or cycle" : "Brisk walk or easy cycle",
    sets: 1,
    reps: `${preferences.sessionMinutes} minutes`,
    notes: "Keep a conversational pace. Start shorter if needed and build gradually.",
  })],
}, preferences.sessionMinutes);

const trainingDaysByFrequency: Record<WorkoutPlanPreferences["daysPerWeek"], WorkoutPlanWeekday[]> = {
  2: ["Monday", "Thursday"],
  3: ["Monday", "Wednesday", "Friday"],
  4: ["Monday", "Tuesday", "Thursday", "Friday"],
  5: ["Monday", "Tuesday", "Thursday", "Friday", "Saturday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  7: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

export function createBeginnerWorkoutPlan(preferences: WorkoutPlanPreferences): WorkoutPlan {
  const scheduledDays = trainingDaysByFrequency[preferences.daysPerWeek];
  const eligibleSplitStyle = preferences.equipment === "gym" && preferences.daysPerWeek >= 5;
  const trainingStyle: WorkoutPlanTrainingStyle = eligibleSplitStyle
    ? preferences.trainingStyle ?? (preferences.daysPerWeek === 6 ? "push-pull-legs" : "balanced")
    : "balanced";
  let strengthIndex = 0;
  let cardioIndex = 0;
  const days = workoutPlanWeekdays.map((weekday) => {
    const scheduledIndex = scheduledDays.indexOf(weekday);
    if (scheduledIndex < 0) return { day: weekday, exercises: [] };
    if (preferences.daysPerWeek === 7 && trainingStyle !== "balanced" && scheduledIndex === 6) {
      return recoveryDay(weekday, scheduledIndex, preferences.sessionMinutes);
    }
    if (trainingStyle === "push-pull-legs") {
      return pushPullLegsDay(weekday, scheduledIndex, preferences);
    }
    if (trainingStyle === "body-part") {
      return bodyPartDay(weekday, scheduledIndex, preferences);
    }
    const isCardioDay = preferences.daysPerWeek === 3
      ? scheduledIndex === 1
      : preferences.daysPerWeek === 5
        ? scheduledIndex === 1 || scheduledIndex === 3
        : preferences.daysPerWeek === 6
          ? scheduledIndex === 1 || scheduledIndex === 3 || scheduledIndex === 5
          : preferences.daysPerWeek === 7
            ? scheduledIndex === 1 || scheduledIndex === 3 || scheduledIndex === 5 || scheduledIndex === 6
            : false;
    if (isCardioDay) {
      const isSeventhDay = preferences.daysPerWeek === 7 && scheduledIndex === 6;
      const day = walkingDay(weekday, cardioIndex, preferences);
      cardioIndex += 1;
      if (isSeventhDay) {
        day.exercises[0]!.name = "Gentle walk or mobility";
        day.exercises[0]!.notes = "Keep this recovery session easy and comfortable. Take a full rest day instead if you feel tired.";
      }
      return day;
    }
    const day = strengthDay(weekday, strengthIndex, preferences);
    strengthIndex += 1;
    return day;
  });
  return { days, preferences };
}

export function defaultWorkoutFocus(goalType: "lose" | "maintain" | "gain" | null): WorkoutPlanFocus {
  if (goalType === "lose") return "fat-loss";
  if (goalType === "gain") return "strength";
  return "general-fitness";
}
