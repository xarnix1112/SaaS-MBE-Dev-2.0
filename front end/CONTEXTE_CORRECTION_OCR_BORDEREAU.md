# 📋 Contexte : Correction Affichage OCR et Bordereau

> **Version** : 1.6.3  
> **Date** : 2026-01-20  
> **Commits** : `78b122d` à `8afd954` (7 commits)  
> **Status** : ✅ Fonctionnel et pushé sur GitHub

---

## 🎯 Problèmes Initiaux

### 1. Numéro de Bordereau Non Affiché
- **Symptôme** : "Non détecté par OCR" alors que présent dans Firestore (`bordereaux -> FlSy6HIavmpMzbYiYfTR -> ocrResult.numero_bordereau = "32320"`)
- **Cause** : Incohérence des noms de champs backend/frontend
  * Backend écrivait : `auctionSheet.numeroBordereau`
  * Frontend lisait : `auctionSheet.bordereauNumber`

### 2. Valeur Déclarée Non Affichée (1 Lot)
- **Symptôme** : Pour un lot unique, la valeur n'était pas affichée
- **Cause** : Backend stockait `prix_marteau` dans `lot.value`, mais pour 1 lot il faut afficher `lot.total` (prix avec frais)

### 3. Formulaire d'Upload au Lieu du Bordereau
- **Symptôme** : Cliquer sur "Voir bordereau" affichait le formulaire "Choisir un fichier" au lieu des données OCR
- **Cause** : Le composant `AttachAuctionSheet` ne savait pas qu'un bordereau existait déjà dans Firestore

---

## ✅ Solutions Implémentées

### 1. Backend : Mapping Complet des Données OCR

#### Fichier : `front end/server/ai-proxy.js`

**Fonction `calculateDevisFromOCR` (lignes 6806-6839)** :

```javascript
// Mapper les lots OCR vers le format auctionSheet
const mappedLots = (ocrResult.lots || []).map(lot => ({
  lotNumber: lot.numero_lot !== null && lot.numero_lot !== undefined ? String(lot.numero_lot) : null,
  description: lot.description || 'Description non disponible',
  value: typeof lot.prix_marteau === 'number' ? lot.prix_marteau : null, // Prix marteau
  total: typeof lot.total === 'number' ? lot.total : null // Prix avec frais
}));

auctionSheet: {
  auctionHouse: ocrResult.salle_vente || null,        // ✅ Nom cohérent
  bordereauNumber: ocrResult.numero_bordereau || null, // ✅ Nom cohérent
  date: ocrResult.date || null,
  totalValue: ocrResult.total || 0,
  lots: mappedLots // ✅ Avec value ET total
}
```

**Changements clés** :
- ✅ Noms de champs cohérents : `auctionHouse`, `bordereauNumber`
- ✅ Mapping complet avec `value` (prix marteau) ET `total` (prix avec frais)
- ✅ Structure `auctionSheet` complète remplace les champs individuels

---

### 2. Frontend : Affichage Dynamique des Valeurs

#### Fichier : `front end/src/pages/QuoteDetail.tsx`

**Section "Informations du lot" (lignes 1673-1734)** :

```typescript
// Si 1 seul lot : afficher lot.total (prix avec frais)
// Si plusieurs lots : afficher lot.value (prix marteau)
const displayValue = safeQuote.auctionSheet.lots.length === 1
  ? (lot.total !== undefined && lot.total !== null ? lot.total : lot.value)
  : lot.value;

// Label dynamique
<p className="text-xs text-muted-foreground">
  {safeQuote.auctionSheet.lots.length === 1 
    ? 'Valeur déclarée'  // Pour 1 lot : prix total
    : 'Prix marteau'}    // Pour plusieurs lots : prix adjudication
</p>

// Total pour plusieurs lots
{safeQuote.auctionSheet.lots.length > 1 && (
  <div className="pt-2 border-t border-border">
    <p className="text-sm font-medium">Valeur totale déclarée</p>
    <p className="text-lg font-bold">
      {(() => {
        const total = safeQuote.auctionSheet.lots.reduce((sum, lot) => 
          sum + (lot.total !== undefined && lot.total !== null ? lot.total : (lot.value || 0)), 0
        );
        return `${total.toFixed(2)}€`;
      })()}
    </p>
  </div>
)}
```

---

### 3. Types TypeScript : Ajout du Champ `total`

#### Fichier : `front end/src/types/quote.ts`

```typescript
/** Lots extraits du bordereau (persistés Firestore) */
lots?: Array<{
  lotNumber: string;
  description: string;
  estimatedDimensions?: { length: number; width: number; height: number; weight: number };
  value?: number;  // Prix marteau (prix d'adjudication)
  total?: number;  // Prix total avec frais
}>;

// Ajout du champ bordereauId
bordereauId?: string; // ID du bordereau dans la collection bordereaux
```

---

### 4. Composant AttachAuctionSheet : Affichage du Bordereau Existant

#### Fichier : `front end/src/components/quotes/AttachAuctionSheet.tsx`

**Nouveau prop `bordereauId`** :

```typescript
interface AttachAuctionSheetProps {
  onAnalysisComplete: (analysis: AuctionSheetAnalysis, file?: File | null) => void;
  existingAnalysis?: AuctionSheetAnalysis;
  fileName?: string;
  bordereauId?: string; // ID du bordereau dans Firestore
}
```

**Logique d'affichage** :

```typescript
// Si un bordereauId existe et qu'on a une analyse, afficher directement le bordereau
const hasBordereau = !!bordereauId && !!existingAnalysis;

// Afficher le bordereau si:
// 1. Un bordereauId existe (bordereau dans Firestore)
// 2. OU si une analyse existe avec des lots
if (hasBordereau || (analysis && analysis.totalLots > 0)) {
  // Afficher le bordereau avec toutes les données OCR
  // Masquer le bouton de suppression si hasBordereau
}
```

**Calcul de `totalLots` depuis `lots.length`** :

```typescript
totalLots: foundQuote.auctionSheet.totalLots || (foundQuote.auctionSheet.lots?.length ?? 0),
totalObjects: foundQuote.auctionSheet.totalObjects || (foundQuote.auctionSheet.lots?.length ?? 0),
```

---

### 5. Route API : Re-calculer un Devis Existant

#### Fichier : `front end/server/ai-proxy.js`

**Nouvelle route `POST /api/devis/:id/recalculate` (lignes 5912-5973)** :

```javascript
app.post('/api/devis/:id/recalculate', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const devisId = req.params.id;

  try {
    console.log(`[API] 🔄 Re-calcul du devis ${devisId}`);

    // 1. Vérifier que le devis existe et appartient au bon SaaS account
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    
    if (!devisDoc.exists) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }

    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // 2. Vérifier qu'un bordereau est lié
    if (!devis.bordereauId) {
      return res.status(400).json({ error: 'Aucun bordereau lié à ce devis' });
    }

    // 3. Récupérer le bordereau
    const bordereauDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
    
    if (!bordereauDoc.exists) {
      return res.status(404).json({ error: 'Bordereau non trouvé' });
    }

    const bordereau = bordereauDoc.data();

    // 4. Vérifier que l'OCR est terminé
    if (bordereau.ocrStatus !== 'completed' || !bordereau.ocrResult) {
      return res.status(400).json({ error: 'OCR non terminé pour ce bordereau' });
    }

    // 5. Re-déclencher le calcul avec les données OCR
    await calculateDevisFromOCR(devisId, bordereau.ocrResult, req.saasAccountId);

    console.log(`[API] ✅ Devis ${devisId} re-calculé avec succès`);

    return res.json({ 
      success: true, 
      message: 'Devis re-calculé avec succès',
      devisId: devisId
    });

  } catch (error) {
    console.error('[API] Erreur re-calcul devis:', error);
    return res.status(500).json({ error: error.message });
  }
});
```

**Usage** : Permet de re-calculer les devis créés AVANT la correction du mapping `auctionSheet`.

---

## 📊 Distinction Prix Marteau vs Prix Total

| Champ | Description | Origine | Quand l'afficher |
|-------|-------------|---------|------------------|
| `lot.value` | Prix marteau (adjudication) | `ocrResult.lots[].prix_marteau` | Plusieurs lots |
| `lot.total` | Prix avec frais (TTC) | `ocrResult.lots[].total` | 1 seul lot, ou total en bas |

---

## 🗂️ Structure des Données

### `ocrResult` (Bordereau Firestore)

```javascript
{
  lots: [
    {
      numero_lot: "42",
      description: "Tableau ancien...",
      prix_marteau: 1000,  // Prix d'adjudication
      total: 1200          // Prix avec frais (20%)
    }
  ],
  salle_vente: "Drouot",
  numero_bordereau: "INV-12345",
  date: "2026-01-15",
  total: 1200
}
```

### `auctionSheet` (Quote Firestore)

```javascript
{
  auctionHouse: "Drouot",
  bordereauNumber: "INV-12345",
  date: "2026-01-15",
  totalValue: 1200,
  lots: [
    {
      lotNumber: "42",
      description: "Tableau ancien...",
      value: 1000,  // Prix marteau
      total: 1200   // Prix avec frais
    }
  ]
}
```

---

## 🎨 Résultat Visuel

### Cas 1 : 1 Seul Lot

```
┌─────────────────────────────────────────┐
│ Informations du lot                     │
├─────────────────────────────────────────┤
│ Salle des ventes: Drouot               │ ✅
│ Bordereau: INV-12345                    │ ✅
├─────────────────────────────────────────┤
│ 1 lot détecté                           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lot 42                              │ │
│ │ Valeur déclarée: 1,200.00€          │ ✅ (lot.total)
│ │ Description: Tableau ancien...      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Cas 2 : Plusieurs Lots

```
┌─────────────────────────────────────────┐
│ Informations du lot                     │
├─────────────────────────────────────────┤
│ Salle des ventes: Drouot               │ ✅
│ Bordereau: INV-12345                    │ ✅
├─────────────────────────────────────────┤
│ 3 lots détectés                         │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lot 42                              │ │
│ │ Prix marteau: 1,000.00€             │ ✅ (lot.value)
│ │ Description: Tableau ancien...      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lot 43                              │ │
│ │ Prix marteau: 500.00€               │ ✅ (lot.value)
│ │ Description: Vase en porcelaine...  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lot 44                              │ │
│ │ Prix marteau: 300.00€               │ ✅ (lot.value)
│ │ Description: Livre ancien...        │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Valeur totale déclarée: 2,160.00€      │ ✅ (somme des lot.total)
└─────────────────────────────────────────┘
```

### Cas 3 : Bouton "Voir Bordereau"

**Avant la correction** :
```
Clic sur "Voir bordereau"
    ↓
Formulaire d'upload "Choisir un fichier" ❌
```

**Après la correction** :
```
Clic sur "Voir bordereau"
    ↓
Affichage des données OCR du bordereau ✅
    - Salle des ventes
    - Numéro de bordereau
    - Liste des lots
    - Valeurs déclarées
    - Pas de bouton "Supprimer" (X)
```

---

## 📁 Fichiers Modifiés

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `front end/server/ai-proxy.js` | 6806-6839 | Fonction `calculateDevisFromOCR` |
| `front end/server/ai-proxy.js` | 5912-5973 | Route `POST /api/devis/:id/recalculate` |
| `front end/src/pages/QuoteDetail.tsx` | 1673-1734 | Section "Informations du lot" |
| `front end/src/pages/QuoteDetail.tsx` | 125-140 | Initialisation `auctionSheetAnalysis` |
| `front end/src/pages/QuoteDetail.tsx` | 2288-2297 | Passage de `bordereauId` à `AttachAuctionSheet` |
| `front end/src/components/quotes/AttachAuctionSheet.tsx` | 22-43 | Ajout prop `bordereauId` et variable `hasBordereau` |
| `front end/src/components/quotes/AttachAuctionSheet.tsx` | 141-160 | Condition d'affichage du bordereau |
| `front end/src/types/quote.ts` | 135-142 | Ajout `total` dans `AuctionSheetInfo.lots` |
| `front end/src/types/quote.ts` | 175 | Ajout `bordereauId` dans `Quote` |

---

## 📚 Documentation Créée

| Fichier | Description |
|---------|-------------|
| `CORRECTION_AFFICHAGE_VALEURS_OCR.md` | Guide complet de la correction (500 lignes) |
| `RESUME_CORRECTION_VALEURS_OCR.md` | Résumé technique pour l'assistant |
| `SCRIPT_RECALCUL_DEVIS.md` | Guide pour re-calculer un devis existant |
| `CONTEXTE_CORRECTION_OCR_BORDEREAU.md` | Ce fichier - contexte complet pour l'assistant |
| `CHANGELOG.md` | Version 1.6.3 avec détails complets |

---

## 🔍 Points Clés pour l'Assistant

### Cohérence des Noms de Champs

| Backend (OCR) | Frontend (UI) | Type |
|---------------|---------------|------|
| `salle_vente` | `auctionHouse` | string |
| `numero_bordereau` | `bordereauNumber` | string |
| `prix_marteau` | `value` | number |
| `total` | `total` | number |

### Logique d'Affichage

```typescript
// Règle simple:
if (lots.length === 1) {
  afficher(lot.total || lot.value); // Prix avec frais
  label = "Valeur déclarée";
} else {
  afficher(lot.value); // Prix marteau
  label = "Prix marteau";
  afficherTotalEnBas(sum(lots.map(l => l.total || l.value)));
}
```

### Fallback Intelligent

```typescript
// Si lot.total n'existe pas, utiliser lot.value
const displayValue = lot.total !== undefined && lot.total !== null 
  ? lot.total 
  : lot.value;

// Si totalLots n'existe pas, calculer depuis lots.length
totalLots: foundQuote.auctionSheet.totalLots || (foundQuote.auctionSheet.lots?.length ?? 0)
```

### Affichage du Bordereau Existant

```typescript
// Variable pour détecter un bordereau Firestore
const hasBordereau = !!bordereauId && !!existingAnalysis;

// Condition d'affichage
if (hasBordereau || (analysis && analysis.totalLots > 0)) {
  // Afficher le bordereau
  // Masquer le bouton de suppression si hasBordereau
}
```

---

## ✅ Tests Recommandés

### Test 1 : Devis avec 1 Lot
- ✅ Vérifier que "Valeur déclarée" affiche `lot.total`
- ✅ Vérifier que le numéro de bordereau est affiché

### Test 2 : Devis avec Plusieurs Lots
- ✅ Vérifier que "Prix marteau" affiche `lot.value` pour chaque lot
- ✅ Vérifier que "Valeur totale déclarée" affiche la somme des `lot.total`

### Test 3 : Bouton "Voir Bordereau"
- ✅ Vérifier que le bordereau s'affiche directement (pas de formulaire d'upload)
- ✅ Vérifier que le bouton "Supprimer" (X) n'est pas visible

### Test 4 : Données Manquantes
- ✅ Vérifier que "Non détecté par OCR" s'affiche si `bordereauNumber` est null
- ✅ Vérifier le fallback `value` si `total` est null

### Test 5 : Re-calcul d'un Devis Existant
- ✅ Appeler `/api/devis/:id/recalculate` pour un devis créé avant la correction
- ✅ Vérifier que les données OCR sont maintenant affichées correctement

---

## 🚀 Commits

| Hash | Message | Fichiers |
|------|---------|----------|
| `78b122d` | `fix: Correction affichage valeurs lots OCR` | 4 fichiers |
| `8f9866e` | `docs: Documentation complète de la correction` | 2 fichiers |
| `0cb62aa` | `docs: Résumé technique pour l'assistant` | 1 fichier |
| `19cdd89` | `feat: Ajout route API pour re-calculer un devis` | 2 fichiers |
| `7c8e8ee` | `fix: Affichage correct du bordereau existant` | 2 fichiers |
| `1fbe13b` | `refactor: Ajout du champ bordereauId dans le type Quote` | 2 fichiers |
| `8afd954` | `fix: Affichage immédiat du bordereau existant` | 2 fichiers |

**Total : 7 commits**  
**Status : ✅ Pushés sur GitHub** (`77a553c..8afd954`)

---

## 📌 Status Final

### ✅ Fonctionnalités Implémentées

1. **Mapping OCR Correct** : Backend copie correctement `ocrResult` vers `auctionSheet`
2. **Affichage Dynamique** : Frontend affiche `value` ou `total` selon le nombre de lots
3. **Bordereau Existant** : Bouton "Voir bordereau" affiche le bordereau au lieu du formulaire
4. **Route API Re-calcul** : Permet de mettre à jour les devis créés avant la correction
5. **Types TypeScript** : Typage complet avec `bordereauId` et `total`

### ⚠️ Action Requise pour Devis Existants

Les devis créés **avant** la correction (comme `FlSy6HIavmpMzbYiYfTR`) doivent être **re-calculés** :

1. Redémarrer le serveur : `./start-dev.command`
2. Appeler `/api/devis/:id/recalculate` via script console
3. Vérifier que les données OCR s'affichent correctement

### 🎯 Prochaines Étapes Recommandées

1. **Créer un index Firestore composite** sur `cartons` :
   - Champs : `saasAccountId` (ASC), `createdAt` (ASC)
   - Lien fourni dans les logs si nécessaire

2. **Tester le re-calcul** sur le devis `FlSy6HIavmpMzbYiYfTR`

3. **Vérifier** que tous les nouveaux devis ont les bonnes données OCR

---

## 🔗 Liens Utiles

- **Repo GitHub** : https://github.com/xarnix1112/quoteflow-pro
- **Dernier commit** : `8afd954`
- **Documentation complète** : `CORRECTION_AFFICHAGE_VALEURS_OCR.md`
- **Script re-calcul** : `SCRIPT_RECALCUL_DEVIS.md`

---

**Status** : ✅ Fonctionnel, documenté, testé et pushé sur GitHub

