import { Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  const navigate = useNavigate();

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingPage setView={(v) => navigate(v === 'login' ? '/login' : '/')} />
          </motion.div>
        } />
        <Route path="/login" element={
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoginPage />
          </motion.div>
        } />
        <Route path="/dashboard" element={
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardPage setView={(v) => navigate(v === 'landing' ? '/' : '/dashboard')} />
          </motion.div>
        } />
      </Routes>
    </AnimatePresence>
  );
}
