# Correction de l'erreur d'installation Firebase CLI

## Problème
```
npm error code EACCES
npm error Error: EACCES: permission denied
```

C'est une erreur de permissions. Sur macOS, il y a plusieurs solutions.

---

## Solution 1 : Utiliser Homebrew (RECOMMANDÉE sur macOS)

### Étape 1 : Vérifier si Homebrew est installé
```bash
brew --version
```

### Étape 2a : Si Homebrew est installé
```bash
brew install firebase-cli
```

### Étape 2b : Si Homebrew n'est PAS installé
Installer Homebrew d'abord :
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Puis installer Firebase CLI :
```bash
brew install firebase-cli
```

### Étape 3 : Vérifier l'installation
```bash
firebase --version
```

---

## Solution 2 : Utiliser sudo (si Homebrew ne fonctionne pas)

⚠️ **ATTENTION** : Utiliser `sudo` peut poser des problèmes de sécurité. Utilisez cette solution seulement si Homebrew ne fonctionne pas.

```bash
sudo npm install -g firebase-tools
```

Vous devrez entrer votre mot de passe macOS.

---

## Solution 3 : Configurer npm pour utiliser un répertoire local (Alternative)

Cette solution évite d'utiliser `sudo` en configurant npm pour utiliser un répertoire dans votre home directory.

### Étape 1 : Créer un répertoire pour les packages globaux
```bash
mkdir ~/.npm-global
```

### Étape 2 : Configurer npm pour utiliser ce répertoire
```bash
npm config set prefix '~/.npm-global'
```

### Étape 3 : Ajouter au PATH
Ouvrez votre fichier de configuration shell (`.zshrc` ou `.bash_profile`) :
```bash
nano ~/.zshrc
```

Ajoutez cette ligne à la fin :
```bash
export PATH=~/.npm-global/bin:$PATH
```

Sauvegardez (Ctrl+O, puis Entrée, puis Ctrl+X)

### Étape 4 : Recharger la configuration
```bash
source ~/.zshrc
```

### Étape 5 : Installer Firebase CLI
```bash
npm install -g firebase-tools
```

---

## Vérification après installation

Quelle que soit la solution choisie, vérifiez :

```bash
firebase --version
```

Vous devriez voir quelque chose comme : `13.x.x` ou supérieur

---

## Recommandation

**Pour macOS, je recommande fortement la Solution 1 (Homebrew)** car :
- ✅ Pas besoin de sudo
- ✅ Gestion propre des dépendances
- ✅ Facile à mettre à jour (`brew upgrade firebase-cli`)
- ✅ Standard sur macOS

---

## Suite du guide

Une fois Firebase CLI installé, suivez le guide `GUIDE_FIREBASE_CLI.md` à partir de l'étape 2 (connexion).

