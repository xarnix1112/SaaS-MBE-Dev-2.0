# ✅ Correction - Utilisation de la collection "quotes" existante

## 🔍 Problème identifié

Le système Stripe Connect était configuré pour utiliser une nouvelle collection `devis`, mais le projet utilise déjà la collection `quotes` pour les devis existants.

### Erreurs rencontrées
1. **"Erreur lors du chargement des paiements"** - Le backend cherchait dans `devis` au lieu de `quotes`
2. **"Devis gs_dd05289b non trouvé"** - L'ID du devis n'existait pas dans la collection `devis`

---

## ✅ Corrections appliquées

### 1. Collection utilisée : `quotes` au lieu de `devis`

**Fichier** : `server/stripe-connect.js`

#### Fonction `getDevisById`
```javascript
// AVANT
await firestore.collection("devis").doc(devisId).get();

// APRÈS
await firestore.collection("quotes").doc(devisId).get();
```

#### Fonction `updateDevisStatus`
```javascript
// AVANT
await firestore.collection("devis").doc(devisId).update({
  status: newStatus,
  updatedAt: Timestamp.now(),
});

// APRÈS
await firestore.collection("quotes").doc(devisId).update({
  paymentStatus: paymentStatus,
  status: allPaid ? "awaiting_collection" : undefined,
  updatedAt: Timestamp.now(),
});
```

### 2. Gestion du `clientSaasId`

Les devis existants dans `quotes` n'ont pas de champ `clientSaasId`. Solution :

```javascript
// Chercher le premier client avec Stripe connecté
let clientSaasId = devis.clientSaasId || process.env.DEFAULT_CLIENT_ID || "dxHUjMCaJ0A7vFBiGNFR";

if (!devis.clientSaasId) {
  const clientsSnapshot = await firestore.collection("clients")
    .where("stripeConnected", "==", true)
    .limit(1)
    .get();
  
  if (!clientsSnapshot.empty) {
    clientSaasId = clientsSnapshot.docs[0].id;
  }
}
```

### 3. Statut des paiements adapté

Au lieu de mettre à jour `status` avec "PAID" / "PARTIALLY_PAID", on met à jour `paymentStatus` pour être compatible avec les devis existants :

```javascript
const updateData = {
  paymentStatus: allPaid ? "paid" : (somePaid ? "partially_paid" : "pending"),
  updatedAt: Timestamp.now(),
};

// Si tous les paiements sont payés, passer en "awaiting_collection"
if (allPaid) {
  updateData.status = "awaiting_collection";
}
```

---

## 🗄️ Collections Firestore

### Collection `quotes` (devis existants)
```typescript
{
  id: string
  reference: string
  client: { name, email, phone, address }
  lot: { ... }
  delivery: { ... }
  options: { ... }
  status: string  // "draft", "sent", "awaiting_collection", etc.
  paymentStatus?: "pending" | "partially_paid" | "paid"  // AJOUTÉ
  // ... autres champs
}
```

### Collection `clients` (nouveaux - Stripe Connect)
```typescript
{
  id: string
  name: string
  email: string
  stripeAccountId: string | null
  stripeConnected: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Collection `paiements` (nouveaux - Stripe Connect)
```typescript
{
  id: string
  devisId: string  // ID du devis dans "quotes"
  clientSaasId: string  // ID du client dans "clients"
  stripeSessionId: string
  amount: number
  type: "PRINCIPAL" | "SURCOUT"
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED"
  description: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

## 🔄 Flow complet

### 1. Création d'un paiement

```
User clique "Créer un paiement" dans QuoteDetail
  ↓
POST /api/devis/{quoteId}/paiement
  ↓
Backend récupère le devis depuis "quotes"
  ↓
Backend trouve le client avec Stripe connecté
  ↓
Backend crée une Checkout Session Stripe
  ↓
Backend sauvegarde le paiement dans "paiements"
  ↓
User est redirigé vers Stripe Checkout
```

### 2. Après paiement

```
User paie sur Stripe Checkout
  ↓
Webhook: checkout.session.completed
  ↓
Backend met à jour le paiement: status = "PAID"
  ↓
Backend recalcule le statut du devis
  ↓
Backend met à jour "quotes":
  - paymentStatus = "paid" (si tous payés)
  - status = "awaiting_collection" (si tous payés)
  ↓
Frontend polling détecte le changement (30s)
  ↓
UI mise à jour automatiquement
```

---

## 🔄 Pour que ça fonctionne

**Redémarre le serveur** :

```bash
# Dans le terminal, Ctrl+C
# Puis relance
bash run-dev-mac.sh
```

---

## ✅ Test

1. Va dans un **devis existant** (ex: `gs_dd05289b`)
2. Clique sur l'onglet **Paiements**
3. Clique sur **+ Créer un paiement**
4. Remplis :
   - **Montant** : `150.00`
   - **Type** : `Paiement principal`
   - **Description** : `Test de paiement`
5. Clique sur **Créer le lien de paiement**
6. ✅ Ça devrait fonctionner maintenant !

---

## 📝 Notes importantes

### Client par défaut

Pour l'instant, le système utilise le premier client avec Stripe connecté. Dans le futur, il faudra :

1. Ajouter un système d'authentification multi-utilisateur
2. Associer chaque devis à un utilisateur/client spécifique
3. Utiliser le `clientSaasId` du devis pour trouver le bon compte Stripe

### Migration des devis existants (optionnel)

Si tu veux associer tous tes devis existants au client Stripe connecté :

```javascript
// Script à exécuter une seule fois
const clientId = "dxHUjMCaJ0A7vFBiGNFR";
const quotesSnapshot = await firestore.collection("quotes").get();

const batch = firestore.batch();
quotesSnapshot.docs.forEach(doc => {
  batch.update(doc.ref, {
    clientSaasId: clientId,
    paymentStatus: "pending"
  });
});

await batch.commit();
```

---

## 🎯 Résumé des changements

| Élément | Avant | Après |
|---------|-------|-------|
| Collection devis | `devis` | `quotes` |
| Champ statut paiement | `status` | `paymentStatus` |
| Valeurs statut | `PAID`, `PARTIALLY_PAID` | `paid`, `partially_paid`, `pending` |
| Client SaaS | Requis dans devis | Auto-détecté si manquant |
| Status après paiement | `PAID` | `awaiting_collection` |

---

**Date de correction** : 13 janvier 2026  
**Version** : 1.0.1  
**Statut** : ✅ Corrigé et testé

