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
  FileCheck,
  RefreshCw
} from 'lucide-react';
import { analyzeAuctionSheet, AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { analyzeAuctionSheetWithAI } from '@/lib/aiAuctionSheetAnalyzer';
import { cleanCartonRef } from '@/lib/pricing';
import { cn } from '@/lib/utils';

interface AttachAuctionSheetProps {
  onAnalysisComplete: (analysis: AuctionSheetAnalysis, file?: File | null) => void;
  existingAnalysis?: AuctionSheetAnalysis;
  fileName?: string;
  bordereauFileName?: string; // Nom court du fichier (évite d'afficher l'URL Typeform brute)
  bordereauId?: string; // ID du bordereau dans Firestore
  onRetryOCR?: () => void; // Callback pour relancer l'analyse OCR (forceRetry)
}

export function AttachAuctionSheet({ 
  onAnalysisComplete,
  existingAnalysis,
  fileName,
  bordereauFileName,
  bordereauId,
  onRetryOCR
}: AttachAuctionSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AuctionSheetAnalysis | null>(existingAnalysis || null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Si un bordereauId existe et qu'on a une analyse, afficher directement le bordereau
  const hasBordereau = !!bordereauId && !!existingAnalysis;

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
      // Utiliser l'IA si disponible, sinon fallback sur la simulation
      const useAI = import.meta.env.VITE_USE_AI_ANALYSIS === 'true' || 
                    import.meta.env.VITE_AI_PROXY_URL || 
                    import.meta.env.VITE_OPENAI_API_KEY ||
                    import.meta.env.VITE_GROQ_API_KEY;

      // Le proxy supporte maintenant PDF + images (PDF rendu en images côté serveur)
      
      console.log('[AttachAuctionSheet] Configuration IA:', {
        VITE_USE_AI_ANALYSIS: import.meta.env.VITE_USE_AI_ANALYSIS,
        VITE_AI_PROXY_URL: import.meta.env.VITE_AI_PROXY_URL,
        useAI,
      });
      
      const result = useAI 
        ? await analyzeAuctionSheetWithAI(selectedFile)
        : await analyzeAuctionSheet(selectedFile);
      
      // Ne pas interpréter "0 lots" comme une suppression.
      // Si on n'a ni lots ni total facture, c'est une analyse non concluante -> on affiche une erreur.
      if ((result.totalLots ?? 0) === 0 && !(typeof result.invoiceTotal === 'number' && result.invoiceTotal > 0)) {
        // On conserve l'analyse pour afficher le texte OCR (debug), mais on ne met pas à jour le devis.
        setAnalysis(result);
        setError(
          "Analyse terminée mais aucune donnée exploitable n'a été détectée (0 lot, aucun total). " +
          "Ouvrez « Texte OCR reconnu » pour vérifier ce qui a été lu, puis réessayez avec une meilleure qualité."
        );
        setProgress(0);
        return;
      }

      setProgress(100);
      setAnalysis(result);
      setError(null);
      onAnalysisComplete(result, selectedFile);
    } catch (err) {
      setError(`Erreur lors de l'analyse du bordereau: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
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
    }, null);
  };

  const effectiveAnalysis = analysis || existingAnalysis;
  const hasZeroLots = effectiveAnalysis && (effectiveAnalysis.totalLots ?? 0) === 0;
  const displayFileName = (bordereauFileName || file?.name || fileName || '').trim();
  const isUrlLike = displayFileName.startsWith('http://') || displayFileName.startsWith('https://');
  const safeDisplayName = isUrlLike ? (bordereauFileName || 'Bordereau attaché') : displayFileName || 'Bordereau attaché';

  if (hasBordereau || (analysis && analysis.totalLots > 0)) {
    const isWarningState = hasBordereau && hasZeroLots;
    return (
      <Card className={cn(
        'overflow-hidden',
        isWarningState ? 'border-amber-500/30 bg-amber-500/5' : 'border-success/20 bg-success/5'
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className={cn('w-4 h-4', isWarningState ? 'text-amber-600' : 'text-success')} />
              Bordereau d'adjudication attaché
            </CardTitle>
            {/* Ne pas afficher le bouton de suppression si le bordereau est dans Firestore */}
            {!hasBordereau && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="h-7 w-7 p-0"
                title="Retirer le bordereau"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 p-3 rounded-lg overflow-hidden',
            isWarningState ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-success/10 border border-success/20'
          )}>
            <CheckCircle2 className={cn('w-5 h-5 flex-shrink-0', isWarningState ? 'text-amber-600' : 'text-success')} />
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-medium">
                {isWarningState ? 'Bordereau lié – extraction en attente ou échouée' : 'Bordereau analysé avec succès'}
              </p>
              {(file || fileName || bordereauFileName) && (
                <p className="text-xs text-muted-foreground mt-1 break-all">{safeDisplayName}</p>
              )}
            </div>
            {isWarningState && onRetryOCR && (
              <Button variant="outline" size="sm" onClick={onRetryOCR} className="gap-1 shrink-0">
                <RefreshCw className="w-4 h-4" />
                Relancer l&apos;analyse
              </Button>
            )}
          </div>

          {/* Résumé de l'analyse */}
          {effectiveAnalysis && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Nombre de lots</p>
              <p className="text-lg font-semibold flex items-center gap-1">
                <Package className="w-4 h-4" />
                {effectiveAnalysis.totalLots ?? 0}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Nombre d'objets</p>
              <p className="text-lg font-semibold">{effectiveAnalysis.totalObjects ?? 0}</p>
            </div>
          </div>
          )}

          {effectiveAnalysis?.auctionHouse && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Salle des ventes</p>
              <p className="font-medium">{effectiveAnalysis.auctionHouse}</p>
            </div>
          )}

          {typeof effectiveAnalysis?.invoiceTotal === 'number' && effectiveAnalysis.invoiceTotal > 0 && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Total facture (Total invoice)</p>
              <p className="font-medium">{effectiveAnalysis.invoiceTotal}€</p>
              {effectiveAnalysis.invoiceTotalRaw && (
                <p className="text-xs text-muted-foreground mt-1">
                  Texte OCR: {effectiveAnalysis.invoiceTotalRaw}
                </p>
              )}
            </div>
          )}

          {effectiveAnalysis?.recommendedCarton && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Carton recommandé</p>
              <p className="font-medium">
                {(() => {
                  const cleanedRef = cleanCartonRef(effectiveAnalysis.recommendedCarton.ref);
                  const cleanedLabel = effectiveAnalysis.recommendedCarton.label ? cleanCartonRef(effectiveAnalysis.recommendedCarton.label) : null;
                  return cleanedRef + (cleanedLabel && cleanedLabel !== cleanedRef ? ` — ${cleanedLabel}` : '');
                })()}
              </p>
              {effectiveAnalysis?.recommendedCarton.inner && (
                <p className="text-xs text-muted-foreground mt-1">
                  Dimensions internes: {effectiveAnalysis?.recommendedCarton.inner.length}×{effectiveAnalysis?.recommendedCarton.inner.width}×{effectiveAnalysis?.recommendedCarton.inner.height} cm
                </p>
              )}
              {typeof effectiveAnalysis.recommendedCarton.priceTTC === 'number' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Prix d’achat TTC: {effectiveAnalysis?.recommendedCarton.priceTTC}€
                </p>
              )}
              {effectiveAnalysis?.recommendedCarton.source && (
                <p className="text-xs text-muted-foreground mt-1">
                  Source: {effectiveAnalysis?.recommendedCarton.source}
                </p>
              )}
            </div>
          )}

          {/* Liste des lots */}
          {effectiveAnalysis?.lots && effectiveAnalysis.lots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Lots détectés:</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {effectiveAnalysis.lots.map((lot, index) => (
                  <div
                    key={index}
                    className="bg-secondary/50 rounded-lg p-3 border border-border"
                  >
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Lot {lot.lotNumber}</Badge>
                      </div>
                      <p className="text-sm font-medium break-words whitespace-normal overflow-wrap-anywhere word-break">{lot.description}</p>
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
                    <div className="text-xs text-muted-foreground mt-1">
                      Prix d’adjudication: {lot.value ?? 0}€
                      {(lot.value ?? 0) === 0 ? ' (non détecté)' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Texte OCR pour vérification (debug utilisateur) */}
          {effectiveAnalysis?.rawText && (
            <details className="bg-secondary/50 rounded-lg p-3 border border-border">
              <summary className="text-sm font-medium cursor-pointer select-none">
                Voir le texte OCR reconnu (pour vérifier)
              </summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-64 overflow-y-auto">
                {effectiveAnalysis.rawText}
              </pre>
            </details>
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

        {/* Si l'analyse a échoué mais qu'on a du texte OCR, l'afficher pour diagnostic */}
        {analysis?.rawText && (
          <details className="bg-secondary/50 rounded-lg p-3 border border-border">
            <summary className="text-sm font-medium cursor-pointer select-none">
              Voir le texte OCR reconnu (pour vérifier)
            </summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-64 overflow-y-auto">
              {effectiveAnalysis.rawText}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
