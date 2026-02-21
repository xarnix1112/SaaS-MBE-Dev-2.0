import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { HomeRedirect } from "@/components/auth/HomeRedirect";
import Dashboard from "./pages/Dashboard";
import NewQuotes from "./pages/NewQuotes";
import Payments from "./pages/Payments";
import AuctionHouses from "./pages/AuctionHouses";
import Collections from "./pages/Collections";
import Preparation from "./pages/Preparation";
import Shipments from "./pages/Shipments";
import Pipeline from "./pages/Pipeline";
import QuoteDetail from "./pages/QuoteDetail";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Welcome from "./pages/auth/Welcome";
import TypeformCallback from "./pages/auth/TypeformCallback";
import SetupMBE from "./pages/onboarding/SetupMBE";
import Success from "./pages/onboarding/Success";
import { bootstrapFirestoreCollections } from "./lib/firestoreBootstrap";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import { loadShippingRates, loadCartonPrices } from "./lib/pricing";
import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

const App = () => {
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Bootstrap Firestore collections (_meta) pour assurer leur existence
    // Ne s'exécute que si l'utilisateur est authentifié
    if (user && !user.isAnonymous && !authLoading) {
      bootstrapFirestoreCollections();
    }
  }, [user, authLoading]);

  // Charger les tarifs uniquement lorsque l'utilisateur est authentifié
  useEffect(() => {
    // Attendre que l'authentification soit vérifiée
    if (authLoading) return;
    
    // Ne charger que si l'utilisateur est connecté (pas anonyme)
    if (!user || user.isAnonymous) {
      console.log("[App] ⏸️ Utilisateur non connecté, chargement des tarifs différé");
      return;
    }
    
    // Charger préventivement les tarifs d'expédition et les prix des cartons
    // pour garantir leur disponibilité et détecter les erreurs tôt
    console.log("[App] 🔄 Chargement préventif des tarifs d'expédition et des prix cartons...");
    Promise.all([
      loadShippingRates().then(zones => {
        if (zones.length > 0) {
          console.log(`[App] ✅ ${zones.length} zone(s) d'expédition chargée(s) avec succès`);
        } else {
          console.error(`[App] ❌ AUCUNE zone d'expédition chargée - Vérifiez que la grille tarifaire est initialisée dans Paramètres → Expédition`);
        }
      }).catch(error => {
        console.error(`[App] ❌ Erreur lors du chargement des tarifs d'expédition:`, error);
      }),
      loadCartonPrices().then(prices => {
        if (prices.size > 0) {
          console.log(`[App] ✅ ${prices.size} prix de carton(s) chargé(s) avec succès`);
        } else {
          console.error(`[App] ❌ AUCUN prix de carton chargé - Vérifiez que des cartons sont configurés dans Paramètres → Cartons`);
        }
      }).catch(error => {
        console.error(`[App] ❌ Erreur lors du chargement des prix cartons:`, error);
      })
    ]).then(() => {
      console.log("[App] ✅ Chargement préventif terminé");
    }).catch(error => {
      console.error("[App] ❌ Erreur lors du chargement préventif:", error);
    });
  }, [user, authLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Route racine - Redirige selon l'état d'authentification */}
            <Route path="/" element={<HomeRedirect />} />
            
            {/* Page d'accueil - Choix entre connexion et inscription */}
            <Route path="/welcome" element={<Welcome />} />
            
            {/* Routes publiques (authentification) */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* Callback OAuth Typeform - redirige vers le backend */}
            <Route path="/auth/typeform/callback" element={<TypeformCallback />} />
            
            {/* Routes d'onboarding */}
            <Route path="/setup-mbe" element={<ProtectedRoute requireSetup={false}><SetupMBE /></ProtectedRoute>} />
            <Route path="/onboarding/success" element={<ProtectedRoute requireSetup={false}><Success /></ProtectedRoute>} />
            
            {/* Routes protégées (nécessitent authentification + setup complet) */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/quotes/new" element={<NewQuotes />} />
              <Route path="/quotes/:id" element={<QuoteDetail />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route path="/auction-houses" element={<AuctionHouses />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/preparation" element={<Preparation />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/emails" element={<Settings />} />
              <Route path="/account" element={<Account />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
