# 🔧 Corriger l'Erreur 404 après Connexion Stripe

## 🎯 Problème

Après avoir suivi les étapes de connexion Stripe et validé l'autorisation, vous êtes redirigé vers une page 404 avec l'erreur :

```
Route non trouvée: GET /settings?connected=true&stripe=true
```

**Cause :** Le callback Stripe redirige vers le backend (`api.mbe-sdv.fr/settings`) au lieu du frontend (`www.mbe-sdv.fr/settings`).

---

## ✅ Solution

### Étape 1 : Configurer `FRONTEND_URL` dans Railway (Backend)

1. **Aller sur Railway** : https://railway.app
2. **Sélectionner votre projet** (backend)
3. **Aller dans Variables** (ou "Environment Variables")
4. **Vérifier si `FRONTEND_URL` existe déjà** :
   - Si oui, vérifier qu'elle pointe vers `https://www.mbe-sdv.fr`
   - Si non, **ajouter la variable suivante** :

     ```
     FRONTEND_URL=https://www.mbe-sdv.fr
     ```

     ⚠️ **Important :** Remplacez `www.mbe-sdv.fr` par votre vrai domaine frontend si différent.

5. **Redéployer le service** :
   - Cliquer sur "Deploy" ou "Redeploy"
   - Attendre que le déploiement soit terminé (1-2 minutes)

---

## 🧪 Tester

1. **Attendre 1-2 minutes** que Railway redéploie
2. **Recharger la page** de l'application (F5)
3. **Aller dans** : Paramètres → Paiements
4. **Cliquer sur** "Connecter mon compte Stripe"
5. **Autoriser l'accès** sur Stripe
6. **Vérifier** :
   - ✅ Vous êtes redirigé vers `https://www.mbe-sdv.fr/settings?connected=true&source=stripe`
   - ✅ Pas d'erreur 404
   - ✅ Un message de succès s'affiche : "Compte Stripe connecté avec succès"
   - ✅ Le statut Stripe affiche "Connecté"

---

## 🔍 Vérification

### Vérifier que `FRONTEND_URL` est bien configuré

1. **Dans Railway**, aller dans **Variables**
2. **Chercher** `FRONTEND_URL`
3. **Vérifier** que la valeur est `https://www.mbe-sdv.fr` (ou votre domaine frontend)

### Vérifier les logs Railway

1. **Dans Railway**, aller dans **Logs**
2. **Chercher** `[stripe-connect]`
3. **Vérifier** que vous voyez des messages comme :
   ```
   [stripe-connect] ✅ Compte Stripe connecté pour saasAccountId ...
   ```

---

## 🐛 Dépannage

### L'erreur 404 persiste après avoir ajouté `FRONTEND_URL`

1. **Vérifier que Railway a bien redéployé** :
   - Aller dans "Deployments"
   - Vérifier que le dernier déploiement est récent (< 5 min)
   - Si non, déclencher un redéploiement manuel

2. **Vérifier la valeur de `FRONTEND_URL`** :
   - Doit être `https://www.mbe-sdv.fr` (avec `https://`)
   - Ne doit pas avoir de trailing slash (`/`)

3. **Vérifier les logs Railway** :
   - Aller dans "Logs"
   - Chercher les erreurs récentes
   - Vérifier que `FRONTEND_URL` est bien chargé

### Vous êtes redirigé vers le mauvais domaine

⚠️ **Important :** Assurez-vous que :
- `FRONTEND_URL` pointe vers le **frontend** (`www.mbe-sdv.fr`)
- `APP_URL` pointe vers le **backend** (`api.mbe-sdv.fr`)

**Résumé :**
- `FRONTEND_URL=https://www.mbe-sdv.fr` → Pour les redirections après OAuth
- `APP_URL=https://api.mbe-sdv.fr` → Pour les callbacks OAuth (redirect_uri)

---

## 📋 Checklist

- [ ] Variable `FRONTEND_URL=https://www.mbe-sdv.fr` ajoutée dans Railway
- [ ] Railway redéployé avec succès
- [ ] Test effectué : connexion Stripe fonctionne
- [ ] Pas d'erreur 404 après autorisation
- [ ] Redirection vers `https://www.mbe-sdv.fr/settings?connected=true&source=stripe`
- [ ] Message de succès affiché : "Compte Stripe connecté avec succès"
- [ ] Statut Stripe affiche "Connecté"

---

## 📝 Notes Importantes

- ⚠️ **Différence entre `APP_URL` et `FRONTEND_URL`** :
  - `APP_URL` : URL du backend (utilisée pour les callbacks OAuth)
  - `FRONTEND_URL` : URL du frontend (utilisée pour les redirections après OAuth)

- ⚠️ **HTTPS obligatoire** : En production, utilisez toujours `https://` (pas `http://`)

- ⚠️ **Pas de trailing slash** : Ne pas mettre de `/` à la fin de l'URL

---

**Date de mise à jour :** 2 février 2026  
**Domaine frontend :** `www.mbe-sdv.fr`  
**Domaine backend :** `api.mbe-sdv.fr`
