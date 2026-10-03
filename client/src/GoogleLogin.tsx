import { useEffect, useRef, useState } from "react";
import { Activity, Scale, ShieldCheck, Utensils } from "lucide-react";

export interface AuthUser {
  email: string;
  name: string;
  picture: string | null;
}

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme: string; size: string; shape: string; text: string; width: number }) => void;
        };
      };
    };
  }
}

export default function GoogleLogin({ clientId, onSignIn }: { clientId: string | null; onSignIn: (user: AuthUser) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let active = true;
    const mountButton = () => {
      if (!active || !buttonRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError("");
          try {
            const response = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const body = await response.json() as AuthUser | { error?: string };
            if (!response.ok) throw new Error("error" in body ? body.error : "Google sign-in failed.");
            sessionStorage.setItem("fuel-google-token", credential);
            onSignIn(body as AuthUser);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width: 300,
      });
    };

    let script = document.getElementById("google-identity-sdk") as HTMLScriptElement | null;
    if (window.google) mountButton();
    else {
      if (!script) {
        script = document.createElement("script");
        script.id = "google-identity-sdk";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onerror = () => { if (active) setError("Google sign-in could not load. Check your connection and try again."); };
        document.head.append(script);
      }
      script.addEventListener("load", mountButton);
    }
    return () => {
      active = false;
      script?.removeEventListener("load", mountButton);
    };
  }, [clientId]);

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
      <h2 id="auth-title">Make room for better habits.</h2>
      <p className="auth-copy">Create your free account or return to your log with Google.</p>
      {!clientId ? <div className="auth-unavailable" role="alert">Google sign-in is not configured. Set <code>GOOGLE_CLIENT_ID</code> on the server.</div> : <div className="google-button-slot" ref={buttonRef} />}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="auth-signup-note">New to Fuel log? Your private account is created when you continue. Already a member? Sign in with Google.</p>
      <p className="auth-privacy">Only a verified Gmail address is needed. Your log belongs to you, and Fuel log never sees your Google password.</p>
      <p className="auth-disclaimer">For general wellness; not a substitute for medical advice.</p>
    </section>
  </div></main>;
}