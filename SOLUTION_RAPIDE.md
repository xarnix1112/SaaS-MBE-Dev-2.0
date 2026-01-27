# 🚀 Solution rapide aux erreurs de paiement

## 🔴 **Deux erreurs identifiées**

### Erreur 1 : Index Firestore manquant ❌
```
The query requires an index
```

### Erreur 2 : Compte Stripe incomplet ❌
```
In order to use Checkout, you must set an account or business name
```

---

## ✅ **SOLUTION IMMÉDIATE**

### 🔧 Étape 1 : Créer l'index Firestore (2 min)

**Clique sur ce lien** → Firebase va créer l'index automatiquement :

👉 **[CLIQUER ICI POUR CRÉER L'INDEX](https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=ClRwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3BhaWVtZW50cy9pbmRleGVzL18QARoLCgdkZXZpc0lkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg)**

1. Firebase s'ouvre
2. Clique sur **"Créer l'index"** ou **"Create index"**
3. ⏳ **Attends 2-3 minutes** que l'index soit créé
4. Tu verras un ✅ vert quand c'est terminé

---

### 🏢 Étape 2 : Configurer le nom d'entreprise Stripe (1 min)

Le compte Stripe que tu as connecté (`acct_1SouIJA0EsyRRiXS`) **n'a pas de nom d'entreprise**.

#### **Option A : Configurer le compte existant** (recommandé)

1. **Déconnecte-toi** de ton compte Stripe principal (plateforme)
2. **Connecte-toi** au compte Stripe que tu as connecté via OAuth
   - Si tu ne sais pas lequel, c'est celui qui se termine par `...SouIJA0EsyRRiXS`
3. Va sur : **https://dashboard.stripe.com/settings/account**
4. Remplis le champ **"Business name"** (ou **"Nom de l'entreprise"**)
   - Exemple : `MBE-SDV`, `Mon Entreprise`, etc.
5. **Sauvegarde**

#### **Option B : Reconnecter un autre compte Stripe**

Si tu veux utiliser un autre compte :

1. Va dans **Paramètres** → **Paiements**
2. Clique sur **"Déconnecter"** (si affiché)
3. Clique sur **"Connecter mon compte Stripe"**
4. Choisis un compte Stripe qui a déjà un nom d'entreprise configuré

---

## 🧪 **Test après les corrections**

1. ✅ Attends que l'index Firestore soit créé (2-3 min)
2. ✅ Configure le nom d'entreprise Stripe
3. 🔄 **Recharge la page** du devis
4. Va dans l'onglet **"Paiements"**
5. Clique sur **"+ Créer un paiement"**
6. Remplis le formulaire et clique sur **"Créer le lien de paiement"**

### ✅ **Résultat attendu**

Tu seras redirigé vers **Stripe Checkout** avec le formulaire de paiement ! 🎉

---

## 🆘 **Si ça ne fonctionne toujours pas**

### Vérifier l'index Firestore

1. Va sur : https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes
2. Vérifie que l'index pour la collection `paiements` existe et est **"Enabled"** (✅ vert)

### Vérifier le nom d'entreprise Stripe

1. Va sur le Dashboard Stripe du compte connecté
2. Paramètres → Account
3. Vérifie que **"Business name"** est bien rempli

### Logs du terminal

Redémarre le serveur et regarde les logs :

```bash
# Terminal : Ctrl+C puis relance
bash run-dev-mac.sh
```

Tu devrais voir :
```
[stripe-connect] ✅ STRIPE_SECRET_KEY chargée
[stripe-connect] ✅ STRIPE_CONNECT_CLIENT_ID chargée
```

---

## 📊 **État actuel (d'après les logs)**

✅ Stripe Connect configuré  
✅ Client trouvé : `dxHUjMCaJ0A7vFBiGNFR`  
✅ Compte Stripe trouvé : `acct_1SouIJA0EsyRRiXS`  
❌ Index Firestore manquant → **À créer**  
❌ Nom d'entreprise Stripe manquant → **À configurer**

---

## 🎯 **Temps estimé total : 3-5 minutes**

1. Créer l'index (1 clic + 2-3 min d'attente)
2. Configurer le nom d'entreprise (1 min)
3. Tester (1 min)

**Après ces 2 étapes, tout devrait fonctionner parfaitement !** ✅

