import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity, Apple, ArrowDown, ArrowLeft, ArrowRight, BarChart3, Barcode, Check, ChevronDown,
  CircleHelp, Droplets, Footprints, LogOut, Moon, Plus, Scale, Settings2, Sun, Trash2,
  Upload, Utensils, X,
} from "lucide-react";
import { scaleNutrition, type DayRecord, type FoodEntry, type GoalType, type Meal, type MealAnalysisItem, type ProductMatch, type Settings, type WeightPlan, type Workout } from "@fuel-log/shared";
import GoogleLogin, { type AuthUser } from "./GoogleLogin";

type Tab = "today" | "progress" | "goals";
type ReviewItem = MealAnalysisItem & { base: MealAnalysisItem };
type PhotoScanStatus = { configured: boolean; enabled: boolean; limit: number; used: number; remaining: number };
const ProgressView = lazy(() => import("./ProgressView"));

const mealOrder: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
const mealColor: Record<Meal, string> = { breakfast: "#f6bd60", lunch: "#71b8a2", dinner: "#ed8064", snack: "#a6a4d5" };
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
  const token = sessionStorage.getItem("fuel-google-token");
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
    throw new Error(body?.error ?? "Could not reach Fuel log. Check that the API is running.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function nutritionForGrams(item: MealAnalysisItem, grams: number): MealAnalysisItem {
  return scaleNutrition(item, grams);
}

async function preparePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare this image.")), "image/jpeg", 0.85));
  if (blob.size > 5 * 1024 * 1024) throw new Error("This image is still larger than 5 MB. Try a smaller photo.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(blob);
  });
  const thumbnail = document.createElement("canvas");
  const thumbScale = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
  thumbnail.width = Math.max(1, Math.round(canvas.width * thumbScale));
  thumbnail.height = Math.max(1, Math.round(canvas.height * thumbScale));
  thumbnail.getContext("2d")!.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  return { dataUrl, base64: dataUrl.split(",")[1], thumbnail: thumbnail.toDataURL("image/jpeg", 0.72) };
}

function App() {
  const [authConfig, setAuthConfig] = useState<{ required: boolean; configured: boolean; clientId: string | null } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(localToday());
  const [day, setDay] = useState<DayRecord | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [progressDays, setProgressDays] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [scanStatus, setScanStatus] = useState<PhotoScanStatus | null>(null);
  const [photoConsent, setPhotoConsent] = useState(() => localStorage.getItem("fuel-google-photo-consent") === "accepted");
  const [reviewPhoto, setReviewPhoto] = useState("");
  const [reviewThumbnail, setReviewThumbnail] = useState("");
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewMeal, setReviewMeal] = useState<Meal>("lunch");
  const [reviewModal, setReviewModal] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<ProductMatch | null>(null);
  const [barcodeGrams, setBarcodeGrams] = useState("100");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const refreshDay = async () => {
    const data = await api<DayRecord>(`/api/days/${date}`);
    setDay(data);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fuel-theme", theme);
  }, [theme]);

  useEffect(() => {
    setWeightDraft(day?.weightKg == null ? "" : String(day.weightKg));
  }, [date, day?.weightKg]);

  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem("fuel-google-token");
      setAuthUser(null);
    };
    window.addEventListener("fuel-auth-expired", expireSession);
    return () => window.removeEventListener("fuel-auth-expired", expireSession);
  }, []);

  useEffect(() => {
    let active = true;
    const initializeAuth = async () => {
      try {
        const config = await api<{ required: boolean; configured: boolean; clientId: string | null }>("/api/auth/config");
        if (!active) return;
        setAuthConfig(config);
        if (config.required && config.configured && sessionStorage.getItem("fuel-google-token")) {
          try {
            setAuthUser(await api<AuthUser>("/api/auth/me"));
          } catch {
            sessionStorage.removeItem("fuel-google-token");
          }
        }
      } catch {
        if (active) setAuthConfig({ required: true, configured: false, clientId: null });
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void initializeAuth();
    return () => { active = false; };
  }, []);

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
      api<PhotoScanStatus>("/api/meal-scans/status"),
    ]).then(([nextSettings, nextDay, nextRecent, nextScanStatus]) => {
      if (!active) return;
      setSettings(nextSettings);
      setDay(nextDay);
      setRecent(nextRecent);
      setScanStatus(nextScanStatus);
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load your log."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [date, authLoading, authConfig, authUser]);

  useEffect(() => {
    if (tab !== "progress" || authLoading || authConfig === null || (authConfig.required && !authUser)) return;
    const from = shiftDate(localToday(), -364);
    api<DayRecord[]>(`/api/days?from=${from}&to=${localToday()}`).then(setProgressDays).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load progress."));
  }, [tab, authLoading, authConfig, authUser]);

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
  }) => {
    try {
      await api<FoodEntry>("/api/foods", { method: "POST", body: JSON.stringify({ date, ...input }) });
      await refreshDay();
      setRecent(await api<FoodEntry[]>("/api/foods/recent"));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add this food."); }
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
    await addFood({
      name: foodName.trim(), meal, kcal: Number(foodKcal), grams: fieldNumber(foodGrams),
      proteinG: fieldNumber(foodProtein), carbsG: fieldNumber(foodCarbs), fatG: fieldNumber(foodFat),
      source: foodSource,
    });
    setFoodName(""); setFoodKcal(""); setFoodGrams(""); setFoodProtein(""); setFoodCarbs(""); setFoodFat(""); setFoodSource("manual"); setLookupMessage(""); setShowFoodForm(false);
  };

  const scanPhoto = async (file?: File) => {
    if (!file) return;
    if (!photoConsent) { setError("Acknowledge Google’s free-tier photo data use before scanning."); return; }
    if (!scanStatus?.enabled) { setError(scanStatus?.configured ? "You’ve used today’s free photo scans." : "Free photo scans are not configured yet."); return; }
    setScanBusy(true); setError("");
    try {
      const prepared = await preparePhoto(file);
      setReviewPhoto(prepared.dataUrl); setReviewThumbnail(prepared.thumbnail);
      const result = await api<{ is_food: boolean; items: MealAnalysisItem[]; notes: string }>("/api/analyze-meal", {
        method: "POST", body: JSON.stringify({ imageBase64: prepared.base64, mediaType: "image/jpeg", note: scanNote, consentToGoogleFreeTier: true }),
      });
      if (!result.is_food || result.items.length === 0) throw new Error("That photo does not appear to show food. Try another image.");
      setReviewItems(result.items.map((item) => ({ ...item, base: { ...item } })));
      setReviewModal(true); setReviewMeal(meal);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not analyze this photo."); }
    finally {
      setScanBusy(false); setScanNote(""); if (photoInput.current) photoInput.current.value = "";
      void api<PhotoScanStatus>("/api/meal-scans/status").then(setScanStatus).catch(() => {});
    }
  };

  const setGooglePhotoConsent = (accepted: boolean) => {
    setPhotoConsent(accepted);
    if (accepted) localStorage.setItem("fuel-google-photo-consent", "accepted");
    else localStorage.removeItem("fuel-google-photo-consent");
  };

  const updateReviewGrams = (index: number, grams: number) => {
    setReviewItems((items) => items.map((item, itemIndex) => itemIndex === index ? { ...nutritionForGrams(item.base, grams), base: item.base } : item));
  };

  const saveReview = async () => {
    for (const item of reviewItems) {
      await addFood({
        name: item.name, meal: reviewMeal, kcal: item.kcal, grams: item.grams,
        proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g,
        source: item.source ?? "photo_ai", confidence: item.confidence,
        photoThumbnail: settings.keepPhotoThumbnails ? reviewThumbnail : undefined,
      });
    }
    setReviewModal(false); setReviewItems([]);
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
    { id: "goals" as const, label: "Goals", icon: Settings2 },
  ];

  const signOut = () => {
    sessionStorage.removeItem("fuel-google-token");
    setAuthUser(null);
    setDay(null);
  };

  if (authLoading || authConfig === null) return <div className="auth-loading"><span className="loader" />Checking sign-in</div>;
  if (authConfig.required && !authConfig.configured) return <GoogleLogin clientId={null} onSignIn={setAuthUser} />;
  if (authConfig.required && !authUser) return <GoogleLogin clientId={authConfig.clientId} onSignIn={setAuthUser} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#today" onClick={() => setTab("today")} aria-label="Fuel log home">
          <span className="brand-mark">F<span>.</span></span><span>fuel<span className="brand-light">log</span></span>
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
          <div className="mobile-brand"><span className="brand-mark">F<span>.</span></span><span>fuel<span className="brand-light">log</span></span></div>
          <div className="topbar-date">{prettyDate(date)}</div>
          {authUser && <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button>}
          <button className="icon-button top-theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle color theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        </header>

        {error && <div className="alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
        {loading ? <div className="loading-state"><span className="loader" />Loading your log</div> : <>
          {tab === "today" && <>
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

                <div className="scan-panel">
                  <div className="scan-prompt"><span className="scan-icon"><Apple size={20} /></span><div><strong>Not sure of the numbers?</strong><span>Use one of today’s free photo estimates.</span></div></div>
                  <label className="photo-consent"><input type="checkbox" checked={photoConsent} onChange={(event) => setGooglePhotoConsent(event.target.checked)} /><span>I understand Google’s free tier may use submitted photos to improve its products. I’ll avoid faces and private information.</span></label>
                  <div className="scan-controls"><input aria-label="Meal note for photo estimate" maxLength={500} value={scanNote} onChange={(event) => setScanNote(event.target.value)} placeholder="Add a note (optional)" /><button className="scan-button" disabled={scanBusy || !photoConsent || !scanStatus?.enabled} title={!photoConsent ? "Acknowledge photo data use first" : !scanStatus?.enabled ? "No free photo scans available" : undefined} onClick={() => photoInput.current?.click()}>{scanBusy ? <span className="button-spinner" /> : <Upload size={16} />}{scanBusy ? "Analyzing" : "Scan meal"}</button><button className="scan-button secondary-scan" onClick={() => { setBarcodeModal(true); setBarcodeProduct(null); setBarcodeStatus(""); }}><Barcode size={17} /> Scan barcode</button><input ref={photoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => scanPhoto(event.target.files?.[0])} /></div>
                  <p className="scan-quota" role="status">{!scanStatus?.configured ? "Free photo scans are unavailable until a Gemini free-tier key is configured." : scanStatus.remaining ? `${scanStatus.remaining} of ${scanStatus.limit} free photo scans left today (UTC).` : "No free photo scans left today. The allowance resets at 00:00 UTC."}</p>
                  <p className="approx-note">Photo estimates are approximate. You review everything before it is logged.</p>
                </div>
              </div>
            </section>
          </>}

          {tab === "progress" && <Suspense fallback={<div className="loading-state">Loading progress</div>}><ProgressView days={progressDays} settings={settings} /></Suspense>}
          {tab === "goals" && <GoalsView settings={settings} currentWeightKg={day?.weightKg ?? null} onSave={patchSettings} saved={goalSaved} setSaved={setGoalSaved} />}
        </>}
      </main>

      <nav className="mobile-nav" aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>

      {reviewModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReviewModal(false)}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="modal-heading"><div><div className="eyebrow">PHOTO ESTIMATE</div><h2 id="review-title">Review your meal</h2></div><button className="icon-button" onClick={() => setReviewModal(false)} aria-label="Close review"><X size={19} /></button></div><div className="review-body"><img className="review-photo" src={reviewPhoto} alt="Meal for nutrition estimate" /><p className="approx-note">These photo estimates are approximate. Check portions and numbers before adding.</p><label className="meal-picker">Add to meal<select value={reviewMeal} onChange={(event) => setReviewMeal(event.target.value as Meal)}>{mealOrder.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><div className="review-item-list">{reviewItems.map((item, index) => <ReviewFoodItem key={`${item.name}-${index}`} item={item} onName={(name) => setReviewItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, name, base: { ...entry.base, name } } : entry))} onGrams={(grams) => updateReviewGrams(index, grams)} onRemove={() => setReviewItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div><button className="add-item-button" onClick={() => { const item: MealAnalysisItem = { name: "New food", estimated_portion: "", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: "low", source: "manual" }; setReviewItems((current) => [...current, { ...item, base: item }]); }}><Plus size={15} /> Add an item</button><div className="review-total"><span>MEAL TOTAL</span><strong>{number(reviewItems.reduce((sum, item) => sum + item.kcal, 0))} kcal</strong></div></div><div className="modal-footer"><button className="plain-button" onClick={() => setReviewModal(false)}>Cancel</button><button className="primary-button" disabled={!reviewItems.length} onClick={saveReview}><Check size={16} /> Add to log</button></div></section></div>}

      {barcodeModal && <BarcodeDialog product={barcodeProduct} grams={barcodeGrams} setGrams={setBarcodeGrams} status={barcodeStatus} onDetected={onBarcodeDetected} onClose={() => { setBarcodeModal(false); setBarcodeProduct(null); }} onAdd={async () => { if (!barcodeProduct) return; const factor = Number(barcodeGrams) / 100; await addFood({ name: barcodeProduct.name, meal, grams: Number(barcodeGrams), kcal: Math.round(barcodeProduct.kcalPer100g * factor), proteinG: Math.round(barcodeProduct.proteinPer100g * factor * 10) / 10, carbsG: Math.round(barcodeProduct.carbsPer100g * factor * 10) / 10, fatG: Math.round(barcodeProduct.fatPer100g * factor * 10) / 10, source: barcodeProduct.source }); setBarcodeModal(false); }} />}
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

function ReviewFoodItem({ item, onName, onGrams, onRemove }: { item: ReviewItem; onName: (name: string) => void; onGrams: (grams: number) => void; onRemove: () => void }) {
  return <div className="review-item"><div className="review-item-top"><input aria-label="Food name" value={item.name} onChange={(event) => onName(event.target.value)} /><span className={`confidence confidence-${item.confidence}`}>{item.confidence}</span><button className="icon-button" onClick={onRemove} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button></div><div className="review-numbers"><label>Grams<input aria-label={`${item.name} grams`} type="number" min="0" value={item.grams} onChange={(event) => onGrams(Number(event.target.value))} /></label><strong>{number(item.kcal)} kcal</strong><span>P {number(item.protein_g)}g</span><span>C {number(item.carbs_g)}g</span><span>F {number(item.fat_g)}g</span></div><small className="review-source">{item.source && item.source !== "photo_ai" ? `Nutrition cross-check: ${item.source === "usda" ? "USDA" : "Open Food Facts"}` : item.estimated_portion}</small></div>;
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

      <section className="goal-section"><div className="goal-section-head"><span className="goal-step">03</span><div><h2>Movement</h2><p>Build a weekly rhythm that works for you.</p></div></div><div className="goal-input-grid"><NumberField label="Active minutes / week" value={form.weeklyActiveMinutes} suffix="min" onChange={(value) => update({ weeklyActiveMinutes: value ?? 0 })} /><label className="toggle-setting"><span><strong>Count exercise calories</strong><small>Add logged workouts to your food budget.</small></span><input type="checkbox" checked={form.includeExerciseCalories} onChange={(event) => update({ includeExerciseCalories: event.target.checked })} /><i /></label><label className="toggle-setting full-toggle"><span><strong>Keep meal thumbnails</strong><small>Save a small photo with each entry from a scan.</small></span><input type="checkbox" checked={form.keepPhotoThumbnails} onChange={(event) => update({ keepPhotoThumbnails: event.target.checked })} /><i /></label></div></section>

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