# 🔧 Corriger l'Erreur Stripe Connect "Invalid redirect URI"

## 🎯 Problème

L'erreur suivante apparaît lors du clic sur "Connecter mon compte Stripe" :

```
Invalid request: Invalid redirect URI 'http://localhost:8080/stripe/callback'. 
Ensure this uri exactly matches one of the uris specified in your application settings
```

**Cause :** La variable d'environnement `APP_URL` n'est pas configurée en production, donc le code utilise la valeur par défaut `http://localhost:8080`.

---

## ✅ Solution en 2 Étapes

### Étape 1 : Configurer `APP_URL` dans Railway (Backend)

1. **Aller sur Railway** : https://railway.app
2. **Sélectionner votre projet** (backend)
3. **Aller dans Variables** (ou "Environment Variables")
4. **Ajouter la variable suivante** :

   ```
   APP_URL=https://api.mbe-sdv.fr
   ```

   ⚠️ **Important :** Remplacez `api.mbe-sdv.fr` par votre vrai domaine backend si différent.

5. **Redéployer le service** :
   - Cliquer sur "Deploy" ou "Redeploy"
   - Attendre que le déploiement soit terminé

---

### Étape 2 : Ajouter l'URL dans Stripe Connect

1. **Aller sur Stripe Dashboard** : https://dashboard.stripe.com
2. **Basculer en mode "Live"** (en haut à droite)
3. **Aller dans** : **Connect → Settings**
4. **Scroller jusqu'à "OAuth settings"**
5. **Dans "Redirect URIs"**, ajouter :

   ```
   https://api.mbe-sdv.fr/stripe/callback
   ```

   ⚠️ **Important :** 
   - Utilisez `https://` (pas `http://`)
   - Remplacez `api.mbe-sdv.fr` par votre vrai domaine backend
   - L'URL doit être exactement : `https://api.mbe-sdv.fr/stripe/callback` (avec le `/stripe/callback` à la fin)

6. **Cliquer sur "Add"** ou "Save"

---

### Étape 3 : Configurer `FRONTEND_URL` dans Railway (Backend)

⚠️ **IMPORTANT :** Cette variable est nécessaire pour que la redirection fonctionne correctement.

1. **Dans Railway**, toujours dans **Variables**
2. **Ajouter la variable suivante** :

   ```
   FRONTEND_URL=https://www.mbe-sdv.fr
   ```

   ⚠️ **Important :** Remplacez `www.mbe-sdv.fr` par votre vrai domaine frontend si différent.

3. **Redéployer le service** :
   - Cliquer sur "Deploy" ou "Redeploy"
   - Attendre que le déploiement soit terminé

---

## 🧪 Tester

1. **Attendre 1-2 minutes** que Railway redéploie
2. **Recharger la page** de l'application (F5)
3. **Aller dans** : Paramètres → Paiements
4. **Cliquer sur** "Connecter mon compte Stripe"
5. **Vérifier** :
   - ✅ Vous êtes redirigé vers Stripe (pas d'erreur 400)
   - ✅ Vous pouvez autoriser l'accès
   - ✅ Après autorisation, vous êtes redirigé vers `https://www.mbe-sdv.fr/settings?connected=true&source=stripe`
   - ✅ Un message de succès s'affiche : "Compte Stripe connecté avec succès"

---

## 🔍 Vérification

### Vérifier que `APP_URL` est bien configuré

1. **Dans Railway**, aller dans **Variables**
2. **Chercher** `APP_URL`
3. **Vérifier** que la valeur est `https://api.mbe-sdv.fr` (ou votre domaine)

### Vérifier les Redirect URIs dans Stripe

1. **Stripe Dashboard** → **Connect → Settings → OAuth settings**
2. **Vérifier** que vous voyez :
   - `http://localhost:8080/stripe/callback` (pour le dev local)
   - `https://api.mbe-sdv.fr/stripe/callback` (pour la production) ✅

---

## 🐛 Dépannage

### L'erreur persiste après avoir ajouté `APP_URL`

1. **Vérifier que Railway a bien redéployé** :
   - Aller dans "Deployments"
   - Vérifier que le dernier déploiement est récent (< 5 min)
   - Si non, déclencher un redéploiement manuel

2. **Vérifier les logs Railway** :
   - Aller dans "Logs"
   - Chercher `[stripe-connect]`
   - Vérifier que `APP_URL` est bien chargé : `✅ APP_URL chargée: https://api.mbe-sdv.fr`

3. **Vider le cache du navigateur** :
   - Ctrl+Shift+Delete
   - Cocher "Images et fichiers en cache"
   - Supprimer

### L'URL dans Stripe ne correspond pas

⚠️ **Important :** L'URL dans Stripe doit être **exactement** la même que celle générée par le code.

**Vérifier l'URL générée :**
1. Ouvrir l'inspecteur web (F12)
2. Aller dans l'onglet Network
3. Cliquer sur "Connecter mon compte Stripe"
4. Regarder la requête vers `/api/stripe/connect`
5. Dans la réponse, voir l'URL générée
6. Vérifier que cette URL correspond exactement à celle dans Stripe

**Format attendu :**
```
https://connect.stripe.com/oauth/v2/authorize?response_type=code&client_id=ca_...&scope=read_write&redirect_uri=https%3A%2F%2Fapi.mbe-sdv.fr%2Fstripe%2Fcallback&state=...
```

---

## 📋 Checklist

- [ ] Variable `APP_URL=https://api.mbe-sdv.fr` ajoutée dans Railway
- [ ] Variable `FRONTEND_URL=https://www.mbe-sdv.fr` ajoutée dans Railway
- [ ] Railway redéployé avec succès
- [ ] URL `https://api.mbe-sdv.fr/stripe/callback` ajoutée dans Stripe Connect (mode Live)
- [ ] Test effectué : clic sur "Connecter mon compte Stripe" fonctionne
- [ ] Pas d'erreur 400 dans la console
- [ ] Redirection vers Stripe OAuth fonctionne
- [ ] Après autorisation, retour vers `https://www.mbe-sdv.fr/settings?connected=true&source=stripe`
- [ ] Message de succès affiché : "Compte Stripe connecté avec succès"

---

## 📝 Notes Importantes

- ⚠️ **Mode Live vs Test** : Assurez-vous d'être en mode **"Live"** dans Stripe Dashboard (pas "Test")
- ⚠️ **HTTPS obligatoire** : En production, utilisez toujours `https://` (pas `http://`)
- ⚠️ **Domaine exact** : L'URL doit correspondre exactement (majuscules/minuscules, trailing slash, etc.)

---

**Date de mise à jour :** 2 février 2026  
**Domaine de production :** `mbe-sdv.fr`  
**Backend API :** `api.mbe-sdv.fr`
