# Configuration MBE Hub (plans Pro et Ultra)

## Accès

- **Plans concernés** : Pro et Ultra uniquement
- **Paramètres** : Onglet « MBE Hub » dans Paramètres

## Sécurité & RGPD (identique à Paytweak)

- **Stockage** : Firestore `saasAccounts/{id}/secrets/mbehub.apiKey`
- **Pas de clé** dans .env, variables d'environnement ou fichiers locaux
- **Règles Firestore** : `allow read, write: if false` sur `secrets/*` → aucun accès client
- **Accès** : Uniquement le backend (Admin SDK) lit/écrit ; l'API vérifie que l'utilisateur est propriétaire du compte avant toute opération

## Fonctionnalité

Une fois la clé API configurée, le bouton **« Envoyer vers MBE Hub »** apparaît sur chaque devis (page détail du devis, bloc Actions).

Lors du clic, le backend envoie vers MBE Hub :
- Référence du devis
- Client (nom, email, téléphone, adresse)
- Destinataire (contact + adresse de livraison)
- Cartons (référence, poids, dimensions volumétriques)
- Poids total et poids volumétrique

## Intégration API (à faire)

L’appel vers l’API MBE Hub n’est pas encore en place. Dès que la documentation est disponible :

1. Mettre à jour `POST /api/mbehub/send-quote` dans `ai-proxy.js`
2. Définir `MBE_HUB_API_URL` dans les variables d’environnement
3. Adapter le payload au format attendu par l’API
4. Remplacer le retour actuel (stub) par l’appel réel à l’API
