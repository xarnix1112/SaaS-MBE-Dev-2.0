# 🔍 Guide de débogage des paiements

## ✅ **PROBLÈMES IDENTIFIÉS ET SOLUTIONS**

### 🔴 Erreur 1 : Index Firestore manquant

**Clique sur ce lien pour créer l'index** (2-3 minutes) :
👉 https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=ClRwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3BhaWVtZW50cy9pbmRleGVzL18QARoLCgdkZXZpc0lkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg

### 🔴 Erreur 2 : Nom d'entreprise Stripe manquant

Va sur : https://dashboard.stripe.com/settings/account
Remplis le champ **"Business name"** et sauvegarde.

**Voir `SOLUTION_RAPIDE.md` pour le guide complet.**

---

## 🔄 Redémarre le serveur avec les logs détaillés

J'ai ajouté des logs détaillés pour identifier le problème exact.

### 1. Redémarrer le serveur

```bash
# Dans le terminal, Ctrl+C
# Puis relance
bash run-dev-mac.sh
```

### 2. Tester et copier les logs

#### Test 1 : Ouvrir l'onglet Paiements

1. Va dans un devis
2. Clique sur l'onglet **Paiements**
3. **Copie les logs** du terminal qui commencent par `[stripe-connect]`

Tu devrais voir :
```
[stripe-connect] 📥 Récupération des paiements demandée
[stripe-connect] Devis ID: gs_dd05289b
[stripe-connect] ✅ Paiements trouvés: 0
```

Ou une erreur comme :
```
[stripe-connect] ❌ Erreur récupération paiements: ...
```

#### Test 2 : Créer un paiement

1. Clique sur **+ Créer un paiement**
2. Remplis :
   - Montant : `150.00`
   - Type : `Paiement principal`
3. Clique sur **Créer le lien de paiement**
4. **Copie les logs** du terminal

Tu devrais voir :
```
[stripe-connect] 📥 Création de paiement demandée
[stripe-connect] Paramètres reçus: { devisId: '...', amount: 150, type: 'PRINCIPAL' }
[stripe-connect] Recherche du devis: gs_dd05289b
[stripe-connect] ✅ Devis trouvé: { id: '...', reference: '...' }
[stripe-connect] Client SaaS initial: dxHUjMCaJ0A7vFBiGNFR
[stripe-connect] Récupération du client: dxHUjMCaJ0A7vFBiGNFR
[stripe-connect] ✅ Client récupéré: { id: '...', name: '...', stripeConnected: true }
[stripe-connect] ✅ Compte Stripe trouvé: acct_...
```

Ou une erreur spécifique à une étape.

---

## 🔍 Erreurs possibles et solutions

### Erreur 1 : "Client dxHUjMCaJ0A7vFBiGNFR non trouvé"

**Cause** : Le client de test n'existe pas dans Firestore

**Solution** :
```bash
cd "front end"
npm run stripe:init
```

Cela va créer le client de test.

### Erreur 2 : "Aucun client avec Stripe connecté"

**Cause** : Tu n'as pas encore connecté ton compte Stripe

**Solution** :
1. Va dans **Paramètres** → **Paiements**
2. Clique sur **Connecter mon compte Stripe**
3. Autorise l'accès
4. Retente de créer un paiement

### Erreur 3 : "Ce client n'a pas connecté son compte Stripe"

**Cause** : Le client existe mais n'a pas de `stripeAccountId`

**Solution** :
Même que l'erreur 2 : va connecter ton compte Stripe dans les paramètres.

### Erreur 4 : "Devis gs_dd05289b non trouvé"

**Cause** : Le devis n'existe pas dans la collection `quotes`

**Solution** :
Vérifie que le devis existe bien :
```bash
# Dans la console Firebase
# Firestore → quotes → cherche l'ID
```

### Erreur 5 : "Firestore non initialisé"

**Cause** : Problème avec Firebase Admin

**Solution** :
Vérifie que `firebase-credentials.json` existe dans `front end/`

---

## 🧪 Test manuel dans Firestore

### Vérifier le client

1. Ouvre la [Console Firebase](https://console.firebase.google.com)
2. Va dans **Firestore Database**
3. Collection `clients`
4. Cherche le document `dxHUjMCaJ0A7vFBiGNFR`
5. Vérifie qu'il a :
   - `stripeConnected: true`
   - `stripeAccountId: "acct_..."`

Si ce n'est pas le cas, va dans **Paramètres → Paiements** et connecte ton compte Stripe.

### Vérifier le devis

1. Collection `quotes`
2. Cherche ton devis (ex: `gs_dd05289b`)
3. Vérifie qu'il existe

---

## 📊 Logs à envoyer

Si tu as toujours des erreurs après avoir vérifié, envoie-moi les logs qui commencent par :

```
[stripe-connect] 📥 Création de paiement demandée
...
[stripe-connect] ❌ ...
```

Ou :

```
[stripe-connect] 📥 Récupération des paiements demandée
...
[stripe-connect] ❌ ...
```

---

## ✅ Si tout fonctionne

Tu devrais voir :

```
[stripe-connect] 📥 Création de paiement demandée
[stripe-connect] Paramètres reçus: { devisId: 'gs_dd05289b', amount: 150, type: 'PRINCIPAL' }
[stripe-connect] Recherche du devis: gs_dd05289b
[stripe-connect] ✅ Devis trouvé: { id: 'gs_dd05289b', reference: 'XXX' }
[stripe-connect] Client SaaS initial: dxHUjMCaJ0A7vFBiGNFR
[stripe-connect] Récupération du client: dxHUjMCaJ0A7vFBiGNFR
[stripe-connect] ✅ Client récupéré: { id: 'dxHUjMCaJ0A7vFBiGNFR', name: 'Client Test SaaS', stripeConnected: true }
[stripe-connect] ✅ Compte Stripe trouvé: acct_TmTEUrwPIKV1d7xbQMQqE7xNKSOzICX2
[stripe-connect] ✅ Checkout Session créée: { ... }
```

Et tu seras redirigé vers Stripe Checkout ! 🎉

---

**Redémarre le serveur et teste avec les logs !**

