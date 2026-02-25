# Mode dry-run — Vérification avant déploiement

**Objectif** : Vérifier que la configuration est prête pour la production **sans rien déployer**.

---

## 1. Comment ça fonctionne ?

Le script `front end/scripts/verify-production-config.mjs` exécute une série de contrôles et affiche un rapport ✅ / ⚠️ / ❌ :

- **✅** : OK
- **⚠️** : Avertissement (à vérifier, mais non bloquant)
- **❌** : Erreur bloquante — le script quitte avec code 1

Aucune donnée n’est modifiée. Aucun déploiement n’est effectué.

---

## 2. Faut-il le configurer ?

**Non, par défaut.** Le script fonctionne sans configuration. Il charge automatiquement les fichiers suivants s’ils existent :

- `.env`
- `.env.local`
- `.env.production.local`

---

## 3. Étapes précises pour l’utiliser

### Cas 1 : Vérification rapide (avant merge, en local)

Depuis la racine du projet (`App MBE SDV/SaaS MBE SDV`) :

```bash
cd ~/Desktop/"App MBE SDV/SaaS MBE SDV/front end"
npm run dry-run
```

**Résultat typique** : des ⚠️ pour variables absentes (normal en local). Vérifier qu’il n’y a **aucun ❌**.

### Cas 2 : Test avec variables « production-like »

1. Créer `front end/.env.production.local` (ignoré par git) avec des valeurs de **test** :

   ```
   APP_URL=https://api.mbe-sdv.fr
   FRONTEND_URL=https://mbe-sdv.fr
   NODE_ENV=production
   ```

2. Ne jamais mettre de vrais secrets (sk_live_, clés Resend, etc.) dans un fichier local.

3. Lancer :
   ```bash
   cd ~/Desktop/"App MBE SDV/SaaS MBE SDV/front end"
   npm run dry-run:prod
   ```

### Cas 3 : Vérification avant merge (recommandé)

```bash
cd ~/Desktop/"App MBE SDV/SaaS MBE SDV/front end"
NODE_ENV=production npm run dry-run
```

Corriger toute erreur ❌ avant de continuer.

### Cas 4 : Dans un pipeline CI/CD

```bash
cd "front end" && NODE_ENV=production node scripts/verify-production-config.mjs
```

---

## 4. Ce que vérifie le script

| Vérification                | Description                                                                 |
|-----------------------------|-----------------------------------------------------------------------------|
| Fichiers Firebase           | firebase-credentials-prod.json ou firebase-credentials.json               |
| Variables env               | NODE_ENV, FIREBASE_CREDENTIALS_BASE64, APP_URL, FRONTEND_URL               |
| Stripe                      | STRIPE_SECRET_KEY en mode live (sk_live_) quand NODE_ENV=production         |
| Resend                      | RESEND_API_KEY pour les emails                                             |
| Fichiers critiques du build | package.json, vite.config.ts, src/main.tsx, server/ai-proxy.js, server/payment-provider.js |

---

## 5. Codes de sortie

| Code | Signification                                      |
|------|----------------------------------------------------|
| **0** | OK ou avertissements uniquement — déploiement autorisé |
| **1** | Au moins une erreur bloquante — corriger avant de déployer |

---

## 6. Quand l’exécuter ?

- Avant chaque merge staging → master
- Après modification des variables d’environnement
- Avant un déploiement manuel

---

## 7. Récapitulatif des commandes

| Commande                | Usage                               |
|-------------------------|-------------------------------------|
| `npm run dry-run`       | Vérification rapide (charge .env*)  |
| `npm run dry-run:prod`  | Simulation NODE_ENV=production      |

Voir aussi **DEPLOIEMENT_PRODUCTION.md** pour la checklist complète et la procédure de déploiement.
