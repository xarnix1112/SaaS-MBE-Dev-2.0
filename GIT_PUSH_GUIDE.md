# 📤 Guide pour pusher sur GitHub

## ✅ Vérification avant le push

### 1. Vérifier les fichiers modifiés

```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"
git status
```

Tu devrais voir environ **27 fichiers** (20 nouveaux + 7 modifiés).

### 2. Vérifier que .env.local n'est PAS dans la liste

⚠️ **TRÈS IMPORTANT** : `.env.local` ne doit **JAMAIS** être commité car il contient tes clés Stripe.

Vérifie qu'il est bien dans `.gitignore` :

```bash
cat .gitignore | grep .env.local
```

Si tu ne vois pas `.env.local`, ajoute-le :

```bash
echo ".env.local" >> .gitignore
```

---

## 📦 Commiter les changements

### Méthode 1 : Commit en une fois (recommandé)

```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"

# Ajouter tous les fichiers
git add .

# Vérifier ce qui va être commité
git status

# Créer le commit
git commit -m "feat: Implémentation complète de Stripe Connect

- Ajout du système de paiement Stripe Connect
- OAuth pour connexion des comptes clients
- Checkout Sessions pour paiements one-shot
- Webhook unique pour tous les comptes
- Interface utilisateur complète dans Settings et QuoteDetail
- Documentation exhaustive (1,550+ lignes)
- Scripts d'initialisation et de vérification
- Configuration automatique des proxies

20 fichiers créés, 7 fichiers modifiés
3,137 lignes de code ajoutées

Fonctionnalités:
- Connexion OAuth Stripe en un clic
- Création de paiements pour les devis
- Paiements multiples par devis (principal + surcoûts)
- Mise à jour automatique des statuts via webhook
- Polling temps réel toutes les 30 secondes
- Aucune clé Stripe exposée côté frontend

Collections Firestore:
- clients (avec stripeAccountId)
- devis (avec statut de paiement)
- paiements (avec type et statut)

Documentation:
- START_HERE.md - Point d'entrée
- QUICK_START_STRIPE.md - Démarrage rapide
- STRIPE_CONNECT_SETUP.md - Documentation complète
- CHANGELOG_STRIPE_CONNECT.md - Liste des changements
- + 16 autres fichiers de documentation"
```

### Méthode 2 : Commits séparés (plus détaillé)

```bash
cd "/Users/clembrlt/Desktop/Devis automation MBE"

# 1. Backend
git add "front end/server/stripe-connect.js"
git add "front end/server/index.js"
git add "front end/server/ai-proxy.js"
git commit -m "feat(backend): Ajout du module Stripe Connect

- Module stripe-connect.js avec OAuth et Checkout Sessions
- Routes API dans ai-proxy.js
- Webhook unique pour tous les comptes
- Helpers Firestore pour clients, devis, paiements"

# 2. Frontend
git add "front end/src/types/stripe.ts"
git add "front end/src/lib/stripeConnect.ts"
git add "front end/src/components/quotes/QuotePaiements.tsx"
git add "front end/src/pages/Settings.tsx"
git add "front end/src/pages/QuoteDetail.tsx"
git commit -m "feat(frontend): Interface Stripe Connect

- Types TypeScript pour Stripe Connect
- Client API avec polling automatique
- Composant QuotePaiements pour gérer les paiements
- Onglet Paiements dans Settings
- Intégration dans QuoteDetail"

# 3. Scripts et configuration
git add "front end/scripts/init-firestore-stripe.mjs"
git add "front end/scripts/check-stripe-config.mjs"
git add "front end/start-stripe-webhook.sh"
git add "front end/package.json"
git add "front end/vite.config.ts"
git add "front end/scripts/dev-all.mjs"
git add "front end/env.stripe.example"
git commit -m "feat(config): Scripts et configuration Stripe

- Script d'initialisation Firestore
- Script de vérification de configuration
- Script de démarrage Stripe CLI
- Proxies Vite pour /stripe et /webhooks
- Nouveaux scripts npm: stripe:check et stripe:init"

# 4. Documentation
git add *.md
git commit -m "docs: Documentation complète Stripe Connect

- 20 fichiers de documentation (1,550+ lignes)
- Guides de démarrage rapide
- Documentation technique complète
- Guides de dépannage
- Changelog détaillé"
```

---

## 🚀 Pusher sur GitHub

### 1. Vérifier la branche

```bash
git branch
```

Tu es probablement sur `main` ou `master`.

### 2. Pusher

```bash
git push origin main
```

Ou si tu es sur `master` :

```bash
git push origin master
```

### 3. Si c'est la première fois

Si tu n'as pas encore de remote configuré :

```bash
# Ajouter le remote
git remote add origin https://github.com/TON_USERNAME/TON_REPO.git

# Pusher
git push -u origin main
```

---

## 🔍 Vérification après le push

### Sur GitHub

1. Va sur ton repo GitHub
2. Vérifie que les fichiers sont bien là
3. Vérifie que `.env.local` n'est **PAS** dans le repo
4. Lis le README ou START_HERE.md pour vérifier que tout est clair

### Localement

```bash
# Vérifier le dernier commit
git log -1

# Vérifier les fichiers trackés
git ls-files | grep stripe
```

---

## ⚠️ Sécurité - TRÈS IMPORTANT

### Fichiers qui ne doivent JAMAIS être commités

- ❌ `.env.local` (contient les clés Stripe)
- ❌ `firebase-credentials.json` (credentials Firebase)
- ❌ `node_modules/` (dépendances)
- ❌ `.stripe_secret_key` (clé Stripe)

### Vérifier le .gitignore

```bash
cat .gitignore
```

Assure-toi que ces lignes sont présentes :

```
.env.local
.env
firebase-credentials.json
.stripe_secret_key
node_modules/
```

### Si tu as accidentellement commité un secret

⚠️ **NE JAMAIS FAIRE** :
```bash
# NE FAIS PAS ÇA
git push --force
```

✅ **À FAIRE** :
1. Révoquer immédiatement la clé sur Stripe Dashboard
2. Générer une nouvelle clé
3. Mettre à jour `.env.local`
4. Utiliser `git-filter-repo` ou contacter GitHub Support

---

## 📋 Checklist avant le push

- [ ] `.env.local` est dans `.gitignore`
- [ ] `firebase-credentials.json` est dans `.gitignore`
- [ ] `git status` ne montre pas de fichiers sensibles
- [ ] Les tests passent localement
- [ ] La documentation est à jour
- [ ] Le message de commit est clair

---

## 🎯 Après le push

### 1. Créer une release (optionnel)

Sur GitHub :
1. Va dans "Releases"
2. Clique sur "Create a new release"
3. Tag : `v1.0.0`
4. Titre : "Stripe Connect v1.0.0"
5. Description : Copie le contenu de `CHANGELOG_STRIPE_CONNECT.md`

### 2. Mettre à jour le README principal

Ajoute une section sur Stripe Connect dans ton README principal :

```markdown
## 💳 Paiements avec Stripe Connect

Ce projet intègre Stripe Connect pour permettre aux clients d'encaisser des paiements.

### Démarrage rapide

1. Lis [START_HERE.md](./START_HERE.md)
2. Configure tes clés Stripe dans `.env.local`
3. Lance `npm run stripe:init`
4. Démarre l'application

### Documentation

- [Guide de démarrage rapide](./QUICK_START_STRIPE.md)
- [Documentation complète](./STRIPE_CONNECT_SETUP.md)
- [Changelog](./CHANGELOG_STRIPE_CONNECT.md)
```

### 3. Créer une issue pour les prochaines étapes

Suggestions d'améliorations futures :
- [ ] Ajouter des notifications par email après paiement
- [ ] Ajouter des rapports de paiements
- [ ] Implémenter les remboursements
- [ ] Ajouter l'export des paiements en CSV
- [ ] Configurer le webhook en production

---

## 🎉 C'est fait !

Ton code est maintenant sur GitHub avec :
- ✅ Tout le code Stripe Connect
- ✅ Documentation complète
- ✅ Scripts d'initialisation
- ✅ Aucun secret exposé

**Bon push ! 🚀**

