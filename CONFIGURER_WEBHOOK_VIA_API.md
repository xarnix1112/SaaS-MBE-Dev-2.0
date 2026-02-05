# 🚀 Configurer le Webhook Stripe Connect via l'API

## 📋 Pourquoi cette Solution ?

L'option **"Listen to events on Connected accounts"** n'apparaît pas dans le Dashboard Stripe lors de l'édition du webhook. Cette solution utilise l'API Stripe directement pour créer le webhook avec les bons paramètres.

---

## ✅ Solution : Script Automatique

J'ai créé un script qui configure automatiquement le webhook avec `connect: true`.

### Étape 1 : Vérifier les Prérequis

1. **Vérifier que `STRIPE_SECRET_KEY` est dans `.env.local`** :
   ```bash
   # Dans front end/.env.local
   STRIPE_SECRET_KEY=sk_test_...
   ```

2. **Vérifier que le backend est déployé** et accessible sur `https://api.mbe-sdv.fr`

### Étape 2 : Exécuter le Script

**Option A : Depuis le répertoire racine du projet**

```bash
cd "c:\Dev\SaaS MBE SDV"
node "front end/scripts/setup-webhook-connect.js"
```

**Option B : Depuis le répertoire front end**

```bash
cd "c:\Dev\SaaS MBE SDV\front end"
node scripts/setup-webhook-connect.js
```

### Étape 3 : Suivre les Instructions

Le script va :
1. ✅ Chercher les webhooks existants
2. ✅ Supprimer l'ancien webhook s'il n'écoute pas les comptes connectés
3. ✅ Créer un nouveau webhook avec `connect: true`
4. ✅ Afficher le **signing secret**

### Étape 4 : Ajouter le Secret dans Railway

1. **Copier le signing secret** affiché par le script (commence par `whsec_...`)
2. **Aller sur Railway → Votre service backend**
3. **Onglet "Variables"**
4. **Ajouter ou modifier** :
   - **Nom :** `STRIPE_WEBHOOK_SECRET`
   - **Valeur :** Le secret copié
5. **Redéployer le backend**

### Étape 5 : Tester

1. **Effectuer un paiement test** dans votre application
2. **Vérifier les logs Railway** - vous devriez voir :
   ```
   [AI Proxy] 📥 POST /webhooks/stripe appelé (Stripe Connect)
   [stripe-connect] 📨 Webhook reçu: { type: 'checkout.session.completed', ... }
   ```
3. **Vérifier que le paiement** passe de `PENDING` à `PAID` dans Firestore

---

## 🔍 Dépannage

### Erreur : "STRIPE_SECRET_KEY non trouvé"

**Solution :**
1. Vérifier que le fichier `.env.local` existe dans `front end/`
2. Vérifier que `STRIPE_SECRET_KEY` est bien défini
3. Vérifier que vous êtes dans le bon répertoire

### Erreur : "Webhook already exists"

**Solution :**
Le script va automatiquement supprimer l'ancien webhook et en créer un nouveau. Si ça ne fonctionne pas :
1. Aller sur https://dashboard.stripe.com/test/webhooks
2. Supprimer manuellement l'ancien webhook
3. Relancer le script

### Le webhook n'est toujours pas appelé

**Solutions :**
1. Vérifier que `STRIPE_WEBHOOK_SECRET` est bien configuré dans Railway
2. Vérifier que le backend est redéployé
3. Vérifier les logs Railway pour les erreurs
4. Vérifier que le webhook est "Enabled" dans Stripe Dashboard

---

## 📝 Notes

- **Le script fonctionne en mode TEST par défaut**
- **Pour le mode LIVE**, modifiez `TEST_MODE` dans le script ou utilisez votre clé LIVE
- **Le script peut être exécuté plusieurs fois** sans problème
- **Le script supprime automatiquement** les anciens webhooks qui n'écoutent pas les comptes connectés

---

## ✅ Avantages de cette Solution

- ✅ **Pas besoin de Stripe CLI** en production
- ✅ **Configuration automatique** via l'API
- ✅ **Fonctionne même si l'option n'apparaît pas** dans le Dashboard
- ✅ **Solution de production** appropriée
- ✅ **Script réutilisable** pour d'autres environnements

---

**Date de création :** 5 février 2026
**Dernière mise à jour :** 5 février 2026
