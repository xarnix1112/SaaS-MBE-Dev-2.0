import { useMemo, useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuotes } from "@/hooks/use-quotes";
import { useAuctionHouses } from "@/hooks/use-auction-houses";
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Building2,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Euro,
  Plus,
  Trash2,
  Globe2,
  Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function AuctionHouses() {
  const { houses, isLoading: isLoadingHouses, addHouse, deleteHouse, isAdding, isDeleting } = useAuctionHouses();
  const [selectedHouse, setSelectedHouse] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    contact: "",
    email: "",
    website: "",
  });
  const { data: quotes = [], isLoading: isLoadingQuotes, isError } = useQuotes();

  // Sélectionner la première salle de ventes quand elles sont chargées
  useEffect(() => {
    if (houses.length > 0 && !selectedHouse) {
      setSelectedHouse(houses[0].id);
    }
  }, [houses, selectedHouse]);

  // Récupérer tous les devis pour une salle de ventes (pour les compteurs)
  const getAllQuotesForHouse = useMemo(
    () => (houseName: string) =>
      quotes.filter(
        (q) => q.lot?.auctionHouse === houseName
      ),
    [quotes]
  );

  // Récupérer uniquement les devis payés ou en attente de collecte (pour le tableau)
  const getQuotesForHouse = useMemo(
    () => (houseName: string) =>
      quotes.filter(
        (q) =>
          q.lot?.auctionHouse === houseName &&
          ["paid", "awaiting_collection"].includes(q.status || "")
      ),
    [quotes]
  );

  const handleAddHouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const address = form.address.trim();
    const contact = form.contact.trim();
    const email = form.email.trim();
    const website = form.website.trim();
    
    if (!name) {
      toast.error("Le nom de la salle de ventes est requis");
      return;
    }

    try {
      const newHouse = await addHouse({
        name,
        address,
        contact,
        email: email || undefined,
        website: website || undefined,
      });
      
      setSelectedHouse(newHouse.id);
      setForm({ name: "", address: "", contact: "", email: "", website: "" });
      
      // Afficher un message avec le nombre de devis associés
      const associatedCount = (newHouse as any).associatedQuotesCount || 0;
      if (associatedCount > 0) {
        toast.success(
          `Salle de ventes "${name}" ajoutée avec succès. ${associatedCount} devis associé${associatedCount > 1 ? 's' : ''}.`
        );
      } else {
        toast.success(
          `Salle de ventes "${name}" ajoutée avec succès. Les devis correspondants seront automatiquement classés dans cette salle.`
        );
      }
    } catch (error) {
      console.error("[AuctionHouses] Erreur lors de l'ajout:", error);
      toast.error("Impossible d'ajouter la salle de ventes");
    }
  };

  const handleDeleteHouse = async (id: string) => {
    const house = houses.find(h => h.id === id);
    if (!house) return;

    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${house.name}" ?`)) {
      return;
    }

    try {
      await deleteHouse(id);
      if (selectedHouse === id) {
        const remainingHouses = houses.filter(h => h.id !== id);
        setSelectedHouse(remainingHouses[0]?.id || "");
      }
      toast.success(`Salle de ventes "${house.name}" supprimée`);
    } catch (error) {
      console.error("[AuctionHouses] Erreur lors de la suppression:", error);
      toast.error("Impossible de supprimer la salle de ventes");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Salles des ventes" 
        subtitle="Gérez les lots en attente de collecte par salle"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Ajouter une salle de vente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={handleAddHouse}>
              <div className="space-y-2">
                <Label htmlFor="house-name">Nom</Label>
                <Input
                  id="house-name"
                  placeholder="Hôtel des Ventes..."
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="house-address">Adresse</Label>
                <Input
                  id="house-address"
                  placeholder="12 rue Exemple, Paris"
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="house-contact">Contact</Label>
                <Input
                  id="house-contact"
                  placeholder="Téléphone ou autre contact"
                  value={form.contact}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="house-email">Email (pour les collectes)</Label>
                <Input
                  id="house-email"
                  type="email"
                  placeholder="collecte@salle-vente.fr"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="house-website">Site web (optionnel)</Label>
                <Input
                  id="house-website"
                  placeholder="https://www.salle-vente.fr"
                  value={form.website}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" className="gap-2" disabled={isAdding}>
                  <Plus className="w-4 h-4" />
                  {isAdding ? "Ajout en cours..." : "Ajouter"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {(isLoadingHouses || isLoadingQuotes) && (
          <div className="text-center text-muted-foreground">Chargement...</div>
        )}
        {isError && (
          <div className="text-center text-destructive">
            Impossible de charger les devis Google Sheets
          </div>
        )}
        <Tabs value={selectedHouse} onValueChange={setSelectedHouse}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            {houses.map((house) => {
              const houseQuotes = getQuotesForHouse(house.name);
              return (
                <TabsTrigger key={house.id} value={house.id} className="gap-2">
                  <Building2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{house.name}</span>
                  <span className="sm:hidden">Salle {house.id}</span>
                  <Badge variant="secondary" className="ml-1">
                    {houseQuotes.length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {houses.map((house) => {
            // Récupérer TOUS les devis pour cette salle (pour les compteurs)
            const allHouseQuotes = getAllQuotesForHouse(house.name);
            // Récupérer uniquement les devis payés/en attente de collecte (pour le tableau)
            const houseQuotes = getQuotesForHouse(house.name);
            
            // Compter les devis par statut (utiliser tous les devis, pas seulement ceux du tableau)
            // "En attente" = devis avec statut 'awaiting_validation' OU devis payés sans statut défini (qui attendent validation)
            const awaitingValidation = allHouseQuotes.filter(q => 
              (q.auctionHouseStatus === 'awaiting_validation') || 
              (q.paymentStatus === 'paid' && !q.auctionHouseStatus)
            );
            const accepted = allHouseQuotes.filter(q => q.auctionHouseStatus === 'accepted');
            const refused = allHouseQuotes.filter(q => q.auctionHouseStatus === 'refused');

            return (
              <TabsContent key={house.id} value={house.id} className="space-y-6">
                {/* House Info */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-lg">{house.name}</h3>
                        <p className="text-sm text-muted-foreground">{house.address}</p>
                        {house.contact && (
                          <p className="text-sm text-muted-foreground">{house.contact}</p>
                        )}
                        {house.email && (
                          <p className="text-sm text-muted-foreground">
                            <Mail className="w-3 h-3 inline mr-1" />
                            {house.email}
                          </p>
                        )}
                        {house.website && (
                          <a
                            href={house.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary inline-flex items-center gap-1 mt-1"
                          >
                            <Globe2 className="w-3 h-3" />
                            Site web
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-warning">
                            <Clock className="w-4 h-4" />
                            <span className="text-xl font-bold">{awaitingValidation.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">En attente</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xl font-bold">{accepted.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Acceptés</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="w-4 h-4" />
                            <span className="text-xl font-bold">{refused.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Refusés</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          onClick={() => handleDeleteHouse(house.id)}
                          title="Supprimer cette salle"
                          disabled={isDeleting}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lots Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Lots en attente de collecte
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {houseQuotes.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Aucun lot en attente pour cette salle</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lot</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Paiement</TableHead>
                            <TableHead>Statut salle</TableHead>
                            <TableHead>Commentaire</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {houseQuotes.map((quote) => {
                            // Sécuriser les propriétés pour éviter les erreurs
                            const safeQuote = {
                              ...quote,
                              lot: quote.lot || { number: '', description: '', auctionHouse: '' },
                              client: quote.client || { name: '', email: '', phone: '', address: '' },
                              options: quote.options || { packagingPrice: 0, shippingPrice: 0, insuranceAmount: 0 },
                              auctionHouseComments: quote.auctionHouseComments || [],
                              paymentStatus: quote.paymentStatus || 'unpaid',
                              totalAmount: quote.totalAmount || 0,
                              reference: quote.reference || 'N/A'
                            };
                            
                            return (
                            <TableRow key={quote.id}>
                              <TableCell>
                                <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                                  {safeQuote.lot.number || 'N/A'}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{safeQuote.client.name || 'Client inconnu'}</p>
                                  <p className="text-xs text-muted-foreground">{safeQuote.reference}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm max-w-xs truncate">{safeQuote.lot.description || 'Aucune description'}</p>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'font-medium',
                                    safeQuote.paymentStatus === 'paid' ? 'text-success' : 'text-warning'
                                  )}>
                                    {(() => {
                                      // Calculer le total comme dans QuoteDetail et Payments
                                      const total = (
                                        (safeQuote.options.packagingPrice || 0) +
                                        (safeQuote.options.shippingPrice || 0) +
                                        (safeQuote.options.insuranceAmount || 0)
                                      );
                                      
                                      // Si le total calculé est > 0, l'utiliser, sinon utiliser totalAmount
                                      const displayAmount = total > 0 ? total : safeQuote.totalAmount;
                                      return `${displayAmount.toFixed(2)}€`;
                                    })()}
                                  </span>
                                  <StatusBadge status={safeQuote.paymentStatus} type="payment" />
                                </div>
                              </TableCell>
                              <TableCell>
                                {quote.auctionHouseStatus && (
                                  <StatusBadge status={quote.auctionHouseStatus} type="auction" />
                                )}
                              </TableCell>
                              <TableCell>
                                {(safeQuote.auctionHouseComments?.length || 0) > 0 ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                    <span className="truncate max-w-32">{safeQuote.auctionHouseComments[0]}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {quote.auctionHouseStatus === 'awaiting_validation' && (
                                    <>
                                      <Button variant="outline" size="sm" className="h-7 text-success border-success/30 hover:bg-success/10">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Accepter
                                      </Button>
                                      <Button variant="outline" size="sm" className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10">
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Refuser
                                      </Button>
                                    </>
                                  )}
                                  {quote.auctionHouseStatus === 'accepted' && (
                                    <Button size="sm" className="h-7">
                                      Planifier collecte
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
