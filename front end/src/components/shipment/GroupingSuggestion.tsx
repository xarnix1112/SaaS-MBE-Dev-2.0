/**
 * Composant GroupingSuggestion
 * 
 * Affiche une suggestion de groupement de devis avec économies potentielles
 * Permet à l'utilisateur de sélectionner les devis à grouper
 */

import { useState } from 'react';
import { Package, TrendingDown, Calendar, Weight, Box, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GroupSuggestion, GroupableQuote } from '@/types/shipmentGroup';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

interface GroupingSuggestionProps {
  currentQuoteId: string;
  suggestion: GroupSuggestion;
  onCreateGroup: (selectedQuoteIds: string[]) => Promise<void>;
  isCreating?: boolean;
}

export function GroupingSuggestion({
  currentQuoteId,
  suggestion,
  onCreateGroup,
  isCreating = false,
}: GroupingSuggestionProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(
    new Set(suggestion.quotes.map(q => q.id))
  );

  const handleToggleQuote = (quoteId: string) => {
    const newSelected = new Set(selectedQuotes);
    if (newSelected.has(quoteId)) {
      // Ne pas permettre de désélectionner si c'est le devis actuel
      if (quoteId === currentQuoteId) {
        toast.error('Le devis actuel doit être inclus dans le groupement');
        return;
      }
      // Ne pas permettre de désélectionner si moins de 2 devis resteraient
      if (newSelected.size <= 2) {
        toast.error('Un groupement nécessite au moins 2 devis');
        return;
      }
      newSelected.delete(quoteId);
    } else {
      newSelected.add(quoteId);
    }
    setSelectedQuotes(newSelected);
  };

  const handleCreateGroup = async () => {
    try {
      await onCreateGroup(Array.from(selectedQuotes));
      setShowDialog(false);
      toast.success('Groupement créé avec succès !');
    } catch (error) {
      console.error('[GroupingSuggestion] Erreur création:', error);
      toast.error('Erreur lors de la création du groupement');
    }
  };

  const selectedQuotesData = suggestion.quotes.filter(q => selectedQuotes.has(q.id));
  const selectedTotalWeight = selectedQuotesData.reduce((sum, q) => sum + q.totalWeight, 0);
  const selectedTotalVolume = selectedQuotesData.reduce((sum, q) => sum + q.totalVolume, 0);

  return (
    <>
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Groupement d'expédition possible</CardTitle>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              <TrendingDown className="h-3 w-3 mr-1" />
              Économie: {suggestion.potentialSavings.toFixed(2)}€
            </Badge>
          </div>
          <CardDescription>
            {suggestion.quotes.length} devis peuvent être expédiés ensemble vers la même adresse
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Résumé rapide */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2">
              <Weight className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Poids total</p>
                <p className="text-sm font-medium">{suggestion.totalWeight.toFixed(1)} kg</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Cartons estimés</p>
                <p className="text-sm font-medium">{suggestion.estimatedCartons}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Coût groupé</p>
                <p className="text-sm font-medium">{suggestion.estimatedShippingCost.toFixed(2)}€</p>
              </div>
            </div>
          </div>

          {/* Liste des devis */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Devis concernés :</p>
            <div className="space-y-1">
              {suggestion.quotes.slice(0, 3).map((quote) => (
                <div
                  key={quote.id}
                  className={`flex items-center justify-between p-2 rounded-md border ${
                    quote.id === currentQuoteId ? 'bg-blue-50 border-blue-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {quote.id === currentQuoteId && (
                      <Badge variant="secondary" className="text-xs">Actuel</Badge>
                    )}
                    <span className="text-sm font-medium">{quote.reference}</span>
                    <span className="text-xs text-muted-foreground">
                      • {quote.lotCount} lot{quote.lotCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(quote.createdAt, { addSuffix: true, locale: fr })}
                  </span>
                </div>
              ))}
              {suggestion.quotes.length > 3 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{suggestion.quotes.length - 3} autre{suggestion.quotes.length - 3 > 1 ? 's' : ''} devis
                </p>
              )}
            </div>
          </div>

          {/* Bouton d'action */}
          <Button
            onClick={() => setShowDialog(true)}
            className="w-full"
            size="lg"
          >
            <Package className="h-4 w-4 mr-2" />
            Créer le groupement
          </Button>
        </CardContent>
      </Card>

      {/* Dialog de sélection */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer un groupement d'expédition</DialogTitle>
            <DialogDescription>
              Sélectionnez les devis à inclure dans le groupement. Tous les devis seront expédiés ensemble.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Résumé de la sélection */}
            <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Devis sélectionnés</p>
                <p className="text-lg font-bold">{selectedQuotes.size}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Poids total</p>
                <p className="text-lg font-bold">{selectedTotalWeight.toFixed(1)} kg</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Économie estimée</p>
                <p className="text-lg font-bold text-green-600">
                  {suggestion.potentialSavings.toFixed(2)}€
                </p>
              </div>
            </div>

            <Separator />

            {/* Liste des devis avec checkboxes */}
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {suggestion.quotes.map((quote) => {
                  const isSelected = selectedQuotes.has(quote.id);
                  const isCurrent = quote.id === currentQuoteId;

                  return (
                    <div
                      key={quote.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleQuote(quote.id)}
                        disabled={isCurrent || isCreating}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{quote.reference}</span>
                          {isCurrent && (
                            <Badge variant="secondary" className="text-xs">Devis actuel</Badge>
                          )}
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {quote.clientName} • {quote.clientEmail}
                        </p>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{quote.lotCount} lot{quote.lotCount > 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>{quote.totalWeight.toFixed(1)} kg</span>
                          <span>•</span>
                          <span>
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {formatDistanceToNow(quote.createdAt, { addSuffix: true, locale: fr })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedQuotes.size < 2 && (
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded-md">
                ⚠️ Sélectionnez au moins 2 devis pour créer un groupement
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isCreating}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={selectedQuotes.size < 2 || isCreating}
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Création...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Créer le groupement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



