# 🚀 Démarrage rapide Stripe Connect

Guide ultra-rapide pour tester Stripe Connect en 5 minutes.

## ⚡ Installation rapide

### 1. Configuration des variables d'environnement

Créez `.env.local` dans le dossier `front end/` :

```bash
# Stripe (OBLIGATOIRE)
STRIPE_SECRET_KEY=sk_test_votre_cle
STRIPE_CONNECT_CLIENT_ID=ca_votre_client_id
STRIPE_WEBHOOK_SECRET=whsec_votre_secret

# App
APP_URL=http://localhost:8080
PORT=8080
```

**Où trouver ces clés ?**

1. **STRIPE_SECRET_KEY** : [Dashboard Stripe](https://dashboard.stripe.com/test/apikeys) → API keys → Secret key
2. **STRIPE_CONNECT_CLIENT_ID** : [Connect Settings](https://dashboard.stripe.com/test/settings/applications) → Client ID
3. **STRIPE_WEBHOOK_SECRET** : Voir étape 3 ci-dessous

### 2. Activer Stripe Connect

1. Allez sur [Stripe Connect Settings](https://dashboard.stripe.com/test/settings/applications)
2. Activez **OAuth for Standard accounts**
3. Ajoutez l'URL de redirection : `http://localhost:8080/stripe/callback`

### 3. Configurer le webhook (pour les tests locaux)

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Se connecter
stripe login

# Écouter les webhooks (dans un terminal séparé)
stripe listen --forward-to http://localhost:8080/webhooks/stripe
```

Copiez le **webhook signing secret** affiché (commence par `whsec_`) dans `.env.local`.

### 4. Initialiser Firestore

```bash
cd "front end"
node scripts/init-firestore-stripe.mjs
```

Notez le **CLIENT_ID** affiché (vous en aurez besoin).

### 5. Démarrer l'application

```bash
cd "front end"
npm run dev:all
```

Ouvrez http://localhost:8080

## 🎯 Test rapide

### 1. Connecter Stripe

1. Allez dans **Paramètres** (icône ⚙️ en haut à droite)
2. Cliquez sur l'onglet **Paiements**
3. Cliquez sur **Connecter mon compte Stripe**
4. Connectez-vous avec votre compte Stripe test
5. Autorisez l'accès
6. ✅ Vous devriez voir "Connecté"

### 2. Créer un paiement

1. Allez dans **Devis** (menu de gauche)
2. Cliquez sur un devis (ou créez-en un)
3. Cliquez sur l'onglet **Paiements**
4. Cliquez sur **Créer un paiement**
5. Remplissez :
   - Montant : `150.00`
   - Type : `Paiement principal`
   - Description : `Test de paiement`
6. Cliquez sur **Créer le lien de paiement**

### 3. Payer avec une carte de test

Vous êtes redirigé vers Stripe Checkout.

Utilisez cette carte de test :
- **Numéro** : `4242 4242 4242 4242`
- **Date** : N'importe quelle date future (ex: `12/25`)
- **CVC** : N'importe quel 3 chiffres (ex: `123`)
- **Code postal** : N'importe quel code (ex: `75001`)

Cliquez sur **Payer**.

### 4. Vérifier le paiement

1. Vous êtes redirigé vers la page de succès
2. Retournez dans le devis → onglet **Paiements**
3. Le paiement devrait être marqué comme **Payé** ✅
4. Le statut du devis devrait être mis à jour

## 🎉 C'est tout !

Vous avez maintenant un système de paiement Stripe Connect fonctionnel !

## 🐛 Problèmes courants

### "Stripe not configured"

➡️ Vérifiez que `.env.local` existe et contient les bonnes clés  
➡️ Redémarrez le serveur

### "Webhook signature invalid"

➡️ Vérifiez que Stripe CLI est en cours d'exécution  
➡️ Copiez le nouveau `whsec_` secret dans `.env.local`  
➡️ Redémarrez le serveur

### "Client non trouvé"

➡️ Exécutez `node scripts/init-firestore-stripe.mjs`  
➡️ Utilisez le CLIENT_ID affiché dans les logs

### Le paiement ne se met pas à jour

➡️ Vérifiez que Stripe CLI affiche les événements  
➡️ Vérifiez les logs du serveur (terminal)  
➡️ Attendez 30 secondes (polling automatique)

## 📚 Documentation complète

Pour plus de détails, consultez [STRIPE_CONNECT_SETUP.md](./STRIPE_CONNECT_SETUP.md)

## 🔗 Liens utiles

- [Stripe Dashboard](https://dashboard.stripe.com/test/dashboard)
- [Stripe Connect Settings](https://dashboard.stripe.com/test/settings/applications)
- [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)
- [Cartes de test](https://stripe.com/docs/testing#cards)

