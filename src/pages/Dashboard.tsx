import { AppHeader } from '@/components/layout/AppHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { AlertBanner } from '@/components/dashboard/AlertBanner';
import { QuoteCard } from '@/components/quotes/QuoteCard';
import { mockQuotes, mockAlerts, mockDashboardStats } from '@/data/mockData';
import { 
  FileText, 
  Clock, 
  CreditCard, 
  Truck, 
  Package, 
  Send, 
  CheckCircle2, 
  AlertTriangle,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const stats = mockDashboardStats;
  const recentQuotes = mockQuotes.slice(0, 3);
  const activeAlerts = mockAlerts.filter(a => a.type !== 'resolved');

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Tableau de bord" 
        subtitle="Vue d'ensemble de votre activité"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Alerts */}
        {activeAlerts.length > 0 && (
          <div className="space-y-3">
            {activeAlerts.slice(0, 2).map(alert => (
              <AlertBanner key={alert.id} alert={alert} />
            ))}
            {activeAlerts.length > 2 && (
              <Link to="/alerts">
                <Button variant="ghost" size="sm" className="gap-1">
                  Voir les {activeAlerts.length - 2} autres alertes
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Nouveaux devis"
            value={stats.newQuotes}
            icon={FileText}
            variant="primary"
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="En attente paiement"
            value={stats.awaitingPayment}
            icon={CreditCard}
            variant="warning"
          />
          <StatCard
            title="Attente collecte"
            value={stats.awaitingCollection}
            icon={Truck}
            variant="default"
          />
          <StatCard
            title="Alertes urgentes"
            value={stats.urgentAlerts}
            icon={AlertTriangle}
            variant="error"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Quotes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Devis récents</h2>
              <Link to="/quotes/new">
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" />
                  Nouveau devis
                </Button>
              </Link>
            </div>
            <div className="space-y-4">
              {recentQuotes.map(quote => (
                <QuoteCard key={quote.id} quote={quote} />
              ))}
            </div>
            <Link to="/pipeline">
              <Button variant="outline" className="w-full gap-1">
                Voir tous les devis
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Quick Actions & Pipeline Summary */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions rapides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link to="/quotes/new" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="w-4 h-4" />
                    Vérifier les nouveaux devis
                  </Button>
                </Link>
                <Link to="/payments" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CreditCard className="w-4 h-4" />
                    Suivre les paiements
                  </Button>
                </Link>
                <Link to="/collections" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Truck className="w-4 h-4" />
                    Gérer les collectes
                  </Button>
                </Link>
                <Link to="/shipments" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Send className="w-4 h-4" />
                    Préparer les expéditions
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Pipeline Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Résumé pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm">Nouveaux</span>
                  </div>
                  <span className="font-semibold">{stats.newQuotes}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-sm">À vérifier</span>
                  </div>
                  <span className="font-semibold">{stats.awaitingVerification}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-info" />
                    <span className="text-sm">Attente paiement</span>
                  </div>
                  <span className="font-semibold">{stats.awaitingPayment}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm">En préparation</span>
                  </div>
                  <span className="font-semibold">{stats.inPreparation}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm">Expédiés</span>
                  </div>
                  <span className="font-semibold">{stats.shipped}</span>
                </div>
                <Link to="/pipeline">
                  <Button variant="ghost" size="sm" className="w-full mt-2 gap-1">
                    Voir le pipeline complet
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
