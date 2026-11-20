import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, isAdmin } from './auth';
import { ClientAuthProvider } from './client-auth';
import { Layout } from './components/Layout';
import { ClientLayout, RequireClient } from './components/ClientLayout';
import { PublicLayout } from './components/PublicLayout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import ServiceRequests from './pages/ServiceRequests';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';
import CustomerDetail from './pages/CustomerDetail';
import AssessmentList from './pages/AssessmentList';
import AssessmentForm from './pages/AssessmentForm';
import AssessmentDetail from './pages/AssessmentDetail';
import ScoreHistory from './pages/ScoreHistory';
import HealthScores from './pages/HealthScores';
import FindingList from './pages/FindingList';
import FindingForm from './pages/FindingForm';
import FindingDetail from './pages/FindingDetail';
import RemediationBoard from './pages/RemediationBoard';
import CsvImport from './pages/CsvImport';
import Reports from './pages/Reports';
import ReportPreview from './pages/ReportPreview';
import Settings from './pages/Settings';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';

const Landing = lazy(() => import('./pages/public/Landing'));
const Services = lazy(() => import('./pages/public/Services'));
const FreeCheck = lazy(() => import('./pages/public/FreeCheck'));
const Result = lazy(() => import('./pages/public/Result'));
const ClientLogin = lazy(() => import('./pages/client/ClientLogin'));
const ClientSignup = lazy(() => import('./pages/client/ClientSignup'));
const ClientVerify = lazy(() => import('./pages/client/ClientVerify'));
const ClientDashboard = lazy(() => import('./pages/client/ClientDashboard'));
const ClientServices = lazy(() => import('./pages/client/ClientServices'));
const ClientRequests = lazy(() => import('./pages/client/ClientRequests'));
const ClientReports = lazy(() => import('./pages/client/ClientReports'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isAdmin(user)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner label="Loading" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route
              path="/"
              element={
                <Lazy>
                  <Landing />
                </Lazy>
              }
            />
            <Route
              path="/services"
              element={
                <Lazy>
                  <Services />
                </Lazy>
              }
            />
            <Route
              path="/free/:serviceKey"
              element={
                <Lazy>
                  <FreeCheck />
                </Lazy>
              }
            />
            <Route
              path="/results/:id"
              element={
                <Lazy>
                  <Result />
                </Lazy>
              }
            />
          </Route>

          <Route
            path="/client/login"
            element={
              <Lazy>
                <ClientLogin />
              </Lazy>
            }
          />
          <Route
            path="/client/signup"
            element={
              <Lazy>
                <ClientSignup />
              </Lazy>
            }
          />
          <Route
            path="/client/verify"
            element={
              <Lazy>
                <ClientVerify />
              </Lazy>
            }
          />

          <Route
            path="/client"
            element={
              <ClientAuthProvider>
                <RequireClient>
                  <ClientLayout />
                </RequireClient>
              </ClientAuthProvider>
            }
          >
            <Route
              index
              element={
                <Lazy>
                  <ClientDashboard />
                </Lazy>
              }
            />
            <Route
              path="services"
              element={
                <Lazy>
                  <ClientServices />
                </Lazy>
              }
            />
            <Route
              path="requests"
              element={
                <Lazy>
                  <ClientRequests />
                </Lazy>
              }
            />
            <Route
              path="reports"
              element={
                <Lazy>
                  <ClientReports />
                </Lazy>
              }
            />
            <Route
              path="profile"
              element={
                <Lazy>
                  <ClientProfile />
                </Lazy>
              }
            />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/service-requests" element={<ServiceRequests />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/customers/new" element={<CustomerForm />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/customers/:id/edit" element={<CustomerForm />} />
            <Route path="/assessments" element={<AssessmentList />} />
            <Route path="/assessments/new" element={<AssessmentForm />} />
            <Route path="/assessments/:id/edit" element={<AssessmentForm />} />
            <Route path="/assessments/:id" element={<AssessmentDetail />} />
            <Route path="/assessments/:id/history" element={<ScoreHistory />} />
            <Route path="/health-score" element={<HealthScores />} />
            <Route path="/findings" element={<FindingList />} />
            <Route path="/findings/new" element={<FindingForm />} />
            <Route path="/findings/:id" element={<FindingDetail />} />
            <Route path="/remediation" element={<RemediationBoard />} />
            <Route path="/import" element={<CsvImport />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/:id" element={<ReportPreview />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/users"
              element={
                <RequireAdmin>
                  <Users />
                </RequireAdmin>
              }
            />
            <Route
              path="/audit"
              element={
                <RequireAdmin>
                  <AuditLog />
                </RequireAdmin>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
