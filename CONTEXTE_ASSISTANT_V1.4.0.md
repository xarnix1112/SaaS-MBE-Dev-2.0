# 🤖 Contexte Assistant IA - QuoteFlow Pro v1.4.0

> Ce document enrichit le contexte de l'assistant IA pour les futures conversations.

---

## 📊 État du projet au 13 janvier 2026

### Version actuelle : **1.4.0**

**QuoteFlow Pro** est un SaaS B2B de gestion de devis avec :
- ✅ Stripe Connect OAuth (encaissement client direct)
- ✅ Paiements multiples par devis (principal + surcoûts)
- ✅ Système de notifications centralisé 🔔 (NOUVEAU v1.4.0)
- ✅ Webhook Stripe unique pour tous les comptes connectés
- ✅ Synchronisation Gmail bidirectionnelle
- ✅ Google Sheets sync
- ✅ Génération de bordereaux PDF

---

## 🗄️ Architecture Firestore

### Collections principales

#### 1. `clients`
```
{
  id: string
  name: string
  stripeAccountId?: string      // Compte Stripe Connect
  stripeConnected: boolean
  createdAt: Timestamp
}
```

#### 2. `quotes` (devis)
```
{
  id: string
  clientSaasId: string           // FK vers clients
  reference: string              // DEV-GS-001
  status: string                 // verified | awaiting_payment | shipped
  paymentStatus: string          // pending | partially_paid | paid
  clientFinalEmail: string
  history: Array<HistoryEvent>   // Timeline des événements
  ...
}
```

#### 3. `paiements`
```
{
  id: string
  devisId: string                // FK vers quotes
  clientSaasId: string           // FK vers clients
  stripeSessionId: string        // Checkout Session ID
  stripeCheckoutUrl: string      // URL du lien de paiement
  amount: number                 // En euros
  type: "PRINCIPAL" | "SURCOUT"
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED"
  description?: string
  createdAt: Timestamp
}
```

**Index requis :**
- `devisId` (Ascending) + `createdAt` (Descending)

#### 4. `notifications` 🆕 v1.4.0
```
{
  id: string
  clientSaasId: string           // Sécurité multi-tenant
  devisId?: string               // Optionnel
  type: NotificationType         // Voir types ci-dessous
  title: string                  // Ex: "Nouveau message client"
  message: string                // Ex: "Le client a répondu au devis DEV-GS-5"
  createdAt: Timestamp
}
```

**Index requis :**
- `clientSaasId` (Ascending) + `createdAt` (Descending)

**Types de notifications :**
- `NEW_MESSAGE` - Nouveau message client (Gmail Sync)
- `PAYMENT_RECEIVED` - Paiement reçu (Stripe webhook)
- `DEVIS_SENT` - Devis envoyé au client
- `DEVIS_PAID` - Devis entièrement payé
- `DEVIS_PARTIALLY_PAID` - Paiement partiel reçu
- `SURCOUT_CREATED` - Surcoût ajouté

#### 5. `emailMessages`
```
{
  id: string
  devisId: string
  userId: string
  from: string
  to: string
  subject: string
  body: string
  createdAt: Timestamp
  gmailMessageId?: string
}
```

**Index requis :**
- `devisId` (Ascending) + `userId` (Ascending) + `createdAt` (Descending)

---

## 🔐 Firestore Security Rules

```
match /notifications/{id} {
  allow read, delete: if request.auth.uid == resource.data.clientSaasId;
  allow create: if false; // Création uniquement via backend
}

match /paiements/{id} {
  allow read: if request.auth.uid == resource.data.clientSaasId;
  allow write: if false; // Gestion uniquement via backend
}

match /quotes/{id} {
  allow read: if request.auth.uid == resource.data.clientSaasId;
  allow write: if request.auth.uid == resource.data.clientSaasId;
}
```

---

## 🌐 Architecture serveur

### Serveur unique : `ai-proxy.js` (port 5174)

**Routes principales :**

#### Stripe Connect
- `POST /api/stripe/connect` - Génère URL OAuth
- `GET /stripe/callback` - Callback OAuth Stripe
- `GET /api/stripe/status` - Statut connexion
- `POST /api/stripe/disconnect` - Déconnexion

#### Paiements
- `POST /api/devis/:id/paiement` - Créer un paiement
- `GET /api/devis/:id/paiements` - Liste des paiements
- `POST /api/paiement/:id/cancel` - Annuler un paiement

#### Notifications 🆕 v1.4.0
- `GET /api/notifications?clientId=xxx` - Liste des notifications
- `GET /api/notifications/count?clientId=xxx` - Compteur
- `DELETE /api/notifications/:id` - Supprimer (marquer comme lu)

#### Webhook
- `POST /webhooks/stripe` - Webhook unique Stripe
  - Détecte automatiquement Stripe Connect vs Payment Links
  - Crée des notifications automatiquement

#### Gmail
- `GET /auth/gmail/start` - Démarrer OAuth Gmail
- `GET /auth/gmail/callback` - Callback OAuth Gmail
- `GET /api/email-accounts` - Liste des comptes
- `DELETE /api/email-accounts/:id` - Supprimer un compte
- `GET /api/devis/:devisId/messages` - Messages d'un devis

---

## 🎨 Architecture frontend (React + Vite)

### Composants clés

#### Notifications 🆕 v1.4.0
- `NotificationBell.tsx` - Cloche avec badge compteur
  - Polling 30 secondes via `useQuery`
  - Badge rouge si notifications > 0
  - Affiche "9+" si > 9
- `NotificationDrawer.tsx` - Panneau latéral
  - Liste scrollable des notifications
  - Icônes contextuelles par type
  - Date relative (date-fns)
  - Clic → Suppression + redirection

#### Paiements
- `QuotePaiements.tsx` - Gestion complète des paiements
  - Liste des paiements avec statuts
  - Bouton "Créer un paiement"
  - Bouton "Régénérer le lien" (annule l'ancien)
  - Total encaissé / total à payer
  - Polling automatique

#### Layout
- `AppHeader.tsx` - Header avec notifications
  - Intégration `NotificationBell` + `NotificationDrawer`
  - Wrapped dans `<Sheet>` (shadcn/ui)

### Hooks personnalisés

```typescript
// Notifications
useQuery({
  queryKey: ['notifications', clientId],
  queryFn: () => getNotifications(clientId),
})

useQuery({
  queryKey: ['notificationsCount', clientId],
  queryFn: () => getNotificationsCount(clientId),
  refetchInterval: 30000, // Polling 30s
})

useMutation({
  mutationFn: deleteNotification,
  onSuccess: () => {
    queryClient.invalidateQueries(['notifications']);
    queryClient.invalidateQueries(['notificationsCount']);
  }
})
```

---

## 🚀 Workflow de développement

### Démarrage
```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"
bash run-dev-mac.sh
```

Ce script lance automatiquement :
1. Backend (ai-proxy.js) sur port 5174
2. Stripe CLI (stripe listen → webhook local)
3. Vite dev server sur port 8080
4. Gmail sync (polling 60 secondes)

### Proxies configurés
- `vite.config.ts` : `/api`, `/stripe`, `/webhooks` → `http://localhost:5174`
- `dev-all.mjs` : Même configuration

---

## 🐛 Erreurs courantes et solutions

### 1. "Route non trouvée"
**Cause :** Serveur pas redémarré après ajout de routes  
**Solution :** Ctrl+C puis `bash run-dev-mac.sh`

### 2. "STRIPE_SECRET_KEY non définie"
**Cause :** `.env.local` pas chargé avant `stripe-connect.js`  
**Solution :** `dotenv.config()` ajouté dans le module

### 3. "404 sur /stripe/callback"
**Cause :** Proxy Vite pas configuré pour `/stripe`  
**Solution :** Proxy ajouté dans `vite.config.ts` et `dev-all.mjs`

### 4. "Devis non trouvé" (gs_xxx)
**Cause :** Collection `devis` au lieu de `quotes`  
**Solution :** Utiliser `firestore.collection('quotes')`

### 5. "Error: 9 FAILED_PRECONDITION" 🔥
**Cause :** Index Firestore composite manquant  
**Solution :**
1. Copier le lien fourni dans l'erreur
2. Ouvrir dans Firebase Console
3. Créer l'index
4. Attendre 2-5 minutes (statut "Enabled")

**Index requis pour v1.4.0 :**
- Collection `notifications` : `clientSaasId` (ASC) + `createdAt` (DESC)
- Collection `paiements` : `devisId` (ASC) + `createdAt` (DESC)
- Collection `emailMessages` : `devisId` (ASC) + `userId` (ASC) + `createdAt` (DESC)

📖 Voir `FIRESTORE_INDEXES.md` pour plus de détails

### 6. "Stripe Checkout error: business name required"
**Cause :** Compte Stripe Connect sans nom d'entreprise  
**Solution :** Définir "Business name" dans les paramètres du compte Stripe

### 7. "Total paiements cumulé après régénération"
**Cause :** Ancien lien pas marqué comme CANCELLED  
**Solution :** Appeler `/api/paiement/:id/cancel` avant de créer le nouveau

---

## 📝 Workflow de création de notification

### Backend (automatique)

```javascript
// Exemple : Paiement reçu (stripe-connect.js)
await createNotification(firestore, {
  clientSaasId: "dxHUjMCaJ0A7vFBiGNFR",
  devisId: "gs_xxx",
  type: "PAYMENT_RECEIVED",
  title: "Paiement reçu",
  message: `Le devis ${devis.reference} a été payé (${amount}€)`,
  createdAt: new Date()
});

// Exemple : Nouveau message (ai-proxy.js - Gmail Sync)
await createNotification(firestore, {
  clientSaasId: quote.clientSaasId,
  devisId: quote.id,
  type: "NEW_MESSAGE",
  title: "Nouveau message client",
  message: `Le client a répondu au devis ${quote.reference}`,
  createdAt: new Date()
});
```

### Frontend (automatique)

1. **Polling** : Le `NotificationBell` interroge l'API toutes les 30 secondes
2. **Badge** : Affiche le compteur de notifications
3. **Clic** : Ouvre le `NotificationDrawer`
4. **Affichage** : Liste scrollable avec icônes + dates relatives
5. **Interaction** : Clic sur notification
   - Supprime via `DELETE /api/notifications/:id`
   - Invalide le cache React Query
   - Redirige vers `/devis/:id?tab=messages` ou `?tab=paiements`

---

## 🧪 Tests recommandés

### Test notifications

1. **Créer une notification manuellement** (Firebase Console)
```json
{
  "clientSaasId": "dxHUjMCaJ0A7vFBiGNFR",
  "devisId": "gs_xxx",
  "type": "PAYMENT_RECEIVED",
  "title": "Test notification",
  "message": "Ceci est un test",
  "createdAt": Timestamp.now()
}
```

2. **Vérifier l'affichage**
- Badge cloche doit afficher "1"
- Cliquer sur la cloche → drawer s'ouvre
- Notification visible avec icône verte (💵)
- Cliquer dessus → redirection + suppression

3. **Vérifier le polling**
- Créer une 2e notification pendant que l'app est ouverte
- Attendre 30 secondes max
- Badge doit se mettre à jour automatiquement

### Test paiements

1. **Connecter Stripe** (Paramètres → Paiements)
2. **Créer un paiement** pour un devis
3. **Copier le lien** Stripe Checkout
4. **Payer en mode test** (carte `4242 4242 4242 4242`)
5. **Vérifier** :
   - Statut passe à "PAID"
   - Notification "Paiement reçu" créée
   - Timeline du devis mise à jour
   - Badge cloche incrémenté

---

## 📚 Documentation complète

### Fichiers principaux
- `README.md` - Guide général du projet
- `STRIPE_CONNECT_DOCUMENTATION.md` - Intégration Stripe complète
- `NOTIFICATIONS_SYSTEM.md` - Système de notifications (v1.4.0)
- `FIRESTORE_INDEXES.md` - Guide des index Firestore (v1.4.0)
- `AUTOMATISATION_PAIEMENT.md` - Pipeline automatique de paiement
- `CONTEXTE_FINAL.md` - Résumé de l'intégration Stripe Connect
- `CHANGELOG.md` - Historique des versions

### Scripts utiles
```bash
# Vérifier config Stripe
npm run stripe:check

# Initialiser Firestore avec données test
npm run stripe:init

# Vérifier compte Stripe connecté
node scripts/check-stripe-account.mjs

# Tester mise à jour paiement
node scripts/test-webhook-update.mjs
```

---

## 🔮 Évolutions futures

### Planifiées
- [ ] Résumé quotidien par email (base notifications existante)
- [ ] Notification push (service worker)
- [ ] Filtre par type de notification
- [ ] Marquer tout comme lu

### Architecture prête pour
- ✅ Multi-tenant complet (clientSaasId partout)
- ✅ Webhooks à l'échelle (compte unique)
- ✅ Notifications extensibles (types modulaires)
- ✅ Analytics (tous les événements loggés)

---

## 🚨 Points d'attention pour l'assistant

### Toujours vérifier
1. **Index Firestore** : Avant toute requête `where()` + `orderBy()` sur champs différents
2. **clientSaasId** : Présent dans toutes les collections multi-tenant
3. **Redémarrage serveur** : Après ajout de routes backend
4. **Proxy Vite** : Routes `/api`, `/stripe`, `/webhooks` configurées
5. **Environment vars** : `.env.local` chargé avec `dotenv.config()`

### Conventions du projet
- **Collections Firestore** : `quotes`, `paiements`, `notifications`, `emailMessages`, `clients`
- **Port backend** : 5174 (ai-proxy.js)
- **Port frontend** : 8080 (Vite)
- **Client test** : `dxHUjMCaJ0A7vFBiGNFR`
- **Statuts paiement** : `PENDING` → `PAID` / `FAILED` / `CANCELLED`
- **Statuts devis** : `to_verify` → `verified` → `awaiting_payment` → `shipped`

### Git workflow
```bash
git add -A
git commit -m "feat: Description"
# PAS de git push automatique (attendre demande explicite de Clément)
```

---

## 📦 Dépendances importantes

### Backend
- `express` - Serveur web
- `stripe` - API Stripe
- `firebase-admin` - Firestore
- `dotenv` - Variables d'environnement
- `googleapis` - Gmail API

### Frontend
- `react` + `vite` - Framework
- `@tanstack/react-query` - State management + polling
- `lucide-react` - Icônes
- `date-fns` - Formatage dates
- `shadcn/ui` - Composants UI (Sheet, Badge, Button, etc.)

---

**Date de création :** 13 janvier 2026  
**Version :** 1.4.0  
**Auteur :** Assistant IA + Clément  
**Statut :** ✅ Contexte complet et à jour

