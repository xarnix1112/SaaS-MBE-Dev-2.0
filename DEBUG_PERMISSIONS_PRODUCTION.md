# 🔧 DEBUG - Résolution Erreur Permissions Production

**Date :** 7 février 2026  
**Erreur :** `Missing or insufficient permissions` pour le projet `saas-mbe-sdv-production`

---

## ✅ Ce qui fonctionne

- ✅ Projet Firebase correct : `saas-mbe-sdv-production`
- ✅ Authentification réussie : User ID `zUWaigdSisakUVcmLp9BswbZgr22`
- ✅ Règles Firestore déployées

## ❌ Ce qui ne fonctionne pas

- ❌ Lecture du document `users/zUWaigdSisakUVcmLp9BswbZgr22` → `permission-denied`

---

## 🔍 Diagnostic Étape par Étape

### ÉTAPE 1 : Vérifier que la clé API a été mise à jour dans Railway

**⚠️ CRITIQUE** : Railway n'a peut-être pas les nouvelles variables d'environnement.

#### Action :

1. **Allez sur Railway Dashboard** :
   ```
   https://railway.app/
   ```

2. **Ouvrez votre projet** → **Sélectionnez votre service (frontend)**

3. **Cliquez sur "Variables"**

4. **Vérifiez que `VITE_FIREBASE_API_KEY` correspond à la nouvelle clé API** :
   ```
   AIzaSyAQu-I-nSVEeAkb94KsMAg7bSqZMMWSpOs
   ```

5. **Si ce n'est PAS le cas** :
   - Cliquez sur "Edit" ou "Add Variable"
   - Mettez à jour `VITE_FIREBASE_API_KEY`
   - Railway redémarrera automatiquement

---

### ÉTAPE 2 : Vérifier que les APIs Firebase sont activées

#### Action :

1. **Allez sur Google Cloud Console** :
   ```
   https://console.cloud.google.com/apis/library?project=saas-mbe-sdv-production
   ```

2. **Recherchez et ACTIVEZ ces APIs une par une** :
   - `Cloud Firestore API`
   - `Identity Toolkit API`
   - `Firebase Installations API`
   - `Token Service API`

3. **Pour chaque API** :
   - Tapez le nom dans la barre de recherche
   - Cliquez sur l'API
   - Si "ACTIVER" est visible, cliquez dessus
   - Si "GÉRER" est visible, l'API est déjà activée

---

### ÉTAPE 3 : Vérifier les restrictions de la clé API

#### Action :

1. **Allez sur Google Cloud Console - Credentials** :
   ```
   https://console.cloud.google.com/apis/credentials?project=saas-mbe-sdv-production
   ```

2. **Cliquez sur la clé API** (`AIzaSyAQu-I-nSVEeAkb94KsMAg7bSqZMMWSpOs`)

3. **Vérifiez "Restrictions relatives aux applications"** :
   - ✅ **Référents HTTP (sites Web)** doit être sélectionné
   - ✅ Domaines autorisés :
     - `https://www.mbe-sdv.fr/*`
     - `https://mbe-sdv.fr/*`
     - `http://localhost:5174/*`

4. **Vérifiez "Restrictions relatives aux API"** :
   - ✅ **Restreindre la clé** doit être sélectionné
   - ✅ APIs cochées :
     - `Cloud Firestore API`
     - `Identity Toolkit API`
     - `Firebase Installations API`
     - `Token Service API`

5. **Si quelque chose manque** :
   - Ajoutez les domaines/APIs manquants
   - Cliquez sur "ENREGISTRER"
   - Attendez 5 minutes pour la propagation

---

### ÉTAPE 4 : Solution temporaire - Règles permissives (TEST UNIQUEMENT)

**⚠️ SEULEMENT POUR TESTER - À RETIRER APRÈS**

Cette solution permet de vérifier si le problème vient des règles Firestore ou de la clé API.

#### Action :

1. **Allez sur Firebase Console - Règles** :
   ```
   https://console.firebase.google.com/project/saas-mbe-sdv-production/firestore/rules
   ```

2. **Remplacez temporairement par ces règles** :
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

3. **Cliquez sur "Publier"**

4. **Attendez 1-2 minutes**

5. **Testez l'application** : `https://www.mbe-sdv.fr`

6. **Si ça fonctionne maintenant** :
   - ✅ Le problème venait des règles Firestore
   - Remettez les vraies règles après le test
   - Redéployez : `firebase deploy --only firestore:rules`

7. **Si ça ne fonctionne toujours PAS** :
   - ❌ Le problème vient de la clé API ou des APIs non activées
   - Revenez aux ÉTAPES 1-3

---

## 🆘 Checklist de Vérification Finale

- [ ] Railway a la bonne clé API dans les variables d'environnement
- [ ] Les APIs Firebase sont activées (Cloud Firestore API, Identity Toolkit API, etc.)
- [ ] La clé API a les bonnes restrictions (domaines + APIs)
- [ ] Le document `users/zUWaigdSisakUVcmLp9BswbZgr22` existe dans Firestore
- [ ] Les règles Firestore sont déployées
- [ ] Railway a redémarré après les modifications
- [ ] Le cache du navigateur est vidé

---

## 📞 Actions Immédiates

**COMMENCEZ PAR L'ÉTAPE 4** (règles permissives temporaires) pour isoler le problème.

**Cela nous dira** :
- Si c'est un problème de règles → Redéployer les règles correctement
- Si c'est un problème de clé API → Vérifier les restrictions et les APIs activées

Une fois le test fait, **dites-moi le résultat** et nous ajusterons la solution.
