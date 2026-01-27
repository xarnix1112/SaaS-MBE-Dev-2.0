# 🔧 Fix du problème de webhook Stripe

## Problème identifié

Les webhooks Stripe sont envoyés vers **Google Apps Script** au lieu de votre backend local. C'est pour cela que vous voyez les erreurs HTML "Moved Temporarily" dans le dashboard Stripe.

## Solution

### Étape 1 : Désactiver les webhooks du dashboard Stripe

1. Allez sur https://dashboard.stripe.com/test/webhooks
2. Trouvez le webhook qui pointe vers Google Apps Script (URL contenant `script.googleusercontent.com`)
3. **DÉSACTIVEZ-LE** ou **SUPPRIMEZ-LE**
4. **IMPORTANT** : Ne créez PAS de nouveau webhook dans le dashboard pour le développement local

### Étape 2 : Utiliser uniquement Stripe CLI

Pour le développement local, vous devez **UNIQUEMENT** utiliser Stripe CLI :

1. Dans un **TERMINAL SÉPARÉ**, lancez :
   ```bash
   stripe listen --forward-to localhost:5174/api/stripe/webhook
   ```

2. Stripe CLI affichera un secret comme :
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
   ```

3. **Copiez ce secret** et mettez-le dans `front end/.env.local` :
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

4. **Redémarrez votre serveur backend** (`npm run dev:all`)

### Étape 3 : Vérifier que ça fonctionne

1. Générez un nouveau lien de paiement
2. Effectuez un test de paiement
3. Vérifiez les logs de votre serveur backend - vous devriez voir :
   ```
   [ai-proxy] 📥 Webhook reçu - Headers: ...
   [ai-proxy] ✅ Webhook vérifié avec succès, type: checkout.session.completed
   [ai-proxy] ✅ Devis mis à jour dans Firestore
   ```

## ⚠️ Points importants

1. **Ne créez PAS de webhook dans le dashboard Stripe** pour le développement local
2. **Utilisez UNIQUEMENT Stripe CLI** avec `stripe listen`
3. Le secret du webhook dans `.env.local` doit correspondre à celui affiché par Stripe CLI
4. Si vous relancez Stripe CLI, le secret change - mettez à jour `.env.local`

## Pour la production

Quand vous déployez en production, vous devrez :
1. Créer un webhook dans le dashboard Stripe pointant vers votre URL de production
2. Utiliser le secret de ce webhook (différent de celui de Stripe CLI)

## Améliorations apportées au code

1. ✅ Gestion de `payment.link.succeeded` (événement principal pour Payment Links)
2. ✅ Récupération automatique du `checkout.session` depuis `payment_intent` si nécessaire
3. ✅ Meilleure extraction du `payment_link` depuis tous les types d'événements
4. ✅ Logs détaillés pour le débogage

