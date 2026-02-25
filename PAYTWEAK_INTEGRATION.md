# Intégration Paytweak - Liens de paiement et Webhook

Ce document décrit la configuration Paytweak et les étapes à effectuer pour que l’intégration fonctionne correctement en staging.

---

## 1. Configuration dans l’application (Paramètres → Paiements)

1. Connecte-toi à **staging.mbe-sdv.fr**
2. Va dans **Paramètres** → onglet **Paiements**
3. Dans la section **Paytweak & choix de l’outil de paiement** :
   - **Clé publique Paytweak** (Paytweak-API-KEY)
   - **Clé privée Paytweak** (Secret token)
4. Clique sur **Enregistrer les clés**
5. Choisis **Paytweak** comme outil pour générer les liens de paiement (si Stripe et Paytweak sont configurés)

---

## 2. Obtenir les clés Paytweak

### Compte sandbox (tests)

Envoyer un email à **hello@paytweak.com** avec le sujet **« sandbox API Key request »** pour recevoir les clés du compte de test.

### Compte production

Les clés sont disponibles dans le backoffice Paytweak (après souscription).

L’authentification utilise deux clés :
- **Clé publique** → utilisée pour l’étape `hello`
- **Clé privée** → utilisée avec le token de sécurité pour l’étape `verify` et obtenir le Work Token

---

## 3. Configuration du Webhook dans Paytweak

L’URL de callback doit être configurée dans le backoffice Paytweak pour recevoir les notifications de paiement.

### URL de webhook (staging)

```
https://saas-mbe-dev-staging-staging.up.railway.app/api/paytweak/webhook
```

### Étapes

1. Connecte-toi au backoffice Paytweak
2. Accède aux paramètres de callback / webhook
3. Saisis l’URL ci-dessus
4. Indique le type de notification : **PAYMENT** (obligatoire)
5. Choisis **POST** (recommandé) ou **GET** selon la configuration possible

### Format des données webhook

Lorsqu’un paiement est validé, Paytweak envoie notamment :

- `notice` = `"PAYMENT"`
- `order_id` = référence du lien (format : `NomFamille-NumeroBordereau-SalleDeVente__devisId` ou `group-groupId`)
- `Status` = 5 (autorisé) ou 9 (exécuté) en cas de succès
- `amount` = montant payé
- `link_id` = identifiant du lien Paytweak

---

## 4. Structure de l’order_id

L’application génère des `order_id` au format suivant :

| Type      | Format                                                       | Exemple                    |
|----------|---------------------------------------------------------------|----------------------------|
| Devis    | `{nomFamille}-{numeroBordereau}-{salleDeVente}__{devisId}`   | `MBE2026-12345-Drouot__abc123` |
| Groupe   | `group-{groupId}`                                             | `group-GRP-2026-02-A1B2`   |

Les champs utilisés pour les devis :

- **nomFamille** : référence du devis
- **numeroBordereau** : numéro du bordereau
- **salleDeVente** : salle des ventes

---

## 5. Vérifications

### Test du webhook

Après configuration, un paiement de test (sandbox ou production) doit déclencher :

1. Une notification vers l’URL de webhook
2. La mise à jour du devis dans l’application (statut « payé », « awaiting_collection »)
3. L’envoi de l’email de confirmation au client

### Logs

En cas de problème, vérifier les logs du serveur Railway (staging) pour les lignes préfixées par `[paytweak-webhook]`.

---

## 6. Résumé des éléments à configurer

| Élément                 | Où configurer     | Valeur / action                                      |
|-------------------------|-------------------|------------------------------------------------------|
| Clé publique Paytweak   | App → Paramètres  | Saisie dans l’interface                              |
| Clé privée Paytweak     | App → Paramètres  | Saisie dans l’interface                              |
| URL de webhook          | Backoffice Paytweak | `https://saas-mbe-dev-staging-staging.up.railway.app/api/paytweak/webhook` |
| Type de notification    | Backoffice Paytweak | PAYMENT                                              |
| Compte sandbox          | Email à Paytweak  | Sujet : « sandbox API Key request »                  |

---

## 7. Erreurs fréquentes

- **402 MISSING HEADER** : la clé envoyée est invalide ou mal formatée
- **403 AUTH FAILURE** : clé publique ou privée incorrecte
- **408 TIME OUT** : le Work Token a expiré (durée de vie 10 minutes) ; un nouveau token sera obtenu automatiquement
- **Webhook non reçu** : vérifier que l’URL est correcte et accessible depuis Internet (HTTPS)
