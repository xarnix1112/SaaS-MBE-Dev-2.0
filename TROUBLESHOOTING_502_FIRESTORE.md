# Dépannage : 502 sur l’API et erreurs Firestore « access control »

## Symptômes

- **502** sur les requêtes vers l’API Railway (paiements, quotes, shipping, etc.)
- Message : `Preflight response is not successful. Status code: 502`
- Erreurs Firestore : `Fetch API cannot load https://firestore.googleapis.com/... due to access control checks`
- Compte qui ne reste pas connecté automatiquement

## 1. API 502 (Railway)

### Vérifications

1. **Port cible Railway**
   - Railway → Service → Settings → Networking
   - Le **target port** doit correspondre au port utilisé par l’app (ex. 8080)
   - Ne pas définir `PORT` en variable d’environnement si Railway le fournit déjà

2. **CORS / OPTIONS**
   - CORS est géré en tout début de middleware (avant `express.json()`)
   - Les requêtes OPTIONS doivent renvoyer 200

3. **État du service**
   - Railway → Deployments → Logs
   - Vérifier que le serveur démarre correctement : `Serveur démarré sur 0.0.0.0:PORT`
   - Tester `/api/health` : `curl https://xxx.up.railway.app/api/health`

## 2. Firestore « access control checks »

### Vérifications

1. **Domaines autorisés Firebase**
   - [Firebase Console](https://console.firebase.google.com) → projet `saas-mbe-sdv-staging`
   - Authentication → Settings → Authorized domains
   - Ajouter `staging.mbe-sdv.fr` si absent

2. **Restrictions de clé API**
   - Google Cloud Console → APIs & Services → Credentials
   - Vérifier que la clé API utilisée pour Firestore :
     - inclut « Cloud Firestore API »
     - a `staging.mbe-sdv.fr` dans les restrictions HTTP referrer (si activées)

3. **Règles Firestore**
   - Firestore → Rules : règles déployées et correctes pour `users`, `saasAccounts`, etc.
   - `firebase deploy --only firestore:rules --project saas-mbe-sdv-staging`

## 3. Connexion automatique / useAuth

Si les erreurs réseau ou CORS provoquent des erreurs Firestore, le hook `useAuth` traite désormais ces erreurs comme temporaires (« unavailable ») : l’utilisateur reste connecté pour pouvoir réessayer.

## 4. OAuth Google (Gmail, Google Sheets) – « invalid_grant »

Si les logs Railway affichent `Token has been expired or revoked` pour un `saasAccountId` :

- L’utilisateur doit **reconnecter** Gmail et Google Sheets pour ce compte
- Paramètres → Connexions → se reconnecter aux services concernés
