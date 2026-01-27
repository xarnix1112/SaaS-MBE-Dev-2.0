# 🔐 Isolation Multi-Tenant - Gmail & Stripe Connect

## Vue d'ensemble

Ce document décrit l'implémentation de l'isolation complète des intégrations Gmail et Stripe Connect par compte SaaS (`saasAccountId`). Chaque compte MBE a désormais ses propres intégrations, complètement isolées des autres comptes.

## 🎯 Problème résolu

**Avant** : Les intégrations Gmail et Stripe étaient partagées entre tous les comptes. Quand un utilisateur se connectait avec un compte différent, il voyait les mêmes intégrations Gmail/Stripe que le compte précédent.

**Après** : Chaque compte SaaS a ses propres intégrations, complètement isolées. Un utilisateur ne voit que ses propres connexions Gmail et Stripe.

## 🏗️ Architecture

### Structure Firestore

```
saasAccounts/{saasAccountId}
  ├── mbeNumber: string
  ├── commercialName: string
  ├── email: string
  ├── ...
  └── integrations
      ├── gmail
      │   ├── connected: boolean
      │   ├── email: string
      │   ├── accessToken: string
      │   ├── refreshToken: string
      │   ├── expiresAt: Date
      │   ├── lastHistoryId: string
      │   └── lastSyncAt: Date
      └── stripe
          ├── connected: boolean
          ├── stripeAccountId: string (acct_xxx)
          └── connectedAt: Date
```

### Flux d'authentification

1. **Frontend** : Utilisateur connecté via Firebase Auth
2. **Middleware `requireAuth`** : Extrait `saasAccountId` depuis `users/{uid}.saasAccountId`
3. **Backend** : Toutes les opérations utilisent `req.saasAccountId` pour isoler les données

## 🔧 Modifications Backend

### 1. Middleware `requireAuth` (ai-proxy.js)

```javascript
async function requireAuth(req, res, next) {
  // Vérifie le token Firebase
  const decodedToken = await auth.verifyIdToken(token);
  req.uid = decodedToken.uid;
  
  // Récupère le saasAccountId depuis users/{uid}
  const userDoc = await firestore.collection('users').doc(decodedToken.uid).get();
  req.saasAccountId = userDoc.data().saasAccountId;
  
  next();
}
```

**Résultat** : `req.saasAccountId` est disponible dans toutes les routes protégées.

### 2. Gmail OAuth

#### Route `/auth/gmail/start`
- **Avant** : Route publique, utilisait `CURRENT_USER_ID` hardcodé
- **Après** : Route protégée avec `requireAuth`, passe `saasAccountId` dans le `state` OAuth
- **Retour** : JSON avec `{ url: "https://accounts.google.com/..." }` au lieu de redirection directe

#### Route `/auth/gmail/callback`
- **Avant** : Stockait dans `emailAccounts` avec `userId: CURRENT_USER_ID`
- **Après** : Stocke dans `saasAccounts/{saasAccountId}/integrations/gmail`
- **Récupère** : `saasAccountId` depuis `req.query.state`

#### Route `/api/email-accounts`
- **Avant** : Récupérait tous les comptes avec `userId: CURRENT_USER_ID`
- **Après** : Récupère uniquement le compte Gmail du `saasAccountId` connecté

#### Polling Gmail
- **Avant** : Itérait sur `emailAccounts` avec `userId: CURRENT_USER_ID`
- **Après** : Itère sur tous les `saasAccounts` et synchronise uniquement ceux avec `integrations.gmail.connected === true`
- **Stockage messages** : Chaque message stocké avec `saasAccountId` pour isolation

### 3. Stripe Connect

#### Route `/api/stripe/connect`
- **Avant** : Utilisait `clientId` passé en body/query
- **Après** : Utilise `req.saasAccountId` depuis le middleware
- **State OAuth** : Passe `saasAccountId` dans le `state` pour le callback

#### Route `/stripe/callback`
- **Avant** : Stockait dans `clients/{clientId}` avec `stripeAccountId`
- **Après** : Stocke dans `saasAccounts/{saasAccountId}/integrations/stripe`
- **Récupère** : `saasAccountId` depuis `req.query.state`

#### Route `/api/stripe/status`
- **Avant** : Récupérait depuis `clients/{clientId}`
- **Après** : Récupère depuis `saasAccounts/{saasAccountId}/integrations/stripe`

#### Route `/api/stripe/disconnect`
- **Avant** : Supprimait `stripeAccountId` dans `clients/{clientId}`
- **Après** : Supprime `integrations.stripe` dans `saasAccounts/{saasAccountId}`

#### `handleCreatePaiement`
- **Avant** : Cherchait le premier client avec Stripe connecté
- **Après** : Utilise `req.saasAccountId` ou `devis.saasAccountId`
- **Metadata** : Passe `saasAccountId` dans les metadata de la Checkout Session

#### Webhook Stripe
- **Avant** : Cherchait le client par `stripeAccountId` dans `clients`
- **Après** : Utilise `saasAccountId` depuis `event.data.object.metadata.saasAccountId`
- **Vérification** : Vérifie que le `stripeAccountId` correspond au compte SaaS

## 🎨 Modifications Frontend

### 1. Utilitaire `authenticatedFetch` (lib/api.ts)

```typescript
export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = await getAuthToken(); // Récupère le token Firebase
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
}
```

**Usage** : Toutes les requêtes API passent automatiquement le token Firebase.

### 2. Stripe Connect (lib/stripeConnect.ts)

**Avant** :
```typescript
export async function connectStripe(clientId: string): Promise<string>
export async function getStripeStatus(clientId: string): Promise<StripeStatusResponse>
export async function disconnectStripe(clientId: string): Promise<void>
```

**Après** :
```typescript
export async function connectStripe(): Promise<string> // Plus besoin de clientId
export async function getStripeStatus(): Promise<StripeStatusResponse>
export async function disconnectStripe(): Promise<void>
```

**Changement** : Utilise `authenticatedFetch` pour passer automatiquement le token, le backend récupère `saasAccountId` depuis le token.

### 3. Settings (pages/Settings.tsx)

**Gmail** :
- Utilise `authenticatedFetch` pour appeler `/auth/gmail/start`
- Récupère l'URL OAuth depuis la réponse JSON
- Redirige vers cette URL

**Stripe** :
- Plus besoin de passer `CLIENT_ID` hardcodé
- Utilise les nouvelles fonctions sans paramètre `clientId`

### 4. Menu Compte (components/auth/AccountMenu.tsx)

- Nouveau composant avec dropdown menu
- Affiche les initiales du nom commercial
- Options "Mon compte" et "Déconnexion"
- Intégré dans `AppHeader`

### 5. Page Compte (pages/Account.tsx)

- Affiche toutes les informations du compte SaaS
- Informations MBE, contact, utilisateur
- Bouton de déconnexion

## 🔒 Sécurité

### Règles Firestore

Les règles Firestore ont été mises à jour pour permettre :
- Lecture/écriture de `users/{uid}` uniquement par le propriétaire
- Lecture/écriture de `saasAccounts/{id}` uniquement par le propriétaire (`ownerUid`)

### Isolation des données

Toutes les collections métier (`quotes`, `emailMessages`, `paiements`, etc.) doivent contenir `saasAccountId` et les règles Firestore vérifient que l'utilisateur appartient au bon compte SaaS.

## 📋 Checklist de migration

Pour migrer un compte existant :

1. ✅ Vérifier que le document `users/{uid}` contient `saasAccountId`
2. ✅ Vérifier que le document `saasAccounts/{id}` existe
3. ✅ Migrer les tokens Gmail depuis `emailAccounts` vers `saasAccounts/{id}/integrations/gmail`
4. ✅ Migrer les informations Stripe depuis `clients/{id}` vers `saasAccounts/{id}/integrations/stripe`
5. ✅ Vérifier que tous les devis/paiements/messages contiennent `saasAccountId`

## 🚀 Routes protégées

Toutes les routes suivantes nécessitent maintenant l'authentification (`requireAuth`) :

- `GET /auth/gmail/start`
- `GET /api/email-accounts`
- `DELETE /api/email-accounts/:id`
- `POST /api/stripe/connect`
- `GET /api/stripe/status`
- `POST /api/stripe/disconnect`
- `POST /api/devis/:id/paiement`
- `POST /api/saas-account/create`

## 📝 Notes importantes

1. **Token Firebase** : Le frontend doit toujours passer le token Firebase dans le header `Authorization: Bearer <token>`
2. **State OAuth** : Le `saasAccountId` est passé dans le `state` OAuth pour Gmail et Stripe, puis récupéré au callback
3. **Polling Gmail** : Le polling itère sur tous les comptes SaaS, pas seulement un compte global
4. **Webhook Stripe** : Le webhook utilise `saasAccountId` depuis les metadata, pas depuis la recherche par `stripeAccountId`

## 🔄 Migration depuis l'ancien système

Si vous avez des données existantes avec l'ancien système :

1. **Gmail** : Migrer les tokens depuis `emailAccounts` vers `saasAccounts/{id}/integrations/gmail`
2. **Stripe** : Migrer les `stripeAccountId` depuis `clients/{id}` vers `saasAccounts/{id}/integrations/stripe`
3. **Messages** : Ajouter `saasAccountId` à tous les messages existants dans `emailMessages`
4. **Paiements** : Vérifier que tous les paiements ont `saasAccountId` dans leurs metadata

## ✅ Résultat final

- ✅ Chaque compte SaaS a ses propres intégrations Gmail et Stripe
- ✅ Isolation complète des données par `saasAccountId`
- ✅ Aucun token stocké globalement
- ✅ Authentification requise pour toutes les opérations sensibles
- ✅ Multi-tenancy fonctionnel et sécurisé

