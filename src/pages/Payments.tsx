import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { mockQuotes } from '@/data/mockData';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Filter,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Link as LinkIcon,
  Mail,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type PaymentFilter = 'all' | 'pending' | 'link_sent' | 'partial' | 'paid' | 'cancelled';

export default function Payments() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PaymentFilter>('all');

  const quotesWithPayment = mockQuotes.filter(q => 
    ['payment_link_sent', 'awaiting_payment', 'paid'].includes(q.status) ||
    q.paymentLinks.length > 0
  );

  const filteredQuotes = quotesWithPayment.filter(quote => {
    const matchesSearch = 
      quote.reference.toLowerCase().includes(search.toLowerCase()) ||
      quote.client.name.toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = filter === 'all' || quote.paymentStatus === filter;
    
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: quotesWithPayment.length,
    pending: quotesWithPayment.filter(q => q.paymentStatus === 'pending').length,
    linkSent: quotesWithPayment.filter(q => q.paymentStatus === 'link_sent').length,
    paid: quotesWithPayment.filter(q => q.paymentStatus === 'paid').length,
    totalAmount: quotesWithPayment.reduce((sum, q) => sum + q.totalAmount, 0),
    paidAmount: quotesWithPayment
      .filter(q => q.paymentStatus === 'paid')
      .reduce((sum, q) => sum + q.totalAmount, 0),
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Suivi des paiements" 
        subtitle="Gérez les paiements et liens de paiement"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">En attente</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <Send className="w-5 h-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.linkSent}</p>
                  <p className="text-sm text-muted-foreground">Liens envoyés</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.paid}</p>
                  <p className="text-sm text-muted-foreground">Payés</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.paidAmount}€</p>
                  <p className="text-sm text-muted-foreground">Encaissé</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par référence ou client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as PaymentFilter)}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="link_sent">Lien envoyé</SelectItem>
              <SelectItem value="partial">Paiement partiel</SelectItem>
              <SelectItem value="paid">Payé</SelectItem>
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Liste des paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Lien paiement</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                        {quote.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{quote.client.name}</p>
                        <p className="text-xs text-muted-foreground">{quote.client.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{quote.totalAmount}€</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={quote.paymentStatus} type="payment" />
                    </TableCell>
                    <TableCell>
                      {quote.paymentLinks.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="gap-1">
                            <LinkIcon className="w-3 h-3" />
                            {quote.paymentLinks.length} lien(s)
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {quote.paymentStatus !== 'paid' && (
                          <>
                            <Button variant="outline" size="sm" className="h-8 gap-1">
                              <LinkIcon className="w-3 h-3" />
                              Générer lien
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Mail className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {quote.paymentStatus === 'paid' && (
                          <Button variant="outline" size="sm" className="h-8 gap-1">
                            <Plus className="w-3 h-3" />
                            Surcoût
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
