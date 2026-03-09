/**
 * Contenu d'une section d'aide : objectif, guide pas à pas, FAQ.
 */

import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HelpSectionData } from '@/lib/helpContent';

interface HelpSectionContentProps {
  section: HelpSectionData;
}

export function HelpSectionContent({ section }: HelpSectionContentProps) {
  const Icon = section.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{section.title}</h2>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            to={`/settings?tab=${section.settingsTab}`}
            className="gap-2 cursor-pointer transition-colors duration-200"
          >
            <Settings className="w-4 h-4" />
            Aller aux paramètres
          </Link>
        </Button>
      </div>

      <p className="text-muted-foreground">{section.goal}</p>

      <Card className="border-border/50 bg-card/95 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Guide pas à pas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            {section.steps.map((step, index) => (
              <li
                key={index}
                className="flex gap-3 items-start transition-colors duration-200"
              >
                <span className="flex shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{step.label}</span>
                    <Badge
                      variant={step.where === 'app' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {step.where === 'app' ? "Dans l'app" : 'Site externe'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {section.faq.length > 0 && (
        <Card className="border-border/50 bg-card/95 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-5 text-muted-foreground" />
              Questions fréquentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {section.faq.map((item, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger
                    className={cn(
                      'hover:no-underline [&[data-state=open]]:text-foreground',
                      'cursor-pointer transition-colors duration-200'
                    )}
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
