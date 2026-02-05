# 🔧 Guide de Dépannage Production

**Résolution de tous les problèmes courants**

---

## 📋 Table des Matières

- [Problèmes Firebase](#problèmes-firebase)
- [Problèmes Stripe](#problèmes-stripe)
- [Problèmes OAuth Google](#problèmes-oauth-google)
- [Problèmes Railway (Backend)](#problèmes-railway-backend)
- [Problèmes Vercel (Frontend)](#problèmes-vercel-frontend)
- [Problèmes DNS et Domaine](#problèmes-dns-et-domaine)
- [Problèmes de Connexion](#problèmes-de-connexion)
- [Problèmes de Paiement](#problèmes-de-paiement)
- [Problèmes de Notifications](#problèmes-de-notifications)

---

## Problèmes Firebase

### ❌ Erreur : "Permission denied" dans Firestore

**Symptôme :**
```
Uncaught Error: Missing or insufficient permissions
```

**Cause :** Les règles Firestore sont trop restrictives ou n'ont pas été déployées.

**Solution :**

1. **Vérifier que les règles sont déployées :**
   ```bash
   cd "C:\Dev\SaaS MBE SDV Prod"
   firebase use saas-mbe-sdv-production
   firebase deploy --only firestore:rules
   ```

2. **Vérifier dans la console Firebase :**
   - Firestore Database → Rules
   - Les règles doivent être celles du guide (pas les règles par défaut)

3. **Si ça ne marche toujours pas, temporairement activer les règles de test :**
   ```javascript
   // TEMPORAIRE SEULEMENT !
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   - Déployer : `firebase deploy --only firestore:rules`
   - Tester l'app
   - **IMPORTANT :** Remettre les vraies règles après !

**✅ Validation :** Vous pouvez lire/écrire dans Firestore.

---

### ❌ Erreur : "Firebase app not initialized"

**Symptôme :**
```
Error: Firebase: No Firebase App '[DEFAULT]' has been created
```

**Cause :** Les variables d'environnement Firebase ne sont pas configurées.

**Solution :**

1. **Vérifier les variables Vercel :**
   - Vercel → Project → Settings → Environment Variables
   - Vérifier que TOUTES les variables `VITE_FIREBASE_*` sont présentes

2. **Vérifier les valeurs :**
   - Comparer avec firebase-credentials-prod.json
   - Pas d'espaces avant/après
   - Pas de guillemets en trop

3. **Redéployer :**
   - Vercel → Deployments → Menu `⋮` → Redeploy

**✅ Validation :** Firebase s'initialise sans erreur.

---

### ❌ Index Firestore manquant

**Symptôme :**
```
The query requires an index. You can create it here: https://console.firebase...
```

**Cause :** Un index composite n'a pas été créé.

**Solution :**

1. **Cliquer sur le lien dans l'erreur**
   - Vous arrivez directement sur la page de création d'index
   - Cliquer **"Create index"**
   - Attendre 2-3 minutes

2. **Ou créer manuellement :**
   - Console Firebase → Firestore → Indexes
   - Créer l'index selon le message d'erreur

**✅ Validation :** L'index affiche "Enabled" avec un point vert.

---

## Problèmes Stripe

### ❌ Webhook "Not yet tested"

**Symptôme :**
Dans Stripe Dashboard → Webhooks, votre endpoint affiche "Not yet tested".

**Cause :** Aucun événement n'a encore été envoyé.

**Solution :**

1. **Tester manuellement :**
   - Cliquer sur le webhook
   - Cliquer **"Send test webhook"**
   - Choisir `checkout.session.completed`
   - Cliquer **"Send test webhook"**

2. **Vérifier les logs Railway :**
   - Railway → Service → Logs
   - Chercher `[Stripe Webhook]`
   - Vous devez voir : "Webhook received"

3. **Si erreur 404 :**
   - Vérifier l'URL : `https://api.votre-domaine.com/webhooks/stripe`
   - Vérifier le DNS (partie suivante)

**✅ Validation :** Le webhook affiche "Last attempt: Successful".

---

### ❌ Paiements pas reçus dans l'app

**Symptôme :**
Le paiement Stripe fonctionne, mais le statut dans l'app ne change pas.

**Cause :** Le webhook n'est pas reçu ou traité.

**Solution :**

1. **Vérifier le webhook Stripe :**
   - Dashboard → Webhooks → Cliquer sur votre endpoint
   - Onglet "Events" → Voir les derniers événements
   - Si "Failed" → Cliquer dessus pour voir l'erreur

2. **Vérifier la signature du webhook :**
   - Railway → Settings → Variables
   - Vérifier `STRIPE_WEBHOOK_SECRET=whsec_...`
   - Comparer avec Stripe Dashboard → Webhooks → Signing secret

3. **Vérifier les logs Railway :**
   ```
   Chercher : [Stripe Webhook]
   Erreur courante : "No signatures found matching the expected signature"
   Solution : Mauvais STRIPE_WEBHOOK_SECRET
   ```

4. **Tester avec Stripe CLI (local) :**
   ```bash
   stripe listen --forward-to https://api.votre-domaine.com/webhooks/stripe
   stripe trigger checkout.session.completed
   ```

**✅ Validation :** Le statut du devis passe à "Payé" après paiement.

---

### ❌ "Account not activated"

**Symptôme :**
```
Error: Your Stripe account must be activated before you can create charges
```

**Cause :** Votre compte Stripe n'est pas encore activé.

**Solution :**

1. **Stripe Dashboard → Complete account setup**

2. **Remplir toutes les informations :**
   - Informations entreprise
   - Informations bancaires
   - Pièces d'identité (KYC)

3. **Attendre validation (24-48h)**

4. **En attendant, rester en mode Test**

**✅ Validation :** Le compte affiche "Activated" dans les settings.

---

## Problèmes OAuth Google

### ❌ "Redirect URI mismatch"

**Symptôme :**
```
Error: redirect_uri_mismatch
The redirect URI in the request: https://api.votre-domaine.com/auth/gmail/callback
does not match the ones authorized for the OAuth client.
```

**Cause :** L'URI de redirection ne correspond pas à celle configurée.

**Solution :**

1. **Google Cloud Console → APIs & Services → Credentials**

2. **Cliquer sur votre OAuth Client**

3. **Vérifier "Authorized redirect URIs" :**
   - Doit être EXACTEMENT : `https://api.votre-domaine.com/auth/gmail/callback`
   - Pas d'espace avant/après
   - Pas de `/` à la fin
   - HTTPS, pas HTTP

4. **Cliquer "SAVE"**

5. **Attendre 5 minutes** (propagation)

6. **Réessayer la connexion OAuth**

**✅ Validation :** La connexion OAuth fonctionne.

---

### ❌ "Access blocked: This app's request is invalid"

**Symptôme :**
Page Google avec ce message lors de la connexion OAuth.

**Cause :** Problème avec l'écran de consentement OAuth ou les scopes.

**Solution :**

1. **Google Cloud Console → OAuth consent screen**

2. **Vérifier :**
   - Status : "Testing" (OK pour démarrer)
   - App name : Rempli
   - User support email : Rempli
   - Authorized domains : `votre-domaine.com` ajouté

3. **Vérifier les scopes :**
   - Credentials → OAuth Client → Edit
   - Les scopes doivent être cochés dans "OAuth consent screen"

4. **Ajouter votre email en "Test users" :**
   - OAuth consent screen → Test users
   - Cliquer "+ ADD USERS"
   - Ajouter votre email

**✅ Validation :** La page de consentement Google s'affiche correctement.

---

### ❌ OAuth tokens expirent immédiatement

**Symptôme :**
La connexion OAuth fonctionne, mais après quelques minutes, l'app dit "Token expired".

**Cause :** Les refresh tokens ne sont pas stockés correctement.

**Solution :**

1. **Vérifier dans Firestore :**
   - Console Firebase → Firestore Database
   - Collection `saasAccounts`
   - Votre document → `integrations.gmail.refreshToken`
   - Doit contenir une valeur (pas `null`)

2. **Si `null`, reconnecter Gmail :**
   - Dans l'app → Paramètres → Intégrations
   - Déconnecter Gmail
   - Reconnecter Gmail
   - Vérifier à nouveau Firestore

3. **Vérifier les logs Railway :**
   ```
   Chercher : [Gmail Sync]
   Erreur courante : "invalid_grant"
   Solution : Reconnecter Gmail
   ```

**✅ Validation :** Les tokens persistent après reconnexion.

---

## Problèmes Railway (Backend)

### ❌ Deploy échoue avec "Build failed"

**Symptôme :**
```
Error: Build failed
npm ERR! code ENOENT
```

**Cause :** Mauvaise configuration du Root Directory ou dépendances manquantes.

**Solution :**

1. **Vérifier Root Directory :**
   - Railway → Service → Settings → Root Directory
   - Doit être : `front end` (avec un espace)

2. **Vérifier Build Command :**
   - Settings → Custom Build Command
   - Doit être : `npm install`

3. **Vérifier Start Command :**
   - Settings → Start Command
   - Doit être : `node server/ai-proxy.js`

4. **Forcer un redéploiement :**
   - Deployments → Menu `⋮` → Redeploy

**✅ Validation :** Le build réussit et affiche "Success".

---

### ❌ "Application failed to respond"

**Symptôme :**
```
Application failed to respond
502 Bad Gateway
```

**Cause :** Le serveur ne démarre pas correctement.

**Solution :**

1. **Vérifier les logs Railway :**
   - Service → Logs
   - Chercher des erreurs au démarrage

2. **Erreurs courantes :**

**a) Variable manquante :**
```
Error: FIREBASE_PROJECT_ID is required
Solution : Ajouter dans Settings → Variables
```

**b) Erreur Firebase credentials :**
```
Error: Error while making request: getaddrinfo ENOTFOUND
Solution : Vérifier FIREBASE_PRIVATE_KEY (copier avec les guillemets)
```

**c) Port incorrect :**
```
Error: Port 8080 is already in use
Solution : Vérifier PORT=5174 dans les variables
```

3. **Tester localement d'abord :**
   ```bash
   cd "front end"
   node server/ai-proxy.js
   # Si erreur, la corriger avant de déployer
   ```

**✅ Validation :** Le serveur affiche `[AI Proxy] ✅ Serveur démarré`.

---

### ❌ "Could not load the default credentials" (Gmail Sync / Google Sheets Sync)

**Symptôme (dans les logs Railway) :**
```
[Google Sheets Sync] Erreur lors de la synchronisation globale: Error: Could not load the default credentials.
[Gmail Sync] Erreur lors de la synchronisation globale: Error: Could not load the default credentials.
[ai-proxy] Fichier Firebase credentials non trouvé, utilisation des Application Default Credentials
```

**Cause :** Sur Railway il n’y a pas de fichier `firebase-credentials.json`. Le backend doit utiliser les **variables d’environnement** Firebase. Si elles sont absentes ou mal nommées, Firestore et les syncs Gmail/Sheets n’ont pas de credentials.

**Solution :**

1. **Dans Railway → Service → Variables**, vérifier que ces **3 variables** sont bien définies (avec les vraies valeurs du projet de production) :
   - `FIREBASE_PROJECT_ID` (ex. `saas-mbe-sdv-production`)
   - `FIREBASE_CLIENT_EMAIL` (ex. `firebase-adminsdk-xxxxx@saas-mbe-sdv-production.iam.gserviceaccount.com`)
   - `FIREBASE_PRIVATE_KEY` (clé privée complète, avec `\n` pour les retours à la ligne)

2. **Pour `FIREBASE_PRIVATE_KEY` :**
   - Ouvrir `firebase-credentials-prod.json` (ou le JSON du compte de service Firebase).
   - Copier la valeur de `"private_key"` **telle quelle** (avec les guillemets et les `\n`).
   - Coller dans Railway sans modifier. Si vous collez sans les `\n`, le code les restaure à partir de `\\n`.

3. **Redéployer** après avoir ajouté ou corrigé les variables (Deployments → ⋮ → Redeploy).

4. **Vérifier les logs** : vous devez voir par exemple  
   `[ai-proxy] ✅ Firebase credentials chargées depuis les variables d'environnement`  
   et plus d’erreur « Could not load the default credentials » pour Gmail / Google Sheets Sync.

**✅ Validation :** Les logs ne contiennent plus « Could not load the default credentials » et les syncs Gmail / Google Sheets tournent sans erreur.

---

### ❌ "DECODER routines::unsupported" ou "Getting metadata from plugin failed" (Gmail / Google Sheets Sync)

**Symptôme (dans les logs Railway) :**
```
[Gmail Sync] Erreur lors de la synchronisation globale: Error: 2 UNKNOWN: Getting metadata from plugin failed with error: error:1E08010C:DECODER routines::unsupported
[Google Sheets Sync] Erreur lors de la synchronisation globale: Error: 2 UNKNOWN: Getting metadata from plugin failed...
```

**Cause :** La variable **`FIREBASE_PRIVATE_KEY`** est mal formatée dans Railway. OpenSSL ne parvient pas à décoder la clé privée (guillemets en trop, retours à la ligne perdus, ou caractères en trop).

**Solution :**

1. **Coller la clé sur une seule ligne avec `\n` (backslash-n) :**
   - Dans `firebase-credentials-prod.json`, la clé ressemble à :
     ```json
     "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANB...\n-----END PRIVATE KEY-----\n"
     ```
   - Dans Railway → Variables → `FIREBASE_PRIVATE_KEY`, collez **toute** la valeur **sur une seule ligne** :
     - Soit en copiant depuis le JSON **sans** passer à la ligne (la chaîne doit contenir les caractères `\` et `n` pour les retours à la ligne, pas de vrais sauts de ligne).
     - Soit en remplaçant manuellement chaque retour à la ligne par `\n` (backslash puis la lettre n).

2. **À éviter :**
   - Ne pas coller la clé sur **plusieurs lignes** dans Railway : beaucoup d’environnements coupent la variable à la première ligne, ce qui tronque la clé et provoque l’erreur DECODER.
   - Ne pas ajouter d’espaces ou de sauts de ligne en trop au début ou à la fin.

3. **Exemple de format correct (une seule ligne) :**
   ```
   -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...(suite)...\n-----END PRIVATE KEY-----\n
   ```

4. **Redéployer** après avoir corrigé la variable (Deployments → ⋮ → Redeploy).

**Solution alternative (recommandée) — Utiliser Base64 :**  
Pour éviter tout problème d’échappement ou de troncature, utilisez **une seule variable** contenant le fichier credentials encodé en Base64.

1. **Générer la valeur Base64** (sur votre PC, dans le dossier où se trouve `firebase-credentials-prod.json`) :
   - **Windows (PowerShell) :**
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\firebase-credentials-prod.json"))
     ```
   - **macOS / Linux :**
     ```bash
     base64 -w0 firebase-credentials-prod.json
     ```
2. **Dans Railway → Variables :**
   - Créer **une** variable : `FIREBASE_CREDENTIALS_BASE64` = la longue chaîne Base64 générée (tout sur une ligne).
   - Vous pouvez **supprimer** les variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` et `FIREBASE_PRIVATE_KEY` si vous utilisez `FIREBASE_CREDENTIALS_BASE64` (le code utilise Base64 en priorité).
3. **Redéployer** (Deployments → ⋮ → Redeploy).

**✅ Validation :** Les logs ne contiennent plus « DECODER routines::unsupported » ni « Getting metadata from plugin failed » pour Gmail / Google Sheets Sync.

---

### ❌ "Error: Not Found" sur /api/health

**Symptôme :**
Aller sur `https://api.votre-domaine.com/api/health` affiche erreur 404.

**Cause :** Le domaine pointe vers la mauvaise URL ou le serveur ne répond pas.

**Solution :**

1. **Tester l'URL Railway directe :**
   - `https://your-app.up.railway.app/api/health`
   - Si ça marche → Problème DNS
   - Si ça ne marche pas → Problème serveur

2. **Si problème DNS :**
   - Vérifier le CNAME chez votre registrar
   - `api` → `your-app.up.railway.app`
   - Attendre 30 minutes
   - Test : `nslookup api.votre-domaine.com`

3. **Si problème serveur :**
   - Vérifier les logs Railway
   - Vérifier le Start Command
   - Redéployer

**✅ Validation :** `/api/health` retourne `{"status":"ok"}`.

---

## Problèmes Vercel (Frontend)

### ❌ Build échoue avec "Module not found"

**Symptôme :**
```
Error: Cannot find module '@/components/...'
```

**Cause :** Problème d'alias ou de dépendances.

**Solution :**

1. **Vérifier Root Directory :**
   - Vercel → Project → Settings → General
   - Root Directory : `front end`

2. **Vérifier Build Command :**
   - Settings → Build & Development Settings
   - Build Command : `npm run build`

3. **Vérifier Output Directory :**
   - Output Directory : `dist`

4. **Forcer réinstallation :**
   - Deployments → Menu `⋮` → Redeploy
   - Cocher "Use existing Build Cache" → OFF

**✅ Validation :** Le build réussit sans erreur.

---

### ❌ Page blanche après déploiement

**Symptôme :**
Le site se charge, mais affiche une page blanche (écran vide).

**Cause :** Erreur JavaScript non catchée ou variables manquantes.

**Solution :**

1. **Ouvrir la console navigateur (F12)**
   - Chercher les erreurs en rouge

2. **Erreur courante : "Firebase not initialized"**
   ```
   Solution : Vérifier les variables VITE_FIREBASE_* dans Vercel
   ```

3. **Erreur courante : "API_URL is undefined"**
   ```
   Solution : Ajouter VITE_API_URL=https://api.votre-domaine.com
   ```

4. **Vérifier les variables d'environnement :**
   - Vercel → Settings → Environment Variables
   - Toutes les variables `VITE_*` doivent être là
   - Redéployer après ajout

**✅ Validation :** La page d'accueil s'affiche correctement.

---

### ❌ "Mixed Content" (HTTP/HTTPS)

**Symptôme :**
```
Mixed Content: The page was loaded over HTTPS, but requested an insecure resource
```

**Cause :** Vous appelez une URL HTTP depuis une page HTTPS.

**Solution :**

1. **Vérifier `VITE_API_URL` :**
   - Doit être `https://` (pas `http://`)
   - Vercel → Settings → Environment Variables
   - Modifier et redéployer

2. **Vérifier dans le code :**
   - Rechercher `http://` dans le projet
   - Remplacer par `https://`

**✅ Validation :** Aucune erreur "Mixed Content" dans la console.

---

## Problèmes DNS et Domaine

### ❌ "DNS_PROBE_FINISHED_NXDOMAIN"

**Symptôme :**
Le navigateur affiche "Ce site est inaccessible" ou "DNS_PROBE_FINISHED_NXDOMAIN".

**Cause :** Le domaine ne pointe pas vers les bons serveurs.

**Solution :**

1. **Vérifier la propagation DNS :**
   - Aller sur https://dnschecker.org
   - Entrer : `votre-domaine.com`
   - Vérifier que ça pointe vers `76.76.21.21`

2. **Si pas encore propagé :**
   - Attendre 30 minutes à 24h
   - C'est normal, soyez patient

3. **Si toujours pas après 24h :**
   - Vérifier les DNS chez votre registrar
   - A Record : `@` → `76.76.21.21`
   - Sauvegarder à nouveau

4. **Vider le cache DNS local :**
   ```bash
   # Windows
   ipconfig /flushdns

   # macOS
   sudo dscacheutil -flushcache

   # Linux
   sudo systemd-resolve --flush-caches
   ```

**✅ Validation :** Le site est accessible via votre domaine.

---

### ❌ Certificat SSL invalide

**Symptôme :**
"Your connection is not private" ou "NET::ERR_CERT_AUTHORITY_INVALID".

**Cause :** Le certificat SSL n'est pas encore généré ou invalide.

**Solution :**

1. **Pour Vercel :**
   - Vercel génère le certificat automatiquement
   - Attendre 10-15 minutes après configuration DNS
   - Vérifier : Project → Settings → Domains
   - Status doit être "Valid" avec un cadenas vert

2. **Pour Railway :**
   - Railway génère aussi automatiquement
   - Settings → Networking → Public Networking
   - Custom Domain doit être "Active"

3. **Si toujours invalide après 1h :**
   - Retirer le domaine
   - Attendre 5 minutes
   - Rajouter le domaine

**✅ Validation :** Le site affiche un cadenas vert 🔒 dans la barre d'adresse.

---

### ❌ "Too many redirects"

**Symptôme :**
```
ERR_TOO_MANY_REDIRECTS
```

**Cause :** Boucle de redirection entre www et non-www.

**Solution :**

1. **Vercel → Settings → Domains**

2. **Configuration correcte :**
   - `votre-domaine.com` → Default
   - `www.votre-domaine.com` → Redirect to `votre-domaine.com`

3. **OU l'inverse :**
   - `www.votre-domaine.com` → Default
   - `votre-domaine.com` → Redirect to `www.votre-domaine.com`

4. **Sauvegarder et attendre 5 minutes**

**✅ Validation :** Le site s'ouvre sans boucle de redirection.

---

## Problèmes de Connexion

### ❌ "Email already in use"

**Symptôme :**
Impossible de créer un compte avec un email déjà utilisé.

**Cause :** L'email existe déjà dans Firebase Auth (normal).

**Solution :**

1. **Utiliser "Mot de passe oublié" :**
   - Page de connexion → "Mot de passe oublié"
   - Entrer l'email
   - Recevoir le lien de réinitialisation

2. **OU créer avec un autre email**

3. **OU supprimer l'ancien compte (admin) :**
   - Firebase Console → Authentication
   - Chercher l'email
   - Menu `⋮` → Delete user

**✅ Validation :** Vous pouvez vous connecter.

---

### ❌ "Wrong password"

**Symptôme :**
"Le mot de passe est incorrect".

**Cause :** Mauvais mot de passe ou compte créé avec Google.

**Solution :**

1. **Si compte créé avec Google :**
   - Utiliser le bouton "Se connecter avec Google"

2. **Si mot de passe oublié :**
   - "Mot de passe oublié" → Réinitialiser

3. **Vérifier Caps Lock (⇪) désactivé**

**✅ Validation :** Connexion réussie.

---

## Problèmes de Paiement

### ❌ "Payment failed"

**Symptôme :**
Le paiement Stripe échoue avec une erreur.

**Cause :** Carte refusée, compte Stripe non activé, ou problème de configuration.

**Solution :**

1. **En mode Test, utiliser les cartes de test :**
   - `4242 4242 4242 4242` → Succès
   - `4000 0000 0000 0002` → Refusée
   - `4000 0000 0000 9995` → Funds insuffisants

2. **En mode Live, vérifier :**
   - Votre compte Stripe est activé
   - Les coordonnées bancaires sont bonnes
   - Le webhook est configuré

3. **Vérifier les logs Stripe :**
   - Dashboard → Developers → Events
   - Chercher l'erreur

**✅ Validation :** Le paiement réussit.

---

### ❌ "Amount must be at least $0.50"

**Symptôme :**
```
Error: Amount must be at least $0.50 usd
```

**Cause :** Le montant du devis est trop faible.

**Cause :** Stripe impose un minimum de 0.50€.

**Solution :**

1. **Vérifier le calcul du devis :**
   - Emballage + Expédition + Assurance ≥ 0.50€

2. **Ajouter des frais minimums :**
   - Dans le code, ajouter un minimum de 1€

**✅ Validation :** Le paiement fonctionne avec des montants > 0.50€.

---

## Problèmes de Notifications

### ❌ Aucune notification reçue

**Symptôme :**
La cloche affiche "0" alors que vous avez reçu un devis.

**Cause :** Les notifications ne sont pas créées ou le polling ne fonctionne pas.

**Solution :**

1. **Vérifier dans Firestore :**
   - Console Firebase → Firestore Database
   - Collection `notifications`
   - Doit contenir des documents

2. **Si vide, vérifier les logs Railway :**
   ```
   Chercher : [Google Sheets Sync] 🔔 Notification créée
   ```

3. **Si pas de log, vérifier le polling :**
   ```
   Chercher : [Google Sheets Sync] ✅ Synchronisation
   Doit apparaître toutes les 5 minutes
   ```

4. **Forcer une synchronisation manuelle :**
   - Dans l'app → Paramètres → Intégrations
   - Google Sheets → "Resynchroniser"

**✅ Validation :** Les notifications apparaissent dans la cloche.

---

### ❌ Notifications en double

**Symptôme :**
Chaque devis génère plusieurs notifications identiques.

**Cause :** Le polling synchronise plusieurs fois ou il y a un doublon.

**Solution :**

1. **Vérifier le code :**
   - `ai-proxy.js` → `syncSheetForAccount()`
   - La notification ne doit être créée qu'une fois par nouveau devis

2. **Vérifier le champ `uniqueKey` :**
   - Firestore → Collection `quotes`
   - Chaque devis doit avoir un `uniqueKey` différent

3. **Désactiver temporairement le polling :**
   - Commenter le `setInterval(syncAllGoogleSheets)` dans `ai-proxy.js`
   - Redéployer
   - Tester manuellement

**✅ Validation :** Une seule notification par nouveau devis.

---

## 🆘 Si Rien ne Fonctionne

### Rollback d'urgence

**Frontend (Vercel) :**
1. Vercel → Deployments
2. Chercher le dernier déploiement qui fonctionnait
3. Menu `⋮` → "Promote to Production"

**Backend (Railway) :**
1. Railway → Deployments
2. Chercher le dernier déploiement qui fonctionnait
3. Cliquer sur "Rollback"

### Contacter le Support

**Vercel :** https://vercel.com/support
**Railway :** https://help.railway.app
**Stripe :** https://support.stripe.com
**Firebase :** https://firebase.google.com/support

### Ressources Communautaires

- Discord Vercel
- Discord Railway
- Stack Overflow
- GitHub Issues

---

**Version :** 1.0  
**Dernière mise à jour :** 29 janvier 2026
