import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { QuoteCard } from '@/components/quotes/QuoteCard';
import { CreateQuoteForm } from '@/components/quotes/CreateQuoteForm';
import { mockQuotes } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Search, 
  Filter, 
  AlertTriangle,
  CheckCircle2,
  Eye,
  XCircle,
  Plus,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Quote } from '@/types/quote';
import { toast } from 'sonner';

type FilterStatus = 'all' | 'new' | 'to_verify' | 'verified';

export default function NewQuotes() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const newQuotes = mockQuotes.filter(q => 
    ['new', 'to_verify', 'verified'].includes(q.status)
  );

  const filteredQuotes = newQuotes.filter(quote => {
    const matchesSearch = 
      quote.reference.toLowerCase().includes(search.toLowerCase()) ||
      quote.client.name.toLowerCase().includes(search.toLowerCase()) ||
      quote.lot.number.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || quote.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const quotesWithIssues = newQuotes.filter(q => q.verificationIssues.length > 0);
  const verifiedQuotes = newQuotes.filter(q => q.status === 'verified');
  const toVerifyQuotes = newQuotes.filter(q => q.status === 'to_verify');

  const handleCreateQuote = (quoteData: Partial<Quote>) => {
    // Ici, vous devriez normalement sauvegarder dans votre backend
    // Pour l'instant, on simule juste la création
    console.log('Nouveau devis créé:', quoteData);
    toast.success('Devis créé avec succès !');
    setIsCreateDialogOpen(false);
    // Recharger la liste des devis si nécessaire
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Réception des demandes de devis" 
        subtitle="Vérifiez et validez les nouveaux devis"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Bouton créer nouveau devis */}
        <div className="flex justify-end">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau devis avec bordereau
          </Button>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{newQuotes.length}</p>
                <p className="text-sm text-muted-foreground">Total nouveaux</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{quotesWithIssues.length}</p>
                <p className="text-sm text-muted-foreground">À vérifier</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{toVerifyQuotes.length}</p>
                <p className="text-sm text-muted-foreground">En attente</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{verifiedQuotes.length}</p>
                <p className="text-sm text-muted-foreground">Vérifiés</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par référence, client ou lot..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="new">Nouveaux</SelectItem>
              <SelectItem value="to_verify">À vérifier</SelectItem>
              <SelectItem value="verified">Vérifiés</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          <Badge variant="error" className="gap-1">
            <XCircle className="w-3 h-3" />
            Information manquante
          </Badge>
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            Information douteuse
          </Badge>
          <Badge variant="info" className="gap-1">
            <Eye className="w-3 h-3" />
            En cours de vérification
          </Badge>
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Vérifié
          </Badge>
        </div>

        {/* Quotes List */}
        <div className="space-y-4">
          {filteredQuotes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Aucun devis trouvé</p>
            </div>
          ) : (
            filteredQuotes.map(quote => (
              <QuoteCard key={quote.id} quote={quote} />
            ))
          )}
        </div>
      </div>

      {/* Dialogue de création de devis */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer un nouveau devis</DialogTitle>
            <DialogDescription>
              Téléversez un bordereau d'adjudication pour remplir automatiquement les informations, ou remplissez le formulaire manuellement.
            </DialogDescription>
          </DialogHeader>
          <CreateQuoteForm
            onSave={handleCreateQuote}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
