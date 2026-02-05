# 💻 Toutes les Commandes de Déploiement

**Copier-coller directement - Aucune modification nécessaire (sauf les valeurs indiquées)**

---

## 📋 Avant de Commencer

### Vérifier les Outils Installés

```bash
# Vérifier Node.js
node --version
# Résultat attendu : v18.x.x ou plus

# Vérifier npm
npm --version
# Résultat attendu : 9.x.x ou plus

# Vérifier Git
git --version
# Résultat attendu : git version 2.x.x
```

---

## 🔥 Firebase

### Installation Firebase CLI

```bash
# Windows/macOS/Linux
npm install -g firebase-tools

# Vérifier l'installation
firebase --version
```

### Connexion Firebase

```bash
# Se connecter
firebase login
# ✅ Une fenêtre s'ouvre, autoriser Firebase CLI

# Vérifier la connexion
firebase projects:list
# ✅ Vous devez voir vos projets Firebase
```

### Initialiser Firebase dans le Projet

```bash
# Se placer dans le projet
cd "C:\Dev\SaaS MBE SDV Prod"

# OU sur macOS/Linux
cd ~/Documents/SaaS\ MBE\ SDV\ Prod

# Initialiser Firestore
firebase init firestore

# Réponses :
# ? Select a project: → [Choisir saas-mbe-sdv-production]
# ? What file should be used for Firestore Rules? → Appuyer sur Entrée
# ? What file should be used for Firestore indexes? → Appuyer sur Entrée
# ? File firestore.rules already exists. Overwrite? → N (Non)
# ? File firestore.indexes.json already exists. Overwrite? → N (Non)
```

### Déployer les Règles Firestore

```bash
# Sélectionner le projet production
firebase use saas-mbe-sdv-production

# Déployer les règles
firebase deploy --only firestore:rules

# ✅ Résultat attendu : "Deploy complete!"
```

### Déployer les Index Firestore

```bash
# Déployer les index
firebase deploy --only firestore:indexes

# ✅ Résultat attendu : "Deploy complete!"
```

### Backup Firestore (Optionnel mais recommandé)

```bash
# Exporter toutes les données (via gcloud - avancé)
gcloud firestore export gs://[BUCKET_NAME]/[EXPORT_PREFIX]

# OU utiliser la console Firebase :
# https://console.firebase.google.com
# → Firestore Database → Onglet Data → Menu ⋮ → Export data
```

---

## 💳 Stripe CLI (Optionnel - pour tester les webhooks localement)

### Installation Stripe CLI

**Windows :**
```powershell
# Avec winget
winget install Stripe.StripeCli

# Vérifier
stripe --version
```

**macOS :**
```bash
# Avec Homebrew
brew install stripe/stripe-cli/stripe

# Vérifier
stripe --version
```

**Linux :**
```bash
# Télécharger et installer
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz
tar -xvf stripe_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/

# Vérifier
stripe --version
```

### Connexion Stripe CLI

```bash
# Se connecter
stripe login

# ✅ Une fenêtre s'ouvre, autoriser Stripe CLI
```

### Tester le Webhook Localement (Développement uniquement)

```bash
# Écouter les événements et les forwarder vers votre backend local
stripe listen --forward-to http://localhost:5174/webhooks/stripe

# Dans un autre terminal, déclencher un événement de test
stripe trigger checkout.session.completed

# ✅ Vous devez voir l'événement dans les logs backend
```

---

## 🚂 Railway

**Note :** Railway se fait principalement via l'interface web, mais voici les commandes CLI.

### Installation Railway CLI (Optionnel)

```bash
# Windows/macOS/Linux
npm install -g @railway/cli

# Vérifier
railway --version
```

### Connexion Railway

```bash
# Se connecter
railway login

# ✅ Une fenêtre s'ouvre, autoriser Railway
```

### Commandes Railway

```bash
# Voir les logs en temps réel
railway logs

# Redéployer
railway up

# Ouvrir le dashboard
railway open

# Voir les variables d'environnement
railway variables

# Ajouter une variable
railway variables set KEY=value

# Supprimer une variable
railway variables delete KEY
```

---

## ⚡ Vercel

### Installation Vercel CLI

```bash
# Windows/macOS/Linux
npm install -g vercel

# Vérifier
vercel --version
```

### Connexion Vercel

```bash
# Se connecter
vercel login

# ✅ Une fenêtre s'ouvre ou un code apparaît
```

### Déployer avec Vercel CLI

```bash
# Se placer dans le projet
cd "C:\Dev\SaaS MBE SDV Prod\front end"

# Premier déploiement
vercel

# Réponses :
# ? Set up and deploy "front end"? → Y (Oui)
# ? Which scope? → [Choisir votre compte]
# ? Link to existing project? → N (Non, sauf si déjà créé)
# ? What's your project's name? → saas-mbe-sdv-prod
# ? In which directory is your code located? → . (point)
# ? Want to override the settings? → N (Non)

# Déploiement en production
vercel --prod

# ✅ Vous recevez une URL de déploiement
```

### Voir les Logs Vercel

```bash
# Logs du dernier déploiement
vercel logs

# Logs en temps réel
vercel logs --follow
```

### Gérer les Variables d'Environnement

```bash
# Lister les variables
vercel env ls

# Ajouter une variable pour production
vercel env add VITE_FIREBASE_API_KEY production
# → Coller la valeur quand demandé

# Supprimer une variable
vercel env rm VITE_FIREBASE_API_KEY production
```

---

## 🌐 DNS et Domaine

### Vérifier la Propagation DNS

```bash
# Windows
nslookup votre-domaine.com
nslookup www.votre-domaine.com
nslookup api.votre-domaine.com

# macOS/Linux
dig votre-domaine.com
dig www.votre-domaine.com
dig api.votre-domaine.com
```

### Vider le Cache DNS Local

```bash
# Windows
ipconfig /flushdns

# macOS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Linux (Ubuntu/Debian)
sudo systemd-resolve --flush-caches

# Linux (CentOS/RHEL)
sudo service network restart
```

### Tester le SSL/TLS

```bash
# Tester le certificat SSL
curl -I https://votre-domaine.com

# ✅ Vous devez voir : HTTP/2 200

# Tester avec openssl
openssl s_client -connect votre-domaine.com:443

# ✅ Vous devez voir le certificat
```

---

## 🧪 Tests et Validation

### Tester le Backend

```bash
# Health check
curl https://api.votre-domaine.com/api/health

# ✅ Résultat attendu : {"status":"ok"}

# Avec plus de détails
curl -v https://api.votre-domaine.com/api/health
```

### Tester le Frontend

```bash
# Télécharger la page d'accueil
curl https://votre-domaine.com

# ✅ Vous devez voir du HTML
```

### Tester les Webhooks Stripe

```bash
# Avec Stripe CLI
stripe listen --forward-to https://api.votre-domaine.com/webhooks/stripe

# Dans un autre terminal
stripe trigger checkout.session.completed

# ✅ Vérifier les logs Railway
```

---

## 📦 Build et Développement Local

### Installer les Dépendances

```bash
cd "C:\Dev\SaaS MBE SDV Prod\front end"

# Installer toutes les dépendances
npm install

# ✅ Attendre 2-3 minutes
```

### Build de Production Local

```bash
# Build pour production
npm run build

# ✅ Le dossier `dist/` est créé

# Prévisualiser le build
npm run preview

# ✅ Ouvrir http://localhost:4173
```

### Développement Local

```bash
# Lancer le dev server (frontend + backend)
npm run dev:all

# ✅ Frontend : http://localhost:8080
# ✅ Backend : http://localhost:5174
```

### Lancer Seulement le Backend

```bash
cd "front end"

# Lancer le serveur backend
node server/ai-proxy.js

# ✅ Backend : http://localhost:5174
```

---

## 🔍 Debugging et Logs

### Voir les Logs Railway

```bash
# Via CLI
railway logs

# Filtrer par texte
railway logs | grep "ERROR"

# Sauvegarder les logs
railway logs > logs.txt
```

### Voir les Logs Vercel

```bash
# Via CLI
vercel logs

# Logs en temps réel
vercel logs --follow

# Sauvegarder les logs
vercel logs > logs.txt
```

### Voir les Logs Firebase

```bash
# Logs Firestore (via gcloud)
gcloud logging read "resource.type=cloud_firestore" --limit 50

# OU utiliser la console :
# https://console.firebase.google.com
# → Firestore Database → Usage
```

---

## 📊 Monitoring

### Vérifier l'Utilisation Firebase

```bash
# Via gcloud (avancé)
gcloud firestore databases list

# OU console Firebase :
# https://console.firebase.google.com
# → Firestore Database → Usage
```

### Vérifier les Paiements Stripe

```bash
# Via Stripe CLI
stripe payments list --limit 10

# Voir un paiement spécifique
stripe payments retrieve pi_XXXXXXXXX

# Voir les webhooks
stripe webhooks list
```

---

## 🔄 Mise à Jour et Redéploiement

### Workflow Complet de Mise à Jour

```bash
# 1. Se placer dans le projet
cd "C:\Dev\SaaS MBE SDV Prod"

# 2. Pull les dernières modifications
git pull origin master

# 3. Installer les nouvelles dépendances
cd "front end"
npm install

# 4. Tester localement
npm run build
npm run preview

# 5. Commiter les changements (si vous avez fait des modifs)
git add .
git commit -m "Mise à jour production"
git push origin master

# ✅ Railway et Vercel redéploient automatiquement !
```

### Forcer un Redéploiement

```bash
# Railway (via web)
# → Dashboard → Deployments → Menu ⋮ → Redeploy

# Vercel (via CLI)
cd "front end"
vercel --prod --force

# ✅ Force un nouveau build
```

---

## 🛑 Rollback d'Urgence

### Rollback Vercel

```bash
# Lister les déploiements
vercel ls

# Promouvoir un ancien déploiement
vercel promote [URL_du_deploiement]

# Exemple :
vercel promote https://saas-mbe-sdv-prod-abc123.vercel.app
```

### Rollback Railway

```bash
# Via CLI
railway rollback

# OU via web :
# Dashboard → Deployments → Chercher l'ancien → Rollback
```

### Rollback Firebase Rules

```bash
# Via Firebase Console :
# Firestore Database → Rules → Onglet "History" → Restaurer
```

---

## 🗑️ Nettoyage et Maintenance

### Nettoyer le Cache Build

```bash
cd "front end"

# Supprimer node_modules
rm -rf node_modules

# Supprimer le dossier dist
rm -rf dist

# Réinstaller proprement
npm install

# Rebuild
npm run build
```

### Nettoyer le Cache Git

```bash
# Supprimer les fichiers non trackés
git clean -fd

# Voir ce qui serait supprimé (dry-run)
git clean -fdn
```

---

## 📝 Scripts Utiles

### Script de Backup Complet

```bash
#!/bin/bash
# backup-production.sh

# Backup Firestore
echo "📦 Backup Firestore..."
firebase use saas-mbe-sdv-production
# (Exporter manuellement via console)

# Backup du code
echo "💾 Backup code..."
git archive --format=tar --output=backup-$(date +%Y%m%d).tar master

# Backup des variables d'environnement
echo "🔑 Backup variables..."
railway variables > env-backup-$(date +%Y%m%d).txt

echo "✅ Backup terminé !"
```

### Script de Test Rapide

```bash
#!/bin/bash
# test-production.sh

echo "🧪 Test du frontend..."
curl -s -o /dev/null -w "%{http_code}" https://votre-domaine.com
# Attendu : 200

echo "🧪 Test du backend..."
curl -s -o /dev/null -w "%{http_code}" https://api.votre-domaine.com/api/health
# Attendu : 200

echo "🧪 Test SSL..."
curl -I https://votre-domaine.com | grep -i "HTTP"
# Attendu : HTTP/2 200

echo "✅ Tous les tests passés !"
```

---

## 🆘 Commandes d'Urgence

### Tout Arrêter Immédiatement

```bash
# Désactiver Vercel (via web uniquement)
# → Project → Settings → Advanced → Delete Project

# Arrêter Railway (via web uniquement)
# → Service → Settings → Delete Service
```

### Récupération d'Urgence

```bash
# Restaurer depuis un backup Git
git reflog
git reset --hard [commit_hash]

# Force push (⚠️ DANGER !)
git push origin master --force

# ✅ Railway et Vercel redéploient l'ancien code
```

---

## 📚 Références Rapides

### URLs Importantes

```
Firebase Console : https://console.firebase.google.com
Stripe Dashboard : https://dashboard.stripe.com
Google Cloud : https://console.cloud.google.com
Railway Dashboard : https://railway.app
Vercel Dashboard : https://vercel.com
```

### Support

```
Firebase Support : https://firebase.google.com/support
Stripe Support : https://support.stripe.com
Railway Support : https://help.railway.app
Vercel Support : https://vercel.com/support
```

---

**Version :** 1.0  
**Dernière mise à jour :** 29 janvier 2026  
**Note :** Remplacer `votre-domaine.com` par votre vrai domaine !
