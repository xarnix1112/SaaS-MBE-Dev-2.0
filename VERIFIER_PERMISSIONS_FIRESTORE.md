# 🔍 Vérification des Permissions Firestore

**Date :** 5 février 2026  
**Problème :** `Missing or insufficient permissions` lors de la lecture du document `users/{uid}`

---

## ⚠️ Problème Identifié

L'erreur `Missing or insufficient permissions` indique que l'utilisateur ne peut pas lire son document `users/{uid}` dans Firestore, même si :
- ✅ Le compte Firebase Auth existe
- ✅ Le document `users/{uid}` existe dans Firestore
- ✅ Le compte est déjà finalisé

---

## 🔍 Causes Possibles

### Cause 1 : Restrictions de la Clé API Firebase

Les restrictions de la clé API Firebase peuvent bloquer l'accès à Cloud Firestore API.

**Vérification :**

1. **Allez sur Google Cloud Console :**
   ```
   https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe
   ```

2. **Cliquez sur votre clé API** (celle qui commence par `AIzaSyDfIvWIWpWGVcPHIxVqUpoxQzrHHr6Yjv0`)

3. **Vérifiez dans "Restrictions d'API" :**
   - ✅ **Cloud Firestore API** doit être cochée
   - ✅ **Firebase Authentication API** doit être cochée
   - ✅ **Firebase Installations API** doit être cochée

4. **Si Cloud Firestore API n'est pas cochée :**
   - Cochez-la
   - Cliquez sur "ENREGISTRER"
   - Attendez quelques secondes pour que les changements soient appliqués

### Cause 2 : Règles Firestore Non Déployées

Les règles Firestore peuvent ne pas être déployées correctement.

**Vérification et Déploiement :**

#### Option A : Via Firebase Console (RAPIDE)

1. **Ouvrir Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
   ```

2. **Vérifier les règles actuelles :**
   - Les règles doivent contenir :
   ```javascript
   match /users/{uid} {
     allow read, write: if request.auth != null 
       && request.auth.uid == uid;
   }
   ```

3. **Si les règles ne sont pas correctes :**
   - Copiez le contenu du fichier `firestore.rules` (à la racine du projet)
   - Collez dans l'éditeur de règles
   - Cliquez sur "Publier"

#### Option B : Via Firebase CLI

1. **Installer Firebase CLI** (si pas déjà installé) :
   ```bash
   npm install -g firebase-tools
   ```

2. **Se connecter à Firebase :**
   ```bash
   firebase login
   ```

3. **Aller dans le répertoire du projet :**
   ```bash
   cd "c:\Dev\SaaS MBE SDV"
   ```

4. **Vérifier le projet Firebase :**
   ```bash
   firebase use sdv-automation-mbe
   ```

5. **Déployer les règles :**
   ```bash
   firebase deploy --only firestore:rules
   ```

6. **Vérifier que les règles sont déployées :**
   ```bash
   firebase firestore:rules:get
   ```

---

## ✅ Vérifications à Faire

### 1. Vérifier que le Document User Existe

1. **Ouvrir Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data
   ```

2. **Aller dans la collection `users`**

3. **Chercher le document avec l'UID :** `m4aSMMlgHmGryqxPvTd0`

4. **Vérifier que le document existe et contient :**
   - `uid`: `m4aSMMlgHmGryqxPvTd0`
   - `saasAccountId`: (un ID de compte SaaS)
   - `role`: `owner`
   - `createdAt`: (une date)

### 2. Vérifier les Règles Firestore Déployées

1. **Ouvrir Firebase Console :**
   ```
   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
   ```

2. **Vérifier que les règles contiennent :**
   ```javascript
   match /users/{uid} {
     allow read, write: if request.auth != null 
       && request.auth.uid == uid;
   }
   ```

3. **Si les règles sont différentes ou manquantes :**
   - Déployez les règles (voir Option A ou B ci-dessus)

### 3. Vérifier les Restrictions de la Clé API

1. **Ouvrir Google Cloud Console :**
   ```
   https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe
   ```

2. **Cliquer sur votre clé API**

3. **Vérifier "Restrictions d'API" :**
   - ✅ Cloud Firestore API doit être cochée
   - ✅ Firebase Authentication API doit être cochée
   - ✅ Firebase Installations API doit être cochée

---

## 🔧 Solution Rapide

Si vous voulez tester rapidement si c'est un problème de règles :

1. **Temporairement, déployez des règles permissives** (SEULEMENT POUR TEST) :
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

2. **Déployez ces règles :**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Testez la connexion**

4. **Si ça fonctionne :** Le problème vient des règles Firestore
5. **Si ça ne fonctionne toujours pas :** Le problème vient des restrictions de la clé API

6. **IMPORTANT :** Remettez les vraies règles après le test !

---

## 📝 Checklist de Diagnostic

- [ ] Le document `users/m4aSMMlgHmGryqxPvTd0` existe dans Firestore
- [ ] Les règles Firestore sont déployées et contiennent la règle pour `users/{uid}`
- [ ] Les restrictions API incluent "Cloud Firestore API"
- [ ] L'utilisateur est bien authentifié (Firebase Auth fonctionne)
- [ ] Les règles Firestore permettent la lecture si `request.auth.uid == uid`

---

## 🔗 Liens Utiles

- **Firebase Console - Rules :** https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
- **Firebase Console - Data :** https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data
- **Google Cloud Console - Credentials :** https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe
- **Guide Firebase CLI :** `GUIDE_FIREBASE_CLI.md`

---

## 🆘 Si Rien Ne Fonctionne

1. **Vérifiez les logs détaillés** dans la console du navigateur
2. **Vérifiez que l'UID dans les logs correspond** à l'UID du document dans Firestore
3. **Testez avec des règles temporaires permissives** pour isoler le problème
4. **Vérifiez que les restrictions de domaine incluent bien votre domaine de production**

---

**Note :** Les améliorations de logs dans `useAuth.ts` vous donneront plus d'informations sur l'erreur exacte.
