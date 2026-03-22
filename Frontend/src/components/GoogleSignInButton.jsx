import { useEffect, useMemo, useRef } from "react";

const GOOGLE_SCRIPT_ID = "google-identity-service";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function ensureGoogleScript() {
  if (document.getElementById(GOOGLE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = GOOGLE_SCRIPT_ID;
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export default function GoogleSignInButton({ role, onCode, disabled = false }) {
  const clientRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    ensureGoogleScript();

    const intervalId = window.setInterval(() => {
      if (!window.google?.accounts?.oauth2) {
        return;
      }

      clientRef.current = window.google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (response) => {
          if (response.code) {
            onCode(response.code);
          }
        },
      });
      window.clearInterval(intervalId);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onCode]);

  const buttonLabel = useMemo(() => {
    return "Continue with Google";
  }, [role]);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <div className="google-signin-stack">
      <button
        type="button"
        className="google-signin-button"
        disabled={disabled}
        onClick={() => clientRef.current?.requestCode()}
      >
        <span className="google-signin-mark" aria-hidden="true">
          G
        </span>
        <span>{buttonLabel}</span>
      </button>
    </div>
  );
}
