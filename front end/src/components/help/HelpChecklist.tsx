/**
 * Checklist dynamique de configuration.
 * Affiche le statut (configuré / non configuré) pour chaque zone.
 */

import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { ConfigStatus } from '@/hooks/useConfigStatus';
import {
  HELP_SECTIONS,
  type HelpSectionData,
} from '@/lib/helpContent';

const STATUS_MAP: Record<
  string,
  keyof Omit<ConfigStatus, 'mbeHub'> | 'mbeHub'
> = {
  'quick-start': 'emails',
  stripe: 'stripe',
  emails: 'emails',
  'google-sheets': 'googleSheets',
  'google-drive': 'googleDrive',
  typeform: 'typeform',
  cartons: 'cartons',
  'grille-tarifaire': 'grilleTarifaire',
  mbehub: 'mbeHub',
};

interface HelpChecklistProps {
  status: ConfigStatus;
  isLoading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}

function isConfigured(
  section: HelpSectionData,
  status: ConfigStatus
): boolean | null {
  if (section.id === 'quick-start') {
    const configured =
      status.stripe.configured &&
      status.emails.configured &&
      status.cartons.configured &&
      status.grilleTarifaire.configured;
    return configured;
  }
  const key = STATUS_MAP[section.id];
  if (!key) return null;
  const item = status[key];
  if (key === 'mbeHub') {
    const mbe = status.mbeHub;
    return mbe.available ? mbe.configured : null;
  }
  return item?.configured ?? false;
}

function showInChecklist(section: HelpSectionData, status: ConfigStatus): boolean {
  if (section.id === 'quick-start') return true;
  if (section.id === 'mbehub') return status.mbeHub.available;
  return true;
}

export function HelpChecklist({
  status,
  isLoading,
  selectedId,
  onSelect,
}: HelpChecklistProps) {
  const sections = HELP_SECTIONS.filter((s) => showInChecklist(s, status));

  return (
    <div
      className={cn(
        'rounded-lg border bg-card/80 backdrop-blur-sm shadow-sm transition-all duration-200',
        'border-border/50'
      )}
    >
      <div className="px-4 py-3 border-b border-border/50">
        <h3 className="font-semibold text-sm text-foreground">
          Configuration de votre compte
        </h3>
      </div>
      <div className="divide-y divide-border/30">
        {sections.map((section) => {
          const Icon = section.icon;
          const configured = isConfigured(section, status);
          const isSelected = selectedId === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 cursor-pointer',
                'hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isSelected && 'bg-accent/50'
              )}
            >
              <Icon className="w-5 h-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 font-medium text-sm truncate">
                {section.title}
              </span>
              {isLoading ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" />
              ) : configured === true ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
              ) : configured === false ? (
                <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
