# 📦 GRILLE TARIFAIRE D'EXPÉDITION - DOCUMENTATION COMPLÈTE

## 📋 Vue d'ensemble

Le système de grille tarifaire d'expédition permet à chaque client SaaS de **configurer ses propres tarifs d'expédition** en fonction de :
- **Zones géographiques** (pays de destination)
- **Services d'expédition** (STANDARD, EXPRESS, etc.)
- **Tranches de poids** (1kg, 2kg, 5kg, 10kg, etc.)

Cette grille remplace l'ancien système basé sur Google Sheets et offre une **interface type Excel** pour une gestion intuitive.

---

## 🏗️ Architecture

### Collections Firestore

```
shippingZones/          → Zones géographiques (Zone A, Zone B, etc.)
shippingServices/       → Services d'expédition (STANDARD, EXPRESS)
weightBrackets/         → Tranches de poids (1kg, 2kg, 5kg, etc.)
shippingRates/          → Tarifs (combinaison zone + service + tranche)
shippingSettings/       → Paramètres globaux (forfait hors gabarit)
```

### Isolation SaaS

**TOUTES les collections sont isolées par `saasAccountId`** :
- Chaque client SaaS a ses propres zones, services, tranches et tarifs
- Les règles Firestore garantissent l'isolation au niveau base de données
- Le backend vérifie systématiquement le `saasAccountId` via `requireAuth`

---

## 📊 Modèle de données

### ShippingZone (Zone d'expédition)

```typescript
{
  id: string;                    // ID Firestore
  saasAccountId: string;         // ID du compte SaaS (isolation)
  code: string;                  // Code court (A, B, C, etc.)
  name: string;                  // Nom affiché (Zone A - France)
  countries: string[];           // Codes pays ISO (FR, BE, DE, etc.)
  isActive: boolean;             // Actif ou désactivé (soft delete)
  order: number;                 // Ordre d'affichage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Exemple :**
```json
{
  "code": "A",
  "name": "Zone A - France",
  "countries": ["FR"],
  "isActive": true,
  "order": 1
}
```

### ShippingService (Service d'expédition)

```typescript
{
  id: string;
  saasAccountId: string;
  name: string;                  // STANDARD, EXPRESS, etc.
  description?: string;          // Description optionnelle
  isActive: boolean;             // Actif ou désactivé (soft delete)
  order: number;                 // Ordre d'affichage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Exemple :**
```json
{
  "name": "EXPRESS",
  "description": "Livraison express (2-3 jours)",
  "isActive": true,
  "order": 2
}
```

### WeightBracket (Tranche de poids)

```typescript
{
  id: string;
  saasAccountId: string;
  maxWeightKg: number;           // Poids max en kg (1, 2, 5, 10, etc.)
  order: number;                 // Ordre d'affichage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Exemple :**
```json
{
  "maxWeightKg": 5,
  "order": 3
}
```

### ShippingRate (Tarif)

```typescript
{
  id: string;
  saasAccountId: string;
  zoneId: string;                // ID de la zone
  serviceId: string;             // ID du service
  weightBracketId: string;       // ID de la tranche de poids
  price: number | null;          // Prix en € TTC (null = service non disponible)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Exemple :**
```json
{
  "zoneId": "zone_a_id",
  "serviceId": "express_id",
  "weightBracketId": "5kg_id",
  "price": 25.50
}
```

### ShippingSettings (Paramètres)

```typescript
{
  id: string;                    // = saasAccountId (1 seul document par compte)
  saasAccountId: string;
  overweightPolicy: 'FLAT_FEE' | 'CUSTOM';
  overweightFlatFee: number;     // Forfait hors gabarit (ex: 180€)
  overweightMessage?: string;    // Message personnalisé
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Exemple :**
```json
{
  "overweightPolicy": "FLAT_FEE",
  "overweightFlatFee": 180,
  "overweightMessage": "Poids supérieur aux tranches standards"
}
```

---

## 🔌 API Backend

### Routes disponibles

Toutes les routes sont protégées par `requireAuth` et isolées par `saasAccountId`.

#### Zones

```
GET    /api/shipping/zones              → Liste toutes les zones
POST   /api/shipping/zones              → Crée une zone
PUT    /api/shipping/zones/:id          → Met à jour une zone
DELETE /api/shipping/zones/:id          → Désactive une zone (soft delete)
```

#### Services

```
GET    /api/shipping/services           → Liste tous les services
POST   /api/shipping/services           → Crée un service
PUT    /api/shipping/services/:id       → Met à jour un service
DELETE /api/shipping/services/:id       → Désactive un service (soft delete)
```

#### Tranches de poids

```
GET    /api/shipping/weight-brackets    → Liste toutes les tranches
POST   /api/shipping/weight-brackets    → Crée une tranche
PUT    /api/shipping/weight-brackets/:id → Met à jour une tranche
DELETE /api/shipping/weight-brackets/:id → Supprime une tranche (hard delete)
```

#### Tarifs

```
GET    /api/shipping/rates              → Liste tous les tarifs
POST   /api/shipping/rates              → Crée ou met à jour un tarif (upsert)
```

**Note :** La route POST `/api/shipping/rates` fait un **upsert** :
- Si le tarif existe déjà (même zone + service + tranche), il est mis à jour
- Sinon, il est créé

#### Paramètres

```
GET    /api/shipping/settings           → Récupère les paramètres
PUT    /api/shipping/settings           → Met à jour les paramètres
```

#### Grille complète

```
GET    /api/shipping/grid               → Récupère toutes les données en 1 requête
```

**Réponse :**
```json
{
  "zones": [...],
  "services": [...],
  "weightBrackets": [...],
  "rates": [...],
  "settings": {...}
}
```

---

## 🎨 Interface utilisateur

### Onglet "Expédition" (Settings)

L'interface est organisée en **4 onglets** :

#### 1. 📊 Grille tarifaire

**Affichage type Excel :**
- **Sections** = Zones (Zone A, Zone B, etc.)
- **Lignes** = Services (STANDARD, EXPRESS)
- **Colonnes** = Tranches de poids (1kg, 2kg, 5kg, etc.)
- **Cellules** = Prix en € TTC

**Édition inline :**
1. Cliquer sur une cellule pour l'éditer
2. Saisir le prix (ou laisser vide pour "N/A")
3. Appuyer sur **Entrée** pour sauvegarder
4. Appuyer sur **Échap** pour annuler

**Légende :**
- `N/A` = Service non disponible pour cette combinaison
- Cellules cliquables pour modification

#### 2. 🌍 Zones

**Liste des zones :**
- Nom, code, nombre de pays
- Badge "Désactivée" pour les zones inactives
- Boutons "Éditer" et "Supprimer" (soft delete)

**Actions :**
- **Ajouter une zone** : Nom, code, liste de pays
- **Éditer une zone** : Modifier nom, code, pays
- **Désactiver une zone** : Soft delete (isActive = false)

#### 3. 🚚 Services

**Liste des services :**
- Nom, description
- Badge "Désactivé" pour les services inactifs

**Actions :**
- **Ajouter un service** : Nom, description
- **Éditer un service** : Modifier nom, description
- **Désactiver un service** : Soft delete (isActive = false)

#### 4. ⚙️ Paramètres

**Forfait hors gabarit :**
- Montant en € TTC appliqué quand le poids dépasse toutes les tranches
- Par défaut : **180 €**

---

## 🔒 Sécurité (Firestore Rules)

### Règles d'isolation

```javascript
// Fonction helper globale
function getUserSaasAccountId() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
}

// Exemple pour shippingZones
match /shippingZones/{zoneId} {
  allow read: if request.auth != null 
    && resource.data.saasAccountId == getUserSaasAccountId();
  
  allow create: if request.auth != null 
    && request.resource.data.saasAccountId == getUserSaasAccountId()
    && request.resource.data.name is string
    && request.resource.data.code is string
    && request.resource.data.countries is list;
  
  allow update: if request.auth != null 
    && resource.data.saasAccountId == getUserSaasAccountId()
    && request.resource.data.saasAccountId == getUserSaasAccountId();
  
  // Soft delete uniquement (via update isActive = false)
  allow delete: if false;
}
```

**Validations :**
- ✅ Lecture : Seulement les données du compte SaaS de l'utilisateur
- ✅ Création : Seulement pour son propre compte + validations de champs
- ✅ Mise à jour : Seulement ses propres données
- ✅ Suppression : Soft delete pour zones/services, hard delete pour tranches

---

## 🚀 Initialisation automatique

### Lors de la création d'un compte SaaS

Le script `init-shipping-data.js` est appelé automatiquement et crée :

**8 zones par défaut :**
- Zone A : France
- Zone B : Europe Proche (BE, LU, DE, NL, ES, IT)
- Zone C : Europe Étendue (PT, AT, DK, IE, SE, FI, PL, CZ, HU)
- Zone D : Europe Élargie (UK, CH, NO, GR, RO, BG, HR)
- Zone E : Amérique du Nord (CA, MX, US)
- Zone F : Asie Pacifique (CN, HK, JP, KR, SG, TW, TH, MY, AU, NZ)
- Zone G : Amérique du Sud (BR, AR, CL, CO, PE, VE)
- Zone H : Afrique & Moyen-Orient (MA, TN, DZ, SN, CI, AE, SA)

**2 services par défaut :**
- STANDARD : Livraison standard (5-7 jours)
- EXPRESS : Livraison express (2-3 jours)

**7 tranches de poids par défaut :**
- 1kg, 2kg, 5kg, 10kg, 20kg, 30kg, 40kg

**Paramètres par défaut :**
- Forfait hors gabarit : 180 €

**Aucun tarif créé par défaut** → L'utilisateur doit les remplir dans l'interface.

### Initialisation manuelle

```bash
cd "front end/server"
node init-shipping-data.js <saasAccountId>
```

---

## 🔧 Utilisation dans le code

### Hooks React Query

```typescript
import {
  useShippingGrid,
  useUpsertRate,
  useUpdateSettings,
} from '@/hooks/use-shipping-rates';

// Récupérer toutes les données
const { data: gridData, isLoading } = useShippingGrid();

// Mettre à jour un tarif
const upsertRate = useUpsertRate();
await upsertRate.mutateAsync({
  zoneId: 'zone_a_id',
  serviceId: 'express_id',
  weightBracketId: '5kg_id',
  price: 25.50,
});

// Mettre à jour les paramètres
const updateSettings = useUpdateSettings();
await updateSettings.mutateAsync({
  overweightFlatFee: 200,
});
```

### Helpers

```typescript
import { findRate, getRatePrice } from '@/hooks/use-shipping-rates';

// Trouver un tarif
const rate = findRate(rates, zoneId, serviceId, weightBracketId);

// Obtenir le prix d'un tarif
const price = getRatePrice(rates, zoneId, serviceId, weightBracketId);
// Retourne: number | null (null si non trouvé)
```

---

## 📈 Intégration dans calculateDevisFromOCR

### TODO (Partie 3 - Prochaine étape)

La logique de calcul des prix d'expédition dans `calculateDevisFromOCR` doit être adaptée pour :

1. **Récupérer les tarifs depuis Firestore** au lieu de Google Sheets
2. **Déterminer la zone** en fonction du pays de destination
3. **Sélectionner le service** (STANDARD par défaut, EXPRESS si demandé)
4. **Trouver la tranche de poids** correspondant au poids volumétrique
5. **Appliquer le tarif** ou le forfait hors gabarit si nécessaire

**Exemple de logique :**

```javascript
async function calculateShippingPrice(saasAccountId, destinationCountry, weightKg, serviceType = 'STANDARD') {
  // 1. Récupérer la grille complète
  const zones = await firestore.collection('shippingZones')
    .where('saasAccountId', '==', saasAccountId)
    .where('isActive', '==', true)
    .get();
  
  // 2. Trouver la zone du pays
  const zone = zones.docs.find(doc => 
    doc.data().countries.includes(destinationCountry)
  );
  
  if (!zone) {
    throw new Error(`Pays ${destinationCountry} non trouvé dans les zones`);
  }
  
  // 3. Récupérer le service
  const services = await firestore.collection('shippingServices')
    .where('saasAccountId', '==', saasAccountId)
    .where('name', '==', serviceType)
    .where('isActive', '==', true)
    .get();
  
  if (services.empty) {
    throw new Error(`Service ${serviceType} non trouvé`);
  }
  
  const service = services.docs[0];
  
  // 4. Trouver la tranche de poids
  const brackets = await firestore.collection('weightBrackets')
    .where('saasAccountId', '==', saasAccountId)
    .orderBy('order', 'asc')
    .get();
  
  const bracket = brackets.docs.find(doc => 
    doc.data().maxWeightKg >= weightKg
  );
  
  if (!bracket) {
    // Poids hors gabarit → forfait
    const settings = await firestore.collection('shippingSettings')
      .doc(saasAccountId)
      .get();
    
    return settings.data()?.overweightFlatFee || 180;
  }
  
  // 5. Récupérer le tarif
  const rates = await firestore.collection('shippingRates')
    .where('saasAccountId', '==', saasAccountId)
    .where('zoneId', '==', zone.id)
    .where('serviceId', '==', service.id)
    .where('weightBracketId', '==', bracket.id)
    .get();
  
  if (rates.empty || rates.docs[0].data().price === null) {
    throw new Error('Tarif non configuré pour cette combinaison');
  }
  
  return rates.docs[0].data().price;
}
```

---

## 🧪 Tests

### Test manuel

1. **Créer un compte SaaS** → Vérifier que les zones/services/tranches sont créés
2. **Aller dans Settings → Expédition** → Vérifier l'affichage de la grille
3. **Cliquer sur une cellule** → Saisir un prix → Sauvegarder
4. **Vérifier dans Firestore** → Collection `shippingRates` → Nouveau document créé
5. **Modifier le forfait hors gabarit** → Sauvegarder → Vérifier dans `shippingSettings`

### Test API (Postman / curl)

```bash
# Récupérer la grille complète
curl -X GET http://localhost:5174/api/shipping/grid \
  -H "Authorization: Bearer <firebase_token>"

# Créer/mettre à jour un tarif
curl -X POST http://localhost:5174/api/shipping/rates \
  -H "Authorization: Bearer <firebase_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "zoneId": "zone_a_id",
    "serviceId": "express_id",
    "weightBracketId": "5kg_id",
    "price": 25.50
  }'
```

---

## 📝 Checklist d'implémentation

- [x] Créer les collections Firestore
- [x] Créer les routes API backend (CRUD)
- [x] Créer les types TypeScript
- [x] Créer les hooks React Query
- [x] Créer le composant ShippingRatesSettings
- [x] Intégrer dans la page Settings
- [ ] Adapter la logique de calcul dans calculateDevisFromOCR
- [x] Créer les règles Firestore
- [x] Créer le script d'initialisation
- [x] Documentation complète

---

## 🎯 Avantages vs Google Sheets

| Critère | Google Sheets | Grille Firestore |
|---------|--------------|------------------|
| **Performance** | ❌ Requête HTTP externe | ✅ Firestore natif |
| **Isolation SaaS** | ❌ 1 sheet partagé | ✅ Données isolées par compte |
| **Interface** | ❌ Édition externe | ✅ Interface intégrée |
| **Validation** | ❌ Aucune | ✅ Règles Firestore |
| **Historique** | ❌ Non | ✅ Timestamps |
| **Sécurité** | ❌ Dépend de Google | ✅ Règles Firestore strictes |
| **Flexibilité** | ❌ Format CSV rigide | ✅ Ajout/suppression dynamique |

---

## 🚀 Prochaines étapes

1. **Adapter calculateDevisFromOCR** pour utiliser la grille Firestore
2. **Créer un outil de migration** pour importer les tarifs depuis Google Sheets
3. **Ajouter des statistiques** (tarifs les plus utilisés, zones les plus fréquentes)
4. **Permettre l'export** de la grille en CSV/Excel
5. **Ajouter des templates** de tarifs pré-configurés (par pays, par secteur)

---

## 📞 Support

Pour toute question ou problème :
- Consulter cette documentation
- Vérifier les logs backend : `[shipping-rates]`
- Vérifier les règles Firestore
- Tester avec le script d'initialisation manuel

---

**Version :** 2.0.0  
**Date :** Janvier 2026  
**Auteur :** QuoteFlow Pro Team

