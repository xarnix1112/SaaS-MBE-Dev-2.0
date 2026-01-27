import { ShippingZone, DEFAULT_WEIGHT_BRACKETS } from '@/types/shipping';

export const defaultShippingZones: ShippingZone[] = [
  {
    id: 'zone-a',
    code: 'A',
    name: 'France',
    countries: 'FR',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [6, 7, 9, 14, 18, 22, 30] },
      { serviceName: 'EXPRESS', rates: [9, 11, 14, 19, 25, 30, 40] },
    ],
    isExpanded: true,
  },
  {
    id: 'zone-b',
    code: 'B',
    name: 'Europe Proche',
    countries: 'BE, LU, DE, NL, ES, IT',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [8, 10, 14, 22, 28, 35, 48] },
      { serviceName: 'EXPRESS', rates: [12, 15, 20, 30, 38, 48, 65] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-c',
    code: 'C',
    name: 'Europe Étendue',
    countries: 'PT, AT, DK, IE, SE, FI, PL, CZ, HU',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [9, 12, 17, 26, 34, 42, 58] },
      { serviceName: 'EXPRESS', rates: [14, 18, 25, 36, 46, 58, 78] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-d',
    code: 'D',
    name: 'Europe Hors UE / Sensible',
    countries: 'UK, CH, NO, GR, RO, BG, TR',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [11, 15, 22, 34, 45, 55, 75] },
      { serviceName: 'EXPRESS', rates: [18, 24, 32, 48, 62, 75, 100] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-e',
    code: 'E',
    name: 'Amérique du Nord',
    countries: 'USA – DHL only, CA, MX',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [null, null, null, null, null, null, null] },
      { serviceName: 'EXPRESS', rates: [29, 35, 48, 67, 88, 104, 136] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-f',
    code: 'F',
    name: 'Asie / Moyen-Orient',
    countries: 'CN, HK, JP, KR, SG, IN, TH, VN, UAE, IL, SA',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [15, 20, 30, 45, 60, 75, 100] },
      { serviceName: 'EXPRESS', rates: [25, 32, 45, 65, 85, 105, 140] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-g',
    code: 'G',
    name: 'Amérique du Sud',
    countries: 'BR, AR, CL, CO, PE',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [null, null, null, null, null, null, null] },
      { serviceName: 'EXPRESS', rates: [32, 40, 55, 78, 100, 120, 155] },
    ],
    isExpanded: false,
  },
  {
    id: 'zone-h',
    code: 'H',
    name: 'Afrique',
    countries: 'MA, TN, DZ, SN, CI, ZA',
    weightBrackets: DEFAULT_WEIGHT_BRACKETS,
    services: [
      { serviceName: 'STANDARD', rates: [18, 24, 36, 55, 72, 90, null] },
      { serviceName: 'EXPRESS', rates: [28, 38, 55, 78, 100, 125, 165] },
    ],
    isExpanded: false,
  },
];
