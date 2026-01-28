# Contexte - Système de Paiements MBE SDV (28 janvier 2026)

## 📊 Vue d'ensemble

Le système de paiements de l'application MBE SDV utilise **Stripe Connect** pour gérer les paiements de chaque compte SaaS indépendamment. Deux systèmes coexistent pour des raisons de compatibilité.

## 🏗️ Architecture des paiements

### Collection Firestore `paiements` (Système actuel)

**Localisation :** `paiements/` dans Firestore  
**Utilisation :** Tous les nouveaux paiements créés automatiquement ou manuellement

**Structure :**
```javascript
{
  id: "auto-generated-firestore-id",
  devisId: "ccfW9dvV19RBL6UO2OwI",           // Référence au devis
  saasAccountId: "y02DtERgj6YTmuipZ8jn",     // Compte SaaS propriétaire
  stripeSessionId: "cs_test_xxx",            // ID session Stripe Checkout
  stripeAccountId: "acct_xxx",               // Compte Stripe Connect
  amount: 19.00,                             // Montant en euros
  type: "PRINCIPAL" | "SURCOUT",             // Type de paiement
  status: "PENDING" | "PAID" | "CANCELLED",  // Statut
  url: "https://checkout.stripe.com/xxx",    // URL du lien de paiement
  createdAt: Timestamp,                      // Date de création
  updatedAt: Timestamp,                      // Dernière mise à jour
  paidAt: Timestamp,                         // Date de paiement (si PAID)
}
```

**Avantages :**
- ✅ Gestion multi-paiements (principal + surcoûts)
- ✅ Lié à Stripe Connect
- ✅ Historique complet
- ✅ Support des webhooks Stripe
- ✅ Un paiement = un document distinct

### Champ `paymentLinks[]` dans quotes (Système historique)

**Localisation :** `quotes/{devisId}/paymentLinks` dans Firestore  
**Utilisation :** Compatibilité avec l'ancien code

**Structure :**
```javascript
paymentLinks: [
  {
    id: "stripe-1737123456789",
    url: "https://buy.stripe.com/xxx",
    amount: 19.00,
    createdAt: Timestamp,
    status: "active" | "paid" | "expired"
  }
]
```

**Limites :**
- ❌ Difficile à maintenir synchronisé
- ❌ Pas de support natif des webhooks
- ❌ Pas de distinction principal/surcoût

## 🔄 Fusion des deux systèmes

### Dans le backend (`/api/quotes`)

**Processus :**
1. Charger le devis depuis Firestore
2. Charger TOUS les paiements depuis `paiements` collection pour ce devisId
3. Convertir chaque paiement en format `paymentLink`
4. Fusionner avec les anciens `paymentLinks` (si existants)
5. Retourner le devis avec `paymentLinks` complet

**Code (ai-proxy.js ligne ~8165) :**
```javascript
const paiementsSnapshot = await firestore
  .collection('paiements')
  .where('devisId', '==', doc.id)
  .get();

const paymentLinksFromPaiements = paiementsSnapshot.docs.map(p => ({
  id: p.id,
  url: p.data().url,
  amount: p.data().amount,
  createdAt: p.data().createdAt?.toDate().toISOString(),
  status: p.data().status === 'PAID' ? 'paid' : 
          p.data().status === 'CANCELLED' ? 'expired' : 'active'
}));

const allPaymentLinks = [...existingPaymentLinks, ...paymentLinksFromPaiements];
```

## 💰 Calcul des montants

### Structure des prix dans un devis

**Nouveau format (recommandé) :**
```javascript
{
  options: {
    packagingPrice: 10,      // Prix emballage
    shippingPrice: 9,        // Prix expédition
    insuranceAmount: 5,      // Montant assurance (si activée)
    insurance: true,         // Assurance activée
    express: true            // Expédition express
  },
  totalAmount: 24  // Calculé automatiquement
}
```

**Ancien format (supporté) :**
```javascript
{
  packagingPrice: 10,    // À la racine (ancien)
  shippingPrice: 9,      // À la racine (ancien)
  insuranceAmount: 5,    // À la racine (ancien)
  options: {
    insurance: true,
    express: true
  },
  totalAmount: 24
}
```

### Calcul du total

**Formule :**
```javascript
total = packagingPrice + shippingPrice + insuranceAmount
```

**Avec fallback (sheetQuotes.ts) :**
```typescript
const total = (
  (quote.options?.packagingPrice || quote.packagingPrice || 0) +
  (quote.options?.shippingPrice || quote.shippingPrice || 0) +
  (quote.options?.insuranceAmount || quote.insuranceAmount || 0)
);
```

## 🔐 Sécurité et isolation

### Par compte SaaS

Chaque compte SaaS (`saasAccountId`) a :
- ✅ Ses propres devis filtrés via `requireAuth` middleware
- ✅ Ses propres paiements filtrés par `saasAccountId`
- ✅ Son propre compte Stripe Connect (`stripeAccountId`)
- ✅ Ses propres webhooks Stripe

**Garantie d'isolation :**
- Un compte SaaS A ne peut jamais voir les paiements du compte SaaS B
- Les paiements Stripe vont directement sur le compte Stripe du SaaS
- L'application ne touche jamais l'argent (Connect)

## 🚀 Auto-génération des liens de paiement

### Conditions requises

Pour qu'un lien soit créé automatiquement :
1. ✅ `packagingPrice > 0` (emballage calculé)
2. ✅ `shippingPrice > 0` (expédition calculée)
3. ✅ `totalAmount > 0` (total valide)
4. ✅ Compte Stripe Connect configuré (`stripeAccountId`)
5. ✅ Aucun paiement PRINCIPAL existant pour ce devis

### Processus d'auto-génération

**Déclencheur :** Après l'analyse OCR d'un bordereau (`calculateDevisFromOCR`)

**Étapes :**
1. Calculer emballage (recommandation automatique)
2. Calculer expédition (pays + poids volumétrique)
3. Calculer assurance (si demandée)
4. Vérifier les conditions
5. Créer session Stripe Checkout
6. Sauvegarder dans collection `paiements`
7. Ajouter événement à la timeline
8. Devis passe en statut approprié

**Logs générés :**
```
[Calcul] 🔗 Conditions remplies pour auto-génération du lien de paiement
[Calcul] ✅ Lien de paiement auto-généré: https://checkout.stripe.com/xxx (ID: paiement-id)
```

## 📄 Page Paiements - Fonctionnement

### Filtrage des devis

**Critère principal :**
```typescript
const quotesWithPayment = quotes.filter(q => 
  q.paymentLinks && q.paymentLinks.length > 0
);
```

**Note :** N'importe quel statut de devis est accepté tant qu'il a un `paymentLink`.

### Statuts affichés

La page peut afficher des devis avec ces statuts :
- `payment_link_sent` - Lien envoyé mais pas encore payé
- `awaiting_payment` - En attente de paiement
- `paid` - Payé
- `awaiting_collection` - Payé et en attente de collecte ✅ **Nouveau**
- `collected` - Collecté
- `preparation` - En préparation
- `shipped` - Expédié
- `completed` - Terminé

**Logique :** Si un lien de paiement existe, le devis doit être visible pour suivre son historique de paiement.

### Statistiques

```javascript
const stats = {
  total: quotesWithPayment.length,           // Nombre total avec liens
  pending: paymentStatus === 'pending',      // En attente
  linkSent: paymentStatus === 'link_sent',   // Liens envoyés
  paid: paymentStatus === 'paid',            // Payés
  totalAmount: somme de tous,                // Montant total
  paidAmount: somme des payés seulement      // Montant encaissé
};
```

## 🔗 Routes API utilisées

### GET /api/quotes
- **Fonction :** Charger tous les devis du compte SaaS
- **Nouveau :** Fusionne automatiquement avec collection `paiements`
- **Retour :** Quotes avec `paymentLinks` complets

### GET /api/devis/:id/paiements
- **Fonction :** Récupérer tous les paiements d'un devis spécifique
- **Collection :** `paiements`
- **Retour :** Liste des paiements (principal + surcoûts)

### POST /api/devis/:id/paiement
- **Fonction :** Créer manuellement un lien de paiement
- **Sauvegarde :** Collection `paiements`
- **Type :** PRINCIPAL ou SURCOUT

### POST /webhooks/stripe
- **Fonction :** Recevoir les événements Stripe (paiement réussi, etc.)
- **Action :** Mettre à jour le statut dans `paiements` et `quotes`

## 🛠️ Maintenance et support

### Problèmes courants

**1. Devis avec lien mais pas affiché :**
- Vérifier que `paymentLinks` n'est pas vide
- Vérifier dans collection `paiements` avec `devisId`
- Regarder les logs `[Payments] 💳 Devis avec paymentLinks`

**2. Montant incorrect :**
- Vérifier `options.packagingPrice`, `options.shippingPrice`
- Vérifier fallback vers racine (`packagingPrice`, `shippingPrice`)
- Ouvrir le devis pour forcer le recalcul

**3. Link auto-génération ne fonctionne pas :**
- Vérifier log `[Calcul] ⚠️  Conditions non remplies`
- Vérifier que Stripe Connect est configuré
- Vérifier que emballage ET expédition > 0

### Commandes de diagnostic

**Vérifier un devis dans Firestore :**
```bash
# Via Firebase Console
https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data/quotes/YOUR_DEVIS_ID
```

**Vérifier les paiements :**
```bash
# Via Firebase Console  
https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data/paiements
# Filtrer par: devisId == YOUR_DEVIS_ID
```

## 📈 Métriques

### Performance
- Chargement de 24 devis + paiements : ~500ms
- Création automatique lien : ~1-2s
- Webhook Stripe : ~100-300ms

### Volumétrie actuelle
- 24 devis dans Firestore
- 1-5 paiements actifs
- 1 compte SaaS connecté

## 🔮 Évolution du système

### Migration vers collection paiements

**Objectif :** Utiliser uniquement la collection `paiements` à terme

**Plan :**
1. ✅ Backend fusionne automatiquement les deux systèmes
2. ✅ Frontend supporte les deux formats de prix
3. 🔄 Migrer progressivement les anciens paymentLinks
4. 🔄 Supprimer le champ paymentLinks obsolète
5. 🔄 Simplifier le code frontend

**Avantages :**
- Code plus simple et maintenable
- Une seule source de vérité
- Meilleure intégration Stripe
- Support natif des webhooks

---

**Date :** 28 janvier 2026  
**Version du contexte :** 3.0  
**Statut :** ✅ À jour et complet
