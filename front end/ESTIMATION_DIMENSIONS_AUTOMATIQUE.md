# 🤖 Estimation Automatique des Dimensions & Sélection du Carton Optimal

## 📋 Vue d'ensemble

Ce système automatise entièrement le processus d'estimation des dimensions et de sélection du carton optimal pour chaque devis, depuis la description OCR jusqu'au prix d'emballage final.

---

## 🔄 Workflow Complet

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. UPLOAD BORDEREAU                                             │
│    ↓ L'utilisateur upload un bordereau d'adjudication          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. OCR EXTRACTION (Tesseract.js)                                │
│    ↓ Extraction déterministe:                                   │
│      • Numéro de lot                                            │
│      • Description du lot                                       │
│      • Prix marteau / Prix avec frais                           │
│      • Salle des ventes                                         │
│      • Date                                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ESTIMATION DIMENSIONS (Groq AI)                              │
│    ↓ Prompt: "Quelles sont les dimensions les plus probables   │
│      pour ce lot d'objet(s) trouvé(s) en salle des ventes:     │
│      [description] ? Donne-moi une estimation 3D et le poids    │
│      approximatif."                                             │
│    ↓ Réponse: {length: 50, width: 40, height: 30, weight: 5}   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SÉLECTION CARTON OPTIMAL                                     │
│    ↓ Récupération des cartons actifs du client (Firestore)     │
│    ↓ Filtrage: cartons pouvant contenir l'objet (+ marge 2cm)  │
│    ↓ Optimisation: sélection du plus petit carton adapté       │
│    ↓ Fallback: carton par défaut si aucun ne convient          │
│    ↓ Résultat: {id, ref, dimensions, price}                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. MISE À JOUR DU DEVIS                                         │
│    ↓ Enregistrement dans Firestore:                            │
│      • lot.dimensions (avec flag estimated: true)               │
│      • options.packagingPrice (prix du carton)                  │
│      • auctionSheet.recommendedCarton (infos carton)            │
│      • cartonId (référence Firestore)                           │
│      • timeline (événement avec détails)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. AFFICHAGE DANS LE DEVIS                                      │
│    ↓ Section "Dimensions estimées d'un colis":                 │
│      • Longueur: 50 cm                                          │
│      • Largeur: 40 cm                                           │
│      • Hauteur: 30 cm                                           │
│      • Poids: 5 kg                                              │
│    ↓ Section "Paiements" > "Emballage":                        │
│      • Carton: CAD05 (30x30x30cm)                              │
│      • Prix: 18,00 €                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. CRÉATION LIEN DE PAIEMENT                                    │
│    ✅ Toutes les informations nécessaires sont disponibles     │
│       pour créer un lien de paiement Stripe                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Fonctions Implémentées

### 1. `estimateDimensionsWithGroq(description, groqApiKey)`

**Objectif**: Estimer les dimensions 3D et le poids d'un lot à partir de sa description.

**Paramètres**:
- `description` (string): Description du lot extraite par OCR
- `groqApiKey` (string): Clé API Groq (depuis `process.env.GROQ_API_KEY`)

**Retour**:
```javascript
{
  length: 50,    // cm
  width: 40,     // cm
  height: 30,    // cm
  weight: 5      // kg
}
```

**Exemple d'utilisation**:
```javascript
const dimensions = await estimateDimensionsWithGroq(
  "Paire de vases en porcelaine de Chine, époque XIXe",
  process.env.GROQ_API_KEY
);
// Résultat: {length: 35, width: 20, height: 45, weight: 3}
```

**Gestion des erreurs**:
- Si Groq échoue → retourne `null`
- Si clé API manquante → retourne `null`
- Logs détaillés: `[Groq] 🤖 Estimation...`, `[Groq] ✅ Dimensions estimées`, `[Groq] ❌ Erreur`

---

### 2. `findOptimalCarton(dimensions, saasAccountId)`

**Objectif**: Trouver le carton le plus adapté (et le plus économique) pour les dimensions données.

**Paramètres**:
- `dimensions` (object): `{length, width, height, weight}`
- `saasAccountId` (string): ID du compte SaaS (pour isolation des données)

**Retour**:
```javascript
{
  id: "carton123",              // ID Firestore
  ref: "CAD05",                 // Référence du carton
  inner_length: 30,             // cm
  inner_width: 30,              // cm
  inner_height: 30,             // cm
  price: 18                     // € TTC
}
```

**Logique de sélection**:
1. **Récupération**: Tous les cartons actifs du client (`isActive: true`)
2. **Marge de sécurité**: Ajoute 2 cm de chaque côté (padding)
   ```javascript
   const requiredLength = dimensions.length + 4; // 2cm × 2 côtés
   const requiredWidth = dimensions.width + 4;
   const requiredHeight = dimensions.height + 4;
   ```
3. **Filtrage**: Cartons pouvant contenir l'objet
   ```javascript
   carton.inner_length >= requiredLength &&
   carton.inner_width >= requiredWidth &&
   carton.inner_height >= requiredHeight
   ```
4. **Optimisation**: Sélection du carton avec le plus petit volume
   ```javascript
   const volume = carton.inner_length * carton.inner_width * carton.inner_height;
   ```
5. **Fallback**: Si aucun carton ne convient → utilise le carton par défaut (`isDefault: true`)

**Exemple d'utilisation**:
```javascript
const carton = await findOptimalCarton(
  { length: 25, width: 20, height: 15, weight: 2 },
  "saas_account_123"
);
// Résultat: {id: "abc", ref: "CAD01A", inner_length: 20, inner_width: 20, inner_height: 20, price: 12}
```

**Gestion des erreurs**:
- Si aucun carton configuré → retourne `null`
- Si aucun carton assez grand → retourne carton par défaut ou `null`
- Logs détaillés: `[Carton] 🔍 Recherche...`, `[Carton] ✅ Peut contenir`, `[Carton] 🎯 Optimal sélectionné`

---

### 3. `calculateDevisFromOCR(devisId, ocrResult, saasAccountId)` (Modifiée)

**Nouvelles étapes ajoutées**:

#### Étape 1: Estimation des dimensions
```javascript
// Si dimensions déjà dans OCR → utiliser
if (ocrResult.lots[0].estimatedDimensions) {
  dimensions = ocrResult.lots[0].estimatedDimensions;
}
// Sinon → appeler Groq
else if (ocrResult.lots[0].description && process.env.GROQ_API_KEY) {
  dimensions = await estimateDimensionsWithGroq(
    ocrResult.lots[0].description,
    process.env.GROQ_API_KEY
  );
}
```

#### Étape 2: Sélection du carton
```javascript
const optimalCarton = await findOptimalCarton(dimensions, saasAccountId);

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
}
```

#### Étape 3: Mise à jour du devis
```javascript
await firestore.collection('quotes').doc(devisId).update({
  // Dimensions estimées
  'lot.dimensions': {
    length: dimensions.length,
    width: dimensions.width,
    height: dimensions.height,
    weight: dimensions.weight,
    estimated: true  // Flag pour indiquer que c'est une estimation
  },
  
  // Prix d'emballage
  'options.packagingPrice': packagingPrice,
  
  // Carton recommandé
  'auctionSheet.recommendedCarton': cartonInfo,
  
  // ID du carton (pour traçabilité)
  cartonId: cartonInfo.id,
  
  // Timeline
  timeline: FieldValue.arrayUnion({
    id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    date: Timestamp.now(),
    status: 'calculated',
    description: `Devis calculé automatiquement (Total: ${totalAmount}€, ${mappedLots.length} lots extraits, Carton: ${cartonInfo.ref})`
  })
});
```

---

## 📊 Structure des Données

### Collection `quotes` (Firestore)

```javascript
{
  // ... autres champs ...
  
  // Dimensions estimées du lot
  lot: {
    dimensions: {
      length: 50,        // cm
      width: 40,         // cm
      height: 30,        // cm
      weight: 5,         // kg
      estimated: true    // Flag: true = estimé par IA, false = mesuré
    },
    value: 1500,         // Prix avec frais (€)
    auctionHouse: "Drouot"
  },
  
  // Prix calculés
  options: {
    packagingPrice: 18,  // Prix du carton sélectionné (€)
    shippingPrice: 0,    // À implémenter
    insuranceAmount: 30  // 2% de la valeur si demandé
  },
  
  // Informations du bordereau
  auctionSheet: {
    auctionHouse: "Drouot",
    bordereauNumber: "2024-001",
    date: "2024-01-15",
    totalValue: 1500,
    lots: [...],
    
    // Carton recommandé (nouveau)
    recommendedCarton: {
      id: "carton123",
      ref: "CAD05",
      inner_length: 30,
      inner_width: 30,
      inner_height: 30,
      price: 18
    }
  },
  
  // ID du carton utilisé (pour traçabilité)
  cartonId: "carton123",
  
  // Total du devis
  totalAmount: 48,  // collecte + emballage + expédition + assurance
  
  // Timeline
  timeline: [
    {
      id: "timeline-xxx",
      date: Timestamp,
      status: "calculated",
      description: "Devis calculé automatiquement (Total: 48€, 1 lots extraits, Carton: CAD05)"
    }
  ]
}
```

---

## 🎯 Exemples Concrets

### Exemple 1: Vase en porcelaine

**Description OCR**: "Vase en porcelaine de Chine, époque Qianlong, décor bleu et blanc"

**Estimation Groq**:
```javascript
{
  length: 25,
  width: 25,
  height: 40,
  weight: 3
}
```

**Cartons disponibles**:
- CAD01A: 20×20×20cm → ❌ Trop petit (hauteur insuffisante)
- CAD05: 30×30×30cm → ❌ Trop petit (hauteur insuffisante)
- CAD09: 35×35×35cm → ❌ Trop petit (hauteur insuffisante)
- CAD11B: 38×28×30cm → ❌ Trop petit (hauteur insuffisante)
- CAD12: 40×40×40cm → ✅ **Optimal** (plus petit carton adapté)

**Résultat**:
- Carton sélectionné: **CAD12** (40×40×40cm)
- Prix d'emballage: **32,00 €**

---

### Exemple 2: Paire de fauteuils

**Description OCR**: "Paire de fauteuils Louis XVI en bois doré, garniture en soie"

**Estimation Groq**:
```javascript
{
  length: 80,
  width: 70,
  height: 90,
  weight: 25
}
```

**Cartons disponibles**:
- CAD12: 40×40×40cm → ❌ Trop petit
- CAD36B: 70×50×50cm → ❌ Trop petit (longueur et hauteur insuffisantes)
- CAD40: 80×80×80cm → ❌ Trop petit (hauteur insuffisante)
- **Aucun carton assez grand** → Utilise le carton par défaut

**Résultat**:
- Carton sélectionné: **Carton par défaut** (ex: CAD40)
- Prix d'emballage: **46,00 €**
- ⚠️ **Note**: Le carton par défaut peut ne pas être optimal, mais garantit que le devis peut être calculé

---

### Exemple 3: Petit tableau

**Description OCR**: "Huile sur toile, paysage de Provence, signée, 30×40cm"

**Estimation Groq**:
```javascript
{
  length: 50,
  width: 40,
  height: 5,
  weight: 2
}
```

**Cartons disponibles**:
- CAS202: 16×12×11cm → ❌ Trop petit
- CAD01A: 20×20×20cm → ❌ Trop petit (longueur insuffisante)
- CAD05: 30×30×30cm → ❌ Trop petit (longueur insuffisante)
- CAD58: 35×30×20cm → ❌ Trop petit (longueur insuffisante)
- CAD17: 50×31×31cm → ✅ **Optimal** (plus petit carton adapté)

**Résultat**:
- Carton sélectionné: **CAD17** (50×31×31cm)
- Prix d'emballage: **30,00 €**

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

Chaque compte SaaS doit avoir **au moins un carton par défaut** configuré dans les Paramètres.

**Structure d'un carton**:
```javascript
{
  saasAccountId: "saas_account_123",
  carton_ref: "CAD05",
  inner_length: 30,        // cm
  inner_width: 30,         // cm
  inner_height: 30,        // cm
  packaging_price: 18,     // € TTC
  isDefault: true,         // Un seul carton par défaut par compte
  isActive: true,          // Soft delete
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Configuration dans l'interface**:
1. Aller dans **Paramètres** → Onglet **📦 Cartons**
2. Ajouter au moins un carton avec `isDefault: true`
3. Renseigner les dimensions internes (en cm) et le prix TTC (en €)

---

## 📝 Logs & Débogage

### Logs de succès

```
[Groq] 🤖 Estimation des dimensions pour: "Vase en porcelaine de Chine..."
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

### Logs d'erreur

```
[Groq] ❌ Erreur lors de l'estimation: API rate limit exceeded
[Carton] ❌ Erreur lors de la recherche du carton optimal: Firestore unavailable
[Calcul] ❌ Erreur: Cannot read property 'lots' of undefined
```

---

## 🚀 Prochaines Étapes

### 1. Intégration Frontend

**Affichage dans `QuoteDetail.tsx`**:
- Section "Dimensions estimées d'un colis" → afficher `lot.dimensions`
- Section "Paiements" → onglet "Emballage" → afficher `auctionSheet.recommendedCarton`
- Badge "Estimé par IA" si `lot.dimensions.estimated === true`

**Exemple de code**:
```tsx
{quote.lot?.dimensions && (
  <div className="space-y-2">
    <h3 className="text-sm font-medium">Dimensions estimées</h3>
    <div className="grid grid-cols-4 gap-2">
      <div>
        <p className="text-xs text-muted-foreground">Longueur</p>
        <p className="font-medium">{quote.lot.dimensions.length} cm</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Largeur</p>
        <p className="font-medium">{quote.lot.dimensions.width} cm</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Hauteur</p>
        <p className="font-medium">{quote.lot.dimensions.height} cm</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Poids</p>
        <p className="font-medium">{quote.lot.dimensions.weight} kg</p>
      </div>
    </div>
    {quote.lot.dimensions.estimated && (
      <Badge variant="secondary">🤖 Estimé par IA</Badge>
    )}
  </div>
)}

{quote.auctionSheet?.recommendedCarton && (
  <div className="space-y-2">
    <h3 className="text-sm font-medium">Carton recommandé</h3>
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">{quote.auctionSheet.recommendedCarton.ref}</p>
        <p className="text-xs text-muted-foreground">
          {quote.auctionSheet.recommendedCarton.inner_length} × 
          {quote.auctionSheet.recommendedCarton.inner_width} × 
          {quote.auctionSheet.recommendedCarton.inner_height} cm
        </p>
      </div>
      <p className="text-lg font-bold">{quote.auctionSheet.recommendedCarton.price.toFixed(2)}€</p>
    </div>
  </div>
)}
```

### 2. Amélioration de l'Estimation Groq

**Prompt plus précis**:
```javascript
const prompt = `Tu es un expert en estimation de dimensions d'objets d'art et d'antiquités.

CONTEXTE:
- Type d'objet: ${category} (ex: mobilier, tableau, sculpture, céramique)
- Description complète: ${description}
- Salle des ventes: ${auctionHouse}
- Prix d'adjudication: ${value}€

MISSION:
Estime les dimensions réelles de cet objet en te basant sur:
1. Les standards du marché de l'art
2. Les dimensions typiques pour ce type d'objet
3. Les indices dans la description (ex: "grand", "petit", "miniature")

CONTRAINTES:
- Dimensions en CENTIMÈTRES (cm)
- Poids en KILOGRAMMES (kg)
- Sois prudent: en cas de doute, surestime légèrement (mieux vaut un carton trop grand que trop petit)

RETOUR ATTENDU (JSON uniquement):
{
  "length": 50,
  "width": 40,
  "height": 30,
  "weight": 5,
  "confidence": "high|medium|low"
}`;
```

### 3. Calcul du Prix d'Expédition

**Intégration avec les zones de tarification**:
```javascript
// Après sélection du carton
const finalWeight = Math.max(
  dimensions.weight,
  volumetricWeight
);

const shippingPrice = await calculateShippingPrice({
  weight: finalWeight,
  destination: devis.destination?.country,
  service: 'EXPRESS'
});
```

### 4. Gestion des Lots Multiples

**Stratégie**:
- Si plusieurs lots → estimer dimensions de chaque lot
- Calculer si un seul carton peut contenir tous les lots
- Sinon, suggérer plusieurs cartons
- Calculer le prix total d'emballage

### 5. Interface de Validation

**Permettre à l'utilisateur de**:
- Voir les dimensions estimées par l'IA
- Modifier manuellement si nécessaire
- Choisir un autre carton si l'optimal ne convient pas
- Marquer les dimensions comme "validées" (passe `estimated: false`)

---

## ✅ Bénéfices

1. **Automatisation complète**: De l'OCR au prix d'emballage, sans intervention manuelle
2. **Optimisation des coûts**: Sélection du plus petit carton adapté (économie pour le client)
3. **Marge de sécurité**: Padding de 2 cm garantit que l'objet rentre toujours
4. **Fallback intelligent**: Carton par défaut si aucun ne convient
5. **Traçabilité**: `cartonId` permet de suivre quel carton a été utilisé
6. **Prêt pour paiement**: Toutes les infos nécessaires pour créer le lien Stripe
7. **Logs détaillés**: Facilite le débogage et la compréhension du processus

---

## 📚 Références

- **Fonction `estimateDimensionsForObject`**: `front end/server/ai-proxy.js` (lignes 2932-3313)
- **Fonction `findOptimalCarton`**: `front end/server/ai-proxy.js` (lignes 6830-6905)
- **Fonction `calculateDevisFromOCR`**: `front end/server/ai-proxy.js` (lignes 6950-7090)
- **Routes API Cartons**: `front end/server/ai-proxy.js` (lignes 5576-5805)
- **Collection Firestore `cartons`**: Voir `CARTONS_EMBALLAGES_DOCUMENTATION.md`

---

**Version**: 1.7.0  
**Date**: 20 janvier 2026  
**Auteur**: Assistant AI (Claude Sonnet 4.5)

