export interface ServiceRate {
  serviceName: string;
  rates: (number | null)[]; // null = NA
}

export interface ShippingZone {
  id: string;
  code: string; // A, B, C, etc.
  name: string;
  countries: string;
  weightBrackets: number[];
  services: ServiceRate[];
  isExpanded: boolean;
}

export interface ShippingGrid {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  zones: ShippingZone[];
}

export const DEFAULT_WEIGHT_BRACKETS = [1, 2, 5, 10, 15, 20, 30];
export const DEFAULT_SERVICES = ['STANDARD', 'EXPRESS'];

export const ZONE_COLORS: Record<string, string> = {
  A: 'zone-badge-a',
  B: 'zone-badge-b',
  C: 'zone-badge-c',
  D: 'zone-badge-d',
  E: 'zone-badge-e',
  F: 'zone-badge-f',
  G: 'zone-badge-g',
  H: 'zone-badge-h',
};
