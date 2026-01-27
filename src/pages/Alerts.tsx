import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { mockAlerts } from '@/data/mockData';
import { AlertBanner } from '@/components/dashboard/AlertBanner';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';

type AlertFilter = 'all' | 'urgent' | 'warning' | 'resolved';

export default function Alerts() {
  const [filter, setFilter] = useState<AlertFilter>('all');

  const filteredAlerts = mockAlerts.filter(alert => {
    if (filter === 'all') return true;
    return alert.type === filter;
  });

  const urgentCount = mockAlerts.filter(a => a.type === 'urgent').length;
  const warningCount = mockAlerts.filter(a => a.type === 'warning').length;
  const resolvedCount = mockAlerts.filter(a => a.type === 'resolved').length;

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Centre d'alertes" 
        subtitle="Gérez les alertes et erreurs"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-destructive">{urgentCount}</p>
                  <p className="text-sm text-muted-foreground">Alertes urgentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertCircle className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-warning">{warningCount}</p>
                  <p className="text-sm text-muted-foreground">À surveiller</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-success/30 bg-success/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">{resolvedCount}</p>
                  <p className="text-sm text-muted-foreground">Résolues</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as AlertFilter)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              <Filter className="w-4 h-4" />
              Toutes
              <Badge variant="secondary">{mockAlerts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="urgent" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Urgentes
              <Badge variant="error">{urgentCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="warning" className="gap-2">
              <AlertCircle className="w-4 h-4" />
              À surveiller
              <Badge variant="warning">{warningCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="resolved" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Résolues
              <Badge variant="success">{resolvedCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Alerts List */}
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
              <p className="text-muted-foreground">Aucune alerte dans cette catégorie</p>
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <AlertBanner key={alert.id} alert={alert} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
