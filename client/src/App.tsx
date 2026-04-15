import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";

// Public pages
import HomePage from "@/pages/home";
import ServicesPage from "@/pages/services";
import WorkPage from "@/pages/work";
import ContactPage from "@/pages/contact";
import AuthPage from "@/pages/auth-page";
import SetupPage from "@/pages/setup";
import MeetingProposalPage from "@/pages/meeting-proposal";
import DemoDashboard from "@/pages/demo-dashboard";
import ShaderDemo from "@/pages/demo";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminClients from "@/pages/admin/clients";
import AdminClientDetail from "@/pages/admin/client-detail";
import AdminProjects from "@/pages/admin/projects";
import AdminProjectDetail from "@/pages/admin/project-detail";
import AdminMilestones from "@/pages/admin/milestones";
import AdminDocuments from "@/pages/admin/documents";
import AdminActivity from "@/pages/admin/activity";
import AdminScheduling from "@/pages/admin/scheduling";
import AdminInvoiceReminders from "@/pages/admin/invoice-reminders";
import AdminRecurringPayments from "@/pages/admin/recurring-payments";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminInvoices from "@/pages/admin/invoices";
import AdminPaymentSettings from "@/pages/admin/payment-settings";
import AdminCryptoTracker from "@/pages/admin/crypto-tracker";
import AdminLeadEngine from "@/pages/admin/lead-engine";
import AdminTrader from "@/pages/admin/trader";
import AdminTraderRuns from "@/pages/admin/trader-runs";
import AdminTraderAnalytics from "@/pages/admin/trader-analytics";
import AdminTraderPerformance from "@/pages/admin/trader-performance";
import AdminTraderChat from "@/pages/admin/trader-chat";
import AdminTraderSettings from "@/pages/admin/trader-settings";
import AdminTraderBacktest from "@/pages/admin/trader-backtest";
import AdminTraderWatchlist from "@/pages/admin/trader-watchlist";
import AdminTraderPredictions from "@/pages/admin/trader-predictions";
import AdminTraderArbitrage from "@/pages/admin/trader-arbitrage";
import AdminTraderCryptoArb from "@/pages/admin/trader-crypto-arb";

// Client portal pages
import PortalDashboard from "@/pages/portal/dashboard";
import PortalProjects from "@/pages/portal/projects";
import PortalProjectDetail from "@/pages/portal/project-detail";
import PortalAvailability from "@/pages/portal/availability";
import PortalDocuments from "@/pages/portal/documents";

function Router() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={HomePage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/work" component={WorkPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/setup" component={SetupPage} />
      <Route path="/meeting/:token" component={MeetingProposalPage} />
      <Route path="/demo" component={DemoDashboard} />
      <Route path="/shader-demo" component={ShaderDemo} />

      {/* Admin routes */}
      <ProtectedRoute path="/admin" component={AdminDashboard} requiredRole="admin" />
      <ProtectedRoute path="/admin/clients" component={AdminClients} requiredRole="admin" />
      <ProtectedRoute path="/admin/clients/:id" component={AdminClientDetail} requiredRole="admin" />
      <ProtectedRoute path="/admin/projects" component={AdminProjects} requiredRole="admin" />
      <ProtectedRoute path="/admin/projects/:id" component={AdminProjectDetail} requiredRole="admin" />
      <ProtectedRoute path="/admin/scheduling" component={AdminScheduling} requiredRole="admin" />
      <ProtectedRoute path="/admin/milestones" component={AdminMilestones} requiredRole="admin" />
      <ProtectedRoute path="/admin/documents" component={AdminDocuments} requiredRole="admin" />
      <ProtectedRoute path="/admin/activity" component={AdminActivity} requiredRole="admin" />
      <ProtectedRoute path="/admin/invoice-reminders" component={AdminInvoiceReminders} requiredRole="admin" />
      <ProtectedRoute path="/admin/recurring-payments" component={AdminRecurringPayments} requiredRole="admin" />
      <ProtectedRoute path="/admin/analytics" component={AdminAnalytics} requiredRole="admin" />
      <ProtectedRoute path="/admin/invoices" component={AdminInvoices} requiredRole="admin" />
      <ProtectedRoute path="/admin/payment-settings" component={AdminPaymentSettings} requiredRole="admin" />
      <ProtectedRoute path="/admin/crypto" component={AdminCryptoTracker} requiredRole="admin" />
      <ProtectedRoute path="/admin/lead-engine" component={AdminLeadEngine} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader" component={AdminTrader} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/runs" component={AdminTraderRuns} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/analytics" component={AdminTraderAnalytics} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/performance" component={AdminTraderPerformance} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/chat" component={AdminTraderChat} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/settings" component={AdminTraderSettings} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/backtest" component={AdminTraderBacktest} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/watchlist" component={AdminTraderWatchlist} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/predictions" component={AdminTraderPredictions} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/arbitrage" component={AdminTraderArbitrage} requiredRole="admin" />
      <ProtectedRoute path="/admin/trader/crypto-arb" component={AdminTraderCryptoArb} requiredRole="admin" />

      {/* Client portal routes */}
      <ProtectedRoute path="/portal" component={PortalDashboard} requiredRole="client" />
      <ProtectedRoute path="/portal/projects" component={PortalProjects} requiredRole="client" />
      <ProtectedRoute path="/portal/projects/:id" component={PortalProjectDetail} requiredRole="client" />
      <ProtectedRoute path="/portal/availability" component={PortalAvailability} requiredRole="client" />
      <ProtectedRoute path="/portal/documents" component={PortalDocuments} requiredRole="client" />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
