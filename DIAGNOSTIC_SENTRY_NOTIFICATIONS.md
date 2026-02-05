# Diagnostic : Pourquoi les Notifications Sentry ne Fonctionnent Pas

## 🔍 Problème

Vous avez lancé une erreur de test dans la console mais n'avez pas reçu de notification email de Sentry.

---

## ✅ ÉTAPE 1 : Vérifier que Sentry est Initialisé

### 1.1 Vérifier dans la Console du Navigateur

1. **Ouvrir la console** (F12 → Console)
2. **Recharger la page** (F5)
3. **Chercher ces messages** :
   - ✅ `[Sentry] ✅ Sentry initialisé pour le frontend` → **Sentry est initialisé**
   - ⚠️ `[Sentry] ⚠️  VITE_SENTRY_DSN non configuré, Sentry désactivé` → **Problème : variable manquante**

### 1.2 Si vous voyez le message d'avertissement

**Problème :** La variable `VITE_SENTRY_DSN` n'est pas configurée dans Vercel.

**Solution :**
1. Aller sur [Vercel Dashboard](https://vercel.com)
2. Sélectionner votre projet frontend
3. **Settings** → **Environment Variables**
4. Vérifier que `VITE_SENTRY_DSN` existe
5. Si elle n'existe pas, l'ajouter avec votre DSN Sentry
6. **Redéployer** le projet (Deployments → Redeploy)

---

## ✅ ÉTAPE 2 : Vérifier que l'Erreur est Envoyée à Sentry

### 2.1 Vérifier dans le Dashboard Sentry

**Important :** Les notifications email ne sont envoyées que si l'erreur apparaît dans Sentry Dashboard.

1. **Aller sur [Sentry Dashboard](https://sentry.io)**
2. **Se connecter** avec votre compte
3. **Aller dans "Issues"** (menu de gauche)
4. **Chercher** une erreur avec le message "Test Sentry Frontend"

**Si vous voyez l'erreur dans Sentry :**
- ✅ L'erreur est bien capturée
- ➡️ Passer à l'ÉTAPE 3 (vérifier les notifications)

**Si vous NE voyez PAS l'erreur dans Sentry :**
- ❌ L'erreur n'est pas envoyée à Sentry
- ➡️ Voir la section "Problèmes Courants" ci-dessous

### 2.2 Test Amélioré avec Logs

Dans la console du navigateur, taper :

```javascript
// Test Sentry avec capture explicite
import('https://cdn.jsdelivr.net/npm/@sentry/browser@10.38.0/build/bundle.min.js').then(Sentry => {
  Sentry.init({
    dsn: 'VOTRE_DSN_ICI', // Remplacer par votre DSN
  });
  Sentry.captureException(new Error("Test Sentry Frontend - " + new Date().toISOString()));
  console.log("✅ Erreur envoyée à Sentry");
});
```

**OU** utiliser directement dans la console (si Sentry est déjà initialisé) :

```javascript
// Vérifier que Sentry est disponible
if (window.Sentry || window.__SENTRY__) {
  console.log("✅ Sentry est disponible");
  // Capturer une erreur
  throw new Error("Test Sentry Frontend - " + new Date().toISOString());
} else {
  console.error("❌ Sentry n'est pas disponible");
}
```

---

## ✅ ÉTAPE 3 : Vérifier les Notifications Email dans Sentry

### 3.1 Vérifier les Paramètres Utilisateur

1. **Aller sur [Sentry Dashboard](https://sentry.io)**
2. **Cliquer sur votre nom** (en haut à droite) → **"User Settings"**
3. **Aller dans "Notifications"** (menu de gauche)
4. **Vérifier que** :
   - ✅ **"Email"** est activé (toggle vert)
   - ✅ Votre adresse email est correcte et **vérifiée** (icône de vérification ✅)
   - ✅ **"Alerts"** est activé pour "New Issues"

### 3.2 Vérifier les Paramètres du Projet

1. **Aller dans "Projects"** (menu de gauche)
2. **Sélectionner votre projet Frontend**
3. **Aller dans "Settings"** → **"Alerts"**
4. **Vérifier que** :
   - ✅ **"Send notifications for new issues"** est activé
   - ✅ **"Notify me about new issues"** est coché

### 3.3 Vérifier les Filtres de Notification

1. **Toujours dans "Settings"** → **"Alerts"** du projet
2. **Vérifier les filtres** :
   - Aucun filtre qui pourrait bloquer les notifications
   - Vérifier les "Alert Rules" (règles d'alerte)

---

## ✅ ÉTAPE 4 : Test Complet avec Vérification

### 4.1 Test avec Capture Explicite

Dans la console du navigateur, utiliser `Sentry.captureException()` au lieu de `throw` :

```javascript
// Vérifier d'abord que Sentry est initialisé
console.log("VITE_SENTRY_DSN:", import.meta.env.VITE_SENTRY_DSN ? "✅ Configuré" : "❌ Non configuré");

// Capturer une erreur explicitement
if (window.Sentry) {
  window.Sentry.captureException(new Error("Test Sentry Frontend - " + new Date().toISOString()));
  console.log("✅ Erreur envoyée via captureException()");
} else {
  console.error("❌ Sentry n'est pas disponible dans window.Sentry");
}
```

### 4.2 Vérifier les Requêtes Réseau

1. **Ouvrir l'onglet "Network"** dans les DevTools (F12 → Network)
2. **Filtrer par "sentry"** ou "ingest.sentry.io"
3. **Lancer l'erreur de test**
4. **Vérifier qu'une requête POST** vers `https://xxx.ingest.sentry.io/api/xxx/envelope/` apparaît
   - ✅ Si vous voyez la requête → L'erreur est envoyée à Sentry
   - ❌ Si vous ne voyez pas la requête → L'erreur n'est pas envoyée

---

## 🚨 PROBLÈMES COURANTS ET SOLUTIONS

### Problème 1 : "VITE_SENTRY_DSN non configuré"

**Symptôme :** Message dans la console `[Sentry] ⚠️  VITE_SENTRY_DSN non configuré`

**Solution :**
1. Vérifier que `VITE_SENTRY_DSN` est configurée dans Vercel
2. Redéployer le projet après avoir ajouté la variable
3. Vérifier que la variable commence bien par `https://`

### Problème 2 : L'erreur n'apparaît pas dans Sentry Dashboard

**Causes possibles :**
1. **Sentry non initialisé** → Vérifier la console (ÉTAPE 1)
2. **DSN incorrect** → Vérifier que le DSN dans Vercel correspond à celui de Sentry
3. **Erreur filtrée** → Vérifier la fonction `beforeSend` dans `main.tsx`
4. **Mode développement** → En dev, certaines erreurs peuvent être filtrées

**Solution :**
- Vérifier les logs de la console pour voir si Sentry est initialisé
- Vérifier les requêtes réseau (ÉTAPE 4.2)
- Vérifier que `beforeSend` ne retourne pas `null` pour toutes les erreurs

### Problème 3 : L'erreur apparaît dans Sentry mais pas de notification email

**Causes possibles :**
1. **Notifications désactivées** → Vérifier ÉTAPE 3
2. **Email non vérifié** → Vérifier que votre email est vérifié dans Sentry
3. **Filtres de notification** → Vérifier les alert rules
4. **Email dans les spams** → Vérifier votre dossier spam

**Solution :**
- Vérifier tous les paramètres de notification (ÉTAPE 3)
- Vérifier les spams
- Tester avec une autre adresse email

### Problème 4 : Erreurs de développement filtrées

**Symptôme :** Les erreurs en local fonctionnent mais pas en production

**Solution :**
Dans `front end/src/main.tsx`, vérifier la fonction `beforeSend` :

```typescript
beforeSend(event, hint) {
  if (import.meta.env.DEV) {
    console.log("[Sentry] Erreur capturée (mode dev):", event);
    // Si cette ligne est décommentée, les erreurs dev ne sont pas envoyées :
    // return null; // ← Vérifier que cette ligne est commentée
  }
  return event; // ← S'assurer que cette ligne retourne l'événement
}
```

---

## 🧪 TEST COMPLET RECOMMANDÉ

### Test Étape par Étape

1. **Vérifier l'initialisation** (Console → chercher `[Sentry] ✅`)
2. **Vérifier la variable** (Console → `import.meta.env.VITE_SENTRY_DSN`)
3. **Capturer une erreur** (Console → `throw new Error("Test")`)
4. **Vérifier les requêtes réseau** (Network → filtrer "sentry")
5. **Vérifier dans Sentry Dashboard** (Issues → chercher l'erreur)
6. **Vérifier les notifications** (Email → vérifier spams)

---

## 📋 CHECKLIST DE DIAGNOSTIC

- [ ] Console affiche `[Sentry] ✅ Sentry initialisé pour le frontend`
- [ ] Variable `VITE_SENTRY_DSN` configurée dans Vercel
- [ ] Projet redéployé après configuration de la variable
- [ ] Erreur de test lancée dans la console
- [ ] Requête POST vers `ingest.sentry.io` visible dans Network
- [ ] Erreur visible dans Sentry Dashboard (Issues)
- [ ] Notifications email activées dans User Settings
- [ ] Email vérifié dans Sentry
- [ ] Alertes activées pour le projet
- [ ] Email vérifié dans les spams

---

## 🆘 SI RIEN NE FONCTIONNE

1. **Vérifier le DSN** : Copier le DSN depuis Sentry Dashboard et le coller dans Vercel
2. **Tester avec un autre projet Sentry** : Créer un nouveau projet de test
3. **Vérifier la console complète** : Chercher toutes les erreurs liées à Sentry
4. **Contacter le support Sentry** : [Sentry Support](https://sentry.zendesk.com/hc/en-us/)

---

## 💡 ASTUCE : Test Rapide

Pour tester rapidement si Sentry fonctionne, ajouter temporairement dans `main.tsx` :

```typescript
// Test Sentry au chargement (TEMPORAIRE - À RETIRER)
if (import.meta.env.VITE_SENTRY_DSN) {
  setTimeout(() => {
    Sentry.captureException(new Error("Test automatique Sentry - " + new Date().toISOString()));
  }, 2000);
}
```

Puis recharger la page et vérifier dans Sentry Dashboard.
