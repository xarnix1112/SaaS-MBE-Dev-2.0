# 🚀 Optimisation des Quotas Firestore

## 📊 Problème Identifié

L'application dépassait les quotas Firestore gratuits (50 000 lectures/jour) à cause de :

1. **Polling trop fréquent** : Gmail (60s), Google Sheets (90s), Notifications (30s)
2. **Lectures non optimisées** : Lecture de TOUS les `saasAccounts` à chaque synchronisation
3. **Pas de cache** : Chaque requête API lisait le document `users` pour récupérer le `saasAccountId`

### Erreur Observée

```
Error: 8 RESOURCE_EXHAUSTED: Quota exceeded.
```

Cette erreur apparaissait lors de :
- `Gmail Sync`
- `requireAuth` middleware (lors de chaque appel API)
- `/api/notifications/count`
- Divers appels API (`/api/stripe/status`, `/api/email-accounts`, `/api/google-sheets/status`, `/api/google-drive/status`, `/api/cartons`)

---

## ✅ Optimisations Appliquées

### 1. **Cache en Mémoire pour `requireAuth`**

**Avant** : Chaque requête API lisait Firestore pour récupérer le `saasAccountId`

**Après** : Mise en cache du `saasAccountId` pendant 5 minutes

**Impact** : 
- Réduction de ~90% des lectures Firestore pour les utilisateurs actifs
- Si un utilisateur fait 100 requêtes API en 5 minutes, on passe de 100 lectures à 1 lecture

**Fichier modifié** : `front end/server/ai-proxy.js`

```javascript
// Cache en mémoire pour éviter de lire Firestore à chaque requête
// Structure: { uid: { saasAccountId, timestamp } }
// TTL: 5 minutes
const saasAccountCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function requireAuth(req, res, next) {
  // ...
  // Vérifier le cache d'abord
  const cached = saasAccountCache.get(decodedToken.uid);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    // Utiliser le cache
    req.saasAccountId = cached.saasAccountId;
    return next();
  }
  
  // Cache expiré ou inexistant, lire Firestore et mettre en cache
  // ...
}
```

---

### 2. **Augmentation des Intervalles de Polling Backend**

**Avant** :
- Gmail Sync : toutes les 60 secondes
- Google Sheets Sync : toutes les 90 secondes

**Après** :
- Gmail Sync : toutes les 5 minutes (300 secondes)
- Google Sheets Sync : toutes les 5 minutes (300 secondes)

**Impact** :
- Gmail : Réduction de 80% des synchronisations (de 1440/jour à 288/jour)
- Google Sheets : Réduction de 70% des synchronisations (de 960/jour à 288/jour)

**Fichier modifié** : `front end/server/ai-proxy.js`

```javascript
// Gmail Sync
if (firestore && oauth2Client) {
  console.log('[Gmail Sync] ✅ Polling Gmail activé (toutes les 5 minutes)');
  setInterval(syncAllEmailAccounts, 300_000); // 5 minutes au lieu de 60 secondes
  setTimeout(syncAllEmailAccounts, 30_000);
}

// Google Sheets Sync
if (firestore && googleSheetsOAuth2Client) {
  console.log('[Google Sheets Sync] ✅ Polling Google Sheets activé (toutes les 5 minutes)');
  setInterval(syncAllGoogleSheets, 300_000); // 5 minutes au lieu de 90 secondes
  setTimeout(syncAllGoogleSheets, 30_000);
}
```

---

### 3. **Requêtes Firestore Filtrées pour les Synchronisations**

**Avant** : Lecture de TOUS les `saasAccounts`, puis filtrage en JavaScript

**Après** : Utilisation de `where()` pour ne lire que les comptes avec intégrations actives

**Impact** :
- Si 10 comptes SaaS existent mais seulement 2 ont Gmail connecté, on passe de 10 lectures à 2 lectures par synchronisation
- Réduction de ~80% des lectures pour les synchronisations

**Fichier modifié** : `front end/server/ai-proxy.js`

```javascript
// Gmail Sync
async function syncAllEmailAccounts() {
  // Avant: const saasAccounts = await firestore.collection('saasAccounts').get();
  
  // Après: Requête filtrée
  const saasAccounts = await firestore.collection('saasAccounts')
    .where('integrations.gmail.connected', '==', true)
    .get();
  // ...
}

// Google Sheets Sync
async function syncAllGoogleSheets() {
  // Avant: const saasAccounts = await firestore.collection('saasAccounts').get();
  
  // Après: Requête filtrée
  const saasAccounts = await firestore.collection('saasAccounts')
    .where('integrations.googleSheets.connected', '==', true)
    .get();
  // ...
}
```

---

### 4. **Augmentation de l'Intervalle de Polling Frontend (Notifications)**

**Avant** : Polling toutes les 30 secondes

**Après** : Polling toutes les 2 minutes (120 secondes)

**Impact** :
- Réduction de 75% des appels API pour les notifications (de 2880/jour à 720/jour)

**Fichier modifié** : `front end/src/components/notifications/NotificationBell.tsx`

```javascript
useEffect(() => {
  loadCount();

  // OPTIMISATION: Augmenter l'intervalle de polling pour réduire les requêtes API
  // Passer de 30 secondes à 2 minutes (120 secondes)
  const interval = setInterval(loadCount, 120000);

  return () => clearInterval(interval);
}, [loadCount]);
```

---

## 📈 Impact Global

### Estimation des Lectures Firestore par Jour

**Avant Optimisation** :

| Source | Fréquence | Lectures/Sync | Total/Jour |
|--------|-----------|---------------|------------|
| Gmail Sync | 60s | 10 saasAccounts | 14 400 |
| Google Sheets Sync | 90s | 10 saasAccounts | 9 600 |
| requireAuth (100 req/jour/user, 5 users) | - | 1 | 500 |
| Notifications Count (1 user actif) | 30s | 1 | 2 880 |
| **TOTAL** | - | - | **27 380** |

**Après Optimisation** :

| Source | Fréquence | Lectures/Sync | Total/Jour |
|--------|-----------|---------------|------------|
| Gmail Sync | 300s | 2 saasAccounts (filtrés) | 576 |
| Google Sheets Sync | 300s | 2 saasAccounts (filtrés) | 576 |
| requireAuth (100 req/jour/user, 5 users) | Cache 5min | 0.1 (cache hit 90%) | 50 |
| Notifications Count (1 user actif) | 120s | 1 | 720 |
| **TOTAL** | - | - | **1 922** |

### Réduction Totale

- **Avant** : ~27 380 lectures/jour
- **Après** : ~1 922 lectures/jour
- **Réduction** : **93% de lectures en moins** 🎉

---

## 🔍 Monitoring

Pour surveiller l'utilisation des quotas Firestore :

1. **Console Firebase** : [https://console.firebase.google.com](https://console.firebase.google.com)
   - Aller dans **Firestore Database** > **Usage**
   - Vérifier les lectures/écritures quotidiennes

2. **Logs Backend** : Les synchronisations affichent maintenant le nombre de comptes synchronisés
   ```
   [Gmail Sync] ✅ Synchronisation de 2 compte(s) SaaS avec Gmail terminée
   [Google Sheets Sync] ✅ Synchronisation de 2 compte(s) SaaS avec Google Sheets terminée
   ```

3. **Cache Hits** : Décommenter la ligne dans `requireAuth` pour voir les cache hits
   ```javascript
   console.log(`[requireAuth] 🚀 Cache hit pour uid: ${decodedToken.uid}`);
   ```

---

## 🚨 Prochaines Étapes (si nécessaire)

Si les quotas sont encore dépassés :

1. **Passer au plan Blaze (Pay-as-you-go)** :
   - 50 000 lectures/jour gratuites
   - $0.06 pour 100 000 lectures supplémentaires
   - Recommandé pour une application en production

2. **Optimisations Supplémentaires** :
   - Augmenter le TTL du cache `requireAuth` à 15 minutes
   - Réduire encore la fréquence des synchronisations (10 minutes au lieu de 5)
   - Implémenter un système de webhooks au lieu de polling (Gmail Push Notifications, Google Sheets API Watch)

3. **Index Firestore** :
   - Créer des index composites pour les requêtes filtrées :
     - `saasAccounts` : `integrations.gmail.connected` (ASC)
     - `saasAccounts` : `integrations.googleSheets.connected` (ASC)

---

## ✅ Checklist de Vérification

- [x] Cache `requireAuth` implémenté avec TTL de 5 minutes
- [x] Gmail Sync : intervalle passé à 5 minutes
- [x] Google Sheets Sync : intervalle passé à 5 minutes
- [x] Gmail Sync : requête filtrée sur `integrations.gmail.connected`
- [x] Google Sheets Sync : requête filtrée sur `integrations.googleSheets.connected`
- [x] Notifications Count : intervalle passé à 2 minutes
- [x] Documentation créée

---

## 📚 Ressources

- [Firestore Quotas & Limits](https://firebase.google.com/docs/firestore/quotas)
- [Firestore Pricing](https://firebase.google.com/pricing)
- [Best Practices for Firestore](https://firebase.google.com/docs/firestore/best-practices)

---

**Date de mise à jour** : 19 janvier 2026  
**Version** : 1.6.1

