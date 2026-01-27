# 🔧 Correction Erreur 403: access_denied - Guide Rapide

## ❌ Problème

Vous voyez cette erreur :
```
Erreur 403: access_denied
Devis-MBE-SDV n'a pas terminé la procédure de validation de Google.
L'appli est en cours de test et seuls les testeurs approuvés par le développeur y ont accès.
```

## ✅ Solution : Ajouter votre email comme Test User

L'application OAuth est en mode "Test" et votre email n'est pas dans la liste des utilisateurs autorisés.

### Étapes pour corriger :

1. **Allez dans Google Cloud Console**
   - https://console.cloud.google.com/
   - Sélectionnez votre projet

2. **Ouvrez l'Écran de Consentement OAuth**
   - Menu ☰ → **"APIs & Services"** → **"OAuth consent screen"**

3. **Ajoutez votre email comme Test User**
   - Cliquez sur l'onglet **"Test users"** (ou "Utilisateurs de test")
   - Cliquez sur **"+ ADD USERS"** (ou "+ AJOUTER DES UTILISATEURS")
   - Entrez **votre adresse email Gmail** (ex: `votre-email@gmail.com`)
   - Cliquez sur **"ADD"** (ou "AJOUTER")
   - Cliquez sur **"SAVE"** (ou "ENREGISTRER")

4. **Vérifiez que votre email apparaît dans la liste**
   - Vous devriez voir votre email dans la liste des "Test users"

5. **Réessayez la connexion**
   - Retournez dans l'application
   - Allez dans "Paramètres" → "Comptes Email"
   - Cliquez sur "Connecter un compte Gmail"
   - Cette fois, vous devriez pouvoir vous connecter !

## 📝 Notes Importantes

- ⚠️ **Mode Test** : En mode test, seuls les emails ajoutés comme "Test users" peuvent se connecter
- 👥 **Plusieurs comptes** : Si vous voulez connecter plusieurs comptes Gmail, ajoutez tous les emails dans "Test users"
- 🔄 **Délai** : Les changements peuvent prendre quelques secondes à être pris en compte

## 🚀 Alternative : Publier l'Application (Production)

Si vous voulez que n'importe qui puisse se connecter (pas seulement les test users) :

1. Dans "OAuth consent screen", cliquez sur **"PUBLISH APP"** (ou "PUBLIER L'APP")
2. ⚠️ **Attention** : Cela nécessite une vérification Google si vous demandez des scopes sensibles
3. Pour le développement, il est recommandé de rester en mode "Test" avec des test users

## ✅ Vérification

Après avoir ajouté votre email comme test user :
- ✅ Vous pouvez vous connecter avec cet email
- ✅ Vous ne verrez plus l'erreur 403
- ✅ L'application pourra accéder à votre Gmail (en lecture seule)

