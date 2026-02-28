# Checklist déploiement Production (staging → master)

> Après merge de `staging` sur `master`, suivre les étapes ci-dessous pour que la production fonctionne correctement.

Ce document liste tout ce à faire pour que les fonctionnalités staging fonctionnent correctement en production après le merge sur `master`.

---

## Résumé des fonctionnalités déployées (3 derniers jours)

| Fonctionnalité | Statut | Dépendances |
|----------------|--------|-------------|
| **Exclure devis sent_to_mbe_hub de Nouveaux devis** | ✅ OK | Aucune |
| **Suppression bouton Envoyer MBE Hub** (page détail) | ✅ OK | Aucune |
| **Réanalyse OCR** (polling timeline, regenerate lien) | ✅ OK | Backend + GROQ_API_KEY |
| **Tarifs MBE Express** (options.express dans calculateDevisFromOCR) | ✅ OK | MBE Hub configuré |
| **MBE Smart Choice** (grille attend mbehub, auto-apply, 2 liens Standard+Express) | ✅ OK | MBE Hub + Paramètres |
| **Index Firestore** (paiements devisId+type+status) | ✅ OK | Déployer indexes |
| **Pipeline refactor** (Nouveaux, Terminés, sent_to_mbe_hub) | ✅ OK | Aucune |
| **Paiement manuel** (virement/CB, Bilan) | ✅ OK | Google Sheets Bilan |
| **Refus client** (modale raisons, masquage) | ✅ OK | Aucune |
| **Bilan devis MBE** (Sheet En cours/Terminés/Refusés) | ✅ OK | Google Sheets |
| **Templates email** personnalisables (sections, logo) | ✅ OK | Aucune |
| **Intégration MBE Hub eShip** (SOAP, envoi brouillon) | ✅ OK | MBE Hub creds |
| **mbehub-soap.cjs** (compat Railway ESM) | ✅ OK | Aucune |

---

## ⚠️ Actions OBLIGATOIRES après push sur master

### 1. Firestore — Déployer les index sur le projet PRODUCTION

Les index `paiements` (devisId + type + status) sont nécessaires pour la page Paiements et le chargement des devis.

```bash
cd front end
npm run firestore:indexes:prod
# OU si le script est à la racine :
# firebase deploy --only firestore:indexes --project saas-mbe-sdv-production
```

**Fichier source :** `firestore.indexes.json` (racine du projet) contient déjà les index `paiements`.

### 2. Railway (backend) — Variables d'environnement PRODUCTION

| Variable | Valeur Production | Où la trouver |
|----------|-------------------|---------------|
| `NODE_ENV` | `production` | — |
| `FIREBASE_PROJECT_ID` | `saas-mbe-sdv-production` | Firebase Console |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe Dashboard (mode live) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (live) | Stripe → Webhooks → endpoint prod |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_...` (live) | Stripe Connect → Settings |
| `APP_URL` | `https://mbe-sdv.fr` (ou ton domaine prod) | Ton domaine |
| `FRONTEND_URL` | Idem que APP_URL | — |
| `GROQ_API_KEY` | `gsk_...` | groq.com (analyse OCR bordereaux) |
| `MBE_HUB_ENV` | `prod` | Si MBE Hub utilisé en prod |

**Fichier credentials Firebase :** Le backend lit `firebase-credentials-prod.json` quand `NODE_ENV=production`. Place ce fichier dans `front end/` (ou là où Railway build).

### 3. Vercel (frontend) — Variables d'environnement PRODUCTION

| Variable | Valeur Production |
|----------|-------------------|
| `VITE_FIREBASE_PROJECT_ID` | `saas-mbe-sdv-production` |
| `VITE_FIREBASE_API_KEY` | (depuis Firebase Console) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `saas-mbe-sdv-production.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `saas-mbe-sdv-production.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | (depuis Firebase) |
| `VITE_FIREBASE_APP_ID` | (depuis Firebase) |
| `VITE_APP_URL` | `https://mbe-sdv.fr` |
| `VITE_API_BASE_URL` | URL du backend Railway (ex. `https://xxx.up.railway.app`) |
| `VITE_STRIPE_PUBLIC_KEY` | `pk_live_...` |

⚠️ **Important :** `VITE_API_BASE_URL` doit pointer vers le **backend Railway**, jamais vers l’URL du frontend Vercel.

### 4. MBE Hub (si utilisation en production)

- Paramètres → MBE Hub : identifiants username + password (Centre MBE)
- Paramètres → Expédition : choisir « MBE Hub » comme méthode de calcul
- Plans Pro/Ultra uniquement

### 5. Webhook Stripe (production)

- Créer un endpoint webhook Stripe pointant vers : `https://[ton-backend-railway]/api/stripe/webhook`
- Activer les événements : `checkout.session.completed`, `payment_intent.succeeded`, etc.
- Copier le **Signing secret** dans `STRIPE_WEBHOOK_SECRET` sur Railway

---

## Actions optionnelles (selon ton setup)

- **Firebase Storage** : Si templates email avec logo upload, vérifier `firebasestorage.app` dans la config Storage
- **Google Sheets** : Bilan (En cours / Terminés) — connecter le Sheet dans Paramètres → Intégrations
- **Gmail OAuth** : Pour envoi d’emails depuis l’app

---

## Commandes rapides

```bash
# Merge staging → master (déjà fait si ce doc existe)
git checkout master
git merge staging
git push origin master

# Déployer les index Firestore en prod
firebase deploy --only firestore:indexes --project saas-mbe-sdv-production
```

---

## Vérifications post-déploiement

1. [ ] Page Nouveaux devis : les devis `sent_to_mbe_hub` n’apparaissent plus
2. [ ] Page détail devis : pas de bouton « Envoyer vers MBE Hub »
3. [ ] Page Expéditions : bouton « Envoyer vers MBE Hub » présent
4. [ ] Réanalyse OCR : clic « Lancer l’analyse OCR » → polling jusqu’à fin → nouveau lien généré
5. [ ] Paiements : liste des paiements par devis s’affiche (index Firestore)
6. [ ] MBE Hub (Pro/Ultra) : tarifs Standard/Express, 2 liens si configuré
7. [ ] Refus client : modale raisons, masquage dans les listes
8. [ ] Paiement manuel : popup méthode + date, sync Bilan
