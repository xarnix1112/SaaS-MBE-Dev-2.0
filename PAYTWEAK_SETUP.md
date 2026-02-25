# Configuration Paytweak

## Activation automatique

Les comptes SaaS suivants disposent automatiquement de la fonctionnalité Paytweak :
- `es4IiIhl03aPttsTz5xj`
- `JrCRpURxF7k6PHwueLPr`

Aucune modification Firestore n'est requise pour ces comptes.

Pour activer sur un autre compte, ajouter dans Firestore :
```
saasAccounts/{id}.customFeatures.customPaytweak = true
```

## Utilisation

1. Aller dans **Paramètres → Paiements**
2. Connecter **Stripe** et/ou **Paytweak** (clé publique + clé privée)
3. Choisir l'outil de génération : **Stripe** ou **Paytweak**
4. Tous les liens de paiement (manuels + auto-générés, y compris groupés) utiliseront l'outil sélectionné

## Stockage des clés (RGPD)

- **Stockage** : Firestore `saasAccounts/{id}/secrets/paytweak` avec `publicKey` et `privateKey`
- **Pas de clé** dans .env, variables d'environnement ou fichiers locaux
- **Règles Firestore** : `allow read, write: if false` sur `secrets/*` → aucun accès client
- **Accès** : Uniquement le backend (Admin SDK) lit/écrit ; l'API vérifie que l'utilisateur est propriétaire du compte avant toute opération

## Webhook

Voir **PAYTWEAK_INTEGRATION.md** pour la configuration complète du webhook Paytweak.
