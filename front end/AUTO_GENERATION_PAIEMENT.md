# Auto-Génération du Lien de Paiement Stripe

## Vue d'ensemble

Le système génère automatiquement un lien de paiement Stripe Connect lorsque toutes les informations de facturation sont renseignées (emballage + expédition + assurance optionnelle).

## Workflow Complet

```
1. Upload bordereau d'adjudication
   ↓
2. OCR extraction (Tesseract.js)
   ↓
3. Estimation dimensions via Groq AI (avec contexte enrichi)
   ↓
4. Sélection carton optimal (ou multiples pour plusieurs lots)
   ↓
5. Calcul poids volumétrique + prix expédition (zones Google Sheets)
   ↓
6. Calcul assurance (si demandée dans Google Sheets)
   ↓
7. Mise à jour devis Firestore (quotes collection)
   ↓
8. 🆕 AUTO-GÉNÉRATION LIEN DE PAIEMENT (si conditions remplies)
   ↓
9. Client reçoit le lien de paiement immédiatement
```

## Conditions d'Auto-Génération

Le lien de paiement est généré automatiquement **SI ET SEULEMENT SI** :

1. ✅ **Emballage > 0€** (`packagingPrice > 0`)
2. ✅ **Expédition > 0€** (`shippingPrice > 0`)
3. ✅ **Total > 0€** (`totalAmount > 0`)
4. ✅ **Aucun paiement PRINCIPAL existant** (pas de doublon)
5. ✅ **Compte Stripe Connect configuré** (`stripeAccountId` présent dans `saasAccounts`)

## Implémentation Backend

### Fichier: `server/ai-proxy.js`

La logique d'auto-génération est intégrée dans la fonction `calculateDevisFromOCR()` :

```javascript
// 🔥 AUTO-GÉNÉRATION DU LIEN DE PAIEMENT
const shouldAutoGeneratePayment = 
  packagingPrice > 0 && // Emballage renseigné
  shippingPrice > 0 && // Expédition renseignée
  totalAmount > 0; // Total > 0

if (shouldAutoGeneratePayment) {
  // 1. Vérifier qu'aucun paiement PRINCIPAL n'existe déjà
  const existingPaiementsSnapshot = await firestore
    .collection('paiements')
    .where('devisId', '==', devisId)
    .where('type', '==', 'PRINCIPAL')
    .where('status', '!=', 'CANCELLED')
    .limit(1)
    .get();
  
  if (existingPaiementsSnapshot.empty) {
    // 2. Récupérer le stripeAccountId du compte SaaS
    const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    const stripeAccountId = saasAccountDoc.data().integrations?.stripe?.stripeAccountId;
    
    if (stripeAccountId) {
      // 3. Créer une Checkout Session Stripe
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: `${clientName} | ${bordereauNumber} | ${auctionHouse}`,
                },
                unit_amount: Math.round(totalAmount * 100), // en centimes
              },
              quantity: 1,
            },
          ],
          success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/payment/cancel`,
          metadata: {
            devisId,
            paiementType: 'PRINCIPAL',
            saasAccountId,
          },
        },
        {
          stripeAccount: stripeAccountId, // CRUCIAL: paiement sur le compte connecté
        }
      );
      
      // 4. Sauvegarder le paiement dans Firestore
      await firestore.collection('paiements').add({
        devisId,
        stripeSessionId: session.id,
        stripeAccountId,
        amount: totalAmount,
        type: 'PRINCIPAL',
        status: 'PENDING',
        url: session.url,
        saasAccountId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // 5. Ajouter un événement à la timeline
      await firestore.collection('quotes').doc(devisId).update({
        timeline: FieldValue.arrayUnion({
          id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: Timestamp.now(),
          status: 'calculated',
          description: `Lien de paiement généré automatiquement (${totalAmount}€)`,
          user: 'Système Automatisé'
        })
      });
    }
  }
}
```

## Affichage des Dimensions du Carton

### Fichier: `src/pages/QuoteDetail.tsx`

Les dimensions affichées sont maintenant celles du **CARTON** (pas de l'objet) :

```tsx
{(() => {
  // Afficher les dimensions du CARTON (pas de l'objet)
  const carton = safeQuote.auctionSheet?.recommendedCarton;
  
  if (carton) {
    // Nouveau format (inner_length, inner_width, inner_height)
    const length = carton.inner_length || carton.inner?.length || 0;
    const width = carton.inner_width || carton.inner?.width || 0;
    const height = carton.inner_height || carton.inner?.height || 0;
    
    if (length > 0 || width > 0 || height > 0) {
      return (
        <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
          <p>Longueur: {length} cm</p>
          <p>Largeur: {width} cm</p>
          <p>Hauteur: {height} cm</p>
        </div>
      );
    }
  }
  
  // Fallback: afficher les dimensions de l'objet si pas de carton
  // ...
})()}
```

### Exemple d'Affichage

Pour le carton **CAS202** (16x12x11 cm) :

```
📦 Dimensions estimées d'un colis     [Carton: CAS202]

Longueur: 16 cm
Largeur: 12 cm
Hauteur: 11 cm
```

## Collection Firestore: `paiements`

### Structure d'un Document

```javascript
{
  devisId: "FlSy6HIavmpMzbYiYfTR",
  stripeSessionId: "cs_test_a1b2c3d4e5f6g7h8i9j0",
  stripeAccountId: "acct_1234567890",
  amount: 150.50, // Total (emballage + expédition + assurance)
  type: "PRINCIPAL", // ou "SURCOUT"
  status: "PENDING", // ou "PAID", "CANCELLED"
  url: "https://checkout.stripe.com/c/pay/cs_test_...",
  saasAccountId: "y02DtERgj6YTmuipZ8jn",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Timeline du Devis

Un événement est automatiquement ajouté à la timeline du devis :

```javascript
{
  id: "timeline-1737417600000-abc123",
  date: Timestamp,
  status: "calculated",
  description: "Lien de paiement généré automatiquement (150.50€)",
  user: "Système Automatisé"
}
```

## Gestion d'Erreur

Si la génération du lien de paiement échoue :

1. ❌ L'erreur est **loggée** dans la console backend
2. ✅ Le calcul du devis **continue normalement** (pas de blocage)
3. ⚠️ Aucun paiement n'est créé dans Firestore
4. ℹ️ L'utilisateur peut **générer manuellement** le lien depuis l'onglet "Paiements"

```javascript
try {
  // ... génération du lien de paiement
} catch (autoPaymentError) {
  console.error('[Calcul] ❌ Erreur lors de la génération automatique du lien de paiement:', autoPaymentError);
  // Ne pas bloquer le reste du processus si la génération du paiement échoue
}
```

## Cas d'Usage

### Cas 1: Génération Réussie ✅

```
1. Upload bordereau → OCR → Estimation dimensions → Carton optimal
2. packagingPrice = 28€ (CAS202)
3. shippingPrice = 45€ (Zone B, 5-10kg)
4. insuranceAmount = 0€ (pas d'assurance)
5. totalAmount = 73€
6. ✅ Conditions remplies → Génération automatique du lien de paiement
7. Client reçoit le lien immédiatement dans l'onglet "Paiements"
```

### Cas 2: Compte Stripe Non Connecté ⚠️

```
1. Upload bordereau → OCR → Estimation dimensions → Carton optimal
2. packagingPrice = 28€, shippingPrice = 45€, totalAmount = 73€
3. ⚠️ stripeAccountId = null (compte Stripe non connecté)
4. Log: "Compte Stripe non connecté pour le compte SaaS y02DtERgj6YTmuipZ8jn"
5. Pas de génération automatique
6. L'utilisateur doit connecter son compte Stripe dans "Paramètres"
```

### Cas 3: Paiement PRINCIPAL Déjà Existant ⚠️

```
1. Upload bordereau → OCR → Estimation dimensions → Carton optimal
2. packagingPrice = 28€, shippingPrice = 45€, totalAmount = 73€
3. ⚠️ Un paiement PRINCIPAL existe déjà pour ce devis
4. Log: "Un paiement PRINCIPAL existe déjà pour ce devis, pas de génération automatique"
5. Pas de génération automatique (évite les doublons)
```

## Webhook Stripe

Le webhook `/webhooks/stripe` (défini dans `server/stripe-connect.js`) met à jour automatiquement le statut du paiement :

```javascript
// Événement: checkout.session.completed
if (event.type === "checkout.session.completed" && obj.metadata?.devisId) {
  // 1. Récupérer le paiement dans Firestore
  const paiement = await getPaiementBySessionId(firestore, session.id);
  
  // 2. Mettre à jour le statut
  await updatePaiement(firestore, paiement.id, {
    status: 'PAID',
    paidAt: Timestamp.now()
  });
  
  // 3. Mettre à jour le statut du devis
  await updateDevisStatus(firestore, devisId);
  // → paymentStatus: "paid" ou "partially_paid"
  // → status: "awaiting_collection" (si paiement PRINCIPAL payé)
  
  // 4. Ajouter un événement à la timeline
  await addTimelineEventToQuote(firestore, devisId, {
    description: 'Paiement reçu - En attente de récupération',
    status: 'awaiting_collection'
  });
}
```

## Sécurité

1. ✅ **Isolation SaaS stricte** : Chaque paiement est lié à un `saasAccountId`
2. ✅ **Stripe Connect** : Paiements sur le compte Stripe du client (pas sur le compte plateforme)
3. ✅ **Webhook sécurisé** : Signature Stripe vérifiée (`STRIPE_WEBHOOK_SECRET`)
4. ✅ **Pas de doublon** : Vérification qu'aucun paiement PRINCIPAL n'existe déjà
5. ✅ **Gestion d'erreur** : Échec de génération n'impacte pas le calcul du devis

## Bénéfices

✅ **Automatisation complète** : De l'upload du bordereau au lien de paiement  
✅ **Gain de temps** : Plus besoin de générer manuellement le lien  
✅ **Expérience utilisateur** : Client reçoit le lien immédiatement  
✅ **Traçabilité** : Timeline + collection `paiements`  
✅ **Robustesse** : Vérifications + gestion d'erreur  
✅ **Flexibilité** : Génération manuelle toujours possible si échec  

## Prochaines Étapes

1. ✅ Afficher les dimensions du carton (pas de l'objet)
2. ✅ Auto-génération du lien de paiement
3. 🔜 Notification email au client avec le lien de paiement
4. 🔜 Affichage du lien de paiement dans l'onglet "Paiements" du devis
5. 🔜 Bouton "Copier le lien" pour partager facilement

## Logs Backend

### Génération Réussie

```
[Calcul] ✅ Devis FlSy6HIavmpMzbYiYfTR calculé: 73€, 1 lots extraits, 1 carton(s) (28€), Expédition: 45€
[Calcul] 🔗 Conditions remplies pour auto-génération du lien de paiement
[Calcul] ✅ Lien de paiement auto-généré: https://checkout.stripe.com/c/pay/cs_test_... (ID: abc123)
```

### Conditions Non Remplies

```
[Calcul] ⚠️  Conditions non remplies pour auto-génération du lien de paiement (emballage: 0€, expédition: 0€, total: 0€)
```

### Compte Stripe Non Connecté

```
[Calcul] ⚠️  Compte Stripe non connecté pour le compte SaaS y02DtERgj6YTmuipZ8jn, pas de génération automatique
```

### Paiement Déjà Existant

```
[Calcul] ⚠️  Un paiement PRINCIPAL existe déjà pour ce devis, pas de génération automatique
```

## Version

- **Version**: 1.9.0
- **Date**: 20 janvier 2026
- **Auteur**: Clément (avec assistance IA)

