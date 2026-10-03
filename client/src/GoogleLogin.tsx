import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

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

  return <main className="auth-page"><section className="auth-panel" aria-labelledby="auth-title">
    <a className="brand auth-brand" href="/" aria-label="Fuel log"><span className="brand-mark">F<span>.</span></span><span>fuel<span className="brand-light">log</span></span></a>
    <span className="auth-shield"><ShieldCheck size={19} /></span>
    <div className="eyebrow">PRIVATE TRACKER</div>
    <h1 id="auth-title">Sign in to your log</h1>
    <p className="auth-copy">Continue with the authorized Gmail account to view your personal nutrition and fitness data.</p>
    {!clientId ? <div className="auth-unavailable" role="alert">Google sign-in is not configured. Set <code>GOOGLE_CLIENT_ID</code> and <code>ALLOWED_GMAIL</code> on the server.</div> : <div className="google-button-slot" ref={buttonRef} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="auth-privacy">Only one verified Gmail address is permitted. Fuel log never asks for your Google password.</p>
  </section></main>;
}