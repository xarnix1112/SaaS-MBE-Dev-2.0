# Configuration du webhook Stripe pour les abonnements plan

## Problème identifié

D’après les logs Railway :
- ✅ **Checkout OK** : `🛒 Création session Checkout plan - saasAccountId: es4IiIhl03aPttsTz5xj planId: pro`
- ✅ **Session créée** : `cs_test_a1g24RfIspg0...`
- ❌ **Aucun webhook reçu** : Stripe n’envoie pas d’événement à ton backend après le paiement

**Conséquence** : Le plan n’est pas mis à jour car c’est le webhook `checkout.session.completed` qui met à jour Firestore après le paiement.

---

## Solution : configurer le webhook Stripe

### 1. Accéder aux webhooks Stripe

1. Va sur [https://dashboard.stripe.com](https://dashboard.stripe.com)
2. En haut à droite, vérifie que tu es en **Mode test** (bandeau orange)
3. Menu **Developers** → **Webhooks**

### 2. Créer ou modifier l’endpoint

- Si aucun endpoint ne pointe vers Railway : cliquer sur **Add endpoint**
- Si un endpoint existe déjà : vérifier son URL

### 3. URL de l’endpoint

**Staging** (pour tes tests actuels) :
```
https://saas-mbe-dev-staging-staging.up.railway.app/api/stripe/webhook
```

**Ou** si tu as un domaine personnalisé pour le backend staging, utilise plutôt :
```
https://[ton-domaine-staging]/api/stripe/webhook
```

### 4. Événements à activer

Cocher au minimum :
- `checkout.session.completed`

Optionnel (pour renouvellements / annulations) :
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 5. Récupérer le Signing secret

Après création de l’endpoint :
1. Cliquer sur l’endpoint
2. Section **Signing secret** → **Reveal**
3. Copier la valeur (format `whsec_...`)

### 6. Mettre à jour Railway

1. Railway → ton projet → service backend staging
2. **Variables** → ajouter :
   - `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` = `whsec_...` (le secret du webhook "Votre compte")
3. Ne pas modifier `STRIPE_WEBHOOK_SECRET` (reste celui du webhook plateforme)
4. Redéployer le service

**Note :** Le backend tente les deux secrets pour vérifier la signature (plateforme puis abonnements).

---

## Vérification

1. Refaire un test de paiement (choisir un plan, compléter sur Stripe)
2. Stripe Dashboard → Developers → Webhooks → ton endpoint → **Recent deliveries**
3. Vérifier qu’un événement `checkout.session.completed` apparaît avec un statut **200**
4. Si 200 : le plan doit se mettre à jour sur la page Compte

---

## Erreurs hors sujet (dans tes logs)

| Erreur | Cause | Action |
|--------|-------|--------|
| `invalid_grant` Gmail/Google Sheets | Refresh token expiré ou révoqué | Réautoriser Gmail et Google Sheets dans Paramètres |
| `FAILED_PRECONDITION` Firestore | Index manquant | Suivre le lien dans l’erreur pour créer l’index |
| `TYPEFORM_CLIENT_ID manquant` | Optionnel | Ignorable si tu n’utilises pas Typeform |
