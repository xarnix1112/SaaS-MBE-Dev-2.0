import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Initialiser Sentry AVANT tout
if (import.meta.env.VITE_SENTRY_DSN) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  console.log("[Sentry] 🔧 Initialisation de Sentry...", {
    dsnConfigured: !!dsn,
    dsnPrefix: dsn ? dsn.substring(0, 20) + "..." : "non configuré",
    environment: import.meta.env.MODE || "production",
  });
  
  Sentry.init({
    dsn: dsn,
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
      console.log("[Sentry] 📤 Envoi d'erreur à Sentry:", {
        message: event.message || event.exception?.values?.[0]?.value,
        level: event.level,
        environment: event.environment,
      });
      // Filtrer les erreurs de développement si nécessaire
      if (import.meta.env.DEV) {
        console.log("[Sentry] Erreur capturée (mode dev):", event);
        // En développement, vous pouvez retourner null pour ne pas envoyer
        // return null;
      }
      return event;
    },
    // Callback après l'envoi
    afterSend(event, hint) {
      console.log("[Sentry] ✅ Erreur envoyée avec succès à Sentry");
      return event;
    },
  });
  console.log("[Sentry] ✅ Sentry initialisé pour le frontend");
  
  // Exposer Sentry globalement pour les tests (développement uniquement)
  if (import.meta.env.DEV) {
    (window as any).Sentry = Sentry;
    console.log("[Sentry] 💡 Sentry exposé dans window.Sentry pour les tests");
  }
} else {
  console.warn("[Sentry] ⚠️  VITE_SENTRY_DSN non configuré, Sentry désactivé");
  console.warn("[Sentry] 💡 Pour activer Sentry, configurez VITE_SENTRY_DSN dans Vercel");
}

createRoot(document.getElementById("root")!).render(<App />);
