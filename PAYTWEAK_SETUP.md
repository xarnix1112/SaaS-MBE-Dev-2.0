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

## Stockage des clés

- Clé Paytweak : `saasAccounts/{id}/secrets/paytweak.apiKey`
- Règles Firestore : accès refusé aux clients (seul le backend lit/écrit)
- RGPD : données dans Firestore (chiffrement au repos par défaut)
