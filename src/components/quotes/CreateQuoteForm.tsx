import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AuctionSheetUpload } from './AuctionSheetUpload';
import { AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { searchDimensionsForDescription } from '@/lib/auctionSheetAnalyzer';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Package, 
  Ruler,
  Euro,
  Save,
  X
} from 'lucide-react';
import { Quote, Client, Lot } from '@/types/quote';

interface CreateQuoteFormProps {
  onSave: (quote: Partial<Quote>) => void;
  onCancel: () => void;
}

export function CreateQuoteForm({ onSave, onCancel }: CreateQuoteFormProps) {
  const [auctionSheetAnalysis, setAuctionSheetAnalysis] = useState<AuctionSheetAnalysis | null>(null);
  
  // Informations client
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  
  // Informations lot
  const [lotNumber, setLotNumber] = useState('');
  const [lotDescription, setLotDescription] = useState('');
  const [auctionHouse, setAuctionHouse] = useState('');
  const [lotValue, setLotValue] = useState<number>(0);
  
  // Dimensions
  const [length, setLength] = useState<number>(0);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [weight, setWeight] = useState<number>(0);
  
  // Options
  const [insurance, setInsurance] = useState(false);
  const [express, setExpress] = useState(false);

  // Quand le bordereau est analysé, remplir automatiquement les champs
  useEffect(() => {
    if (auctionSheetAnalysis && auctionSheetAnalysis.lots.length > 0) {
      const firstLot = auctionSheetAnalysis.lots[0];
      
      // Remplir les informations du lot
      if (!lotNumber) setLotNumber(firstLot.lotNumber);
      if (!lotDescription) setLotDescription(firstLot.description);
      if (!auctionHouse && auctionSheetAnalysis.auctionHouse) {
        setAuctionHouse(auctionSheetAnalysis.auctionHouse);
      }
      if (firstLot.value && !lotValue) {
        setLotValue(firstLot.value);
      }
      
      // Remplir les dimensions si disponibles
      if (firstLot.estimatedDimensions) {
        if (!length) setLength(firstLot.estimatedDimensions.length);
        if (!width) setWidth(firstLot.estimatedDimensions.width);
        if (!height) setHeight(firstLot.estimatedDimensions.height);
        if (!weight) setWeight(firstLot.estimatedDimensions.weight);
      }
      
      // Si plusieurs lots, mettre le nombre total d'objets dans la description
      if (auctionSheetAnalysis.totalLots > 1) {
        const descriptionWithObjects = `${firstLot.description} (${auctionSheetAnalysis.totalObjects} objet${auctionSheetAnalysis.totalObjects > 1 ? 's' : ''} - ${auctionSheetAnalysis.totalLots} lot${auctionSheetAnalysis.totalLots > 1 ? 's' : ''})`;
        setLotDescription(descriptionWithObjects);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionSheetAnalysis]);

  // Rechercher les dimensions quand la description change
  useEffect(() => {
    if (lotDescription && (!length || !width || !height || !weight)) {
      const estimated = searchDimensionsForDescription(lotDescription);
      if (!length) setLength(estimated.length);
      if (!width) setWidth(estimated.width);
      if (!height) setHeight(estimated.height);
      if (!weight) setWeight(estimated.weight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotDescription]);

  const handleAnalysisComplete = (analysis: AuctionSheetAnalysis) => {
    setAuctionSheetAnalysis(analysis);
  };

  const handleSave = () => {
    // Validation basique
    if (!clientName || !lotDescription) {
      alert('Veuillez remplir au moins le nom du client et la description du lot.');
      return;
    }

    const newQuote: Partial<Quote> = {
      client: {
        id: `client-${Date.now()}`,
        name: clientName,
        email: clientEmail || '',
        phone: clientPhone || '',
        address: clientAddress || '',
      },
      lot: {
        id: `lot-${Date.now()}`,
        number: lotNumber || `LOT-${Date.now()}`,
        description: lotDescription,
        dimensions: {
          length,
          width,
          height,
          weight,
          estimated: true,
        },
        value: lotValue,
        photos: [],
        auctionHouse: auctionHouse || 'Non précisée',
      },
      options: {
        insurance,
        express,
        insuranceAmount: insurance ? Math.round(lotValue * 0.01) : undefined,
        expressAmount: express ? 35 : undefined,
      },
      status: 'new',
      paymentStatus: 'pending',
      totalAmount: 0, // À calculer selon la logique métier
      auctionSheet: auctionSheetAnalysis ? {
        auctionHouse: auctionSheetAnalysis.auctionHouse,
        auctionDate: auctionSheetAnalysis.auctionDate,
        totalLots: auctionSheetAnalysis.totalLots,
        totalObjects: auctionSheetAnalysis.totalObjects,
        rawText: auctionSheetAnalysis.rawText,
      } : undefined,
    };

    onSave(newQuote);
  };

  return (
    <div className="space-y-6">
      {/* Bordereau d'adjudication */}
      <AuctionSheetUpload 
        onAnalysisComplete={handleAnalysisComplete}
        initialAnalysis={auctionSheetAnalysis || undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Informations client */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Informations client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nom complet *</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="client-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="jean.dupont@example.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Téléphone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="client-phone"
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-address">Adresse</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Textarea
                  id="client-address"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="123 Rue Example, 75001 Paris"
                  className="pl-9"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informations lot */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Informations du lot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lot-number">Numéro de lot</Label>
                <Input
                  id="lot-number"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="LOT-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auction-house">Salle des ventes</Label>
                <Input
                  id="auction-house"
                  value={auctionHouse}
                  onChange={(e) => setAuctionHouse(e.target.value)}
                  placeholder="Drouot"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-description">Description *</Label>
              <Textarea
                id="lot-description"
                value={lotDescription}
                onChange={(e) => setLotDescription(e.target.value)}
                placeholder="Description détaillée de l'objet..."
                rows={4}
              />
              {auctionSheetAnalysis && auctionSheetAnalysis.totalObjects > 1 && (
                <p className="text-xs text-muted-foreground">
                  {auctionSheetAnalysis.totalObjects} objet{auctionSheetAnalysis.totalObjects > 1 ? 's' : ''} détecté{auctionSheetAnalysis.totalObjects > 1 ? 's' : ''} dans le bordereau
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-value">Valeur estimée (€)</Label>
              <div className="relative">
                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="lot-value"
                  type="number"
                  value={lotValue || ''}
                  onChange={(e) => setLotValue(parseFloat(e.target.value) || 0)}
                  placeholder="1000"
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dimensions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Dimensions (estimées)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="length">Longueur (cm)</Label>
              <Input
                id="length"
                type="number"
                value={length || ''}
                onChange={(e) => setLength(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="width">Largeur (cm)</Label>
              <Input
                id="width"
                type="number"
                value={width || ''}
                onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Hauteur (cm)</Label>
              <Input
                id="height"
                type="number"
                value={height || ''}
                onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Poids (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                value={weight || ''}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>
          {lotDescription && (length || width || height || weight) && (
            <p className="text-xs text-muted-foreground mt-3">
              Dimensions estimées automatiquement à partir de la description. Vous pouvez les modifier si nécessaire.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="insurance"
              checked={insurance}
              onCheckedChange={(checked) => setInsurance(checked === true)}
            />
            <Label htmlFor="insurance" className="cursor-pointer">
              Assurance (1% de la valeur estimée)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="express"
              checked={express}
              onCheckedChange={(checked) => setExpress(checked === true)}
            />
            <Label htmlFor="express" className="cursor-pointer">
              Livraison express (+35€)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          <X className="w-4 h-4 mr-2" />
          Annuler
        </Button>
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          Créer le devis
        </Button>
      </div>
    </div>
  );
}
