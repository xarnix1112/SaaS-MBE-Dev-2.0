/**
 * Page Aide - Documentation et guides de configuration.
 * Checklist dynamique + guides pas à pas + FAQ par zone.
 */

import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { HelpChecklist } from '@/components/help/HelpChecklist';
import { HelpSectionContent } from '@/components/help/HelpSectionContent';
import { useConfigStatus } from '@/hooks/useConfigStatus';
import {
  HELP_SECTIONS,
  getHelpSection,
  HELP_SECTION_IDS,
} from '@/lib/helpContent';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Help() {
  const { status, isLoading } = useConfigStatus();
  const [selectedId, setSelectedId] = useState<string>('quick-start');

  const section = getHelpSection(selectedId);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && HELP_SECTION_IDS.includes(hash)) {
      setSelectedId(hash);
    }
  }, []);

  useEffect(() => {
    window.history.replaceState(null, '', `#${selectedId}`);
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HelpCircle className="w-8 h-8" />
            Aide
          </h1>
          <p className="text-muted-foreground mt-2">
            Guides de configuration et dépannage pour faire fonctionner votre
            application
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-4">
            <HelpChecklist
              status={status}
              isLoading={isLoading}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <nav
              className="rounded-lg border bg-card/80 backdrop-blur-sm border-border/50 p-4"
              aria-label="Navigation aide"
            >
              <h3 className="font-semibold text-sm text-foreground mb-3">
                Sommaire
              </h3>
              <ul className="space-y-1">
                {HELP_SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const isSelected = selectedId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-200 cursor-pointer',
                          'hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          isSelected
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {s.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <main className="lg:col-span-3">
            {section ? (
              <HelpSectionContent section={section} />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
                Sélectionnez une section dans le menu
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
