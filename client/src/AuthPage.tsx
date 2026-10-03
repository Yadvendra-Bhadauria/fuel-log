import { useEffect, useState, type FormEvent } from "react";
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

type AuthMode = "signup" | "signin" | "forgot" | "reset";

export default function AuthPage({ onSignIn, passwordResetEnabled }: {
  onSignIn: (user: AuthUser) => void;
  passwordResetEnabled: boolean;
}) {
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("resetToken") ?? "");
  const [mode, setMode] = useState<AuthMode>(() => new URLSearchParams(window.location.search).has("resetToken") ? "reset" : "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resetToken) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if ((mode === "signup" || mode === "reset") && password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      if (mode === "reset" && password !== passwordConfirmation) {
        throw new Error("The passwords do not match.");
      }
      const path = mode === "signup" ? "register"
        : mode === "signin" ? "login"
          : mode === "forgot" ? "password-reset/request"
            : "password-reset/complete";
      const body = mode === "forgot" ? { email }
        : mode === "reset" ? { token: resetToken, password }
          : { name, email, password };
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json() as AuthResponse | { error?: string; message?: string };
      if (!response.ok) throw new Error("error" in responseBody ? responseBody.error : "Could not complete this request.");
      if (mode === "forgot") {
        setNotice("If an account exists for that email, we’ll send a reset link. It expires in 30 minutes.");
      } else if (mode === "reset") {
        setNotice("Your password has been reset. Sign in with your new password.");
        setMode("signin");
        setPassword("");
        setPasswordConfirmation("");
        setResetToken("");
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        const auth = responseBody as AuthResponse;
        sessionStorage.setItem("fuel-session-token", auth.token);
        onSignIn(auth.user);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete this request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";
  const isSignin = mode === "signin";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const title = isSignup ? "Make room for better habits."
    : isSignin ? "Welcome back."
      : isForgot ? "Reset your password."
        : "Choose a new password.";
  const copy = isSignup ? "Create a free account to start your personal log."
    : isSignin ? "Sign in to continue to your personal log."
      : isForgot ? "Enter your account email and we’ll send you a one-time reset link."
        : "Choose a new password for your Fuel log account.";

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
      <h2 id="auth-title">{title}</h2>
      <p className="auth-copy">{copy}</p>
      <form className="auth-form" onSubmit={submit}>
        {isSignup && <label>
          <span>Your name</span>
          <input autoComplete="name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>}
        {!isReset && <label>
          <span>Email</span>
          <input autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>}
        {!isForgot && <label>
          <span>Password{(isSignup || isReset) && " (at least 6 characters)"}</span>
          <input autoComplete={isSignin ? "current-password" : "new-password"} maxLength={128} minLength={isSignin ? 1 : 6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>}
        {isReset && <label>
          <span>Confirm new password</span>
          <input autoComplete="new-password" maxLength={128} minLength={6} onChange={(event) => setPasswordConfirmation(event.target.value)} required type="password" value={passwordConfirmation} />
        </label>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? "Please wait…" : isSignup ? "Create account" : isSignin ? "Sign in" : isForgot ? "Send reset link" : "Reset password"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {isSignin && passwordResetEnabled && <button className="auth-mode-toggle" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} type="button">Forgot password?</button>}
      <p className="auth-signup-note">
        {isForgot || isReset ? "Remembered your password?" : isSignup ? "Already have an account?" : "New to Fuel log?"}{" "}
        <button className="auth-mode-toggle" onClick={() => {
          setMode(isSignup || isForgot || isReset ? "signin" : "signup");
          setError("");
          setNotice("");
          if (isReset) {
            setResetToken("");
            window.history.replaceState(null, "", window.location.pathname);
          }
        }} type="button">
          {isSignup || isForgot || isReset ? "Sign in" : "Create an account"}
        </button>
      </p>
      {isSignup || isSignin
        ? <p className="auth-privacy">{isSignup ? "Use a password with at least 6 characters. Email addresses are not verified." : "Use an email address you can remember. Email addresses are not verified."}</p>
        : isReset && <p className="auth-privacy">Use at least 6 characters. Any characters are allowed.</p>}
      <p className="auth-disclaimer">For general wellness; not a substitute for medical advice.</p>
    </section>
  </div></main>;
}
