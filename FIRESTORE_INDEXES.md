# 🔥 Firestore - Gestion des Index Composites

## 📋 Vue d'ensemble

Firestore nécessite des **index composites** pour certaines requêtes complexes qui combinent filtres (`where`) et tris (`orderBy`).

---

## 🚨 Erreur commune

```
Error: 9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...
```

Cette erreur survient quand :
- Une requête filtre sur un champ **ET** trie sur un autre champ
- L'index composite n'existe pas encore dans Firestore

---

## 📊 Index requis pour QuoteFlow Pro

### 1. Collection `paiements`

**Requête :**
```javascript
firestore
  .collection('paiements')
  .where('devisId', '==', devisId)
  .orderBy('createdAt', 'desc')
```

**Index :**
- Collection : `paiements`
- Champs :
  - `devisId` (Ascending)
  - `createdAt` (Descending)

**Lien de création :**
```
https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=ClRwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3BhaWVtZW50cy9pbmRleGVzL18QARoLCgdkZXZpc0lkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg
```

---

### 2. Collection `notifications` ⭐ NOUVEAU

**Requête :**
```javascript
firestore
  .collection('notifications')
  .where('clientSaasId', '==', clientId)
  .orderBy('createdAt', 'desc')
  .limit(20)
```

**Index :**
- Collection : `notifications`
- Champs :
  - `clientSaasId` (Ascending)
  - `createdAt` (Descending)

**Lien de création :**
```
https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Clhwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL25vdGlmaWNhdGlvbnMvaW5kZXhlcy9fEAEaEAoMY2xpZW50U2Fhc0lkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg
```

---

### 3. Collection `emailMessages`

**Requête :**
```javascript
firestore
  .collection('emailMessages')
  .where('devisId', '==', devisId)
  .where('userId', '==', userId)
  .orderBy('createdAt', 'desc')
```

**Index :**
- Collection : `emailMessages`
- Champs :
  - `devisId` (Ascending)
  - `userId` (Ascending)
  - `createdAt` (Descending)

**Lien de création :**
```
https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Clhwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2VtYWlsTWVzc2FnZXMvaW5kZXhlcy9fEAEaCwoHZGV2aXNJZBABGgoKBnVzZXJJZBABGg0KCWNyZWF0ZWRBdBACGgwKCF9fbmFtZV9fEAI
```

---

## 🔧 Comment créer un index ?

### Méthode 1 : Via le lien d'erreur (Recommandée)

1. **Copier le lien** fourni dans l'erreur console/terminal
2. **Ouvrir le lien** dans un navigateur
3. **Se connecter** à la Firebase Console si nécessaire
4. **Vérifier** que les champs sont pré-remplis correctement
5. **Cliquer** sur "Créer l'index"
6. **Attendre** 2-5 minutes que l'index soit construit

### Méthode 2 : Via la Console Firebase

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner le projet `sdv-automation-mbe`
3. Aller dans **Firestore Database** → **Indexes**
4. Cliquer sur **Create Index**
5. Remplir :
   - **Collection ID** : nom de la collection
   - **Fields** : ajouter les champs avec leur ordre (Ascending/Descending)
6. **Sauvegarder**
7. **Attendre** la construction

---

## ⏱️ Temps de construction

- **Petites collections** (< 1000 documents) : 1-3 minutes
- **Moyennes collections** (1000-10000 documents) : 3-10 minutes
- **Grandes collections** (> 10000 documents) : 10-30 minutes

**Statut :**
- 🔨 **Building** : Index en cours de construction
- ✅ **Enabled** : Index actif et utilisable
- ❌ **Error** : Erreur lors de la construction

---

## 📝 Notes importantes

### Quand créer un index ?

Firestore te dira **automatiquement** quand un index est manquant via une erreur `FAILED_PRECONDITION` avec un lien direct.

### Coût des index

Les index consomment de l'espace de stockage :
- **~80 bytes** par document par index
- Pour 1000 notifications : ~80 KB supplémentaires

### Performance

Les index **améliorent drastiquement** les performances :
- Sans index : ❌ Impossible d'exécuter la requête
- Avec index : ✅ Requête quasi-instantanée même avec 10000+ documents

### Index automatiques

Firestore crée **automatiquement** des index pour :
- Requêtes simples avec un seul `where`
- Requêtes avec `orderBy` sans `where`

Firestore **NE crée PAS** automatiquement d'index pour :
- Requêtes avec `where` + `orderBy` sur des champs différents
- Requêtes avec plusieurs `where` + `orderBy`

---

## 🧪 Vérifier les index existants

### Via la Console Firebase

1. Firebase Console → Firestore Database → **Indexes**
2. Tu verras la liste de tous les index avec leur statut

### Via le code

```javascript
// Tester si une requête nécessite un index
try {
  const snapshot = await firestore
    .collection('notifications')
    .where('clientSaasId', '==', 'test')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  console.log('✅ Index existe');
} catch (error) {
  if (error.code === 9) {
    console.log('❌ Index manquant:', error.message);
  }
}
```

---

## 🔄 Mise à jour d'un index

Si tu dois modifier un index :
1. **Créer** le nouvel index (avec les nouveaux champs)
2. **Attendre** qu'il soit actif
3. **Supprimer** l'ancien index
4. **Déployer** le code qui utilise le nouvel index

⚠️ **Ne jamais supprimer un index avant que le nouveau soit actif !**

---

## 🚀 Checklist de déploiement

Avant de déployer une nouvelle fonctionnalité qui utilise Firestore :

- [ ] Tester en local (les erreurs d'index apparaîtront)
- [ ] Créer tous les index nécessaires via les liens d'erreur
- [ ] Attendre que tous les index soient "Enabled" (vert)
- [ ] Tester à nouveau pour confirmer que tout fonctionne
- [ ] Déployer le code en production

---

## 📚 Ressources

- [Documentation Firestore - Index](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Best practices pour les index](https://firebase.google.com/docs/firestore/query-data/index-overview)
- [Limites Firestore](https://firebase.google.com/docs/firestore/quotas)

---

**Date de création :** 13 janvier 2026  
**Version :** 1.4.0  
**Auteur :** Assistant IA + Clément  
**Statut :** ✅ Document de référence

