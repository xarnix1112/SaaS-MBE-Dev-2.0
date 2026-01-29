# ✅ Checklist Rapide - Mise en Production

## 🔥 URGENT - Avant Toute Chose

- [ ] **BACKUP COMPLET** de Firestore (export depuis console)
- [ ] **Créer projet Firebase SÉPARÉ** pour production
- [ ] **NE PAS utiliser les clés de dev** en production

---

## 1️⃣ Firebase (30 min)

- [ ] Créer nouveau projet : `saas-mbe-sdv-production`
- [ ] Activer Firestore (mode production)
- [ ] Activer Authentication
- [ ] Télécharger clés Admin SDK (nouveau fichier JSON)
- [ ] Déployer règles de sécurité : `firebase deploy --only firestore:rules`
- [ ] Créer index composites (notifications, quotes, paiements)

---

## 2️⃣ Stripe (15 min)

- [ ] Activer compte Stripe (KYC)
- [ ] Basculer en mode "Live"
- [ ] Copier clés Live (commencent par sk_live_ et pk_live_)
- [ ] Configurer webhook : `https://api.votre-domaine.com/webhooks/stripe`
- [ ] Noter Webhook Secret (commence par whsec_)
- [ ] Configurer OAuth Stripe Connect (Redirect URI production)

---

## 3️⃣ Variables d'Environnement (20 min)

### Backend `.env.production`
- [ ] `NODE_ENV=production`
- [ ] `FIREBASE_PROJECT_ID` (production)
- [ ] `STRIPE_SECRET_KEY` (clé live Stripe)
- [ ] `STRIPE_WEBHOOK_SECRET` (secret webhook)
- [ ] `GMAIL_REDIRECT_URI` (production)
- [ ] `GOOGLE_SHEETS_REDIRECT_URI` (production)
- [ ] `FRONTEND_URL=https://votre-domaine.com`
- [ ] `ALLOWED_ORIGINS=https://votre-domaine.com`

### Frontend `.env.production`
- [ ] `VITE_FIREBASE_API_KEY` (production)
- [ ] `VITE_FIREBASE_PROJECT_ID` (production)
- [ ] `VITE_API_URL=https://api.votre-domaine.com`
- [ ] `VITE_STRIPE_PUBLIC_KEY` (clé publique live)

---

## 4️⃣ Build Frontend (10 min)

```bash
cd "front end"
npm install
npm run build
npm run preview  # Tester localement
```

- [ ] Build sans erreurs
- [ ] Dossier `dist/` créé
- [ ] Test local OK

---

## 5️⃣ Hébergement Backend (30 min)

### Option Railway (Recommandé)

- [ ] Compte créé sur https://railway.app
- [ ] Connecter GitHub
- [ ] New Project → Deploy from repo
- [ ] Root Directory : `front end`
- [ ] Start Command : `node server/ai-proxy.js`
- [ ] Ajouter TOUTES les variables d'environnement
- [ ] Vérifier logs : aucune erreur au démarrage
- [ ] Configurer domaine : `api.votre-domaine.com`

---

## 6️⃣ Hébergement Frontend (30 min)

### Option Vercel (Recommandé)

- [ ] Compte créé sur https://vercel.com
- [ ] Import from GitHub
- [ ] Root Directory : `front end`
- [ ] Build Command : `npm run build`
- [ ] Output Directory : `dist`
- [ ] Ajouter variables `VITE_*`
- [ ] Configurer domaine : `votre-domaine.com`
- [ ] Test : site accessible via HTTPS

---

## 7️⃣ DNS (15 min)

Chez votre registrar (Namecheap, OVH, etc.) :

- [ ] A Record : `@` → `76.76.21.21` (Vercel)
- [ ] CNAME : `www` → `cname.vercel-dns.com`
- [ ] CNAME : `api` → `your-app.up.railway.app`
- [ ] Attendre propagation DNS (5-30 min)
- [ ] Vérifier : `nslookup votre-domaine.com`

---

## 8️⃣ Sécurité (20 min)

- [ ] Toutes les clés API régénérées (ne pas réutiliser celles de dev)
- [ ] `.env` et `.env.production` dans `.gitignore`
- [ ] Règles Firestore déployées et testées
- [ ] CORS configuré (seulement votre domaine)
- [ ] HTTPS forcé partout
- [ ] Headers de sécurité (Helmet.js)
- [ ] Rate limiting activé

---

## 9️⃣ Tests Production (30 min)

- [ ] Frontend accessible : https://votre-domaine.com
- [ ] Backend accessible : https://api.votre-domaine.com/api/health
- [ ] Création compte
- [ ] Connexion Firebase Auth
- [ ] OAuth Google (Gmail, Sheets, Drive)
- [ ] Réception nouveau devis
- [ ] Notification reçue
- [ ] Paiement Stripe (mode Live)
- [ ] Webhook Stripe reçu
- [ ] Email envoyé

---

## 🔟 Monitoring (15 min)

- [ ] Sentry configuré (erreurs frontend + backend)
- [ ] Google Analytics activé
- [ ] Logs backend accessibles (Railway/Render dashboard)
- [ ] Backup Firestore automatique activé
- [ ] Page de statut créée (optionnel)

---

## 🎉 Post-Déploiement (24h)

### Surveillance Immédiate
- [ ] Vérifier logs toutes les heures (premières 4h)
- [ ] Tester toutes les fonctionnalités critiques
- [ ] Surveiller erreurs Sentry
- [ ] Vérifier paiements Stripe

### Jour 1-7
- [ ] Vérifier logs quotidiennement
- [ ] Surveiller performances (temps de réponse)
- [ ] Vérifier tous les webhooks
- [ ] Backup manuel Firestore (J+1, J+3, J+7)

---

## 🆘 Rollback d'Urgence

Si problème critique :

1. **Frontend** : Vercel → Deployments → Promote previous
2. **Backend** : Railway → Deployments → Rollback
3. **Firebase** : Restaurer backup
4. **DNS** : Repasser sur ancien serveur (si applicable)

**Support d'urgence :**
- Vercel : https://vercel.com/support
- Railway : https://help.railway.app
- Stripe : https://support.stripe.com

---

## 📊 Temps Total Estimé

| Étape | Temps |
|-------|-------|
| Firebase | 30 min |
| Stripe | 15 min |
| Variables env | 20 min |
| Build | 10 min |
| Backend deploy | 30 min |
| Frontend deploy | 30 min |
| DNS | 15 min |
| Sécurité | 20 min |
| Tests | 30 min |
| Monitoring | 15 min |
| **TOTAL** | **~3h30** |

---

## 💰 Coûts

- Vercel : Gratuit (Hobby) ou $20/mois (Pro)
- Railway : $5/mois (Hobby) + usage
- Firebase : $0-50/mois (usage)
- Domaine : ~10€/an
- **Total : ~15-30€/mois**

---

## 📝 Notes Importantes

⚠️ **NE PAS** :
- Utiliser les clés de test en production
- Commiter les fichiers `.env`
- Oublier de configurer CORS
- Négliger les règles Firestore
- Oublier le backup avant migration

✅ **FAIRE** :
- Tester en staging avant production
- Documenter chaque changement
- Surveiller les logs 24h-48h
- Avoir un plan de rollback
- Communiquer avec les utilisateurs

---

**Version :** 1.0  
**Date :** 29 janvier 2026
