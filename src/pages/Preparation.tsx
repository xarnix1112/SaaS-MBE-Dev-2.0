import { AppHeader } from '@/components/layout/AppHeader';
import { mockQuotes } from '@/data/mockData';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Package,
  Ruler,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Link as LinkIcon,
  Euro,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function Preparation() {
  const preparationQuotes = mockQuotes.filter(q => q.status === 'preparation');

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Préparation des colis" 
        subtitle="Vérifiez les dimensions et préparez les expéditions"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Dimensions conformes
          </Badge>
          <Badge variant="error" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            Dimensions non conformes
          </Badge>
        </div>

        {/* Preparation Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {preparationQuotes.map((quote) => {
            const hasDimensionMismatch = quote.lot.realDimensions && (
              quote.lot.realDimensions.length !== quote.lot.dimensions.length ||
              quote.lot.realDimensions.width !== quote.lot.dimensions.width ||
              quote.lot.realDimensions.height !== quote.lot.dimensions.height ||
              quote.lot.realDimensions.weight !== quote.lot.dimensions.weight
            );

            return (
              <Card key={quote.id} className={cn(
                'card-hover',
                hasDimensionMismatch && 'border-destructive/50'
              )}>
                {hasDimensionMismatch && (
                  <div className="alert-banner alert-urgent rounded-t-lg rounded-b-none border-l-0 border-t-0 border-r-0">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Dimensions non conformes</p>
                      <p className="text-xs mt-0.5">Un surcoût peut être nécessaire</p>
                    </div>
                  </div>
                )}
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        {quote.lot.number}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {quote.reference} • {quote.client.name}
                      </p>
                    </div>
                    <StatusBadge status={quote.status} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Lot Description */}
                  <p className="text-sm">{quote.lot.description}</p>

                  {/* Dimensions Comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Estimated */}
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Estimées</span>
                        <Badge variant="secondary" className="text-[10px]">Devis</Badge>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p>L: {quote.lot.dimensions.length} cm</p>
                        <p>l: {quote.lot.dimensions.width} cm</p>
                        <p>H: {quote.lot.dimensions.height} cm</p>
                        <p>Poids: {quote.lot.dimensions.weight} kg</p>
                      </div>
                    </div>

                    {/* Real */}
                    <div className={cn(
                      'rounded-lg p-3',
                      quote.lot.realDimensions 
                        ? hasDimensionMismatch 
                          ? 'bg-destructive/10' 
                          : 'bg-success/10'
                        : 'bg-muted border-2 border-dashed border-muted-foreground/20'
                    )}>
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Réelles</span>
                        {quote.lot.realDimensions && (
                          hasDimensionMismatch 
                            ? <Badge variant="error" className="text-[10px]">Différent</Badge>
                            : <Badge variant="success" className="text-[10px]">Conforme</Badge>
                        )}
                      </div>
                      {quote.lot.realDimensions ? (
                        <div className="space-y-1 text-sm">
                          <p className={cn(
                            quote.lot.realDimensions.length !== quote.lot.dimensions.length && 'text-destructive font-medium'
                          )}>
                            L: {quote.lot.realDimensions.length} cm
                            {quote.lot.realDimensions.length !== quote.lot.dimensions.length && (
                              <span className="text-xs ml-1">
                                (+{quote.lot.realDimensions.length - quote.lot.dimensions.length})
                              </span>
                            )}
                          </p>
                          <p className={cn(
                            quote.lot.realDimensions.width !== quote.lot.dimensions.width && 'text-destructive font-medium'
                          )}>
                            l: {quote.lot.realDimensions.width} cm
                          </p>
                          <p className={cn(
                            quote.lot.realDimensions.height !== quote.lot.dimensions.height && 'text-destructive font-medium'
                          )}>
                            H: {quote.lot.realDimensions.height} cm
                          </p>
                          <p className={cn(
                            quote.lot.realDimensions.weight !== quote.lot.dimensions.weight && 'text-destructive font-medium'
                          )}>
                            Poids: {quote.lot.realDimensions.weight} kg
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground">Non mesuré</p>
                          <Button variant="outline" size="sm" className="mt-2">
                            Saisir dimensions
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    {hasDimensionMismatch && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Plus className="w-4 h-4" />
                          Ajouter surcoût
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1">
                          <LinkIcon className="w-4 h-4" />
                          Nouveau lien paiement
                        </Button>
                      </>
                    )}
                    {!hasDimensionMismatch && quote.lot.realDimensions && (
                      <Button size="sm" className="gap-1">
                        <ArrowRight className="w-4 h-4" />
                        Prêt pour expédition
                      </Button>
                    )}
                    <Link to={`/quotes/${quote.id}`} className="ml-auto">
                      <Button variant="ghost" size="sm">
                        Voir détails
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {preparationQuotes.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucun colis en préparation</p>
          </div>
        )}
      </div>
    </div>
  );
}
