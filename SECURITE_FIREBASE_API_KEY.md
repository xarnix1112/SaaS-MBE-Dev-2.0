# 🔒 Sécurité - Clé API Firebase

## ⚠️ Situation actuelle

Google Cloud Platform a détecté que votre clé API Firebase était exposée publiquement sur GitHub. Bien que ce soit **normal** pour Firebase côté client, il est important de sécuriser cette clé.

## 📋 Actions à prendre

### 1. ✅ Code source corrigé

La clé API a été retirée du code source. Le fichier `front end/src/lib/firebase.ts` utilise maintenant **uniquement** les variables d'environnement définies dans `front end/.env.local` (qui n'est pas commité).

### 2. 🔐 Restreindre la clé API dans Google Cloud Console

**ÉTAPES IMPORTANTES :**

1. **Aller dans Google Cloud Console :**
   - https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe

2. **Trouver la clé API :** `AIzaSyDfIvWIWpWGVcPHIxVqUpoxQzrHHr6Yjv0`

3. **Cliquer sur la clé pour l'éditer**

4. **Ajouter des restrictions :**
   
   **a) Restrictions d'application :**
   - Sélectionner "Applications Web"
   - Ajouter les domaines autorisés :
     - `localhost` (pour le développement)
     - Votre domaine de production (ex: `mbe-sdv.fr`, `*.mbe-sdv.fr`)
     - Si vous utilisez Railway/Vercel : ajouter votre domaine de déploiement
   
   **b) Restrictions d'API :**
   - Sélectionner "Restreindre la clé"
   - Cocher uniquement les APIs nécessaires :
     - ✅ Firebase Installations API
     - ✅ Firebase Authentication API
     - ✅ Cloud Firestore API
     - ✅ Firebase Cloud Messaging API (si utilisé)
     - ✅ Firebase Remote Config API (si utilisé)
   
   **c) Restrictions IP (optionnel mais recommandé pour la production) :**
   - Si vous avez une IP fixe pour votre serveur backend, vous pouvez la restreindre
   - ⚠️ Ne pas restreindre pour le frontend (les utilisateurs ont des IPs différentes)

5. **Sauvegarder les restrictions**

### 3. 🔄 Alternative : Régénérer la clé API (recommandé)

Si vous voulez être encore plus sécurisé :

1. **Créer une nouvelle clé API :**
   - Dans Google Cloud Console > APIs & Services > Credentials
   - Cliquer sur "Créer des identifiants" > "Clé API"
   - Configurer les restrictions immédiatement

2. **Mettre à jour `.env.local` :**
   ```bash
   VITE_FIREBASE_API_KEY=votre_nouvelle_cle_api
   ```

3. **Supprimer l'ancienne clé API compromise**

### 4. ✅ Vérifier les règles Firestore

Assurez-vous que vos règles Firestore sont bien configurées pour protéger vos données :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Exemple : seulement les utilisateurs authentifiés peuvent lire/écrire
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 📝 Notes importantes

### Pourquoi la clé API Firebase peut être publique ?

- Firebase est conçu pour fonctionner côté client (navigateur)
- La clé API Firebase est **publique par nature** - elle est visible dans le code JavaScript
- La sécurité vient des **règles Firestore** et des **restrictions de la clé API**, pas de sa confidentialité

### Pourquoi retirer la clé du code source alors ?

1. **Meilleures pratiques** : Ne pas exposer les identifiants dans le code source public
2. **Flexibilité** : Permet d'utiliser différentes clés pour dev/staging/production
3. **Sécurité** : Évite l'utilisation abusive si quelqu'un trouve votre repo
4. **Conformité** : Répond aux recommandations de Google Cloud Platform

### La clé API est-elle vraiment compromise ?

**Non, pas nécessairement.** La clé API Firebase est conçue pour être publique. Cependant :
- Si vous n'avez pas de restrictions, quelqu'un pourrait l'utiliser depuis n'importe quel domaine
- Les restrictions de domaine empêchent l'utilisation depuis d'autres sites
- Les restrictions d'API limitent ce qui peut être fait avec la clé

## ✅ Checklist de sécurité

- [x] Clé API retirée du code source
- [ ] Restrictions de domaine configurées dans Google Cloud Console
- [ ] Restrictions d'API configurées (seulement Firebase APIs nécessaires)
- [ ] Règles Firestore vérifiées et sécurisées
- [ ] Variables d'environnement configurées dans `.env.local`
- [ ] (Optionnel) Nouvelle clé API créée et ancienne supprimée

## 🔗 Liens utiles

- **Google Cloud Console - Credentials :** https://console.cloud.google.com/apis/credentials?project=sdv-automation-mbe
- **Firebase Console :** https://console.firebase.google.com/project/sdv-automation-mbe
- **Documentation Firebase Security :** https://firebase.google.com/docs/rules
