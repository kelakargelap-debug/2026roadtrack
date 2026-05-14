import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  const navigate = useNavigate();

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingPage />
          </motion.div>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DashboardPage setView={(v) => navigate(v === 'landing' ? '/' : '/dashboard')} />
            </motion.div>
          </ProtectedRoute>
        } />
        {/* Redirect for any old login bookmarks */}
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
