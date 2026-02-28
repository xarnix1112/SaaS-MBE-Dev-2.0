/**
 * Parse une adresse texte en champs structurés (rue, ville, CP, pays)
 * Gère les formats français/européens courants
 */

const COUNTRY_MAP: Record<string, string> = {
  france: 'FR',
  italie: 'IT',
  italia: 'IT',
  allemagne: 'DE',
  deutschland: 'DE',
  espagne: 'ES',
  españa: 'ES',
  portugal: 'PT',
  'royaume-uni': 'GB',
  'united kingdom': 'GB',
  uk: 'GB',
  belgique: 'BE',
  belgië: 'BE',
  suisse: 'CH',
  'pays-bas': 'NL',
  netherlands: 'NL',
  luxembourg: 'LU',
  autriche: 'AT',
  österreich: 'AT',
  polska: 'PL',
  pologne: 'PL',
  croatie: 'HR',
  hrvatska: 'HR',
};

export interface ParsedAddress {
  street: string;
  address2?: string;
  city: string;
  zip: string;
  state?: string;
  country: string;
  raw: string;
}

/**
 * Tente d'extraire le code pays (2 lettres) d'une chaîne
 */
function extractCountryCode(input: string): string {
  const s = input.trim();
  // Code ISO 2 lettres à la fin (ex: "France" ou "FR")
  const twoLetterMatch = s.match(/\b([A-Z]{2})\s*$/i);
  if (twoLetterMatch) return twoLetterMatch[1].toUpperCase();

  // Nom du pays en français/anglais
  const lower = s.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (lower.includes(name)) return code;
  }

  // Dernier mot parfois = pays (ex: "12345 Nice France")
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    if (COUNTRY_MAP[last]) return COUNTRY_MAP[last];
  }

  return '';
}

/**
 * Tente d'extraire le code postal (5 chiffres FR ou format européen)
 */
function extractZip(input: string): string {
  // 5 chiffres (France)
  const frMatch = input.match(/\b(\d{5})\b/);
  if (frMatch) return frMatch[1];

  // Format XX-XXX (PL), etc.
  const euMatch = input.match(/\b([A-Z0-9][A-Z0-9\-]{2,10})\b/i);
  if (euMatch) return euMatch[1];

  return '';
}

/**
 * Parse une adresse string en composants structurés
 */
export function parseAddressString(raw: string): ParsedAddress {
  const s = (raw || '').trim();
  if (!s) {
    return { street: '', city: '', zip: '', country: '', raw: s };
  }

  const country = extractCountryCode(s);
  let zip = extractZip(s);

  // Supprimer le pays et le CP pour extraire rue + ville
  let rest = s
    .replace(/\b(FR|IT|DE|ES|UK|GB|BE|CH|NL|LU|AT|PL|HR|PT)\s*$/i, '')
    .replace(/\b(France|Italia|Italy|Deutschland|Germany|España|Spain|United Kingdom|UK|Belgique|Belgium|Suisse|Switzerland|Pays-Bas|Netherlands|Luxembourg|Autriche|Austria|Polska|Poland|Croatie|Croatia|Portugal)\s*$/i, '')
    .trim();

  // Souvent: "rue, 12345 Ville" ou "rue 12345 Ville"
  const zipInRest = extractZip(rest);
  const zipUsed = zip || zipInRest;

  // Séparer par virgule ou " CP " / "  "
  const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);

  let street = '';
  let city = '';
  let address2 = '';

  if (parts.length >= 2) {
    street = parts[0];
    const afterStreet = parts.slice(1).join(', ');
    const cityMatch = afterStreet.match(/(\d{5})\s+([^0-9]+)/);
    if (cityMatch) {
      if (!zipUsed) zip = cityMatch[1];
      city = cityMatch[2].trim();
    } else {
      city = afterStreet;
    }
  } else if (parts.length === 1) {
    const one = parts[0];
    const cpCity = one.match(/(\d{5})\s+([A-Za-zÀ-ÿ\s\-']+)/);
    if (cpCity) {
      if (!zipUsed) zip = cpCity[1];
      city = cpCity[2].trim();
      street = one.substring(0, cpCity.index).trim();
    } else {
      const lastNum = one.search(/\s\d{5}\s/);
      if (lastNum >= 0) {
        street = one.substring(0, lastNum).trim();
        const tail = one.substring(lastNum).trim();
        const m = tail.match(/^(\d{5})\s*(.*)$/);
        if (m) {
          if (!zipUsed) zip = m[1];
          city = m[2].trim();
        }
      } else {
        street = one;
      }
    }
  }

  return {
    street: street || rest,
    address2: address2 || undefined,
    city: city || '',
    zip: zip || '',
    country: country || 'FR',
    raw: s,
  };
}
