import { TimelineEvent } from '@/types/quote';
import { cn } from '@/lib/utils';
import { 
  FileText, 
  Eye, 
  CheckCircle2, 
  Send, 
  CreditCard, 
  Truck, 
  Package, 
  Clock,
} from 'lucide-react';

interface QuoteTimelineProps {
  events: TimelineEvent[];
}

const statusIcons: Record<string, React.ElementType> = {
  new: FileText,
  to_verify: Eye,
  verified: CheckCircle2,
  payment_link_sent: Send,
  awaiting_payment: CreditCard,
  paid: CreditCard,
  awaiting_collection: Clock,
  collected: Truck,
  preparation: Package,
  awaiting_shipment: Clock,
  shipped: Send,
  completed: CheckCircle2,
};

const statusColors: Record<string, string> = {
  new: 'bg-primary text-primary-foreground',
  to_verify: 'bg-warning text-warning-foreground',
  verified: 'bg-success text-success-foreground',
  payment_link_sent: 'bg-info text-info-foreground',
  awaiting_payment: 'bg-warning text-warning-foreground',
  paid: 'bg-success text-success-foreground',
  awaiting_collection: 'bg-warning text-warning-foreground',
  collected: 'bg-info text-info-foreground',
  preparation: 'bg-info text-info-foreground',
  awaiting_shipment: 'bg-warning text-warning-foreground',
  shipped: 'bg-success text-success-foreground',
  completed: 'bg-success text-success-foreground',
};

export function QuoteTimeline({ events }: QuoteTimelineProps) {
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-0">
      {sortedEvents.map((event, index) => {
        const Icon = statusIcons[event.status] || Clock;
        const colorClass = statusColors[event.status] || 'bg-muted text-muted-foreground';
        const isLast = index === sortedEvents.length - 1;

        return (
          <div key={event.id} className="timeline-item">
            <div className={cn('timeline-dot', colorClass)}>
              <Icon className="w-3 h-3" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-medium">{event.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(event.date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {event.user && ` • ${event.user}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
