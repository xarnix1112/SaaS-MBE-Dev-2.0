# 🔧 Correction Urgente - Permissions Firestore

**Date :** 5 février 2026  
**Problème :** `Missing or insufficient permissions` pour l'utilisateur `zUWaigdSisakUVcmLp9BswbZgr22`

---

## ⚠️ Problème Identifié

L'utilisateur ne peut pas lire son document `users/zUWaigdSisakUVcmLp9BswbZgr22` dans Firestore, ce qui empêche :
- ✅ La connexion et redirection vers le dashboard
- ✅ Le chargement des données utilisateur
- ✅ L'accès aux fonctionnalités de l'application

**⚠️ IMPORTANT :** Si vous utilisez un projet Firebase de production (`sdv-automation-mbe-production`), vérifiez d'abord que votre application utilise le bon projet Firebase. Voir `CORRIGER_PROJET_FIRESTORE.md` pour plus de détails.

---

## 🔍 Diagnostic Rapide

### Étape 1 : Vérifier les Restrictions de la Clé API (2 minutes)

1. **Allez sur Google Cloud Console :**
   ```
   https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe
   ```

2. **Cliquez sur votre clé API** (celle qui commence par `AIzaSyDfIvWIWpWGVcPHIxVqUpoxQzrHHr6Yjv0`)

3. **Vérifiez "Restrictions d'API" :**
   - ✅ **Cloud Firestore API** doit être cochée
   - ✅ **Firebase Authentication API** doit être cochée  
   - ✅ **Firebase Installations API** doit être cochée

4. **Si Cloud Firestore API n'est PAS cochée :**
   - Cochez-la immédiatement
   - Cliquez sur "ENREGISTRER"
   - ⚠️ **C'est probablement la cause principale du problème !**

### Étape 2 : Vérifier les Règles Firestore Déployées (2 minutes)

1. **Allez sur Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
   ```

2. **Vérifiez que les règles contiennent :**
   ```javascript
   match /users/{uid} {
     allow read, write: if request.auth != null 
       && request.auth.uid == uid;
   }
   ```

3. **Si les règles sont différentes ou manquantes :**
   - Copiez le contenu du fichier `firestore.rules` (à la racine du projet)
   - Collez dans l'éditeur de règles
   - Cliquez sur "Publier"

---

## 🚀 Solution Rapide : Déployer les Règles Firestore

### Option A : Via Firebase Console (RECOMMANDÉ - 1 minute)

1. **Ouvrir Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
   ```

2. **Copier le contenu du fichier `firestore.rules`** :
   - Le fichier se trouve à la racine du projet : `c:\Dev\SaaS MBE SDV\firestore.rules`
   - Ouvrez-le avec un éditeur de texte
   - Sélectionnez tout (Ctrl+A) et copiez (Ctrl+C)

3. **Coller dans l'éditeur Firebase :**
   - Dans Firebase Console, sélectionnez tout le contenu existant
   - Collez le nouveau contenu (Ctrl+V)

4. **Publier :**
   - Cliquez sur le bouton bleu "Publier" en haut à droite
   - Attendez la confirmation "Rules published successfully"

5. **Vérifier :**
   - Rechargez la page pour voir les règles déployées
   - Testez votre application

### Option B : Via Firebase CLI (Si vous avez Firebase CLI installé)

```bash
# 1. Aller dans le répertoire du projet
cd "c:\Dev\SaaS MBE SDV"

# 2. Vérifier que Firebase CLI est installé
firebase --version

# 3. Se connecter (si pas déjà connecté)
firebase login

# 4. Sélectionner le projet
firebase use sdv-automation-mbe

# 5. Déployer les règles
firebase deploy --only firestore:rules

# 6. Vérifier que les règles sont déployées
firebase firestore:rules:get
```

---

## ✅ Vérifications Après Correction

### 1. Vérifier que le Document User Existe

1. **Ouvrir Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data
   ```

2. **Aller dans la collection `users`**

3. **Chercher le document avec l'UID :** `zUWaigdSisakUVcmLp9BswbZgr22`

4. **Vérifier que le document existe et contient :**
   - `uid`: `zUWaigdSisakUVcmLp9BswbZgr22`
   - `saasAccountId`: (un ID de compte SaaS)
   - `role`: `owner`
   - `createdAt`: (une date)

### 2. Tester la Connexion

1. **Rechargez votre application** dans le navigateur (F5)

2. **Connectez-vous** avec votre email/mot de passe

3. **Vérifiez la console du navigateur** (F12) :
   - Vous ne devriez plus voir l'erreur `Missing or insufficient permissions`
   - Vous devriez voir `[useAuth] Document user trouvé` ou similaire

4. **Vous devriez être redirigé vers `/dashboard`**

---

## 🆘 Si Ça Ne Fonctionne Toujours Pas

### Vérification 1 : Les Restrictions API

Assurez-vous que **Cloud Firestore API** est bien cochée dans les restrictions de la clé API.

### Vérification 2 : Le Domaine de Production

Assurez-vous que votre domaine de production (`mbe-sdv.fr` ou `www.mbe-sdv.fr`) est bien dans les "Domaines autorisés" de la clé API.

### Vérification 3 : Les Règles Firestore

Vérifiez que les règles déployées correspondent exactement au fichier `firestore.rules` local.

### Vérification 4 : Test avec Règles Temporaires

Si rien ne fonctionne, testez temporairement avec des règles permissives :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ IMPORTANT :** Remettez les vraies règles après le test !

---

## 📋 Checklist de Correction

- [ ] Cloud Firestore API est cochée dans les restrictions de la clé API
- [ ] Les règles Firestore sont déployées et correspondent à `firestore.rules`
- [ ] Le document `users/zUWaigdSisakUVcmLp9BswbZgr22` existe dans Firestore
- [ ] Le domaine de production est dans les domaines autorisés
- [ ] L'application a été rechargée après les modifications
- [ ] Les logs ne montrent plus d'erreur `permission-denied`

---

## 🔗 Liens Directs

- **Firebase Console - Rules :** https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
- **Firebase Console - Data :** https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data
- **Google Cloud Console - Credentials :** https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe

---

**Action Immédiate :** Vérifiez d'abord que **Cloud Firestore API** est cochée dans les restrictions de la clé API. C'est probablement la cause principale du problème.
