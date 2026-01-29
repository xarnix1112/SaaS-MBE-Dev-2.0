# 🚀 Guide de Mise en Production - SaaS MBE SDV

**Date :** 29 janvier 2026  
**Version de l'application :** 2.0.4

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Checklist pré-production](#checklist-pré-production)
3. [Configuration Firebase](#1-configuration-firebase)
4. [Configuration Stripe](#2-configuration-stripe)
5. [Variables d'environnement](#3-variables-denvironnement)
6. [Build de production](#4-build-de-production)
7. [Hébergement Backend](#5-hébergement-backend)
8. [Hébergement Frontend](#6-hébergement-frontend)
9. [Domaine et SSL](#7-domaine-et-ssl)
10. [Sécurité](#8-sécurité)
11. [Monitoring et logs](#9-monitoring-et-logs)
12. [Tests finaux](#10-tests-finaux)
13. [Déploiement](#11-déploiement)
14. [Post-déploiement](#12-post-déploiement)

---

## Vue d'ensemble

### Architecture actuelle (Dev)
```
┌─────────────┐      ┌─────────────┐
│  Frontend   │      │   Backend   │
│  Vite :8080 │─────▶│ Express:5174│
└─────────────┘      └─────────────┘
       │                    │
       └────────────────────┴─────────▶ Firebase Firestore (Cloud)
```

### Architecture cible (Production)
```
┌──────────────────┐      ┌──────────────────┐
│    Frontend      │      │     Backend      │
│  (Vercel/Netlify)│─────▶│ (Render/Railway) │
│  votre-app.com   │      │  api.votre-app   │
└──────────────────┘      └──────────────────┘
       │                          │
       └──────────────────────────┴─────────▶ Firebase Prod
```

---

## Checklist Pré-Production

### ✅ Avant de commencer

- [ ] **Backup complet** de la base de données Firebase (export Firestore)
- [ ] **Créer un projet Firebase séparé** pour la production
- [ ] **Compte Stripe en mode Live** (sortir du mode test)
- [ ] **Domaine personnalisé** acheté et configuré
- [ ] **Tests complets** en environnement de staging
- [ ] **Documentation** à jour
- [ ] **Secrets** sécurisés (pas de clés en clair dans le code)

---

## 1. Configuration Firebase

### 1.1. Créer un projet Firebase de production

1. **Aller sur https://console.firebase.google.com**
2. **Créer un nouveau projet** : `saas-mbe-sdv-production`
3. **Activer Firestore** (mode production)
4. **Activer Authentication** (Google OAuth)
5. **Configurer Firebase Storage** (pour les fichiers)

### 1.2. Règles de sécurité Firestore ⚠️ CRITIQUE

**Fichier :** `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Fonction helper pour récupérer le saasAccountId de l'utilisateur
    function getUserSaasAccountId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
    }
    
    // RÈGLE 1: Collection saasAccounts
    match /saasAccounts/{accountId} {
      allow read, write: if request.auth != null 
        && getUserSaasAccountId() == accountId;
    }
    
    // RÈGLE 2: Collection quotes (devis)
    match /quotes/{quoteId} {
      allow read, write: if request.auth != null 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // RÈGLE 3: Collection notifications
    match /notifications/{notificationId} {
      allow read, delete: if request.auth != null 
        && resource.data.clientSaasId == getUserSaasAccountId();
      allow create: if false; // Seulement backend
    }
    
    // RÈGLE 4: Collection paiements
    match /paiements/{paiementId} {
      allow read: if request.auth != null 
        && resource.data.clientSaasId == getUserSaasAccountId();
      allow write: if false; // Seulement backend
    }
    
    // RÈGLE 5: Collection cartons
    match /cartons/{cartonId} {
      allow read, write: if request.auth != null 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // ... Ajouter les autres collections
  }
}
```

**⚠️ Important :** Déployer les règles avant la mise en production !

```bash
firebase deploy --only firestore:rules
```

### 1.3. Index Firestore

**Créer les index composites nécessaires :**

1. **Index notifications**
   - Collection : `notifications`
   - Champs : `clientSaasId` (Asc), `createdAt` (Desc)

2. **Index quotes**
   - Collection : `quotes`
   - Champs : `saasAccountId` (Asc), `createdAt` (Desc)

3. **Index paiements**
   - Collection : `paiements`
   - Champs : `clientSaasId` (Asc), `status` (Asc)

**Lien rapide :** Console Firebase → Firestore → Indexes

### 1.4. Configuration Firebase Admin SDK

**Générer une nouvelle clé privée pour la production :**

1. Console Firebase → Paramètres du projet → Comptes de service
2. Générer une nouvelle clé privée
3. Télécharger le fichier JSON
4. **NE PAS commiter ce fichier !**
5. Le stocker de manière sécurisée (variables d'environnement)

---

## 2. Configuration Stripe

### 2.1. Passer en mode Live

**Étapes :**

1. **Aller sur https://dashboard.stripe.com**
2. **Activer votre compte** (vérification identité, KYC)
3. **Basculer sur "Mode Live"** (toggle en haut à droite)
4. **Récupérer les clés Live** :
   - Clé secrète : commence par `sk_live_`
   - Clé publique : commence par `pk_live_`
   - Webhook secret : commence par `whsec_`

### 2.2. Stripe Connect

**Configuration OAuth :**

1. **Settings → Connect → OAuth settings**
2. **Redirect URI (production)** : `https://api.votre-domaine.com/stripe/callback`
3. **Récupérer le Client ID** : `ca_...` (mode Live)

### 2.3. Webhooks Stripe

**Créer un webhook de production :**

1. **Dashboard Stripe → Developers → Webhooks**
2. **Add endpoint** : `https://api.votre-domaine.com/webhooks/stripe`
3. **Événements à écouter** :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. **Récupérer le Webhook Secret** : `whsec_...`

---

## 3. Variables d'Environnement

### 3.1. Backend (Production)

**Créer `.env.production` :**

```env
# ==========================================
# ENVIRONNEMENT
# ==========================================
NODE_ENV=production
PORT=5174

# ==========================================
# FIREBASE (PRODUCTION)
# ==========================================
# Option 1: Fichier JSON (recommandé pour déploiement)
GOOGLE_APPLICATION_CREDENTIALS=/app/firebase-credentials-prod.json

# Option 2: Variables individuelles (Render, Railway, etc.)
FIREBASE_PROJECT_ID=saas-mbe-sdv-production
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@saas-mbe-sdv-production.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ==========================================
# STRIPE (LIVE)
# ==========================================
STRIPE_SECRET_KEY=sk_live_your_live_key_here
STRIPE_CONNECT_CLIENT_ID=ca_your_connect_client_id_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# ==========================================
# GOOGLE OAUTH (GMAIL)
# ==========================================
GMAIL_CLIENT_ID=XXXXXX.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-XXXXXX
GMAIL_REDIRECT_URI=https://api.votre-domaine.com/auth/gmail/callback

# ==========================================
# GOOGLE OAUTH (SHEETS)
# ==========================================
GOOGLE_SHEETS_CLIENT_ID=XXXXXX.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=GOCSPX-XXXXXX
GOOGLE_SHEETS_REDIRECT_URI=https://api.votre-domaine.com/auth/google-sheets/callback

# ==========================================
# GROQ AI
# ==========================================
GROQ_API_KEY=gsk_XXXXXXXXXXXXXXXXXXXXXXXX

# ==========================================
# EMAIL (RESEND)
# ==========================================
EMAIL_FROM=noreply@votre-domaine.com
EMAIL_FROM_NAME=SaaS MBE SDV
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXXXXXX

# ==========================================
# CORS
# ==========================================
FRONTEND_URL=https://votre-domaine.com
ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com

# ==========================================
# SÉCURITÉ
# ==========================================
JWT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SESSION_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**⚠️ Sécurité :**
- Ne jamais commiter `.env.production`
- Utiliser des secrets managers (Railway Secrets, Render Environment Variables, etc.)
- Régénérer toutes les clés API pour la production

### 3.2. Frontend (Production)

**Créer `.env.production` dans `front end/` :**

```env
# ==========================================
# FIREBASE (PRODUCTION - Clés publiques)
# ==========================================
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=saas-mbe-sdv-production.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=saas-mbe-sdv-production
VITE_FIREBASE_STORAGE_BUCKET=saas-mbe-sdv-production.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# ==========================================
# API BACKEND
# ==========================================
VITE_API_URL=https://api.votre-domaine.com

# ==========================================
# STRIPE (LIVE - Clé publique)
# ==========================================
VITE_STRIPE_PUBLIC_KEY=pk_live_your_public_key_here
```

---

## 4. Build de Production

### 4.1. Build Frontend

```bash
cd "front end"

# Installer les dépendances
npm install

# Nettoyer le cache
npm run clean  # ou rm -rf dist node_modules/.vite

# Build de production
npm run build

# Tester le build localement
npm run preview
```

**Résultat :** Dossier `front end/dist/` contenant les fichiers statiques optimisés.

### 4.2. Optimisations Build

**Fichier `vite.config.ts` :**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Optimisations pour la production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Retirer les console.log en prod
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Code splitting pour de meilleures performances
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // 1MB
  },
  server: {
    port: 8080,
  },
})
```

---

## 5. Hébergement Backend

### Option A : Railway (Recommandé) 🚂

**Avantages :**
- Déploiement automatique depuis GitHub
- Variables d'environnement sécurisées
- Logs en temps réel
- SSL/TLS automatique
- Scaling automatique

**Étapes :**

1. **Créer un compte sur https://railway.app**
2. **New Project → Deploy from GitHub repo**
3. **Sélectionner le dépôt** : `xarnix1112/SaaS-MBE-Dev-2.0`
4. **Configuration :**
   - **Root Directory** : `front end`
   - **Build Command** : `npm install`
   - **Start Command** : `node server/ai-proxy.js`
   - **Port** : 5174

5. **Variables d'environnement** :
   - Copier toutes les variables de `.env.production`
   - Railway → Settings → Variables

6. **Domaine personnalisé** :
   - Railway → Settings → Domains
   - Ajouter : `api.votre-domaine.com`
   - Configurer le CNAME chez votre registrar

### Option B : Render 🎨

**Similaire à Railway :**

1. **https://render.com**
2. **New → Web Service**
3. **Connect GitHub repo**
4. **Configuration :**
   - **Build Command** : `cd "front end" && npm install`
   - **Start Command** : `cd "front end" && node server/ai-proxy.js`
   - **Environment** : `Node`

### Option C : VPS (Advanced) 🖥️

**Si vous préférez gérer votre propre serveur :**

1. **Louer un VPS** (DigitalOcean, OVH, etc.)
2. **Installer Node.js** (version 18+)
3. **Cloner le repo** sur le serveur
4. **PM2** pour gérer le processus :

```bash
npm install -g pm2

cd /var/www/saas-mbe-sdv/front\ end
npm install

# Lancer avec PM2
pm2 start server/ai-proxy.js --name "mbe-backend"
pm2 save
pm2 startup
```

5. **Nginx** comme reverse proxy
6. **Certbot** pour SSL/TLS

---

## 6. Hébergement Frontend

### Option A : Vercel (Recommandé) ⚡

**Avantages :**
- CDN global ultra-rapide
- Déploiement automatique depuis GitHub
- SSL gratuit
- Preview deployments
- Edge functions

**Étapes :**

1. **Créer un compte sur https://vercel.com**
2. **Import Project → GitHub**
3. **Sélectionner le repo** : `xarnix1112/SaaS-MBE-Dev-2.0`
4. **Configuration :**
   - **Framework Preset** : Vite
   - **Root Directory** : `front end`
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`

5. **Variables d'environnement** :
   - Ajouter toutes les variables `VITE_*` depuis `.env.production`

6. **Domaine personnalisé** :
   - Vercel → Settings → Domains
   - Ajouter : `votre-domaine.com` et `www.votre-domaine.com`

### Option B : Netlify 🌐

**Similaire à Vercel :**

1. **https://netlify.com**
2. **New site from Git**
3. **Configuration identique à Vercel**
4. **Fichier `netlify.toml`** (optionnel) :

```toml
[build]
  base = "front end"
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Option C : Firebase Hosting 🔥

**Avantages :**
- Intégration native avec Firebase
- CDN global
- SSL gratuit

```bash
npm install -g firebase-tools
firebase login
firebase init hosting

# Configuration
# Public directory: front end/dist
# Single-page app: Yes

# Déployer
npm run build
firebase deploy --only hosting
```

---

## 7. Domaine et SSL

### 7.1. Configuration DNS

**Chez votre registrar (Namecheap, OVH, etc.) :**

```dns
# Frontend (Vercel)
Type    Name    Value
A       @       76.76.21.21  (Vercel IP)
CNAME   www     cname.vercel-dns.com

# Backend (Railway)
CNAME   api     your-app.up.railway.app
```

### 7.2. SSL/TLS

**Automatique avec :**
- ✅ Vercel/Netlify → SSL gratuit (Let's Encrypt)
- ✅ Railway/Render → SSL automatique
- ✅ Firebase Hosting → SSL inclus

**Si VPS :**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com
```

---

## 8. Sécurité

### 8.1. Checklist Sécurité ⚠️

- [ ] **Toutes les clés API régénérées** pour la production
- [ ] **Aucun secret en clair** dans le code
- [ ] **Règles Firestore strictes** déployées
- [ ] **CORS configuré** (seulement votre domaine)
- [ ] **Rate limiting** activé sur les API
- [ ] **Headers de sécurité** configurés
- [ ] **HTTPS forcé** partout
- [ ] **Backup automatique** Firestore activé

### 8.2. CORS (Backend)

**Fichier `ai-proxy.js` :**

```javascript
import cors from 'cors';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://votre-domaine.com',
  'https://www.votre-domaine.com'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### 8.3. Headers de Sécurité

```javascript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

### 8.4. Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes max
  message: 'Trop de requêtes, réessayez plus tard'
});

app.use('/api/', limiter);
```

---

## 9. Monitoring et Logs

### 9.1. Sentry (Erreurs)

```bash
npm install @sentry/react @sentry/node
```

**Frontend (`main.tsx`) :**

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://xxx@xxx.ingest.sentry.io/xxx",
  environment: "production",
  tracesSampleRate: 1.0,
});
```

**Backend (`ai-proxy.js`) :**

```javascript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: "production",
});

app.use(Sentry.Handlers.errorHandler());
```

### 9.2. Google Analytics

**Frontend :**

```html
<!-- index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### 9.3. Logs Backend

**Production :** Utiliser un service de logs

- **Railway** : Logs intégrés
- **Render** : Logs intégrés
- **VPS** : PM2 logs ou Winston → CloudWatch/Logtail

---

## 10. Tests Finaux

### 10.1. Tests Fonctionnels

- [ ] Création de compte
- [ ] Connexion OAuth (Gmail, Sheets, Drive)
- [ ] Réception d'un nouveau devis
- [ ] Notification reçue
- [ ] Calcul de devis
- [ ] Génération lien de paiement Stripe (Live)
- [ ] Paiement test Stripe
- [ ] Webhook Stripe reçu
- [ ] Email envoyé (Resend)
- [ ] Upload bordereau
- [ ] OCR extraction

### 10.2. Tests de Performance

```bash
# Frontend
npm run build
npm run preview
# Lighthouse audit dans Chrome DevTools

# Backend
# Load testing avec Artillery ou k6
npm install -g artillery
artillery quick --count 10 --num 50 https://api.votre-domaine.com/api/health
```

### 10.3. Tests de Sécurité

- [ ] Scan OWASP ZAP
- [ ] Test injection SQL (n/a pour Firestore)
- [ ] Test XSS
- [ ] Test CSRF
- [ ] Vérifier headers de sécurité : https://securityheaders.com

---

## 11. Déploiement

### 11.1. Ordre de Déploiement

```mermaid
graph TD
    A[1. Firebase Production] --> B[2. Backend Deploy]
    B --> C[3. Tester Backend]
    C --> D[4. Frontend Deploy]
    D --> E[5. Tester Frontend]
    E --> F[6. DNS + SSL]
    F --> G[7. Tests E2E]
    G --> H[8. Monitoring]
```

### 11.2. Commandes de Déploiement

**1. Firebase :**
```bash
firebase use production
firebase deploy --only firestore:rules,firestore:indexes
```

**2. Backend (Railway) :**
```bash
# Push sur GitHub → Déploiement automatique
git push origin master

# Ou via Railway CLI
railway up
```

**3. Frontend (Vercel) :**
```bash
# Push sur GitHub → Déploiement automatique
git push origin master

# Ou via Vercel CLI
vercel --prod
```

---

## 12. Post-Déploiement

### 12.1. Vérifications Immédiates

- [ ] Site accessible via HTTPS
- [ ] API backend répond
- [ ] Firebase connecté
- [ ] Stripe webhooks reçus
- [ ] Logs sans erreurs
- [ ] Monitoring actif

### 12.2. Surveillance 24h-48h

- [ ] Vérifier les logs d'erreurs
- [ ] Surveiller les performances
- [ ] Tester toutes les fonctionnalités
- [ ] Vérifier les paiements Stripe
- [ ] Valider les emails envoyés

### 12.3. Communication

- [ ] Annoncer la mise en production
- [ ] Informer les utilisateurs test
- [ ] Envoyer guide utilisateur
- [ ] Créer page de statut (status.votre-domaine.com)

---

## 📊 Coûts Estimés

| Service | Plan | Coût Mensuel |
|---------|------|--------------|
| **Vercel** | Hobby | Gratuit (puis $20/mois) |
| **Railway** | Hobby | $5/mois (puis usage) |
| **Firebase** | Blaze | $0-50/mois (usage) |
| **Stripe** | Standard | 1.5% + 0.25€/transaction |
| **Domaine** | - | ~10€/an |
| **Sentry** | Developer | Gratuit (puis $26/mois) |
| **Resend** | Free | Gratuit (3000 emails/mois) |

**Total estimé :** ~15-30€/mois au début

---

## 🆘 Support et Ressources

### Documentation

- Firebase : https://firebase.google.com/docs
- Stripe : https://stripe.com/docs
- Vercel : https://vercel.com/docs
- Railway : https://docs.railway.app

### Communautés

- Discord Vercel
- Discord Railway
- Stack Overflow
- GitHub Issues

---

## ✅ Checklist Finale

- [ ] Firebase production configuré
- [ ] Stripe en mode Live
- [ ] Variables d'environnement configurées
- [ ] Build frontend testé
- [ ] Backend déployé
- [ ] Frontend déployé
- [ ] DNS configuré
- [ ] SSL actif
- [ ] Tests fonctionnels OK
- [ ] Monitoring actif
- [ ] Backup automatique activé
- [ ] Documentation à jour

---

**🎉 Félicitations ! Votre application est prête pour la production !**

---

**Version du guide :** 1.0  
**Dernière mise à jour :** 29 janvier 2026  
**Auteur :** Assistant IA (Claude Sonnet 4.5)
