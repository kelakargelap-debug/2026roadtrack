import { Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

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
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardPage setView={(v) => navigate(v === 'landing' ? '/' : '/dashboard')} />
          </motion.div>
        } />
        {/* Redirect for any old login bookmarks */}
        <Route path="/login" element={<LandingPage />} />
      </Routes>
    </AnimatePresence>
  );
}
