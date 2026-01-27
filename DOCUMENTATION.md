# Intégration des devis Google Sheets (front end)

## Ce qui a été fait
- Ajout d’un connecteur CSV pour récupérer les demandes de devis depuis des feuilles Google Sheets publiées.
- Normalisation des entêtes (accents, slashs, espaces) pour mapper les colonnes du formulaire vers le modèle `Quote`.
- Agrégation multi-URL : toutes les feuilles publiées listées sont concaténées avant affichage (Nouveaux devis, Pipeline, etc.).
- Correction de l’ordre `@import` dans `src/index.css` (Google Fonts avant les directives Tailwind) pour supprimer les warnings Vite.

## Fichiers clés
- `front end/src/lib/sheetQuotes.ts` : récupération + parsing CSV, agrégation multi-URL.
- `front end/src/hooks/use-quotes.ts` : hook React Query qui alimente les pages.
- `front end/src/index.css` : ordre des directives Tailwind / import Google Fonts.

## Sources CSV par défaut (essayées dans cet ordre)
1. `https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=256365155&single=true&output=csv` (Réponses au formulaire 1)
2. `https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1137251647&single=true&output=csv` (My new form)

## Configuration optionnelle
Définir `VITE_GOOGLE_SHEETS_CSV_URL` dans `front end/.env.local` pour surcharger la liste (plusieurs URLs séparées par des virgules) :
```
VITE_GOOGLE_SHEETS_CSV_URL=url_csv_1,url_csv_2
```
Après modification de l’env, relancer le serveur dev.

## Lancement local

### Méthode automatique (recommandée)
Double-cliquez sur `start-dev.command` à la racine du projet. Cela lance automatiquement :
- ✅ Serveur backend (AI proxy + Stripe) sur le port 5174
- ✅ Serveur Vite (frontend) sur le port 8080
- ✅ Stripe CLI (`stripe listen`) pour les webhooks en développement
- ✅ Ouvre automatiquement le navigateur sur http://localhost:8080

**Prérequis :**
- Stripe CLI installé : `brew install stripe/stripe-cli/stripe`
- Stripe CLI authentifié : `stripe login` (une seule fois)

### Méthode manuelle
```
cd "/Users/clembrlt/Desktop/Devis automation MBE/front end"
npm install
npm run dev:all   # lance Vite + proxy Stripe sur 5174 + Stripe CLI automatiquement
```
Ouvrir l'UI : http://localhost:8080

## Connexion Firebase (Firestore)
1. Installer (déjà fait) : `npm install firebase`
2. Créer `front end/.env.local` avec :
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=sdv-automation-mbe.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sdv-automation-mbe
VITE_FIREBASE_STORAGE_BUCKET=sdv-automation-mbe.firebasestorage.app
VITE_FIREBASE_SENDER_ID=603940578796
VITE_FIREBASE_APP_ID=1:603940578796:web:89052f95b5eed311db8cc9
VITE_FIREBASE_MEASUREMENT_ID=G-MW3N3FRJBX
```
3. **Configurer les règles Firestore** (IMPORTANT) :
   - Le fichier `firestore.rules` à la racine du projet contient les règles de sécurité
   - **Option 1 (recommandée)** : Déployer via Firebase CLI :
     ```bash
     firebase deploy --only firestore:rules
     ```
   - **Option 2** : Configurer manuellement dans la console Firebase :
     1. Aller sur https://console.firebase.google.com/project/sdv-automation-mbe/firestore/rules
     2. Copier le contenu du fichier `firestore.rules`
     3. Coller dans l'éditeur de règles
     4. Cliquer sur "Publier"
   - Les règles permettent la lecture/écriture pour les utilisateurs authentifiés (anonymes inclus)
4. **Activer l'authentification anonyme** :
   - Aller sur https://console.firebase.google.com/project/sdv-automation-mbe/authentication/providers
   - Activer "Anonymous" dans la liste des providers
5. Point d'entrée Firebase : `src/lib/firebase.ts` (exporte `db` Firestore et `analyticsPromise`).
6. Exemple d'usage Firestore :
```ts
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
const snap = await getDocs(collection(db, "quotes"));
```
Relancer `npm run dev` après avoir créé `.env.local` et configuré les règles.

## Paytweak (génération de lien de paiement)
- Code d’appel Paytweak : `src/lib/paytweak.ts` (POST vers API Paytweak).
- UI : bouton “Générer lien” dans `src/pages/Payments.tsx`.
- Env à définir (exemple) :
```
VITE_PAYTWEAK_API_BASE=https://api.paytweak.com
VITE_PAYTWEAK_SECRET_TOKEN=b16a3e600e54bbcb
VITE_PAYTWEAK_PUBLIC_TOKEN=130c650e850c6a4a06d5abc02ec077fc808e02d4faccdb2fe5f894465a0c840d
VITE_PAYTWEAK_LINK_PATH=/link   # ajuster si besoin (ex: /v1/link)
```
- Comportement : si la config manque, un lien mocké est généré pour ne pas bloquer l’UI. Sinon, appel API avec body `{ amount, currency, reference, description, customer, successUrl, cancelUrl, publicToken }` et Authorization Bearer `<secret>`. La réponse doit contenir `paymentUrl` (ou `url`, `redirectUrl`, `link`).
- Ajuster `VITE_PAYTWEAK_LINK_PATH` si l’endpoint diffère dans la doc Paytweak.
- Si l’appel direct front est refusé (CORS/sécurité), prévoir un petit proxy backend (serverless ou Node) qui porte `VITE_PAYTWEAK_SECRET_TOKEN` et appelle l’API Paytweak côté serveur.

## Stripe (génération de lien de paiement)
- Proxy serveur Express : `server/stripe-proxy.js` (route POST `/api/stripe/link`) – Payment Links API (price_data ad-hoc). Charge automatiquement `.env.local`.
- Script proxy : `npm run stripe:proxy` (port 5174 par défaut, overridable par `PORT`).
- Front : `src/lib/stripe.ts` + bouton “Lien Stripe” dans `src/pages/Payments.tsx`.
- Env à définir (`front end/.env.local`) :
```
STRIPE_SECRET_KEY=
STRIPE_SUCCESS_URL=http://localhost:8080/payment/success
STRIPE_CANCEL_URL=http://localhost:8080/payment/cancel
STRIPE_WEBHOOK_SECRET=whsec_xxx   # obtenu dans le dashboard Stripe (ex: whsec_6dK6D0i8hSIRdLjIVZzNCTejFkQRas65)
```
- Si `STRIPE_SECRET_KEY` n’est pas disponible dans l’environnement (dev local), le proxy 5174 peut aussi charger une clé depuis `front end/server/.stripe_secret_key` (fichier ignoré par git).
- Dev : lancer tout en une commande :
```
npm run dev:all   # démarre le proxy Stripe sur 5174 et Vite sur 8080
```
- Vite proxy `/api/*` vers `http://localhost:5174`.
```
npm run stripe:proxy   # optionnel si vous ne voulez lancer que le proxy
npm run dev -- --host --port 8080   # optionnel si vous ne voulez lancer que Vite
```
Le bouton “Lien Stripe” crée un Payment Link (amount = totalAmount du devis, description = `Client | Lot | Salle`) et renvoie l’URL Stripe.
- Le serveur ajoute automatiquement les query params `ref`, `amount`, `currency`, `source=stripe`, `status=success|cancel` aux URLs de redirection pour faciliter l’affichage des infos sur la page de retour.
- Pages front de retour visibles : `/payment/success` et `/payment/cancel` (affichent la référence, le montant et un bouton retour vers `/payments`).
- Mode “SaaS” backend-only : endpoint POST `/api/stripe/create-payment-link` qui accepte `priceId` (ou `amount` + `description` comme fallback) et renvoie `{ url, id }`.
- Webhook Stripe : POST `/api/stripe/webhook` (signature vérifiée avec `STRIPE_WEBHOOK_SECRET`) — met à jour automatiquement les liens de paiement dans Firestore après un paiement réussi. Les liens sont désactivés (statut `paid`) et tous les autres liens actifs du devis sont expirés.

**Configuration du webhook Stripe :**

**En développement (automatique) :**
- Le script `dev-all.mjs` lance automatiquement `stripe listen --forward-to localhost:5174/api/stripe/webhook` en arrière-plan
- **Aucune action manuelle requise** : ouvrez simplement `start-dev.command` et tout se lance automatiquement
- Le webhook secret est automatiquement détecté depuis la sortie de `stripe listen` et affiché dans les logs
- **Important** : Assurez-vous que Stripe CLI est installé (`brew install stripe/stripe-cli/stripe`) et authentifié (`stripe login`)

**En production :**
1. Dans le dashboard Stripe (https://dashboard.stripe.com), allez dans "Developers" > "Webhooks"
2. Créez un nouveau webhook ou modifiez l'existant
3. URL du webhook : `https://<votre-domaine>/api/stripe/webhook`
4. Événements à écouter :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `charge.succeeded`
   - `payment_link.created`
   - `payment_link.updated`
   - `payment_link.canceled`
5. Copiez le "Signing secret" (commence par `whsec_`) et ajoutez-le dans `front end/.env.local` comme `STRIPE_WEBHOOK_SECRET`

**Installation Firebase Admin (requis pour la mise à jour Firestore) :**
```bash
cd "front end"
npm install firebase-admin
```

Le webhook met automatiquement à jour Firestore pour :
- Marquer le lien de paiement comme `paid` après un paiement réussi
- Désactiver tous les autres liens actifs du devis (statut `expired`)
- Mettre à jour le statut du devis à `paid`

## Bordereaux (OCR + extraction déterministe)
Le système d’analyse des bordereaux est conçu pour être “production friendly” :
- OCR primaire **sans LLM** (Tesseract) + pré-traitement image (sharp).
- Extraction déterministe (règles + mots-clés + positions).
- LLM réservé au post-traitement (nettoyage/normalisation) si besoin.

### Endpoints
- `POST /api/bordereau/extract` (SaaS): retourne un JSON strict :
  - `salle_vente`, `vente`, `numero_bordereau`, `date` (ISO), `total`, `lots[]` (`numero_lot`, `description`, `prix_marteau`)
- `POST /api/analyze-auction-sheet`: compat UI existante, mappe la sortie vers `AuctionSheetAnalysis` (inclut `invoiceTotal`).

### PDF support
Le proxy 5174 supporte maintenant :
- **Images** (JPG/PNG)
- **PDF** (rendu en images côté serveur via `pdfjs-dist` + `@napi-rs/canvas`, puis OCR)

### Debug OCR
Dans l’UI “Attacher bordereau”, un bloc **“Texte OCR reconnu”** est affiché (même en cas d’analyse non concluante) pour diagnostiquer les cas où l’extraction ne trouve ni lots ni total.

### Suppression vs analyse
La suppression du bordereau est explicite (`removed: true` via le bouton retirer) et n’est plus déduite de `totalLots === 0` (évite “Bordereau retiré” après une analyse vide).

## Changements récents (Stripe automatisé)
- Commande unique dev : `npm run dev:all` (lance Vite 8080 + proxy Stripe 5174).
- Nouvel endpoint SaaS : `POST /api/stripe/create-payment-link` (recommandé avec `priceId`, fallback montant+description).
- Redirections enrichies : query params auto `ref`, `amount`, `currency`, `source=stripe`, `status`.
- Webhook prêt : `POST /api/stripe/webhook` (signature `STRIPE_WEBHOOK_SECRET`) — logs des paiements réussis (prêt à connecter à ta persistance).
- Front : pages `/payment/success` et `/payment/cancel` affichent les infos paiement + retour vers `/payments`.
- Mode mock si la clé Stripe est absente : les endpoints Stripe renvoient un lien Stripe factice (type `https://checkout.stripe.com/pay/mock-...`) au lieu d’une erreur 400, pour tester l’UI sans config.
- Ports dynamiques : si 8080 est occupé, Vite démarre sur un port libre (logué dans la console). Le proxy Stripe reste sur 5174.
- Lanceurs auto : `start-dev.command` (mac) ouvre un Terminal et exécute `run-dev-mac.sh` (npm install si besoin, puis `npm run dev:all`), ouvre le navigateur. `start-dev.bat` fait l’équivalent sous Windows.
- Webhook Stripe enrichi : les événements `payment_link.created/updated`, `checkout.session.completed`, `payment_intent.succeeded/failed/canceled`, `charge.succeeded/failed` sont mappés en statuts (`link_sent`, `awaiting_payment`, `paid`, `failed`, `cancelled`, `expired`) et stockés en mémoire pour debug (`GET /api/stripe/status?linkId=...` ou `?ref=...`). À connecter à Firestore/DB pour une persistance réelle.

## Mode serveur unique (prod / sans lancer le terminal manuellement)
- Serveur Express : `server/index.js` charge `.env.local`, expose `/api/stripe/link` et sert le build Vite.
- Scripts :
```
npm run build
npm run serve   # lance server/index.js (port 5173 par défaut, override avec PORT)
```
- Env requis (dans `front end/.env.local`) :
```
STRIPE_SECRET_KEY=...
STRIPE_SUCCESS_URL=http://localhost:8080/payment/success   # ou ton domaine
STRIPE_CANCEL_URL=http://localhost:8080/payment/cancel
```
- En prod, déploie `server/index.js` + `dist/` sur un hébergeur Node et renseigne les variables d’environnement ; le front consommera `/api/stripe/link` sans action manuelle.

## Comportement en cas d’erreur
- Si une URL renvoie du HTML ou un code d’erreur, on passe à la suivante.
- Si aucune source n’est valide, on retombe sur les données mock (`mockQuotes`).


## Bordereaux : persistance Firestore + affichage lot (nouveau)
- Les devis issus de Google Sheets reçoivent désormais un **ID stable** (hash des champs du formulaire) et sont **upsertés dans Firestore** (`quotes/{id}`), ce qui garantit que le bordereau reste attaché au bon devis après reload.
- La collection Firestore utilisée est `quotes` (plus `quoteEnhancements`). Les champs `auctionSheet` et `lotEnriched` sont stockés sur ce document.
- `lotEnriched` est calculé depuis le bordereau (description courte, dimensions estimées Groq, valeur, numéro de lot, salle) et appliqué automatiquement au lot du devis si celui-ci est vide ou placeholder (“Objet à transporter”).
- En cas de bordereau sans lots détectés, le proxy crée un lot minimal (description issue du texte OCR) pour éviter les champs vides dans l’UI et dans Firestore.
- L’UI “Informations du lot” se remplit dès l’analyse et reste visible après rechargement grâce à la fusion Firestore (`mergeEnhancementsIntoQuotes` + resync `QuoteDetail`).

## OCR / Analyse bordereau (ajouts récents)
- Proxy `/api/analyze-auction-sheet` enrichi : fallback lot minimal si l’extraction ne renvoie aucun lot (description courte issue du texte OCR, valeur = total facture si dispo).
- Estimation des dimensions via Groq maintenue, et suggestion de **carton** depuis le fichier Excel `Excel carton/Essai 2024-08-23.xlsx`.
- Recommandation de carton renvoyée au front (`recommendedCarton`) et affichée dans “Attacher bordereau”.
- Le texte OCR complet reste consultable dans l’UI pour debug, même si l’analyse est partielle.

## Frontend / Hooks / Cache
- `useQuotes` charge les devis Google Sheets, les upsert dans Firestore, puis fusionne les enrichissements Firestore (bordereau + lot enrichi).
- `QuoteDetail` se resynchronise avec le cache React Query après merge Firestore et applique au lot la description courte, les dimensions estimées, la valeur et la salle.

## Firebase
- Fallback de configuration Firebase embarqué dans `front end/src/lib/firebase.ts` (clés fournies), auth anonyme automatique (`signInAnonymously`) pour passer les règles Firestore.
- Si `VITE_FIREBASE_*` ne sont pas présents, le fallback est utilisé ; sinon l’env prime.
- En cas d’absence de Storage, seul Firestore est utilisé (plus d’upload de fichier requis pour lier un bordereau).



## Système d'envoi d'emails (Resend) - Décembre 2024

### ⚠️ IMPORTANT : Configuration fixe
**Le système d'envoi d'email est maintenant verrouillé et ne doit plus être modifié.**
- **EMAIL_FROM est FORCÉ** à `devis@mbe-sdv.fr` dans le code (ignorant toute valeur de `.env.local`)
- **Seul le contenu de l'email peut être modifié**, pas le système d'envoi
- **Domaine vérifié** : `mbe-sdv.fr` (doit être vérifié dans Resend Dashboard > Domains)

### Configuration requise
Variables dans `front end/.env.local` :
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM_NAME=MBE-SDV  # Optionnel, par défaut "MBE-SDV"
```

**Note** : `EMAIL_FROM` dans `.env.local` est **ignoré** - le système utilise toujours `devis@mbe-sdv.fr`

### Architecture technique
- **Provider** : Resend API (https://resend.com)
- **SDK** : `resend` package (v6.6.0)
- **Endpoint backend** : `POST /api/send-quote-email` dans `front end/server/ai-proxy.js`
- **Fonction d'envoi** : `sendEmail()` dans `ai-proxy.js` (ligne ~2400)
- **Format expéditeur** : `"MBE-SDV <devis@mbe-sdv.fr>"`

### Flux d'envoi
1. **Frontend** : Bouton "Contacter le client" dans `QuoteDetail.tsx`
2. **Appel API** : `POST /api/send-quote-email` avec le devis complet
3. **Backend** : Extraction de l'email du client (`quote.client.email`)
4. **Validation** : Vérification du format email côté backend
5. **Envoi Resend** : Appel à `resendClient.emails.send()` avec :
   - `from`: `"MBE-SDV <devis@mbe-sdv.fr>"`
   - `to`: Email du client
   - `subject`: `"Votre devis de transport - {reference}"`
   - `text` et `html`: Contenu du devis formaté
6. **Réponse** : `{ success: true, messageId: "...", to: "client@email.com" }`

### Gestion d'erreurs
Le système mappe les erreurs Resend vers des codes d'erreur spécifiques :

| Code erreur | Cause | Solution |
|------------|-------|----------|
| `EMAIL_DOMAIN_NOT_VERIFIED` | Domaine non vérifié dans Resend | Vérifier que `mbe-sdv.fr` est vérifié dans Resend Dashboard > Domains |
| `RESEND_NOT_CONFIGURED` | `RESEND_API_KEY` manquant | Ajouter `RESEND_API_KEY` dans `.env.local` |
| `RESEND_AUTH_ERROR` | Clé API invalide ou expirée | Vérifier la clé API sur https://resend.com/api-keys |
| `INVALID_EMAIL_FORMAT` | Format email du client invalide | Vérifier l'email du client dans le devis |

**Messages d'erreur** : Les erreurs sont affichées dans le frontend via `toast.error()` avec des messages explicites.

### Fallback HTTP direct
Si le SDK Resend échoue avec une erreur "pattern", le système bascule automatiquement vers un appel HTTP direct à l'API Resend (fonction `sendEmailDirectHTTP()`).

### Routes de test
- `POST /api/test-email` : Test avec le SDK Resend
- `POST /api/test-email-direct` : Test avec appel HTTP direct
- `GET /api/health` : Vérification que le backend fonctionne

### Diagnostic en cas de problème

#### 1. Vérifier les logs backend
Dans le terminal du serveur backend, chercher :
```
[Config] ✅ Resend configuré: {
  emailFrom: 'devis@mbe-sdv.fr',
  note: 'EMAIL_FROM est forcé à devis@mbe-sdv.fr (domaine vérifié)'
}
```

Si vous voyez `emailFrom: 'xarnixgevalty@gmail.com'` ou autre, le code n'a pas été mis à jour.

#### 2. Vérifier que le domaine est vérifié
1. Aller sur https://resend.com/domains
2. Vérifier que `mbe-sdv.fr` est listé et marqué "Verified"
3. Si non vérifié, suivre les instructions pour ajouter les enregistrements DNS

#### 3. Vérifier la clé API
1. Aller sur https://resend.com/api-keys
2. Vérifier que la clé API est active et valide
3. Copier la clé dans `front end/.env.local` : `RESEND_API_KEY=re_...`

#### 4. Tester l'envoi
1. Ouvrir un devis dans l'interface
2. Cliquer sur "Contacter le client"
3. Vérifier les logs dans le terminal backend :
   - `[Resend] ✅ Email envoyé avec succès!` → OK
   - `[Resend] ❌ Erreur retournée par Resend API` → Voir le message d'erreur

#### 5. Logs de diagnostic
Le système logue automatiquement :
- `[Resend] Détails erreur:` : Message exact de Resend
- `[Resend] Détection erreur domaine:` : Détection du type d'erreur
- `[Resend] Erreur mappée:` : Code d'erreur final retourné au frontend

### Fichiers concernés (NE PAS MODIFIER)
- `front end/server/ai-proxy.js` : Fonction `sendEmail()` et route `/api/send-quote-email`
- `front end/src/pages/QuoteDetail.tsx` : Fonction `handleSendEmail()` et gestion des erreurs

### Modifications récentes (31 décembre 2024)
- **Forçage EMAIL_FROM** : `EMAIL_FROM` est maintenant forcé à `devis@mbe-sdv.fr` dans le code, ignorant toute valeur de `.env.local`
- **Propagation des métadonnées Resend** : Les erreurs Resend propagent maintenant correctement `resendError`, `resendType`, et `resendStatusCode` pour un diagnostic précis
- **Messages d'erreur améliorés** : Messages plus clairs indiquant exactement quoi faire en cas d'erreur
- **Logs de diagnostic** : Logs détaillés à chaque étape pour faciliter le diagnostic

### Contenu de l'email
Le contenu de l'email peut être modifié dans `ai-proxy.js` (fonction `app.post('/api/send-quote-email')`, lignes ~2650-2780) :
- **Template HTML** : Variables `{reference}`, `{clientName}`, `{totalAmount}`, etc.
- **Template texte** : Version texte du même contenu
- **Sujet** : `"Votre devis de transport - {reference}"`

**Note** : Modifier uniquement le contenu, pas le système d'envoi (expéditeur, destinataire, gestion d'erreurs).

## Corrections proxy Vite et routes backend - Décembre 2024
- **Problème résolu** : Routes backend retournaient 404 via le proxy Vite, empêchant l'envoi d'emails
- **Cause identifiée** : 
  1. Configuration du proxy dans `dev-all.mjs` ne chargeait pas correctement `vite.config.ts`
  2. Problème de chemin avec espaces (`Devis automation MBE`) dans `fileURLToPath`
  3. Timing : Vite démarrait avant que le backend soit complètement prêt
- **Solution implémentée** :
  1. Correction du chemin avec espaces dans `dev-all.mjs` (utilisation correcte de `fileURLToPath`)
  2. Forçage de la configuration du proxy directement dans `createViteServer()` pour garantir qu'elle est appliquée
  3. Ajout de vérifications du backend avant démarrage de Vite (plusieurs tentatives avec délais de 2 secondes)
  4. Route de test `/api/test` ajoutée pour isoler les problèmes
  5. Logs détaillés pour diagnostiquer les problèmes de proxy
  6. Middleware catch-all corrigé pour ne pas intercepter les routes définies
  7. Ajout de logs dans toutes les routes pour confirmer qu'elles sont appelées
- **Fichiers modifiés** :
  - `front end/scripts/dev-all.mjs` : Configuration du proxy forcée, vérification du backend améliorée, gestion des chemins avec espaces
  - `front end/server/ai-proxy.js` : Routes de test ajoutées (`/api/test`, `/api/health`), logs améliorés, middleware catch-all corrigé, fonction `sendEmailDirectHTTP()` pour fallback
  - `front end/src/pages/QuoteDetail.tsx` : Gestion d'erreur améliorée, test de connectivité au chargement, validation d'email côté frontend
- **Configuration proxy** : `/api` redirigé vers `http://localhost:5174` (backend Express)
- **Ordre de démarrage** :
  1. Backend Express démarre sur port 5174
  2. Attente de 2 secondes + vérification que le backend répond (5 tentatives max)
  3. Vite démarre sur port 8080 avec proxy configuré
- **Test de connectivité** : Routes `GET /api/health` et `GET /api/test` pour vérifier que le backend fonctionne
- **Résultat** : Toutes les routes backend sont maintenant accessibles via le proxy Vite, l'envoi d'emails via Resend fonctionne correctement

## Priorité aux dimensions internes du carton - Décembre 2024
- **Problème résolu** : Les dimensions affichées dans "Dimensions estimées d'un colis" étaient celles des objets au lieu de celles du carton d'emballage recommandé
- **Solution implémentée** :
  1. **Priorité absolue aux dimensions internes (`inner`)** : Les dimensions du carton (`recommendedCarton.inner`) sont maintenant toujours utilisées en priorité pour afficher les dimensions du colis
  2. **Fallback vers `required`** : Si `inner` n'existe pas, utilisation de `recommendedCarton.required`
  3. **Application forcée** : Ajout d'un `useEffect` dans `QuoteDetail.tsx` qui force l'application des dimensions du carton si elles diffèrent des dimensions actuelles
  4. **Logique cohérente** : Même priorité appliquée dans `computeLotEnrichedFromAuctionSheet` et `mergeEnhancementsIntoQuotes`
- **Fichiers modifiés** :
  - `front end/src/pages/QuoteDetail.tsx` : Priorité `inner` > `required`, `useEffect` pour forcer l'application, label mis à jour vers "Dimensions estimées d'un colis" avec badge du carton
  - `front end/src/lib/quoteEnhancements.ts` : Priorité `inner` > `required` dans `computeLotEnrichedFromAuctionSheet` et `mergeEnhancementsIntoQuotes`, logs de debug ajoutés
- **Correction de conversion numérique** : Remplacement de `Number(...) || 0` par `isNaN()` pour éviter de perdre des valeurs 0 valides
- **Résultat** : Les dimensions affichées dans "Dimensions estimées d'un colis" sont toujours celles du carton recommandé (dimensions internes), et non celles des objets

## Affichage du nom complet du client - Décembre 2024
- **Problème résolu** : Seul le prénom du client était affiché dans les sections "Livraison client" et "Informations client", manquant de précision pour identifier la personne
- **Solution implémentée** :
  1. **Construction du nom complet** : Modification de `buildQuoteFromRow` pour combiner prénom et nom de famille depuis Google Sheets
  2. **Priorité des champs** :
     - Si prénom ET nom de famille séparés → "Prénom Nom"
     - Si champ "nom complet" → utilisé tel quel
     - Si prénom + "nom" → "Prénom Nom"
     - Si seulement prénom → prénom seul
     - Si seulement "nom" → utilisé tel quel
  3. **Cohérence des IDs stables** : `stableQuoteIdFromRow` utilise la même logique pour garantir la stabilité des IDs
- **Fichiers modifiés** :
  - `front end/src/lib/sheetQuotes.ts` : Logique de construction du nom complet dans `buildQuoteFromRow` et `stableQuoteIdFromRow`, recherche de multiples variantes de champs (prénom, nom, nom complet, etc.)
- **Champs recherchés dans Google Sheets** :
  - Prénom : `["prenom", "prénom", "firstname", "first name"]`
  - Nom de famille : `["nom de famille", "lastname", "last name", "family name", "surname"]`
  - Nom complet : `["nom complet", "full name", "name"]`
  - Nom seul : `["nom"]`
- **Résultat** : Les sections "Livraison client" et "Informations client" affichent maintenant le nom complet du client (prénom + nom de famille) au lieu du seul prénom, permettant une identification précise

## Enrichissement récapitulatif paiements - Décembre 2024
- **Ajout** : Enrichissement de l'onglet "Paiements" avec toutes les informations de facturation
- **Informations ajoutées** :
  1. **Section "Livraison"** :
     - Type de livraison (Express/Standard) avec badge visuel
     - Transporteur utilisé (UPS, TNT, DHL, FEDEX) avec badge, ou "Non renseigné" si absent
  2. **Section "Détail des coûts"** :
     - **Emballage** : Prix du carton recommandé (toujours affiché, 0.00€ si non renseigné)
     - **Transport de base** : Calculé en soustrayant assurance, express et emballage du total
     - **Livraison express** : Affichée si activée
     - **Assurance** : Toujours affichée avec :
       - Badge "Oui" si prise, "Non" si non prise
       - Valeur assurée (si assurance prise)
       - Coût de l'assurance avec indication du calcul (2.5%, min. 12€ si valeur < 500€)
- **Fonction de calcul** : `calculateInsurancePrice()` calcule automatiquement le prix selon les règles (2.5% de la valeur, minimum 12€ si < 500€)
- **Fichiers modifiés** :
  - `front end/src/pages/QuoteDetail.tsx` : Enrichissement du récapitulatif, fonction `calculateInsurancePrice()`, affichage conditionnel des informations
- **Résultat** : L'onglet "Paiements" affiche maintenant toutes les informations nécessaires pour la facturation (type de livraison, transporteur, emballage, assurance avec calcul détaillé)

## Suppression bordereau et réinitialisation informations - Décembre 2024
- **Problème résolu** : Lors de la suppression d'un bordereau, les informations enrichies restaient affichées et n'étaient pas persistées
- **Solution implémentée** :
  1. **Suppression persistée** : `removeAuctionSheetForQuote` supprime aussi `lotEnriched` dans Firestore, garantissant que la suppression est persistée comme l'ajout
  2. **Réinitialisation des informations** : Lors de la suppression, toutes les informations du lot enrichies par le bordereau sont réinitialisées :
     - Numéro de lot : "LOT non renseigné" (au lieu de numéro générique)
     - Description : "Objet à transporter"
     - Salle des ventes : "Non précisée"
     - Valeur déclarée : 0
     - Dimensions estimées : toutes à 0
  3. **Affichage "Pas renseigné"** : Tous les champs de "Informations du lot" affichent "Pas renseigné" quand il n'y a pas de bordereau :
     - Numéro de lot : "LOT non renseigné"
     - Salle des ventes : "Pas renseigné"
     - Description : "Pas renseigné"
     - Valeur déclarée : "Pas renseigné"
     - Dimensions estimées : "Pas renseigné"
- **Fichiers modifiés** :
  - `front end/src/lib/quoteEnhancements.ts` : Suppression de `lotEnriched` dans Firestore lors de la suppression du bordereau
  - `front end/src/pages/QuoteDetail.tsx` : Réinitialisation complète des informations du lot, affichage conditionnel "Pas renseigné" pour tous les champs
- **Cohérence après redémarrage** : `mergeEnhancementsIntoQuotes` vérifie si `auctionSheet` est null avant d'appliquer les enrichissements, garantissant que les informations restent réinitialisées même après redémarrage
- **Résultat** : La suppression d'un bordereau supprime toutes les informations enrichies, les réinitialise correctement, et affiche "Pas renseigné" / "LOT non renseigné" pour indiquer clairement l'absence de bordereau. La suppression est persistée dans Firestore.

## Système de pricing depuis Google Sheets - Décembre 2024
- **Problème résolu** : Les prix d'emballage et d'expédition étaient calculés depuis Excel au lieu des prix à facturer au client présents dans Google Sheets
- **Solution implémentée** :
  1. **Nouveau module pricing.ts** : Module dédié pour charger et parser les tarifs depuis Google Sheets publiés
  2. **Configuration des URLs publiées** :
     - Prix carton : `gid=1299775832` (https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1299775832&single=true&output=csv)
     - Prix expé volume/zone : `gid=1518712190` (https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1518712190&single=true&output=csv)
     - My new form (devis) : `gid=1137251647` (dans sheetQuotes.ts)
  3. **Parsing robuste des CSV** :
     - Gestion des formats variés (virgules décimales, espaces, symboles €)
     - Détection automatique des colonnes (carton_ref, packaging_price)
     - Parsing des zones d'expédition avec pays entre parenthèses
     - Extraction des tarifs EXPRESS par tranches de poids (1kg, 2kg, 5kg, 10kg, 15kg, 20kg, 30kg)
  4. **Calcul automatique des prix** :
     - **Prix d'emballage** : Récupéré depuis Google Sheets selon la référence du carton recommandé
     - **Prix d'expédition** : Calculé selon le pays de destination et le poids volumétrique (formule : (L × l × H) / 5000)
     - **Tous les colis en Express** : Par défaut, tous les colis sont expédiés en Express
  5. **Chargement préventif** : Les tarifs sont chargés automatiquement au démarrage de l'application (App.tsx) pour garantir leur disponibilité
  6. **Cache en mémoire** : Les tarifs sont mis en cache pendant 5 minutes pour éviter les appels répétés
  7. **Logs détaillés** : Logs complets pour diagnostiquer les problèmes de chargement (URLs utilisées, zones chargées, erreurs)
- **Fichiers modifiés/créés** :
  - `front end/src/lib/pricing.ts` : Nouveau module pour le pricing (chargement, parsing, calcul)
  - `front end/src/pages/QuoteDetail.tsx` : Utilisation des prix depuis Google Sheets, suppression de "Transport de base"
  - `front end/src/lib/quoteEnhancements.ts` : Récupération des prix depuis Firestore
  - `front end/src/lib/sheetQuotes.ts` : Correction des GID (suppression de l'URL incorrecte gid=256365155)
  - `front end/src/App.tsx` : Chargement préventif des tarifs au démarrage
- **Fonctions principales** :
  - `loadCartonPrices()` : Charge les prix des cartons depuis Google Sheets
  - `loadShippingRates()` : Charge les tarifs d'expédition par zone et pays
  - `getCartonPrice(cartonRef)` : Récupère le prix d'un carton par sa référence
  - `calculateShippingPrice(countryCode, volumetricWeight, isExpress)` : Calcule le prix d'expédition
  - `calculateVolumetricWeight(length, width, height)` : Calcule le poids volumétrique
- **Structure des données** :
  - **Cartons** : Map<carton_ref, price> (ex: "CAD01A" → 12.00€)
  - **Zones d'expédition** : Array de zones avec pays et tarifs par tranche de poids
    - Zone A (FRANCE) : pays ["FR"], express {"1-2": 9, "2-5": 11, ...}
    - Zone B (EUROPE PROCHE) : pays ["BE", "LU", "DE", "NL", "ES", "IT"], ...
- **Gestion d'erreurs** :
  - Messages d'erreur explicites avec URLs utilisées
  - Vérification que les Google Sheets sont publiés (détection HTML vs CSV)
  - Fallback vers le cache en cas d'erreur
  - Logs détaillés pour chaque étape du chargement
- **Résultat** : Les prix affichés dans l'onglet "Paiements" proviennent maintenant des Google Sheets (prix à facturer au client), et non plus d'Excel (prix internes). Le calcul des prix d'expédition est automatique selon le pays et le poids volumétrique. La section "Transport de base" a été supprimée car redondante.

## Corrections extraction pays et logs diagnostic - Décembre 2024
- **Problème résolu** : Le pays de destination était `undefined`, empêchant le calcul du prix d'expédition malgré les tarifs correctement chargés
- **Solution implémentée** :
  1. **Extraction du pays du client** : Ajout de l'extraction de la colonne "Pays" (sans le "1") depuis Google Sheets pour le client
  2. **Stockage du pays en mode "client"** : Le pays est maintenant stocké dans `delivery.address.country` même quand le mode de livraison est "client" (et non seulement "receiver")
  3. **Fallback DEV temporaire** : Si le pays n'est pas trouvé, détection automatique depuis l'adresse :
     - Si l'adresse contient "Nice", "Paris" ou "France" → utilise "FR" automatiquement
     - Recherche d'un code pays à 2 lettres dans l'adresse (regex `\b([A-Z]{2})\b`)
  4. **Logs de diagnostic complets** :
     - **Logs SHIPPING INPUT** : Affichent toutes les données d'entrée (`deliveryCountry`, `addressLine`, `deliveryMode`, `fullDelivery`)
     - **Logs d'extraction du pays** : Toutes les tentatives d'extraction (format 2 lettres, mapping nom→code, recherche dans l'adresse)
     - **Logs de calcul du poids volumétrique** : Dimensions brutes + formule + résultat
     - **Logs de matching des zones** : Liste de toutes les zones avec leurs pays, vérification zone par zone
     - **Logs de matching des tranches de poids** : Test détaillé de chaque tranche avec comparaison (ex: `35kg >= 1 && 35kg < 2 ? ❌`)
     - **Messages d'erreur explicites** : À chaque étape si quelque chose échoue
  5. **Mapping des pays amélioré** : Ajout de nombreux pays supplémentaires pour le mapping nom→code :
     - Europe : PT, AT, DK, IE, SE, FI, PL, CZ, HU
     - Amérique : BR, AR, CL, CO, PE, US, CA, MX
     - Support des noms en français et en anglais
- **Fichiers modifiés** :
  - `front end/src/lib/sheetQuotes.ts` : Extraction du pays du client, ajout dans l'adresse de livraison
  - `front end/src/pages/QuoteDetail.tsx` : Logs détaillés, fallback DEV, mapping pays amélioré
  - `front end/src/lib/pricing.ts` : Logs détaillés du matching des zones et tranches de poids
- **Structure des logs** :
  - `[QuoteDetail] 🚚 SHIPPING INPUT` : Données d'entrée complètes
  - `[QuoteDetail] 🔍 Extraction code pays` : Processus d'extraction
  - `[QuoteDetail] 📐 Dimensions du colis` : Dimensions brutes
  - `[QuoteDetail] ⚖️ Poids volumétrique calculé` : Calcul avec formule
  - `[pricing] 🔍 Recherche zone pour pays` : Matching des zones
  - `[pricing] 📊 Tranches de poids disponibles` : Liste des tranches
  - `[pricing] 🔍 Test tranche` : Test de chaque tranche
  - `[pricing] ✅ MATCH TROUVÉ` ou `❌ AUCUNE TRANCHE TROUVÉE` : Résultat final
- **Résultat** : Le système peut maintenant diagnostiquer précisément pourquoi un prix d'expédition n'est pas calculé (pays manquant, poids hors tranche, zone non trouvée, etc.). Le fallback DEV permet de tester le système même si le pays n'est pas explicitement renseigné dans Google Sheets.

## Correction récupération paymentStatus et historique depuis Firestore - Janvier 2025
- **Problème résolu** : Le statut de paiement (`paymentStatus`) et l'historique (`timeline`) n'étaient pas correctement récupérés depuis Firestore, causant des incohérences d'affichage (statut "en attente" alors que le paiement était reçu, historique incomplet)
- **Solution implémentée** :
  1. **Récupération du paymentStatus depuis Firestore** :
     - Ajout de `paymentStatus` dans la structure `enhancements` de `mergeEnhancementsIntoQuotes`
     - Récupération depuis Firestore avec priorité absolue sur le `paymentStatus` initial du devis
     - Préservation du `paymentStatus` dans `upsertQuotesToFirestore` pour ne pas écraser les mises à jour des webhooks Stripe
     - Récupération même pour les devis sans bordereau (fallback par référence)
  2. **Récupération de l'historique (timeline) depuis Firestore** :
     - Récupération systématique de l'historique pour tous les devis, même sans bordereau
     - Priorité absolue à l'historique depuis Firestore (contient les événements ajoutés par les webhooks)
     - Conversion correcte des dates entre Firestore (Timestamp) et JavaScript (Date)
     - Récupération dans toutes les branches (par ID, par référence, avec/sans bordereau)
  3. **Amélioration du rafraîchissement automatique** :
     - Réduction du `staleTime` de React Query à 30 secondes (au lieu de 5 minutes)
     - Activation de `refetchOnWindowFocus` pour recharger au retour sur la fenêtre
     - Ajout d'un `refetchInterval` pour recharger toutes les minutes automatiquement
     - Ajout d'un bouton "Rafraîchir les données" dans la page Paiements pour forcer un rechargement manuel
  4. **Correction de l'affichage du badge "Payé"** :
     - Suppression de la duplication du badge "Payé" dans QuoteDetail
     - Si le statut du devis est `"paid"`, seul le badge de paiement est affiché (le badge de statut général est masqué)
     - Si le statut n'est pas `"paid"`, les deux badges sont affichés (statut général + statut de paiement)
  5. **Logs de débogage** :
     - Logs détaillés dans `mergeEnhancementsIntoQuotes` pour voir ce qui est récupéré depuis Firestore
     - Logs dans la page Payments pour voir le `paymentStatus` et l'historique de chaque devis
     - Logs pour tracer les mises à jour du `paymentStatus` et de l'historique
- **Fichiers modifiés** :
  - `front end/src/lib/quoteEnhancements.ts` : Récupération du `paymentStatus` et de l'historique, préservation dans `upsertQuotesToFirestore`
  - `front end/src/hooks/use-quotes.ts` : Amélioration du rafraîchissement automatique (staleTime, refetchInterval)
  - `front end/src/pages/Payments.tsx` : Ajout de logs de débogage et bouton de rafraîchissement
  - `front end/src/pages/QuoteDetail.tsx` : Correction de l'affichage du badge "Payé" (éviter la duplication)
- **Structure des données Firestore** :
  - `paymentStatus` : Statut de paiement (`"pending"`, `"link_sent"`, `"paid"`, etc.) mis à jour par les webhooks Stripe
  - `timeline` : Array d'événements avec `id`, `date` (Timestamp), `status`, `description`, `user`
  - Les deux sont préservés lors des mises à jour depuis Google Sheets pour ne pas écraser les données des webhooks
- **Priorité des données** :
  - **Firestore > Google Sheets** : Les données depuis Firestore (mises à jour par les webhooks) ont toujours la priorité
  - **Historique Firestore > Historique initial** : L'historique depuis Firestore est toujours prioritaire
  - **PaymentStatus Firestore > PaymentStatus initial** : Le statut de paiement depuis Firestore est toujours prioritaire
- **Résultat** : Le statut de paiement et l'historique sont maintenant correctement récupérés depuis Firestore et affichés dans l'interface. Les mises à jour des webhooks Stripe sont préservées et ne sont plus écrasées par les données Google Sheets. Le rafraîchissement automatique garantit que les données sont à jour. Le badge "Payé" n'apparaît qu'une seule fois.

## Gestion des salles de ventes avec Firestore - Janvier 2025
- **Problème résolu** : Les salles de ventes n'étaient pas sauvegardées et les devis n'étaient pas automatiquement classés par salle de ventes
- **Solution implémentée** :
  1. **Hook `useAuctionHouses`** : Nouveau hook React Query pour gérer les salles de ventes depuis Firestore
     - Chargement des salles de ventes depuis la collection `auctionHouses`
     - Ajout d'une salle de ventes avec sauvegarde dans Firestore
     - Suppression d'une salle de ventes depuis Firestore
     - Association automatique des devis correspondants lors de la création
  2. **Page "Salles des ventes"** : Mise à jour pour utiliser Firestore
     - Remplacement des données mockées par les données Firestore
     - Sauvegarde automatique lors de l'ajout d'une salle de ventes
     - Suppression depuis Firestore avec confirmation
     - Messages de confirmation avec le nombre de devis associés
  3. **Association automatique des devis** :
     - Lors de la création d'une salle de ventes, recherche automatique des devis correspondants
     - Comparaison insensible à la casse du nom de la salle de ventes
     - Mise à jour des devis avec le champ `auctionHouseName` dans Firestore
     - Les devis sont automatiquement classés dans la salle de ventes via le filtre `q.lot.auctionHouse === houseName`
  4. **Règles Firestore** : Fichier `firestore.rules` créé
     - Permet la lecture/écriture dans `auctionHouses` pour les utilisateurs authentifiés (anonymes inclus)
     - Règles similaires pour toutes les collections (quotes, shipments, clients, etc.)
     - **IMPORTANT** : Les règles doivent être déployées via Firebase CLI ou configurées manuellement dans la console Firebase
- **Fichiers créés/modifiés** :
  - `front end/src/hooks/use-auction-houses.ts` : Nouveau hook pour gérer les salles de ventes
  - `front end/src/pages/AuctionHouses.tsx` : Mise à jour pour utiliser Firestore
  - `front end/src/types/quote.ts` : Ajout de la propriété `website` dans `AuctionHouse`
  - `firestore.rules` : Règles de sécurité Firestore pour toutes les collections
- **Configuration requise** :
  1. Déployer les règles Firestore :
     ```bash
     firebase deploy --only firestore:rules
     ```
     Ou configurer manuellement dans la console Firebase (voir section "Connexion Firebase")
  2. S'assurer que l'authentification anonyme est activée dans Firebase Console
- **Fonctionnement** :
  1. Création d'une salle de ventes : Sauvegarde dans Firestore (collection `auctionHouses`)
  2. Association automatique : Recherche des devis dont `lot.auctionHouse` correspond au nom de la salle
  3. Classification automatique : Les devis correspondants apparaissent dans l'onglet de la salle de ventes
  4. Persistance : Les salles de ventes sont sauvegardées et persistent après redémarrage
- **Résultat** : Les salles de ventes sont maintenant sauvegardées dans Firestore et persistent après redémarrage. Les devis sont automatiquement classés dans leur salle de ventes pour faciliter la gestion des collectes. Les règles Firestore doivent être configurées pour permettre l'accès aux collections.

## Corrections affichage et compteurs salles de ventes - Janvier 2025
- **Problèmes résolus** :
  1. Le montant affiché dans la colonne "Paiement" était "0€" au lieu du montant réel du devis
  2. Les compteurs "En attente", "Acceptés", "Refusés" n'incluaient pas tous les devis (notamment les devis payés sans statut défini)
  3. Double symbole € affiché (icône + symbole dans le montant)
- **Solutions implémentées** :
  1. **Calcul du montant** : Le montant affiché utilise maintenant le même calcul que dans `QuoteDetail` et `Payments` :
     - **Emballage** (`packagingPrice`) + **Expédition** (`shippingPrice`) + **Assurance** (`insuranceAmount`) = Total affiché
     - Si le total calculé est 0, utilisation de `totalAmount` comme fallback
  2. **Compteurs améliorés** :
     - Création de `getAllQuotesForHouse` pour récupérer TOUS les devis d'une salle (sans filtre de statut)
     - **"En attente"** : Compte les devis avec `auctionHouseStatus === 'awaiting_validation'` OU les devis payés sans statut défini (qui attendent validation)
     - **"Acceptés"** : Compte les devis avec `auctionHouseStatus === 'accepted'`
     - **"Refusés"** : Compte les devis avec `auctionHouseStatus === 'refused'`
     - Les compteurs utilisent `allHouseQuotes` au lieu de `houseQuotes` (qui filtre uniquement les devis payés/en attente de collecte)
  3. **Suppression du double symbole €** : Retrait de l'icône `<Euro />` à gauche, ne gardant que le symbole € dans le montant formaté
- **Fichiers modifiés** :
  - `front end/src/pages/AuctionHouses.tsx` : Correction du calcul du montant, amélioration des compteurs, suppression de l'icône €
- **Résultat** : Le montant affiché est maintenant correct (84.00€ au lieu de 0€), les compteurs incluent tous les devis de chaque salle de ventes (y compris les devis payés sans statut), et l'affichage est plus propre sans double symbole €.

## Gestion des emails pour les collectes - Janvier 2025
- **Problème résolu** :
  1. Erreur "Aucun email trouvé pour [nom de la salle]" lors de l'envoi d'emails de collecte
  2. Impossible de saisir manuellement un email si aucun n'est configuré dans la salle de ventes
  3. Le champ `contact` pouvait contenir un téléphone ou autre, pas forcément un email
- **Solutions implémentées** :
  1. **Champ email dédié** :
     - Ajout de `email?: string` dans l'interface `AuctionHouse` (`front end/src/types/quote.ts`)
     - Séparation claire entre `contact` (téléphone/autre) et `email` (dédié aux collectes)
  2. **Formulaire de création amélioré** :
     - Ajout d'un champ "Email (pour les collectes)" dans le formulaire de création de salle de ventes
     - Le champ `contact` reste pour téléphone/autres contacts
     - Le champ `email` est optionnel mais recommandé pour les collectes
  3. **Récupération d'email améliorée** :
     - Priorité 1 : Champ `email` dédié de la salle des ventes
     - Priorité 2 : Extraction depuis le champ `contact` (si email présent)
     - Mise à jour du hook `use-auction-houses.ts` pour récupérer le champ `email`
  4. **Saisie manuelle dans le dialogue de planification** :
     - Dans le dialogue "Planifier une collecte", un champ email par salle des ventes concernée
     - Si un email est déjà configuré, il est pré-rempli mais peut être modifié
     - Si aucun email n'est trouvé, le champ est requis et l'utilisateur peut le saisir
     - Validation avant envoi : tous les emails doivent être remplis
  5. **Route backend** :
     - Ajout de `POST /api/send-collection-email` dans `front end/server/ai-proxy.js`
     - Route pour envoyer des emails de collecte aux salles des ventes
     - Utilise le même système Resend que pour les emails de devis
- **Fichiers modifiés** :
  - `front end/src/types/quote.ts` : Ajout de `email?: string` dans `AuctionHouse`
  - `front end/src/pages/AuctionHouses.tsx` : Ajout du champ email dans le formulaire, affichage de l'email dans les détails
  - `front end/src/pages/Collections.tsx` : Amélioration de `getAuctionHouseEmail`, ajout de champs email dans le dialogue de planification, validation des emails
  - `front end/src/hooks/use-auction-houses.ts` : Récupération du champ `email` depuis Firestore
  - `front end/server/ai-proxy.js` : Ajout de la route `POST /api/send-collection-email`
- **Configuration requise** :
  - Aucune configuration supplémentaire nécessaire
  - Le système utilise le même `RESEND_API_KEY` et `EMAIL_FROM` que pour les emails de devis
- **Fonctionnement** :
  1. **Création d'une salle de ventes** : L'utilisateur peut maintenant saisir un email dédié pour les collectes
  2. **Planification d'une collecte** :
     - Sélectionner les devis à collecter
     - Cliquer sur "Planifier une collecte"
     - Le dialogue affiche un champ email par salle des ventes concernée
     - Si un email est déjà configuré, il est pré-rempli
     - Si aucun email n'est trouvé, le champ est requis et l'utilisateur peut le saisir
     - Validation : tous les emails doivent être remplis avant l'envoi
  3. **Envoi de l'email** :
     - L'email est envoyé via Resend avec le contenu des lots sélectionnés
     - Date, heure et note optionnelle sont inclus dans l'email
     - Un email est envoyé par salle des ventes concernée
- **Résultat** : Les utilisateurs peuvent maintenant configurer un email dédié pour chaque salle de ventes, et peuvent saisir manuellement un email lors de la planification d'une collecte si aucun n'est configuré. Le système gère automatiquement la priorité entre le champ email dédié et l'extraction depuis le champ contact.

## Améliorations prix d'emballage et bouton Vérifier - Janvier 2025
- **Problèmes résolus** :
  1. Les prix de cartons n'étaient pas trouvés à cause de préfixes " / — " dans les références du Google Sheet
  2. Le prix d'emballage n'était pas toujours calculé correctement ou affiché
  3. Impossible de vérifier un devis depuis l'interface (passage de "À vérifier" à "Vérifié")
  4. Erreurs Firestore dues à des valeurs `undefined` dans les objets
- **Solutions implémentées** :
  1. **Nettoyage des références de cartons** :
     - Fonction `cleanCartonRef` dans `front end/src/lib/pricing.ts` pour supprimer les préfixes " / — " ou " / - "
     - Application automatique lors du chargement des prix depuis Google Sheets
     - Affichage des noms de cartons sans préfixe dans l'interface
     - Recherche flexible : variations de casse, espaces, tirets
     - Recherche par dimensions si la référence n'est pas trouvée (tolérance ±2cm)
  2. **Amélioration du calcul du prix d'emballage** :
     - Cache des dimensions de cartons (`cartonDataCache`) pour recherche par dimensions
     - Recherche multi-critères : référence exacte → variations → partielle → dimensions
     - Logs détaillés pour diagnostiquer les problèmes de recherche
     - Recalcul automatique via `useEffect` si le prix est manquant ou à 0
     - Bouton de recalcul manuel (icône RefreshCw) dans l'onglet "Paiements"
  3. **Bouton "Vérifier" dans le bloc Actions** :
     - Affiché uniquement quand le statut du devis est `"to_verify"`
     - Met à jour le statut à `"verified"` dans Firestore
     - Ajoute un événement "Devis vérifié" à l'historique
     - Le bouton disparaît après vérification
     - Utilise les fonctions `createTimelineEvent` et `timelineEventToFirestore` pour la cohérence
  4. **Correction des erreurs Firestore** :
     - Fonction `cleanForFirestore` pour nettoyer les objets avant envoi (supprime les `undefined`)
     - Amélioration de `timelineEventToFirestore` pour ne pas inclure `user` si `undefined`
     - Nettoyage du timeline avant sauvegarde dans Firestore
     - Protection contre les valeurs `undefined` dans tous les objets envoyés à Firestore
- **Fichiers modifiés** :
  - `front end/src/lib/pricing.ts` :
    - Fonction `cleanCartonRef` exportée pour usage global
    - `loadCartonPrices` : Nettoyage des références et cache des dimensions
    - `getCartonPrice` : Recherche multi-critères (référence, variations, dimensions)
    - Cache `cartonDataCache` pour stocker les dimensions des cartons
  - `front end/src/pages/QuoteDetail.tsx` :
    - Affichage des noms de cartons nettoyés (priorité à `label`, fallback à `ref`)
    - `useEffect` pour recalcul automatique des prix manquants
    - Bouton de recalcul manuel du prix d'emballage
    - Fonction `handleVerifyQuote` pour vérifier un devis
    - Fonction `cleanForFirestore` pour nettoyer les objets
    - Nettoyage du timeline avant sauvegarde
  - `front end/src/components/quotes/AttachAuctionSheet.tsx` :
    - Affichage des références de cartons nettoyées
  - `front end/server/ai-proxy.js` :
    - `suggestCartonForLots` : Nettoyage des références et labels de cartons
    - Email : Affichage des noms de cartons nettoyés (priorité à `label`)
  - `front end/src/lib/quoteTimeline.ts` :
    - `timelineEventToFirestore` : Nettoyage des valeurs `undefined` (ne pas inclure `user` si `undefined`)
- **Structure des données** :
  - **Cartons** : Les références sont nettoyées lors du chargement et de l'affichage
  - **Timeline** : Les événements sont nettoyés avant sauvegarde (pas de `undefined`)
  - **Firestore** : Tous les objets sont nettoyés via `cleanForFirestore` avant envoi
- **Fonctionnement** :
  1. **Recherche de prix de carton** :
     - Tentative 1 : Référence exacte (nettoyée)
     - Tentative 2 : Variations (sans espaces, avec tirets, minuscules)
     - Tentative 3 : Recherche partielle (contient/est contenu)
     - Tentative 4 : Recherche par dimensions si fournies (tolérance ±2cm)
  2. **Recalcul automatique** :
     - Si `packagingPrice` est 0 ou manquant et qu'un carton est disponible → recalcul automatique
     - Si `shippingPrice` est 0 ou manquant et que dimensions + pays sont disponibles → recalcul automatique
     - Sauvegarde automatique dans Firestore après recalcul
  3. **Vérification d'un devis** :
     - Clic sur "Vérifier" → Statut passe à `"verified"`
     - Événement ajouté à l'historique
     - Bouton disparaît (car statut n'est plus `"to_verify"`)
- **Résultat** : Les prix de cartons sont maintenant correctement trouvés malgré les préfixes dans Google Sheets. Le prix d'emballage est automatiquement recalculé si manquant, et un bouton permet le recalcul manuel. Les devis peuvent être vérifiés depuis l'interface avec mise à jour automatique de l'historique. Les erreurs Firestore dues aux valeurs `undefined` sont corrigées.

## Gestion des dimensions réelles et workflow de préparation (2024)

### Améliorations apportées

#### 1. Page Collections
- **Exclusion des devis collectés** : Les devis marqués comme "collectés" disparaissent automatiquement de la liste principale des collectes
- **Filtrage intelligent** : Seuls les devis en attente de collecte (`awaiting_collection`) ou payés mais non encore collectés sont affichés
- **Statistiques** : Le compteur "Collectés aujourd'hui" continue de fonctionner même si les devis ne sont plus dans la liste principale

#### 2. Page Préparation
- **Alerte "Dimensions non conformes" intelligente** :
  - Calcul du poids volumétrique estimé : `(L × l × H) / 5000`
  - Calcul du poids facturé estimé : `max(poids volumétrique estimé, poids réel estimé)`
  - Calcul du poids volumétrique réel : `(L × l × H) / 5000` (si dimensions réelles disponibles)
  - Calcul du poids facturé réel : `max(poids volumétrique réel, poids réel mesuré)`
  - **L'alerte ne s'affiche QUE si `poids facturé réel > poids facturé estimé`** (surcoût nécessaire)
  - Si les dimensions réelles sont inférieures ou égales aux estimées → pas d'alerte (pas de surcoût)
- **Bouton "Modifier" pour les dimensions réelles** :
  - Apparaît uniquement après avoir confirmé les dimensions réelles
  - Permet de corriger une erreur de saisie
  - Le dialogue se pré-remplit avec les dimensions réelles actuelles (au lieu des estimées)
  - Titre et description du dialogue adaptés selon le contexte (modification vs création)
- **Fonctionnalité "Prêt pour expédition"** :
  - Bouton visible uniquement si les dimensions sont conformes (pas d'alerte)
  - Met à jour le statut du devis à `'awaiting_shipment'`
  - Ajoute un événement à l'historique : "En attente d'expédition"
  - Le devis disparaît de la page "Préparation" et apparaît dans "Expéditions"

#### 3. Page Détail du devis (QuoteDetail)
- **Alerte "Dimensions non conformes" cohérente** :
  - Même logique que la page Préparation (basée sur le poids facturé)
  - L'alerte ne s'affiche que si un surcoût est nécessaire
  - Affichage des boutons "Ajouter surcoût" et "Nouveau lien" uniquement en cas de non-conformité

#### 4. Navigation et interactions
- **QuoteCard** : Les devis dans la page "Pipeline" sont maintenant cliquables et ouvrent la page de détail
- **QuoteTimeline** : Ajout des statuts `'preparation'` et `'awaiting_shipment'` dans le mapping des descriptions

#### 5. Gestion des dimensions réelles dans Firestore
- **Récupération** : Les dimensions réelles sont récupérées depuis Firestore et appliquées à `lot.realDimensions`
- **Préservation** : Les dimensions réelles saisies manuellement ne sont jamais écrasées lors des mises à jour depuis Google Sheets
- **Structure** : Les dimensions réelles sont stockées au niveau du document quote dans Firestore avec le format :
  ```typescript
  {
    length: number,
    width: number,
    height: number,
    weight: number,
    estimated: false
  }
  ```

### Fichiers modifiés
- `front end/src/pages/Collections.tsx` :
  - Filtrage pour exclure les devis collectés de la liste principale
  - Statistiques corrigées pour compter tous les devis collectés
- `front end/src/pages/Preparation.tsx` :
  - Logique de détection de non-conformité basée sur le poids facturé
  - Fonction `handleOpenDimensionsDialog` avec paramètre `isEdit`
  - Fonction `handleReadyForShipment` pour mettre à jour le statut
  - Bouton "Modifier" pour corriger les dimensions réelles
  - Dialogue dynamique (titre/description selon le contexte)
- `front end/src/pages/QuoteDetail.tsx` :
  - Logique de détection de non-conformité basée sur le poids facturé (cohérence avec Preparation)
- `front end/src/components/quotes/QuoteCard.tsx` :
  - Navigation vers la page de détail au clic (version compacte)
- `front end/src/lib/quoteEnhancements.ts` :
  - Récupération des `realDimensions` depuis Firestore
  - Application des dimensions réelles à `lot.realDimensions`
  - Préservation des dimensions réelles dans `upsertQuotesToFirestore`
- `front end/src/lib/quoteTimeline.ts` :
  - Ajout de `'preparation'` et `'awaiting_shipment'` dans `getStatusDescription`

### Fonctionnement du workflow
1. **Collecte** : Un devis payé apparaît dans "Collectes" → Clic sur "Marquer comme collecté" → Le devis disparaît de la liste
2. **Préparation** : Le devis apparaît dans "Préparation" → Saisie des dimensions réelles → Si conformes, clic sur "Prêt pour expédition"
3. **Expédition** : Le devis apparaît dans "Expéditions" avec le statut `'awaiting_shipment'`

### Résultat

## Intégration Gmail OAuth - Janvier 2025

### Vue d'ensemble
Intégration complète de Gmail OAuth pour synchroniser automatiquement les emails des clients et les associer aux devis correspondants. Le système permet de connecter un compte Gmail (limité à 1 seul compte actif) et synchronise automatiquement les nouveaux emails toutes les 60 secondes.

### Architecture

#### Backend (`front end/server/ai-proxy.js`)
- **Routes OAuth** :
  - `GET /auth/gmail/start` : Démarre le flux OAuth, redirige vers Google
  - `GET /auth/gmail/callback` : Gère le callback OAuth, sauvegarde les tokens dans Firestore
- **Routes API** :
  - `GET /api/email-accounts` : Récupère les comptes Gmail connectés
  - `DELETE /api/email-accounts/:accountId` : Déconnecte un compte Gmail
  - `GET /api/devis/:devisId/messages` : Récupère tous les messages (RESEND + Gmail) pour un devis
- **Synchronisation automatique** :
  - Polling toutes les 60 secondes pour synchroniser les nouveaux emails
  - Utilise `historyId` Gmail pour ne récupérer que les nouveaux messages
  - Association automatique des emails aux devis via l'email du client

#### Frontend (`front end/src/pages/Settings.tsx`)
- **Page Paramètres** : Nouvel onglet "Comptes Email"
- **Limitation à 1 compte** : Un seul compte Gmail peut être actif à la fois
- **Interface** :
  - Bouton "Connecter un compte Gmail" (si aucun compte)
  - Bouton "Changer de compte" (si un compte est connecté)
  - Bouton "Déconnecter" pour désactiver le compte actuel
  - Affichage du compte actif avec statut et dernière synchronisation

#### Modèles Firestore
- **`emailAccounts`** : Stocke les comptes Gmail connectés
  - `userId`, `provider`, `emailAddress`
  - `oauth` (tokens), `gmail.lastHistoryId`
  - `isActive`, `createdAt`, `lastSyncAt`
- **`emailMessages`** : Stocke tous les emails (entrants et sortants)
  - `userId`, `emailAccountId`, `devisId`
  - `direction` (IN/OUT), `source` (GMAIL/RESEND)
  - `from`, `to`, `subject`, `bodyText`, `bodyHtml`
  - `gmailMessageId`, `gmailThreadId`
  - `receivedAt`, `createdAt`

### Configuration requise

#### 1. Google Cloud Console
1. Créer un projet Google Cloud
2. Activer Gmail API
3. Créer des identifiants OAuth 2.0 (type "Web application")
4. Configurer l'écran de consentement OAuth
5. Ajouter les utilisateurs de test (mode "Test")
6. URI de redirection autorisée : `http://localhost:5174/auth/gmail/callback`

#### 2. Variables d'environnement (`front end/.env.local`)
```env
GMAIL_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=votre_client_secret
GMAIL_REDIRECT_URI=http://localhost:5174/auth/gmail/callback
```

#### 3. Proxy Vite (`front end/vite.config.ts`)
Le proxy `/auth` a été ajouté pour rediriger les requêtes OAuth vers le backend :
```ts
proxy: {
  "/api": { target: "http://localhost:5174", ... },
  "/auth": { target: "http://localhost:5174", ... }
}
```

### Fonctionnalités

#### 1. Connexion Gmail
- Clic sur "Connecter un compte Gmail" → Redirection vers Google OAuth
- Autorisation de l'application (lecture seule Gmail)
- Callback automatique → Sauvegarde dans Firestore
- Désactivation automatique des autres comptes (limite à 1)

#### 2. Synchronisation automatique
- Polling toutes les 60 secondes
- Utilise `historyId` pour ne récupérer que les nouveaux messages
- Association automatique aux devis via `clientEmail`
- Stockage dans `emailMessages` avec lien vers `devisId`

#### 3. Affichage des messages
- Onglet "Messages" dans la page détail du devis
- Affiche les emails RESEND (envoyés) et Gmail (reçus)
- Refresh automatique toutes les 30 secondes
- Affichage chronologique avec badges direction/source

### Fichiers créés/modifiés

#### Nouveaux fichiers
- `front end/src/pages/Settings.tsx` : Page paramètres avec onglet Gmail
- `front end/src/hooks/use-email-messages.ts` : Hook React Query pour les messages
- `front end/src/lib/emailMessages.ts` : Fonctions de récupération des messages
- `GMAIL_OAUTH_SETUP.md` : Guide complet de configuration
- `GMAIL_OAUTH_FIX_403.md` : Guide de résolution erreur 403

#### Fichiers modifiés
- `front end/server/ai-proxy.js` :
  - Routes OAuth Gmail (`/auth/gmail/start`, `/auth/gmail/callback`)
  - Routes API (`/api/email-accounts`, `/api/devis/:devisId/messages`)
  - Synchronisation automatique Gmail (polling 60s)
  - Sauvegarde des emails RESEND dans `emailMessages`
- `front end/src/App.tsx` : Route `/settings` ajoutée
- `front end/src/components/layout/AppSidebar.tsx` : Lien "Paramètres" ajouté
- `front end/src/pages/QuoteDetail.tsx` : Onglet "Messages" avec composant `EmailMessagesTab`
- `front end/src/types/quote.ts` : Interfaces `EmailAccount` et `EmailMessage` ajoutées
- `front end/vite.config.ts` : Proxy `/auth` ajouté

### Sécurité
- **Tokens OAuth** : Stockés uniquement dans Firestore, jamais exposés au frontend
- **Permissions** : Lecture seule Gmail (`gmail.readonly`)
- **User ID** : Utilise temporairement `CURRENT_USER_ID = "dev-user-1"` (à remplacer par authentification réelle)
- **Limitation** : 1 seul compte actif par utilisateur

### Dépannage
- **Erreur 403: access_denied** : Ajouter l'email comme "Test user" dans Google Cloud Console
- **Erreur "Gmail OAuth non configuré"** : Vérifier les variables d'environnement dans `.env.local`
- **Erreur "redirect_uri_mismatch"** : Vérifier que l'URI dans Google Cloud Console correspond exactement à `GMAIL_REDIRECT_URI`
- **Les emails ne se synchronisent pas** : Vérifier les logs backend, vérifier que le compte est actif

### Documentation complète
Voir `GMAIL_OAUTH_SETUP.md` pour le guide détaillé de configuration étape par étape.

### Résultat
- Les alertes "Dimensions non conformes" ne s'affichent que lorsqu'un surcoût est réellement nécessaire
- Les dimensions réelles peuvent être corrigées après saisie
- Le workflow de préparation est complet : collecte → préparation → expédition
- Les devis collectés disparaissent automatiquement de la liste des collectes

---

## 🔐 Isolation Multi-Tenant - Gmail & Stripe Connect

**Date** : Janvier 2025

### Vue d'ensemble

Implémentation complète de l'isolation des intégrations Gmail et Stripe Connect par compte SaaS (`saasAccountId`). Chaque compte MBE a désormais ses propres intégrations, complètement isolées des autres comptes.

### Problème résolu

**Avant** : Les intégrations Gmail et Stripe étaient partagées entre tous les comptes. Quand un utilisateur se connectait avec un compte différent, il voyait les mêmes intégrations Gmail/Stripe que le compte précédent.

**Après** : Chaque compte SaaS a ses propres intégrations, complètement isolées. Un utilisateur ne voit que ses propres connexions Gmail et Stripe.

### Modifications principales

1. **Middleware `requireAuth`** : Extrait automatiquement `saasAccountId` depuis le token Firebase
2. **Gmail OAuth** : Stockage dans `saasAccounts/{id}/integrations/gmail` au lieu de `emailAccounts`
3. **Stripe Connect** : Stockage dans `saasAccounts/{id}/integrations/stripe` au lieu de `clients`
4. **Polling Gmail** : Itère sur tous les comptes SaaS avec Gmail connecté
5. **Frontend** : Utilitaire `authenticatedFetch` pour passer automatiquement le token Firebase
6. **Routes protégées** : Toutes les opérations sensibles nécessitent l'authentification

### Fichiers créés/modifiés

#### Nouveaux fichiers
- `front end/src/lib/api.ts` : Utilitaire `authenticatedFetch` pour les requêtes authentifiées
- `front end/src/components/auth/AccountMenu.tsx` : Menu dropdown avec avatar et options
- `front end/src/pages/Account.tsx` : Page "Mon compte" avec toutes les informations
- `MULTI_TENANT_ISOLATION.md` : Documentation complète de l'isolation multi-tenant

#### Fichiers modifiés
- `front end/server/ai-proxy.js` :
  - Middleware `requireAuth` amélioré pour extraire `saasAccountId`
  - Routes Gmail OAuth modifiées pour utiliser `saasAccountId`
  - Polling Gmail multi-tenant
  - Routes protégées avec `requireAuth`
- `front end/server/stripe-connect.js` :
  - Utilisation de `saasAccountId` au lieu de `clientId`
  - Stockage dans `saasAccounts/{id}/integrations/stripe`
  - Webhook utilise `saasAccountId` depuis metadata
- `front end/src/lib/stripeConnect.ts` : Plus besoin de passer `clientId`, utilise `authenticatedFetch`
- `front end/src/pages/Settings.tsx` : Utilise `authenticatedFetch` pour toutes les requêtes
- `firestore.rules` : Règles mises à jour pour `users` et `saasAccounts`

### Structure Firestore

```
saasAccounts/{saasAccountId}
  └── integrations
      ├── gmail
      │   ├── connected: boolean
      │   ├── email: string
      │   ├── accessToken: string
      │   ├── refreshToken: string
      │   └── ...
      └── stripe
          ├── connected: boolean
          └── stripeAccountId: string
```

### Documentation complète

Voir `MULTI_TENANT_ISOLATION.md` pour la documentation détaillée avec :
- Architecture complète
- Modifications backend et frontend
- Guide de migration
- Checklist de sécurité
- Exemples de code

### Résultat

- ✅ Chaque compte SaaS a ses propres intégrations Gmail et Stripe
- ✅ Isolation complète des données par `saasAccountId`
- ✅ Aucun token stocké globalement
- ✅ Authentification requise pour toutes les opérations sensibles
- ✅ Multi-tenancy fonctionnel et sécurisé
- Navigation améliorée : clic sur un devis dans Pipeline ouvre sa page de détail

## Synchronisation et affichage des emails (Janvier 2026)

### Contexte
L'intégration Gmail était fonctionnelle mais les messages ne s'affichaient pas dans l'interface. Deux problèmes bloquants :
1. **Index Firestore manquant** : Les requêtes avec `where` + `orderBy` nécessitent un index composite
2. **Permissions Firestore** : Le frontend tentait de lire directement la collection `emailMessages`, ce qui est interdit par les règles de sécurité

### Solutions implémentées

#### 1. Architecture SaaS correcte
- **Backend uniquement** : Seul le backend (Firebase Admin SDK) accède à la collection `emailMessages`
- **API REST** : Le frontend passe exclusivement par `/api/devis/:devisId/messages`
- **Sécurité** : Les règles Firestore interdisent l'accès direct du frontend à `emailMessages`

#### 2. Index Firestore requis
Pour permettre les requêtes `where('devisId', '==', devisId).orderBy('createdAt')`, un index composite est obligatoire :

**Collection** : `emailMessages`
**Champs** :
- `devisId` — Ascendant (ou Descendant selon l'ordre souhaité)
- `createdAt` — Descendant (pour afficher les plus récents en premier)

**Méthode de création** :
1. **Via console Firebase** : Cliquer sur le lien fourni dans l'erreur `FAILED_PRECONDITION`
2. **Via firebase.json** :
```json
{
  "indexes": [
    {
      "collectionGroup": "emailMessages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "devisId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```
Puis : `firebase deploy --only firestore:indexes`

#### 3. Tri chronologique inversé
Les messages sont maintenant affichés du **plus récent au plus ancien** pour une meilleure UX :
- **Backend** (`ai-proxy.js`) : `orderBy('createdAt', 'desc')`
- **Frontend** (`emailMessages.ts`) : Tri inversé `dateB.getTime() - dateA.getTime()`
- Les nouveaux messages apparaissent toujours en haut de la liste

#### 4. Fallback intelligent
Si l'index n'est pas créé, le backend récupère les messages sans `orderBy` et les trie en mémoire pour éviter un blocage complet.

### Fichiers modifiés

#### Backend
- `front end/server/ai-proxy.js` :
  - Endpoint `/api/devis/:devisId/messages` : Utilise Firebase Admin SDK
  - Tri descendant (`desc`) pour afficher les plus récents en premier
  - Fallback tri en mémoire si index manquant
  - Normalisation des champs `to`, `receivedAt`, `createdAt`

#### Frontend
- `front end/src/lib/emailMessages.ts` :
  - Suppression de toute lecture directe Firestore
  - Utilisation exclusive de l'API backend
  - Tri inversé pour afficher les messages récents en haut
  - Gestion des erreurs et logs détaillés

### Vérification du fonctionnement

#### Logs backend confirmant la détection
```
[Gmail Sync] ✅ Message stocké: { 
  messageId: '19bb3efd31c4ffa7', 
  from: '1clementbrault@gmail.com', 
  devisId: 'gs_dd05289b' 
}
```

#### Logs frontend confirmant la récupération
```
[emailMessages] ✅ Messages récupérés pour devis (API uniquement): {
  devisId: 'gs_dd05289b',
  count: 3
}
```

### Checklist de déploiement
- ✅ Créer l'index composite Firestore (obligatoire)
- ✅ Vérifier que les règles Firestore interdisent l'accès direct à `emailMessages`
- ✅ Tester l'affichage des messages dans l'onglet "Messages"
- ✅ Vérifier que les nouveaux emails apparaissent en haut de la liste
- ✅ Confirmer que la synchronisation Gmail fonctionne (polling 60s)

### Résultat final
- Les emails Gmail sont correctement détectés et stockés dans Firestore
- Les messages s'affichent dans l'onglet "Messages" de chaque devis
- Les plus récents apparaissent en haut pour une meilleure visibilité
- L'architecture respecte les bonnes pratiques SaaS (backend seul accède aux données sensibles)

## Gestion du timeline et workflow de paiement (Janvier 2026)

### Contexte
Plusieurs problèmes affectaient l'historique des devis et le workflow de paiement :
1. **Erreur "Invalid Date"** : Dates invalides dans le timeline provoquaient des erreurs lors de la génération de liens de paiement
2. **Perte d'historique** : Les événements précédents disparaissaient lors de l'ajout de nouveaux événements
3. **Workflow incorrect** : Le statut passait à "en attente de paiement" dès la génération du lien, alors qu'il devrait changer uniquement lors de l'envoi du devis au client

### Problèmes identifiés

#### 1. Gestion des dates invalides
- Le timeline contenait des événements avec des dates mal formatées ou invalides
- La fonction `timelineEventToFirestore` ne validait pas les dates avant conversion
- Cela provoquait des erreurs `Invalid Date` lors de la sauvegarde dans Firestore

#### 2. Perte d'historique
- Le code utilisait uniquement `quote.timeline` depuis l'état React local
- Cet état pouvait être obsolète ou incomplet
- Les modifications dans Firestore n'étaient pas toujours synchronisées avant l'ajout d'un nouvel événement

#### 3. Workflow de paiement incorrect
- Le statut passait à `awaiting_payment` dès la génération du lien
- Logique métier incorrecte : un lien généré mais non envoyé ne signifie pas qu'on attend un paiement

### Solutions implémentées

#### 1. Validation robuste des dates (`quoteTimeline.ts`)

```typescript
export function timelineEventToFirestore(event: TimelineEvent) {
  let firestoreDate;
  
  if (event.date instanceof Date && !isNaN(event.date.getTime())) {
    // Date JavaScript valide
    firestoreDate = Timestamp.fromDate(event.date);
  } else if (event.date?.toDate) {
    // Déjà un Timestamp Firestore
    firestoreDate = event.date;
  } else if (event.date) {
    // Essayer de parser
    const parsedDate = new Date(event.date);
    if (!isNaN(parsedDate.getTime())) {
      firestoreDate = Timestamp.fromDate(parsedDate);
    } else {
      // Date invalide → utiliser maintenant + warning
      console.warn('[quoteTimeline] Date invalide, utilisation de Timestamp.now()');
      firestoreDate = Timestamp.now();
    }
  } else {
    firestoreDate = Timestamp.now();
  }
  
  return {
    id: event.id,
    date: firestoreDate,
    status: event.status,
    description: event.description,
    user: event.user || undefined
  };
}
```

**Avantages** :
- ✅ Gère tous les formats de dates (Date, Timestamp, string)
- ✅ Fallback sur `Timestamp.now()` si date invalide
- ✅ Warning en console pour debugging
- ✅ Plus d'erreur "Invalid Date"

#### 2. Récupération du timeline depuis Firestore (`QuoteDetail.tsx`, `Payments.tsx`)

```typescript
// Récupérer le timeline existant depuis Firestore
const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
const existingData = quoteDoc.data();
const existingTimeline = existingData?.timeline || quote.timeline || [];

// Nettoyer le timeline (filtrer dates invalides)
const cleanedExistingTimeline = existingTimeline.filter((event: any) => {
  if (!event.date) return false;
  const date = event.date?.toDate ? event.date.toDate() : new Date(event.date);
  return !isNaN(date.getTime());
});

// Ajouter le nouvel événement
const updatedTimeline = [...cleanedExistingTimeline, newEvent];
```

**Avantages** :
- ✅ Récupère toujours la version la plus à jour depuis Firestore
- ✅ Préserve tous les événements précédents
- ✅ Filtre les dates invalides pour éviter la propagation d'erreurs
- ✅ Historique complet et chronologique

#### 3. Workflow de paiement corrigé

**Étape 1 : Génération du lien de paiement**
```typescript
// Événement ajouté à l'historique
createTimelineEvent('verified', `Lien de paiement créé (${total.toFixed(2)}€)`)

// Statut reste inchangé (ex: 'verified')
// Le devis n'est PAS encore en attente de paiement
```

**Étape 2 : Envoi du devis par email**
```typescript
// Si un lien de paiement actif existe
if (hasActivePaymentLink) {
  // Événement ajouté
  createTimelineEvent('awaiting_payment', 'Devis envoyé avec lien de paiement au client')
  
  // Statut change maintenant
  status: 'awaiting_payment'
  paymentStatus: 'pending'
}
```

**Étape 3 : Réception du paiement (webhook Stripe)**
```typescript
// Webhook met à jour automatiquement
{
  paymentLinks: [...], // Lien marqué "paid"
  paymentStatus: 'paid',
  status: 'awaiting_collection',
  timeline: [..., {
    status: 'paid',
    description: 'Paiement reçu et confirmé',
    user: 'system'
  }]
}
```

### Workflow complet

```
1. Génération du lien
   ├─ Statut: inchangé (ex: verified)
   ├─ Événement: "Lien de paiement créé (33.00€)"
   └─ Le lien est sauvegardé dans paymentLinks[]

2. Envoi du devis avec le lien
   ├─ Statut: → awaiting_payment
   ├─ PaymentStatus: → pending
   └─ Événement: "Devis envoyé avec lien de paiement au client"

3. Client paie via le lien
   ├─ Webhook Stripe détecte le paiement
   ├─ Statut: → awaiting_collection
   ├─ PaymentStatus: → paid
   ├─ Lien marqué "paid" dans paymentLinks[]
   ├─ Autres liens actifs désactivés
   └─ Événement: "Paiement reçu et confirmé"

4. Collecte du lot
   ├─ Statut: → collected
   └─ Événement: "Lot collecté auprès de la salle des ventes"
```

### Fichiers modifiés

#### Backend
- Aucune modification (webhook Stripe déjà fonctionnel)

#### Frontend
- **`src/lib/quoteTimeline.ts`** :
  - Validation complète des dates dans `timelineEventToFirestore`
  - Gestion de tous les formats (Date, Timestamp, string, invalide)
  - Fallback sur `Timestamp.now()` avec warning

- **`src/pages/QuoteDetail.tsx`** :
  - Récupération du timeline depuis Firestore avant ajout d'événements
  - Filtrage des dates invalides
  - Workflow de paiement corrigé (génération ≠ envoi)
  - Événement "Devis envoyé avec lien" lors de l'envoi email

- **`src/pages/Payments.tsx`** :
  - Même logique de récupération du timeline depuis Firestore
  - Cohérence avec QuoteDetail.tsx

### Système de webhook Stripe (rappel)

Le webhook écoute 4 événements :
- `checkout.session.completed`
- `payment_intent.succeeded`
- `charge.succeeded`
- `payment.link.succeeded`

**Actions du webhook** :
1. Identifie le devis (par référence ou linkId)
2. Marque le lien comme "paid" dans `paymentLinks[]`
3. Désactive les autres liens actifs
4. Change `paymentStatus` → "paid"
5. Change `status` → "awaiting_collection"
6. Ajoute événement "Paiement reçu et confirmé"
7. Désactive le lien dans Stripe (empêche réutilisation)

### Avantages

**Timeline** :
- ✅ Plus d'erreur "Invalid Date"
- ✅ Historique complet et préservé
- ✅ Dates toujours valides avec fallback
- ✅ Déduplication automatique (fenêtre 5 min)

**Workflow de paiement** :
- ✅ Logique métier respectée
- ✅ Pipeline reflète l'état réel du processus
- ✅ Statuts cohérents avec les actions
- ✅ Traçabilité complète dans l'historique

**UX** :
- ✅ Événement "Lien de paiement créé (XX.XX€)" clair et informatif
- ✅ Distinction entre "lien créé" et "en attente de paiement"
- ✅ Historique chronologique et complet
- ✅ Pas de perte d'information

### Résultat
- Le timeline est robuste et ne perd jamais d'événements
- Les dates invalides sont gérées automatiquement
- Le workflow de paiement respecte la logique métier
- L'historique est complet, chronologique et informatif

---

## 📊 Intégration Google Sheets Typeform

**Date** : Janvier 2025

### Vue d'ensemble

Implémentation complète de l'intégration Google Sheets pour synchroniser automatiquement les devis depuis les formulaires Typeform. Chaque compte SaaS (MBE) peut connecter son propre Google Sheet, et les devis sont créés automatiquement avec isolation complète par `saasAccountId`.

### Fonctionnalités principales

1. **OAuth Google Sheets** : Connexion sécurisée par compte SaaS
2. **Synchronisation automatique** : Polling toutes les 90 secondes
3. **Mapping complet** : Toutes les colonnes Typeform mappées vers structure Quote
4. **Gestion modes de livraison** : Client, destinataire, point relais UPS
5. **Détection doublons** : Par `sheetRowIndex` pour éviter les créations multiples
6. **UI complète** : Onglet Google Sheets dans Settings avec statut et actions

### Structure des colonnes Typeform

- **Colonnes 0-9** : Informations client (Prénom, Nom, Téléphone, Email, Adresse complète)
- **Colonne 10** : Mode de livraison ("Oui" = client, "Non" = destinataire, "Point relais UPS" = pickup)
- **Colonnes 11-20** : Informations destinataire (si différent du client)
- **Colonne 21** : Adresse point relais UPS (si choisi)
- **Colonnes 22-26** : Bordereau, notes, assurance, métadonnées Typeform

### Logique de détection du mode de livraison

1. **Client = Destinataire** : Colonne 10 = "Oui" → Mode `'client'`
2. **Point relais UPS** : Colonne 10 contient "point relais" ET colonne 21 remplie → Mode `'pickup'`
3. **Destinataire différent** : Colonne 10 = "Non" ET colonnes 11-20 remplies → Mode `'receiver'`

### Routes Backend

- `GET /auth/google-sheets/start` : Démarre le flux OAuth (protégée)
- `GET /auth/google-sheets/callback` : Callback OAuth, stocke les tokens
- `GET /api/google-sheets/status` : Récupère le statut de la connexion (protégée)
- `DELETE /api/google-sheets/disconnect` : Déconnecte Google Sheets (protégée)
- `POST /api/google-sheets/resync` : Force une resynchronisation (protégée)

### Fichiers créés/modifiés

#### Nouveaux fichiers
- `GOOGLE_SHEETS_INTEGRATION.md` : Documentation complète de l'intégration

#### Fichiers modifiés
- `front end/server/ai-proxy.js` :
  - Configuration OAuth Google Sheets
  - Routes OAuth et API
  - Fonctions de synchronisation (`syncSheetForAccount`, `syncAllGoogleSheets`)
  - Mapping complet des colonnes Typeform vers Quote
  - Polling automatique toutes les 90 secondes
- `front end/src/pages/Settings.tsx` :
  - Nouvel onglet "Google Sheets"
  - UI complète avec statut, actions (connecter, resync, déconnecter)
  - Gestion des erreurs et messages de succès

### Configuration requise

**Variables d'environnement (.env.local)** :
```env
GOOGLE_SHEETS_CLIENT_ID=...
GOOGLE_SHEETS_CLIENT_SECRET=...
GOOGLE_SHEETS_REDIRECT_URI=http://localhost:5174/auth/google-sheets/callback
```

**Google Cloud Console** :
- Activer Google Sheets API
- Activer Google Drive API
- Créer OAuth Client ID (type Web)
- Ajouter URI de redirection

### Structure Quote créée

Chaque devis créé depuis Google Sheets contient :
- `client` : Informations complètes du client
- `delivery` : Informations de livraison (mode, contact, adresse)
- `auctionSheet` : Structure pour le bordereau (sera complété lors de l'upload)
- `options` : Options (assurance, express, etc.)
- `status` : 'new' par défaut
- `timeline` : Événement initial "Devis créé depuis Google Sheets Typeform"
- `typeformToken` : Token Typeform pour référence
- `reference` : Référence générée automatiquement (GS-timestamp-ligne)

### Documentation complète

Voir `GOOGLE_SHEETS_INTEGRATION.md` pour la documentation détaillée avec :
- Architecture complète
- Mapping détaillé des colonnes
- Logique de détection des modes de livraison
- Exemples de code
- Guide de configuration
- Workflow de synchronisation

### Résultat

- ✅ Chaque compte SaaS peut connecter son propre Google Sheet
- ✅ Synchronisation automatique toutes les 90 secondes
- ✅ Création automatique de devis complets avec toutes les informations
- ✅ Gestion des différents modes de livraison (client, destinataire, point relais UPS)
- ✅ Isolation complète par `saasAccountId`
- ✅ Détection et gestion des doublons
- ✅ Interface utilisateur complète dans Settings
