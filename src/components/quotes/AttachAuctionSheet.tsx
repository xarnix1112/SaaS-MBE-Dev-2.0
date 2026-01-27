import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Package,
  Ruler,
  X,
  FileCheck
} from 'lucide-react';
import { analyzeAuctionSheet, AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { cn } from '@/lib/utils';

interface AttachAuctionSheetProps {
  onAnalysisComplete: (analysis: AuctionSheetAnalysis) => void;
  existingAnalysis?: AuctionSheetAnalysis;
  fileName?: string;
}

export function AttachAuctionSheet({ 
  onAnalysisComplete,
  existingAnalysis,
  fileName
}: AttachAuctionSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AuctionSheetAnalysis | null>(existingAnalysis || null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Vérifier le type de fichier
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Format de fichier non supporté. Veuillez utiliser un PDF ou une image (JPG, PNG).');
      return;
    }

    // Vérifier la taille (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Le fichier est trop volumineux. Taille maximale: 10MB.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setIsAnalyzing(true);
    setProgress(0);

    // Simulation de progression
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const result = await analyzeAuctionSheet(selectedFile);
      setProgress(100);
      setAnalysis(result);
      setError(null);
      onAnalysisComplete(result);
    } catch (err) {
      setError('Erreur lors de l\'analyse du bordereau. Veuillez réessayer.');
      console.error('Erreur analyse bordereau:', err);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setAnalysis(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Créer un objet vide pour notifier le parent que le bordereau est supprimé
    onAnalysisComplete({
      lots: [],
      totalLots: 0,
      totalObjects: 0,
      removed: true,
    });
  };

  if (analysis) {
    return (
      <Card className="border-success/20 bg-success/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-success" />
              Bordereau d'adjudication attaché
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Bordereau analysé avec succès</p>
              {(file || fileName) && (
                <p className="text-xs text-muted-foreground mt-1">{file?.name || fileName}</p>
              )}
            </div>
          </div>

          {/* Résumé de l'analyse */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Nombre de lots</p>
              <p className="text-lg font-semibold flex items-center gap-1">
                <Package className="w-4 h-4" />
                {analysis.totalLots}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Nombre d'objets</p>
              <p className="text-lg font-semibold">{analysis.totalObjects}</p>
            </div>
          </div>

          {analysis.auctionHouse && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Salle des ventes</p>
              <p className="font-medium">{analysis.auctionHouse}</p>
            </div>
          )}

          {/* Liste des lots */}
          {analysis.lots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Lots détectés:</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {analysis.lots.map((lot, index) => (
                  <div
                    key={index}
                    className="bg-secondary/50 rounded-lg p-3 border border-border"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary">Lot {lot.lotNumber}</Badge>
                        </div>
                        <p className="text-sm font-medium">{lot.description}</p>
                      </div>
                    </div>
                    {lot.estimatedDimensions && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          {lot.estimatedDimensions.length}×{lot.estimatedDimensions.width}×{lot.estimatedDimensions.height} cm
                        </span>
                        <span>{lot.estimatedDimensions.weight} kg</span>
                      </div>
                    )}
                    {lot.value && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Valeur estimée: {lot.value}€
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Attacher un bordereau d'adjudication
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center">
          <Upload className="w-10 h-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-2">
            Téléversez le bordereau d'adjudication
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Formats acceptés: PDF, JPG, PNG (max 10MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="hidden"
            id="auction-sheet-attach"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="gap-2"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Choisir un fichier
              </>
            )}
          </Button>
          {file && !isAnalyzing && (
            <p className="text-xs text-muted-foreground mt-2">
              {file.name}
            </p>
          )}
        </div>

        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Analyse du document...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
