# 🔥 CRÉER LES INDEX FIRESTORE - GRILLE TARIFAIRE

## ❌ Problème

L'onglet "Expédition" ne charge pas et affiche "Erreur de chargement" car **Firestore nécessite des index composites** pour les requêtes.

**Erreur dans le terminal :**
```
[ShippingRates] Erreur GET grid: Error: 9 FAILED_PRECONDITION: The query requires an index.
```

---

## ✅ Solution : Créer les index manuellement

### Méthode 1 : Via les liens directs (RAPIDE)

Cliquez sur ces liens pour créer automatiquement les index :

1. **Index pour shippingZones** :
   https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Clhwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3NoaXBwaW5nWm9uZXMvaW5kZXhlcy9fEAEaEQoNc2Fhc0FjY291bnRJZBABGggKBG5hbWUQARoMCghfX25hbWVfXxAB

2. **Index pour shippingServices** :
   https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Cltwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3NoaXBwaW5nU2VydmljZXMvaW5kZXhlcy9fEAEaEQoNc2Fhc0FjY291bnRJZBABGgkKBW9yZGVyEAEaDAoIX19uYW1lX18QAQ

3. **Index pour weightBrackets** :
   https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Cllwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3dlaWdodEJyYWNrZXRzL2luZGV4ZXMvXxABGhEKDXNhYXNBY2NvdW50SWQQARoJCgVvcmRlchABGgwKCF9fbmFtZV9fEAE

**Instructions :**
1. Cliquez sur chaque lien
2. Cliquez sur "Créer l'index" (bouton bleu)
3. Attendez quelques secondes (statut "Building...")
4. Une fois les 3 index créés (statut "Enabled"), rechargez la page

---

### Méthode 2 : Via la console Firebase (MANUEL)

Si les liens ne fonctionnent pas, créez les index manuellement :

1. **Aller dans la console Firebase** :
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes

2. **Cliquer sur "Créer un index"**

3. **Créer les 3 index suivants** :

#### Index 1 : shippingZones
- **Collection** : `shippingZones`
- **Champs** :
  - `saasAccountId` : Ascending
  - `name` : Ascending
- **Scope de requête** : Collection
- Cliquer sur "Créer"

#### Index 2 : shippingServices
- **Collection** : `shippingServices`
- **Champs** :
  - `saasAccountId` : Ascending
  - `order` : Ascending
- **Scope de requête** : Collection
- Cliquer sur "Créer"

#### Index 3 : weightBrackets
- **Collection** : `weightBrackets`
- **Champs** :
  - `saasAccountId` : Ascending
  - `order` : Ascending
- **Scope de requête** : Collection
- Cliquer sur "Créer"

---

## ⏱️ Temps de création

- **Index simples** : ~30 secondes
- **Index complexes** : 1-2 minutes

Vous verrez le statut passer de "Building..." à "Enabled" ✅

---

## 🧪 Tester après création

1. **Attendre que les 3 index soient "Enabled"**
2. **Recharger la page** (Settings → Expédition)
3. **Vérifier** : La grille tarifaire devrait s'afficher correctement

---

## 📝 Pourquoi ces index sont nécessaires ?

Firestore nécessite des **index composites** pour les requêtes qui :
- Filtrent sur plusieurs champs (`where`)
- Trient sur plusieurs champs (`orderBy`)

Dans notre cas, la route `/api/shipping/grid` fait des requêtes comme :
```javascript
firestore.collection('shippingZones')
  .where('saasAccountId', '==', saasAccountId)
  .orderBy('name', 'asc')
  .get()
```

Cette requête nécessite un index composite sur `(saasAccountId, name)`.

---

## 🔄 Alternative : Déployer via Firebase CLI

Si vous avez Firebase CLI installé :

```bash
cd "front end"
firebase deploy --only firestore:indexes
```

Le fichier `firestore.indexes.json` contient déjà la configuration des index.

---

## ✅ Résultat attendu

Une fois les index créés, l'onglet "Expédition" devrait afficher :
- ✅ La grille tarifaire (8 zones)
- ✅ Les onglets (Grille tarifaire, Zones, Services, Paramètres)
- ✅ Aucune erreur dans la console

---

**Temps estimé :** 2-3 minutes (création des index + rechargement)

