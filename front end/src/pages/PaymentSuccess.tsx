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
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl border-success/40 shadow-lg">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              {/* Icône de succès */}
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-green-100 text-green-600">
                  <CheckCircle2 className="w-16 h-16" />
                </div>
              </div>

              {/* Titre principal */}
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  Paiement confirmé !
                </h1>
                <p className="text-lg text-gray-600">
                  Votre paiement a bien été reçu et enregistré.
                </p>
              </div>

              {/* Message de remerciement */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left">
                <p className="text-base text-gray-700 leading-relaxed">
                  <strong>Merci pour votre confiance !</strong>
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Nous avons bien reçu votre paiement de <strong>{amount ? `${amount} ${currency}` : '--'}</strong> pour le devis <strong>{reference}</strong>.
                </p>
                <p className="text-sm text-gray-600 mt-3">
                  Notre équipe va maintenant traiter votre dossier dans les plus brefs délais. 
                  Vous recevrez un email de confirmation sous peu avec tous les détails de votre commande.
                </p>
              </div>

              {/* Informations techniques (optionnel, pour debug) */}
              {sessionId && sessionId !== "inconnu" && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Référence de transaction : {sessionId.substring(0, 20)}...
                  </p>
                </div>
              )}

              {/* Message de contact */}
              <div className="pt-4">
                <p className="text-sm text-gray-600">
                  Pour toute question, n'hésitez pas à nous contacter.
                </p>
              </div>
            </div>
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

