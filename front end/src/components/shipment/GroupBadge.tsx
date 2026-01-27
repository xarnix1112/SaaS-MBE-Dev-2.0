/**
 * Composant GroupBadge
 * 
 * Badge visuel pour indiquer qu'un devis fait partie d'un groupement d'expédition
 */

import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface GroupBadgeProps {
  groupId: string;
  groupReference?: string;
  quoteCount?: number;
  variant?: 'default' | 'compact';
  className?: string;
}

export function GroupBadge({
  groupId,
  groupReference,
  quoteCount,
  variant = 'default',
  className = '',
}: GroupBadgeProps) {
  const displayReference = groupReference || groupId.slice(0, 12);

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className={`bg-purple-100 text-purple-700 hover:bg-purple-200 cursor-help ${className}`}
            >
              <Package className="h-3 w-3 mr-1" />
              {displayReference}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Expédition groupée
              {quoteCount && ` avec ${quoteCount - 1} autre${quoteCount > 2 ? 's' : ''} devis`}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={`bg-purple-100 text-purple-700 hover:bg-purple-200 ${className}`}
    >
      <Package className="h-3 w-3 mr-1" />
      Groupé • {displayReference}
      {quoteCount && ` (${quoteCount} devis)`}
    </Badge>
  );
}



