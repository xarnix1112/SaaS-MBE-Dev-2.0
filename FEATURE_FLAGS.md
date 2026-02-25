# Feature Flags / Plans — Documentation

## Architecture

- **plans/** : Plans dynamiques (basic, pro, enterprise) avec features + limits
- **saasAccounts/{id}** : planId, customFeatures, usage, billingPeriod
- **Features finales** = `{ ...plan.features, ...saasAccount.customFeatures }`

Les customFeatures écrasent le plan si besoin (feature exclusive par client).

## Démarrage

### 1. Initialiser la collection plans

Le script utilise les credentials dans cet ordre : **staging** → dev → fallback.

**Pour staging** (projet `saas-mbe-sdv-staging`) :

1. Firebase Console → projet **saas-mbe-sdv-staging** → ⚙️ Paramètres → Comptes de service  
2. Clique sur `firebase-adminsdk-fbsvc@saas-mbe-sdv-staging.iam.gserviceaccount.com`  
3. **Générer une nouvelle clé privée** → télécharger le JSON  
4. Enregistrer le fichier dans `front end/` sous le nom : **`firebase-credentials-staging.json`**

Puis lancer :

```bash
cd "front end"
npm run plans:init
```

Pour forcer un fichier précis : `PLANS_INIT_CREDENTIALS=firebase-credentials-staging.json npm run plans:init`

Crée les documents `plans/basic`, `plans/pro`, `plans/enterprise`.

### 2. Structure saasAccount (création automatique)

Les nouveaux comptes SaaS reçoivent :

```json
{
  "planId": "basic",
  "customFeatures": {},
  "usage": { "quotesUsedThisYear": 0 },
  "billingPeriod": {
    "yearStart": "2026-01-01T00:00:00.000Z",
    "yearEnd": "2026-12-31T23:59:59.999Z"
  }
}
```

### 3. API Frontend

**GET /api/features** (authentifié)

Retourne :

```json
{
  "features": { "createQuote": true, "tracking": true, ... },
  "limits": { "quotesPerYear": 200, "usersMax": 2 },
  "usage": { "quotesUsedThisYear": 45 },
  "remaining": { "quotesPerYear": 155, "usersMax": 2 },
  "planId": "basic",
  "planName": "Basic",
  "billingPeriod": { "yearStart": "...", "yearEnd": "..." }
}
```

## Backend : Middleware

### checkFeature(firestore, featureName)

Protège une route :

```js
app.post("/advanced-analytics", requireAuth, checkFeature(firestore, "advancedAnalytics"), controller);
```

### checkLimit(firestore, limitName)

Vérifie que la limite n’est pas atteinte :

```js
app.post("/create-quote", requireAuth, checkLimit(firestore, "quotesPerYear"), controller);
```

## Limites annuelles

- **quotesPerYear** : incrémenté à chaque création de devis (sync Google Sheets)
- **-1** = illimité (plan Enterprise)
- Reset : lors du renouvellement Stripe (webhook) — à configurer

### Webhook Stripe (renouvellement abonnement)

Quand Stripe confirme un renouvellement annuel :

```js
await firestore.collection("saasAccounts").doc(saasAccountId).update({
  "usage.quotesUsedThisYear": 0,
  "billingPeriod.yearStart": newStartDate,
  "billingPeriod.yearEnd": newEndDate,
});
```

## Feature exclusive pour un client

Pour activer une feature pour un seul compte :

```js
await firestore.collection("saasAccounts").doc(saasAccountId).update({
  "customFeatures.chinaWorkflow": true,
});
```

Protéger la route :

```js
app.get("/china-workflow", requireAuth, checkFeature(firestore, "chinaWorkflow"), ...);
```

## Plans disponibles

| Plan    | Prix | quotesPerYear | usersMax | auctionHousesMax | pushToMbeHub | multiAgency |
|---------|------|---------------|----------|------------------|--------------|-------------|
| starter | 50€  | 2000          | 1        | 2                | non          | non         |
| pro     | 100€ | 5000          | 3        | 5                | oui          | oui         |
| ultra   | 250€ | 12000         | illimité | illimité         | oui          | oui         |

**Limites supplémentaires :**
- customEmailsMax : 0 (starter), 3 (pro), 10 (ultra)
- evolutionsIncluded : 0 (starter), 2 (pro), 5 (ultra)
