# 🔍 Guide de Débogage : Paiement Non Mis à Jour

## 🎯 Problème

Après un paiement réussi via Stripe :
- ✅ Le lien de paiement devient inactif (ce qui signifie que le paiement a été traité)
- ❌ Le montant encaissé reste à 0€ dans l'interface
- ❌ Le statut du paiement reste "En attente" au lieu de "Payé"

---

## 🔍 Étapes de Diagnostic

### Étape 1 : Vérifier que le Webhook est Bien Configuré

1. **Aller sur Stripe Dashboard** : https://dashboard.stripe.com
2. **Se connecter** avec votre compte
3. **Basculer en mode Test** (toggle en haut à droite) si vous testez
4. **Menu de gauche → Developers → Webhooks**
5. **Vérifier qu'un webhook existe** avec l'URL : `https://api.mbe-sdv.fr/api/stripe/webhook`
6. **Cliquer sur le webhook** pour voir les détails
7. **Vérifier les événements activés** :
   - ✅ `checkout.session.completed` doit être coché
   - ✅ `payment_intent.succeeded` doit être coché (optionnel mais recommandé)

**✅ Si le webhook n'existe pas ou n'a pas les bons événements :**
- Créer un nouveau webhook avec l'URL ci-dessus
- Activer les événements `checkout.session.completed` et `payment_intent.succeeded`
- Copier le "Signing secret" (commence par `whsec_`)
- Mettre à jour la variable `STRIPE_WEBHOOK_SECRET` dans Railway

---

### Étape 2 : Vérifier les Logs Railway (Backend)

1. **Aller sur Railway** : https://railway.app
2. **Sélectionner votre projet backend**
3. **Aller dans l'onglet "Deployments"**
4. **Cliquer sur le dernier déploiement**
5. **Aller dans l'onglet "Logs"**

6. **Effectuer un paiement test** (avec la carte `4242 4242 4242 4242`)

7. **Chercher dans les logs** les messages suivants :

#### ✅ Logs Attendus (Si Tout Fonctionne) :

```
[stripe-connect] 📨 Webhook reçu: { type: 'checkout.session.completed', ... }
[stripe-connect] 🔍 Checkout Session Completed: { sessionId: 'cs_test_...', devisId: '...', ... }
[stripe-connect] ✅ Compte SaaS trouvé: ... (nom du compte)
[stripe-connect] 🔍 Recherche du paiement avec sessionId: cs_test_...
[stripe-connect] ✅ Paiement trouvé par sessionId direct: ...
[stripe-connect] ✅ Paiement ... marqué comme PAID
[stripe-connect] ✅ Vérification: Paiement ... bien mis à jour avec status PAID
```

#### ❌ Logs d'Erreur Possibles :

**Erreur 1 : Paiement non trouvé**
```
[stripe-connect] ❌ Paiement non trouvé pour session: cs_test_...
[stripe-connect] 💡 Vérifiez que le paiement existe dans Firestore avec ce stripeSessionId
```
**Cause :** Le `stripeSessionId` sauvegardé lors de la création du paiement ne correspond pas au `session.id` reçu par le webhook.

**Erreur 2 : Compte SaaS non trouvé**
```
[stripe-connect] ⚠️  Compte SaaS non trouvé: ...
```
**Cause :** Le `saasAccountId` dans les métadonnées du paiement ne correspond à aucun compte dans Firestore.

**Erreur 3 : Mismatch Stripe Account**
```
[stripe-connect] ⚠️  Mismatch Stripe Account pour saasAccountId ...
```
**Cause :** Le compte Stripe connecté ne correspond pas au compte utilisé pour le paiement.

---

### Étape 3 : Vérifier Firestore Directement

1. **Aller sur Firebase Console** : https://console.firebase.google.com
2. **Sélectionner votre projet** : `saas-mbe-sdv-production`
3. **Aller dans Firestore Database**
4. **Collection "paiements"** → Chercher le paiement récent

5. **Vérifier les champs suivants :**
   - `stripeSessionId` : Doit contenir l'ID de la session Stripe (ex: `cs_test_...`)
   - `status` : Doit être `"PAID"` après le paiement (pas `"PENDING"`)
   - `paidAt` : Doit contenir une date après le paiement
   - `devisId` : Doit correspondre à l'ID du devis

6. **Si le paiement n'existe pas dans Firestore :**
   - Le paiement n'a pas été créé correctement lors de la génération du lien
   - Vérifier les logs Railway au moment de la création du paiement

7. **Si le paiement existe mais `status` est toujours `"PENDING"` :**
   - Le webhook n'a pas été appelé ou a échoué
   - Vérifier les logs Railway pour voir les erreurs du webhook

---

### Étape 4 : Vérifier que le Webhook est Bien Appelé

1. **Dans Stripe Dashboard** → **Developers** → **Webhooks**
2. **Cliquer sur votre webhook**
3. **Onglet "Events"** (ou "Événements")
4. **Chercher les événements récents** de type `checkout.session.completed`

5. **Cliquer sur un événement récent**
6. **Vérifier :**
   - **Status** : Doit être "Succeeded" (vert) ou "Failed" (rouge)
   - **Response** : Doit contenir `"ok"` si le webhook a réussi
   - **Request** : Vérifier que les métadonnées contiennent `devisId` et `saasAccountId`

**❌ Si l'événement n'existe pas :**
- Le webhook n'est pas configuré correctement
- L'URL du webhook est incorrecte
- Le webhook n'est pas activé

**❌ Si l'événement existe mais le status est "Failed" :**
- Cliquer sur l'événement pour voir l'erreur
- Vérifier les logs Railway pour voir l'erreur exacte

---

## 🔧 Solutions aux Problèmes Courants

### Problème 1 : Le Webhook Ne Trouve Pas le Paiement

**Symptômes :**
- Logs montrent : `❌ Paiement non trouvé pour session: ...`
- Le paiement existe dans Firestore mais avec un `stripeSessionId` différent

**Solutions :**

1. **Vérifier que le `stripeSessionId` est bien sauvegardé lors de la création :**
   - Regarder les logs Railway au moment de la création du paiement
   - Vérifier que `stripeSessionId: session.id` est bien dans les données sauvegardées

2. **Vérifier que le webhook utilise le bon `session.id` :**
   - Dans les logs, vérifier que `session.id` correspond au `stripeSessionId` dans Firestore
   - Les deux doivent être identiques (ex: `cs_test_51AbCdEf...`)

3. **Solution temporaire :** Le code a été amélioré pour chercher le paiement par `devisId` si le `sessionId` ne correspond pas exactement

---

### Problème 2 : Le Webhook N'est Pas Appelé

**Symptômes :**
- Aucun événement dans Stripe Dashboard → Webhooks → Events
- Aucun log dans Railway au moment du paiement

**Solutions :**

1. **Vérifier l'URL du webhook dans Stripe :**
   - Doit être exactement : `https://api.mbe-sdv.fr/api/stripe/webhook`
   - Pas d'espace, pas de slash à la fin

2. **Vérifier que le webhook est activé :**
   - Dans Stripe Dashboard → Webhooks → Votre webhook
   - Le toggle "Enabled" doit être activé (vert)

3. **Vérifier le "Signing secret" :**
   - Dans Stripe Dashboard → Webhooks → Votre webhook → "Signing secret"
   - Copier le secret (commence par `whsec_`)
   - Vérifier qu'il correspond à `STRIPE_WEBHOOK_SECRET` dans Railway

4. **Tester le webhook manuellement :**
   - Dans Stripe Dashboard → Webhooks → Votre webhook → "Send test webhook"
   - Choisir l'événement `checkout.session.completed`
   - Vérifier les logs Railway pour voir si le webhook est reçu

---

### Problème 3 : Le Paiement Est Mis à Jour Mais le Frontend Ne Le Voit Pas

**Symptômes :**
- Les logs Railway montrent que le paiement est bien mis à jour (`status: "PAID"`)
- Le frontend affiche toujours "En attente" et 0€ encaissé

**Solutions :**

1. **Vérifier le polling du frontend :**
   - Le frontend recharge les paiements toutes les 10 secondes
   - Attendre 10-20 secondes après le paiement
   - Cliquer sur le bouton "Actualiser" manuellement

2. **Vérifier que l'API retourne les bonnes données :**
   - Ouvrir la console du navigateur (F12)
   - Aller dans l'onglet "Network"
   - Chercher la requête `GET /api/devis/{id}/paiements`
   - Vérifier la réponse JSON : le paiement doit avoir `status: "PAID"`

3. **Vider le cache du navigateur :**
   - Appuyer sur `Ctrl+Shift+Delete`
   - Cocher "Cache" et "Cookies"
   - Cliquer sur "Effacer"
   - Recharger la page (F5)

---

## 📝 Checklist de Vérification

Avant de tester, vérifiez que tout est correct :

- [ ] Webhook configuré dans Stripe avec l'URL `https://api.mbe-sdv.fr/api/stripe/webhook`
- [ ] Événements `checkout.session.completed` et `payment_intent.succeeded` activés
- [ ] `STRIPE_WEBHOOK_SECRET` dans Railway correspond au secret du webhook
- [ ] Le webhook est activé (toggle vert dans Stripe)
- [ ] Les logs Railway montrent que le webhook est reçu
- [ ] Le paiement existe dans Firestore avec le bon `stripeSessionId`
- [ ] Le statut du paiement est bien `"PAID"` dans Firestore après le paiement
- [ ] Le frontend recharge les paiements (polling toutes les 10 secondes)

---

## 🆘 Si Rien Ne Fonctionne

1. **Vérifier les logs Railway complets** pour voir toutes les erreurs
2. **Vérifier les événements dans Stripe Dashboard** pour voir si le webhook est appelé
3. **Tester avec un nouveau paiement** pour voir si le problème persiste
4. **Vérifier que le code est bien déployé** (dernière version sur Railway)

---

## 📊 Exemple de Logs Corrects

Voici à quoi ressemblent les logs quand tout fonctionne :

```
[stripe-connect] 📨 Webhook reçu: { type: 'checkout.session.completed', account: 'acct_...', sessionId: 'cs_test_...' }
[stripe-connect] 🔍 Checkout Session Completed: { sessionId: 'cs_test_...', devisId: 'wDk3yU0TvMFkOOAvxXy7', ... }
[stripe-connect] ✅ Compte SaaS trouvé: euQZ... (Nom du compte)
[stripe-connect] 🔍 Recherche du paiement avec sessionId: cs_test_...
[stripe-connect] ✅ Paiement trouvé par sessionId direct: phrE385tARUR8TlrEUGu
[stripe-connect] ✅ Paiement phrE385tARUR8TlrEUGu marqué comme PAID
[stripe-connect] ✅ Vérification: Paiement phrE385tARUR8TlrEUGu bien mis à jour avec status PAID
[stripe-connect] ✅ Statut du devis wDk3yU0TvMFkOOAvxXy7 mis à jour
```

Si vous voyez ces logs, le webhook fonctionne correctement et le problème vient probablement du frontend qui ne recharge pas les données.

---

## ✅ Actions Correctives Appliquées

Les modifications suivantes ont été apportées pour résoudre le problème :

1. **Amélioration de la recherche de paiement** :
   - Recherche alternative par `devisId` si le `sessionId` ne correspond pas exactement
   - Plus de logs pour déboguer

2. **Vérification renforcée** :
   - Vérification que la mise à jour a bien été effectuée en récupérant directement le document
   - Logs détaillés des données mises à jour

3. **Polling plus fréquent** :
   - Le frontend recharge les paiements toutes les 10 secondes (au lieu de 30)
   - Bouton "Actualiser" disponible pour forcer le rechargement

---

**🎯 Après avoir suivi ce guide, vous devriez pouvoir identifier la cause du problème et le résoudre.**
