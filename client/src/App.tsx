import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, BarChart3, Barcode, Check, ChevronDown, ExternalLink,
  CircleHelp, Clock3, Droplets, Dumbbell, Footprints, LogOut, Mail, Moon, Plus, Scale, Settings2, Sun, Trash2,
  Utensils, X,
} from "lucide-react";
import { createBeginnerWorkoutPlan, defaultWorkoutFocus, workoutPlanWeekdays, type DayRecord, type ExerciseCatalogEntry, type FoodEntry, type GoalType, type Meal, type ProductMatch, type Settings, type WeightPlan, type Workout, type WorkoutPlan, type WorkoutPlanEquipment, type WorkoutPlanExercise, type WorkoutPlanFocus, type WorkoutPlanPreferences, type WorkoutPlanTrainingStyle } from "@fuel-log/shared";
import AuthPage, { type AuthUser } from "./AuthPage";

type Tab = "today" | "progress" | "goals" | "workout-plan" | "coaching-admin";
const ProgressView = lazy(() => import("./ProgressView"));
type CoachingEnquiry = {
  id: string;
  name: string;
  email: string;
  goal: "lose-weight" | "build-strength" | "improve-fitness" | "other";
  availability: string;
  message: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
};
type CoachingInboxData = { accountCount: number; newAccounts30d: number; enquiries: CoachingEnquiry[] };
type CoachingAdmin = { email: string; createdAt: string };

const mealOrder: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
const mealColor: Record<Meal, string> = { breakfast: "#f6bd60", lunch: "#71b8a2", dinner: "#ed8064", snack: "#a6a4d5" };
const emptyWorkoutPlan = (): WorkoutPlan => ({
  days: workoutPlanWeekdays.map((day) => ({ day, exercises: [] })),
  preferences: null,
});
const emptySettings: Settings = {
  goalType: null, calorieTarget: null, proteinTarget: null, carbsTarget: null, fatTarget: null,
  currentWeightKg: null, targetWeightKg: null, weeklyActiveMinutes: 150, includeExerciseCalories: true,
  keepPhotoThumbnails: false, sex: null, age: null, heightCm: null, activityFactor: null,
};
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const shiftDate = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const prettyDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const number = (value: number | null | undefined) => Math.round(value ?? 0).toLocaleString();
const fieldNumber = (value: string) => value === "" ? null : Number(value);

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem("fuel-session-token");
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (response.status === 401 && path !== "/api/auth/config") window.dispatchEvent(new Event("fuel-auth-expired"));
    throw new Error(body?.error ?? "Could not reach Fitbiter. Check that the API is running.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function App() {
  const [authConfig, setAuthConfig] = useState<{ required: boolean; passwordResetEnabled: boolean } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(localToday());
  const [day, setDay] = useState<DayRecord | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan>(emptyWorkoutPlan);
  const [workoutPlanSaved, setWorkoutPlanSaved] = useState(false);
  const [workoutPlanBusy, setWorkoutPlanBusy] = useState(false);
  const [isCoachingAdmin, setIsCoachingAdmin] = useState(false);
  const [canManageCoachingAdmins, setCanManageCoachingAdmins] = useState(false);
  const [coachingEnquiries, setCoachingEnquiries] = useState<CoachingEnquiry[]>([]);
  const [coachingAdmins, setCoachingAdmins] = useState<CoachingAdmin[]>([]);
  const [coachingAdminEmailDraft, setCoachingAdminEmailDraft] = useState("");
  const [coachingAdminInviteUrl, setCoachingAdminInviteUrl] = useState("");
  const [coachingAdminBusy, setCoachingAdminBusy] = useState(false);
  const [coachingAccountCount, setCoachingAccountCount] = useState(0);
  const [coachingNewAccounts30d, setCoachingNewAccounts30d] = useState(0);
  const [coachingInboxLoading, setCoachingInboxLoading] = useState(false);
  const [coachingInboxRefresh, setCoachingInboxRefresh] = useState(0);
  const [coachingModal, setCoachingModal] = useState(false);
  const [coachingSubmitting, setCoachingSubmitting] = useState(false);
  const [coachingFormError, setCoachingFormError] = useState("");
  const [coachingName, setCoachingName] = useState("");
  const [coachingEmail, setCoachingEmail] = useState("");
  const [coachingGoal, setCoachingGoal] = useState<CoachingEnquiry["goal"]>("improve-fitness");
  const [coachingAvailability, setCoachingAvailability] = useState("");
  const [coachingMessage, setCoachingMessage] = useState("");
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [progressDays, setProgressDays] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("fuel-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [foodName, setFoodName] = useState("");
  const [foodKcal, setFoodKcal] = useState("");
  const [foodGrams, setFoodGrams] = useState("");
  const [foodProtein, setFoodProtein] = useState("");
  const [foodCarbs, setFoodCarbs] = useState("");
  const [foodFat, setFoodFat] = useState("");
  const [foodSource, setFoodSource] = useState<"manual" | "open_food_facts" | "usda">("manual");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [activity, setActivity] = useState("");
  const [minutes, setMinutes] = useState("");
  const [burned, setBurned] = useState("");
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<ProductMatch | null>(null);
  const [barcodeGrams, setBarcodeGrams] = useState("100");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);
  const adminInviteToken = new URLSearchParams(window.location.search).get("adminInvite");
  const adminInviteAttempt = useRef<string | null>(null);
  const refreshDay = async () => {
    const data = await api<DayRecord>(`/api/days/${date}`);
    setDay(data);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fuel-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!successMessage) return;
    const timeout = window.setTimeout(() => setSuccessMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    setWeightDraft(day?.weightKg == null ? "" : String(day.weightKg));
  }, [date, day?.weightKg]);

  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem("fuel-session-token");
      setAuthUser(null);
    };
    window.addEventListener("fuel-auth-expired", expireSession);
    return () => window.removeEventListener("fuel-auth-expired", expireSession);
  }, []);

  useEffect(() => {
    let active = true;
    const initializeAuth = async () => {
      try {
        const config = await api<{ required: boolean; passwordResetEnabled: boolean }>("/api/auth/config");
        if (!active) return;
        setAuthConfig(config);
        if (config.required && sessionStorage.getItem("fuel-session-token")) {
          try {
            setAuthUser(await api<AuthUser>("/api/auth/me"));
          } catch {
            sessionStorage.removeItem("fuel-session-token");
          }
        }
      } catch {
        if (active) setAuthConfig({ required: true, passwordResetEnabled: false });
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void initializeAuth();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!adminInviteToken || !authUser || authLoading || adminInviteAttempt.current === adminInviteToken) return;
    adminInviteAttempt.current = adminInviteToken;
    let active = true;
    api<{ email: string }>("/api/coaching/admin-invites/accept", {
      method: "POST",
      body: JSON.stringify({ token: adminInviteToken }),
    }).then(({ email }) => {
      if (!active) return;
      const url = new URL(window.location.href);
      url.searchParams.delete("adminInvite");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setIsCoachingAdmin(true);
      setTab("coaching-admin");
      setSuccessMessage(`Administrator access activated for ${email}.`);
    }).catch((reason: unknown) => {
      if (!active) return;
      adminInviteAttempt.current = null;
      setError(reason instanceof Error ? reason.message : "Could not accept this administrator invitation.");
    });
    return () => { active = false; };
  }, [adminInviteToken, authUser, authLoading]);

  useEffect(() => {
    if (authLoading || authConfig === null || (authConfig.required && !authUser)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Settings>("/api/settings"),
      api<DayRecord>(`/api/days/${date}`),
      api<FoodEntry[]>("/api/foods/recent"),
      api<WorkoutPlan>("/api/workout-plan"),
      api<{ isAdmin: boolean; canManageAdmins: boolean }>("/api/coaching/admin-status"),
    ]).then(([nextSettings, nextDay, nextRecent, nextWorkoutPlan, adminStatus]) => {
      if (!active) return;
      setSettings(nextSettings);
      setDay(nextDay);
      setRecent(nextRecent);
      setWorkoutPlan(nextWorkoutPlan);
      setIsCoachingAdmin(adminStatus.isAdmin);
      setCanManageCoachingAdmins(adminStatus.canManageAdmins);
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load your log."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [date, authLoading, authConfig, authUser]);

  useEffect(() => {
    if (tab !== "progress" || authLoading || authConfig === null || (authConfig.required && !authUser)) return;
    const from = shiftDate(localToday(), -364);
    api<DayRecord[]>(`/api/days?from=${from}&to=${localToday()}`).then(setProgressDays).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load progress."));
  }, [tab, authLoading, authConfig, authUser]);

  useEffect(() => {
    if (tab !== "coaching-admin" || !isCoachingAdmin) return;
    let active = true;
    setCoachingInboxLoading(true);
    const requests: [Promise<CoachingInboxData>, Promise<{ admins: CoachingAdmin[] }> | null] = [
      api<CoachingInboxData>("/api/coaching/enquiries"),
      canManageCoachingAdmins ? api<{ admins: CoachingAdmin[] }>("/api/coaching/admins") : null,
    ];
    Promise.all(requests)
      .then(([data, adminData]) => {
        if (!active) return;
        setCoachingEnquiries(data.enquiries);
        setCoachingAccountCount(data.accountCount);
        setCoachingNewAccounts30d(data.newAccounts30d);
        if (adminData) setCoachingAdmins(adminData.admins);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load coaching enquiries."))
      .finally(() => active && setCoachingInboxLoading(false));
    return () => { active = false; };
  }, [tab, isCoachingAdmin, canManageCoachingAdmins, coachingInboxRefresh]);

  const foods = day?.foods ?? [];
  const workouts = day?.workouts ?? [];
  const eaten = foods.reduce((sum, item) => sum + item.kcal, 0);
  const caloriesBurned = workouts.reduce((sum, workout) => sum + workout.calories, 0);
  const target = settings.calorieTarget ?? 0;
  const addedBudget = settings.includeExerciseCalories ? caloriesBurned : 0;
  const kcalLeft = target + addedBudget - eaten;
  const macroTotals = {
    protein: foods.reduce((sum, item) => sum + (item.proteinG ?? 0), 0),
    carbs: foods.reduce((sum, item) => sum + (item.carbsG ?? 0), 0),
    fat: foods.reduce((sum, item) => sum + (item.fatG ?? 0), 0),
  };

  const patchSettings = async (patch: Partial<Settings>) => {
    setError("");
    try {
      const next = await api<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setSettings(next);
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your goals.");
      throw reason;
    }
  };

  const patchDay = async (patch: { weightKg?: number | null; waterGlasses?: number }) => {
    try {
      const updated = await api<DayRecord>(`/api/days/${date}`, { method: "PATCH", body: JSON.stringify(patch) });
      setDay((current) => current ? { ...current, ...updated } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this day."); }
  };

  const saveWeight = () => {
    if (weightDraft === "") {
      if (day?.weightKg != null) void patchDay({ weightKg: null });
      return;
    }
    const weightKg = Number(weightDraft);
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
      setError("Enter a weight between 20 and 500 kg.");
      return;
    }
    if (weightKg !== day?.weightKg) void patchDay({ weightKg });
  };

  const addFood = async (input: {
    name: string; meal: Meal; kcal: number; grams?: number | null; proteinG?: number | null;
    carbsG?: number | null; fatG?: number | null; source?: string; confidence?: string | null; photoThumbnail?: string;
  }, notify = true) => {
    try {
      await api<FoodEntry>("/api/foods", { method: "POST", body: JSON.stringify({ date, ...input }) });
      if (notify) {
        setError("");
        setSuccessMessage("Meal added");
      }
      try {
        const [nextDay, nextRecent] = await Promise.all([
          api<DayRecord>(`/api/days/${date}`),
          api<FoodEntry[]>("/api/foods/recent"),
        ]);
        setDay(nextDay);
        setRecent(nextRecent);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The meal was saved, but your log could not be refreshed.");
      }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this food.");
      return false;
    }
  };

  const removeFood = async (id: string) => {
    try { await api(`/api/foods/${id}`, { method: "DELETE" }); await refreshDay(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove this food."); }
  };

  const addWorkout = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api<Workout>("/api/workouts", { method: "POST", body: JSON.stringify({ date, activity, minutes: Number(minutes), calories: Number(burned) }) });
      setActivity(""); setMinutes(""); setBurned(""); setShowWorkoutForm(false); await refreshDay();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add this workout."); }
  };

  const lookupFood = async () => {
    if (!foodName.trim()) return;
    setLookupBusy(true); setLookupMessage("");
    try {
      const product = await api<ProductMatch | null>(`/api/foods/search?q=${encodeURIComponent(foodName.trim())}`);
      if (!product) { setLookupMessage("No close match found. Add the nutrition manually."); return; }
      const grams = Number(foodGrams || 100);
      const factor = grams / 100;
      setFoodName(product.name);
      setFoodSource(product.source);
      setFoodKcal(String(Math.round(product.kcalPer100g * factor)));
      setFoodProtein(String(Math.round(product.proteinPer100g * factor * 10) / 10));
      setFoodCarbs(String(Math.round(product.carbsPer100g * factor * 10) / 10));
      setFoodFat(String(Math.round(product.fatPer100g * factor * 10) / 10));
      setFoodGrams(String(grams));
      setLookupMessage(`Nutrition from ${product.source === "usda" ? "USDA" : "Open Food Facts"}, scaled to ${grams} g.`);
    } catch (reason) { setLookupMessage(reason instanceof Error ? reason.message : "Nutrition lookup failed."); }
    finally { setLookupBusy(false); }
  };

  const submitFoodForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const added = await addFood({
      name: foodName.trim(), meal, kcal: Number(foodKcal), grams: fieldNumber(foodGrams),
      proteinG: fieldNumber(foodProtein), carbsG: fieldNumber(foodCarbs), fatG: fieldNumber(foodFat),
      source: foodSource,
    });
    if (!added) return;
    setFoodName(""); setFoodKcal(""); setFoodGrams(""); setFoodProtein(""); setFoodCarbs(""); setFoodFat(""); setFoodSource("manual"); setLookupMessage(""); setShowFoodForm(false);
  };

  const updatePlanExercise = (dayIndex: number, exerciseId: string, patch: Partial<WorkoutPlanExercise>) => {
    setWorkoutPlan((current) => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex
        ? { ...day, exercises: day.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise) }
        : day),
    }));
    setWorkoutPlanSaved(false);
  };

  const addPlanExercise = (dayIndex: number) => {
    setWorkoutPlan((current) => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex
        ? { ...day, exercises: [...day.exercises, { id: crypto.randomUUID(), name: "", sets: 3, reps: "8-12", notes: "" }] }
        : day),
    }));
    setWorkoutPlanSaved(false);
  };

  const removePlanExercise = (dayIndex: number, exerciseId: string) => {
    setWorkoutPlan((current) => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex
        ? { ...day, exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId) }
        : day),
    }));
    setWorkoutPlanSaved(false);
  };

  const saveWorkoutPlan = async () => {
    setWorkoutPlanBusy(true);
    setError("");
    try {
      const savedPlan = await api<WorkoutPlan>("/api/workout-plan", { method: "PUT", body: JSON.stringify(workoutPlan) });
      setWorkoutPlan(savedPlan);
      setWorkoutPlanSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your workout plan.");
    } finally {
      setWorkoutPlanBusy(false);
    }
  };

  const submitCoachingEnquiry = async (event: React.FormEvent) => {
    event.preventDefault();
    setCoachingSubmitting(true);
    setCoachingFormError("");
    try {
      const result = await api<{ emailStatus: "sent" | "not-configured" | "failed" }>("/api/coaching/enquiries", {
        method: "POST",
        body: JSON.stringify({
          name: coachingName,
          email: coachingEmail,
          goal: coachingGoal,
          availability: coachingAvailability,
          message: coachingMessage,
        }),
      });
      setCoachingModal(false);
      setCoachingName("");
      setCoachingEmail("");
      setCoachingGoal("improve-fitness");
      setCoachingAvailability("");
      setCoachingMessage("");
      setSuccessMessage(result.emailStatus === "sent"
        ? "Your enquiry was saved and emailed to the coaching team."
        : result.emailStatus === "not-configured"
          ? "Your enquiry was saved, but email delivery is not configured. It is available in the Fitbiter Coach inbox."
          : "Your enquiry was saved, but its notification email could not be delivered. It is available in the Fitbiter Coach inbox.");
    } catch (reason) {
      setCoachingFormError(reason instanceof Error ? reason.message : "Could not send your enquiry.");
    } finally {
      setCoachingSubmitting(false);
    }
  };

  const updateCoachingEnquiry = async (id: string, status: CoachingEnquiry["status"]) => {
    try {
      const updated = await api<CoachingEnquiry>(`/api/coaching/enquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setCoachingEnquiries((current) => current.map((enquiry) => enquiry.id === id ? updated : enquiry));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this coaching enquiry.");
    }
  };

  const addCoachingAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCoachingAdminBusy(true);
    try {
      const invite = await api<{ email: string; token: string; expiresAt: string }>("/api/coaching/admins", {
        method: "POST",
        body: JSON.stringify({ email: coachingAdminEmailDraft }),
      });
      setCoachingAdminInviteUrl(`${window.location.origin}/?adminInvite=${encodeURIComponent(invite.token)}`);
      setCoachingAdminEmailDraft("");
      setSuccessMessage(`An admin invitation for ${invite.email} is ready to share. It expires in 7 days.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this admin.");
    } finally {
      setCoachingAdminBusy(false);
    }
  };

  const copyCoachingAdminInvite = async () => {
    try {
      await navigator.clipboard.writeText(coachingAdminInviteUrl);
      setSuccessMessage("Admin invitation link copied. Share it privately with the intended person.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not copy the invitation link. Select and copy it manually.");
    }
  };

  const removeCoachingAdmin = async (email: string) => {
    if (!window.confirm(`Remove trainer admin access for ${email}?`)) return;
    setCoachingAdminBusy(true);
    try {
      await api<void>(`/api/coaching/admins/${encodeURIComponent(email)}`, { method: "DELETE" });
      setCoachingAdmins((current) => current.filter((admin) => admin.email !== email));
      setSuccessMessage(`${email} no longer has trainer admin access.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this admin.");
    } finally {
      setCoachingAdminBusy(false);
    }
  };

  const generateWorkoutPlan = (preferences: WorkoutPlanPreferences) => {
    if (workoutPlan.days.some((planDay) => planDay.exercises.length > 0) &&
      !window.confirm("Create a new plan? This will replace the current plan draft. Save your existing plan first if you want to keep it.")) return;
    setWorkoutPlan(createBeginnerWorkoutPlan(preferences));
    setWorkoutPlanSaved(false);
  };

  const onBarcodeDetected = async (code: string) => {
    setBarcodeStatus(`Looking up ${code}…`);
    try {
      const match = await api<ProductMatch | null>(`/api/foods/search?q=${encodeURIComponent(code)}`);
      if (!match) { setBarcodeStatus("No product found. Try searching by its name in Add food."); return; }
      setBarcodeProduct({ ...match, barcode: code }); setBarcodeGrams("100"); setBarcodeStatus("");
    } catch (reason) { setBarcodeStatus(reason instanceof Error ? reason.message : "Product lookup failed."); }
  };

  const nav = [
    { id: "today" as const, label: "Today", icon: Utensils },
    { id: "progress" as const, label: "Progress", icon: BarChart3 },
    { id: "workout-plan" as const, label: "Workout plan", icon: Dumbbell },
    { id: "goals" as const, label: "Goals", icon: Settings2 },
    ...(isCoachingAdmin ? [{ id: "coaching-admin" as const, label: "Coach inbox", icon: Mail }] : []),
  ];

  const signOut = async () => {
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out cleanly.");
      return;
    }
    sessionStorage.removeItem("fuel-session-token");
    setAuthUser(null);
    setDay(null);
  };

  if (authLoading || authConfig === null) return <div className="auth-loading"><span className="loader" />Checking sign-in</div>;
  if (new URLSearchParams(window.location.search).has("resetToken")) {
    return <AuthPage onSignIn={setAuthUser} passwordResetEnabled={authConfig.passwordResetEnabled} />;
  }
  if (authConfig.required && !authUser) return <AuthPage onSignIn={setAuthUser} passwordResetEnabled={authConfig.passwordResetEnabled} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#today" onClick={() => setTab("today")} aria-label="Fitbiter home">
          <span className="brand-mark">F<span>.</span></span><span>Fit<span className="brand-light">biter</span></span>
        </a>
        <div className="side-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "nav-item active" : "nav-item"} onClick={() => setTab(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === "today" && <span className="nav-date">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit" })}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-icon"><CircleHelp size={17} /></span><p>Small steps add up.</p><span>Keep showing up.</span></div>
          <button className="theme-switch" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
          <div className="profile-row"><span className="avatar">F</span><span><strong>{authUser?.name ?? "Your log"}</strong><small>{authUser?.email ?? "Personal space"}</small></span>{authUser ? <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button> : <ChevronDown size={16} />}</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">F<span>.</span></span><span>Fit<span className="brand-light">biter</span></span></div>
          <div className="topbar-date">{prettyDate(date)}</div>
          {authUser && <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button>}
          <button className="icon-button top-theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle color theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        </header>

        {error && <div className="alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
        {successMessage && <div className="success-toast" role="status"><Check size={16} /><span>{successMessage}</span></div>}
        {loading ? <div className="loading-state"><span className="loader" />Loading your log</div> : <>
          {tab === "today" && <>
            <section className="coaching-promo">
              <img src="/fitbiter-coach.png" alt="Fitness coach standing in a gym with a kettlebell" />
              <div className="coaching-promo-copy">
                <div className="eyebrow">A COACH IN YOUR CORNER</div>
                <h2>One-to-one coaching, built around you.</h2>
                <p>Start with your personal trainer: get your first 3 days of coaching free, then £50 for 3 months of 1-to-1 coaching.</p>
                <small>No payment is taken in Fitbiter. Send a private message to the trainer to ask about the offer.</small>
              </div>
              <button className="primary-button coaching-cta" onClick={() => {
                setCoachingName(authUser?.name ?? "");
                setCoachingEmail(authUser?.email ?? "");
                setCoachingModal(true);
                setCoachingFormError("");
              }}><Mail size={16} /> Message your trainer</button>
            </section>
            <section className="day-heading">
              <div><div className="eyebrow">DAILY LOG <span className="eyebrow-dot" /></div><h1>{date === localToday() ? "Today, in balance." : prettyDate(date)}</h1></div>
              <div className="date-stepper" aria-label="Choose a date"><button className="icon-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ArrowLeft size={17} /></button><input aria-label="Log date" type="date" max={localToday()} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /><button className="icon-button" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= localToday()} aria-label="Next day"><ArrowRight size={17} /></button></div>
            </section>

            {!settings.goalType && <button className="onboarding" onClick={() => setTab("goals")}><span className="onboarding-mark"><ArrowRight size={19} /></span><span><strong>Set your starting point</strong><small>Add a goal to personalize your daily calorie budget.</small></span><ArrowRight className="onboarding-arrow" size={17} /></button>}

            <section className="calorie-panel" aria-labelledby="calorie-title">
              <div className="calorie-topline"><span id="calorie-title">CALORIES LEFT</span><span className="budget-caption">DAILY BUDGET <strong>{target ? number(target + addedBudget) : "—"}</strong></span></div>
              <div className="calorie-number-row"><div className={kcalLeft < 0 && target ? "calorie-value over" : "calorie-value"}>{target ? number(kcalLeft) : "—"}</div><span className="kcal-unit">kcal</span><span className="calorie-note">{!target ? "set a goal" : kcalLeft < 0 ? "over budget" : "to go"}</span></div>
              <CalorieGauge foods={foods} target={target} exercise={addedBudget} eaten={eaten} />
              <div className="gauge-legend"><span><i className="legend-square" style={{ background: mealColor.breakfast }} />Breakfast</span><span><i className="legend-square" style={{ background: mealColor.lunch }} />Lunch</span><span><i className="legend-square" style={{ background: mealColor.dinner }} />Dinner</span><span><i className="legend-square" style={{ background: mealColor.snack }} />Snack</span><span><i className="legend-stripe" />Exercise</span></div>
              <div className="daily-totals"><div><span>EATEN</span><strong>{number(eaten)} <small>kcal</small></strong></div><div><span>BURNED</span><strong>{number(caloriesBurned)} <small>kcal</small></strong></div><div><span>TARGET</span><strong>{target ? number(target) : "—"} <small>kcal</small></strong></div></div>
            </section>

            <section className="macro-strip" aria-label="Macronutrient progress">
              <MacroProgress label="Protein" amount={macroTotals.protein} goal={settings.proteinTarget} color="#e88a68" />
              <MacroProgress label="Carbs" amount={macroTotals.carbs} goal={settings.carbsTarget} color="#d4ac4d" />
              <MacroProgress label="Fat" amount={macroTotals.fat} goal={settings.fatTarget} color="#64a994" />
            </section>

            <section className="quick-stats">
              <div className="quick-stat"><div className="quick-stat-icon weight-icon"><Scale size={17} /></div><div><span>WEIGHT</span><strong>{day?.weightKg ? `${day.weightKg} kg` : "Add weight"}</strong></div><input aria-label="Weight in kilograms" type="number" min="20" max="500" step="0.1" placeholder="kg" value={weightDraft} onChange={(event) => setWeightDraft(event.target.value)} onBlur={saveWeight} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
              <div className="quick-stat water-stat"><div className="quick-stat-icon water-icon"><Droplets size={17} /></div><div><span>WATER</span><strong>{day?.waterGlasses ?? 0} <small>/ 8 glasses</small></strong></div><div className="water-actions"><button className="water-step" disabled={!day?.waterGlasses} onClick={() => patchDay({ waterGlasses: Math.max(0, (day?.waterGlasses ?? 0) - 1) })} aria-label="Remove a glass">−</button><button className="water-step" onClick={() => patchDay({ waterGlasses: Math.min(100, (day?.waterGlasses ?? 0) + 1) })} aria-label="Add a glass">+</button></div></div>
            </section>

            <section className="log-section">
              <div className="section-heading"><div><div className="eyebrow">YOUR DAY</div><h2>Food & movement</h2></div><button className="text-action" onClick={() => setShowWorkoutForm((value) => !value)}><Activity size={16} /> Log exercise</button></div>
              {showWorkoutForm && <form className="inline-form workout-form" onSubmit={addWorkout}><label>Activity<input required value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="e.g. Brisk walk" /></label><label>Minutes<input required min="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><label>Calories<input required min="0" type="number" value={burned} onChange={(event) => setBurned(event.target.value)} /></label><button className="primary-button small-button" type="submit"><Plus size={15} /> Add</button></form>}
              {workouts.length > 0 && <div className="workout-list">{workouts.map((workout) => <div className="workout-row" key={workout.id}><span className="workout-icon"><Footprints size={16} /></span><strong>{workout.activity}</strong><span>{workout.minutes} min</span><b>−{number(workout.calories)} kcal</b></div>)}</div>}
              <FoodLog foods={foods} onRemove={removeFood} />

              <div className="add-food-area">
                <div className="add-food-heading"><div><h3>Add food</h3><p>Keep a note of what fueled you.</p></div><button className="primary-button" onClick={() => setShowFoodForm((value) => !value)}><Plus size={17} /> Add food</button></div>
                {showFoodForm && <form className="food-form" onSubmit={submitFoodForm}>
                  <div className="food-form-top"><label className="wide-field">Food name<input required maxLength={160} value={foodName} onChange={(event) => { setFoodName(event.target.value); setFoodSource("manual"); }} placeholder="e.g. Greek yogurt" /></label><button className="lookup-button" type="button" disabled={lookupBusy || !foodName.trim()} onClick={lookupFood}>{lookupBusy ? "Searching…" : "Find nutrition"}</button></div>
                  <div className="food-form-grid"><label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as Meal)}>{mealOrder.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label>Calories<input required type="number" min="0" step="1" value={foodKcal} onChange={(event) => setFoodKcal(event.target.value)} placeholder="kcal" /></label><label>Amount<input type="number" min="0" step="1" value={foodGrams} onChange={(event) => setFoodGrams(event.target.value)} placeholder="g" /></label><label>Protein<input type="number" min="0" step="0.1" value={foodProtein} onChange={(event) => setFoodProtein(event.target.value)} placeholder="g" /></label><label>Carbs<input type="number" min="0" step="0.1" value={foodCarbs} onChange={(event) => setFoodCarbs(event.target.value)} placeholder="g" /></label><label>Fat<input type="number" min="0" step="0.1" value={foodFat} onChange={(event) => setFoodFat(event.target.value)} placeholder="g" /></label></div>
                  {lookupMessage && <p className="lookup-message" role="status">{lookupMessage}</p>}
                  <div className="form-actions"><button className="plain-button" type="button" onClick={() => setShowFoodForm(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={16} /> Save food</button></div>
                </form>}

                {recent.length > 0 && <div className="recent-foods"><span>ADD AGAIN</span>{recent.map((item) => <button key={item.id} className="recent-chip" onClick={() => addFood({ name: item.name, meal, kcal: item.kcal, grams: item.grams, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG, source: item.source })}><Plus size={13} /><span>{item.name}</span><small>{number(item.kcal)} kcal</small></button>)}</div>}

                <button className="scan-button secondary-scan barcode-scan-action" onClick={() => { setBarcodeModal(true); setBarcodeProduct(null); setBarcodeStatus(""); }}><Barcode size={17} /> Scan barcode</button>
              </div>
            </section>
          </>}

          {tab === "progress" && <Suspense fallback={<div className="loading-state">Loading progress</div>}><ProgressView days={progressDays} settings={settings} /></Suspense>}
          {tab === "workout-plan" && <WorkoutPlanView plan={workoutPlan} defaultFocus={defaultWorkoutFocus(settings.goalType)} onGenerate={generateWorkoutPlan} onAdd={addPlanExercise} onChange={updatePlanExercise} onRemove={removePlanExercise} onSave={saveWorkoutPlan} saved={workoutPlanSaved} saving={workoutPlanBusy} />}
          {tab === "goals" && <GoalsView settings={settings} currentWeightKg={day?.weightKg ?? null} onSave={patchSettings} saved={goalSaved} setSaved={setGoalSaved} />}
          {tab === "coaching-admin" && isCoachingAdmin && <CoachingInbox
            enquiries={coachingEnquiries}
            accountCount={coachingAccountCount}
            newAccounts30d={coachingNewAccounts30d}
            admins={coachingAdmins}
            canManageAdmins={canManageCoachingAdmins}
            adminEmailDraft={coachingAdminEmailDraft}
            setAdminEmailDraft={setCoachingAdminEmailDraft}
            adminInviteUrl={coachingAdminInviteUrl}
            adminBusy={coachingAdminBusy}
            onAddAdmin={addCoachingAdmin}
            onCopyInvite={copyCoachingAdminInvite}
            onRemoveAdmin={removeCoachingAdmin}
            loading={coachingInboxLoading}
            onRefresh={() => setCoachingInboxRefresh((value) => value + 1)}
            onStatusChange={updateCoachingEnquiry}
          />}
        </>}
      </main>

      <nav className="mobile-nav" aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>

      {barcodeModal && <BarcodeDialog product={barcodeProduct} grams={barcodeGrams} setGrams={setBarcodeGrams} status={barcodeStatus} onDetected={onBarcodeDetected} onClose={() => { setBarcodeModal(false); setBarcodeProduct(null); }} onAdd={async () => { if (!barcodeProduct) return; const factor = Number(barcodeGrams) / 100; const added = await addFood({ name: barcodeProduct.name, meal, grams: Number(barcodeGrams), kcal: Math.round(barcodeProduct.kcalPer100g * factor), proteinG: Math.round(barcodeProduct.proteinPer100g * factor * 10) / 10, carbsG: Math.round(barcodeProduct.carbsPer100g * factor * 10) / 10, fatG: Math.round(barcodeProduct.fatPer100g * factor * 10) / 10, source: barcodeProduct.source }); if (added) setBarcodeModal(false); }} />}
      {coachingModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCoachingModal(false)}><section className="coaching-modal" role="dialog" aria-modal="true" aria-labelledby="coaching-title"><div className="modal-heading"><div><div className="eyebrow">YOUR FIRST STEP</div><h2 id="coaching-title">Message your trainer</h2></div><button className="icon-button" type="button" onClick={() => setCoachingModal(false)} aria-label="Close coaching enquiry"><X size={19} /></button></div><form className="coaching-form" onSubmit={submitCoachingEnquiry}><p>Ask the trainer about your goals, availability, or the 3-day free coaching trial. They can reply to the email address you provide.</p><label>Your name<input required maxLength={80} value={coachingName} onChange={(event) => setCoachingName(event.target.value)} /></label><label>Email address<input required type="email" maxLength={254} value={coachingEmail} onChange={(event) => setCoachingEmail(event.target.value)} /></label><label>Main goal<select value={coachingGoal} onChange={(event) => setCoachingGoal(event.target.value as CoachingEnquiry["goal"])}><option value="lose-weight">Lose weight</option><option value="build-strength">Build strength</option><option value="improve-fitness">Improve fitness</option><option value="other">Other</option></select></label><label>When are you usually available?<input required maxLength={120} value={coachingAvailability} onChange={(event) => setCoachingAvailability(event.target.value)} placeholder="e.g. weekday evenings" /></label><label>Your message<textarea required maxLength={1000} rows={4} value={coachingMessage} onChange={(event) => setCoachingMessage(event.target.value)} placeholder="Write your question or enquiry to the trainer" /></label>{coachingFormError && <p className="form-error" role="alert">{coachingFormError}</p>}<div className="coaching-form-actions"><button className="plain-button" type="button" onClick={() => setCoachingModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={coachingSubmitting}>{coachingSubmitting ? <span className="button-spinner" /> : <Mail size={15} />}{coachingSubmitting ? "Sending…" : "Send message"}</button></div><small className="coaching-privacy">Your message is saved securely to the Fitbiter Coach inbox. Email notifications require RESEND_API_KEY and RESEND_FROM_EMAIL. No payment is taken here.</small></form></section></div>}
    </div>
  );
}

function CalorieGauge({ foods, target, exercise, eaten }: { foods: FoodEntry[]; target: number; exercise: number; eaten: number }) {
  const budget = target + exercise;
  const scale = Math.max(budget, eaten, 1);
  let consumedWidth = 0;
  const widths = mealOrder.map((meal) => {
    const amount = foods.filter((food) => food.meal === meal).reduce((sum, food) => sum + food.kcal, 0);
    const width = Math.max(0, amount / scale * 100);
    consumedWidth += width;
    return { meal, width };
  });
  const targetPosition = budget > 0 ? target / budget * 100 : 100;
  const exerciseWidth = budget > 0 ? exercise / budget * 100 : 0;
  return <div className="gauge-wrap"><div className="gauge" role="img" aria-label={`${number(eaten)} calories eaten of ${number(budget)} calorie budget`}>
    {widths.map(({ meal, width }) => width > 0 && <span key={meal} className="gauge-segment" style={{ width: `${Math.min(width, 100)}%`, backgroundColor: mealColor[meal] }} />)}
    {exerciseWidth > 0 && <span className="gauge-exercise" style={{ left: `${targetPosition}%`, width: `${exerciseWidth}%` }} />}
    {target > 0 && <span className="gauge-marker" style={{ left: `${Math.min(targetPosition, 99.5)}%` }} />}
  </div><div className="gauge-labels"><span>0</span>{target > 0 && <span className="target-label" style={{ left: `${targetPosition}%`, transform: `translateX(${targetPosition > 90 ? "-100%" : "-50%"})` }}>{number(target)} target</span>}<span>{budget ? `${number(budget)} kcal` : "—"}</span></div></div>;
}

function MacroProgress({ label, amount, goal, color }: { label: string; amount: number; goal: number | null; color: string }) {
  return <div className="macro-item"><div className="macro-label"><span>{label}</span><strong>{number(amount)}<small>{goal ? ` / ${number(goal)} g` : " g"}</small></strong></div><div className="macro-track"><span style={{ width: `${goal ? Math.min(100, amount / goal * 100) : 0}%`, background: color }} /></div></div>;
}

function FoodLog({ foods, onRemove }: { foods: FoodEntry[]; onRemove: (id: string) => void }) {
  if (!foods.length) return <div className="empty-log"><span className="empty-log-icon"><Utensils size={20} /></span><strong>No food logged yet</strong><span>Your meals will show up here.</span></div>;
  return <div className="meal-groups">{mealOrder.map((meal) => {
    const entries = foods.filter((food) => food.meal === meal);
    if (!entries.length) return null;
    return <div className="meal-group" key={meal}><div className="meal-group-heading"><span className="meal-dot" style={{ background: mealColor[meal] }} /><h3>{meal[0].toUpperCase() + meal.slice(1)}</h3><span className="meal-kcal">{number(entries.reduce((sum, food) => sum + food.kcal, 0))} kcal</span></div>{entries.map((food) => <div className="food-row" key={food.id}><span className="food-row-stem" style={{ background: mealColor[meal] }} /><div className="food-name"><strong>{food.name}</strong><span>{[food.grams ? `${number(food.grams)} g` : "", food.proteinG != null ? `${number(food.proteinG)}g protein` : ""].filter(Boolean).join(" · ") || "Food entry"}</span></div><strong className="food-kcal">{number(food.kcal)} <small>kcal</small></strong><button className="icon-button delete-button" onClick={() => onRemove(food.id)} aria-label={`Delete ${food.name}`}><Trash2 size={15} /></button></div>)}</div>;
  })}</div>;
}

function CoachingInbox({ enquiries, accountCount, newAccounts30d, admins, canManageAdmins, adminEmailDraft, setAdminEmailDraft, adminInviteUrl, adminBusy, onAddAdmin, onCopyInvite, onRemoveAdmin, loading, onRefresh, onStatusChange }: {
  enquiries: CoachingEnquiry[];
  accountCount: number;
  newAccounts30d: number;
  admins: CoachingAdmin[];
  canManageAdmins: boolean;
  adminEmailDraft: string;
  setAdminEmailDraft: (value: string) => void;
  adminInviteUrl: string;
  adminBusy: boolean;
  onAddAdmin: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopyInvite: () => void;
  onRemoveAdmin: (email: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onStatusChange: (id: string, status: CoachingEnquiry["status"]) => void;
}) {
  const [filter, setFilter] = useState<"all" | CoachingEnquiry["status"]>("all");
  const counts = {
    all: enquiries.length,
    new: enquiries.filter((enquiry) => enquiry.status === "new").length,
    contacted: enquiries.filter((enquiry) => enquiry.status === "contacted").length,
    closed: enquiries.filter((enquiry) => enquiry.status === "closed").length,
  };
  const visibleEnquiries = filter === "all" ? enquiries : enquiries.filter((enquiry) => enquiry.status === filter);
  return <div className="page-view coaching-inbox">
    <div className="eyebrow">FITBITER COACHING</div>
    <div className="page-title-row"><div><h1>Trainer inbox</h1><p>Review user messages and manage coaching enquiries.</p></div><button className="lookup-button" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh inbox"}</button></div>
    <section className="coaching-admin-stats" aria-label="App account and enquiry totals">
      <article><span>REGISTERED ACCOUNTS</span><strong>{number(accountCount)}</strong></article>
      <article><span>JOINED IN LAST 30 DAYS</span><strong>{number(newAccounts30d)}</strong></article>
      <article><span>TOTAL ENQUIRIES</span><strong>{number(counts.all)}</strong></article>
      <article><span>NEED A REPLY</span><strong>{number(counts.new)}</strong></article>
    </section>
    {canManageAdmins && <section className="admin-management">
      <div><h2>Administrator access</h2><p>Only you can manage this list. Invitees must sign in with the invited email and accept the one-time link.</p></div>
      <form className="admin-management-form" onSubmit={onAddAdmin}>
        <label htmlFor="new-admin-email">Invite admin by email</label>
        <div><input id="new-admin-email" required type="email" maxLength={254} value={adminEmailDraft} onChange={(event) => setAdminEmailDraft(event.target.value)} placeholder="name@example.com" /><button className="primary-button" type="submit" disabled={adminBusy}>{adminBusy ? "Creating…" : "Create invite"}</button></div>
      </form>
      {adminInviteUrl && <div className="admin-invite-link"><label htmlFor="admin-invite-link">One-time invite link · expires in 7 days</label><div><input id="admin-invite-link" readOnly value={adminInviteUrl} /><button className="lookup-button" type="button" onClick={onCopyInvite}>Copy link</button></div><small>Share privately with the intended admin. Access is granted only after they sign in using the invited email and open the link.</small></div>}
      <ul className="admin-access-list">{admins.map((admin) => <li key={admin.email}><span>{admin.email}</span><button className="plain-button" type="button" disabled={adminBusy} onClick={() => onRemoveAdmin(admin.email)}><Trash2 size={14} /> Remove</button></li>)}</ul>
      {!admins.length && <p className="admin-access-empty">No additional admins have accepted an invitation yet.</p>}
    </section>}
    <div className="coaching-inbox-filters" aria-label="Filter enquiries">
      {(["all", "new", "contacted", "closed"] as const).map((status) => <button key={status} className={filter === status ? "active" : ""} type="button" onClick={() => setFilter(status)}>{status === "all" ? "All" : status[0]!.toUpperCase() + status.slice(1)} <span>{counts[status]}</span></button>)}
    </div>
    {loading && !enquiries.length
      ? <div className="loading-state"><span className="loader" />Loading trainer inbox</div>
      : !visibleEnquiries.length
        ? <div className="empty-log"><span className="empty-log-icon"><Mail size={20} /></span><strong>{filter === "all" ? "No enquiries yet" : `No ${filter} enquiries`}</strong><span>New coaching messages will appear here.</span></div>
        : <div className="coaching-enquiry-list">{visibleEnquiries.map((enquiry) => <article className="coaching-enquiry" key={enquiry.id}>
        <div className="coaching-enquiry-heading"><div><h2>{enquiry.name}</h2><a href={`mailto:${enquiry.email}`}>{enquiry.email}</a></div><span className={`enquiry-status ${enquiry.status}`}>{enquiry.status}</span></div>
        <div className="coaching-enquiry-meta"><span>{enquiry.goal.replaceAll("-", " ")}</span><span><Clock3 size={14} /> {enquiry.availability}</span><span>{new Date(enquiry.createdAt).toLocaleString()}</span></div>
        {enquiry.message && <p className="coaching-enquiry-message">{enquiry.message}</p>}
        <label className="enquiry-status-select">Status<select value={enquiry.status} onChange={(event) => onStatusChange(enquiry.id, event.target.value as CoachingEnquiry["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label>
      </article>)}</div>}
  </div>;
}

function WorkoutPlanView({ plan, defaultFocus, onGenerate, onAdd, onChange, onRemove, onSave, saved, saving }: {
  plan: WorkoutPlan;
  defaultFocus: WorkoutPlanFocus;
  onGenerate: (preferences: WorkoutPlanPreferences) => void;
  onAdd: (dayIndex: number) => void;
  onChange: (dayIndex: number, exerciseId: string, patch: Partial<WorkoutPlanExercise>) => void;
  onRemove: (dayIndex: number, exerciseId: string) => void;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  const [exerciseCatalog, setExerciseCatalog] = useState<ExerciseCatalogEntry[]>([]);
  const [exerciseCatalogLoading, setExerciseCatalogLoading] = useState(true);
  const [exerciseCatalogError, setExerciseCatalogError] = useState("");
  const [preferences, setPreferences] = useState<WorkoutPlanPreferences>(() => plan.preferences ?? {
    focus: defaultFocus,
    daysPerWeek: 3,
    equipment: "bodyweight",
    sessionMinutes: 30,
  });
  const splitEligible = preferences.equipment === "gym" && preferences.daysPerWeek >= 5;
  const trainingStyle = preferences.trainingStyle ?? (preferences.daysPerWeek === 6 ? "push-pull-legs" : "balanced");
  useEffect(() => {
    if (plan.preferences) setPreferences(plan.preferences);
  }, [plan.preferences]);
  useEffect(() => {
    let active = true;
    void api<ExerciseCatalogEntry[]>("/api/exercises").then((entries) => {
      if (active) setExerciseCatalog(entries);
    }).catch((reason: unknown) => {
      if (active) setExerciseCatalogError(reason instanceof Error ? reason.message : "Could not load the exercise catalogue.");
    }).finally(() => {
      if (active) setExerciseCatalogLoading(false);
    });
    return () => { active = false; };
  }, []);
  const updatePreferences = (patch: Partial<WorkoutPlanPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  const planSessionMinutes = plan.preferences?.sessionMinutes ?? preferences.sessionMinutes;
  const warmUpTime = planSessionMinutes === 20 ? "3-5 min" : "5-10 min";
  const coolDownTime = planSessionMinutes === 20 ? "2-3 min" : "5-10 min";

  return <form className="page-view workout-plan-view" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <div className="eyebrow">YOUR TRAINING</div>
    <div className="page-title-row"><div><h1>Workout plan</h1><p>Generate a beginner-friendly routine around your goals, schedule, and equipment, then edit it anytime.</p></div><span className="goals-emblem"><Dumbbell size={23} /></span></div>
    <section className="plan-builder">
      <div className="goal-section-head"><span className="goal-step"><Dumbbell size={14} /></span><div><h2>Build your workout plan</h2><p>Your saved goal preselects a focus. Full-gym users training 5–7 days can choose an experienced split style.</p></div></div>
      <div className="plan-preferences">
        <label>Focus<select value={preferences.focus} onChange={(event) => updatePreferences({ focus: event.target.value as WorkoutPlanFocus })}>
          <option value="fat-loss">Lose weight / fat loss</option><option value="strength">Build strength / muscle</option><option value="general-fitness">General fitness</option><option value="stamina">Improve stamina</option>
        </select></label>
        <label>Days each week<select value={preferences.daysPerWeek} onChange={(event) => updatePreferences({ daysPerWeek: Number(event.target.value) as WorkoutPlanPreferences["daysPerWeek"] })}>
          {[2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}
        </select></label>
        <label>Available equipment<select value={preferences.equipment} onChange={(event) => updatePreferences({ equipment: event.target.value as WorkoutPlanEquipment })}>
          <option value="bodyweight">No equipment</option><option value="dumbbells">Dumbbells</option><option value="gym">Full gym</option>
        </select></label>
        {splitEligible && <label>Training style<select value={trainingStyle} onChange={(event) => updatePreferences({ trainingStyle: event.target.value as WorkoutPlanTrainingStyle })}>
          <option value="balanced">Balanced plan (recommended)</option><option value="push-pull-legs">Push / pull / legs</option><option value="body-part">One muscle group per day (experienced)</option>
        </select></label>}
        <label>Time per session<select value={preferences.sessionMinutes} onChange={(event) => updatePreferences({ sessionMinutes: Number(event.target.value) as WorkoutPlanPreferences["sessionMinutes"] })}>
          {[20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
        </select></label>
      </div>
      <div className="plan-builder-footer"><p>Session length changes the workout: 20-minute plans prioritize two movements, while longer plans add exercises, sets, and rest time. Warm-up and cool-down are included. Experienced gym users can choose push/pull/legs or one muscle group per day; the seven-day split schedules an easier recovery day. See <a href="https://www.nhs.uk/live-well/exercise/strength-exercises/" target="_blank" rel="noreferrer">NHS beginner strength exercises</a> and <a href="https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/" target="_blank" rel="noreferrer">weekly activity guidance</a>.</p><button className="primary-button" type="button" onClick={() => onGenerate(preferences)}><Dumbbell size={16} /> Create workout plan</button></div>
    </section>
    <datalist id="exercise-catalog">
      {exerciseCatalog.map((exercise) => <option key={exercise.id} value={exercise.name} label={[
        exercise.category,
        exercise.equipment.length ? exercise.equipment.join(", ") : "No equipment listed",
        exercise.author ? `by ${exercise.author}` : "",
        exercise.license,
      ].filter(Boolean).join(" · ")} />)}
    </datalist>
    <p className={exerciseCatalogError ? "exercise-catalog-message error" : "exercise-catalog-message"} role="status">
      {exerciseCatalogLoading
        ? "Loading exercise options…"
        : exerciseCatalogError
          ? `${exerciseCatalogError} Type a custom exercise name instead.`
          : <>Choose a suggestion or type your own. Exercise catalogue: <a href="https://wger.de/en/software/api" target="_blank" rel="noreferrer">wger</a> (licence and contributor shown for each choice).</>}
    </p>
    <div className="plan-days">{plan.days.map((day, dayIndex) => <section className="plan-day" key={day.day}>
      <div className="plan-day-heading"><div><h2>{day.day}</h2><span>{day.label ?? (day.exercises.length ? `${day.exercises.length} ${day.exercises.length === 1 ? "exercise" : "exercises"}` : "Rest day")}</span>{day.label && <small>{day.exercises.length} exercises</small>}</div><button className="text-action" type="button" onClick={() => onAdd(dayIndex)}><Plus size={15} /> Add exercise</button></div>
      {day.warmUp && <div className="plan-day-prep">
        <p><strong>Warm-up · {warmUpTime}</strong>{day.warmUp}</p>
        <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${warmUpTime} ${day.label ?? "full body"} dynamic warm up before workout`)}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Find a guided warm-up video</a>
      </div>}
      {day.exercises.length > 0 && <div className="plan-exercises">{day.exercises.map((exercise) => <div className="plan-exercise" key={exercise.id}>
        <label className="plan-exercise-name">Exercise<input required maxLength={120} list="exercise-catalog" value={exercise.name} placeholder="Type or choose an exercise" onChange={(event) => onChange(dayIndex, exercise.id, { name: event.target.value })} /></label>
        <label>Sets<input required type="number" min="1" max="20" value={exercise.sets} onChange={(event) => onChange(dayIndex, exercise.id, { sets: Number(event.target.value) })} /></label>
        <label>Reps<input required maxLength={40} value={exercise.reps} placeholder="e.g. 8-12" onChange={(event) => onChange(dayIndex, exercise.id, { reps: event.target.value })} /></label>
        <label className="plan-exercise-notes">Notes <span>(optional)</span><input maxLength={200} value={exercise.notes} placeholder="e.g. Use lighter weight" onChange={(event) => onChange(dayIndex, exercise.id, { notes: event.target.value })} /></label>
        <button className="icon-button plan-remove" type="button" onClick={() => onRemove(dayIndex, exercise.id)} aria-label={`Remove ${exercise.name || "exercise"} from ${day.day}`}><Trash2 size={15} /></button>
        {exercise.name.trim() && <a className="plan-video-link" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} beginner exercise tutorial`)}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Find video demos</a>}
      </div>)}</div>}
      {day.coolDown && <div className="plan-day-prep plan-day-cooldown">
        <p><strong>Cool-down & stretching · {coolDownTime}</strong>{day.coolDown}</p>
        <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${coolDownTime} ${day.label ?? "full body"} post workout cool down stretches`)}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Find a guided cool-down video</a>
      </div>}
    </section>)}</div>
    <div className="plan-save-row"><span>{saved ? <><Check size={15} /> Plan saved</> : "Changes are saved when you choose Save plan."}</span><button className="primary-button" type="submit" disabled={saving}>{saving ? <span className="button-spinner" /> : <Check size={16} />}{saving ? "Saving…" : "Save plan"}</button></div>
  </form>;
}

function GoalsView({ settings, currentWeightKg, onSave, saved, setSaved }: { settings: Settings; currentWeightKg: number | null; onSave: (patch: Partial<Settings>) => Promise<Settings>; saved: boolean; setSaved: (saved: boolean) => void }) {
  const [form, setForm] = useState({ ...settings, currentWeightKg: settings.currentWeightKg ?? currentWeightKg });
  const [saveError, setSaveError] = useState("");
  const [plan, setPlan] = useState<WeightPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  useEffect(() => setForm({ ...settings, currentWeightKg: settings.currentWeightKg ?? currentWeightKg }), [settings, currentWeightKg]);
  const update = (patch: Partial<Settings>) => { setForm((current) => ({ ...current, ...patch })); setPlan(null); setSaved(false); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaveError("");
    try { await onSave(form); setSaved(true); window.setTimeout(() => setSaved(false), 2400); }
    catch (reason) { setSaveError(reason instanceof Error ? reason.message : "Could not save goals."); }
  };
  const buildPlan = async () => {
    if (!form.sex || !form.goalType || form.currentWeightKg == null || form.targetWeightKg == null || form.age == null || form.heightCm == null) {
      setPlan(null); setSaveError("Enter current and target weight, age, height, sex, and goal type to build your plan."); return;
    }
    setPlanBusy(true); setSaveError("");
    try {
      const nextPlan = await api<WeightPlan>("/api/estimate-plan", {
        method: "POST",
        body: JSON.stringify({
          currentWeightKg: form.currentWeightKg,
          targetWeightKg: form.targetWeightKg,
          sex: form.sex,
          age: form.age,
          heightCm: form.heightCm,
          activityFactor: form.activityFactor ?? 1.45,
          goalType: form.goalType,
        }),
      });
      setPlan(nextPlan);
    } catch (reason) {
      setPlan(null); setSaveError(reason instanceof Error ? reason.message : "Could not build this plan.");
    } finally { setPlanBusy(false); }
  };
  return <div className="page-view goals-view"><div className="eyebrow">MAKE IT YOURS</div><div className="page-title-row"><div><h1>Your goals</h1><p>A starting point, shaped around you.</p></div><span className="goals-emblem"><Settings2 size={23} /></span></div>
    <form className="goals-form" onSubmit={submit}>
      <section className="goal-section"><div className="goal-section-head"><span className="goal-step">01</span><div><h2>Your direction</h2><p>Choose the pace that feels right.</p></div></div><fieldset className="goal-choice"><legend className="visually-hidden">Goal type</legend>{(["lose", "maintain", "gain"] as GoalType[]).map((goal) => <button type="button" key={goal} className={form.goalType === goal ? "goal-option selected" : "goal-option"} onClick={() => update({ goalType: goal })}><span className={`goal-option-icon ${goal}`}>{goal === "lose" ? <ArrowDown size={17} /> : goal === "gain" ? <Plus size={17} /> : <Activity size={17} />}</span><strong>{goal[0].toUpperCase() + goal.slice(1)}</strong><small>{goal === "lose" ? "Gradual deficit" : goal === "gain" ? "Steady surplus" : "Stay consistent"}</small></button>)}</fieldset>
        <div className="goal-input-grid three"><NumberField label="Current weight" value={form.currentWeightKg} suffix="kg" onChange={(value) => update({ currentWeightKg: value })} /><NumberField label="Target weight" value={form.targetWeightKg} suffix="kg" onChange={(value) => update({ targetWeightKg: value })} /><NumberField label="Daily calories" value={form.calorieTarget} suffix="kcal" onChange={(value) => update({ calorieTarget: value })} /></div>
      </section>

      <section className="goal-section"><div className="goal-section-head"><span className="goal-step">02</span><div><h2>Macro targets <span className="optional-label">OPTIONAL</span></h2><p>Daily grams for the nutrients you track.</p></div></div><div className="goal-input-grid three"><NumberField label="Protein" value={form.proteinTarget} suffix="g" onChange={(value) => update({ proteinTarget: value })} /><NumberField label="Carbs" value={form.carbsTarget} suffix="g" onChange={(value) => update({ carbsTarget: value })} /><NumberField label="Fat" value={form.fatTarget} suffix="g" onChange={(value) => update({ fatTarget: value })} /></div></section>

      <section className="goal-section"><div className="goal-section-head"><span className="goal-step">03</span><div><h2>Movement</h2><p>Build a weekly rhythm that works for you.</p></div></div><div className="goal-input-grid"><NumberField label="Active minutes / week" value={form.weeklyActiveMinutes} suffix="min" onChange={(value) => update({ weeklyActiveMinutes: value ?? 0 })} /><label className="toggle-setting"><span><strong>Count exercise calories</strong><small>Add logged workouts to your food budget.</small></span><input type="checkbox" checked={form.includeExerciseCalories} onChange={(event) => update({ includeExerciseCalories: event.target.checked })} /><i /></label></div></section>

      <section className="goal-section estimator-section"><div className="goal-section-head"><span className="goal-step">04</span><div><h2>Build your target plan</h2><p>Mifflin–St Jeor calories and an estimated pace.</p></div></div><div className="goal-input-grid estimator-grid"><label>Sex<select value={form.sex ?? ""} onChange={(event) => update({ sex: (event.target.value || null) as Settings["sex"] })}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option></select></label><NumberField label="Age" value={form.age} suffix="years" onChange={(value) => update({ age: value })} /><NumberField label="Height" value={form.heightCm} suffix="cm" onChange={(value) => update({ heightCm: value })} /><label>Activity level<select value={form.activityFactor ?? "1.45"} onChange={(event) => update({ activityFactor: Number(event.target.value) })}><option value="1.2">Mostly sitting</option><option value="1.375">Lightly active</option><option value="1.45">Moderately active</option><option value="1.725">Very active</option><option value="1.9">Highly active</option></select></label></div><div className="estimate-row"><button className="lookup-button" type="button" disabled={planBusy} onClick={buildPlan}>{planBusy ? "Building plan…" : "Build my plan"}</button></div>{plan && <div className="weight-plan" role="status"><div className="weight-plan-heading"><span>YOUR STARTING PLAN</span><strong>{plan.estimatedWeeks === 0 ? "At your target range" : plan.estimatedWeeks == null ? "Review the pace" : `About ${plan.estimatedWeeks} weeks to target`}</strong></div><div className="plan-calories"><strong>{number(plan.calorieTarget)} <small>kcal / day</small></strong><span>Suggested starting intake</span></div><div className="plan-details"><div><span>MAINTENANCE ESTIMATE</span><strong>{number(plan.maintenanceCalories)} kcal</strong></div><div><span>EXPECTED PACE</span><strong>{plan.weeklyChangeKg ? `${plan.goalType === "lose" ? "−" : "+"}${plan.weeklyChangeKg.toFixed(2)} kg / week` : "No change"}</strong></div></div><p>{plan.note}</p><button className="lookup-button" type="button" onClick={() => update({ currentWeightKg: plan.currentWeightKg, targetWeightKg: plan.targetWeightKg, calorieTarget: plan.calorieTarget })}>Use this plan</button></div>}<p className="estimator-note">Enter your current weight, target weight, age, height, sex, activity, and goal direction. Estimates are approximate, with a minimum of 1,200 kcal for women and 1,500 kcal for men; they are not medical advice.</p></section>

      {saveError && <p className="form-error" role="alert">{saveError}</p>}<div className="goals-save-row"><span>{saved ? <><Check size={15} /> Saved</> : "Your plan is saved to your private log."}</span><button className="primary-button" type="submit">{saved ? <Check size={16} /> : <ArrowRight size={16} />}{saved ? "Goals saved" : "Save goals"}</button></div>
    </form>
  </div>;
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: number | null; suffix: string; onChange: (value: number | null) => void }) {
  return <label className="number-field">{label}<span className="number-input-wrap"><input type="number" min="0" step="1" value={value ?? ""} onChange={(event) => onChange(fieldNumber(event.target.value))} /><small>{suffix}</small></span></label>;
}

function BarcodeDialog({ product, grams, setGrams, status, onDetected, onClose, onAdd }: { product: ProductMatch | null; grams: string; setGrams: (value: string) => void; status: string; onDetected: (code: string) => void; onClose: () => void; onAdd: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  useEffect(() => {
    if (product || !video.current) return;
    let active = true;
    let controls: { stop: () => void } | undefined;
    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (!active || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      reader.decodeFromVideoDevice(undefined, video.current, (result, _error, nextControls) => {
        controls = nextControls;
        if (result && active) { active = false; controls.stop(); onDetected(result.getText()); }
      }).catch(() => { if (active) setCameraError("Camera unavailable. Enter the barcode number instead."); });
    }).catch(() => { if (active) setCameraError("Barcode scanning is unavailable. Enter the barcode number instead."); });
    return () => { active = false; controls?.stop(); };
  }, [product]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="barcode-modal" role="dialog" aria-modal="true" aria-labelledby="barcode-title"><div className="modal-heading"><div><div className="eyebrow">PRODUCT LOOKUP</div><h2 id="barcode-title">Scan barcode</h2></div><button className="icon-button" onClick={onClose} aria-label="Close barcode scanner"><X size={19} /></button></div>{product ? <div className="barcode-product"><span className="product-mark"><Barcode size={21} /></span><div><strong>{product.name}</strong><span>{product.brand || product.source.replaceAll("_", " ")}</span></div><label>Portion eaten<input type="number" min="1" max="10000" value={grams} onChange={(event) => setGrams(event.target.value)} /> g</label><div className="barcode-nutrition"><span>{Math.round(product.kcalPer100g * Number(grams) / 100)} kcal</span><small>Protein {Math.round(product.proteinPer100g * Number(grams) / 100)}g · Carbs {Math.round(product.carbsPer100g * Number(grams) / 100)}g · Fat {Math.round(product.fatPer100g * Number(grams) / 100)}g</small></div></div> : <><video ref={video} className="barcode-video" muted playsInline /><p className="barcode-help">Hold the barcode inside the frame.</p><div className="manual-barcode"><input inputMode="numeric" aria-label="Barcode number" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Enter barcode number" /><button className="lookup-button" onClick={() => manualCode && onDetected(manualCode)}>Look up</button></div>{(cameraError || status) && <p className="lookup-message" role="status">{cameraError || status}</p>}</>}<div className="modal-footer"><button className="plain-button" onClick={onClose}>{product ? "Cancel" : "Close"}</button>{product && <button className="primary-button" onClick={onAdd}><Plus size={16} /> Add to log</button>}</div></section></div>;
}

export default App;