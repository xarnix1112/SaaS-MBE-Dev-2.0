#!/usr/bin/env node
/**
 * Script de test pour vérifier la normalisation du pays dans quote-shipping-rates.
 * Exécutable sans Firebase ni MBE : node scripts/test-quote-shipping-country.mjs
 *
 * Démontre le bug : "États-Unis" → "ÉT" (invalide) au lieu de "US" (ISO).
 */

// Logique ACTUELLE (buguée) - extraite de ai-proxy.js
function buildCountryBuggy(country) {
  return (country || 'FR').toString().trim().slice(0, 2).toUpperCase();
}

// Logique CORRIGÉE - utilise le mapping ISO comme dans shipping-rates.js
function mapCountryToCode(countryOrAddress) {
  const countryMap = {
    france: 'FR', belgique: 'BE', belgium: 'BE', suisse: 'CH', switzerland: 'CH',
    allemagne: 'DE', germany: 'DE', espagne: 'ES', spain: 'ES', italie: 'IT', italy: 'IT',
    'royaume-uni': 'GB', 'united kingdom': 'GB', uk: 'GB', portugal: 'PT', autriche: 'AT',
    austria: 'AT', danemark: 'DK', denmark: 'DK', irlande: 'IE', ireland: 'IE',
    suède: 'SE', sweden: 'SE', finlande: 'FI', finland: 'FI', pologne: 'PL', poland: 'PL',
    'république tchèque': 'CZ', 'czech republic': 'CZ', hongrie: 'HU', hungary: 'HU',
    brésil: 'BR', brazil: 'BR', argentine: 'AR', argentina: 'AR', chili: 'CL', chile: 'CL',
    colombie: 'CO', colombia: 'CO', pérou: 'PE', peru: 'PE', usa: 'US',
    'united states': 'US', 'états-unis': 'US', canada: 'CA', mexique: 'MX', mexico: 'MX',
  };
  if (!countryOrAddress) return 'FR';
  const s = String(countryOrAddress).toLowerCase().trim();
  return countryMap[s] || (s.length >= 2 ? s.substring(0, 2).toUpperCase() : 'FR');
}

const tests = [
  { country: 'États-Unis', expected: 'US' },
  { country: 'états-unis', expected: 'US' },
  { country: 'United States', expected: 'US' },
  { country: 'USA', expected: 'US' },
  { country: 'France', expected: 'FR' },
  { country: 'Belgique', expected: 'BE' },
  { country: 'Royaume-Uni', expected: 'GB' },
  { country: 'US', expected: 'US' },
  { country: 'FR', expected: 'FR' },
];

console.log('\n=== Test normalisation pays (quote-shipping-rates) ===\n');
console.log('Pays saisi          | Actuel (bug) | Corrigé | Attendu');
console.log('-------------------|--------------|--------|--------');

let ok = 0;
for (const { country, expected } of tests) {
  const buggy = buildCountryBuggy(country);
  const fixed = mapCountryToCode(country);
  const pass = fixed === expected;
  if (pass) ok++;
  const status = pass ? '✓' : '✗';
  console.log(`${String(country).padEnd(18)} | ${buggy.padEnd(12)} | ${fixed.padEnd(6)} | ${expected} ${status}`);
}

console.log('\n' + (ok === tests.length ? '✅ Tous les tests passent.' : `⚠️  ${tests.length - ok} test(s) en échec.`));
console.log('\n🔴 Bug confirmé: "États-Unis" → "ÉT" (invalide pour MBE) au lieu de "US".');
console.log('✅ Correction: utiliser mapCountryToCode() dans quote-shipping-rates.\n');
