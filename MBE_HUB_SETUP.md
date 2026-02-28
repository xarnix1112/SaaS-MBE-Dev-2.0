# Configuration MBE Hub (plans Pro et Ultra)

## Accès

- **Plans concernés** : Pro et Ultra uniquement
- **Paramètres** : Onglet « MBE Hub » dans Paramètres

## Sécurité & RGPD

- **Stockage** : Firestore `saasAccounts/{id}/secrets/mbehub` (document avec `username` et `password`)
- **Pas de credentials** dans .env ou fichiers locaux
- **Accès** : Uniquement le backend (Admin SDK) lit/écrit

## Configuration

1. Renseignez vos **identifiants SOAP** dans Paramètres > MBE Hub :
   - **Identifiant (username)** : Login mbehub.fr (rôle ONLINEMBE_USER)
   - **Mot de passe** : Mot de passe API (créé une seule fois sur mbehub.fr)

2. **Environnement** : Par défaut, l’API utilise le **DEMO** (staging).
   - Pour la **production**, définissez `MBE_HUB_ENV=prod` dans les variables d’environnement du serveur.

## Fonctionnalité

- **Page Expéditions** : Les devis en « Attente d'envoi » affichent le bouton **« Envoyer vers MBE Hub »**.
- Clic → modal pour vérifier/corriger les adresses client et destinataire (parsing automatique si adresse texte).
- Choix du **service** (Standard, Express, etc.) via la liste dynamique `ShippingOptionsRequest`.
- Validation → création d’une **expédition en brouillon** sur le Hub MBE.
- Le **Centre MBE** finalise et imprime les étiquettes.

## Données envoyées

- Destinataire (nom, adresse complète, CP, ville, pays)
- Poids (kg) et dimensions (L×l×h en cm)
- Référence du devis
- Option assurance (si activée sur le devis)

## API SOAP utilisée

- **WSDL DEMO** : `https://api.demo.mbehub.it/ws/e-link.wsdl`
- **WSDL PROD FR** : `https://api.mbeonline.fr/ws/e-link.wsdl`
- **Auth** : HTTP Basic (username:password)

## Statuts après envoi

- Le devis passe au statut **« Envoyé MBE Hub »** (`sent_to_mbe_hub`).
- Le **MBE Tracking ID** est enregistré sur le devis.
- Les devis envoyés sont visibles sur la page **Expédiés** (`/quotes/shipped`), conservés 6 mois puis masqués.
