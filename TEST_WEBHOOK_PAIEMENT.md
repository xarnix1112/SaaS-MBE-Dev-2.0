# 🧪 Test du Webhook de Paiement

## 🔴 Problème actuel

Les paiements restent en statut `PENDING` même après avoir été payés sur Stripe Checkout.

**Paiements actuels dans Firestore** :
- 3 paiements avec status `PENDING`
- Aucun paiement avec status `PAID`

→ Le webhook ne met pas à jour le statut des paiements.

---

## 🔍 Diagnostic

### 1️⃣ Vérifier que le webhook Stripe CLI est actif

Dans le terminal où tourne le serveur, tu dois voir :

```
[stripe] Ready! You are using Stripe API Version [2025-04-30.basil]
```

✅ Si tu vois ce message, Stripe CLI écoute bien les webhooks.

### 2️⃣ Faire un test de paiement

1. **Crée un nouveau paiement** (ou utilise un des liens existants)
2. **Paie sur Stripe Checkout** avec la carte de test : `4242 4242 4242 4242`
3. **Regarde les logs du terminal immédiatement après**

Tu devrais voir :

```
[stripe] --> checkout.session.completed [evt_...]
[stripe-connect] 📨 Webhook reçu: { type: 'checkout.session.completed', ... }
[stripe-connect] 🔍 Checkout Session Completed: { sessionId: '...', devisId: '...', ... }
[stripe-connect] ✅ Client trouvé: ...
[stripe-connect] 🔍 Recherche du paiement avec sessionId: ...
[stripe-connect] ✅ Paiement trouvé: ...
[stripe-connect] ✅ Paiement ... marqué comme PAID
[stripe-connect] ✅ Statut du devis ... mis à jour
```

---

## 🚨 Erreurs possibles

### Erreur 1 : "Pas de devisId dans les metadata"

```
[stripe-connect] ⚠️  Pas de devisId dans les metadata
```

**Cause** : Le paiement n'a pas été créé avec les metadata corrects.

**Solution** : Recrée un paiement via l'application (ne réutilise pas les anciens liens).

---

### Erreur 2 : "Client non trouvé pour compte Stripe"

```
[stripe-connect] ⚠️  Client non trouvé pour compte Stripe: acct_...
```

**Cause** : Le compte Stripe connecté n'est pas trouvé dans Firestore.

**Solution** : Vérifie dans Firestore que le client a bien `stripeAccountId` configuré.

---

### Erreur 3 : "Paiement non trouvé pour session"

```
[stripe-connect] ❌ Paiement non trouvé pour session: cs_test_...
```

**Cause** : Le paiement n'existe pas dans Firestore ou le `stripeSessionId` ne correspond pas.

**Solution** :
1. Vérifie que le paiement existe dans Firestore (collection `paiements`)
2. Vérifie que `stripeSessionId` correspond exactement au session ID du webhook

---

## ✅ Vérification après paiement

Après avoir payé, lance ce script pour vérifier :

```bash
cd "front end"
node scripts/test-webhook-update.mjs
```

Tu devrais voir au moins un paiement avec `Status: PAID`.

---

## 📊 État attendu

### Avant le paiement

```
📄 Paiement ID: xxx
   Status: PENDING
   Session: cs_test_...
```

### Après le paiement (webhook traité)

```
📄 Paiement ID: xxx
   Status: PAID  ✅
   Session: cs_test_...
```

---

## 🔧 Actions à faire MAINTENANT

1. **Redémarre le serveur** pour avoir les nouveaux logs :
   ```bash
   # Ctrl+C dans le terminal
   bash run-dev-mac.sh
   ```

2. **Crée un NOUVEAU paiement** (ne réutilise pas les anciens liens)

3. **Paie sur Stripe Checkout**

4. **Copie-moi les logs** du terminal (juste la partie du webhook)

---

## 💡 Ce que j'ai amélioré

J'ai ajouté des logs détaillés dans le webhook pour voir exactement où ça bloque :

- 🔍 Détails de la session Checkout
- ✅ Confirmation que le client est trouvé
- 🔍 Recherche du paiement
- ✅ Paiement trouvé et mis à jour
- ✅ Statut du devis mis à jour

**Redémarre et teste, puis envoie-moi les logs !** 🚀

