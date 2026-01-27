# 🔄 Comment redémarrer le serveur

## ✅ Les routes Stripe Connect ont été ajoutées !

Les routes ont été ajoutées dans `server/ai-proxy.js`.

## 🔄 Pour redémarrer le serveur

### Méthode 1 : Arrêter et redémarrer

1. Dans le terminal où tourne `npm run dev:all`, appuie sur **Ctrl+C**
2. Relance : `bash run-dev-mac.sh`

### Méthode 2 : Utiliser le script existant

```bash
cd '/Users/clembrlt/Desktop/Devis automation MBE'
bash run-dev-mac.sh
```

## ✅ Vérification

Après le redémarrage, tu devrais voir dans les logs :

```
[AI Proxy] ✅ Routes Stripe Connect ajoutées
```

Et dans la liste des routes attendues :

```
POST /api/stripe/connect
GET /stripe/callback
GET /api/stripe/status
POST /api/stripe/disconnect
POST /api/devis/:id/paiement
GET /api/devis/:id/paiements
POST /webhooks/stripe
```

## 🎮 Test

1. Va dans **Paramètres** → **Paiements**
2. Clique sur **Connecter mon compte Stripe**
3. ✅ Tu ne devrais plus avoir l'erreur "Route non trouvée"

## 📝 Routes ajoutées

- `POST /api/stripe/connect` - Génération URL OAuth
- `GET /stripe/callback` - Callback OAuth
- `GET /api/stripe/status` - Statut de connexion
- `POST /api/stripe/disconnect` - Déconnexion
- `POST /api/devis/:id/paiement` - Création de paiement
- `GET /api/devis/:id/paiements` - Liste des paiements
- `POST /webhooks/stripe` - Webhook Stripe Connect

Toutes ces routes sont maintenant dans `server/ai-proxy.js` qui est ton serveur actif (port 5174).

