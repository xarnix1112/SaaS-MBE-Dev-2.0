import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import NewQuotes from "./pages/NewQuotes";
import Payments from "./pages/Payments";
import AuctionHouses from "./pages/AuctionHouses";
import Collections from "./pages/Collections";
import Preparation from "./pages/Preparation";
import Shipments from "./pages/Shipments";
import Pipeline from "./pages/Pipeline";
import Alerts from "./pages/Alerts";
import QuoteDetail from "./pages/QuoteDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/quotes/new" element={<NewQuotes />} />
            <Route path="/quotes/:id" element={<QuoteDetail />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/auction-houses" element={<AuctionHouses />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/preparation" element={<Preparation />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/alerts" element={<Alerts />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
