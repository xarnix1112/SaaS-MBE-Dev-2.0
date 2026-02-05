import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Initialiser Sentry AVANT tout
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || "production",
    tracesSampleRate: 1.0, // 100% des transactions pour le monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false, // Masquer les données sensibles
        blockAllMedia: false,
      }),
    ],
    // Capturer les erreurs non gérées
    beforeSend(event, hint) {
      // Filtrer les erreurs de développement si nécessaire
      if (import.meta.env.DEV) {
        console.log("[Sentry] Erreur capturée (mode dev):", event);
        // En développement, vous pouvez retourner null pour ne pas envoyer
        // return null;
      }
      return event;
    },
  });
  console.log("[Sentry] ✅ Sentry initialisé pour le frontend");
} else {
  console.warn("[Sentry] ⚠️  VITE_SENTRY_DSN non configuré, Sentry désactivé");
}

createRoot(document.getElementById("root")!).render(<App />);
