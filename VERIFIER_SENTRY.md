# Guide : Vérifier que Sentry Fonctionne Correctement

## 🎯 Objectif

Ce guide vous explique comment vérifier que Sentry capture bien les erreurs et vous envoie des notifications.

---

## ⚠️ PROBLÈME IDENTIFIÉ

**Sentry n'est pas initialisé dans votre code !** C'est pour ça que vous voyez des erreurs dans les logs mais ne recevez jamais de notifications.

Même si vous avez configuré les variables d'environnement (`VITE_SENTRY_DSN` et `SENTRY_DSN`), **Sentry ne fonctionnera pas tant que vous n'avez pas ajouté le code d'initialisation**.

---

## 📋 ÉTAPE 1 : Vérifier la Configuration Actuelle

### 1.1 Vérifier les Variables d'Environnement

**Frontend (Vercel) :**
1. Aller sur [Vercel Dashboard](https://vercel.com)
2. Sélectionner votre projet frontend
3. Aller dans **Settings** → **Environment Variables**
4. Vérifier que `VITE_SENTRY_DSN` existe et contient une URL valide (commence par `https://`)

**Backend (Railway) :**
1. Aller sur [Railway Dashboard](https://railway.app)
2. Sélectionner votre projet backend
3. Aller dans l'onglet **Variables**
4. Vérifier que `SENTRY_DSN` existe et contient une URL valide

### 1.2 Vérifier les Packages Installés

Ouvrir `front end/package.json` et vérifier que vous avez :
```json
{
  "dependencies": {
    "@sentry/react": "^10.38.0",
    "@sentry/node": "^10.38.0"
  }
}
```

Si ces packages ne sont pas présents, les installer :
```powershell
cd "c:\Dev\SaaS MBE SDV\front end"
npm install @sentry/react @sentry/node
```

---

## 🔧 ÉTAPE 2 : Initialiser Sentry dans le Code

### 2.1 Frontend : Initialiser Sentry dans `main.tsx`

**Fichier : `front end/src/main.tsx`**

Ajouter l'initialisation de Sentry **AVANT** le rendu de l'application :

```typescript
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Initialiser Sentry AVANT tout
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

createRoot(document.getElementById("root")!).render(<App />);
```

### 2.2 Backend : Initialiser Sentry dans `ai-proxy.js`

**Fichier : `front end/server/ai-proxy.js`**

Ajouter l'initialisation de Sentry **AU DÉBUT** du fichier, juste après les imports :

```javascript
import * as Sentry from "@sentry/node";

// Initialiser Sentry AVANT Express
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 1.0,
  // Capturer les erreurs non gérées
  beforeSend(event, hint) {
    console.log("[Sentry] Erreur capturée:", event.error?.message || event.message);
    return event;
  },
});

// ... reste des imports ...
```

Puis, **APRÈS** la création de l'app Express, ajouter les handlers d'erreur :

```javascript
const app = express();

// ... configuration de l'app ...

// Ajouter les handlers Sentry APRÈS toutes les routes
app.use(Sentry.Handlers.requestHandler());
// ... vos routes ...
app.use(Sentry.Handlers.errorHandler());
```

---

## 🧪 ÉTAPE 3 : Tester Sentry

### 3.1 Test Frontend : Créer une Erreur Volontaire

**Option A : Test via la Console du Navigateur**

1. Aller sur votre site : `https://www.mbe-sdv.fr`
2. Ouvrir la console (F12 → Console)
3. Taper cette commande :
   ```javascript
   throw new Error("Test Sentry Frontend - " + new Date().toISOString());
   ```
4. Appuyer sur Entrée
5. Vérifier dans Sentry (voir section 3.3)

**Option B : Ajouter un Bouton de Test Temporaire**

Dans `front end/src/App.tsx`, ajouter temporairement :

```typescript
import * as Sentry from "@sentry/react";

// Dans le composant App, ajouter un bouton de test (à retirer après)
useEffect(() => {
  // Test Sentry - À RETIRER APRÈS LES TESTS
  if (window.location.search.includes("test-sentry")) {
    Sentry.captureException(new Error("Test Sentry Frontend - " + new Date().toISOString()));
    alert("Erreur de test envoyée à Sentry !");
  }
}, []);
```

Puis visiter : `https://www.mbe-sdv.fr?test-sentry`

### 3.2 Test Backend : Créer une Route de Test

Dans `front end/server/ai-proxy.js`, ajouter temporairement une route de test :

```javascript
// Route de test Sentry - À RETIRER APRÈS LES TESTS
app.get("/api/test-sentry", (req, res) => {
  try {
    throw new Error("Test Sentry Backend - " + new Date().toISOString());
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur de test envoyée à Sentry !",
      error: error.message 
    });
  }
});
```

Puis visiter : `https://api.mbe-sdv.fr/api/test-sentry`

### 3.3 Vérifier dans Sentry Dashboard

1. **Aller sur [Sentry Dashboard](https://sentry.io)**
2. **Se connecter** avec votre compte
3. **Aller dans "Issues"** (menu de gauche)
4. **Vous devriez voir** :
   - Une nouvelle erreur avec le message "Test Sentry Frontend" ou "Test Sentry Backend"
   - La date et l'heure de l'erreur
   - Le contexte (navigateur, OS, URL, etc.)

5. **Cliquer sur l'erreur** pour voir les détails :
   - Stack trace complète
   - Informations sur l'environnement
   - Tags et contexte

---

## 📧 ÉTAPE 4 : Vérifier les Notifications Email

### 4.1 Vérifier les Paramètres de Notification dans Sentry

1. **Aller sur Sentry Dashboard**
2. **Cliquer sur votre nom** (en haut à droite) → **"User Settings"**
3. **Aller dans "Notifications"** (menu de gauche)
4. **Vérifier que** :
   - ✅ **"Email"** est activé
   - ✅ Votre adresse email est correcte et vérifiée
   - ✅ **"Alerts"** est activé pour "New Issues"

### 4.2 Configurer les Alertes par Projet

1. **Aller dans "Projects"** (menu de gauche)
2. **Sélectionner votre projet** (Frontend ou Backend)
3. **Aller dans "Settings"** → **"Alerts"**
4. **Vérifier que** :
   - ✅ **"Send notifications for new issues"** est activé
   - ✅ **"Send notifications for resolved issues"** (optionnel)
   - ✅ **"Send notifications for regression"** (optionnel)

### 4.3 Tester les Notifications

1. **Créer une nouvelle erreur de test** (voir section 3.1 ou 3.2)
2. **Attendre 1-2 minutes**
3. **Vérifier votre boîte email** (et les spams si nécessaire)
4. **Vous devriez recevoir un email** avec :
   - Le titre de l'erreur
   - Le projet concerné
   - Un lien vers le dashboard Sentry

---

## 🔍 ÉTAPE 5 : Vérifier que les Erreurs Réelles sont Capturées

### 5.1 Vérifier les Erreurs dans les Logs Railway

1. **Aller sur Railway Dashboard**
2. **Sélectionner votre service backend**
3. **Aller dans l'onglet "Logs"**
4. **Chercher des erreurs** (lignes rouges ou avec "Error", "Exception", etc.)
5. **Vérifier dans Sentry** si ces erreurs apparaissent

### 5.2 Vérifier les Erreurs dans la Console du Navigateur

1. **Aller sur votre site**
2. **Ouvrir la console** (F12)
3. **Chercher des erreurs** (lignes rouges)
4. **Vérifier dans Sentry** si ces erreurs apparaissent

### 5.3 Vérifier les Erreurs Non Capturées

Si vous voyez des erreurs dans les logs mais pas dans Sentry, cela peut être dû à :

1. **Sentry non initialisé** → Vérifier la section 2
2. **DSN incorrect** → Vérifier la section 1.1
3. **Erreurs filtrées** → Vérifier la fonction `beforeSend` dans l'initialisation
4. **Erreurs dans des try/catch sans `captureException`** → Ajouter `Sentry.captureException(error)`

---

## 🛠️ ÉTAPE 6 : Capturer les Erreurs Manuellement

Si certaines erreurs ne sont pas capturées automatiquement, vous pouvez les capturer manuellement :

### 6.1 Frontend : Capturer dans les try/catch

```typescript
import * as Sentry from "@sentry/react";

try {
  // Votre code qui peut échouer
  await someAsyncOperation();
} catch (error) {
  // Capturer l'erreur dans Sentry
  Sentry.captureException(error);
  // Afficher un message à l'utilisateur
  console.error("Une erreur s'est produite:", error);
}
```

### 6.2 Backend : Capturer dans les try/catch

```javascript
import * as Sentry from "@sentry/node";

try {
  // Votre code qui peut échouer
  await someAsyncOperation();
} catch (error) {
  // Capturer l'erreur dans Sentry
  Sentry.captureException(error);
  // Logger l'erreur
  console.error("Une erreur s'est produite:", error);
  // Retourner une réponse d'erreur
  res.status(500).json({ error: "Une erreur s'est produite" });
}
```

### 6.3 Capturer des Messages Personnalisés

```typescript
// Frontend
Sentry.captureMessage("Une action importante s'est produite", "info");

// Backend
Sentry.captureMessage("Une action importante s'est produite", "info");
```

---

## ✅ CHECKLIST DE VÉRIFICATION

- [ ] Variables d'environnement configurées (`VITE_SENTRY_DSN` et `SENTRY_DSN`)
- [ ] Packages Sentry installés (`@sentry/react` et `@sentry/node`)
- [ ] Sentry initialisé dans `main.tsx` (frontend)
- [ ] Sentry initialisé dans `ai-proxy.js` (backend)
- [ ] Handlers Sentry ajoutés dans Express (backend)
- [ ] Test frontend réussi (erreur visible dans Sentry)
- [ ] Test backend réussi (erreur visible dans Sentry)
- [ ] Notifications email activées dans Sentry
- [ ] Email de test reçu
- [ ] Erreurs réelles capturées dans Sentry

---

## 🚨 PROBLÈMES COURANTS ET SOLUTIONS

### Problème 1 : "Sentry n'envoie jamais d'emails"

**Solutions :**
1. Vérifier que votre email est vérifié dans Sentry
2. Vérifier les paramètres de notification (section 4.1)
3. Vérifier les spams
4. Vérifier que les alertes sont activées pour le projet (section 4.2)

### Problème 2 : "Les erreurs n'apparaissent pas dans Sentry"

**Solutions :**
1. Vérifier que Sentry est initialisé (section 2)
2. Vérifier que le DSN est correct (section 1.1)
3. Vérifier la console du navigateur pour des erreurs Sentry
4. Vérifier les logs Railway pour des erreurs Sentry
5. Vérifier que `beforeSend` ne retourne pas `null` pour toutes les erreurs

### Problème 3 : "Trop d'erreurs dans Sentry (bruit)"

**Solutions :**
1. Filtrer les erreurs dans `beforeSend` :
   ```typescript
   beforeSend(event, hint) {
     // Ignorer certaines erreurs
     if (event.message?.includes("ResizeObserver")) {
       return null; // Ne pas envoyer cette erreur
     }
     return event;
   }
   ```
2. Ajuster `tracesSampleRate` à `0.1` (10%) au lieu de `1.0` (100%)

### Problème 4 : "Sentry fonctionne en local mais pas en production"

**Solutions :**
1. Vérifier que les variables d'environnement sont bien définies dans Vercel/Railway
2. Redéployer après avoir ajouté les variables
3. Vérifier que le DSN commence bien par `https://`
4. Vérifier les logs de déploiement pour des erreurs

---

## 📚 RESSOURCES

- [Documentation Sentry React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Documentation Sentry Node.js](https://docs.sentry.io/platforms/node/)
- [Configuration des Notifications Sentry](https://docs.sentry.io/product/notifications/)

---

## 🎉 CONCLUSION

Une fois toutes ces étapes complétées, Sentry devrait :
- ✅ Capturer automatiquement les erreurs
- ✅ Vous envoyer des emails pour chaque nouvelle erreur
- ✅ Vous permettre de voir les détails des erreurs dans le dashboard

**N'oubliez pas de retirer les routes/boutons de test après avoir vérifié que tout fonctionne !**
