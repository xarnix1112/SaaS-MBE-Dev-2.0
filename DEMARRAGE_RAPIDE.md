# 🚀 Démarrage rapide - Configuration terminée !

## ✅ Ce qui a été configuré

- ✅ **Clés Stripe** : Configurées dans `.env.local`
  - Secret Key : `sk_test_51RQaZi...`
  - Client ID : `ca_TmSgQFHmwwuQNsbdtRJl456sAnDSma9P`
  - Webhook Secret : Déjà présent dans `.env.local`

- ✅ **Firestore** : Collections créées
  - `clients` → Client de test : `dxHUjMCaJ0A7vFBiGNFR`
  - `devis` → Devis de test : `8t3u8bSBDA6brze5CBdl`
  - `paiements` → Paiement de test : `lyFzx7djN65xUI4ffhP2`

- ✅ **Frontend** : Client ID configuré dans `Settings.tsx`

## 🎯 Prochaines étapes (2 étapes seulement !)

### Étape 1 : Démarrer Stripe CLI (terminal séparé)

Ouvre un **nouveau terminal** et exécute :

```bash
cd "front end"
./start-stripe-webhook.sh
```

Ou manuellement :

```bash
stripe listen --forward-to http://localhost:8080/webhooks/stripe
```

⚠️ **Important** : Laisse ce terminal ouvert pendant que tu testes !

### Étape 2 : Démarrer l'application

Dans un **autre terminal** :

```bash
cd "front end"
npm run dev:all
```

Ouvre http://localhost:8080

## 🎮 Premier test (3 min)

### 1. Connecter Stripe (1 min)

1. Va dans **Paramètres** (⚙️ en haut à droite)
2. Clique sur l'onglet **Paiements**
3. Clique sur **Connecter mon compte Stripe**
4. Connecte-toi avec ton compte Stripe
5. Autorise l'accès
6. ✅ Tu devrais voir "Connecté"

### 2. Créer un paiement (1 min)

1. Va dans **Devis** (menu de gauche)
2. Clique sur le devis de test (référence : `DEV-1768258204267`)
3. Va dans l'onglet **Paiements**
4. Clique sur **+ Créer un paiement**
5. Remplis :
   - **Montant** : `150.00`
   - **Type** : `Paiement principal`
   - **Description** : `Test de paiement`
6. Clique sur **Créer le lien de paiement**

### 3. Payer (1 min)

Tu es redirigé vers Stripe Checkout.

**Carte de test** :
```
Numéro : 4242 4242 4242 4242
Date   : 12/25
CVC    : 123
Code postal : 75001
```

Clique sur **Payer**.

### 4. Vérifier

1. Retourne dans le devis → onglet **Paiements**
2. Attends 5-10 secondes
3. ✅ Le paiement devrait être marqué **Payé**
4. Le statut du devis devrait être mis à jour

## 📊 IDs de test

Pour référence :

```bash
CLIENT_ID="dxHUjMCaJ0A7vFBiGNFR"
DEVIS_ID="8t3u8bSBDA6brze5CBdl"
PAIEMENT_ID="lyFzx7djN65xUI4ffhP2"
```

## 🐛 Dépannage

### Le webhook ne reçoit pas les événements

➡️ Vérifie que Stripe CLI est en cours d'exécution dans un terminal séparé  
➡️ Vérifie les logs dans le terminal Stripe CLI

### "Client non trouvé"

➡️ Utilise le CLIENT_ID : `dxHUjMCaJ0A7vFBiGNFR`  
➡️ Ou réexécute : `npm run stripe:init`

### Le paiement ne se met pas à jour

➡️ Attends 30 secondes (polling automatique)  
➡️ Clique sur "Actualiser"  
➡️ Vérifie les logs du serveur

### "Stripe not configured"

➡️ Redémarre le serveur : `npm run dev:all`  
➡️ Vérifie que `.env.local` contient les clés Stripe

## 🎉 C'est tout !

Tu es prêt à encaisser des paiements via Stripe Connect !

### Prochaines étapes suggérées

1. ✅ Teste avec plusieurs paiements pour un même devis
2. ✅ Teste les surcoûts (type : "SURCOUT")
3. ✅ Teste la déconnexion/reconnexion Stripe
4. 🚀 Configure le webhook en production
5. 🚀 Passe en mode live (clés `sk_live_`)

## 📚 Documentation complète

- **START_HERE.md** - Guide général
- **QUICK_START_STRIPE.md** - Guide détaillé
- **STRIPE_CONNECT_SETUP.md** - Documentation complète

## 🎯 Résumé de l'architecture

```
Ton SaaS
│
├── Client Test (dxHUjMCaJ0A7vFBiGNFR)
│   └── Compte Stripe (à connecter)
│       └── Devis DEV-1768258204267
│           └── Paiements (principal + surcoûts)
│
└── Webhook Stripe
    └── Met à jour automatiquement les statuts
```

**Bon test ! 🚀**

