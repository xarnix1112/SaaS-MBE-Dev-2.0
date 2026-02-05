# 🔥 Déployer les Index Firestore - Solution au Problème "grid"

## 🎯 Problème

L'erreur suivante apparaît lors du clic sur "Initialiser la grille tarifaire" :

```
9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...
```

**Cause :** Les index Firestore nécessaires pour la grille tarifaire ne sont pas déployés sur le projet de production.

---

## ✅ Solution Rapide (2 méthodes)

### Méthode 1 : Via le Lien d'Erreur (LE PLUS RAPIDE) ⚡

1. **Ouvrir l'inspecteur web** (F12)
2. **Aller dans l'onglet Network**
3. **Cliquer sur la requête `/api/shipping/grid` qui a échoué**
4. **Ouvrir l'onglet "Preview" ou "Response"**
5. **Copier le lien** qui commence par `https://console.firebase.google.com/v1/r/project/...`
6. **Ouvrir ce lien dans un nouvel onglet**
7. **Cliquer sur "Create Index"** (ou "Créer l'index")
8. **Attendre 1-3 minutes** que l'index soit créé (statut passe de "Building..." à "Enabled" ✅)

**Répéter cette opération pour chaque index manquant** (il peut y en avoir plusieurs).

---

### Méthode 2 : Via Firebase CLI (RECOMMANDÉ) 🚀

Cette méthode déploie **tous les index** d'un coup.

#### Étape 1 : Vérifier que Firebase CLI est installé

```bash
firebase --version
```

Si ce n'est pas installé :
```bash
npm install -g firebase-tools
```

#### Étape 2 : Se connecter à Firebase

```bash
firebase login
```

#### Étape 3 : Sélectionner le projet de production

```bash
firebase use saas-mbe-sdv-production
```

#### Étape 4 : Déployer les index

```bash
firebase deploy --only firestore:indexes
```

**Résultat attendu :**
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/saas-mbe-sdv-production/overview
```

#### Étape 5 : Vérifier dans la Console Firebase

1. Aller sur https://console.firebase.google.com/project/saas-mbe-sdv-production/firestore/indexes
2. Vérifier que les 5 index suivants sont présents et **"Enabled"** (statut vert) :

   - ✅ `quotes` : `saasAccountId` (ASC), `createdAt` (DESC)
   - ✅ `shippingZones` : `saasAccountId` (ASC), `name` (ASC)
   - ✅ `shippingServices` : `saasAccountId` (ASC), `order` (ASC)
   - ✅ `weightBrackets` : `saasAccountId` (ASC), `order` (ASC) ⬅️ **CELUI-CI EST CRITIQUE**
   - ✅ `shippingRates` : `saasAccountId` (ASC), `zoneId` (ASC), `serviceId` (ASC), `weightBracketId` (ASC)

**⏱️ Temps d'attente :** 1-3 minutes par index (ils se créent en parallèle)

---

## 🧪 Tester après Déploiement

1. **Attendre que tous les index soient "Enabled"** (statut vert dans la console)
2. **Recharger la page** de l'application (F5)
3. **Cliquer sur "Initialiser la grille tarifaire"**
4. **Vérifier** :
   - ✅ Pas d'erreur dans la console
   - ✅ La grille tarifaire s'affiche correctement
   - ✅ Les zones, services et tranches de poids sont visibles

---

## 🐛 Dépannage

### L'index est "Building" depuis plus de 5 minutes

- Vérifier qu'il y a au moins quelques documents dans la collection `weightBrackets`
- Vérifier que les documents ont bien les champs `saasAccountId` et `order`
- Attendre encore quelques minutes (parfois ça prend jusqu'à 10 minutes)

### L'index est "Enabled" mais l'erreur persiste

1. **Vider le cache du navigateur** (Ctrl+Shift+Delete)
2. **Redémarrer le serveur backend** (si vous avez accès)
3. **Vérifier que vous êtes sur le bon projet Firebase** (`saas-mbe-sdv-production`)
4. **Vérifier les logs backend** pour voir s'il y a d'autres erreurs

### Erreur "Permission denied" lors du déploiement

- Vérifier que vous êtes connecté : `firebase login`
- Vérifier que vous avez les droits sur le projet Firebase
- Vérifier que vous utilisez le bon projet : `firebase use saas-mbe-sdv-production`

---

## 📋 Index Requis (Résumé)

Le fichier `firestore.indexes.json` à la racine contient maintenant **tous les index nécessaires** :

1. **quotes** - Pour lister les devis
2. **shippingZones** - Pour lister les zones d'expédition
3. **shippingServices** - Pour lister les services d'expédition
4. **weightBrackets** - Pour lister les tranches de poids ⬅️ **CRITIQUE pour votre problème**
5. **shippingRates** - Pour lister les tarifs d'expédition

---

## ✅ Checklist

- [ ] Firebase CLI installé (`firebase --version`)
- [ ] Connecté à Firebase (`firebase login`)
- [ ] Projet sélectionné (`firebase use saas-mbe-sdv-production`)
- [ ] Index déployés (`firebase deploy --only firestore:indexes`)
- [ ] Tous les index sont "Enabled" dans la console Firebase
- [ ] Test effectué : clic sur "Initialiser la grille tarifaire" fonctionne
- [ ] Pas d'erreur dans la console du navigateur

---

## 📞 Besoin d'Aide ?

Si le problème persiste après avoir suivi ces étapes :

1. Vérifier les **logs backend** (Railway ou votre hébergeur)
2. Vérifier la **console Firebase** → Firestore → Indexes
3. Vérifier que les **documents existent** dans Firestore (Data → Collections)

---

**Date de mise à jour :** 2 février 2026  
**Projet Firebase :** `saas-mbe-sdv-production`
