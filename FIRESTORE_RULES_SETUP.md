# Configuration des règles Firestore

## Problème
L'erreur `FirebaseError: [code=permission-denied]: Missing or insufficient permissions` indique que les règles Firestore ne permettent pas d'écrire dans la collection `auctionHouses`.

## Solution

### Option 1 : Déployer via Firebase CLI (Recommandée)

1. **Installer Firebase CLI** (si pas déjà installé) :
   ```bash
   npm install -g firebase-tools
   ```

2. **Se connecter à Firebase** :
   ```bash
   firebase login
   ```

3. **Déployer les règles** :
   ```bash
   firebase deploy --only firestore:rules
   ```

### Option 2 : Configurer manuellement dans la console Firebase

1. **Aller sur la console Firebase** :
   - Ouvrir : https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules

2. **Copier le contenu du fichier `firestore.rules`** :
   - Le fichier se trouve à la racine du projet

3. **Coller dans l'éditeur de règles** :
   - Remplacer le contenu existant par celui du fichier `firestore.rules`

4. **Publier les règles** :
   - Cliquer sur le bouton "Publier"

## Vérification

Après avoir déployé les règles, vous devriez pouvoir :
- ✅ Ajouter une salle de ventes dans l'onglet "Salles des ventes"
- ✅ Voir les salles de ventes sauvegardées après redémarrage
- ✅ Supprimer une salle de ventes

## Authentification anonyme

Assurez-vous que l'authentification anonyme est activée :
1. Aller sur : https://console.firebase.google.com/project/sdv-automation-mbe/authentication/providers
2. Activer "Anonymous" dans la liste des providers
3. Sauvegarder

## Contenu des règles

Les règles dans `firestore.rules` permettent :
- **Lecture et écriture** pour toutes les collections (`auctionHouses`, `quotes`, `shipments`, etc.)
- **Uniquement pour les utilisateurs authentifiés** (y compris les utilisateurs anonymes)
- **Sécurité** : Les utilisateurs non authentifiés ne peuvent pas accéder aux données

