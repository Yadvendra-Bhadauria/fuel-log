import dotenv from "dotenv";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { z } from "zod";
import type { Meal, MealAnalysis, MealAnalysisItem, Settings, WeightPlanInput } from "@fuel-log/shared";
import { createPasswordResetToken, createSessionToken, hashPassword, hashPasswordResetToken, hashSessionToken, isValidPassword, verifyPassword } from "./auth.js";
import { buildWeightPlan } from "./calculations.js";
import { coachingEnquirySchema, coachingEnquiryStatusSchema } from "./coaching.js";
import { sendCoachingEnquiryNotification } from "./coachingEmail.js";
import { getExerciseCatalog } from "./exerciseCatalog.js";
import { crossCheckItems, findProduct } from "./nutrition.js";
import { FREE_MEAL_SCANS_PER_DAY, getFreeScanStatus } from "./scanQuota.js";
import { emptyWorkoutPlan, parseWorkoutPlan, workoutPlanSchema } from "./workoutPlan.js";

dotenv.config({ path: resolve(process.cwd(), "../.env") });
dotenv.config();

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
const sqliteFile = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./dev.db";
const localDatabaseUrl = `file:${resolve(process.cwd(), "prisma", sqliteFile)}`;
const prismaAdapter = new PrismaLibSQL(tursoUrl && tursoToken
  ? { url: tursoUrl, authToken: tursoToken }
  : { url: localDatabaseUrl });
const prisma = new PrismaClient({ adapter: prismaAdapter });
const app = express();
const port = Number(process.env.PORT ?? 3001);
const geminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
const passwordResetEnabled = Boolean(resendApiKey && resendFromEmail);
const coachingAdminEmail = (process.env.COACHING_ADMIN_EMAIL ?? "bhadauria.ravi8@gmail.com").trim().toLowerCase();
const GEMINI_MODEL = "gemini-2.5-flash";
const authRequired = process.env.NODE_ENV === "production";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_DURATION_MS = 30 * 60 * 1000;

type AuthIdentity = { id: string; email: string; name: string; picture: string | null };
type AuthenticatedRequest = express.Request & { authIdentity?: AuthIdentity; sessionTokenHash?: string };
const userIdFor = (request: express.Request) => (request as AuthenticatedRequest).authIdentity?.id ?? "local";
const settingsIdFor = (userId: string) => userId === "local" ? "default" : userId;

class ScanLimitError extends Error {}

const utcDateKey = () => new Date().toISOString().slice(0, 10);

async function scanUsageFor(userId: string, date: string) {
  const record = await prisma.photoScanUsage.findUnique({ where: { userId_date: { userId, date } } });
  const used = record?.scans ?? 0;
  return { ...getFreeScanStatus(used, Boolean(geminiApiKey)), used };
}

async function reservePhotoScan(userId: string, date: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.photoScanUsage.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, scans: 0 }, update: {} });
    const updated = await transaction.photoScanUsage.updateMany({
      where: { userId, date, scans: { lt: FREE_MEAL_SCANS_PER_DAY } },
      data: { scans: { increment: 1 } },
    });
    if (updated.count === 0) throw new ScanLimitError();
  });
}

async function releasePhotoScan(userId: string, date: string) {
  await prisma.photoScanUsage.updateMany({ where: { userId, date, scans: { gt: 0 } }, data: { scans: { decrement: 1 } } });
}

const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const isLocalDevelopmentOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    const octets = url.hostname.split(".").map(Number);
    const privateIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (
      octets[0] === 10 || octets[0] === 192 && octets[1] === 168 ||
      octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
    );
    return (url.protocol === "http:" || url.protocol === "https:") && (
      url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
      url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || privateIpv4
    );
  } catch {
    return false;
  }
};
app.use(cors({ origin: (origin, callback) => {
  const allowed = !origin || origin === clientOrigin || process.env.NODE_ENV !== "production" && isLocalDevelopmentOrigin(origin);
  callback(null, allowed);
} }));
app.use(express.json({ limit: "7mb" }));

app.use("/api", async (request, response, next) => {
  const publicAuthPaths = ["/health", "/auth/config", "/auth/register", "/auth/login", "/auth/password-reset/request", "/auth/password-reset/complete"];
  if (publicAuthPaths.includes(request.path)) return next();
  const credential = request.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!credential) {
    if (!authRequired) return next();
    return response.status(401).json({ error: "Sign in to your Fuel Log account to continue." });
  }
  try {
    const tokenHash = hashSessionToken(credential);
    const session = await prisma.session.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session) return response.status(401).json({ error: "Your session expired. Please sign in again." });
    (request as AuthenticatedRequest).authIdentity = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      picture: null,
    };
    (request as AuthenticatedRequest).sessionTokenHash = tokenHash;
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", (request, response, next) => {
  const publicAuthPaths = ["/health", "/auth/config"];
  if (publicAuthPaths.includes(request.path) || process.env.VERCEL !== "1") return next();
  if (!tursoUrl || !tursoToken) return response.status(503).json({ error: "The production database is not configured yet. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the deployment environment." });
  next();
});

app.get("/api/auth/config", (_request, response) => {
  response.json({ required: authRequired, passwordResetEnabled });
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many account attempts. Please wait a minute and try again." },
});
const coachingEnquiryLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many coaching enquiries. Please wait before trying again." },
});
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128).refine(isValidPassword, {
    message: "Password must be at least 6 characters.",
  }),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});
const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});
const passwordResetSchema = z.object({
  token: z.string().min(1).max(128),
  password: z.string().min(1).max(128).refine(isValidPassword, {
    message: "Password must be at least 6 characters.",
  }),
});
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many reset requests. Please wait before trying again." },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Please wait before trying again." },
});
let workoutPlanTableInitialization: Promise<void> | undefined;
let coachingEnquiryTableInitialization: Promise<void> | undefined;

const ensureWorkoutPlanTable = async () => {
  if (!workoutPlanTableInitialization) {
    workoutPlanTableInitialization = prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WorkoutPlan" ("userId" TEXT NOT NULL PRIMARY KEY, "days" TEXT NOT NULL DEFAULT '[]', "preferences" TEXT NOT NULL DEFAULT '{}', "updatedAt" DATETIME NOT NULL)`
      .then(async () => {
        const columns = await prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("WorkoutPlan")`;
        if (!columns.some((column) => column.name === "preferences")) {
          await prisma.$executeRaw`ALTER TABLE "WorkoutPlan" ADD COLUMN "preferences" TEXT NOT NULL DEFAULT '{}'`;
        }
      })
      .catch((error: unknown) => {
        workoutPlanTableInitialization = undefined;
        throw error;
      });
  }
  await workoutPlanTableInitialization;
};

const ensureCoachingEnquiryTable = async () => {
  if (!coachingEnquiryTableInitialization) {
    coachingEnquiryTableInitialization = prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "CoachingEnquiry" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "goal" TEXT NOT NULL, "availability" TEXT NOT NULL, "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'new', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
      .then(() => undefined)
      .catch((error: unknown) => {
        coachingEnquiryTableInitialization = undefined;
        throw error;
      });
  }
  await coachingEnquiryTableInitialization;
};

const isCoachingAdmin = (request: express.Request) =>
  (request as AuthenticatedRequest).authIdentity?.email.toLowerCase() === coachingAdminEmail;

async function createAuthSession(user: { id: string; email: string; name: string }) {
  const token = createSessionToken();
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });
  return { token, user: { id: user.id, email: user.email, name: user.name, picture: null } };
}

app.post("/api/auth/register", authLimiter, async (request, response, next) => {
  try {
    const { name, email, password } = registerSchema.parse(request.body);
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
    response.status(201).json(await createAuthSession(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return response.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    }
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (request, response, next) => {
  try {
    const { email, password } = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !await verifyPassword(password, user.passwordHash)) {
      return response.status(401).json({ error: "Email or password is incorrect." });
    }
    response.json(await createAuthSession(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/request", passwordResetRequestLimiter, async (request, response, next) => {
  try {
    if (!passwordResetEnabled) return response.status(503).json({ error: "Password reset email is not configured yet." });
    const { email } = passwordResetRequestSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return response.status(202).json({ message: "If an account exists for that email, a reset link will be sent." });

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + PASSWORD_RESET_DURATION_MS) },
    });

    const resetUrl = new URL("/", clientOrigin);
    resetUrl.searchParams.set("resetToken", token);
    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: resendFromEmail,
          to: [user.email],
          subject: "Reset your Fuel log password",
          text: `Use this link to reset your Fuel log password. The link expires in 30 minutes and can only be used once:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
          html: `<p>Use the link below to reset your Fuel log password. It expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
        }),
      });
      if (!emailResponse.ok) {
        console.error("Password reset email delivery failed with status", emailResponse.status);
        await prisma.passwordResetToken.delete({ where: { tokenHash } });
        return response.status(503).json({ error: "Could not send the reset email. Please try again later." });
      }
    } catch (error) {
      console.error("Password reset email delivery failed:", error);
      await prisma.passwordResetToken.delete({ where: { tokenHash } });
      return response.status(503).json({ error: "Could not send the reset email. Please try again later." });
    }

    response.status(202).json({ message: "If an account exists for that email, a reset link will be sent." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/complete", passwordResetLimiter, async (request, response, next) => {
  try {
    const { token, password } = passwordResetSchema.parse(request.body);
    const tokenHash = hashPasswordResetToken(token);
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const reset = await prisma.$transaction(async (transaction) => {
      const resetToken = await transaction.passwordResetToken.findFirst({
        where: { tokenHash, expiresAt: { gt: now } },
      });
      if (!resetToken) return false;

      const consumed = await transaction.passwordResetToken.deleteMany({
        where: { tokenHash, expiresAt: { gt: now } },
      });
      if (consumed.count !== 1) return false;

      await transaction.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } });
      await transaction.session.deleteMany({ where: { userId: resetToken.userId } });
      return true;
    });

    if (!reset) return response.status(400).json({ error: "This password reset link is invalid or expired. Request a new one." });
    response.json({ message: "Your password has been reset. Sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", (request, response) => {
  response.json((request as AuthenticatedRequest).authIdentity);
});

app.post("/api/auth/logout", async (request, response, next) => {
  try {
    const tokenHash = (request as AuthenticatedRequest).sessionTokenHash;
    if (tokenHash) await prisma.session.delete({ where: { tokenHash } });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/meal-scans/status", async (request, response, next) => {
  try {
    response.json(await scanUsageFor(userIdFor(request), utcDateKey()));
  } catch (error) { next(error); }
});

const mealSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
class InputError extends Error {}
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const validDate = (date: string) => dateSchema.safeParse(date).success && date <= today();
const dateResponse = (date: string) => {
  if (!validDate(date)) throw new InputError("Choose a valid date that is not in the future.");
  return date;
};

const settingsSchema = z.object({
  goalType: z.enum(["lose", "maintain", "gain"]).nullable().optional(),
  calorieTarget: z.number().int().min(800).max(10000).nullable().optional(),
  proteinTarget: z.number().min(0).max(1000).nullable().optional(),
  carbsTarget: z.number().min(0).max(1500).nullable().optional(),
  fatTarget: z.number().min(0).max(1000).nullable().optional(),
  currentWeightKg: z.number().min(20).max(500).nullable().optional(),
  targetWeightKg: z.number().min(20).max(500).nullable().optional(),
  weeklyActiveMinutes: z.number().int().min(0).max(2000).optional(),
  includeExerciseCalories: z.boolean().optional(),
  keepPhotoThumbnails: z.boolean().optional(),
  sex: z.enum(["female", "male"]).nullable().optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  heightCm: z.number().min(80).max(250).nullable().optional(),
  activityFactor: z.number().min(1.2).max(2.5).nullable().optional(),
});
const weightPlanSchema = z.object({
  currentWeightKg: z.number().min(20).max(500),
  targetWeightKg: z.number().min(20).max(500),
  sex: z.enum(["female", "male"]),
  age: z.number().int().min(13).max(120),
  heightCm: z.number().min(80).max(250),
  activityFactor: z.number().min(1.2).max(2.5),
  goalType: z.enum(["lose", "maintain", "gain"]),
});
const foodSchema = z.object({
  date: dateSchema,
  meal: mealSchema,
  name: z.string().trim().min(1).max(160),
  grams: z.number().min(0).max(10000).nullable().optional(),
  kcal: z.number().min(0).max(20000),
  proteinG: z.number().min(0).max(1000).nullable().optional(),
  carbsG: z.number().min(0).max(1500).nullable().optional(),
  fatG: z.number().min(0).max(1000).nullable().optional(),
  source: z.enum(["manual", "open_food_facts", "usda", "photo_ai"]).default("manual"),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  photoThumbnail: z.string().max(400000).nullable().optional(),
});
const workoutSchema = z.object({
  date: dateSchema,
  activity: z.string().trim().min(1).max(100),
  minutes: z.number().int().min(1).max(1440),
  calories: z.number().int().min(0).max(20000),
});
const analysisSchema = z.object({
  imageBase64: z.string().min(1).max(7 * 1024 * 1024).refine((value) => {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return false;
    return Buffer.from(value, "base64").toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");
  }),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  note: z.string().max(500).optional().default(""),
  consentToGoogleFreeTier: z.literal(true),
});
const analysisResultSchema = z.object({
  is_food: z.boolean(),
  items: z.array(z.object({
    name: z.string(), estimated_portion: z.string(), grams: z.number().nonnegative(),
    kcal: z.number().nonnegative(), protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(), fat_g: z.number().nonnegative(),
    confidence: z.enum(["low", "medium", "high"]),
  })),
  total_kcal: z.number().nonnegative(),
  notes: z.string(),
});
const analysisResponseJsonSchema = {
  type: "object",
  properties: {
    is_food: { type: "boolean" },
    items: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, estimated_portion: { type: "string" }, grams: { type: "number" },
      kcal: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    }, required: ["name", "estimated_portion", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "confidence"], additionalProperties: false } },
    total_kcal: { type: "number" },
    notes: { type: "string" },
  },
  required: ["is_food", "items", "total_kcal", "notes"],
  additionalProperties: false,
};
const serializeSettings = (record: Awaited<ReturnType<typeof prisma.settings.upsert>>): Settings => ({
  goalType: record.goalType as Settings["goalType"],
  calorieTarget: record.calorieTarget,
  proteinTarget: record.proteinTarget,
  carbsTarget: record.carbsTarget,
  fatTarget: record.fatTarget,
  currentWeightKg: record.currentWeightKg,
  targetWeightKg: record.targetWeightKg,
  weeklyActiveMinutes: record.weeklyActiveMinutes,
  includeExerciseCalories: record.includeExerciseCalories,
  keepPhotoThumbnails: record.keepPhotoThumbnails,
  sex: record.sex as Settings["sex"],
  age: record.age,
  heightCm: record.heightCm,
  activityFactor: record.activityFactor,
});

app.get("/api/health", (_request, response) => response.json({ ok: true }));

app.get("/api/settings", async (request, response, next) => {
  try {
    const settingsId = settingsIdFor(userIdFor(request));
    const settings = await prisma.settings.upsert({ where: { id: settingsId }, create: { id: settingsId }, update: {} });
    response.json(serializeSettings(settings));
  } catch (error) { next(error); }
});

app.patch("/api/settings", async (request, response, next) => {
  try {
    const settingsId = settingsIdFor(userIdFor(request));
    const input = settingsSchema.parse(request.body);
    const settings = await prisma.settings.upsert({ where: { id: settingsId }, create: { id: settingsId, ...input }, update: input });
    response.json(serializeSettings(settings));
  } catch (error) { next(error); }
});

app.get("/api/workout-plan", async (request, response, next) => {
  try {
    await ensureWorkoutPlanTable();
    const record = await prisma.workoutPlan.findUnique({ where: { userId: userIdFor(request) } });
    response.json(record ? parseWorkoutPlan(record.days, record.preferences) : emptyWorkoutPlan());
  } catch (error) { next(error); }
});

app.get("/api/exercises", async (_request, response) => {
  try {
    response.json(await getExerciseCatalog());
  } catch (error) {
    console.error("Exercise catalogue request failed:", error);
    response.status(503).json({ error: "The exercise catalogue is temporarily unavailable. You can still enter exercise names manually." });
  }
});

app.put("/api/workout-plan", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const plan = workoutPlanSchema.parse(request.body);
    await ensureWorkoutPlanTable();
    await prisma.workoutPlan.upsert({
      where: { userId },
      create: { userId, days: JSON.stringify(plan.days), preferences: JSON.stringify(plan.preferences) },
      update: { days: JSON.stringify(plan.days), preferences: JSON.stringify(plan.preferences) },
    });
    response.json(plan);
  } catch (error) { next(error); }
});

app.get("/api/coaching/admin-status", (request, response) => {
  response.json({ isAdmin: isCoachingAdmin(request) });
});

app.post("/api/coaching/enquiries", coachingEnquiryLimiter, async (request, response, next) => {
  try {
    const input = coachingEnquirySchema.parse(request.body);
    await ensureCoachingEnquiryTable();
    const identity = (request as AuthenticatedRequest).authIdentity;
    const enquiry = await prisma.coachingEnquiry.create({
      data: { ...input, userId: identity?.id ?? "local" },
      select: { id: true, status: true, createdAt: true },
    });
    const emailStatus = await sendCoachingEnquiryNotification(input, {
      apiKey: resendApiKey,
      from: resendFromEmail,
      to: coachingAdminEmail,
    });
    response.status(201).json({ ...enquiry, emailStatus });
  } catch (error) { next(error); }
});

app.get("/api/coaching/enquiries", async (request, response, next) => {
  if (!isCoachingAdmin(request)) return response.status(403).json({ error: "This inbox is only available to the Fitbiter coaching administrator." });
  try {
    await ensureCoachingEnquiryTable();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [accountCount, newAccounts30d, enquiries] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.coachingEnquiry.findMany({
        select: { id: true, name: true, email: true, goal: true, availability: true, message: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    response.json({ accountCount, newAccounts30d, enquiries });
  } catch (error) { next(error); }
});

app.patch("/api/coaching/enquiries/:id", async (request, response, next) => {
  if (!isCoachingAdmin(request)) return response.status(403).json({ error: "This inbox is only available to the Fitbiter coaching administrator." });
  try {
    const id = z.string().min(1).max(80).parse(request.params.id);
    const { status } = coachingEnquiryStatusSchema.parse(request.body);
    await ensureCoachingEnquiryTable();
    const updated = await prisma.coachingEnquiry.updateMany({ where: { id }, data: { status } });
    if (updated.count === 0) return response.status(404).json({ error: "That coaching enquiry no longer exists." });
    const enquiry = await prisma.coachingEnquiry.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, goal: true, availability: true, message: true, status: true, createdAt: true },
    });
    response.json(enquiry);
  } catch (error) { next(error); }
});

app.post("/api/estimate-plan", (request, response, next) => {
  try {
    const input = weightPlanSchema.parse(request.body) satisfies WeightPlanInput;
    response.json(buildWeightPlan(input));
  } catch (error) {
    if (error instanceof RangeError) return response.status(400).json({ error: error.message });
    next(error);
  }
});

app.get("/api/days/:date", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const date = dateResponse(request.params.date);
    const day = await prisma.day.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date },
      update: {},
      include: { foods: { orderBy: { createdAt: "asc" } }, workouts: { orderBy: { createdAt: "asc" } } },
    });
    const { userId: _userId, ...publicDay } = day;
    response.json(publicDay);
  } catch (error) { next(error); }
});

app.get("/api/days", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const from = dateSchema.parse(request.query.from);
    const to = dateSchema.parse(request.query.to);
    if (from > to || to > today()) return response.status(400).json({ error: "Choose a valid date range." });
    const days = await prisma.day.findMany({ where: { userId, date: { gte: from, lte: to } }, include: { foods: true, workouts: true }, orderBy: { date: "asc" } });
    response.json(days.map(({ userId: _userId, ...day }) => day));
  } catch (error) { next(error); }
});

app.patch("/api/days/:date", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const date = dateResponse(request.params.date);
    const input = z.object({ weightKg: z.number().min(20).max(500).nullable().optional(), waterGlasses: z.number().int().min(0).max(100).optional() }).strict().parse(request.body);
    const day = await prisma.day.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...input },
      update: input,
    });
    const { userId: _userId, ...publicDay } = day;
    response.json(publicDay);
  } catch (error) { next(error); }
});

app.post("/api/foods", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const input = foodSchema.parse(request.body);
    const date = dateResponse(input.date);
    const { date: _date, photoThumbnail, ...food } = input;
    const settings = await prisma.settings.findUnique({ where: { id: settingsIdFor(userId) } });
    const day = await prisma.day.upsert({ where: { userId_date: { userId, date } }, create: { userId, date }, update: {} });
    const entry = await prisma.foodEntry.create({
      data: { ...food, dayId: day.id, photoThumbnail: settings?.keepPhotoThumbnails ? photoThumbnail : null },
    });
    response.status(201).json(entry);
  } catch (error) { next(error); }
});

app.delete("/api/foods/:id", async (request, response, next) => {
  try {
    const deleted = await prisma.foodEntry.deleteMany({ where: { id: request.params.id, day: { is: { userId: userIdFor(request) } } } });
    if (deleted.count === 0) return response.status(404).json({ error: "That log entry no longer exists." });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/foods/recent", async (request, response, next) => {
  try {
    const foods = await prisma.foodEntry.findMany({ where: { day: { is: { userId: userIdFor(request) } } }, distinct: ["name"], orderBy: { createdAt: "desc" }, take: 12 });
    response.json(foods);
  } catch (error) { next(error); }
});

app.get("/api/foods/search", async (request, response, next) => {
  try {
    const query = z.string().trim().min(1).max(160).parse(request.query.q);
    const product = await findProduct(query);
    response.json(product);
  } catch (error) { next(error); }
});

app.post("/api/workouts", async (request, response, next) => {
  try {
    const userId = userIdFor(request);
    const input = workoutSchema.parse(request.body);
    const date = dateResponse(input.date);
    const day = await prisma.day.upsert({ where: { userId_date: { userId, date } }, create: { userId, date }, update: {} });
    response.status(201).json(await prisma.workout.create({ data: { ...input, dayId: day.id } }));
  } catch (error) { next(error); }
});

app.delete("/api/workouts/:id", async (request, response, next) => {
  try {
    const deleted = await prisma.workout.deleteMany({ where: { id: request.params.id, day: { is: { userId: userIdFor(request) } } } });
    if (deleted.count === 0) return response.status(404).json({ error: "That log entry no longer exists." });
    response.status(204).end();
  } catch (error) { next(error); }
});

const mealAnalysisLimiter = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many scans. Please wait a minute and try again." } });
app.post("/api/analyze-meal", mealAnalysisLimiter, async (request, response, next) => {
  try {
    if (!geminiApiKey) return response.status(503).json({ error: "Free photo scans are not configured. Add GEMINI_API_KEY from Google AI Studio to the server." });
    const input = analysisSchema.parse(request.body);
    const imageSize = Buffer.byteLength(input.imageBase64, "base64");
    if (imageSize > 5 * 1024 * 1024) return response.status(413).json({ error: "The image must be 5 MB or smaller." });
    if (imageSize < 1) return response.status(400).json({ error: "The image could not be read. Please choose another." });

    const userId = userIdFor(request);
    const usageDate = utcDateKey();
    try {
      await reservePhotoScan(userId, usageDate);
    } catch (error) {
      if (error instanceof ScanLimitError) return response.status(429).json({ error: "You’ve used today’s three free photo scans. More will be available after the daily reset." });
      throw error;
    }

    let googleResponse: Response;
    try {
      googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You estimate nutrition from food photos. Identify every distinct food and estimate portions in grams using visual cues such as plate size, cutlery, and hands. Account for hidden oils, sauces, and dressings. Be honest about uncertainty. Return is_food=false when the image is not food, with an empty items array. Nutrition estimates are approximate, not medical advice." }] },
          contents: [{ role: "user", parts: [
            { text: `Estimate this meal. User note: ${input.note || "none"}` },
            { inlineData: { mimeType: input.mediaType, data: input.imageBase64 } },
          ] }],
          generationConfig: {
            responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: analysisResponseJsonSchema } },
            maxOutputTokens: 1800,
            temperature: 0.2,
          },
        }),
      });
    } catch (error) {
      await releasePhotoScan(userId, usageDate);
      throw error;
    }

    if (!googleResponse.ok) {
      await releasePhotoScan(userId, usageDate);
      if (googleResponse.status === 429) return response.status(503).json({ error: "Google’s free scan quota is temporarily full. Try again later; this attempt did not use one of your daily scans." });
      console.error("Gemini request failed with status", googleResponse.status);
      return response.status(503).json({ error: "Google’s free photo scan service is temporarily unavailable. Try again later." });
    }

    const generated = await googleResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const generatedText = generated.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!generatedText) throw new Error("The meal estimate could not be read. Please try another photo.");
    const parsed = analysisResultSchema.parse(JSON.parse(generatedText)) as MealAnalysis;
    const items = parsed.is_food ? await crossCheckItems(parsed.items as MealAnalysisItem[]) : [];
    const meal: MealAnalysis = { ...parsed, items, total_kcal: items.reduce((sum, item) => sum + item.kcal, 0) };
    response.json(meal);
  } catch (error) { next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof InputError) return response.status(400).json({ error: error.message });
  if (error instanceof z.ZodError) return response.status(400).json({ error: "Check the submitted values and try again." });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return response.status(404).json({ error: "That log entry no longer exists." });
  const message = error instanceof Error ? error.message : "Something went wrong.";
  console.error("API error:", error);
  response.status(500).json({ error: message.includes("not found") ? "That log entry could not be found." : "Something went wrong. Please try again." });
});

if (process.env.VERCEL !== "1") app.listen(port, () => console.log(`Fuel log API listening on http://localhost:${port}`));

export { app, prisma, type Meal };
export default app;