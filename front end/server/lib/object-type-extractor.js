/**
 * Extrait un type d'objet synthétique depuis une description de lot de vente aux enchères.
 * Utilisé par l'email de demande de collecte et le PDF liste de collecte.
 * Stratégie : règles par mots-clés → IA (Groq/OpenAI) → fallback description ciblée.
 */

/**
 * Extrait un type d'objet depuis une description de lot (règles par mots-clés).
 * Retourne null si aucun match satisfaisant.
 */
export function extractObjectTypeFromKeywords(description) {
  if (!description || typeof description !== 'string') return null;
  const d = description.trim();
  if (!d) return null;
  const lower = d.toLowerCase();

  // Assiettes / vaisselle avec quantité
  const assietteMatch = lower.match(/\b(\d+)\s*assiettes?\b|lot\s+de\s+(\d+)\s*assiettes?|ensemble\s+de\s+(\d+)\s*assiettes?/i);
  if (assietteMatch) {
    const n = parseInt(assietteMatch[1] || assietteMatch[2] || assietteMatch[3] || '1', 10);
    return `Assiettes (${n})`;
  }
  if (/\bassiettes?\b/i.test(lower)) return 'Assiettes';

  // Tableaux
  if (/\b(tableau|tableaux)\b.*\b(huile|toile)\b/i.test(lower)) return 'Tableau huile sur toile';
  if (/\b(tableau|tableaux)\b.*\baquarelle/i.test(lower)) return 'Tableau aquarelle';
  if (/\b(tableau|tableaux)\b.*\bpastel/i.test(lower)) return 'Tableau pastel';
  if (/\btableau(x)?\b/i.test(lower)) return 'Tableau';

  // Vases avec matériau
  if (/\bvase(s)?\b.*\b(céramique|ceramique)\b/i.test(lower)) return 'Vase en céramique';
  if (/\bvase(s)?\b.*\bporcelaine/i.test(lower)) return 'Vase en porcelaine';
  if (/\bvase(s)?\b.*\bverre/i.test(lower)) return 'Vase en verre';
  if (/\bvase(s)?\b/i.test(lower)) return 'Vase';

  // Meubles, bijoux, livres, etc.
  const keywords = [
    { re: /\bmeuble(s)?\b/i, out: 'Meuble' },
    { re: /\bbijou(x)?\b|\bbague\b|\bcollier\b|\bbracelet\b/i, out: 'Bijoux' },
    { re: /\blivre(s)?\b/i, out: 'Livre(s)' },
    { re: /\bverre(s)?\b|\bverrerie\b/i, out: 'Verres' },
    { re: /\bcadre(s)?\b/i, out: 'Cadre' },
    { re: /\bmiroir(s)?\b/i, out: 'Miroir' },
    { re: /\bluminaire(s)?\b|\blampe(s)?\b/i, out: 'Luminaire' },
    { re: /\btapisserie\b|\btapis\b/i, out: 'Tapisserie' },
    { re: /\bsculpture(s)?\b/i, out: 'Sculpture' },
    { re: /\bpendule(s)?\b|\bhorloge(s)?\b/i, out: 'Pendule' },
    { re: /\bargenterie\b|\bcuillère\b|\bfourchette\b/i, out: 'Argenterie' },
    { re: /\bcommode\b|\bbureau\b|\barmoire\b/i, out: 'Meuble' },
  ];
  for (const { re, out } of keywords) {
    if (re.test(lower)) return out;
  }
  return null;
}

/**
 * Extrait le type d'objet via IA (Groq ou OpenAI). Retourne null en cas d'erreur.
 */
export async function extractObjectTypeWithAI(description) {
  if (!description || typeof description !== 'string' || description.trim().length < 5) return null;
  const truncated = description.trim().substring(0, 800);
  const prompt = `À partir de cette description de lot de vente aux enchères : "${truncated}"

Donne UNIQUEMENT un libellé court décrivant le type d'objet (ex: "Assiettes (12)", "Tableau huile sur toile", "Vase en céramique", "Meuble", "Bijoux"). 
Une seule ligne, pas d'explication. Maximum 50 caractères.`;

  // Priorité Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: "Tu extrais le type d'objet d'une description de vente aux enchères. Réponds uniquement par le libellé court demandé." },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 80,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const content = (data.choices?.[0]?.message?.content || '').trim();
        if (content && content.length <= 80) return content;
      }
    } catch (e) {
      console.warn('[extractObjectType] Groq erreur:', e.message);
    }
  }

  // Fallback OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: "Tu extrais le type d'objet d'une description de vente aux enchères. Réponds uniquement par le libellé court demandé." },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 80,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const content = (data.choices?.[0]?.message?.content || '').trim();
        if (content && content.length <= 80) return content;
      }
    } catch (e) {
      console.warn('[extractObjectType] OpenAI erreur:', e.message);
    }
  }
  return null;
}

/**
 * Extrait la partie de la description qui décrit l'objet (pas la première ligne).
 * Fallback quand les règles et l'IA ne donnent rien.
 */
export function extractRelevantObjectDescription(description) {
  if (!description || typeof description !== 'string') return 'Description non disponible';
  const d = description.trim();
  if (!d) return 'Description non disponible';

  const lines = d.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return d.substring(0, 80);

  const objectKeywords = /tableau|vase|assiette|meuble|bijou|livre|cadre|miroir|sculpture|verre|armoire|commode|bureau|pendule|luminaire|tapis|argenterie|porcelaine|céramique|huile|toile|aquarelle/i;
  let best = lines[0];
  let bestScore = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 10) continue;
    if (/^[\d\-\.\s]+$/.test(line)) continue;
    const score = (objectKeywords.test(line) ? 2 : 0) + line.length;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  const out = best.length > 80 ? best.substring(0, 77).trim() + '...' : best;
  return out || d.substring(0, 80);
}

/**
 * Orchestrateur : extrait le type d'objet (règles → IA → fallback description ciblée).
 */
export async function extractObjectTypeFromDescription(description) {
  const fromKeywords = extractObjectTypeFromKeywords(description);
  if (fromKeywords) return fromKeywords;

  const fromAI = await extractObjectTypeWithAI(description);
  if (fromAI) return fromAI;

  return extractRelevantObjectDescription(description);
}
