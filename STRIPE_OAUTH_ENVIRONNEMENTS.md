# 💳 Stripe Connect OAuth — Configuration par environnement

Ce guide explique comment configurer Stripe Connect OAuth pour **chaque environnement** (dev, staging, production).

---

## 🎯 Problème : 404 sur /stripe/callback

Quand vous connectez un compte Stripe depuis **staging** (`https://staging.mbe-sdv.fr`), Stripe redirige vers une page 404. 

**Cause :** L’URI de redirection pointe vers le **frontend** (Vercel, SPA React) au lieu du **backend** (Railway) qui gère la route `/stripe/callback`.

---

## Comprendre le flux

1. **Frontend** (Vercel) → appelle `POST /api/stripe/connect` sur le **backend** (Railway)
2. **Backend** → génère l’URL OAuth avec `redirect_uri = APP_URL + '/stripe/callback'`
3. **Utilisateur** → redirigé vers Stripe → autorise l’accès
4. **Stripe** → redirige vers `redirect_uri` (doit être le **backend**)
5. **Backend** → traite le callback → redirige vers `FRONTEND_URL/settings?connected=true&source=stripe`

**Important :** `APP_URL` doit pointer vers le **backend** (où Express sert `/stripe/callback`), pas vers le frontend.

---

## Tableau récapitulatif

| Variable        | Dev (local)                        | Staging (Railway)                                               | Production (Railway)        |
|----------------|-------------------------------------|-----------------------------------------------------------------|-----------------------------|
| `APP_URL`      | `http://localhost:8080`            | `https://saas-mbe-dev-staging-staging.up.railway.app`           | `https://api.mbe-sdv.fr`     |
| `FRONTEND_URL` | `http://localhost:8080`            | `https://staging.mbe-sdv.fr`                                   | `https://www.mbe-sdv.fr`     |
| Redirect URI Stripe | `http://localhost:8080/stripe/callback` | `https://saas-mbe-dev-staging-staging.up.railway.app/stripe/callback` | `https://api.mbe-sdv.fr/stripe/callback` |

---

## Configuration pour STAGING

### Étape 1 : Variables Railway (service staging)

1. Va sur [Railway](https://railway.app) → ton projet
2. Clique sur le **service staging** (backend)
3. **Variables** → ajoute ou modifie :

| Variable        | Valeur                                                              |
|----------------|----------------------------------------------------------------------|
| `APP_URL`      | `https://saas-mbe-dev-staging-staging.up.railway.app`               |
| `FRONTEND_URL` | `https://staging.mbe-sdv.fr`                                        |

> ⚠️ Adapte `APP_URL` si l’URL de ton backend Railway staging est différente. Tu la trouves dans Railway → service staging → **Settings** → **Networking** → **Public Networking** → Domain.

4. **Redéploie** le service staging

### Étape 2 : Stripe Dashboard

1. Va sur [Stripe Dashboard](https://dashboard.stripe.com)
2. **Mode Test** (pour les tests staging)
3. **Connect** → **Settings** → **OAuth settings** → **Redirect URIs**
4. **Supprime** `https://staging.mbe-sdv.fr/stripe/callback` si présent
5. **Ajoute** : `https://saas-mbe-dev-staging-staging.up.railway.app/stripe/callback`
6. **Save**

---

## Configuration pour production

| Variable        | Valeur                    |
|----------------|---------------------------|
| `APP_URL`      | `https://api.mbe-sdv.fr`   |
| `FRONTEND_URL` | `https://www.mbe-sdv.fr`   |

Redirect URI Stripe : `https://api.mbe-sdv.fr/stripe/callback`

---

## Checklist staging

- [ ] `APP_URL` = URL Railway staging (backend)
- [ ] `FRONTEND_URL` = `https://staging.mbe-sdv.fr`
- [ ] Redirect URI dans Stripe = `https://xxx.up.railway.app/stripe/callback`
- [ ] **Webhook Stripe** configuré (voir section ci-dessous)
- [ ] Railway redéployé
- [ ] Test : connexion Stripe → redirection vers Paramètres sans 404

---

## 🔔 Webhook Stripe — Erreur 400 "No signatures found"

Les paiements sont créés mais pas marqués comme payés ? Les webhooks Stripe renvoient une erreur 400 ? C'est presque toujours un problème de **signing secret**.

Chaque endpoint webhook Stripe a son **propre** secret (`whsec_xxx`). Le secret de production ne fonctionne pas pour staging.

### Configuration du webhook pour STAGING

1. Va sur [Stripe Dashboard](https://dashboard.stripe.com) → **Mode Test** (en haut à droite)
2. **Developers** → **Webhooks**
3. **Add endpoint** (+ Add endpoint)
4. **Endpoint URL** : `https://saas-mbe-dev-staging-staging.up.railway.app/webhooks/stripe`
   - ⚠️ Remplacer par ton URL Railway staging si différente
5. **Listen to** : coche **"Events on Connected accounts"** (obligatoire pour Stripe Connect)
6. **Select events** → ajoute **tous** les événements suivants :

   **Paiements (obligatoires pour Stripe Connect) :**
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `charge.succeeded`

   **Payment Links (si tu utilises des liens de paiement) :**
   - `payment.link.succeeded`
   - `payment_link.created`
   - `payment_link.updated`
   - `payment_link.canceled`

   **Échecs et annulations (optionnel mais recommandé) :**
   - `payment_intent.payment_failed`
   - `charge.failed`
   - `payment_intent.canceled`

   **Stripe Connect – comptes connectés (optionnel) :**
   - `account.updated`
   - `account.application.deauthorized`

7. **Add endpoint**
8. Clique sur ton nouvel endpoint → **Reveal** à côté de **Signing secret**
9. Copie le secret (commence par `whsec_`)

### Variable Railway

1. Railway → **service staging** → **Variables**
2. Ajoute ou modifie : `STRIPE_WEBHOOK_SECRET` = `whsec_...` (le secret copié)
3. **Redéploie** le service staging

### Vérification

- Les webhooks doivent pointer vers l’URL **backend** (Railway), pas vers le frontend.
- Production et staging ont des secrets différents : un endpoint Stripe = un secret unique.

---

## Erreur "Erreur Stripe" (400) lors de la création d'un lien de paiement

Si tu obtiens une erreur 400 "Erreur Stripe" en cliquant sur "Créer le lien de paiement" :

### 1. Voir le message d'erreur détaillé

Depuis la mise à jour du 23 fév. 2026, le message Stripe exact est affiché dans le toast d'erreur. **Redéploie le backend** pour en bénéficier.

### 2. Vérifier les variables Railway (production)

| Variable        | Valeur attendue           |
|-----------------|---------------------------|
| `APP_URL`       | `https://api.mbe-sdv.fr`   |
| `FRONTEND_URL`  | `https://www.mbe-sdv.fr`   |

Optionnel (si `APP_URL` ne correspond pas au domaine backend) :
- `STRIPE_SUCCESS_URL` = `https://api.mbe-sdv.fr/payment/success`
- `STRIPE_CANCEL_URL` = `https://api.mbe-sdv.fr/payment/cancel`

### 3. Causes fréquentes

| Message Stripe | Action |
|----------------|--------|
| "account or business name" | Aller sur [Stripe Dashboard → Paramètres du compte](https://dashboard.stripe.com/settings/account) et remplir le **Business name** |
| "charges_disabled" ou "charges not enabled" | Compléter l'onboarding du compte connecté Stripe |
| "Invalid URL" | Vérifier `APP_URL` dans Railway |
| Clé API / compte en **mode Test** alors que le frontend est en production | Utiliser les clés **Live** dans Railway pour la production |

### 4. Logs backend

Dans Railway → ton service production → **Deployments** → **View logs** : cherche `[stripe-connect] ❌ Erreur Stripe Checkout:` pour voir le détail.

---

**Date :** 23 février 2026
