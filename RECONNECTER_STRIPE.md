# 🔄 Reconnecter un compte Stripe configuré

## 🔴 Problème actuel

Le compte Stripe connecté (`acct_1SouIJA0EsyRRiXS`) n'a pas de nom d'entreprise et n'est pas complètement configuré :

```
❌ Business name: NON DÉFINI
❌ Charges enabled: NON
❌ Payouts enabled: NON
❌ Email: NON DÉFINI
```

---

## ✅ SOLUTION : Reconnecter ton compte principal (1 minute)

### Étape 1 : Déconnecter le compte actuel

1. **Ouvre ton application** : http://localhost:8080
2. Va dans **Paramètres** (icône ⚙️ en haut à droite)
3. Clique sur l'onglet **"Paiements"**
4. Tu devrais voir :
   ```
   ✅ Connecté
   Compte Stripe : acct_1SouIJA0EsyRRiXS
   ```
5. Cherche un bouton **"Déconnecter"** ou **"Reconnecter"**
6. Clique dessus

---

### Étape 2 : Connecter ton compte principal

1. Clique sur **"Connecter mon compte Stripe"**
2. Tu seras redirigé vers Stripe OAuth
3. **IMPORTANT** : Choisis ton **compte Stripe principal**
   - C'est celui que tu utilises pour tes clés API
   - Il devrait déjà avoir toutes les informations configurées
   - Il a probablement un nom d'entreprise comme "MBE-SDV" ou similaire
4. Autorise l'accès
5. Tu seras redirigé vers l'app avec "✅ Connecté"

---

### Étape 3 : Vérifier

1. Va dans un devis
2. Clique sur l'onglet **"Paiements"**
3. Clique sur **"+ Créer un paiement"**
4. Remplis :
   - Montant : `150.00`
   - Type : `Paiement principal`
   - Description : `Test`
5. Clique sur **"Créer le lien de paiement"**

**✅ Tu devrais être redirigé vers Stripe Checkout !** 🎉

---

## 🔍 Vérifier le nouveau compte

Après avoir reconnecté, lance cette commande pour vérifier :

```bash
cd "front end"
node scripts/check-stripe-account.mjs
```

Tu devrais voir :
```
✅ Le nom d'entreprise est configuré !
   Nom: "Ton Nom d'Entreprise"

🎉 Ce compte est prêt à utiliser Stripe Checkout !
```

---

## 🆘 Si tu n'as pas de bouton "Déconnecter"

Si tu ne vois pas de bouton pour déconnecter dans l'interface, tu peux déconnecter manuellement via Firestore :

1. Va sur : https://console.firebase.google.com/project/sdv-automation-mbe/firestore/data
2. Ouvre la collection **`clients`**
3. Trouve le document **`dxHUjMCaJ0A7vFBiGNFR`**
4. Modifie les champs :
   - `stripeAccountId` : **supprime la valeur** (laisse vide ou supprime le champ)
   - `stripeConnected` : change en **`false`**
5. Sauvegarde
6. Retourne dans l'app → **Paramètres** → **Paiements**
7. Clique sur **"Connecter mon compte Stripe"**

---

## 📊 Récapitulatif

| Étape | Action | Temps |
|-------|--------|-------|
| 1️⃣ | Déconnecter le compte actuel | 30 sec |
| 2️⃣ | Reconnecter ton compte principal | 30 sec |
| 3️⃣ | Tester la création de paiement | 30 sec |

**⏱️ Total : ~2 minutes maximum**

---

## 💡 Pourquoi ça ne marchait pas avant ?

Le compte `acct_1SouIJA0EsyRRiXS` est un **nouveau compte Stripe** créé lors de l'OAuth, mais il n'est **pas configuré**.

Pour utiliser Stripe Checkout, un compte doit avoir :
- ✅ Un nom d'entreprise (Business name)
- ✅ Les paiements activés (Charges enabled)
- ✅ Des informations de base (email, etc.)

Ton compte principal a déjà tout ça, donc il suffit de l'utiliser à la place ! 🎯

