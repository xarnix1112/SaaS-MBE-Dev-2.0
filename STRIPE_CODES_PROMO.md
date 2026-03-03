# Codes promo Stripe – Majuscules et « Code invalide »

## Nouvelle solution : saisie sur notre page

Le code promo peut maintenant être saisi **sur la page de choix du plan** (avant la redirection vers Stripe). L’app le valide côté backend et l’applique directement à la session Checkout.

- **Avantages** : messages d’erreur plus explicites (« Code invalide », « Ce code n’est plus actif »).
- **Comportement** : si un code est fourni et valide, il est appliqué automatiquement sur Stripe. Sinon, le champ reste disponible sur la page Stripe.

---

## 1. Pourquoi le champ Stripe n’accepte que des majuscules ?

L’interface de saisie des codes promo est gérée par **Stripe** sur leur page Checkout. Leur interface affiche souvent le texte en majuscules pour uniformiser l’affichage.

**Les codes promo Stripe sont insensibles à la casse** : `JEANNE`, `jeanne` et `Jeanne` sont traités de la même façon. La présentation en majuscules est uniquement visuelle, côté Stripe. Ce comportement ne peut pas être modifié depuis notre application, car la page Checkout est hébergée par Stripe.

---

## 2. Pourquoi « Ce code n’est pas valide » ?

Si un code est créé dans le Dashboard Stripe mais rejeté au Checkout, les causes les plus fréquentes sont :

### A) Produits éligibles (cause la plus courante)

Le bon est peut‑être restreint à certains produits.

**À vérifier :**
1. Stripe → Catalogue de produits → Bons de réduction
2. Cliquer sur le coupon (ex. « Jeanne »)
3. Regarder **« S’applique à »** (Apply to)
   - Si **« Produits spécifiques »** est coché → le produit **Pack Ultra** doit être dans la liste
   - Si Pack Ultra n’est pas dans la liste → le code sera rejeté sur Pack Ultra

**Correction :**
- Soit ajouter Pack Ultra à la liste des produits éligibles
- Soit choisir **« Tous les produits »** (ou ne pas restreindre)

### B) Premier achat uniquement (First-time customers only)

Si l’option « Première transaction uniquement » est activée sur le code promo, il ne fonctionnera que pour des clients qui n’ont jamais eu de paiement réussi. Un client de test avec des paiements existants peut être bloqué.

### C) Code expiré ou limite atteinte

- Vérifier **« Expire le »** (redeem_by) : le code ne doit pas être périmé
- Vérifier **« Utilisations »** (max_redemptions) : la limite ne doit pas être atteinte

### D) Promo vs coupon

Pour que le client puisse entrer un code dans Checkout, il faut un **code promotionnel** (promotion code), pas seulement un **coupon**.

- Dans Stripe : **Promotions → Codes promotionnels** (ou création depuis un coupon avec champ « Code »)
- Le code saisi par le client (ex. `JEANNE`) doit être celui défini dans ces codes promotionnels

---

## Résumé rapide

| Problème                    | Cause principale                    | Action                                  |
|----------------------------|-------------------------------------|-----------------------------------------|
| Affichage en majuscules    | Comportement Stripe (non modifiable)| Aucune – codes insensibles à la casse   |
| « Ce code n’est pas valide » | Restriction sur les produits       | Vérifier « S’applique à » → inclure Pack Ultra ou « Tous les produits » |

---

## Diagnostic : quel compte Stripe utilise le backend ?

Sur la page **Choisissez votre plan**, clique sur **« Vérifier »** à côté du champ Code promo. Le message affiche :
- **Mode TEST / LIVE** → La clé utilisée. Test et Live sont séparés : codes créés en Test ≠ visibles en Live (et inversement).
- **Aucun code trouvé** → Clé dans le mauvais mode ou mauvais compte. Bascule « Mode test » dans Stripe (coin supérieur droit) et crée tes codes dans le même mode que ta clé (`sk_test_*` = Test, `sk_live_*` = Live).
- **Codes visibles : X, Y, Z** → Bon compte et bon mode. Si ton code manque, crée-le dans le même mode (Test ou Live).

---

## Vérification rapide dans Stripe

1. Ouvrir le coupon « Jeanne » ou « JEANNE »
2. Dans **S’applique à** / **Apply to**, vérifier que :
   - soit aucun produit n’est sélectionné (tous les produits) ;
   - soit **Pack Ultra** (ou le produit lié à ton Price ID Ultra) est bien dans la liste.
