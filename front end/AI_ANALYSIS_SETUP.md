# Configuration de l'analyse IA des bordereaux d'adjudication

Cette fonctionnalité permet d'analyser automatiquement les bordereaux d'adjudication avec une IA pour extraire les informations (lots, descriptions, dimensions, valeurs).

## 🎯 Avantages de l'IA

- ✅ **Analyse réelle** : L'IA lit et comprend réellement le document
- ✅ **Extraction précise** : Détecte automatiquement les lots, descriptions, dimensions
- ✅ **Estimation intelligente** : Estime les dimensions basées sur le type d'objet
- ✅ **Gestion multi-lots** : Détecte et compte automatiquement plusieurs lots
- ✅ **Compréhension contextuelle** : Comprend "paire de chaises" = 2 objets
- ✅ **Rapide et économique** : Groq est très rapide et moins cher qu'OpenAI

## 🔧 Configuration avec Groq (Recommandé)

### Option 1 : Proxy Backend (Recommandé - Plus sécurisé)

Le proxy backend garde votre clé API secrète côté serveur.

1. **Installer les dépendances** :
```bash
npm install multer
```

2. **Créer `.env.local` dans le dossier `front end/`** :
```env
GROQ_API_KEY=gsk_votre_cle_groq_ici
VITE_AI_PROXY_URL=http://localhost:5174/api/analyze-auction-sheet
VITE_USE_AI_ANALYSIS=true
PORT=5174
```

3. **Démarrer le proxy AI** :
```bash
npm run ai:proxy
```

Le proxy écoute sur le port 5174 par défaut (configurable via `PORT`).

4. **Démarrer l'application** (dans un autre terminal) :
```bash
npm run dev
```

### Option 2 : API Directe (Moins sécurisé)

Si vous préférez appeler l'API directement depuis le frontend :

```env
VITE_GROQ_API_KEY=gsk_votre-cle-groq
VITE_USE_AI_ANALYSIS=true
```

⚠️ **Attention** : La clé API sera visible dans le code JavaScript côté client.

## 🔑 À propos de Groq

- **Rapide** : Groq utilise des modèles open-source optimisés (Llama, Mixtral)
- **Économique** : Généralement moins cher qu'OpenAI
- **API compatible** : Utilise une API similaire à OpenAI
- **Modèles disponibles** : llama-3.1-70b-versatile, mixtral-8x7b-32768, etc.

Votre clé API Groq doit être configurée dans `.env.local` (ne jamais la commiter).

## 📋 Format de réponse attendu

L'IA extrait les informations au format JSON :

```json
{
  "auctionHouse": "Drouot",
  "auctionDate": "2025-12-15T10:00:00Z",
  "lots": [
    {
      "lotNumber": "1",
      "description": "Table en bois massif, style Louis XVI",
      "dimensions": {
        "length": 120,
        "width": 80,
        "height": 75,
        "weight": 20
      },
      "value": 1500
    }
  ]
}
```

## 🚀 Utilisation

Une fois configuré, l'analyse IA est automatique :

1. Ouvrez un devis
2. Cliquez sur "Attacher bordereau" dans la section Actions
3. Téléversez le bordereau (PDF ou image)
4. L'IA analyse automatiquement et enrichit le devis

## 🔄 Fallback automatique

Si l'IA n'est pas configurée, le système utilise automatiquement l'analyse simulée (basée sur le nom du fichier).

## 💰 Coûts

- **GPT-4o** : ~$0.01-0.05 par analyse (selon la taille du document)
- **GPT-4 Vision** : ~$0.03-0.10 par analyse
- Les images sont plus économiques que les PDFs longs

## 🔐 Sécurité

- ✅ Utilisez toujours le proxy backend en production
- ✅ Ne commitez jamais votre `.env.local`
- ✅ Limitez les appels API avec un rate limiting
- ✅ Surveillez l'utilisation via le dashboard OpenAI

## 🛠️ Alternatives

Vous pouvez aussi utiliser :
- **Claude (Anthropic)** : Modifier `ai-proxy.js` pour utiliser l'API Claude
- **Google Gemini Vision** : Modifier `ai-proxy.js` pour utiliser Gemini
- **Azure OpenAI** : Compatible avec l'API OpenAI standard

## 📝 Exemple de configuration complète avec Groq

```env
# .env.local (dans le dossier front end/)
GROQ_API_KEY=gsk_votre_cle_groq_ici
VITE_AI_PROXY_URL=http://localhost:5174/api/analyze-auction-sheet
VITE_USE_AI_ANALYSIS=true
PORT=5174
```

**Votre clé Groq est déjà configurée !** Il suffit de créer le fichier `.env.local` avec cette configuration.

## 🐛 Dépannage

**Erreur "OPENAI_API_KEY non configurée"**
→ Vérifiez que la clé est bien dans `.env.local` et que le proxy est démarré

**Erreur CORS**
→ Assurez-vous que le proxy backend est démarré et accessible

**Analyse ne fonctionne pas**
→ Vérifiez les logs du proxy : `npm run ai:proxy`
→ Vérifiez que `VITE_USE_AI_ANALYSIS=true` dans `.env.local`

