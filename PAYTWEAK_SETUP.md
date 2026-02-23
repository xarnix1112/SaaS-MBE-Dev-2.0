# Configuration Paytweak (compte es4IiIhl03aPttsTz5xj)

## Activation automatique

Le compte SaaS `es4IiIhl03aPttsTz5xj` dispose automatiquement de la fonctionnalité Paytweak. Aucune modification Firestore n'est requise.

Pour activer sur un autre compte, ajouter dans Firestore :
```
saasAccounts/{id}.customFeatures.customPaytweak = true
```

## Utilisation

1. Aller dans **Paramètres → Paiements**
2. Connecter **Stripe** et/ou **Paytweak** (clé API)
3. Choisir l'outil de génération : **Stripe** ou **Paytweak**
4. Tous les liens de paiement (manuels + auto-générés) utiliseront l'outil sélectionné

## Stockage des clés (RGPD)

- **Stockage** : Firestore `saasAccounts/{id}/secrets/paytweak.apiKey`
- **Pas de clé** dans .env, variables d'environnement ou fichiers locaux
- **Règles Firestore** : `allow read, write: if false` sur `secrets/*` → aucun accès client
- **Accès** : Uniquement le backend (Admin SDK) lit/écrit ; l'API vérifie que l'utilisateur est propriétaire du compte avant toute opération
