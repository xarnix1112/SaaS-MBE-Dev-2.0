import { useLocation, Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Receipt } from "lucide-react";

export default function PaymentSuccess() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);

  const reference = params.get("ref") || "N/A";
  const amount = params.get("amount");
  const currency = params.get("currency") || "EUR";
  const source = params.get("source") || "stripe";
  const sessionId =
    params.get("session_id") || params.get("payment_intent") || "inconnu";

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Paiement confirmé"
        subtitle="Le client a été redirigé après le paiement Stripe"
      />

      <div className="flex-1 p-6 space-y-4">
        <Card className="border-success/40">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="p-2 rounded-full bg-success/10 text-success">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">Paiement réussi</CardTitle>
              <p className="text-sm text-muted-foreground">
                Conservez ces informations pour rapprocher le paiement dans vos
                outils internes.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info label="Référence devis" value={reference} />
              <Info
                label="Montant"
                value={amount ? `${amount} ${currency}` : `-- ${currency}`}
              />
              <Info label="Source" value={source} />
              <Info label="Session/Intent" value={sessionId} />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">{currency}</Badge>
              <Badge variant="secondary">Stripe Payment Link</Badge>
            </div>

            <Button asChild className="mt-2">
              <Link to="/payments">
                <Receipt className="w-4 h-4 mr-2" />
                Revenir au suivi des paiements
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase text-muted-foreground tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

