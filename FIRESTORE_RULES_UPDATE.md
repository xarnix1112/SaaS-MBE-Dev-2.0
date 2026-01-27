# ⚠️ MISE À JOUR CRITIQUE DES RÈGLES FIRESTORE

## Problème actuel

L'erreur `[code=permission-denied]: Missing or insufficient permissions` indique que les règles Firestore ne permettent pas aux utilisateurs de lire leur document `user` et leur `saasAccount`.

## Solution : Déployer les nouvelles règles

### Option 1 : Via Firebase Console (RAPIDE)

1. **Ouvrir Firebase Console** :
   - https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules

2. **Copier le contenu du fichier `firestore.rules`** (à la racine du projet)

3. **Coller dans l'éditeur de règles** et **Publier**

### Option 2 : Via Firebase CLI

```bash
firebase deploy --only firestore:rules
```

## Règles ajoutées

Les nouvelles règles permettent :

1. **Collection `users`** :
   - L'utilisateur peut lire/écrire son propre document (`uid` correspond à `request.auth.uid`)

2. **Collection `saasAccounts`** :
   - Le propriétaire peut lire/écrire son compte SaaS (`ownerUid` correspond à `request.auth.uid`)
   - Permet la création si l'utilisateur est le propriétaire

## Vérification

Après déploiement, vous devriez pouvoir :
- ✅ Vous connecter et être redirigé vers le dashboard
- ✅ Lire votre document `user` dans Firestore
- ✅ Lire votre document `saasAccount` dans Firestore

## Important

**Ces règles doivent être déployées AVANT de pouvoir utiliser l'authentification complète.**

