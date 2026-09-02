import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import LoginPage from "./pages/Login";
import ProjectDashboard from "./pages/ProjectDashboard";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import About from "./pages/About";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import BetaApply from "./pages/BetaApply";
import FeedbackPage from "./pages/FeedbackPage";
import AdminLayout from "../../admin/src/components/AdminLayout";
import AdminOverview from "../../admin/src/pages/AdminOverview";
import UserManagement from "../../admin/src/pages/UserManagement";
import ProjectInspection from "../../admin/src/pages/ProjectInspection";
import Analytics from "../../admin/src/pages/Analytics";
import ActivityFeed from "../../admin/src/pages/ActivityFeed";
import MonitoringHealth from "../../admin/src/pages/MonitoringHealth";
import MonitoringRequests from "../../admin/src/pages/MonitoringRequests";
import MonitoringErrors from "../../admin/src/pages/MonitoringErrors";
import UserInsights from "../../admin/src/pages/UserInsights";
import BetaRequests from "../../admin/src/pages/BetaRequests";

function AdminPageContent() {
  const [location] = useLocation();
  const normalizedPath = location.toLowerCase();

  if (normalizedPath.includes("/admin/users")) return <UserManagement />;
  if (normalizedPath.includes("/admin/projects")) return <ProjectInspection />;
  if (normalizedPath.includes("/admin/analytics")) return <Analytics />;
  if (normalizedPath.includes("/admin/feed")) return <ActivityFeed />;
  if (normalizedPath.includes("/admin/beta")) return <BetaRequests />;
  if (normalizedPath.includes("/admin/monitoring/requests")) return <MonitoringRequests />;
  if (normalizedPath.includes("/admin/monitoring/errors")) return <MonitoringErrors />;
  if (normalizedPath.includes("/admin/monitoring/users")) return <UserInsights />;
  if (normalizedPath.includes("/admin/monitoring")) return <MonitoringHealth />;
  
  return <AdminOverview />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route path="/projects" component={ProjectDashboard} />
      <Route path="/projects/:projectId" component={ProjectWorkspace} />
      <Route path="/about" component={About} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/support" component={Support} />
      <Route path="/beta-apply" component={BetaApply} />
      <Route path="/feedback" component={FeedbackPage} />

      <Route path="/admin/:rest*">
        <AdminLayout>
          <AdminPageContent />
        </AdminLayout>
      </Route>
      <Route path="/admin">
        <AdminLayout>
          <AdminPageContent />
        </AdminLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
