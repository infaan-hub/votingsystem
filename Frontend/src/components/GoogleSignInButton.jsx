import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT_ID = "google-identity-service";
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "139448352472-lehcpckt5odaalct2413559e8n5i5704.apps.googleusercontent.com";

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

export default function GoogleSignInButton({ onCredential, onCode, disabled = false }) {
  const codeClientRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    ensureGoogleScript();

    const intervalId = window.setInterval(() => {
      if (!window.google?.accounts?.oauth2) {
        return;
      }

      if (onCode) {
        codeClientRef.current = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: (response) => {
            if (response.code) {
              onCode(response.code);
            }
          },
        });
      } else if (onCredential) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              onCredential(response.credential);
            }
          },
        });
      } else {
        window.clearInterval(intervalId);
        return;
      }

      setIsReady(true);
      window.clearInterval(intervalId);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onCode, onCredential]);

  function handleClick() {
    if (disabled || !isReady) {
      return;
    }

    if (onCode && codeClientRef.current) {
      codeClientRef.current.requestCode();
      return;
    }

    if (onCredential && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  }

  return (
    <div className="google-signin-stack">
      <button
        className={`google-signin-button ${disabled || !isReady ? "google-button-disabled" : ""}`}
        type="button"
        onClick={handleClick}
        disabled={disabled || !isReady}
      >
        <span className="google-signin-mark">G</span>
        <span>Continue with Google</span>
      </button>
    </div>
  );
}
