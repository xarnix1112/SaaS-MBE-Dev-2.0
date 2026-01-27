# 📘 Documentation Stripe Connect - Intégration Complète

## 🎯 Vue d'ensemble

Cette documentation décrit l'intégration complète de **Stripe Connect** dans le SaaS B2B de gestion de devis. L'implémentation permet aux clients du SaaS d'encaisser des paiements directement via leurs propres comptes Stripe.

---

## 🏗️ Architecture

### Modèle d'affaires
- **SaaS B2B** : Plateforme de gestion de devis
- **Clients SaaS** : Entreprises qui utilisent la plateforme
- **Clients finaux** : Clients des entreprises (ceux qui reçoivent les devis)
- **Flux de paiement** : Clients finaux → Stripe Checkout → Compte Stripe du client SaaS

### Architecture Stripe
```
TON SaaS (Plateforme)
├── Stripe Platform Account (ton compte principal)
│   ├── Client SaaS A
│   │   └── Stripe Connected Account (acct_xxx)
│   │       └── Clients finaux + devis + paiements
│   ├── Client SaaS B
│   │   └── Stripe Connected Account (acct_yyy)
│   └── Webhook Stripe UNIQUE
│       └── Traite TOUS les comptes connectés
```

---

## 📦 Fonctionnalités implémentées

### ✅ Connexion Stripe (OAuth)
- **Page** : Paramètres → Onglet "Paiements"
- **Fonctionnalité** :
  - Bouton "Connecter mon compte Stripe"
  - OAuth Stripe Connect (aucune clé à saisir manuellement)
  - Stockage du `stripeAccountId` dans Firestore
  - Affichage du statut de connexion

### ✅ Création de liens de paiement
- **Page** : Détail devis → Onglet "Paiements"
- **Fonctionnalité** :
  - Création de liens Stripe Checkout
  - Paiements multiples par devis (principal + surcoûts)
  - Montant et description personnalisables
  - Liens one-shot (utilisables une seule fois)

### ✅ Webhook unique
- **Route** : `/api/stripe/webhook`
- **Fonctionnalité** :
  - Reçoit tous les événements de tous les comptes connectés
  - Met à jour automatiquement le statut des paiements
  - Recalcule le statut global des devis
  - Détection automatique Stripe Connect vs Payment Links

### ✅ Affichage des paiements
- **Page** : Détail devis → Onglet "Paiements"
- **Fonctionnalité** :
  - Liste de tous les paiements du devis
  - Statut en temps réel (polling 30 secondes)
  - Montant total et montant encaissé
  - Badges de statut (En attente / Payé / Échec)

---

## 🗄️ Modèle de données Firestore

### Collection `clients`
```typescript
{
  id: string
  name: string
  stripeAccountId: string | null  // ID du compte Stripe connecté
  stripeConnected: boolean         // true si compte connecté
}
```

### Collection `quotes` (devis)
```typescript
{
  id: string
  reference: string                // Ex: "DEV-GS-5"
  clientSaasId: string             // ID du client SaaS propriétaire
  // ... autres champs existants
}
```

### Collection `paiements`
```typescript
{
  id: string
  devisId: string                  // ID du devis
  clientSaasId: string             // ID du client SaaS
  stripeSessionId: string          // ID de la Checkout Session
  amount: number                   // Montant en euros
  type: "PRINCIPAL" | "SURCOUT"    // Type de paiement
  status: "PENDING" | "PAID" | "FAILED"
  description?: string             // Description optionnelle
  createdAt: Timestamp
  updatedAt: Timestamp
  paidAt?: Timestamp               // Date de paiement si PAID
  stripePaymentIntentId?: string   // ID du PaymentIntent Stripe
}
```

---

## 🔧 Fichiers créés/modifiés

### Backend

#### `front end/server/stripe-connect.js` (NOUVEAU)
**Rôle** : Module principal pour Stripe Connect

**Fonctions exportées** :
- `handleStripeConnect()` : Génère l'URL OAuth
- `handleStripeCallback()` : Traite le retour OAuth
- `handleStripeStatus()` : Vérifie le statut de connexion
- `handleStripeDisconnect()` : Déconnecte un compte
- `handleCreatePaiement()` : Crée une Checkout Session
- `handleGetPaiements()` : Récupère les paiements d'un devis
- `handleStripeWebhook()` : Traite les événements Stripe

**Routes** :
- `POST /api/stripe/connect` - Initie OAuth
- `GET /stripe/callback` - Callback OAuth
- `GET /api/stripe/status` - Statut connexion
- `POST /api/stripe/disconnect` - Déconnexion
- `POST /api/devis/:id/paiement` - Créer paiement
- `GET /api/devis/:id/paiements` - Lister paiements
- `POST /webhooks/stripe` - Webhook Stripe

#### `front end/server/ai-proxy.js` (MODIFIÉ)
**Modifications** :
- Importation des routes Stripe Connect
- Détection des événements Stripe Connect dans le webhook existant
- Redirection vers `handleStripeWebhook` pour les événements avec `metadata.devisId`

**Ligne clé** :
```javascript
// Ligne ~868 : Détection Stripe Connect
if (event.type === "checkout.session.completed" && obj.metadata?.devisId) {
  // Redirection vers handler Stripe Connect
  await stripeConnectModule.handleStripeWebhook(modifiedReq, res, firestore);
  return;
}
```

### Frontend

#### `front end/src/lib/stripeConnect.ts` (NOUVEAU)
**Rôle** : Client API et hooks React pour Stripe Connect

**Exports** :
- `connectStripe()` - Initie la connexion OAuth
- `getStripeStatus()` - Récupère le statut
- `disconnectStripe()` - Déconnecte le compte
- `createPaiement()` - Crée un paiement
- `getPaiements()` - Récupère les paiements
- `useStripeStatus()` - Hook React pour le statut
- `usePaiements()` - Hook React pour les paiements

#### `front end/src/components/quotes/QuotePaiements.tsx` (NOUVEAU)
**Rôle** : Composant React pour gérer les paiements d'un devis

**Fonctionnalités** :
- Affichage de la liste des paiements
- Formulaire de création de paiement
- Polling automatique (30s)
- Badges de statut colorés
- Montant total et montant encaissé

#### `front end/src/components/quotes/StripeSetupAlert.tsx` (NOUVEAU)
**Rôle** : Alertes pour guider l'utilisateur en cas d'erreur

**Types d'alertes** :
- Index Firestore manquant
- Nom d'entreprise Stripe manquant

#### `front end/src/pages/Settings.tsx` (MODIFIÉ)
**Modifications** :
- Ajout d'un onglet "Paiements"
- Affichage du statut de connexion Stripe
- Bouton "Connecter mon compte Stripe"
- Gestion des paramètres de retour OAuth (`?connected=true&stripe=true`)

#### `front end/src/pages/QuoteDetail.tsx` (MODIFIÉ)
**Modifications** :
- Intégration du composant `QuotePaiements` dans l'onglet "Paiements"
- Remplacement de l'ancien résumé de paiement

#### `front end/src/types/stripe.ts` (NOUVEAU)
**Rôle** : Types TypeScript pour Stripe Connect

**Types** :
- `StripeClient` - Client avec compte Stripe
- `StripeQuote` - Devis avec données Stripe
- `Paiement` - Paiement Stripe
- `PaiementType` - Type de paiement
- `PaiementStatus` - Statut de paiement

### Configuration

#### `front end/vite.config.ts` (MODIFIÉ)
**Modification** : Ajout de proxies pour `/stripe` et `/webhooks`

```typescript
proxy: {
  '/api': { target: 'http://localhost:5174', changeOrigin: true },
  '/stripe': { target: 'http://localhost:5174', changeOrigin: true },
  '/webhooks': { target: 'http://localhost:5174', changeOrigin: true },
}
```

#### `front end/scripts/dev-all.mjs` (MODIFIÉ)
**Modification** : Ajout du même proxy pour le dev server

#### `front end/package.json` (MODIFIÉ)
**Ajout de scripts** :
- `stripe:check` - Vérifie la configuration Stripe
- `stripe:init` - Initialise les données de test Firestore

### Scripts utilitaires

#### `front end/scripts/check-stripe-config.mjs` (NOUVEAU)
Vérifie que toutes les variables d'environnement Stripe sont définies

#### `front end/scripts/check-stripe-account.mjs` (NOUVEAU)
Vérifie la configuration d'un compte Stripe connecté (via API Stripe)

#### `front end/scripts/init-firestore-stripe.mjs` (NOUVEAU)
Initialise Firestore avec un client de test et des données d'exemple

#### `front end/scripts/test-webhook-update.mjs` (NOUVEAU)
Affiche l'état des paiements dans Firestore pour le débogage

#### `front end/start-stripe-webhook.sh` (NOUVEAU)
Script shell pour démarrer le Stripe CLI webhook listener

---

## 🔐 Variables d'environnement

### `.env.local` (à configurer)
```bash
# Stripe Connect
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# URL de l'application
APP_URL=http://localhost:8080
```

### Fichier d'exemple : `env.stripe.example`
Template des variables nécessaires

---

## 🚀 Démarrage

### 1. Configuration initiale

```bash
cd "front end"

# Copier l'exemple et configurer
cp env.stripe.example .env.local
# Éditer .env.local avec tes clés Stripe

# Initialiser Firestore avec des données de test
npm run stripe:init

# Vérifier la configuration
npm run stripe:check
```

### 2. Démarrer l'application

```bash
# Depuis la racine du projet
bash run-dev-mac.sh
```

Cela démarre automatiquement :
- Le serveur backend (port 5174)
- Le serveur Vite (port 8080)
- Le Stripe CLI webhook listener

### 3. Connecter Stripe

1. Ouvre l'app : http://localhost:8080
2. Va dans **Paramètres** → **Paiements**
3. Clique sur **"Connecter mon compte Stripe"**
4. Autorise l'accès
5. Tu es redirigé vers l'app avec un statut "Connecté"

### 4. Créer un paiement

1. Ouvre un devis
2. Va dans l'onglet **"Paiements"**
3. Clique sur **"+ Créer un paiement"**
4. Remplis :
   - Montant : ex. `150.00`
   - Type : `Paiement principal` ou `Surcoût`
   - Description (optionnel)
5. Clique sur **"Créer le lien de paiement"**
6. Tu es redirigé vers Stripe Checkout

### 5. Tester le paiement

- Carte de test : `4242 4242 4242 4242`
- Date : n'importe quelle date future
- CVC : n'importe quel code à 3 chiffres

Après le paiement, tu reviens sur l'app et le statut est mis à jour automatiquement.

---

## 🔍 Débogage

### Vérifier les paiements dans Firestore

```bash
cd "front end"
node scripts/test-webhook-update.mjs
```

Affiche tous les paiements avec leur statut actuel.

### Vérifier le compte Stripe connecté

```bash
cd "front end"
node scripts/check-stripe-account.mjs
```

Affiche les détails du compte connecté (nom d'entreprise, email, etc.).

### Logs du webhook

Quand un paiement est effectué, tu devrais voir dans le terminal :

```
[stripe] --> connect checkout.session.completed
[ai-proxy] 🔀 Événement Stripe Connect détecté
[stripe-connect] 📨 Utilisation de l'event pré-construit
[stripe-connect] 🔍 Checkout Session Completed: { ... }
[stripe-connect] ✅ Client trouvé: ...
[stripe-connect] ✅ Paiement trouvé: ...
[stripe-connect] ✅ Paiement ... marqué comme PAID
[stripe-connect] ✅ Statut du devis ... mis à jour
```

---

## 🐛 Problèmes courants et solutions

### Erreur : Index Firestore manquant

**Symptôme** : `The query requires an index`

**Solution** : Clique sur le lien fourni dans l'erreur pour créer l'index automatiquement, ou va sur :
https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes

### Erreur : Configuration Stripe incomplète

**Symptôme** : `In order to use Checkout, you must set an account or business name`

**Solution** : 
1. Va sur https://dashboard.stripe.com/settings/account
2. Remplis le champ "Business name"
3. Sauvegarde

### Erreur : Route non trouvée

**Symptôme** : `404 Not Found` sur `/stripe/callback`

**Solution** : Vérifie que les proxies sont configurés dans `vite.config.ts` et `scripts/dev-all.mjs`

### Le webhook ne met pas à jour les paiements

**Symptôme** : Les paiements restent en statut `PENDING` après paiement

**Solution** : 
1. Vérifie que le Stripe CLI est actif : `[stripe] Ready!` dans le terminal
2. Vérifie que le webhook est bien reçu dans les logs
3. Redémarre le serveur : `Ctrl+C` puis `bash run-dev-mac.sh`

---

## 📊 Flux de paiement complet

### 1. Création du lien de paiement

```
Frontend (QuotePaiements)
  → POST /api/devis/:id/paiement
  → Backend (stripe-connect.js)
    → Récupère le devis et le client SaaS
    → Crée une Checkout Session Stripe
    → Sauvegarde le paiement dans Firestore (status: PENDING)
    → Retourne l'URL Stripe Checkout
  → Redirection vers Stripe Checkout
```

### 2. Paiement sur Stripe

```
Client final remplit le formulaire Stripe
  → Paie avec sa carte
  → Stripe traite le paiement
  → Stripe envoie webhook checkout.session.completed
```

### 3. Traitement du webhook

```
Stripe CLI reçoit l'événement
  → POST /api/stripe/webhook
  → Backend (ai-proxy.js)
    → Détecte metadata.devisId (Stripe Connect)
    → Redirige vers handleStripeWebhook (stripe-connect.js)
    → Récupère le paiement par stripeSessionId
    → Met à jour status: PAID, paidAt: now()
    → Recalcule le statut du devis
  → 200 OK
```

### 4. Mise à jour dans l'app

```
Frontend (QuotePaiements)
  → Polling toutes les 30 secondes
  → GET /api/devis/:id/paiements
  → Backend retourne les paiements mis à jour
  → Frontend affiche le nouveau statut
  → Montant encaissé mis à jour
```

---

## 🎯 Points clés de l'implémentation

### ✅ Sécurité
- ✅ Aucune clé Stripe côté frontend
- ✅ Validation de signature webhook
- ✅ Authentification OAuth Stripe
- ✅ Paiements isolés par compte Stripe

### ✅ Architecture
- ✅ Un seul webhook pour tous les comptes
- ✅ Détection automatique Stripe Connect vs Payment Links
- ✅ Firestore comme source de vérité
- ✅ Polling simple pour le temps réel

### ✅ UX
- ✅ Connexion Stripe en 1 clic (OAuth)
- ✅ Création de paiement simple et rapide
- ✅ Statut mis à jour automatiquement
- ✅ Messages d'erreur clairs et actionables

### ✅ Maintenance
- ✅ Code modulaire et bien organisé
- ✅ Logs détaillés pour le débogage
- ✅ Scripts utilitaires pour les tests
- ✅ Documentation complète

---

## 📚 Ressources

### Documentation Stripe
- [Stripe Connect](https://stripe.com/docs/connect)
- [OAuth for Connect](https://stripe.com/docs/connect/oauth-reference)
- [Checkout Sessions](https://stripe.com/docs/api/checkout/sessions)
- [Webhooks](https://stripe.com/docs/webhooks)

### Dashboards
- [Stripe Dashboard (Plateforme)](https://dashboard.stripe.com)
- [Firebase Console](https://console.firebase.google.com/project/sdv-automation-mbe)

---

## 🎉 Conclusion

L'intégration Stripe Connect est maintenant **complète et fonctionnelle** ! Les clients du SaaS peuvent :

1. ✅ Connecter leur compte Stripe en 1 clic
2. ✅ Créer des liens de paiement pour leurs devis
3. ✅ Encaisser directement sur leur compte Stripe
4. ✅ Voir le statut des paiements en temps réel
5. ✅ Gérer plusieurs paiements par devis (principal + surcoûts)

Le système est **production-ready** et respecte toutes les bonnes pratiques Stripe Connect.

---

**Date de dernière mise à jour** : 13 janvier 2026
**Version** : 1.0.0
**Auteur** : Assistant IA + Clément

