# 📚 Contexte du projet - Devis Automation MBE

## 🎯 Vue d'ensemble

**Nom du projet** : Devis Automation MBE  
**Type** : SaaS B2B pour gestion de devis et paiements  
**Stack** : React + TypeScript + Express + Firebase + Stripe Connect  
**Date de création Stripe Connect** : 13 janvier 2026  
**Version** : 1.0.0

---

## 🏗️ Architecture globale

### Frontend (React + TypeScript + Vite)
- **Port** : 8080
- **Framework** : React 18.3.1 avec TypeScript
- **Build** : Vite 5.4.19
- **UI** : Shadcn/ui + Tailwind CSS
- **Routing** : React Router DOM 6.30.1
- **State** : React Query (TanStack Query)

### Backend (Node.js + Express)
- **Port** : 5174
- **Serveur principal** : `server/ai-proxy.js`
- **Framework** : Express 5.2.1
- **Modules** :
  - AI Analysis (Groq + OCR)
  - Email (Resend + Gmail OAuth)
  - Stripe Connect (paiements)

### Base de données
- **Firestore** (Firebase)
- **Collections principales** :
  - `quotes` - Devis
  - `clients` - Clients SaaS (avec stripeAccountId)
  - `devis` - Devis pour Stripe Connect
  - `paiements` - Paiements Stripe
  - `emailAccounts` - Comptes Gmail OAuth
  - `emailMessages` - Messages Gmail

### Services externes
- **Stripe Connect** - Paiements
- **Gmail API** - Emails
- **Resend** - Envoi d'emails
- **Groq** - Analyse IA de bordereaux

---

## 📁 Structure du projet

```
Devis automation MBE/
│
├── front end/                    # Application principale
│   ├── src/                      # Code source React
│   │   ├── components/          # Composants React
│   │   │   ├── layout/          # Layout (Header, Sidebar)
│   │   │   ├── quotes/          # Composants devis
│   │   │   │   ├── QuotePaiements.tsx  # Gestion paiements
│   │   │   │   └── ...
│   │   │   └── ui/              # Composants UI (Shadcn)
│   │   ├── pages/               # Pages de l'application
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Settings.tsx     # Paramètres (+ onglet Paiements)
│   │   │   ├── QuoteDetail.tsx  # Détail devis (+ onglet Paiements)
│   │   │   └── ...
│   │   ├── lib/                 # Bibliothèques et helpers
│   │   │   ├── firebase.ts      # Configuration Firebase
│   │   │   ├── stripeConnect.ts # Client API Stripe
│   │   │   └── ...
│   │   ├── types/               # Types TypeScript
│   │   │   ├── stripe.ts        # Types Stripe Connect
│   │   │   └── quote.ts
│   │   └── hooks/               # Hooks React personnalisés
│   │
│   ├── server/                  # Backend Express
│   │   ├── ai-proxy.js          # Serveur principal (port 5174)
│   │   ├── stripe-connect.js    # Module Stripe Connect
│   │   ├── index.js             # Serveur alternatif
│   │   └── ...
│   │
│   ├── scripts/                 # Scripts utilitaires
│   │   ├── dev-all.mjs          # Lance tout (Vite + Backend + Stripe CLI)
│   │   ├── init-firestore-stripe.mjs  # Init Firestore
│   │   ├── check-stripe-config.mjs    # Vérif config
│   │   └── ...
│   │
│   ├── package.json             # Dépendances
│   ├── vite.config.ts           # Config Vite (+ proxies)
│   ├── .env.local               # Variables d'environnement (gitignored)
│   └── firebase-credentials.json # Credentials Firebase (gitignored)
│
├── Documentation/               # Documentation du projet
│   ├── START_HERE.md           # Point d'entrée
│   ├── QUICK_START_STRIPE.md   # Démarrage rapide Stripe
│   ├── STRIPE_CONNECT_SETUP.md # Doc complète Stripe
│   ├── CHANGELOG_STRIPE_CONNECT.md # Changelog
│   ├── GIT_PUSH_GUIDE.md       # Guide Git
│   ├── CONTEXTE_PROJET.md      # Ce fichier
│   └── ...
│
├── run-dev-mac.sh              # Script de démarrage macOS
├── start-dev.command           # Lanceur macOS
└── README.md                   # README principal

```

---

## 🔑 Variables d'environnement

### Fichier `.env.local` (front end/)

```bash
# Stripe Connect
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application
APP_URL=http://localhost:8080
PORT=8080

# Firebase (déjà configuré)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=sdv-automation-mbe
# ... autres variables Firebase

# Resend (email)
RESEND_API_KEY=...
EMAIL_FROM=devis@mbe-sdv.fr
EMAIL_FROM_NAME=MBE-SDV

# Gmail OAuth
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=...

# Groq (IA)
GROQ_API_KEY=...
```

---

## 🚀 Démarrage du projet

### Commande principale

```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"
bash run-dev-mac.sh
```

Ou double-cliquer sur `start-dev.command`

### Ce qui se lance automatiquement

1. **Backend (port 5174)** - `server/ai-proxy.js`
   - Routes API
   - Stripe Connect
   - Gmail OAuth
   - Analyse IA

2. **Stripe CLI** - Webhook listener
   - Écoute sur `http://localhost:8080/webhooks/stripe`
   - Forward vers le backend

3. **Frontend (port 8080)** - Vite dev server
   - Application React
   - Proxies vers le backend

### Proxies configurés (Vite)

```
http://localhost:8080/api/*      → http://localhost:5174/api/*
http://localhost:8080/auth/*     → http://localhost:5174/auth/*
http://localhost:8080/stripe/*   → http://localhost:5174/stripe/*
http://localhost:8080/webhooks/* → http://localhost:5174/webhooks/*
```

---

## 📊 Collections Firestore

### `quotes` (devis existants)
```typescript
{
  id: string
  reference: string
  client: { name, email, phone, address }
  lot: { number, value, dimensions }
  delivery: { mode, address, contact }
  options: { packagingPrice, shippingPrice, insurance }
  status: string
  paymentLinks: Array<PaymentLink>
  timeline: Array<TimelineEvent>
  // ... autres champs
}
```

### `clients` (Stripe Connect)
```typescript
{
  id: string
  name: string
  email: string
  stripeAccountId: string | null
  stripeConnected: boolean
  stripeConnectedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `devis` (Stripe Connect)
```typescript
{
  id: string
  clientSaasId: string
  clientFinalEmail: string
  reference: string
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID"
  totalAmount: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `paiements` (Stripe Connect)
```typescript
{
  id: string
  devisId: string
  clientSaasId: string
  stripeSessionId: string
  stripePaymentIntentId: string | null
  amount: number
  type: "PRINCIPAL" | "SURCOUT"
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED"
  description: string
  paidAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `emailAccounts` (Gmail OAuth)
```typescript
{
  id: string
  emailAddress: string
  isActive: boolean
  lastSyncAt: Timestamp
  // ... tokens OAuth
}
```

### `emailMessages` (Messages Gmail)
```typescript
{
  id: string
  messageId: string
  threadId: string
  from: string
  to: string
  subject: string
  snippet: string
  date: Timestamp
  devisId: string | null
  // ... autres champs
}
```

---

## 🎯 Fonctionnalités principales

### 1. Gestion de devis
- Création de devis
- Analyse automatique de bordereaux (IA)
- Calcul automatique des prix (emballage, expédition, assurance)
- Timeline des événements
- Statuts multiples (draft, sent, paid, etc.)

### 2. Paiements (Stripe Connect)
- Connexion OAuth des comptes Stripe clients
- Création de liens de paiement (Checkout Sessions)
- Paiements multiples par devis (principal + surcoûts)
- Mise à jour automatique des statuts via webhook
- Polling temps réel (30s)

### 3. Emails
- Connexion Gmail OAuth
- Synchronisation automatique des emails
- Association emails ↔ devis
- Envoi d'emails de devis
- Envoi d'emails de collecte

### 4. Analyse IA
- Analyse de bordereaux d'adjudication (PDF/images)
- Extraction automatique des données
- OCR avec Tesseract.js
- IA avec Groq (Llama)

---

## 🔐 Sécurité

### Secrets JAMAIS exposés côté frontend
- ✅ Clés Stripe (backend uniquement)
- ✅ Credentials Firebase Admin (backend uniquement)
- ✅ Clés API Resend (backend uniquement)
- ✅ Clés API Groq (backend uniquement)
- ✅ Secrets OAuth Gmail (backend uniquement)

### Fichiers gitignored
- `.env.local`
- `.env`
- `firebase-credentials.json`
- `.stripe_secret_key`
- `node_modules/`

### Vérification webhook Stripe
- Signature vérifiée avec `STRIPE_WEBHOOK_SECRET`
- Routage par `event.account`

---

## 🛠️ Scripts npm disponibles

```bash
# Développement
npm run dev              # Vite uniquement
npm run dev:all          # Tout (Vite + Backend + Stripe CLI)

# Build
npm run build            # Build production
npm run build:dev        # Build dev

# Stripe
npm run stripe:check     # Vérifier la config Stripe
npm run stripe:init      # Initialiser Firestore

# Serveur
npm run serve            # Serveur de production
npm start                # Build + serve

# Autres
npm run lint             # Linter
npm run preview          # Preview du build
```

---

## 📈 Métriques du projet

### Code
- **Total lignes** : ~20,000+ lignes
- **Composants React** : 50+
- **Routes API** : 25+
- **Collections Firestore** : 6
- **Pages** : 12

### Stripe Connect (ajouté récemment)
- **Lignes de code** : ~3,137
- **Fichiers créés** : 20
- **Fichiers modifiés** : 7
- **Documentation** : 1,550+ lignes

### Dépendances principales
- React 18.3.1
- Express 5.2.1
- Firebase 12.6.0
- Stripe 16.12.0
- Vite 5.4.19
- TypeScript 5.8.3

---

## 🗺️ Roadmap

### ✅ Fait
- [x] Gestion de devis
- [x] Analyse IA de bordereaux
- [x] Emails Gmail OAuth
- [x] Paiements Stripe Connect
- [x] Webhook Stripe
- [x] Interface utilisateur complète

### 🚧 En cours
- [ ] Tests automatisés
- [ ] Déploiement en production

### 📋 À venir
- [ ] Notifications par email après paiement
- [ ] Rapports de paiements
- [ ] Remboursements Stripe
- [ ] Export CSV des paiements
- [ ] Multi-langue
- [ ] Mode sombre
- [ ] Application mobile

---

## 📞 Support et documentation

### Documentation principale
- **START_HERE.md** - Point d'entrée
- **README.md** - README principal
- **CONTEXTE_PROJET.md** - Ce fichier

### Documentation Stripe Connect
- **QUICK_START_STRIPE.md** - Démarrage rapide
- **STRIPE_CONNECT_SETUP.md** - Documentation complète
- **CHANGELOG_STRIPE_CONNECT.md** - Changelog
- **GIT_PUSH_GUIDE.md** - Guide Git

### Documentation technique
- **STRIPE_CONNECT_SUMMARY.md** - Résumé technique
- **STRIPE_FILES_CHANGELOG.md** - Liste des fichiers

### Guides de dépannage
- **REDEMARRER_SERVEUR.md** - Redémarrage
- **CORRECTION_404.md** - Correction 404

---

## 🎓 Pour les nouveaux développeurs

### 1. Cloner le projet
```bash
git clone [URL_DU_REPO]
cd "Devis automation MBE/front end"
npm install
```

### 2. Configuration
```bash
# Copier le fichier d'exemple
cp env.stripe.example .env.local

# Éditer .env.local avec tes clés
nano .env.local

# Vérifier la configuration
npm run stripe:check

# Initialiser Firestore
npm run stripe:init
```

### 3. Démarrage
```bash
# Depuis la racine du projet
bash run-dev-mac.sh
```

### 4. Lecture recommandée
1. START_HERE.md
2. README.md
3. QUICK_START_STRIPE.md
4. Ce fichier (CONTEXTE_PROJET.md)

---

## 🎯 Objectifs du projet

### Court terme
- ✅ Système de paiement fonctionnel
- ✅ Interface utilisateur intuitive
- ✅ Documentation complète

### Moyen terme
- [ ] Tests automatisés (Jest + Playwright)
- [ ] CI/CD (GitHub Actions)
- [ ] Déploiement production (Vercel + Firebase)

### Long terme
- [ ] Multi-tenant complet
- [ ] API publique
- [ ] Intégrations tierces (Zapier, Make)
- [ ] Application mobile (React Native)

---

**Dernière mise à jour** : 13 janvier 2026  
**Version du contexte** : 1.0.0  
**Maintenu par** : Équipe de développement

