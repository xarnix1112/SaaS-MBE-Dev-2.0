/**
 * Service d'analyse de bordereau d'adjudication avec IA
 * Utilise une API IA (OpenAI GPT-4 Vision, Claude, ou Gemini) pour analyser le document
 */

import { AuctionSheetAnalysis, AuctionLot } from './auctionSheetAnalyzer';

/**
 * Convertit un fichier en base64 pour l'envoi à l'API IA
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Détermine le type MIME du fichier
 */
function getMimeType(file: File): string {
  if (file.type === 'application/pdf') return 'application/pdf';
  if (file.type.includes('jpeg') || file.type.includes('jpg')) return 'image/jpeg';
  if (file.type.includes('png')) return 'image/png';
  return 'image/jpeg'; // par défaut
}

/**
 * Analyse le bordereau avec OpenAI GPT-4 Vision
 */
async function analyzeWithOpenAI(file: File, apiKey: string): Promise<AuctionSheetAnalysis> {
  const base64 = await fileToBase64(file);
  const mimeType = getMimeType(file);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en analyse de bordereaux d'adjudication. 
          Analyse le document et extrais les informations suivantes au format JSON :
          {
            "auctionHouse": "nom de la salle des ventes",
            "auctionDate": "date de la vente (format ISO)",
            "lots": [
              {
                "lotNumber": "numéro du lot",
                "description": "description détaillée de l'objet",
                "dimensions": {
                  "length": longueur en cm (estimation si non précisée),
                  "width": largeur en cm (estimation si non précisée),
                  "height": hauteur en cm (estimation si non précisée),
                  "weight": poids en kg (estimation si non précisée)
                },
                "value": valeur estimée en euros (si disponible)
              }
            ]
          }
          
          Pour estimer les dimensions, utilise ta connaissance des objets d'art et antiquités.
          Si plusieurs objets sont mentionnés dans un lot (ex: "paire de chaises"), compte-les correctement.
          Retourne UNIQUEMENT le JSON, sans texte supplémentaire.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyse ce bordereau d\'adjudication et extrais toutes les informations des lots.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur OpenAI: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('Aucune réponse de l\'API OpenAI');
  }

  // Extraire le JSON de la réponse (peut être entouré de markdown)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
  
  const parsed = JSON.parse(jsonStr);
  
  // Calculer le nombre total d'objets
  const totalObjects = parsed.lots.reduce((sum: number, lot: any) => {
    const desc = (lot.description || '').toLowerCase();
    if (desc.includes('paire')) return sum + 2;
    if (desc.includes('lot de') || desc.includes('ensemble de')) {
      const match = desc.match(/lot de (\d+)|ensemble de (\d+)/);
      if (match) return sum + parseInt(match[1] || match[2] || '1');
    }
    return sum + 1;
  }, 0);

  const lots: AuctionLot[] = parsed.lots.map((lot: any) => ({
    lotNumber: lot.lotNumber || '1',
    description: lot.description || 'Objet non décrit',
    estimatedDimensions: lot.dimensions ? {
      length: lot.dimensions.length || 50,
      width: lot.dimensions.width || 40,
      height: lot.dimensions.height || 30,
      weight: lot.dimensions.weight || 5,
    } : undefined,
    value: lot.value,
  }));

  return {
    auctionHouse: parsed.auctionHouse,
    auctionDate: parsed.auctionDate ? new Date(parsed.auctionDate) : new Date(),
    lots,
    totalLots: lots.length,
    totalObjects,
    rawText: content,
  };
}

/**
 * Analyse le bordereau via un proxy backend (recommandé pour la sécurité)
 */
async function analyzeWithProxy(file: File, proxyUrl: string = '/api/analyze-auction-sheet'): Promise<AuctionSheetAnalysis> {
  const formData = new FormData();
  formData.append('file', file);

  console.log(`[AI Proxy] Envoi du fichier à: ${proxyUrl}`);
  
  let response;
  try {
    console.log(`[AI Proxy] Tentative de connexion à: ${proxyUrl}`);
    response = await fetch(proxyUrl, {
      method: 'POST',
      body: formData,
      // Pas de headers Content-Type pour FormData, le navigateur le gère
    });
  } catch (fetchError) {
    // Erreur de réseau (proxy non démarré, CORS, etc.)
    const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error('[AI Proxy] Erreur fetch:', errorMsg);
    
    // Vérifier si c'est une erreur CORS ou de connexion
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Load failed')) {
      throw new Error(
        `Le proxy backend n'est pas accessible. ` +
        `Vérifiez que le proxy est démarré avec: npm run ai:proxy ` +
        `(dans le dossier front end/). ` +
        `Si le proxy est démarré, vérifiez qu'il écoute sur le port 5174.`
      );
    }
    
    throw new Error(
      `Impossible de contacter le proxy backend à ${proxyUrl}. ` +
      `Erreur: ${errorMsg}. ` +
      'Assurez-vous que le proxy est démarré avec: npm run ai:proxy'
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Erreur analyse (${response.status}): ${errorText}`;
    
    if (response.status === 500 && errorText.includes('GROQ_API_KEY')) {
      errorMessage = 'La clé API Groq n\'est pas configurée dans le proxy. Vérifiez GROQ_API_KEY dans .env.local';
    } else if (response.status === 404) {
      errorMessage = `Le proxy backend n'est pas accessible à ${proxyUrl}. Démarrez-le avec: npm run ai:proxy`;
    }
    
    throw new Error(errorMessage);
  }

  return await response.json();
}

/**
 * Analyse un bordereau d'adjudication avec IA
 * Utilise le proxy backend si disponible, sinon OpenAI directement (nécessite VITE_OPENAI_API_KEY)
 */
export async function analyzeAuctionSheetWithAI(file: File): Promise<AuctionSheetAnalysis> {
  // Option 1: Utiliser le proxy backend (recommandé)
  // Par défaut, utilise le proxy Vite qui redirige /api vers localhost:5174
  const proxyUrl = import.meta.env.VITE_AI_PROXY_URL || '/api/analyze-auction-sheet';
  
  console.log('[AI] Configuration:', {
    VITE_USE_AI_ANALYSIS: import.meta.env.VITE_USE_AI_ANALYSIS,
    VITE_AI_PROXY_URL: import.meta.env.VITE_AI_PROXY_URL,
    proxyUrl,
    currentOrigin: window.location.origin,
  });
  
  try {
    console.log(`[AI] Tentative d'analyse via proxy: ${proxyUrl}`);
    const result = await analyzeWithProxy(file, proxyUrl);
    console.log('[AI] Analyse réussie !', result);
    return result;
  } catch (error) {
    console.error('[AI] Erreur proxy:', error);
    
    // Vérifier si c'est une erreur de connexion (proxy non démarré)
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Détecter les différents types d'erreurs
    if (errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') || 
        errorMessage.includes('Load failed') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
        errorMessage.includes('ERR_NETWORK')) {
      throw new Error(
        `Le proxy backend n'est pas accessible à ${proxyUrl}. ` +
        `Assurez-vous que le proxy est démarré avec: npm run ai:proxy ` +
        `(dans le dossier front end/). ` +
        `Si le proxy est démarré, vérifiez qu'il écoute sur le port 5174. ` +
        `Erreur technique: ${errorMessage}`
      );
    }
    
    // Option 2: Utiliser OpenAI directement (si la clé est disponible côté client)
    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    if (openaiKey) {
      console.log('[AI] Utilisation OpenAI direct');
      return await analyzeWithOpenAI(file, openaiKey);
    }
    
    // Message d'erreur plus clair
    throw error; // Re-lancer l'erreur originale avec tous les détails
  }
}

