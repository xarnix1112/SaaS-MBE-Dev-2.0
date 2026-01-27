# Guide de configuration de l'authentification

Ce guide explique comment activer et configurer le système d'authentification email/password pour QuoteFlow Pro.

## 📋 Prérequis

1. Firebase Console : https://console.firebase.google.com/project/sdv-automation-mbe
2. Accès administrateur au projet Firebase

## 🔐 Étape 1 : Activer l'authentification Email/Password ⚠️ OBLIGATOIRE

**Cette étape est CRITIQUE. Sans elle, vous obtiendrez l'erreur `auth/operation-not-allowed` lors de la création de compte.**

1. Ouvrir Firebase Console : https://console.firebase.google.com/project/sdv-automation-mbe/authentication/providers
2. Cliquer sur "Get started" si c'est la première fois
3. Aller dans l'onglet "Sign-in method"
4. Cliquer sur "Email/Password"
5. **Activer "Email/Password"** (toggle ON) - C'EST ICI QUE ÇA BLOQUE SI NON FAIT
6. Optionnel : Activer "Email link (passwordless sign-in)" si souhaité
7. Cliquer sur "Save"

**⚠️ Si vous voyez l'erreur `auth/operation-not-allowed`, c'est que cette étape n'a pas été effectuée.**

## 🏗️ Étape 2 : Structure des collections Firestore

Le système crée automatiquement deux collections :

### Collection `saasAccounts`
```javascript
{
  id: "auto-généré",
  ownerUid: "firebaseUserId",
  commercialName: "MBE Nice Centre",
  mbeNumber: "12345",
  mbeCity: "Nice",
  mbeCityCustom: null,
  address: {
    street: "123 Rue de la République",
    city: "Nice",
    zip: "06000",
    country: "France"
  },
  phone: "+334 12 34 56 78",
  email: "contact@mbe-nice.fr",
  createdAt: Timestamp,
  isActive: true,
  plan: "free"
}
```

### Collection `users`
```javascript
{
  uid: "firebaseUserId",
  saasAccountId: "saasAccountId",
  role: "owner",
  createdAt: Timestamp
}
```

## 🔒 Étape 3 : Règles Firestore (Sécurité)

Ajouter ces règles dans Firebase Console → Firestore → Rules :

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserSaasAccountId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
    }

    // SaasAccounts : seul le propriétaire peut lire/écrire
    match /saasAccounts/{id} {
      allow read, write: if isAuthenticated()
        && resource.data.ownerUid == request.auth.uid;
    }

    // Users : l'utilisateur peut lire/écrire son propre document
    match /users/{uid} {
      allow read, write: if isAuthenticated()
        && request.auth.uid == uid;
    }

    // Devis : isolation par saasAccountId
    match /quotes/{id} {
      allow read, write: if isAuthenticated()
        && resource.data.saasAccountId == getUserSaasAccountId();
    }

    // Groupements d'expédition : isolation par saasAccountId
    match /shipmentGroups/{id} {
      allow read, write: if isAuthenticated()
        && resource.data.saasAccountId == getUserSaasAccountId();
    }

    // Paiements : isolation par saasAccountId
    match /paiements/{id} {
      allow read, write: if isAuthenticated()
        && resource.data.saasAccountId == getUserSaasAccountId();
    }
  }
}
```

## 🚀 Étape 4 : Tester le système

1. Démarrer le serveur :
   ```bash
   cd "front end"
   npm run dev:all
   ```

2. Ouvrir http://localhost:8080/register

3. Créer un compte avec email/password

4. Compléter la configuration MBE

5. Vérifier dans Firebase Console que :
   - Un utilisateur apparaît dans Authentication
   - Un document `saasAccount` est créé dans Firestore
   - Un document `user` est créé dans Firestore

## 🔄 Flux utilisateur

1. **Inscription** (`/register`)
   - Création du compte Firebase Auth
   - Redirection vers `/setup-mbe`

2. **Configuration MBE** (`/setup-mbe`)
   - Renseigner les informations MBE
   - Création du `saasAccount` et du `user`
   - Redirection vers `/onboarding/success`

3. **Page de succès** (`/onboarding/success`)
   - Message de bienvenue personnalisé
   - Redirection vers le dashboard

4. **Connexion** (`/login`)
   - Connexion avec email/password
   - Redirection vers le dashboard si setup complet
   - Redirection vers `/setup-mbe` si setup non terminé

## 🛡️ Protection des routes

Toutes les routes (sauf `/login`, `/register`, `/setup-mbe`, `/onboarding/success`) sont protégées par `ProtectedRoute` :

- **Non authentifié** → Redirection vers `/login`
- **Authentifié mais setup non terminé** → Redirection vers `/setup-mbe`
- **Authentifié et setup terminé** → Accès autorisé

## 📝 Notes importantes

1. **Isolation des données** : Tous les devis, paiements, groupes sont isolés par `saasAccountId`
2. **Unicité du numéro MBE** : Le backend vérifie que le numéro MBE est unique
3. **Token d'authentification** : Le frontend envoie le token Firebase dans le header `Authorization: Bearer <token>`
4. **Backend middleware** : Le middleware `requireAuth` vérifie le token avant chaque requête protégée

## 🐛 Dépannage

### Erreur "Token invalide"
- Vérifier que l'authentification email/password est activée dans Firebase Console
- Vérifier que le token est bien envoyé dans les headers

### Erreur "Firestore non initialisé"
- Vérifier que `firebase-credentials.json` existe dans `front end/`
- Vérifier que Firebase Admin SDK est correctement initialisé

### Erreur "Numéro MBE déjà utilisé"
- Le numéro MBE doit être unique dans toute l'application
- Vérifier dans Firestore si un autre `saasAccount` utilise ce numéro

## 🔮 Évolutions futures

Le système est conçu pour supporter facilement :
- Multi-utilisateurs (ajouter des documents `users` avec le même `saasAccountId`)
- Rôles (admin, operator, viewer)
- SSO (Google, Microsoft, etc.)

