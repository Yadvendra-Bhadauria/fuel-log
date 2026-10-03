import { useState, type FormEvent } from "react";
import { Activity, Scale, ShieldCheck, Utensils } from "lucide-react";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export default function AuthPage({ onSignIn }: { onSignIn: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await response.json() as AuthResponse | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Could not sign in.");
      const auth = body as AuthResponse;
      sessionStorage.setItem("fuel-session-token", auth.token);
      onSignIn(auth.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page"><div className="auth-layout">
    <section className="auth-story" aria-label="About Fuel log">
      <a className="brand auth-brand" href="/" aria-label="Fuel log"><span className="brand-mark">F<span>.</span></span><span>fuel<span className="brand-light">log</span></span></a>
      <div className="auth-story-copy">
        <div className="eyebrow">A LITTLE MORE BALANCE, EVERY DAY</div>
        <h1>Feel good about the little things.</h1>
        <p>A calmer space to notice what fuels you, celebrate movement, and build habits that feel like your own.</p>
      </div>
      <div className="auth-feature-list">
        <div className="auth-feature"><span><Utensils size={17} /></span><div><strong>Meals, without the guesswork</strong><small>Keep food and nutrition together in one simple daily log.</small></div></div>
        <div className="auth-feature"><span><Activity size={17} /></span><div><strong>Progress that feels personal</strong><small>See your movement and daily patterns add up over time.</small></div></div>
        <div className="auth-feature"><span><Scale size={17} /></span><div><strong>Your goals, your pace</strong><small>Set a direction that fits your life, then adjust as you go.</small></div></div>
      </div>
      <p className="auth-story-foot">Small steps add up. Keep showing up.</p>
    </section>
    <section className="auth-panel" aria-labelledby="auth-title">
      <span className="auth-shield"><ShieldCheck size={19} /></span>
      <div className="eyebrow">YOUR PRIVATE SPACE</div>
      <h2 id="auth-title">{mode === "signup" ? "Make room for better habits." : "Welcome back."}</h2>
      <p className="auth-copy">{mode === "signup" ? "Create a free account to start your personal log." : "Sign in to continue to your personal log."}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === "signup" && <label>
          <span>Your name</span>
          <input autoComplete="name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>}
        <label>
          <span>Email</span>
          <input autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete={mode === "signup" ? "new-password" : "current-password"} maxLength={128} minLength={mode === "signup" ? 12 : 1} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        <button className="auth-submit" disabled={busy} type="submit">{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="auth-signup-note">
        {mode === "signup" ? "Already have an account?" : "New to Fuel log?"}{" "}
        <button className="auth-mode-toggle" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }} type="button">
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
      <p className="auth-privacy">Use an email address you can remember. Email addresses are not verified, and forgotten passwords cannot be recovered.</p>
      <p className="auth-disclaimer">For general wellness; not a substitute for medical advice.</p>
    </section>
  </div></main>;
}
