# 🪟 Guide de Configuration et Utilisation sur Windows

**Version** : 2.0.1  
**Dernière mise à jour** : 27 janvier 2026

---

## 🚀 Démarrage rapide

### Option 1 : Double-clic (Recommandé)
1. **Double-cliquez** sur `start-dev.bat` à la racine du projet
2. Une fenêtre de terminal s'ouvre avec les logs
3. Après 3 secondes, le navigateur s'ouvre sur http://localhost:8080
4. **Ne fermez pas le terminal** - l'application tourne dedans

### Option 2 : Via PowerShell
```powershell
cd "C:\Dev\SaaS MBE SDV\front end"
npm run dev:all
```

---

## 📦 Prérequis

### Obligatoires
- ✅ **Node.js** 18+ (avec npm)
- ✅ **Git** pour Windows
- ✅ **GitHub CLI** (gh) version 2.86.0+

### Optionnels
- ⚠️ **Stripe CLI** (pour webhooks locaux uniquement)

---

## ⚙️ Configuration

### 1. Fichier `.env.local`

**Emplacement** : `front end/.env.local`

Ce fichier contient toutes les variables d'environnement nécessaires :

```env
# API IA (Groq)
GROQ_API_KEY=votre_clé_groq

# Firebase
VITE_FIREBASE_API_KEY=votre_clé_firebase
VITE_FIREBASE_PROJECT_ID=votre_project_id
# ... autres configs Firebase

# Gmail OAuth
GMAIL_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=votre_secret
GMAIL_REDIRECT_URI=http://localhost:5174/auth/gmail/callback

# Google Sheets OAuth
GOOGLE_SHEETS_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=votre_secret
GOOGLE_SHEETS_REDIRECT_URI=http://localhost:5174/auth/google-sheets/callback

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
SMTP_PROVIDER=gmail
GMAIL_USER=votre_email@gmail.com
GMAIL_APP_PASSWORD=votre_mot_de_passe_app
EMAIL_FROM=votre_email@gmail.com

# Application
APP_URL=http://localhost:8080
PORT=5174
```

⚠️ **Ce fichier est dans `.gitignore` et ne doit JAMAIS être commité sur GitHub !**

### 2. Credentials Firebase

**Fichier** : `front end/firebase-credentials.json`

Structure attendue :
```json
{
  "type": "service_account",
  "project_id": "sdv-automation-mbe",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "..."
}
```

⚠️ **Ce fichier est dans `.gitignore` et ne doit JAMAIS être commité sur GitHub !**

---

## 🔧 Résolution de problèmes

### Port 8080 déjà utilisé

**Symptôme** :
```
Port 8080 is in use, trying another one...
[dev-all] Vite ready on http://localhost:8081/
```

**Solution** :
1. Trouvez le processus :
   ```powershell
   netstat -ano | findstr ":8080"
   ```
2. Arrêtez le processus :
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
3. Relancez l'application

### Tokens OAuth expirés

**Symptôme** :
- Notification dans l'interface : "⚠️ Connexion Gmail/Google Sheets expirée"
- Dans les logs : `GaxiosError: invalid_grant` ou `Token has been expired or revoked`

**Solution automatique** :
1. Une notification apparaît dans l'interface avec les instructions
2. Suivez les instructions dans la notification
3. Allez dans **Paramètres > Intégrations**
4. Cliquez sur **Se reconnecter** ou **Resynchroniser**
5. Autorisez l'accès à votre compte
6. ✅ Le polling reprend automatiquement

**C'est normal !** Les tokens OAuth expirent régulièrement pour des raisons de sécurité.

### Gmail/Google Sheets ne synchronise pas

**Vérifications** :
1. ✅ Les variables `GMAIL_CLIENT_ID` et `GMAIL_CLIENT_SECRET` sont dans `.env.local`
2. ✅ Les variables `GOOGLE_SHEETS_CLIENT_ID` et `GOOGLE_SHEETS_CLIENT_SECRET` sont dans `.env.local`
3. ✅ Vous êtes connecté depuis l'interface (Paramètres > Intégrations)
4. ✅ Les tokens ne sont pas expirés

**Dans les logs, vous devez voir** :
```
[Gmail OAuth] ✅ OAuth2 client initialisé
[Google Sheets OAuth] ✅ OAuth2 client initialisé
[Gmail Sync] ✅ Polling Gmail activé (toutes les 5 minutes)
[Google Sheets Sync] ✅ Polling Google Sheets activé (toutes les 5 minutes)
```

### Stripe CLI non trouvé (non critique)

**Symptôme** :
```
[dev-all] ❌ Erreur lors du lancement de Stripe CLI: spawn stripe ENOENT
```

**Explication** : Stripe CLI n'est pas installé sur Windows

**Impact** :
- ❌ Les webhooks locaux ne fonctionnent pas
- ✅ Tous les autres paiements Stripe fonctionnent
- ✅ Les webhooks en production fonctionnent

**Solution (optionnelle)** :
1. Téléchargez : https://stripe.com/docs/stripe-cli
2. Installez sur Windows
3. Authentifiez : `stripe login`
4. Redémarrez l'application

---

## 📱 Accès à l'application

### URLs
- **Application** : http://localhost:8080
- **API Backend** : http://localhost:5174
- **Health check** : http://localhost:5174/api/health

### Logs
Les logs s'affichent en temps réel dans la fenêtre de terminal ouverte par `start-dev.bat`

### Arrêter l'application
Fermez simplement la fenêtre de terminal ou appuyez sur `Ctrl+C`

---

## 🔐 Sécurité

### Fichiers sensibles (ne JAMAIS commiter)
- `front end/.env.local` : Variables d'environnement et secrets
- `front end/firebase-credentials.json` : Credentials Firebase Admin
- Tout fichier `*-credentials.json`

Ces fichiers sont automatiquement exclus par `.gitignore`.

### Secrets GitHub Push Protection
GitHub bloque automatiquement les push contenant des secrets détectés :
- Clés API Google
- Tokens Stripe
- Credentials Firebase
- Mots de passe

Si un push est bloqué, nettoyez les secrets et refaites un commit.

---

## 🆘 Support

### Commandes utiles
```powershell
# Vérifier les processus Node
Get-Process node

# Trouver quel processus utilise un port
netstat -ano | findstr ":8080"

# Arrêter un processus
Stop-Process -Id <PID> -Force

# Vérifier GitHub CLI
gh --version
gh auth status

# Vérifier Git
git status
git remote -v
```

### Logs de debug
Les logs détaillés sont disponibles dans :
- Terminal PowerShell/CMD (en temps réel)
- Console du navigateur (erreurs frontend)

---

## 📚 Documentation complémentaire

- [CHANGELOG_WINDOWS_SETUP_2026-01-27.md](./CHANGELOG_WINDOWS_SETUP_2026-01-27.md) : Détails des modifications
- [README.md](./README.md) : Documentation principale du projet
- [START_HERE.md](./START_HERE.md) : Guide de démarrage général
- [DEMARRAGE_RAPIDE.md](./DEMARRAGE_RAPIDE.md) : Guide rapide

---

## ✅ Statut actuel

**Configuration Windows** : 🟢 Opérationnelle  
**Synchronisation Mac/Windows** : 🟢 100%  
**Services OAuth** : 🟢 Fonctionnels  
**Notifications automatiques** : 🟢 Actives  
**Repository GitHub** : 🟢 Configuré  

---

**Dernière vérification** : 27/01/2026 20:00 UTC+1  
**Testé sur** : Windows 10 Build 26100
