import { Activity, ArrowDown, Check, Flame } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { DayRecord, Settings } from "@fuel-log/shared";

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const shiftDate = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const number = (value: number | null | undefined) => Math.round(value ?? 0).toLocaleString();

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export default function ProgressView({ days, settings }: { days: DayRecord[]; settings: Settings }) {
  const today = localToday();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const calories = Array.from({ length: 14 }, (_, index) => {
    const date = shiftDate(today, index - 13);
    const day = byDate.get(date);
    return { date, label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }), kcal: day?.foods.reduce((sum, item) => sum + item.kcal, 0) ?? 0, logged: Boolean(day?.foods.length) };
  });
  const weights = Array.from({ length: 14 }, (_, index) => {
    const date = shiftDate(today, index - 13);
    const day = byDate.get(date);
    return { date, label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }), weight: day?.weightKg ?? null, target: settings.targetWeightKg };
  });
  const lastSeven = calories.slice(-7).filter((entry) => entry.logged);
  const avg = lastSeven.length ? lastSeven.reduce((sum, entry) => sum + entry.kcal, 0) / lastSeven.length : 0;
  const activeWeek = days.filter((day) => day.date >= shiftDate(today, -6)).flatMap((day) => day.workouts).reduce((sum, workout) => sum + workout.minutes, 0);
  let streak = 0;
  for (let offset = 0; offset < 365; offset++) {
    const day = byDate.get(shiftDate(today, -offset));
    if (!day?.foods.length) break;
    streak++;
  }
  const target = settings.calorieTarget ?? 0;
  return <div className="page-view progress-view"><div className="eyebrow">THE LONG VIEW</div><div className="page-title-row"><div><h1>Your progress</h1><p>Patterns over perfection.</p></div><span className="range-badge">LAST 14 DAYS <ArrowDown size={13} /></span></div>
    <div className="metric-row"><Metric label="7-DAY AVG" value={target ? `${number(avg)} kcal` : "—"} detail={target ? `${number(avg - target)} vs daily target` : "Set a calorie goal"} icon={<Flame size={17} />} /><Metric label="LOGGING STREAK" value={`${streak} ${streak === 1 ? "day" : "days"}`} detail="Consecutive days logged" icon={<Check size={17} />} /><Metric label="ACTIVE THIS WEEK" value={`${number(activeWeek)} min`} detail={`${number(settings.weeklyActiveMinutes)} min weekly goal`} icon={<Activity size={17} />} /></div>
    <section className="chart-section"><div className="chart-heading"><div><h2>Calories</h2><p>Daily intake against your target.</p></div><span className="chart-key"><i className="key-dot" /> Eaten <i className="key-line" /> Target</span></div>{!target && <p className="chart-hint">Set a calorie target in Goals to see your target line.</p>}<div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={calories} margin={{ top: 12, right: 6, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval={1} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} /><Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} formatter={(value) => [`${number(Number(value))} kcal`, "Eaten"]} /><ReferenceLine y={target || undefined} stroke="#71844c" strokeDasharray="5 5" /><Bar dataKey="kcal" radius={[3, 3, 0, 0]} maxBarSize={19}>{calories.map((entry) => <Cell key={entry.date} fill={target && entry.kcal > target ? "#de765c" : "#83a78e"} />)}</Bar></BarChart></ResponsiveContainer></div></section>
    <section className="chart-section"><div className="chart-heading"><div><h2>Weight trend</h2><p>Daily weigh-ins and your target weight.</p></div><span className="chart-unit">kg</span></div>{!weights.some((entry) => entry.weight !== null) && <p className="chart-hint">Log your weight to start a trend.</p>}<div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={weights} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval={2} /><YAxis domain={([minimum, maximum]) => [Math.floor(Number(minimum) - 1), Math.ceil(Number(maximum) + 1)]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} /><Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }} formatter={(value) => [`${value} kg`, ""]} /><Line type="monotone" dataKey="target" stroke="#d7aa4a" strokeDasharray="5 5" dot={false} connectNulls /><Line type="monotone" dataKey="weight" stroke="#438a76" strokeWidth={2.5} dot={{ r: 3, fill: "#438a76", stroke: "var(--panel)", strokeWidth: 2 }} connectNulls /></LineChart></ResponsiveContainer></div></section>
  </div>;
}