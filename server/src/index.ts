import dotenv from "dotenv";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import type { Meal, MealAnalysis, MealAnalysisItem, Settings, WeightPlanInput } from "@fuel-log/shared";
import { buildWeightPlan } from "./calculations.js";
import { crossCheckItems, findProduct } from "./nutrition.js";
import { FREE_MEAL_SCANS_PER_DAY, getFreeScanStatus } from "./scanQuota.js";

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
const GEMINI_MODEL = "gemini-2.5-flash";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const allowedGmail = process.env.ALLOWED_GMAIL?.trim().toLowerCase() ?? "";
const googleAuthConfigured = Boolean(googleClientId && /^[^\s@]+@gmail\.com$/.test(allowedGmail));
const authRequired = process.env.NODE_ENV === "production" || googleAuthConfigured;
const googleClient = new OAuth2Client(googleClientId || undefined);

class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type AuthIdentity = { email: string; name: string; picture: string | null };
type AuthenticatedRequest = express.Request & { authIdentity?: AuthIdentity };

class ScanLimitError extends Error {}

const utcDateKey = () => new Date().toISOString().slice(0, 10);

async function scanUsageFor(date: string) {
  const record = await prisma.photoScanUsage.findUnique({ where: { date } });
  const used = record?.scans ?? 0;
  return { ...getFreeScanStatus(used, Boolean(geminiApiKey)), used };
}

async function reservePhotoScan(date: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.photoScanUsage.upsert({ where: { date }, create: { date, scans: 0 }, update: {} });
    const updated = await transaction.photoScanUsage.updateMany({
      where: { date, scans: { lt: FREE_MEAL_SCANS_PER_DAY } },
      data: { scans: { increment: 1 } },
    });
    if (updated.count === 0) throw new ScanLimitError();
  });
}

async function releasePhotoScan(date: string) {
  await prisma.photoScanUsage.updateMany({ where: { date, scans: { gt: 0 } }, data: { scans: { decrement: 1 } } });
}

async function verifyGoogleCredential(credential: string): Promise<AuthIdentity> {
  if (!googleClientId || !allowedGmail) throw new AuthError(503, "Google sign-in is not configured.");
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new AuthError(401, "Your Google sign-in expired. Please sign in again.");
  }
  const email = payload?.email?.toLowerCase();
  if (!payload || !email || payload.email_verified !== true) {
    throw new AuthError(401, "Use a verified Google account to continue.");
  }
  if (!email.endsWith("@gmail.com") || email !== allowedGmail) {
    throw new AuthError(403, "This Gmail account is not allowed to access Fuel log.");
  }
  return { email, name: payload.name ?? email, picture: payload.picture ?? null };
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
  const publicAuthPaths = ["/health", "/auth/config", "/auth/google"];
  if (publicAuthPaths.includes(request.path)) return next();
  if (!authRequired) return next();
  if (!googleAuthConfigured) return response.status(503).json({ error: "Google sign-in is required but not configured." });
  const credential = request.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!credential) return response.status(401).json({ error: "Sign in with the allowed Gmail account to continue." });
  try {
    (request as AuthenticatedRequest).authIdentity = await verifyGoogleCredential(credential);
    next();
  } catch (error) {
    const authError = error instanceof AuthError ? error : new AuthError(401, "Your Google sign-in could not be verified.");
    response.status(authError.status).json({ error: authError.message });
  }
});

app.use("/api", (request, response, next) => {
  const publicAuthPaths = ["/health", "/auth/config", "/auth/google"];
  if (publicAuthPaths.includes(request.path) || process.env.VERCEL !== "1") return next();
  if (!tursoUrl || !tursoToken) return response.status(503).json({ error: "The production database is not configured yet." });
  next();
});

app.get("/api/auth/config", (_request, response) => {
  response.json({
    required: authRequired,
    configured: googleAuthConfigured,
    clientId: googleClientId || null,
  });
});

app.post("/api/auth/google", async (request, response, next) => {
  try {
    const { credential } = z.object({ credential: z.string().min(1).max(8192) }).parse(request.body);
    response.json(await verifyGoogleCredential(credential));
  } catch (error) {
    if (error instanceof AuthError) return response.status(error.status).json({ error: error.message });
    next(error);
  }
});

app.get("/api/auth/me", (request, response) => {
  response.json((request as AuthenticatedRequest).authIdentity);
});

app.get("/api/meal-scans/status", async (_request, response, next) => {
  try {
    response.json(await scanUsageFor(utcDateKey()));
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

app.get("/api/settings", async (_request, response, next) => {
  try {
    const settings = await prisma.settings.upsert({ where: { id: "default" }, create: {}, update: {} });
    response.json(serializeSettings(settings));
  } catch (error) { next(error); }
});

app.patch("/api/settings", async (request, response, next) => {
  try {
    const input = settingsSchema.parse(request.body);
    const settings = await prisma.settings.upsert({ where: { id: "default" }, create: input, update: input });
    response.json(serializeSettings(settings));
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
    const date = dateResponse(request.params.date);
    const day = await prisma.day.upsert({ where: { date }, create: { date }, update: {} });
    response.json(await prisma.day.findUnique({ where: { id: day.id }, include: { foods: { orderBy: { createdAt: "asc" } }, workouts: { orderBy: { createdAt: "asc" } } } }));
  } catch (error) { next(error); }
});

app.get("/api/days", async (request, response, next) => {
  try {
    const from = dateSchema.parse(request.query.from);
    const to = dateSchema.parse(request.query.to);
    if (from > to || to > today()) return response.status(400).json({ error: "Choose a valid date range." });
    const days = await prisma.day.findMany({ where: { date: { gte: from, lte: to } }, include: { foods: true, workouts: true }, orderBy: { date: "asc" } });
    response.json(days);
  } catch (error) { next(error); }
});

app.patch("/api/days/:date", async (request, response, next) => {
  try {
    const date = dateResponse(request.params.date);
    const input = z.object({ weightKg: z.number().min(20).max(500).nullable().optional(), waterGlasses: z.number().int().min(0).max(100).optional() }).strict().parse(request.body);
    const day = await prisma.day.upsert({ where: { date }, create: { date, ...input }, update: input });
    response.json(day);
  } catch (error) { next(error); }
});

app.post("/api/foods", async (request, response, next) => {
  try {
    const input = foodSchema.parse(request.body);
    const date = dateResponse(input.date);
    const { date: _date, photoThumbnail, ...food } = input;
    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    const day = await prisma.day.upsert({ where: { date }, create: { date }, update: {} });
    const entry = await prisma.foodEntry.create({
      data: { ...food, dayId: day.id, photoThumbnail: settings?.keepPhotoThumbnails ? photoThumbnail : null },
    });
    response.status(201).json(entry);
  } catch (error) { next(error); }
});

app.delete("/api/foods/:id", async (request, response, next) => {
  try {
    await prisma.foodEntry.delete({ where: { id: request.params.id } });
    response.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/foods/recent", async (_request, response, next) => {
  try {
    const foods = await prisma.foodEntry.findMany({ distinct: ["name"], orderBy: { createdAt: "desc" }, take: 12 });
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
    const input = workoutSchema.parse(request.body);
    const date = dateResponse(input.date);
    const day = await prisma.day.upsert({ where: { date }, create: { date }, update: {} });
    response.status(201).json(await prisma.workout.create({ data: { ...input, dayId: day.id } }));
  } catch (error) { next(error); }
});

app.delete("/api/workouts/:id", async (request, response, next) => {
  try {
    await prisma.workout.delete({ where: { id: request.params.id } });
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

    const usageDate = utcDateKey();
    try {
      await reservePhotoScan(usageDate);
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
      await releasePhotoScan(usageDate);
      throw error;
    }

    if (!googleResponse.ok) {
      await releasePhotoScan(usageDate);
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