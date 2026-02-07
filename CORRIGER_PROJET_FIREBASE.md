# 🔧 Correction - Projet Firebase Incorrect

**Date :** 5 février 2026  
**Problème :** L'application utilise `sdv-automation-mbe` au lieu de `sdv-automation-mbe-production`

---

## ⚠️ Problème Identifié

1. **L'application se connecte au mauvais projet Firebase** : `sdv-automation-mbe` au lieu de `sdv-automation-mbe-production`
2. **Les règles Firestore sont déployées sur le projet de production**, pas sur le projet de développement
3. **Vous arrivez sur `/setup-mbe`** parce qu'il y a une session Firebase persistante pour `zUWaigdSisakUVcmLp9BswbZgr22`, mais comme l'application se connecte au mauvais projet, elle ne peut pas lire le document user (erreur de permissions), donc `userDoc` est `null` et l'application pense que le setup n'est pas terminé.

---

## 🔍 Pourquoi Vous Arrivez sur `/setup-mbe` ?

**Explication technique :**

1. **Session Firebase persistante** : Votre navigateur a une session Firebase active pour l'utilisateur `zUWaigdSisakUVcmLp9BswbZgr22`
2. **Mauvais projet Firebase** : L'application se connecte à `sdv-automation-mbe` au lieu de `sdv-automation-mbe-production`
3. **Erreur de permissions** : Comme les règles Firestore sont déployées sur le projet de production, l'application ne peut pas lire le document `users/zUWaigdSisakUVcmLp9BswbZgr22` dans le projet de développement
4. **Redirection automatique** : Comme `userDoc` est `null` et `isSetupComplete` est `false`, l'application redirige vers `/setup-mbe` (voir `HomeRedirect.tsx` ligne 40-41 et `Welcome.tsx` ligne 42-46)

---

## ✅ Solution : Mettre à Jour la Configuration Firebase

### Étape 1 : Récupérer les Valeurs du Projet de Production

**Allez sur Firebase Console :**
```
https://console.firebase.google.com/project/sdv-automation-mbe-production/settings/general
```

**Notez les valeurs suivantes :**
- **Project ID** : `sdv-automation-mbe-production` (ou le nom exact de votre projet)
- **API Key** : (dans "Vos applications" → Web app → Clé API)
- **Auth Domain** : `sdv-automation-mbe-production.firebaseapp.com`
- **Storage Bucket** : `sdv-automation-mbe-production.firebasestorage.app`
- **Messaging Sender ID** : (dans "Vos applications" → Web app)
- **App ID** : (dans "Vos applications" → Web app)
- **Measurement ID** : (dans "Vos applications" → Web app → Google Analytics)

### Étape 2 : Mettre à Jour `.env.local`

**Ouvrez le fichier :** `front end/.env.local`

**Remplacez les valeurs Firebase par celles du projet de production :**

```env
# ==========================================
# FIREBASE CONFIGURATION (PRODUCTION)
# ==========================================
VITE_FIREBASE_API_KEY=VOTRE_CLE_API_PRODUCTION
VITE_FIREBASE_AUTH_DOMAIN=sdv-automation-mbe-production.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sdv-automation-mbe-production
VITE_FIREBASE_STORAGE_BUCKET=sdv-automation-mbe-production.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=VOTRE_SENDER_ID_PRODUCTION
VITE_FIREBASE_APP_ID=VOTRE_APP_ID_PRODUCTION
VITE_FIREBASE_MEASUREMENT_ID=VOTRE_MEASUREMENT_ID_PRODUCTION
FIREBASE_PROJECT_ID=sdv-automation-mbe-production
```

**⚠️ IMPORTANT :** Remplacez `VOTRE_CLE_API_PRODUCTION`, `VOTRE_SENDER_ID_PRODUCTION`, etc. par les vraies valeurs de votre projet de production.

### Étape 3 : Mettre à Jour `.firebaserc`

**Ouvrez le fichier :** `.firebaserc` (à la racine du projet)

**Remplacez par :**

```json
{
  "projects": {
    "default": "sdv-automation-mbe-production"
  },
  "targets": {},
  "etags": {}
}
```

### Étape 4 : Vider le Cache et Redémarrer

**1. Vider le cache du navigateur :**
   - Ouvrez les outils de développement (F12)
   - Clic droit sur le bouton de rechargement
   - Sélectionnez "Vider le cache et effectuer un rechargement forcé"

**2. Vider le localStorage (optionnel mais recommandé) :**
   - Dans la console du navigateur (F12), tapez :
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

**3. Redémarrer le serveur de développement :**
   ```bash
   # Arrêter le serveur (Ctrl+C)
   # Puis relancer
   cd "front end"
   npm run dev
   ```

### Étape 5 : Tester la Connexion

1. **Allez sur** `http://localhost:5174` (ou votre URL locale)
2. **Vous devriez arriver sur `/welcome`** (pas `/setup-mbe`)
3. **Connectez-vous** avec votre compte
4. **Vous devriez être redirigé vers `/dashboard`** si votre compte est configuré

---

## 🆘 Si Vous Arrivez Toujours sur `/setup-mbe`

### Solution 1 : Déconnecter l'Utilisateur

**Dans la console du navigateur (F12), tapez :**
```javascript
// Déconnecter l'utilisateur Firebase
import { auth, signOut } from './src/lib/firebase';
signOut(auth).then(() => {
  localStorage.clear();
  sessionStorage.clear();
  location.href = '/welcome';
});
```

**Ou manuellement :**
1. Ouvrez les outils de développement (F12)
2. Onglet "Application" → "Local Storage" → `http://localhost:5174`
3. Supprimez toutes les clés qui commencent par `firebase:`
4. Rechargez la page

### Solution 2 : Vérifier que le Document User Existe dans le Projet de Production

**Allez sur Firebase Console :**
```
https://console.firebase.google.com/project/sdv-automation-mbe-production/firestore/data
```

**Vérifiez que le document `users/zUWaigdSisakUVcmLp9BswbZgr22` existe** dans le projet de production (pas dans le projet de développement).

**Si le document n'existe pas dans le projet de production :**
- Vous devez créer le document user dans le projet de production
- Ou migrer les données du projet de développement vers le projet de production

---

## 📋 Checklist de Vérification

- [ ] Les valeurs Firebase dans `.env.local` correspondent au projet de production
- [ ] Le fichier `.firebaserc` utilise le projet de production
- [ ] Le cache du navigateur a été vidé
- [ ] Le localStorage a été vidé (si nécessaire)
- [ ] Le serveur de développement a été redémarré
- [ ] Le document `users/zUWaigdSisakUVcmLp9BswbZgr22` existe dans le projet de production
- [ ] Les règles Firestore sont déployées sur le projet de production
- [ ] Les restrictions API incluent "Cloud Firestore API" pour la clé API de production

---

## 🔗 Liens Utiles

- **Firebase Console - Production :** https://console.firebase.google.com/project/sdv-automation-mbe-production
- **Firebase Console - Settings :** https://console.firebase.google.com/project/sdv-automation-mbe-production/settings/general
- **Firestore Data :** https://console.firebase.google.com/project/sdv-automation-mbe-production/firestore/data
- **Firestore Rules :** https://console.firebase.google.com/project/sdv-automation-mbe-production/firestore/rules

---

**Action Immédiate :** Mettez à jour `.env.local` et `.firebaserc` avec les valeurs du projet de production, puis videz le cache et redémarrez l'application.
