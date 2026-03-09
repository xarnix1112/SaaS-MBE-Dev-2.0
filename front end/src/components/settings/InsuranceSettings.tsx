/**
 * Paramètres d'assurance configurable par compte
 * À côté de la grille tarifaire dans Paramètres → Expédition
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Shield, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useInsuranceSettings, useUpdateInsuranceSettings } from "@/hooks/use-insurance-settings";
import type { InsuranceConfig } from "@/lib/insurance";

const ROUND_UP_OPTIONS = [
  { value: 0.01, label: "0,01 €" },
  { value: 0.05, label: "0,05 €" },
  { value: 0.1, label: "0,10 €" },
  { value: 0.25, label: "0,25 €" },
  { value: 0.5, label: "0,50 €" },
  { value: 1, label: "1 €" },
];

export function InsuranceSettings() {
  const { data: settings, isLoading } = useInsuranceSettings();
  const updateMutation = useUpdateInsuranceSettings();

  const [percentage, setPercentage] = useState(2.5);
  const [thresholdValue, setThresholdValue] = useState(500);
  const [minFlatFee, setMinFlatFee] = useState(12);
  const [roundUpIncrement, setRoundUpIncrement] = useState(0.5);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setPercentage(settings.percentage ?? 2.5);
      setThresholdValue(settings.thresholdValue ?? 500);
      setMinFlatFee(settings.minFlatFee ?? 12);
      setRoundUpIncrement(settings.roundUpIncrement ?? 0.5);
    }
  }, [settings]);

  const handleChange = (key: keyof InsuranceConfig, value: number) => {
    setHasChanges(true);
    switch (key) {
      case "percentage":
        setPercentage(value);
        break;
      case "thresholdValue":
        setThresholdValue(value);
        break;
      case "minFlatFee":
        setMinFlatFee(value);
        break;
      case "roundUpIncrement":
        setRoundUpIncrement(value);
        break;
    }
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        percentage,
        thresholdValue,
        minFlatFee,
        roundUpIncrement,
      });
      setHasChanges(false);
      toast.success("Paramètres d'assurance enregistrés");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur d'enregistrement");
    }
  };

  const incrementIndex = ROUND_UP_OPTIONS.findIndex((o) => o.value === roundUpIncrement);
  const sliderValue = incrementIndex >= 0 ? incrementIndex : 4;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Assurance
        </CardTitle>
        <CardDescription>
          Configurez le calcul de l'assurance pour vos devis : taux, seuil, minimum forfaitaire et arrondi au supérieur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="insurance-percentage">Taux (%)</Label>
            <Input
              id="insurance-percentage"
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={percentage}
              onChange={(e) => handleChange("percentage", parseFloat(e.target.value) || 2.5)}
            />
            <p className="text-xs text-muted-foreground">Entre 1 et 5 %</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="insurance-threshold">Seuil (€)</Label>
            <Input
              id="insurance-threshold"
              type="number"
              min={1}
              value={thresholdValue}
              onChange={(e) => handleChange("thresholdValue", parseFloat(e.target.value) || 500)}
            />
            <p className="text-xs text-muted-foreground">En dessous → minimum forfaitaire</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="insurance-min">Minimum forfaitaire (€)</Label>
            <Input
              id="insurance-min"
              type="number"
              min={1}
              max={1000}
              value={minFlatFee}
              onChange={(e) => handleChange("minFlatFee", parseFloat(e.target.value) || 12)}
            />
            <p className="text-xs text-muted-foreground">Entre 1 et 1000 €</p>
          </div>
        </div>

        <div className="space-y-4">
          <Label>Arrondir l'assurance au supérieur</Label>
          <p className="text-sm text-muted-foreground">
            Choisissez l'incrément d'arrondi : l'assurance sera toujours arrondie au supérieur à ce palier (ex. 12,34 € avec 0,50 € → 12,50 €).
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Slider
                value={[sliderValue]}
                onValueChange={([v]) => {
                  const opt = ROUND_UP_OPTIONS[v ?? 4];
                  if (opt) handleChange("roundUpIncrement", opt.value);
                }}
                min={0}
                max={ROUND_UP_OPTIONS.length - 1}
                step={1}
                className="flex-1"
              />
              <span className="text-sm font-medium w-16">{ROUND_UP_OPTIONS[sliderValue]?.label ?? "0,50 €"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ROUND_UP_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={roundUpIncrement === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleChange("roundUpIncrement", opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Enregistrer
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
