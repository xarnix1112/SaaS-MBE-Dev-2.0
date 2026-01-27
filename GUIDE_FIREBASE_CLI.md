# Guide étape par étape : Déployer les règles Firestore avec Firebase CLI

## Étape 1 : Installer Firebase CLI

### Option A : Via npm (recommandée)
```bash
npm install -g firebase-tools
```

### Option B : Via Homebrew (macOS)
```bash
brew install firebase-cli
```

### Vérifier l'installation
```bash
firebase --version
```
Vous devriez voir quelque chose comme : `13.x.x` ou supérieur

---

## Étape 2 : Se connecter à Firebase

```bash
firebase login
```

**Ce qui va se passer :**
1. Une fenêtre de navigateur s'ouvrira automatiquement
2. Sélectionnez votre compte Google (celui associé au projet Firebase)
3. Autorisez Firebase CLI à accéder à votre compte
4. Revenez au terminal, vous devriez voir : `✅ Success! Logged in as votre-email@gmail.com`

**Si la fenêtre ne s'ouvre pas automatiquement :**
```bash
firebase login --no-localhost
```
Cela vous donnera un lien à copier-coller dans votre navigateur.

---

## Étape 3 : Vérifier que vous êtes dans le bon projet

```bash
firebase projects:list
```

Vous devriez voir votre projet `sdv-automation-mbe` dans la liste.

**Si le projet n'apparaît pas :**
```bash
firebase use sdv-automation-mbe
```

---

## Étape 4 : Initialiser Firestore (si pas déjà fait)

**⚠️ IMPORTANT :** Ne faites cette étape QUE si Firestore n'est pas encore initialisé dans votre projet.

```bash
firebase init firestore
```

**Questions posées :**
1. **"What file should be used for Firestore Rules?"** → Appuyez sur `Entrée` (utilise `firestore.rules` par défaut)
2. **"What file should be used for Firestore indexes?"** → Appuyez sur `Entrée` (utilise `firestore.indexes.json` par défaut)

**Si Firestore est déjà initialisé**, passez directement à l'étape 5.

---

## Étape 5 : Vérifier que le fichier firestore.rules existe

```bash
ls -la firestore.rules
```

Vous devriez voir le fichier. Si vous voyez une erreur "No such file", le fichier n'est pas au bon endroit.

**Si le fichier n'existe pas :**
- Vérifiez que vous êtes dans le répertoire racine du projet : `/Users/clembrlt/Desktop/Devis automation MBE`
- Le fichier `firestore.rules` devrait être à la racine, au même niveau que `DOCUMENTATION.md`

---

## Étape 6 : Déployer les règles Firestore

```bash
firebase deploy --only firestore:rules
```

**Ce qui va se passer :**
1. Firebase CLI va lire le fichier `firestore.rules`
2. Il va valider la syntaxe des règles
3. Il va les déployer sur votre projet Firebase
4. Vous verrez un message de succès : `✅ Deployed rules successfully`

**Exemple de sortie attendue :**
```
=== Deploying to 'sdv-automation-mbe'...

i  deploying firestore
i  firestore: checking firestore.rules for compilation errors...
✔  firestore: rules file compiled successfully
i  firestore: uploading rules firestore.rules...
✔  firestore: released rules firestore.rules to firestore

✔  Deploy complete!
```

---

## Étape 7 : Vérifier que les règles sont déployées

### Option A : Via la console Firebase
1. Ouvrez : https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
2. Vous devriez voir les règles que vous venez de déployer

### Option B : Via le terminal
```bash
firebase firestore:rules:get
```

---

## Étape 8 : Tester dans l'application

1. **Redémarrez votre application** (si elle tourne) :
   - Arrêtez avec `Ctrl+C`
   - Relancez avec `npm run dev:all` ou `start-dev.command`

2. **Testez l'ajout d'une salle de ventes** :
   - Allez dans l'onglet "Salles des ventes"
   - Cliquez sur "Ajouter une salle de vente"
   - Remplissez le formulaire et cliquez sur "Ajouter"
   - ✅ **Ça devrait fonctionner sans erreur !**

---

## Dépannage

### Erreur : "Command 'firebase' not found"
**Solution :** Firebase CLI n'est pas installé ou pas dans le PATH
```bash
npm install -g firebase-tools
```

### Erreur : "You must be logged in to run this command"
**Solution :** Vous n'êtes pas connecté
```bash
firebase login
```

### Erreur : "Error: Failed to get Firebase project"
**Solution :** Le projet n'est pas configuré
```bash
firebase use sdv-automation-mbe
```

### Erreur : "Error: firestore.rules file not found"
**Solution :** Vous n'êtes pas dans le bon répertoire
```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"
ls firestore.rules  # Vérifier que le fichier existe
```

### Erreur : "Error: Rules file compilation failed"
**Solution :** Il y a une erreur de syntaxe dans `firestore.rules`
- Vérifiez la syntaxe du fichier
- Assurez-vous qu'il commence par `rules_version = '2';`

### Les règles sont déployées mais ça ne fonctionne toujours pas
**Vérifications :**
1. L'authentification anonyme est-elle activée ?
   - https://console.firebase.google.com/project/sdv-automation-mbe/authentication/providers
   - Activez "Anonymous" si ce n'est pas fait

2. Redémarrez l'application après avoir déployé les règles

3. Vérifiez les logs du navigateur (F12) pour voir les erreurs exactes

---

## Commandes utiles

```bash
# Voir la version de Firebase CLI
firebase --version

# Voir les projets disponibles
firebase projects:list

# Utiliser un projet spécifique
firebase use sdv-automation-mbe

# Voir les règles actuelles
firebase firestore:rules:get

# Déployer uniquement les règles
firebase deploy --only firestore:rules

# Déployer tout (règles + autres services)
firebase deploy

# Se déconnecter
firebase logout

# Voir l'aide
firebase help
```

---

## Résumé rapide

```bash
# 1. Installer Firebase CLI
npm install -g firebase-tools

# 2. Se connecter
firebase login

# 3. Aller dans le répertoire du projet
cd "/Users/clembrlt/Desktop/Devis automation MBE"

# 4. Déployer les règles
firebase deploy --only firestore:rules

# 5. Tester dans l'application
```

Voilà ! 🎉

