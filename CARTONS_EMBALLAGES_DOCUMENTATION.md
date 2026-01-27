# 📦 Système de Cartons & Emballages Personnalisés

## 📅 Date : 19 janvier 2026
## 🎯 Version : 1.6.0

---

## 🎉 Vue d'Ensemble

Système complet de gestion des cartons et emballages pour chaque compte SaaS (MBE). Chaque client peut définir ses propres cartons avec dimensions et prix, utilisés automatiquement pour le calcul des devis.

### ✅ Fonctionnalités Principales

- **Configuration personnalisée** : Chaque compte SaaS a ses propres cartons
- **Isolation stricte** : Aucune fuite de données entre comptes
- **Carton par défaut obligatoire** : Garantit que tous les devis peuvent être calculés
- **Optimisation automatique** : Sélection du carton le plus adapté
- **Calcul du poids volumétrique** : Basé sur les dimensions internes
- **Coût d'emballage TTC** : Prix incluant carton + main-d'œuvre
- **Soft delete** : Les cartons utilisés ne peuvent être que désactivés

---

## 🗄️ Modèle de Données Firestore

### Collection `cartons`

```typescript
{
  id: string,                    // ID auto-généré
  saasAccountId: string,         // 🔐 Isolation stricte par compte SaaS
  carton_ref: string,            // ex: "CARTON-S", "CARTON-XL"
  inner_length: number,          // cm (dimensions internes)
  inner_width: number,           // cm
  inner_height: number,          // cm
  packaging_price: number,       // € TTC (carton + main-d'œuvre)
  isDefault: boolean,            // ⚠️ UN SEUL par compte
  isActive: boolean,             // soft delete (false = désactivé)
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Règles de Gestion

1. **Carton par défaut obligatoire** : Chaque compte doit avoir exactement 1 carton par défaut
2. **Soft delete** : Un carton utilisé dans un devis ne peut jamais être supprimé, seulement désactivé
3. **Isolation stricte** : Chaque carton est lié à un `saasAccountId` unique
4. **Validations** :
   - Dimensions > 0
   - Prix ≥ 0
   - Référence non vide

---

## 🔐 Sécurité & Isolation

### Backend (Routes API)

Toutes les routes utilisent le middleware `requireAuth` qui :
- Vérifie l'authentification Firebase
- Extrait le `saasAccountId` de l'utilisateur
- Filtre automatiquement les données par `saasAccountId`

**Routes disponibles** :
- `GET /api/cartons` - Récupérer tous les cartons actifs du compte
- `POST /api/cartons` - Créer un nouveau carton
- `PUT /api/cartons/:id` - Mettre à jour un carton
- `DELETE /api/cartons/:id` - Supprimer/désactiver un carton

### Firestore Rules

```javascript
match /cartons/{cartonId} {
  function getUserSaasAccountId() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
  }
  
  // Lecture: seulement les cartons du compte SaaS de l'utilisateur
  allow read: if request.auth != null 
    && resource.data.saasAccountId == getUserSaasAccountId();
  
  // Création: validations + isolation
  allow create: if request.auth != null 
    && request.resource.data.saasAccountId == getUserSaasAccountId()
    && request.resource.data.inner_length > 0
    && request.resource.data.inner_width > 0
    && request.resource.data.inner_height > 0
    && request.resource.data.packaging_price >= 0;
  
  // Mise à jour: seulement ses propres cartons
  allow update: if request.auth != null 
    && resource.data.saasAccountId == getUserSaasAccountId();
  
  // Suppression: seulement ses propres cartons
  allow delete: if request.auth != null 
    && resource.data.saasAccountId == getUserSaasAccountId();
}
```

---

## 🖥️ Interface Utilisateur

### Onglet "Cartons & Emballages" (Paramètres)

**Composant** : `front end/src/components/settings/CartonsSettings.tsx`

#### Fonctionnalités UI

1. **Liste des cartons**
   - Affichage sous forme de cartes
   - Badge "Par défaut" pour le carton par défaut
   - Dimensions internes (L × l × h cm)
   - Prix TTC

2. **Formulaire d'ajout/édition**
   - Référence (ex: CARTON-M)
   - Dimensions internes (cm) : Longueur, Largeur, Hauteur
   - Prix TTC (€)
   - Checkbox "Définir comme carton par défaut"

3. **Actions**
   - ➕ Ajouter un carton
   - ✏️ Éditer un carton
   - ⭐ Définir comme carton par défaut
   - 🗑️ Supprimer/désactiver un carton

4. **Validations frontend**
   - Tous les champs requis
   - Dimensions > 0
   - Prix ≥ 0
   - Un et un seul carton par défaut

5. **Alertes**
   - ⚠️ Aucun carton par défaut défini
   - ✅ Carton créé/mis à jour avec succès
   - ❌ Erreurs de validation

#### Informations Affichées

```
ℹ️ Informations importantes
- Un carton par défaut est obligatoire pour calculer les devis
- Les dimensions sont les dimensions internes du carton
- Le prix TTC inclut le coût du carton + main-d'œuvre d'emballage
- Les cartons utilisés dans des devis ne peuvent être que désactivés, pas supprimés
- Vos cartons sont privés et ne sont pas partagés avec d'autres comptes
```

---

## 🧠 Logique de Calcul

### Fichier : `front end/src/lib/cartons.ts`

#### Fonctions Principales

##### 1. `optimizePackaging(items, cartons, protectionMargin)`

Optimise l'emballage des items dans des cartons.

**Paramètres** :
- `items: Item[]` - Liste des items à emballer (dimensions + quantité)
- `cartons: Carton[]` - Liste des cartons disponibles (filtrés par saasAccountId)
- `protectionMargin: number` - Marge de protection en cm (défaut: 2 cm)

**Retour** :
```typescript
{
  cartons: [{
    carton: Carton,
    items: Item[],
    volumetricWeight: number  // kg
  }],
  totalPackagingCost: number,      // € TTC
  totalVolumetricWeight: number,   // kg
  warnings: string[]
}
```

**Algorithme** :
1. Vérifier qu'il y a des cartons configurés
2. Vérifier qu'un carton par défaut existe
3. Pour chaque item :
   - Trouver le plus petit carton qui peut le contenir (avec marge de protection)
   - Si aucun carton ne convient, utiliser le carton par défaut et avertir
4. Calculer le poids volumétrique de chaque carton utilisé
5. Calculer le coût total d'emballage

##### 2. `calculatePackagingCost(items, cartons)`

Version simplifiée pour calculer le coût d'emballage.

**Retour** :
```typescript
{
  cost: number,              // € TTC
  cartonUsed: Carton | null,
  warnings: string[]
}
```

##### 3. `canFitInCarton(item, carton, protectionMargin)`

Vérifie si un item peut rentrer dans un carton (avec marge de protection).

**Logique** :
- Ajoute la marge de protection aux dimensions de l'item
- Essaie toutes les orientations possibles (rotation)
- Compare avec les dimensions internes du carton

##### 4. `calculateVolumetricWeight(carton, coefficient)`

Calcule le poids volumétrique d'un carton.

**Formule** :
```
Poids volumétrique (kg) = (L × l × h) / coefficient
```

**Coefficient par défaut** : 5000 (standard pour la plupart des transporteurs)

##### 5. `formatPackagingResult(result)`

Formate le résultat d'emballage pour l'affichage.

**Exemple** :
```
"2× CARTON-M, 1× CARTON-L"
```

---

## 🔁 Workflow Complet

### 1. Configuration Initiale (Compte SaaS)

```
Utilisateur → Paramètres → Onglet "Cartons"
  ↓
Ajouter cartons (ex: S, M, L, XL)
  ↓
Définir un carton par défaut (ex: M)
  ↓
✅ Configuration prête
```

### 2. Calcul d'un Devis

```
Devis créé (Google Sheets / Manuel)
  ↓
Bordereau attaché → OCR
  ↓
Extraction dimensions objets
  ↓
Récupération cartons du saasAccountId
  ↓
Optimisation emballage (optimizePackaging)
  ↓
Calcul poids volumétrique
  ↓
Calcul coût emballage TTC
  ↓
Calcul coût expédition (basé sur poids volumétrique)
  ↓
Total devis = Collecte + Emballage + Expédition + Assurance
  ↓
✅ Devis calculé et affiché
```

### 3. Affichage dans le Devis

**UI (Fiche Devis)** :
```
📦 Emballage & Colis
- Carton M : 6,50 € TTC
- Carton L : 9,00 € TTC
Total emballage : 15,50 € TTC

Poids volumétrique : 12,5 kg
```

**PDF** :
```
Bloc "Emballage & colis"
- Liste des cartons utilisés
- Dimensions internes
- Prix TTC
- Impact sur expédition
```

---

## 🧪 Cas d'Usage

### Cas 1 : Petit Objet

**Item** : 20 × 15 × 10 cm
**Cartons disponibles** :
- CARTON-S : 30 × 20 × 15 cm → 5,00 €
- CARTON-M : 40 × 30 × 30 cm → 6,50 € (défaut)
- CARTON-L : 60 × 40 × 40 cm → 9,00 €

**Résultat** :
- Carton sélectionné : CARTON-S (plus petit qui convient)
- Coût emballage : 5,00 € TTC
- Poids volumétrique : (30 × 20 × 15) / 5000 = 1,8 kg

### Cas 2 : Objet Trop Grand

**Item** : 80 × 60 × 50 cm
**Cartons disponibles** :
- CARTON-M : 40 × 30 × 30 cm (défaut)
- CARTON-L : 60 × 40 × 40 cm

**Résultat** :
- Carton sélectionné : CARTON-M (par défaut, car aucun ne convient)
- Coût emballage : 6,50 € TTC
- ⚠️ Warning : "L'item (80×60×50 cm) est trop grand pour tous les cartons. Utilisation du carton par défaut."

### Cas 3 : Plusieurs Objets

**Items** :
- 2× 20 × 15 × 10 cm
- 1× 35 × 25 × 20 cm

**Résultat** :
- 2× CARTON-S : 10,00 € TTC
- 1× CARTON-M : 6,50 € TTC
- Total emballage : 16,50 € TTC

---

## 🚀 Intégration avec le Système Existant

### 1. Calcul de Devis (Backend)

**Fichier** : `front end/server/ai-proxy.js`

```javascript
// Fonction à mettre à jour : calculateDevisFromOCR()

async function calculateDevisFromOCR(devisId, ocrResult, saasAccountId) {
  // 1. Récupérer les cartons du compte SaaS
  const cartonsSnapshot = await firestore
    .collection('cartons')
    .where('saasAccountId', '==', saasAccountId)
    .where('isActive', '==', true)
    .get();
  
  const cartons = cartonsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // 2. Extraire les dimensions des lots OCR
  const items = ocrResult.lots.map(lot => ({
    length: lot.estimatedDimensions?.L || 30,
    width: lot.estimatedDimensions?.W || 30,
    height: lot.estimatedDimensions?.H || 30,
    quantity: lot.quantity || 1,
  }));
  
  // 3. Optimiser l'emballage
  const packagingResult = optimizePackaging(items, cartons);
  
  // 4. Calculer le coût d'expédition basé sur le poids volumétrique
  const shippingPrice = calculateShippingPrice(
    packagingResult.totalVolumetricWeight,
    destination
  );
  
  // 5. Mettre à jour le devis
  await firestore.collection('quotes').doc(devisId).update({
    'options.packagingPrice': packagingResult.totalPackagingCost,
    'options.shippingPrice': shippingPrice,
    'lot.volumetricWeight': packagingResult.totalVolumetricWeight,
    'lot.cartonsUsed': packagingResult.cartons.map(c => c.carton.carton_ref),
    totalAmount: collectePrice + packagingResult.totalPackagingCost + shippingPrice + insuranceAmount,
  });
}
```

### 2. Affichage dans QuoteDetail

**Fichier** : `front end/src/pages/QuoteDetail.tsx`

```tsx
// Afficher les cartons utilisés
{quote.lot?.cartonsUsed && (
  <div className="space-y-2">
    <h4 className="font-medium">📦 Cartons utilisés</h4>
    <ul className="list-disc list-inside text-sm text-muted-foreground">
      {quote.lot.cartonsUsed.map((cartonRef, index) => (
        <li key={index}>{cartonRef}</li>
      ))}
    </ul>
  </div>
)}
```

---

## ⚠️ Points d'Attention

### 1. Migration des Données Existantes

Si des devis existent déjà sans cartons configurés :
- Créer des cartons par défaut pour chaque compte SaaS
- Recalculer les devis existants (optionnel)

### 2. Performance

- Les cartons sont chargés une seule fois par calcul de devis
- Utiliser un cache si nécessaire pour les calculs fréquents
- Limiter le nombre de cartons par compte (recommandé : max 10)

### 3. Évolutions Futures

**Algorithme de bin packing** :
- Actuellement : 1 carton par item
- Futur : Optimisation multi-items dans un seul carton

**Cartons spécifiques par transporteur** :
- Actuellement : Catalogue unique
- Futur : Cartons différents selon le transporteur

**Calcul automatique des dimensions** :
- Actuellement : Dimensions estimées ou saisies manuellement
- Futur : Intégration avec API de mesure automatique

---

## 📊 Statistiques & Monitoring

### Métriques Recommandées

1. **Nombre de cartons par compte SaaS**
2. **Cartons les plus utilisés**
3. **Taux d'utilisation du carton par défaut**
4. **Warnings générés (items trop grands)**
5. **Coût moyen d'emballage par devis**

### Logs Backend

```
[Cartons] 📦 Récupération des cartons pour saasAccountId: xxx
[Cartons] ✅ 5 carton(s) récupéré(s)
[Cartons] ✅ Carton créé: yyy (CARTON-M)
[Cartons] ⭐ Ancien(s) carton(s) par défaut désactivé(s)
[Cartons] ⚠️  Carton désactivé (utilisé dans des devis): zzz
```

---

## 🧪 Tests

### Tests Unitaires (Recommandés)

**Fichier** : `front end/src/lib/cartons.test.ts`

```typescript
describe('optimizePackaging', () => {
  it('should select the smallest fitting carton', () => {
    const items = [{ length: 20, width: 15, height: 10 }];
    const cartons = [
      { carton_ref: 'S', inner_length: 30, inner_width: 20, inner_height: 15, packaging_price: 5, isDefault: false },
      { carton_ref: 'M', inner_length: 40, inner_width: 30, inner_height: 30, packaging_price: 6.5, isDefault: true },
    ];
    
    const result = optimizePackaging(items, cartons);
    
    expect(result.cartons[0].carton.carton_ref).toBe('S');
    expect(result.totalPackagingCost).toBe(5);
  });
  
  it('should use default carton if item is too large', () => {
    const items = [{ length: 80, width: 60, height: 50 }];
    const cartons = [
      { carton_ref: 'M', inner_length: 40, inner_width: 30, inner_height: 30, packaging_price: 6.5, isDefault: true },
    ];
    
    const result = optimizePackaging(items, cartons);
    
    expect(result.cartons[0].carton.carton_ref).toBe('M');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
```

### Tests d'Intégration

1. **Créer un compte SaaS**
2. **Ajouter 3 cartons (S, M, L)**
3. **Définir M comme carton par défaut**
4. **Créer un devis avec bordereau**
5. **Vérifier que le carton optimal est sélectionné**
6. **Vérifier que le coût d'emballage est correct**

---

## 📚 Documentation Associée

- `CONTEXTE_FINAL.md` : Contexte complet du projet
- `BORDEREAU_TYPEFORM_INTEGRATION.md` : Intégration bordereaux
- `DOCUMENTATION.md` : Documentation technique complète
- `CHANGELOG.md` : Historique des versions

---

## ✅ Checklist de Déploiement

- [ ] Déployer les règles Firestore (`firestore.rules`)
- [ ] Créer un index composite Firestore :
  ```
  Collection: cartons
  Champs:
    - saasAccountId (ASC)
    - isActive (ASC)
    - createdAt (DESC)
  ```
- [ ] Tester la création de cartons via l'UI
- [ ] Tester le calcul de devis avec cartons personnalisés
- [ ] Vérifier l'isolation entre comptes SaaS
- [ ] Documenter les cartons par défaut recommandés

---

**Version** : 1.6.0
**Date** : 19 janvier 2026
**Auteur** : Assistant AI + Clément
**Status** : ✅ Production Ready

