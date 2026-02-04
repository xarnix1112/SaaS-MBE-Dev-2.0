# 🔧 Correction : Erreur "Webhook payload must be provided as a string or a Buffer"

## 📋 Problème

Tous les webhooks Stripe échouent avec l'erreur :

```
Webhook Error: Webhook payload must be provided as a string or a Buffer (https://nodejs.org/api/buffer.html) instance representing the _raw_ request body.Payload was provided as a parsed JavaScript object instead. Signature verification is impossible without access to the original signed material.
```

**Code d'état HTTP :** `400`

## 🎯 Cause

Le problème vient de l'ordre des middlewares Express. Le middleware `express.json()` parse le body en objet JavaScript **AVANT** que la route webhook ne soit traitée. Stripe a besoin du body **brut** (Buffer) pour vérifier la signature du webhook.

## ✅ Solution Appliquée

### Changement 1 : Middleware pour les routes webhook AVANT express.json()

Le middleware `express.raw()` est maintenant appliqué **AVANT** `express.json()` pour les routes webhook :

```javascript
// IMPORTANT: Ne pas parser le body JSON pour les routes webhook Stripe
// Stripe a besoin du body brut (Buffer) pour vérifier la signature
// On applique express.raw() pour les routes webhook AVANT express.json()
app.use((req, res, next) => {
  // Appliquer express.raw() pour les routes webhook Stripe
  if (req.path === '/api/stripe/webhook' || req.path === '/webhooks/stripe') {
    return express.raw({ type: "application/json" })(req, res, next);
  }
  // Pour toutes les autres routes, continuer sans parser
  next();
});

// Puis appliquer express.json() pour toutes les autres routes
app.use(express.json());
```

### Changement 2 : Retrait de express.raw() des routes

Les routes webhook n'ont plus besoin d'appliquer `express.raw()` directement, car c'est déjà fait dans le middleware :

```javascript
// AVANT (incorrect)
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  // ...
});

// APRÈS (correct)
app.post("/webhooks/stripe", (req, res) => {
  // req.body est déjà un Buffer grâce au middleware
  // ...
});
```

### Changement 3 : Vérification que req.body est un Buffer

Ajout d'une vérification pour s'assurer que `req.body` est bien un Buffer :

```javascript
const isBuffer = Buffer.isBuffer(req.body);
if (!isBuffer) {
  console.error("[stripe-connect] ❌ ERREUR CRITIQUE: req.body n'est pas un Buffer!");
  return res.status(400).send("Webhook Error: Body must be a Buffer. Check middleware configuration.");
}
```

## 📝 Vérification

### 1. Tester le Webhook dans Stripe Dashboard

1. **Aller sur https://dashboard.stripe.com/test/webhooks**
2. **Cliquer sur votre webhook**
3. **Cliquer "Send test webhook"**
4. **Sélectionner l'événement :** `checkout.session.completed`
5. **Cliquer "Send test webhook"**

### 2. Vérifier les Logs Railway

Dans Railway → Logs, vous devriez voir :

```
[AI Proxy] 📥 POST /webhooks/stripe appelé (Stripe Connect)
[AI Proxy] 📥 Body reçu: XXX bytes (Buffer)
[stripe-connect] 🔵 handleStripeWebhook appelé
[stripe-connect] 🔍 Tentative de construction de l'événement: { bodyType: 'object', isBuffer: true, ... }
[stripe-connect] ✅ Événement construit avec succès: { type: 'checkout.session.completed', ... }
```

**⚠️ Si vous voyez :**
```
[stripe-connect] ❌ ERREUR CRITIQUE: req.body n'est pas un Buffer!
```

Cela signifie que le middleware n'est pas correctement configuré. Vérifiez que :
- Le middleware `express.raw()` est appliqué AVANT `express.json()`
- La route `/webhooks/stripe` correspond bien au path dans le middleware

### 3. Vérifier le Statut dans Stripe Dashboard

Dans Stripe Dashboard → Webhooks → Votre webhook → Events, l'événement test devrait maintenant avoir le statut **"Réussi"** (vert) au lieu de **"En échec"** (rouge).

## 🔍 Débogage

### Problème : Le webhook échoue toujours

**Vérifications :**

1. ✅ Vérifier que le code a été déployé dans Railway
2. ✅ Vérifier que Railway a redéployé le backend
3. ✅ Vérifier les logs Railway pour voir si `req.body` est un Buffer
4. ✅ Vérifier que l'URL du webhook est correcte : `https://api.mbe-sdv.fr/webhooks/stripe`

### Problème : req.body n'est toujours pas un Buffer

**Solutions :**

1. ✅ Vérifier l'ordre des middlewares dans `ai-proxy.js`
2. ✅ S'assurer que `express.raw()` est appliqué AVANT `express.json()`
3. ✅ Vérifier que le path correspond exactement : `/webhooks/stripe` (avec le `/` au début)
4. ✅ Vérifier qu'il n'y a pas d'autres middlewares qui lisent le body avant

### Problème : Erreur "Missing stripe-signature header"

**Solutions :**

1. ✅ Vérifier que le webhook est bien configuré dans Stripe Dashboard
2. ✅ Vérifier que l'URL du webhook est correcte
3. ✅ Vérifier que le webhook est "Enabled" (pas "Disabled")

## ✅ Checklist

Avant de considérer que c'est résolu :

- [ ] Code modifié et commité
- [ ] Code déployé dans Railway
- [ ] Railway a redéployé le backend
- [ ] Test webhook dans Stripe Dashboard fonctionne (statut "Réussi")
- [ ] Logs Railway montrent `isBuffer: true`
- [ ] Logs Railway montrent `✅ Événement construit avec succès`
- [ ] Un vrai paiement test déclenche le webhook correctement
- [ ] Le paiement passe de `PENDING` à `PAID` dans Firestore

---

**Date de création :** 4 février 2026
**Dernière mise à jour :** 4 février 2026
