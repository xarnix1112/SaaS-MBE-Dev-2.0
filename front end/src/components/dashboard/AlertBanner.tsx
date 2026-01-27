import { Alert } from '@/types/quote';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface AlertBannerProps {
  alert: Alert;
  onDismiss?: () => void;
}

export function AlertBanner({ alert, onDismiss }: AlertBannerProps) {
  const isUrgent = alert.type === 'urgent';
  const isWarning = alert.type === 'warning';
  const isResolved = alert.type === 'resolved';

  return (
    <div
      className={cn(
        'alert-banner animate-slide-up',
        isUrgent && 'alert-urgent',
        isWarning && 'alert-warning',
        isResolved && 'alert-success'
      )}
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{alert.title}</p>
          <span className="text-xs opacity-70">#{alert.quoteReference}</span>
        </div>
        <p className="text-sm mt-0.5 opacity-90">{alert.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link to={`/quotes/${alert.quoteId}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            Voir
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
        {onDismiss && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
