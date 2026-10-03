CREATE TABLE IF NOT EXISTS "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "goalType" TEXT,
    "calorieTarget" INTEGER,
    "proteinTarget" INTEGER,
    "carbsTarget" INTEGER,
    "fatTarget" INTEGER,
    "currentWeightKg" REAL,
    "targetWeightKg" REAL,
    "weeklyActiveMinutes" INTEGER NOT NULL DEFAULT 150,
    "includeExerciseCalories" BOOLEAN NOT NULL DEFAULT true,
    "keepPhotoThumbnails" BOOLEAN NOT NULL DEFAULT false,
    "sex" TEXT,
    "age" INTEGER,
    "heightCm" REAL,
    "activityFactor" REAL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Day" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'local',
    "date" TEXT NOT NULL,
    "weightKg" REAL,
    "waterGlasses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "FoodEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "meal" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grams" REAL,
    "kcal" REAL NOT NULL,
    "proteinG" REAL,
    "carbsG" REAL,
    "fatG" REAL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" TEXT,
    "photoThumbnail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodEntry_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "calories" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workout_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PhotoScanUsage" (
    "userId" TEXT NOT NULL DEFAULT 'local',
    "date" TEXT NOT NULL,
    "scans" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "date")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Day_userId_date_key" ON "Day"("userId", "date");
CREATE INDEX IF NOT EXISTS "FoodEntry_dayId_meal_idx" ON "FoodEntry"("dayId", "meal");
CREATE INDEX IF NOT EXISTS "Workout_dayId_idx" ON "Workout"("dayId");
