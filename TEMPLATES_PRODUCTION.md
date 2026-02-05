# 📄 Templates de Configuration Production

**Tous les fichiers et configurations nécessaires**

---

## 📋 Template : NOTES_DEPLOIEMENT.txt

**À créer sur votre ordinateur pour noter toutes les informations**

```txt
=================================================================
         NOTES DE DÉPLOIEMENT - SaaS MBE SDV
=================================================================

Date de début : __________
Date de fin : __________

=================================================================
MON DOMAINE
=================================================================
Domaine principal : ______________________.com
Registrar : __________ (Namecheap / OVH / GoDaddy)

=================================================================
FIREBASE PRODUCTION
=================================================================
Project ID : saas-mbe-sdv-production
API Key : AIza____________________________________
Auth Domain : saas-mbe-sdv-production.firebaseapp.com
Storage Bucket : saas-mbe-sdv-production.firebasestorage.app
Messaging Sender ID : ____________________
App ID : 1:____________________:web:____________________

Fichier Admin SDK : firebase-credentials-prod.json
Localisation : C:\Dev\SaaS MBE SDV Production\firebase-credentials-prod.json

=================================================================
STRIPE LIVE
=================================================================
Publishable key : pk_live_[VOTRE_CLE_PUBLIQUE_STRIPE]
Secret key : sk_live_[VOTRE_CLE_SECRETE_STRIPE]
Connect Client ID : ca_____________________________________
Webhook Secret : whsec_____________________________________
Webhook URL : https://api.______.com/webhooks/stripe

Compte activé : ☐ Oui  ☐ Non (en attente)
Date d'activation : __________

=================================================================
GOOGLE CLOUD OAUTH
=================================================================

GMAIL OAUTH :
- Project : SaaS MBE SDV Production
- Client ID : ________________.apps.googleusercontent.com
- Client secret : GOCSPX-____________________________________
- Redirect URI : https://api.______.com/auth/gmail/callback

GOOGLE SHEETS OAUTH :
- Project : SaaS MBE SDV Production
- Client ID : ________________.apps.googleusercontent.com
- Client secret : GOCSPX-____________________________________
- Redirect URI : https://api.______.com/auth/google-sheets/callback

=================================================================
RAILWAY (BACKEND)
=================================================================
URL Railway : ________________.up.railway.app
URL Domaine custom : https://api.______.com

Nombre de variables : 18
Status : ☐ Déployé  ☐ En erreur

=================================================================
VERCEL (FRONTEND)
=================================================================
URL Vercel : ________________.vercel.app
URL Domaine custom : https://______.com

Nombre de variables : 9
Status : ☐ Déployé  ☐ En erreur

=================================================================
DNS RECORDS
=================================================================

À configurer chez : __________ (Namecheap / OVH / etc.)

Record 1 (Frontend) :
Type : A
Name : @
Value : 76.76.21.21

Record 2 (Frontend www) :
Type : CNAME
Name : www
Value : cname.vercel-dns.com

Record 3 (Backend API) :
Type : CNAME
Name : api
Value : ________________.up.railway.app

Propagation terminée : ☐ Oui  ☐ En cours
Date de propagation : __________

=================================================================
TESTS
=================================================================

☐ Frontend accessible (https://______.com)
☐ Backend accessible (https://api.______.com/api/health)
☐ SSL actif partout
☐ Création de compte OK
☐ OAuth Gmail OK
☐ OAuth Sheets OK
☐ OAuth Stripe OK
☐ Réception devis OK
☐ Notification OK
☐ Paiement Stripe OK
☐ Webhook Stripe OK
☐ Email de collecte OK

=================================================================
MONITORING
=================================================================

Sentry Frontend DSN : https://______@______.ingest.sentry.io/______
Sentry Backend DSN : https://______@______.ingest.sentry.io/______

Google Analytics ID : G-__________

=================================================================
PROBLÈMES RENCONTRÉS
=================================================================

Problème 1 : 
Date : __________
Solution : 

Problème 2 :
Date : __________
Solution :

=================================================================
MAINTENANCE
=================================================================

Prochaine vérification logs : __________
Prochain backup Firestore : __________
Prochaine mise à jour : __________

=================================================================
CONTACTS SUPPORT
=================================================================

Railway : https://help.railway.app
Vercel : https://vercel.com/support
Stripe : https://support.stripe.com
Firebase : https://firebase.google.com/support

Email support personnel : __________________

=================================================================
```

**💾 Sauvegarder ce fichier dans un endroit SÛR (pas sur Git !)**

---

## 🔐 Template : .env.production (Backend)

**À créer dans Railway → Settings → Variables**

**⚠️ NE PAS créer de fichier .env.production sur votre ordinateur !**
**Tout doit être dans Railway pour la sécurité.**

```env
# ==========================================
# ENVIRONNEMENT
# ==========================================
NODE_ENV=production
PORT=5174

# ==========================================
# FIREBASE PRODUCTION
# ==========================================
FIREBASE_PROJECT_ID=saas-mbe-sdv-production

# Admin SDK (depuis firebase-credentials-prod.json)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@saas-mbe-sdv-production.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXXXX\n-----END PRIVATE KEY-----\n"

# ⚠️ IMPORTANT pour FIREBASE_PRIVATE_KEY :
# 1. Ouvrir firebase-credentials-prod.json
# 2. Copier TOUTE la valeur de "private_key" 
# 3. Inclure les guillemets du début et de la fin
# 4. Les \n doivent rester (ne pas les remplacer)

# ==========================================
# STRIPE LIVE
# ==========================================
STRIPE_SECRET_KEY=sk_live_[VOTRE_CLE_SECRETE_STRIPE]
STRIPE_CONNECT_CLIENT_ID=ca_XXXXXXXXXXXXXXXXXXXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXXXX

# ==========================================
# GOOGLE OAUTH - GMAIL
# ==========================================
GMAIL_CLIENT_ID=XXXXXX.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-XXXXXX
GMAIL_REDIRECT_URI=https://api.votre-domaine.com/auth/gmail/callback

# ==========================================
# GOOGLE OAUTH - SHEETS
# ==========================================
GOOGLE_SHEETS_CLIENT_ID=XXXXXX.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=GOCSPX-XXXXXX
GOOGLE_SHEETS_REDIRECT_URI=https://api.votre-domaine.com/auth/google-sheets/callback

# ==========================================
# GROQ AI (Analyse bordereaux)
# ==========================================
GROQ_API_KEY=gsk_XXXXXXXXXXXXXXXXXXXXXXXXXX

# ==========================================
# EMAIL (Gmail SMTP pour envoi emails)
# ==========================================
EMAIL_FROM=noreply@votre-domaine.com
EMAIL_FROM_NAME=SaaS MBE SDV
GMAIL_USER=votre-email@gmail.com
GMAIL_APP_PASSWORD=votre_mot_de_passe_app_16_caracteres

# Comment obtenir GMAIL_APP_PASSWORD :
# 1. Google Account → Security
# 2. 2-Step Verification (activer si pas fait)
# 3. App passwords → Generate
# 4. App : "SaaS MBE SDV"
# 5. Copier le mot de passe de 16 caractères

# ==========================================
# CORS ET SÉCURITÉ
# ==========================================
FRONTEND_URL=https://votre-domaine.com
ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com

# ⚠️ Remplacer TOUS les "votre-domaine.com" par votre vrai domaine !
```

**📝 Total : 18 variables d'environnement**

---

## 🌐 Template : .env.production (Frontend)

**À ajouter dans Vercel → Settings → Environment Variables**

```env
# ==========================================
# FIREBASE PRODUCTION (Frontend)
# ==========================================
VITE_FIREBASE_API_KEY=AIza____________________________________
VITE_FIREBASE_AUTH_DOMAIN=saas-mbe-sdv-production.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=saas-mbe-sdv-production
VITE_FIREBASE_STORAGE_BUCKET=saas-mbe-sdv-production.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=____________________
VITE_FIREBASE_APP_ID=1:____________________:web:____________________

# ==========================================
# API BACKEND
# ==========================================
VITE_API_URL=https://api.votre-domaine.com

# ==========================================
# STRIPE LIVE (Clé publique seulement)
# ==========================================
VITE_STRIPE_PUBLIC_KEY=pk_live_[VOTRE_CLE_PUBLIQUE_STRIPE]

# ⚠️ Remplacer "votre-domaine.com" par votre vrai domaine !
```

**📝 Total : 9 variables d'environnement**

---

## 🗺️ Template : Configuration DNS

**À configurer chez votre registrar (Namecheap, OVH, GoDaddy, etc.)**

### Exemple Namecheap

```
=== ADVANCED DNS ===

Type        Host        Value                           TTL
------------------------------------------------------------
A Record    @           76.76.21.21                     Automatic
CNAME       www         cname.vercel-dns.com           Automatic
CNAME       api         xxxx.up.railway.app            Automatic
```

### Exemple OVH

```
=== ZONE DNS ===

Type        Sous-domaine    Cible                       TTL
------------------------------------------------------------
A           (vide)          76.76.21.21                 3600
CNAME       www             cname.vercel-dns.com.       3600
CNAME       api             xxxx.up.railway.app.        3600
```

### Exemple GoDaddy

```
=== DNS MANAGEMENT ===

Type        Name        Value                           TTL
------------------------------------------------------------
A           @           76.76.21.21                     1 Hour
CNAME       www         cname.vercel-dns.com           1 Hour
CNAME       api         xxxx.up.railway.app            1 Hour
```

**⚠️ IMPORTANT :**
- `xxxx.up.railway.app` → Remplacer par votre URL Railway
- Certains registrars demandent un `.` à la fin des CNAME (ex: `cname.vercel-dns.com.`)

---

## 🔧 Template : firestore.rules (Production)

**Déjà présent dans votre projet, mais voici la version complète :**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // =====================================================
    // FONCTIONS HELPER
    // =====================================================
    
    // Récupérer le saasAccountId de l'utilisateur connecté
    function getUserSaasAccountId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
    }
    
    // Vérifier que l'utilisateur est authentifié
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Vérifier que l'utilisateur appartient au même compte SaaS
    function belongsToSameSaasAccount(saasAccountId) {
      return isAuthenticated() && getUserSaasAccountId() == saasAccountId;
    }
    
    // =====================================================
    // RÈGLES PAR COLLECTION
    // =====================================================
    
    // Collection users (profils utilisateurs)
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Collection saasAccounts (comptes SaaS)
    match /saasAccounts/{accountId} {
      allow read, write: if belongsToSameSaasAccount(accountId);
    }
    
    // Collection quotes (devis)
    match /quotes/{quoteId} {
      allow read, update, delete: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
      allow create: if isAuthenticated();
    }
    
    // Collection notifications (lecture seule pour clients)
    match /notifications/{notificationId} {
      allow read, delete: if isAuthenticated() 
        && resource.data.clientSaasId == getUserSaasAccountId();
      allow create, update: if false; // Seulement backend
    }
    
    // Collection paiements (lecture seule pour clients)
    match /paiements/{paiementId} {
      allow read: if isAuthenticated() 
        && resource.data.clientSaasId == getUserSaasAccountId();
      allow write: if false; // Seulement backend
    }
    
    // Collection emailMessages
    match /emailMessages/{messageId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection cartons (cartons d'emballage)
    match /cartons/{cartonId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection bordereaux
    match /bordereaux/{bordereauId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection auctionHouses (salles des ventes)
    match /auctionHouses/{houseId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingZones (zones d'expédition)
    match /shippingZones/{zoneId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingServices
    match /shippingServices/{serviceId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingRates (tarifs d'expédition)
    match /shippingRates/{rateId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection weightBrackets (tranches de poids)
    match /weightBrackets/{bracketId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingSettings (paramètres expédition)
    match /shippingSettings/{settingId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shipmentGroups (groupements d'expédition)
    match /shipmentGroups/{groupId} {
      allow read, write: if isAuthenticated() 
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
  }
}
```

**Déployer avec :**
```bash
firebase deploy --only firestore:rules --project saas-mbe-sdv-production
```

---

## 📊 Template : firestore.indexes.json

**Index composites nécessaires**

```json
{
  "indexes": [
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "clientSaasId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "quotes",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "saasAccountId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "quotes",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "saasAccountId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "paiements",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "clientSaasId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "paiements",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "devisId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "emailMessages",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "saasAccountId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "date",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

**Déployer avec :**
```bash
firebase deploy --only firestore:indexes --project saas-mbe-sdv-production
```

---

## 📧 Template : Email Gmail App Password

**Comment obtenir un mot de passe d'application Gmail :**

### Étape 1 : Activer la Vérification en 2 Étapes

1. **Aller sur https://myaccount.google.com/security**
2. **Section "Signing in to Google"**
3. **Cliquer sur "2-Step Verification"**
4. **Suivre les instructions pour l'activer**
5. **✅ Vérification en 2 étapes activée**

### Étape 2 : Générer un Mot de Passe d'Application

1. **Retourner sur https://myaccount.google.com/security**
2. **Section "Signing in to Google" → "2-Step Verification"**
3. **Descendre jusqu'à "App passwords"**
4. **Cliquer sur "App passwords"**
5. **Si demandé, se reconnecter**
6. **App name : "SaaS MBE SDV Production"**
7. **Create**
8. **Copier le mot de passe de 16 caractères** (ex: `abcd efgh ijkl mnop`)
9. **⚠️ NOTER dans NOTES_DEPLOIEMENT.txt**
10. **Utiliser pour `GMAIL_APP_PASSWORD` dans Railway**

---

## 🧪 Template : Script de Test Production

**Créer ce fichier pour tester rapidement :** `test-production.sh`

```bash
#!/bin/bash

echo "🧪 Tests de Production - SaaS MBE SDV"
echo "======================================"
echo ""

# Remplacer par votre domaine
DOMAIN="votre-domaine.com"

echo "1️⃣ Test Frontend..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN)
if [ $FRONTEND_STATUS -eq 200 ]; then
  echo "   ✅ Frontend OK (HTTP $FRONTEND_STATUS)"
else
  echo "   ❌ Frontend ERREUR (HTTP $FRONTEND_STATUS)"
fi

echo ""
echo "2️⃣ Test Backend API..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.$DOMAIN/api/health)
if [ $BACKEND_STATUS -eq 200 ]; then
  echo "   ✅ Backend OK (HTTP $BACKEND_STATUS)"
else
  echo "   ❌ Backend ERREUR (HTTP $BACKEND_STATUS)"
fi

echo ""
echo "3️⃣ Test SSL Frontend..."
SSL_FRONTEND=$(curl -I -s https://$DOMAIN | grep -i "HTTP/2 200")
if [ ! -z "$SSL_FRONTEND" ]; then
  echo "   ✅ SSL Frontend OK"
else
  echo "   ❌ SSL Frontend ERREUR"
fi

echo ""
echo "4️⃣ Test SSL Backend..."
SSL_BACKEND=$(curl -I -s https://api.$DOMAIN/api/health | grep -i "HTTP")
if [ ! -z "$SSL_BACKEND" ]; then
  echo "   ✅ SSL Backend OK"
else
  echo "   ❌ SSL Backend ERREUR"
fi

echo ""
echo "5️⃣ Test DNS..."
DNS_CHECK=$(nslookup $DOMAIN | grep "76.76.21.21")
if [ ! -z "$DNS_CHECK" ]; then
  echo "   ✅ DNS OK"
else
  echo "   ❌ DNS ERREUR"
fi

echo ""
echo "======================================"
echo "🎉 Tests terminés !"
```

**Utilisation :**
```bash
# Windows (Git Bash)
bash test-production.sh

# macOS/Linux
chmod +x test-production.sh
./test-production.sh
```

---

## 📱 Template : Page de Statut (status.html)

**À créer et déployer sur votre site**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statut - SaaS MBE SDV</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .status-card {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .service {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      border-bottom: 1px solid #e5e5e5;
    }
    .service:last-child {
      border-bottom: none;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .status.ok { color: #22c55e; }
    .status.warning { color: #f59e0b; }
    .status.error { color: #ef4444; }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: currentColor;
    }
    h1 {
      text-align: center;
      color: #111;
    }
    .updated {
      text-align: center;
      color: #666;
      font-size: 14px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="status-card">
    <h1>📊 Statut des Services</h1>
    
    <div class="service">
      <span>Frontend (Application Web)</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <div class="service">
      <span>Backend (API)</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <div class="service">
      <span>Base de données (Firebase)</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <div class="service">
      <span>Paiements (Stripe)</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <div class="service">
      <span>Emails (Gmail/Resend)</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <div class="service">
      <span>Notifications</span>
      <div class="status ok">
        <span class="dot"></span>
        Opérationnel
      </div>
    </div>
    
    <p class="updated">
      Dernière mise à jour : <span id="updated"></span>
    </p>
  </div>
  
  <script>
    // Afficher la date actuelle
    document.getElementById('updated').textContent = new Date().toLocaleString('fr-FR');
    
    // Test automatique des services (optionnel)
    async function checkServices() {
      try {
        const response = await fetch('https://api.votre-domaine.com/api/health');
        if (!response.ok) {
          // Marquer le backend en erreur
          console.error('Backend error');
        }
      } catch (error) {
        console.error('Backend error:', error);
      }
    }
    
    checkServices();
  </script>
</body>
</html>
```

**Déployer cette page :**
1. Créer `front end/public/status.html`
2. Commit et push
3. Vercel redéploie automatiquement
4. Accessible sur `https://votre-domaine.com/status.html`

---

## 📝 Template : Guide Utilisateur Simple

**Créer ce fichier pour vos utilisateurs :** `GUIDE_UTILISATEUR.md`

```markdown
# 📖 Guide Utilisateur - SaaS MBE SDV

## 🚀 Démarrage Rapide

### 1. Créer un Compte

1. Aller sur https://votre-domaine.com
2. Cliquer sur "S'inscrire"
3. Entrer votre email et mot de passe
4. Vérifier votre email
5. Se connecter

### 2. Connecter Gmail

1. Aller dans **Paramètres** → **Intégrations**
2. Section **Gmail** → Cliquer **"Connecter Gmail"**
3. Autoriser l'application
4. ✅ Gmail connecté

### 3. Connecter Google Sheets

1. Section **Google Sheets** → Cliquer **"Connecter Google Sheets"**
2. Autoriser l'application
3. Sélectionner votre feuille de calcul avec les devis
4. ✅ Google Sheets connecté

### 4. Connecter Stripe

1. Section **Paiements** → Cliquer **"Connecter Stripe"**
2. Se connecter à votre compte Stripe
3. Autoriser l'application
4. ✅ Stripe connecté

### 5. Recevoir des Devis

Les devis arrivent automatiquement depuis Google Sheets toutes les 5 minutes.

1. Aller dans **"Nouveaux devis"**
2. Voir la liste des devis
3. Cliquer **"Voir détails"** sur un devis

### 6. Générer un Lien de Paiement

Le lien est **généré automatiquement** dans l'onglet "Paiements" du devis.

1. Copier le lien
2. L'envoyer à votre client
3. Le client paie
4. Vous recevez une notification
5. Le statut passe à "Payé"

### 7. Planifier une Collecte

1. Aller dans **"Collections"**
2. Sélectionner les devis à collecter
3. Cliquer **"Planifier une collecte"**
4. Choisir date et heure
5. Envoyer la demande
6. Un email est envoyé à la salle des ventes

## 🔔 Notifications

Vous recevez une notification pour :
- ✅ Nouveau devis reçu
- ✅ Nouveau message client
- ✅ Paiement reçu
- ✅ Problème OAuth (token expiré)

## 📞 Support

Email : support@votre-domaine.com
```

---

## 🔑 Template : .gitignore (Vérification)

**Assurez-vous que ces fichiers sont dans `.gitignore` :**

```gitignore
# Environment files
.env
.env.local
.env.production
.env.*.local

# Firebase credentials
firebase-credentials.json
firebase-credentials-prod.json
*-credentials.json
**/*-credentials.json

# Logs
*.log
logs/
npm-debug.log*

# Dependencies
node_modules/

# Build
dist/
build/

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Production notes (ne pas commiter !)
NOTES_DEPLOIEMENT.txt
PRODUCTION_CONFIG.txt
```

---

## 🎯 Checklist Finale - Ai-je Tout ?

### Fichiers Créés

- [ ] `NOTES_DEPLOIEMENT.txt` (avec toutes mes infos) ✅
- [ ] `firebase-credentials-prod.json` (dans un endroit sûr) ✅
- [ ] `PRODUCTION_CONFIG.txt` (backup de config) ✅

### Services Configurés

- [ ] Firebase Production (nouveau projet) ✅
- [ ] Stripe Live (compte activé) ✅
- [ ] Google Cloud OAuth (2 clients) ✅
- [ ] Railway (backend déployé) ✅
- [ ] Vercel (frontend déployé) ✅
- [ ] DNS (3 records configurés) ✅

### Variables d'Environnement

- [ ] Railway : 18 variables ✅
- [ ] Vercel : 9 variables ✅
- [ ] Toutes les valeurs sont de production (pas dev) ✅

### Tests Effectués

- [ ] Création de compte ✅
- [ ] OAuth Gmail ✅
- [ ] OAuth Sheets ✅
- [ ] OAuth Stripe ✅
- [ ] Réception devis ✅
- [ ] Notification ✅
- [ ] Paiement ✅
- [ ] Webhook ✅
- [ ] Email ✅

### Monitoring

- [ ] Logs Railway accessibles ✅
- [ ] Logs Vercel accessibles ✅
- [ ] Sentry configuré (optionnel) ✅
- [ ] Alertes email activées ✅

---

## 🎊 VOUS AVEZ TERMINÉ !

**Votre application SaaS MBE SDV est maintenant EN PRODUCTION ! 🚀**

**Prochaines étapes :**
1. Surveiller les logs pendant 48h
2. Inviter les premiers utilisateurs
3. Collecter les feedbacks
4. Planifier les améliorations

---

**Version :** 2.0  
**Dernière mise à jour :** 29 janvier 2026  
**Complétude :** 100% ✅
