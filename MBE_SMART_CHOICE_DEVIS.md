# Tarification MBE Smart Choice pour les devis (Pro/Ultra)

## Objectif

Utiliser l'API MBE Hub (Smart Choice / ShippingOptionsRequest) pour calculer le prix d'expédition en temps réel, et proposer au client **deux liens de paiement** : Standard et Express. Simplifie la tâche du client (pas de grille tarifaire à remplir).

## Périmètre

- **Plans** : Pro et Ultra uniquement
- **Quand** : Dès que dimensions (L×l×h), poids et adresse de destination sont renseignés
- **Où** : Dans le devis, avant envoi au client par email

## Flux prévu

1. **Calcul automatique** : Quand l'utilisateur (MBE) remplit le devis avec dimensions, poids, adresse de livraison → appel API MBE `ShippingOptionsRequest` → récupération des tarifs (Standard, Express, etc.)

2. **Envoi du devis** : L'email contient **deux liens** :
   - Lien 1 : Payer en Standard (X €)
   - Lien 2 : Payer en Express (Y €)

3. **Exclusivité** : Dès qu'un des deux liens est payé, l'autre est automatiquement désactivé (annulé).

## Données sources (Firestore `quotes`)

- **Dimensions** : `lot.dimensions` ou `lot.realDimensions` → `length`, `width`, `height` (cm)
- **Poids** : `lot.dimensions.weight` ou `totalWeight` (kg)
- **Adresse** : `delivery.address` → `line1`, `zip`, `city`, `country` (ou `client.address` si mode client)

## Identification Standard vs Express (API MBE)

Les options retournées ont `ServiceDesc` (ex. "MBE Standard (GLS)", "MBE Express (DHL)").
- **Standard** : Option dont `ServiceDesc` contient "Standard"
- **Express** : Option dont `ServiceDesc` contient "Express"

On choisit le moins cher dans chaque catégorie.

## Types de paiement

- `PRINCIPAL_STANDARD` : paiement principal avec livraison Standard
- `PRINCIPAL_EXPRESS` : paiement principal avec livraison Express

Quand l'un est payé → l'autre est annulé (webhook paiement).

## Email

- Nouveaux placeholders : `{{lienPaiementStandard}}`, `{{lienPaiementExpress}}`, `{{prixStandard}}`, `{{prixExpress}}`
- Section paiement : deux boutons/liens clairs

## Plan d'implémentation (phases)

### Phase 1 – Calcul et affichage des tarifs MBE
- Endpoint `POST /api/mbehub/quote-shipping-rates` : prend quoteId, retourne { standard, express } avec prix
- Frontend : bouton "Calculer expédition MBE" sur le devis quand dimensions + poids + adresse sont renseignés
- Afficher les deux prix (Standard / Express) dans le récapitulatif du devis

### Phase 2 – Création des deux liens de paiement
- Endpoint `POST /api/mbehub/prepare-quote-email` : appelle Phase 1 + crée 2 paiements (PRINCIPAL_STANDARD, PRINCIPAL_EXPRESS)
- Étendre stripe-connect / paiements pour accepter ces types
- Stocker les 2 liens sur le devis avec métadonnée `shippingType`

### Phase 3 – Email et webhook
- Modifier le template `quote_send` pour afficher 2 liens (Standard / Express)
- Webhook paiement : quand l'un est payé, annuler l'autre (Stripe expire session, Paytweak si possible)
