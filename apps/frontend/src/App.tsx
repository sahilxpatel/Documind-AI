import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DocumentDetail from './pages/DocumentDetail';
import DocumentChat from './pages/DocumentChat';
import NotFound from './pages/NotFound';

/** Keeps signed-in users off the sign-in and sign-up screens. */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'glass-toast',
            duration: 4000,
            // Errors get longer on screen: they carry information to act on.
            error: { duration: 6000 },
          }}
        />

        <Routes>
          <Route path="/" element={<Landing />} />

          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/documents/:id" element={<DocumentDetail />} />
            <Route path="/documents/:id/chat" element={<DocumentChat />} />
          </Route>

          {/* Anything else renders a real 404 rather than a blank screen. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
