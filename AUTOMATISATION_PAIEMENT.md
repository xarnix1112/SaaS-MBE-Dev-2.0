# 🤖 Automatisation des Paiements - Génération Automatique

## 📋 Résumé des modifications

Cette mise à jour automatise complètement la génération des liens de paiement, la gestion des régénérations et la mise à jour de l'historique des devis.

---

## ✨ Nouvelles fonctionnalités

### 1. Génération automatique du paiement principal

**Quand ?** Dès qu'on ouvre l'onglet "Paiements" d'un devis

**Comment ça fonctionne ?**
1. Le système vérifie s'il existe déjà un paiement principal
2. Si non, il calcule automatiquement le total du devis :
   - Emballage (`packagingPrice`)
   - Expédition (`shippingPrice`)
   - Assurance (`insuranceAmount`) - **seulement si demandée**
3. Il génère automatiquement un lien de paiement Stripe Checkout
4. Le lien est sauvegardé dans Firestore avec le statut `PENDING`

**Résultat :**
- ✅ Plus besoin de créer manuellement le paiement principal
- ✅ Le total est toujours correct (emballage + expédition + assurance si demandée)
- ✅ Le lien est disponible immédiatement dans l'historique des paiements

### 2. Récapitulatif détaillé du devis

**Nouveau composant dans l'onglet "Paiements" :**

```
┌─────────────────────────────────────┐
│ Récapitulatif du devis              │
│                                     │
│ Emballage           20.00€          │
│ Expédition          11.00€          │
│ Assurance (2.5%)    12.00€          │  ← Seulement si demandée
│ ─────────────────────────────────   │
│ Total du devis      43.00€          │
└─────────────────────────────────────┘
```

**Logique d'assurance :**
- Si `options.insurance === false` → Pas d'assurance
- Si `options.insurance === true` → Assurance = 2.5% de la valeur du lot (min. 12€ si valeur < 500€)

### 3. Mise à jour automatique de l'historique

**À la création du lien de paiement :**
- ✅ Événement ajouté : "Lien de paiement principal généré (XX.XX€)"
- ✅ Statut du devis mis à jour : `awaiting_payment`

**Quand le paiement est effectué (webhook) :**
- ✅ Événement ajouté : "Paiement principal reçu (XX.XX€)"
- ✅ Statut du paiement : `PENDING` → `PAID`
- ✅ Date de paiement ajoutée (`paidAt`)

**Quand le paiement PRINCIPAL est reçu :**
- ✅ Événement ajouté à la **timeline principale** : "Paiement principal reçu (XX.XX€)"
- ✅ Statut du devis : `awaiting_payment` → `awaiting_collection` ⭐
- ✅ `paymentStatus` : `pending` → `paid` (ou `partially_paid` si surcoûts en attente)
- ✅ **Déplacement automatique dans la pipeline** (visible sur le board)

**Quand tous les paiements sont reçus :**
- ✅ Événement supplémentaire : "Tous les paiements ont été reçus - En attente de récupération"
- ✅ `paymentStatus` : `partially_paid` → `paid`

### 4. Régénération intelligente des liens de paiement

**Problème résolu :**
- ❌ Anciens paiements sans URL (`stripeCheckoutUrl` manquant)
- ❌ Doublon dans le total quand on régénère un lien
- ❌ Impossible de visualiser un lien existant avant de le régénérer

**Solution :**

**Si le paiement a une URL :**
```
[Voir le lien] [Régénérer]
```
- **"Voir le lien"** → Ouvre directement dans un nouvel onglet
- **"Régénérer"** → Annule l'ancien + Crée nouveau + Ouvre automatiquement

**Si le paiement n'a PAS d'URL :**
```
[Régénérer le lien]
```
- Annule automatiquement l'ancien paiement (status → `CANCELLED`)
- Crée un nouveau paiement avec une URL valide
- Ouvre le nouveau lien automatiquement

**Calcul du total corrigé :**
```typescript
// Seuls les paiements actifs sont comptés
const activePaiements = paiements.filter(p => p.status !== 'CANCELLED');
const totalAmount = activePaiements.reduce((sum, p) => sum + p.amount, 0);
```

**Affichage des paiements annulés :**
- Badge : 🔘 Annulé (grisé)
- Card : Opacité 50% + fond grisé
- Pas de bouton d'action (pas cliquable)

---

## 🔧 Modifications techniques

### Frontend

#### `src/components/quotes/QuotePaiements.tsx`

**Nouvelles props :**
```typescript
interface QuotePaiementsProps {
  devisId: string;
  quote?: Quote; // Quote optionnel passé depuis le parent
}
```

**Nouvelles fonctions :**
```typescript
// Calcul du montant d'assurance (même logique que QuoteDetail)
function computeInsuranceAmount(
  lotValue: number,
  insuranceEnabled?: boolean,
  explicitAmount?: number | null
): number

// Calcul du total du devis
const calculateQuoteTotal = (): number => {
  const packagingPrice = quote.options?.packagingPrice || 0;
  const shippingPrice = quote.options?.shippingPrice || 0;
  const insuranceAmount = computeInsuranceAmount(...);
  return packagingPrice + shippingPrice + insuranceAmount;
}

// Génération automatique du paiement principal
const autoGeneratePrincipalPayment = async (): Promise<void>
```

**Nouveau affichage :**
- Récapitulatif du devis avec détails (emballage, expédition, assurance)
- Indicateur de génération automatique en cours
- Messages de toast informatifs

#### `src/pages/QuoteDetail.tsx`

**Modification :**
```typescript
// Avant:
<QuotePaiements devisId={quote.id} />

// Après:
<QuotePaiements devisId={quote.id} quote={quote} />
```

### Backend

#### `server/stripe-connect.js`

**Nouvelle fonction helper :**
```javascript
async function addTimelineEventToQuote(firestore, devisId, event) {
  // Ajoute un événement à l'historique du devis
  // Évite les doublons (même description dans les 5 dernières minutes)
  // Met à jour le timestamp updatedAt
}
```

**Modifications dans `handleCreatePaiement` :**
```javascript
// Après la création du paiement
await addTimelineEventToQuote(firestore, devisId, {
  id: `tl-${Date.now()}-...`,
  date: Timestamp.now(),
  status: devis.status || 'awaiting_payment',
  description: type === 'PRINCIPAL' 
    ? `Lien de paiement principal généré (${amount.toFixed(2)}€)`
    : `Lien de paiement pour surcoût généré (${amount.toFixed(2)}€)`,
  user: 'Système',
});

// Mise à jour du statut du devis si paiement principal
if (type === 'PRINCIPAL') {
  await devisRef.update({
    status: 'awaiting_payment',
    updatedAt: Timestamp.now(),
  });
}
```

**Nouvelle route - Annulation de paiement :**
```javascript
// POST /api/paiement/:id/cancel
export async function handleCancelPaiement(req, res, firestore) {
  // 1. Vérifier que le paiement existe et est PENDING
  // 2. Marquer le paiement comme CANCELLED
  // 3. Ajouter événement à l'historique du devis
  // 4. Retourner success: true
}
```

**Modifications dans `handleStripeWebhook` :**
```javascript
// Après la mise à jour du paiement à PAID
await addTimelineEventToQuote(firestore, devisId, {
  id: `tl-${Date.now()}-...`,
  date: Timestamp.now(),
  status: 'paid',
  description: paiement.type === 'PRINCIPAL'
    ? `Paiement principal reçu (${paiement.amount.toFixed(2)}€)`
    : `Paiement de surcoût reçu (${paiement.amount.toFixed(2)}€)`,
  user: 'Stripe',
});
```

**Modifications dans `updateDevisStatus` :**
```javascript
// Vérifier si le paiement PRINCIPAL est payé
const principalPayment = activePaiements.find(p => p.type === 'PRINCIPAL');
const principalIsPaid = principalPayment && principalPayment.status === 'PAID';

// Si le paiement PRINCIPAL est payé → passer en awaiting_collection
if (principalIsPaid) {
  updateData.status = "awaiting_collection"; // ⭐ Déplacement dans la pipeline
  
  // Si TOUS les paiements sont payés, ajouter événement supplémentaire
  if (allPaid) {
    await addTimelineEventToQuote(firestore, devisId, {
      id: `tl-${Date.now()}-...`,
      date: Timestamp.now(),
      status: 'awaiting_collection',
      description: 'Tous les paiements ont été reçus - En attente de récupération',
      user: 'Système Automatisé',
    });
  }
}
```

**Points clés :**
- ✅ Le paiement **PRINCIPAL** seul suffit pour passer à `awaiting_collection`
- ✅ Les surcoûts peuvent être payés après sans bloquer le devis
- ✅ Événement ajouté à la **timeline principale** (`quotes.timeline`)
- ✅ Visible dans l'onglet "Historique" du devis

---

## 🔄 Pipeline complète

### 1. Ouverture de l'onglet "Paiements"

```
Utilisateur ouvre devis → Onglet Paiements
  ↓
QuotePaiements charge le devis et les paiements
  ↓
Vérifie s'il existe un paiement principal
  ↓
NON → Génération automatique
  ├─ Calcul du total (emballage + expédition + assurance si demandée)
  ├─ Création Checkout Session Stripe
  ├─ Sauvegarde paiement dans Firestore (status: PENDING)
  ├─ Ajout événement historique: "Lien de paiement principal généré"
  └─ Mise à jour statut devis: awaiting_payment
```

### 2. Client effectue le paiement

```
Client clique sur "Voir le lien" → Redirigé vers Stripe Checkout
  ↓
Client paie avec sa carte
  ↓
Stripe envoie webhook checkout.session.completed
  ↓
Backend reçoit le webhook
  ├─ Récupère le paiement par stripeSessionId
  ├─ Met à jour status: PENDING → PAID
  ├─ Ajoute paidAt: maintenant
  ├─ Ajout événement historique: "Paiement principal reçu"
  └─ Recalcule le statut du devis
      ├─ Si tous payés → status: awaiting_collection
      │   └─ Ajout événement: "Tous les paiements reçus"
      ├─ Si partiellement → paymentStatus: partially_paid
      └─ Sinon → paymentStatus: pending
```

### 3. Régénération d'un lien de paiement

```
Client clique "Régénérer le lien"
  ↓
Frontend appelle POST /api/paiement/:id/cancel
  ├─ Backend marque l'ancien paiement: PENDING → CANCELLED
  ├─ Ajout événement historique: "Lien de paiement annulé"
  └─ Retour success: true
  ↓
Frontend crée nouveau paiement: POST /api/devis/:id/paiement
  ├─ Backend crée Checkout Session
  ├─ Sauvegarde dans Firestore (status: PENDING, URL incluse)
  ├─ Ajout événement: "Lien de paiement régénéré"
  └─ Retour: { url, sessionId, paiementId }
  ↓
Frontend ouvre l'URL dans nouvel onglet
  ↓
Frontend recharge la liste → Ancien (grisé) + Nouveau (actif)
```

### 4. Affichage temps réel

```
QuotePaiements (polling 30 secondes)
  ↓
GET /api/devis/:id/paiements
  ↓
Backend retourne les paiements mis à jour
  ├─ Filtre: Paiements actifs (status !== CANCELLED)
  └─ Total = somme des paiements actifs uniquement
  ↓
Frontend affiche les nouveaux statuts
  ├─ Paiements CANCELLED: grisés, badge "Annulé"
  └─ Paiements actifs: normaux, boutons d'action
  ↓
QuoteTimeline affiche les nouveaux événements
```

---

## 📊 Exemple de flux complet

### Devis initial
```
Devis: DEV-GS-5
├─ Emballage: 10€
├─ Expédition: 9€
└─ Assurance: OUI (valeur lot: 480€)
    └─ 2.5% × 480€ = 12€
Total: 31€
```

### Étape 1 : Ouverture onglet Paiements (t=0s)
```
✅ Lien de paiement principal généré automatiquement (31.00€)
Status devis: verified → awaiting_payment

Historique:
- [13/01/2026 15:30] Lien de paiement principal généré (31.00€) [Système]
```

### Étape 2 : Client paie (t=2min)
```
✅ Paiement principal reçu (31.00€)
Status paiement: PENDING → PAID
Status devis: awaiting_payment → awaiting_collection ⭐

Historique (Timeline principale du devis):
- [13/01/2026 15:30] Lien de paiement principal généré (31.00€) [Système]
- [13/01/2026 15:32] Paiement principal reçu (31.00€) [Stripe Webhook] ⭐
- [13/01/2026 15:32] Tous les paiements ont été reçus - En attente de récupération [Système Automatisé]

🎯 Changements automatiques:
✅ Paiement PRINCIPAL payé → status: awaiting_collection
✅ Devis déplacé dans la pipeline "En attente de récupération"
✅ Événement ajouté à la timeline principale (visible dans "Historique")
✅ PaymentStatus mis à jour: paid
```

### Étape 3 : Affichage dans l'app (t=2min 30s)
```
Récapitulatif du devis:
- Emballage: 10.00€
- Expédition: 9.00€
- Assurance (2.5%): 12.00€
- Total: 31.00€

Paiements:
- 31.00€ [Principal] ✅ Payé
  Créé le 13/01/2026
  Payé le 13/01/2026

Total des paiements: 31.00€
Montant encaissé: 31.00€ ✅
```

---

## 🎯 Avantages

### Pour l'utilisateur
- ✅ **Zéro action manuelle** - Le lien est créé automatiquement
- ✅ **Total toujours correct** - Calcul automatique avec assurance conditionnelle
- ✅ **Historique complet** - Traçabilité de chaque action
- ✅ **Temps réel** - Mise à jour automatique après paiement

### Pour le système
- ✅ **Pipeline claire** - Chaque étape est tracée
- ✅ **Statuts cohérents** - Synchronisation automatique
- ✅ **Pas de doublons** - Vérification avant création
- ✅ **Évite les erreurs** - Pas de saisie manuelle du montant

---

## 🐛 Cas limites gérés

### 1. Devis sans assurance
```javascript
if (!quote.options.insurance) {
  insuranceAmount = 0;
}
// Total = emballage + expédition uniquement
```

### 2. Devis avec assurance
```javascript
if (quote.options.insurance) {
  insuranceAmount = Math.max(lotValue * 0.025, lotValue < 500 ? 12 : 0);
  // Arrondi: 13.50 → 14, 13.49 → 13.5
}
// Total = emballage + expédition + assurance
```

### 3. Paiement principal déjà existant
```javascript
const hasPrincipalPayment = paiements.some(p => p.type === 'PRINCIPAL');
if (hasPrincipalPayment) {
  return; // Ne rien faire
}
```

### 4. Total = 0€
```javascript
if (total <= 0) {
  return; // Ne pas créer de paiement
}
```

### 5. Plusieurs paiements (principal + surcoûts)
```javascript
// Chaque paiement est indépendant
// Le statut global est recalculé après chaque paiement
const allPaid = paiements.every((p) => p.status === "PAID");
if (allPaid) {
  status = "awaiting_collection";
}
```

### 6. Paiements annulés (CANCELLED)
```javascript
// Exclure du calcul du total
const activePaiements = paiements.filter(p => p.status !== 'CANCELLED');
const totalAmount = activePaiements.reduce((sum, p) => sum + p.amount, 0);

// Ne pas permettre l'annulation d'un paiement déjà payé ou annulé
if (paiement.status !== 'PENDING') {
  throw new Error('Seuls les paiements en attente peuvent être annulés');
}
```

### 7. Anciens paiements sans URL
```javascript
// Détection automatique
if (paiement.status === 'PENDING' && !paiement.stripeCheckoutUrl) {
  // Afficher bouton "Régénérer le lien"
  // Quand cliqué: annuler l'ancien + créer nouveau avec URL
}
```

---

## 🧪 Tests recommandés

### Test 1 : Génération automatique
1. Créer un nouveau devis avec emballage + expédition
2. Ouvrir l'onglet "Paiements"
3. ✅ Vérifier que le lien est généré automatiquement
4. ✅ Vérifier le récapitulatif (emballage + expédition, **pas d'assurance**)
5. ✅ Vérifier l'historique : "Lien de paiement principal généré"

### Test 2 : Génération avec assurance
1. Créer un devis avec assurance activée
2. Ouvrir l'onglet "Paiements"
3. ✅ Vérifier le récapitulatif (emballage + expédition + **assurance**)
4. ✅ Vérifier que le total inclut l'assurance

### Test 3 : Paiement effectué
1. Cliquer sur "Voir le lien"
2. Payer avec carte test `4242 4242 4242 4242`
3. ✅ Vérifier que le statut passe à "Payé"
4. ✅ Vérifier l'historique : "Paiement principal reçu"
5. ✅ Vérifier l'historique : "Tous les paiements reçus"
6. ✅ Vérifier le statut du devis : `awaiting_collection`

### Test 4 : Paiements multiples
1. Créer un surcoût après le paiement principal
2. ✅ Vérifier que le statut reste `awaiting_payment` (pas tous payés)
3. Payer le surcoût
4. ✅ Vérifier que le statut passe à `awaiting_collection`

### Test 5 : Régénération de lien
1. Créer un paiement (ou utiliser un ancien sans URL)
2. Cliquer sur "Régénérer le lien"
3. ✅ Vérifier que l'ancien paiement passe à "Annulé" (grisé)
4. ✅ Vérifier qu'un nouveau paiement apparaît avec "Voir le lien"
5. ✅ Vérifier que le **total n'a pas doublé** (31€ → 31€, pas 62€)
6. ✅ Vérifier l'historique : "Lien de paiement annulé" + "Lien de paiement régénéré"

### Test 6 : Visualisation vs Régénération
1. Ouvrir un paiement avec URL valide
2. ✅ Vérifier que les deux boutons sont présents : "Voir le lien" + "Régénérer"
3. Cliquer sur "Voir le lien"
4. ✅ Vérifier que le lien s'ouvre dans un nouvel onglet
5. ✅ Vérifier qu'aucun nouveau paiement n'a été créé

---

## 📝 Notes importantes

### Assurance
- L'assurance est **optionnelle** et dépend de `quote.options.insurance`
- Si `insurance === false` → Total = emballage + expédition
- Si `insurance === true` → Total = emballage + expédition + assurance (2.5% du lot, min. 12€ si < 500€)

### Historique
- Les événements sont ajoutés avec un contrôle anti-doublons (5 minutes)
- Chaque événement a un ID unique et un timestamp
- L'utilisateur peut être "Système", "Stripe", ou un nom d'utilisateur

### Statuts de paiement
- `PENDING` → En attente de paiement (lien actif)
- `PAID` → Payé (webhook reçu)
- `FAILED` → Échec de paiement
- `CANCELLED` → Annulé (régénération ou suppression manuelle)

**Important :**
- Les paiements `CANCELLED` sont **exclus** du calcul du total
- Ils restent visibles dans l'historique (grisés) pour traçabilité
- Un paiement annulé ne peut plus être utilisé (lien Stripe expiré)

### Pipeline automatique
```
verified → awaiting_payment → awaiting_collection → collected → preparation → awaiting_shipment → shipped → completed
            ↑ Génération lien    ↑ Paiement PRINCIPAL
```

**Déclencheurs automatiques :**
- `awaiting_payment` : Quand le lien de paiement principal est généré
- `awaiting_collection` : Quand le paiement **PRINCIPAL** est reçu ⭐
  - Ne dépend PAS des surcoûts
  - Déplacement immédiat dans la pipeline
  - Événement ajouté à la timeline principale

---

## 🧪 Script de test

Un script de test est disponible pour simuler un webhook Stripe et vérifier le bon fonctionnement :

```bash
# Tester le paiement d'un devis
node front\ end/test-payment-webhook.mjs <devisId>

# Exemple
node front\ end/test-payment-webhook.mjs gs_6fb75318
```

**Ce que le script fait :**
1. ✅ Vérifie que le devis existe
2. ✅ Récupère le paiement PRINCIPAL
3. ✅ Marque le paiement comme PAID
4. ✅ Ajoute l'événement à la timeline
5. ✅ Met à jour le statut du devis → `awaiting_collection`
6. ✅ Affiche l'état final

**Vérification après le test :**
- Onglet "Historique" → Événement "Paiement principal reçu"
- Statut du devis → "En attente de récupération"
- Pipeline → Devis déplacé visuellement

---

**Date** : 13 janvier 2026  
**Version** : 1.3.0  
**Auteur** : Assistant IA + Clément  
**Statut** : ✅ Implémenté et prêt pour les tests

