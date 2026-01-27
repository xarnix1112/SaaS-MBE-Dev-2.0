# 🤖 Résumé Technique: Estimation Automatique Dimensions + Carton Optimal

## 📋 Contexte

Le projet QuoteFlow Pro (SaaS B2B de gestion de devis MBE) a été enrichi avec un système d'estimation automatique des dimensions et de sélection du carton optimal via Groq AI (version 1.7.0).

---

## 🎯 Objectif

Automatiser entièrement le processus:
1. **OCR** détecte la description du lot
2. **Groq AI** estime les dimensions 3D + poids
3. **Système** trouve le carton optimal du client
4. **Devis** mis à jour avec dimensions + prix d'emballage
5. **Prêt** pour création du lien de paiement

---

## 🛠️ Architecture Implémentée

### 1. Nouvelle Fonction: `findOptimalCarton(dimensions, saasAccountId)`

**Fichier**: `front end/server/ai-proxy.js` (lignes ~6830-6905)

**Rôle**: Trouver le carton le plus adapté (et économique) pour les dimensions données.

**Logique**:
```javascript
async function findOptimalCarton(dimensions, saasAccountId) {
  // 1. Récupérer cartons actifs du client depuis Firestore
  const cartonsSnapshot = await firestore
    .collection('cartons')
    .where('saasAccountId', '==', saasAccountId)
    .where('isActive', '==', true)
    .get();

  // 2. Ajouter marge de sécurité (2 cm de chaque côté)
  const PADDING = 2;
  const requiredLength = dimensions.length + (PADDING * 2);
  const requiredWidth = dimensions.width + (PADDING * 2);
  const requiredHeight = dimensions.height + (PADDING * 2);

  // 3. Filtrer cartons pouvant contenir l'objet
  const suitableCartons = cartons.filter(carton =>
    carton.inner_length >= requiredLength &&
    carton.inner_width >= requiredWidth &&
    carton.inner_height >= requiredHeight
  );

  // 4. Sélectionner le plus petit carton adapté (optimisation coût)
  const optimalCarton = suitableCartons.reduce((best, current) => {
    const bestVolume = best.inner_length * best.inner_width * best.inner_height;
    const currentVolume = current.inner_length * current.inner_width * current.inner_height;
    return currentVolume < bestVolume ? current : best;
  });

  // 5. Fallback: carton par défaut si aucun ne convient
  if (!optimalCarton) {
    return cartons.find(c => c.isDefault) || null;
  }

  return optimalCarton;
}
```

**Retour**:
```javascript
{
  id: "carton123",              // ID Firestore
  ref: "CAD05",                 // Référence du carton
  inner_length: 30,             // cm
  inner_width: 30,              // cm
  inner_height: 30,             // cm
  packaging_price: 18           // € TTC
}
```

---

### 2. Nouvelle Fonction: `estimateDimensionsWithGroq(description, groqApiKey)`

**Fichier**: `front end/server/ai-proxy.js` (lignes ~6907-6925)

**Rôle**: Wrapper autour de `estimateDimensionsForObject` (fonction existante) pour estimer les dimensions via Groq AI.

**Logique**:
```javascript
async function estimateDimensionsWithGroq(description, groqApiKey) {
  if (!groqApiKey || !description) {
    console.warn('[Groq] ⚠️  Clé API ou description manquante');
    return null;
  }

  try {
    console.log(`[Groq] 🤖 Estimation des dimensions pour: "${description.substring(0, 80)}..."`);
    
    // Appelle la fonction existante estimateDimensionsForObject
    const dimensions = await estimateDimensionsForObject(description, groqApiKey);
    
    console.log('[Groq] ✅ Dimensions estimées:', dimensions);
    return dimensions;
  } catch (error) {
    console.error('[Groq] ❌ Erreur lors de l\'estimation:', error);
    return null;
  }
}
```

**Retour**:
```javascript
{
  length: 50,    // cm
  width: 40,     // cm
  height: 30,    // cm
  weight: 5      // kg
}
```

---

### 3. Fonction Modifiée: `calculateDevisFromOCR(devisId, ocrResult, saasAccountId)`

**Fichier**: `front end/server/ai-proxy.js` (lignes ~6950-7090)

**Nouvelles étapes ajoutées**:

#### Étape 1: Estimation des dimensions
```javascript
let dimensions = null;
let estimatedDimensions = null;

if (ocrResult.lots && ocrResult.lots.length > 0) {
  const firstLot = ocrResult.lots[0];
  
  // Si dimensions déjà estimées dans l'OCR, les utiliser
  if (firstLot.estimatedDimensions) {
    dimensions = firstLot.estimatedDimensions;
    estimatedDimensions = dimensions;
    console.log('[Calcul] ✅ Utilisation des dimensions déjà estimées:', dimensions);
  }
  // Sinon, estimer via Groq si une description est disponible
  else if (firstLot.description && process.env.GROQ_API_KEY) {
    console.log('[Calcul] 🤖 Estimation des dimensions via Groq...');
    estimatedDimensions = await estimateDimensionsWithGroq(firstLot.description, process.env.GROQ_API_KEY);
    
    if (estimatedDimensions) {
      dimensions = estimatedDimensions;
      console.log('[Calcul] ✅ Dimensions estimées par Groq:', dimensions);
    }
  }
}

// Fallback: dimensions par défaut
if (!dimensions) {
  dimensions = { length: 50, width: 40, height: 30, weight: 5 };
  console.warn('[Calcul] ⚠️  Utilisation de dimensions par défaut:', dimensions);
}
```

#### Étape 2: Sélection du carton optimal
```javascript
const optimalCarton = await findOptimalCarton(dimensions, saasAccountId);

let packagingPrice = 0;
let cartonInfo = null;

if (optimalCarton) {
  packagingPrice = optimalCarton.packaging_price;
  cartonInfo = {
    id: optimalCarton.id,
    ref: optimalCarton.carton_ref,
    inner_length: optimalCarton.inner_length,
    inner_width: optimalCarton.inner_width,
    inner_height: optimalCarton.inner_height,
    price: optimalCarton.packaging_price
  };
  console.log(`[Calcul] 📦 Carton sélectionné: ${optimalCarton.carton_ref} - Prix: ${packagingPrice}€`);
} else {
  console.warn('[Calcul] ⚠️  Aucun carton trouvé, prix d\'emballage = 0€');
}
```

#### Étape 3: Mise à jour du devis
```javascript
const updateData = {
  'lot.value': ocrResult.total || 0,
  'lot.auctionHouse': ocrResult.salle_vente || devis.lot?.auctionHouse || null,
  'options.packagingPrice': packagingPrice,
  'options.shippingPrice': shippingPrice,
  'options.insuranceAmount': insuranceAmount,
  totalAmount: totalAmount,
  status: 'calculated',
  auctionSheet: {
    auctionHouse: ocrResult.salle_vente || null,
    bordereauNumber: ocrResult.numero_bordereau || null,
    date: ocrResult.date || null,
    totalValue: ocrResult.total || 0,
    lots: mappedLots,
    recommendedCarton: cartonInfo || null  // Nouveau champ
  },
  updatedAt: Timestamp.now(),
  timeline: FieldValue.arrayUnion({
    id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    date: Timestamp.now(),
    status: 'calculated',
    description: `Devis calculé automatiquement (Total: ${totalAmount}€, ${mappedLots.length} lots extraits${cartonInfo ? `, Carton: ${cartonInfo.ref}` : ''})`
  })
};

// Ajouter dimensions estimées si disponibles
if (estimatedDimensions) {
  updateData['lot.dimensions'] = {
    length: estimatedDimensions.length,
    width: estimatedDimensions.width,
    height: estimatedDimensions.height,
    weight: estimatedDimensions.weight,
    estimated: true  // Flag: true = estimé par IA, false = mesuré
  };
  console.log('[Calcul] 📏 Dimensions estimées ajoutées au devis:', estimatedDimensions);
}

// Ajouter ID du carton si trouvé
if (cartonInfo) {
  updateData.cartonId = cartonInfo.id;
  console.log(`[Calcul] 📦 Carton ID ajouté au devis: ${cartonInfo.id}`);
}

await firestore.collection('quotes').doc(devisId).update(updateData);
```

---

## 📊 Modèle de Données

### Collection `quotes` (Firestore)

**Nouveaux champs ajoutés**:

```javascript
{
  // ... champs existants ...
  
  // Dimensions estimées (nouveau)
  lot: {
    dimensions: {
      length: 50,        // cm
      width: 40,         // cm
      height: 30,        // cm
      weight: 5,         // kg
      estimated: true    // Flag: true = estimé par IA, false = mesuré
    },
    // ... autres champs existants ...
  },
  
  // Prix d'emballage (mis à jour)
  options: {
    packagingPrice: 18,  // Prix du carton sélectionné (€)
    // ... autres champs existants ...
  },
  
  // Carton recommandé (nouveau)
  auctionSheet: {
    // ... champs existants ...
    recommendedCarton: {
      id: "carton123",
      ref: "CAD05",
      inner_length: 30,
      inner_width: 30,
      inner_height: 30,
      price: 18
    }
  },
  
  // ID du carton (nouveau, pour traçabilité)
  cartonId: "carton123"
}
```

---

## 🔄 Workflow Complet

```
1. Upload bordereau
   ↓
2. OCR extraction (Tesseract.js)
   → description, prix, salle, date
   ↓
3. Groq AI estimation dimensions
   → {length, width, height, weight}
   ↓
4. Recherche carton optimal
   → Filtrage + optimisation volume
   → Fallback carton par défaut
   ↓
5. Mise à jour devis Firestore
   → lot.dimensions (estimated: true)
   → options.packagingPrice
   → auctionSheet.recommendedCarton
   → cartonId
   ↓
6. Affichage dans l'UI
   → Section "Dimensions estimées"
   → Section "Paiements" > "Emballage"
   ↓
7. Création lien de paiement
   ✅ Toutes les infos disponibles
```

---

## 🔧 Configuration Requise

### Variables d'environnement

```bash
# Clé API Groq (pour estimation dimensions)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Firebase (pour accès Firestore)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

### Collection Firestore `cartons`

Chaque compte SaaS doit avoir **au moins un carton par défaut** configuré.

**Accès**: Paramètres → Onglet "📦 Cartons"

---

## 📝 Logs & Débogage

### Logs de succès

```
[Groq] 🤖 Estimation des dimensions pour: "Vase en porcelaine..."
[Groq] ✅ Dimensions estimées: {length: 25, width: 25, height: 40, weight: 3}
[Carton] 🔍 Recherche du carton optimal pour dimensions: {length: 25, width: 25, height: 40, weight: 3}
[Carton] 📦 5 carton(s) disponible(s)
[Carton] 📏 Dimensions requises (avec marge): {length: 29, width: 29, height: 44}
[Carton] ✅ CAD12 peut contenir l'objet
[Carton] 🎯 Carton optimal sélectionné: CAD12 (40x40x40cm) - Prix: 32€
[Calcul] 📦 Carton sélectionné: CAD12 - Prix: 32€
[Calcul] 📏 Dimensions estimées ajoutées au devis: {length: 25, width: 25, height: 40, weight: 3}
[Calcul] 📦 Carton ID ajouté au devis: carton123
[Calcul] ✅ Devis abc123 calculé: 62€, 1 lots extraits, Carton: CAD12 (32€)
```

### Logs d'avertissement

```
[Groq] ⚠️  Clé API ou description manquante
[Calcul] ⚠️  Utilisation de dimensions par défaut: {length: 50, width: 40, height: 30, weight: 5}
[Carton] ⚠️  Aucun carton configuré pour ce compte SaaS
[Carton] ⚠️  Aucun carton assez grand trouvé
[Carton] 🎯 Utilisation du carton par défaut: CAD40
[Calcul] ⚠️  Aucun carton trouvé, prix d'emballage = 0€
```

---

## ✅ Bénéfices

1. **Automatisation complète**: OCR → dimensions → carton → prix
2. **Optimisation coût**: Plus petit carton adapté
3. **Marge de sécurité**: Padding 2 cm
4. **Fallback intelligent**: Carton par défaut
5. **Traçabilité**: `cartonId` pour suivi
6. **Prêt paiement**: Toutes infos disponibles
7. **Logs détaillés**: Facilite débogage

---

## 📚 Fichiers Modifiés

### Backend
- **`front end/server/ai-proxy.js`** (+192 lignes, -16 lignes)
  - Nouvelle fonction `findOptimalCarton()`
  - Nouvelle fonction `estimateDimensionsWithGroq()`
  - Modification `calculateDevisFromOCR()` (3 nouvelles étapes)

### Documentation
- **`front end/ESTIMATION_DIMENSIONS_AUTOMATIQUE.md`** (nouveau, 700+ lignes)
  - Guide complet utilisateur + développeur
- **`front end/RESUME_ESTIMATION_DIMENSIONS.md`** (nouveau, ce fichier)
  - Résumé technique pour l'assistant

---

## 🚀 Prochaines Étapes

1. **Frontend**: Afficher dimensions estimées + carton recommandé dans `QuoteDetail.tsx`
2. **Amélioration Groq**: Prompt plus précis avec contexte (type d'objet, prix, salle)
3. **Expédition**: Intégrer calcul prix d'expédition avec poids volumétrique
4. **Lots multiples**: Gérer plusieurs lots (un ou plusieurs cartons)
5. **Validation UI**: Permettre à l'utilisateur de modifier dimensions estimées

---

## 📦 Commits GitHub

**Commit**: `3da03df`  
**Message**: `feat: Estimation automatique dimensions + sélection carton optimal via Groq AI`  
**Fichiers**: 1 modifié (`ai-proxy.js`)  
**Lignes**: +192 / -16

---

**Version**: 1.7.0  
**Date**: 20 janvier 2026  
**Repo**: https://github.com/xarnix1112/quoteflow-pro  
**Auteur**: Assistant AI (Claude Sonnet 4.5)

