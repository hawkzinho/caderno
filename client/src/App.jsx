import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

function AppLoading() {
  return <div className="app-loading">Carregando...</div>;
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AppLoading />;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AppLoading />;
  }

  return isAuthenticated ? <Navigate to="/app" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={(
              <PublicRoute>
                <Suspense fallback={<AppLoading />}>
                  <AuthPage />
                </Suspense>
              </PublicRoute>
            )}
          />
          <Route
            path="/app/*"
            element={(
              <ProtectedRoute>
                <Suspense fallback={<AppLoading />}>
                  <DashboardPage />
                </Suspense>
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
