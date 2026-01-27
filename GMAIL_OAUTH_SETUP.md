# 📧 Configuration Gmail OAuth - Guide Complet

Ce guide vous explique comment configurer Gmail OAuth pour connecter des comptes Gmail à l'application.

## 📋 Prérequis

- Un compte Google (Gmail)
- Accès à [Google Cloud Console](https://console.cloud.google.com/)

## 🚀 Étapes de Configuration

### Étape 1 : Créer un Projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Cliquez sur le sélecteur de projet en haut à gauche (à côté de "Google Cloud")
3. Cliquez sur **"Nouveau projet"** (ou "New Project")
4. Donnez un nom à votre projet (ex: "MBE-SDV Gmail Integration")
5. Cliquez sur **"Créer"** (ou "Create")
6. Attendez que le projet soit créé (quelques secondes)

### Étape 2 : Activer Gmail API

1. Dans votre projet, allez dans le menu latéral (☰) → **"APIs & Services"** → **"Library"** (ou "Bibliothèque")
2. Dans la barre de recherche, tapez **"Gmail API"**
3. Cliquez sur **"Gmail API"** dans les résultats
4. Cliquez sur le bouton **"Enable"** (ou "Activer")
5. Attendez quelques secondes que l'API soit activée

### Étape 3 : Créer les Identifiants OAuth 2.0

1. Dans le menu latéral, allez dans **"APIs & Services"** → **"Credentials"** (ou "Identifiants")
2. Cliquez sur **"+ CREATE CREDENTIALS"** (ou "+ CRÉER DES IDENTIFIANTS") en haut
3. Sélectionnez **"OAuth client ID"** (ou "ID client OAuth")

#### 3.1 : Configurer l'Écran de Consentement OAuth (si demandé)

Si c'est la première fois que vous créez des identifiants OAuth :
1. Vous serez redirigé vers **"OAuth consent screen"** (Écran de consentement OAuth)
2. Sélectionnez **"External"** (ou "Externe") puis cliquez sur **"CREATE"**
3. Remplissez le formulaire :
   - **App name** (Nom de l'application) : `MBE-SDV`
   - **User support email** (Email de support) : Votre email
   - **Developer contact information** (Contact développeur) : Votre email
4. Cliquez sur **"SAVE AND CONTINUE"** (ou "ENREGISTRER ET CONTINUER")
5. Sur la page **"Scopes"** (Portées), cliquez sur **"SAVE AND CONTINUE"** sans rien modifier
6. Sur la page **"Test users"** (Utilisateurs de test), cliquez sur **"SAVE AND CONTINUE"**
7. Sur la page **"Summary"** (Résumé), cliquez sur **"BACK TO DASHBOARD"**

#### 3.2 : Créer l'ID Client OAuth

1. Retournez dans **"APIs & Services"** → **"Credentials"**
2. Cliquez sur **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Sélectionnez **"Web application"** (Application Web) comme type
4. Donnez un nom à votre client (ex: "MBE-SDV Gmail OAuth")
5. Dans **"Authorized redirect URIs"** (URI de redirection autorisés), ajoutez :
   ```
   http://localhost:5174/auth/gmail/callback
   ```
6. Cliquez sur **"CREATE"** (ou "CRÉER")

### Étape 4 : Récupérer les Clés

1. Une fenêtre popup s'affichera avec vos identifiants :
   - **Your Client ID** (Votre ID client)
   - **Your Client Secret** (Votre secret client)
2. **⚠️ IMPORTANT :** Copiez ces deux valeurs immédiatement, elles ne seront plus affichées après fermeture de la fenêtre !
3. Si vous avez fermé la fenêtre, vous pouvez retrouver ces valeurs dans :
   - **"APIs & Services"** → **"Credentials"**
   - Cliquez sur le nom de votre client OAuth
   - Les valeurs seront affichées (le secret peut être masqué, cliquez sur l'icône œil pour le révéler)

### Étape 5 : Ajouter les Clés dans le Projet

1. Ouvrez le fichier `front end/.env.local` dans votre éditeur
2. Ajoutez les trois lignes suivantes (remplacez les valeurs par celles que vous avez copiées) :

```env
GMAIL_CLIENT_ID=votre_client_id_ici
GMAIL_CLIENT_SECRET=votre_client_secret_ici
GMAIL_REDIRECT_URI=http://localhost:5174/auth/gmail/callback
```

**Exemple :**
```env
GMAIL_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
GMAIL_REDIRECT_URI=http://localhost:5174/auth/gmail/callback
```

3. Sauvegardez le fichier

### Étape 6 : Redémarrer l'Application

1. Arrêtez l'application si elle est en cours d'exécution (Ctrl+C dans le terminal)
2. Relancez avec `start-dev.command`
3. Vérifiez dans le terminal qu'il n'y a plus le message :
   ```
   [Gmail OAuth] ⚠️  GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET manquant
   ```
   Vous devriez voir un message de succès à la place.

### Étape 7 : Tester la Connexion

1. Allez dans l'application → **"Paramètres"** → **"Comptes Email"**
2. Cliquez sur **"Connecter un compte Gmail"**
3. Vous devriez être redirigé vers Google pour autoriser l'application
4. Connectez-vous avec votre compte Gmail
5. Autorisez l'application à accéder à votre Gmail
6. Vous serez redirigé vers l'application avec un message de succès

## ✅ Vérification

Pour vérifier que tout fonctionne :

1. **Dans le terminal**, vous devriez voir :
   ```
   [Gmail OAuth] Redirection vers Google OAuth: https://accounts.google.com/...
   [Gmail OAuth] ✅ Nouveau compte Gmail créé: votre-email@gmail.com
   ```

2. **Dans l'application**, dans la page "Paramètres" → "Comptes Email", vous devriez voir votre compte Gmail listé avec le statut "Actif".

## 🔧 Dépannage

### Problème : "GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET manquant"

**Solution :**
- Vérifiez que les variables sont bien dans `front end/.env.local` (pas dans `.env`)
- Vérifiez qu'il n'y a pas d'espaces autour du `=`
- Vérifiez que les valeurs sont entre guillemets si elles contiennent des caractères spéciaux
- Redémarrez l'application après avoir modifié `.env.local`

### Problème : "redirect_uri_mismatch"

**Solution :**
- Vérifiez que l'URI de redirection dans Google Cloud Console est exactement :
  ```
  http://localhost:5174/auth/gmail/callback
  ```
- Vérifiez que `GMAIL_REDIRECT_URI` dans `.env.local` correspond exactement

### Problème : "access_denied"

**Solution :**
- Vérifiez que vous avez bien autorisé l'application dans Google
- Si vous êtes en mode "Test", ajoutez votre email dans "Test users" dans Google Cloud Console

### Problème : Page 404 lors du clic sur "Connecter un compte Gmail"

**Solution :**
- Vérifiez que le proxy `/auth` est bien configuré dans `vite.config.ts`
- Redémarrez l'application après modification de `vite.config.ts`

## 📝 Notes Importantes

- ⚠️ **Ne partagez jamais** vos `CLIENT_ID` et `CLIENT_SECRET` publiquement
- ⚠️ Le fichier `.env.local` est dans `.gitignore` et ne sera pas commité sur GitHub
- 🔒 En production, vous devrez créer de nouveaux identifiants OAuth avec des URI de redirection de production
- 📧 L'application ne peut accéder qu'aux emails que vous autorisez explicitement

## 🎯 Prochaines Étapes

Une fois la connexion Gmail configurée :
1. Les emails entrants seront automatiquement synchronisés toutes les 60 secondes
2. Les emails seront associés automatiquement aux devis correspondants (par email du client)
3. Vous pourrez voir les emails dans l'onglet "Messages" de chaque devis
