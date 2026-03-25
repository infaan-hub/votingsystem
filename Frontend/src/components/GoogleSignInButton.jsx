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

export default function GoogleSignInButton({ onCredential, disabled = false }) {
  const buttonRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    ensureGoogleScript();

    const intervalId = window.setInterval(() => {
      if (!window.google?.accounts?.id || !buttonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) {
            onCredential(response.credential);
          }
        },
      });
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 320,
        text: "continue_with",
      });
      setIsReady(true);
      window.clearInterval(intervalId);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onCredential]);

  return (
    <div className="google-signin-stack">
      <div ref={buttonRef} className={disabled || !isReady ? "google-button-disabled" : ""} />
    </div>
  );
}
