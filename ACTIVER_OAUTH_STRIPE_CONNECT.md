# 🔧 Activer OAuth Standard dans Stripe Connect

## 🎯 Problème

Quand vous cliquez sur "Connecter mon compte Stripe" dans les paramètres, vous voyez cette erreur :

```json
{
  "error": {
    "message": "Standard OAuth is disabled for this Stripe Connect integration. If you own this integration, you can enable the Standard OAuth flow in the Connect Settings page in your dashboard."
  }
}
```

**Traduction :** "L'OAuth Standard est désactivé pour cette intégration Stripe Connect. Si vous possédez cette intégration, vous pouvez activer le flux OAuth Standard dans la page Connect Settings de votre tableau de bord."

**Cause :** L'option "OAuth for Standard accounts" n'est pas activée dans les paramètres Stripe Connect.

---

## ✅ Solution : Activer OAuth Standard

### 📋 Prérequis

- ✅ Un compte Stripe (gratuit)
- ✅ Accès au dashboard Stripe
- ✅ Être connecté à votre compte Stripe

---

## Étape 1 : Accéder au Dashboard Stripe

1. **Ouvrir votre navigateur** (Chrome, Firefox, Edge, etc.)

2. **Aller sur le site Stripe :**
   - Tapez dans la barre d'adresse : `https://dashboard.stripe.com`
   - Appuyez sur Entrée

3. **Se connecter** avec votre compte Stripe :
   - Entrez votre email
   - Entrez votre mot de passe
   - Cliquez sur **"Se connecter"**

4. **⚠️ IMPORTANT : Vérifier le mode**
   - En haut à droite, vous verrez un toggle (bouton à bascule)
   - **Pour tester** : Le toggle doit afficher **"Test mode"** (gris)
   - **Pour la production** : Le toggle doit afficher **"Live mode"** (vert)
   - ⚠️ **Vous devez activer OAuth dans les DEUX modes** (test ET production) !

---

## Étape 2 : Accéder aux Paramètres Stripe Connect

1. **Dans le menu de gauche** du dashboard Stripe, chercher **"Connect"**

2. **Cliquer sur "Connect"**

3. **Dans le sous-menu**, cliquer sur **"Settings"** (ou "Paramètres")

4. **Vous arrivez sur la page des paramètres Stripe Connect**

---

## Étape 3 : Activer OAuth pour les Comptes Standard

### 3.1 Trouver la Section "Integration"

1. **Sur la page "Connect Settings"**, vous verrez plusieurs sections :
   - **Branding** (en haut)
   - **Integration** (au milieu)
   - **OAuth settings** (dans Integration)
   - Et d'autres sections...

2. **Chercher la section "Integration"** (ou "Intégration")

3. **Dans cette section**, vous verrez plusieurs options

### 3.2 Activer "OAuth for Standard accounts"

1. **Dans la section "Integration"**, chercher l'option **"OAuth for Standard accounts"**

2. **Vous verrez probablement un toggle** (bouton à bascule) qui est **désactivé** (gris/rouge)

3. **Cliquer sur ce toggle** pour l'activer

4. **Le toggle doit devenir vert/actif** ✅

5. **⚠️ Si vous ne voyez pas cette option :**
   - Chercher dans la section "OAuth settings"
   - Ou chercher "Standard accounts" dans la page
   - Si vous ne trouvez toujours pas, voir la section "Dépannage" ci-dessous

### 3.3 Sauvegarder les Changements

1. **Après avoir activé le toggle**, chercher un bouton **"Save"** ou **"Enregistrer"**

2. **Cliquer sur "Save"**

3. **Attendre quelques secondes** que Stripe sauvegarde

4. **Vous devriez voir un message de confirmation** (ex: "Settings saved" ou "Paramètres enregistrés")

**✅ Validation :** Le toggle "OAuth for Standard accounts" est maintenant **actif** (vert).

---

## Étape 4 : Vérifier les Redirect URIs

> **💡 Qu'est-ce qu'un Redirect URI ?**
> 
> C'est l'URL vers laquelle Stripe redirige l'utilisateur après qu'il ait autorisé votre application. Cette URL doit correspondre exactement à celle configurée dans votre code.

### 4.1 Accéder aux OAuth Settings

1. **Toujours sur la page "Connect Settings"**, chercher la section **"OAuth settings"**

2. **Cliquer sur "OAuth settings"** ou sur le lien qui y mène

3. **Vous verrez une section "Redirect URIs"** (ou "URIs de redirection")

### 4.2 Vérifier/Ajouter le Redirect URI

1. **Dans "Redirect URIs"**, vous verrez une liste d'URLs

2. **Vérifier que cette URL est présente :**
   ```
   https://api.mbe-sdv.fr/stripe/callback
   ```
   ⚠️ **Remplacez `api.mbe-sdv.fr` par votre vrai domaine backend si différent**

3. **Si cette URL n'est PAS dans la liste :**
   - Cliquer sur **"+ Add URI"** ou **"+ Ajouter une URI"**
   - Entrer exactement : `https://api.mbe-sdv.fr/stripe/callback`
   - ⚠️ **Important :**
     - Utiliser `https://` (pas `http://`)
     - Pas d'espace avant/après
     - Respecter exactement la casse (minuscules/majuscules)
   - Cliquer sur **"Add"** ou **"Ajouter"**

4. **Sauvegarder** si nécessaire

**✅ Validation :** L'URL `https://api.mbe-sdv.fr/stripe/callback` est dans la liste des Redirect URIs.

---

## Étape 5 : Répéter pour l'Autre Mode (Test/Live)

> **⚠️ IMPORTANT :** Vous devez activer OAuth dans les DEUX modes !

### 5.1 Si Vous Êtes en Mode Test

1. **Activer OAuth** (étapes 3 et 4 ci-dessus) ✅

2. **Basculer en Mode Live :**
   - Cliquer sur le toggle en haut à droite
   - Basculer sur **"Live mode"**

3. **Répéter les étapes 3 et 4** pour activer OAuth en mode Live aussi

### 5.2 Si Vous Êtes en Mode Live

1. **Activer OAuth** (étapes 3 et 4 ci-dessus) ✅

2. **Basculer en Mode Test :**
   - Cliquer sur le toggle en haut à droite
   - Basculer sur **"Test mode"**

3. **Répéter les étapes 3 et 4** pour activer OAuth en mode Test aussi

**✅ Validation :** OAuth est activé dans les DEUX modes (Test et Live).

---

## Étape 6 : Vérifier le Client ID

> **💡 Qu'est-ce que le Client ID ?**
> 
> Le Client ID est un identifiant unique de votre intégration Stripe Connect. Il commence par `ca_` et est utilisé pour générer les URLs OAuth.

1. **Toujours sur la page "Connect Settings"**, chercher la section **"Integration"**

2. **Chercher "Client ID"** ou **"ID client"**

3. **Vous verrez un identifiant** qui commence par `ca_`
   - Exemple : `ca_SgcnSUF6cHkH3RdeDueAx0ekn5bKgVCx`

4. **⚠️ Vérifier que ce Client ID correspond** à celui dans votre variable d'environnement `STRIPE_CONNECT_CLIENT_ID` dans Railway

5. **Si les Client IDs ne correspondent pas :**
   - Copier le Client ID depuis Stripe Dashboard
   - Mettre à jour la variable `STRIPE_CONNECT_CLIENT_ID` dans Railway
   - Redéployer Railway

**✅ Validation :** Le Client ID dans Stripe correspond à celui dans Railway.

---

## Étape 7 : Tester la Connexion

### 7.1 Tester dans l'Application

1. **Aller sur votre site** : `https://www.mbe-sdv.fr` (ou votre domaine)

2. **Se connecter** à votre compte

3. **Aller dans "Paramètres"** (icône ⚙️ en haut à droite)

4. **Cliquer sur l'onglet "Paiements"**

5. **Cliquer sur "Connecter mon compte Stripe"**

6. **✅ Si tout fonctionne :**
   - Vous serez redirigé vers Stripe
   - Vous verrez une page d'autorisation Stripe
   - Après avoir autorisé, vous serez redirigé vers votre application
   - Vous verrez "Stripe connecté" dans les paramètres

7. **❌ Si vous voyez encore l'erreur :**
   - Vérifier que vous avez bien activé OAuth dans le bon mode (Test ou Live)
   - Vérifier que le Redirect URI est exactement `https://api.mbe-sdv.fr/stripe/callback`
   - Vérifier que le Client ID correspond
   - Attendre 2-3 minutes (les changements peuvent prendre du temps)

---

## 📝 Checklist de Validation

Avant de tester, vérifiez que tout est correct :

- [ ] Vous êtes connecté au dashboard Stripe
- [ ] Vous avez activé **"OAuth for Standard accounts"** dans le mode actuel (Test ou Live)
- [ ] Le Redirect URI `https://api.mbe-sdv.fr/stripe/callback` est dans la liste
- [ ] Vous avez activé OAuth dans l'**autre mode aussi** (Test ET Live)
- [ ] Le Client ID dans Stripe correspond à `STRIPE_CONNECT_CLIENT_ID` dans Railway
- [ ] Vous avez sauvegardé tous les changements dans Stripe

---

## 🆘 Dépannage

### Problème : Je ne trouve pas l'option "OAuth for Standard accounts"

**Solutions possibles :**

1. **Vérifier que vous êtes sur la bonne page :**
   - Connect → Settings (pas Developers → Settings)

2. **Chercher dans différentes sections :**
   - Section "Integration"
   - Section "OAuth settings"
   - Section "Account types" ou "Types de comptes"

3. **Vérifier votre type de compte Stripe :**
   - Certains comptes Stripe peuvent avoir des limitations
   - Vérifier que votre compte est bien un compte "Platform" (pas juste un compte standard)

4. **Contacter le support Stripe :**
   - Si vous ne trouvez toujours pas l'option, il est possible que votre compte nécessite une activation manuelle
   - Aller sur https://support.stripe.com

### Problème : L'erreur persiste après avoir activé OAuth

**Solutions possibles :**

1. **Vérifier le mode Stripe :**
   - Si vous testez en local avec des clés de test, vous devez être en "Test mode"
   - Si vous êtes en production, vous devez être en "Live mode"

2. **Vérifier le Redirect URI :**
   - Il doit être EXACTEMENT `https://api.mbe-sdv.fr/stripe/callback`
   - Pas d'espace, pas de slash à la fin, exactement comme dans votre code

3. **Vérifier le Client ID :**
   - Le Client ID dans Stripe doit correspondre à `STRIPE_CONNECT_CLIENT_ID` dans Railway
   - En mode Test et Live, les Client IDs peuvent être différents

4. **Attendre quelques minutes :**
   - Les changements dans Stripe peuvent prendre 2-5 minutes à se propager

5. **Vider le cache du navigateur :**
   - Appuyer sur `Ctrl+Shift+Delete`
   - Cocher "Cache" et "Cookies"
   - Cliquer sur "Effacer"

### Problème : Je vois "OAuth for Express accounts" mais pas "Standard"

**Explication :**
- Stripe Connect supporte deux types de comptes :
  - **Express accounts** : Comptes simplifiés (plus faciles à créer)
  - **Standard accounts** : Comptes complets (plus de contrôle)

**Solution :**
- Votre application utilise **Standard accounts**
- Si vous ne voyez que "Express", vous devez activer "Standard" aussi
- Chercher dans les paramètres une option pour activer les deux types de comptes

---

## 📚 Ressources Utiles

- **Documentation Stripe Connect** : https://stripe.com/docs/connect/standard-accounts
- **Stripe Dashboard** : https://dashboard.stripe.com/connect/settings/overview
- **Support Stripe** : https://support.stripe.com

---

## ✅ Résumé Rapide

1. **Stripe Dashboard** → **Connect** → **Settings**
2. **Section "Integration"** → Activer **"OAuth for Standard accounts"**
3. **Section "OAuth settings"** → Vérifier que `https://api.mbe-sdv.fr/stripe/callback` est dans Redirect URIs
4. **Répéter pour l'autre mode** (Test ET Live)
5. **Tester** la connexion dans votre application

**🎉 Une fois OAuth activé, vous pourrez connecter votre compte Stripe sans problème !**
