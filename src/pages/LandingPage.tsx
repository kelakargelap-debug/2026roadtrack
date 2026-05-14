import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { LogIn, User, Lock, Eye, EyeOff, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const form = new URLSearchParams();
      form.append('username', email);
      form.append('password', password);
      const res = await axios.post('/api/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login gagal, silakan periksa kredensial Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#003B7A] overflow-hidden flex flex-col lg:flex-row">
      {/* Background Ornaments */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] bg-blue-500/20 rounded-full blur-[120px]"
        ></motion.div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: "easeOut", delay: 0.5 }}
          className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-[#F5A800]/10 rounded-full blur-[120px]"
        ></motion.div>
        <div className="absolute inset-0 opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/topography.png')]"></div>
      </div>

      {/* Main Content Area (Landing) - 2/3 on desktop */}
      <motion.div 
        layout
        transition={{ 
          layout: { type: 'spring', damping: 30, stiffness: 150 },
          default: { duration: 0.2 }
        }}
        className={`relative z-10 flex flex-col ${showLogin ? 'lg:w-2/3' : 'lg:w-full'} w-full min-h-screen`}
      >
        {/* Navbar */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="p-6 lg:p-10 flex justify-between items-center bg-transparent shrink-0"
        >
          <div className="flex items-center gap-4">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/c/c6/Logo_Kementerian_Pekerjaan_Umum_Republik_Indonesia.svg" 
              alt="Logo PU" 
              className="h-10 lg:h-12 w-auto"
            />
            <div className="flex flex-col">
              <span className="text-white font-black text-xl lg:text-2xl tracking-tighter leading-none">ROADTRACK</span>
              <span className="text-[#F5A800] text-[8px] lg:text-[10px] font-black tracking-[0.3em] uppercase">BPJN Maluku</span>
            </div>
          </div>
          
          <AnimatePresence>
            {!showLogin && (
              <motion.button
                key="login-btn"
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-2 bg-[#F5A800] text-[#003B7A] font-black px-6 py-2.5 rounded-full shadow-xl hover:shadow-[#F5A800]/20 hover:scale-105 active:scale-95 uppercase text-xs tracking-wider"
              >
                <LogIn size={18} />
                Masuk Sistem
              </motion.button>
            )}
          </AnimatePresence>
        </motion.header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col justify-center items-start px-6 lg:px-20 py-20 max-w-5xl">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { 
                opacity: 1,
                transition: { staggerChildren: 0.15, delayChildren: 0.2 }
              }
            }}
          >
            <motion.h1 
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
              }}
              className="text-white text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1] tracking-tight"
            >
              Sistem Informasi <br />
              <span className="text-[#F5A800]">Kemantapan Jalan</span> <br />
              Provinsi Maluku
            </motion.h1>
            
            <motion.p 
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
              }}
              className="text-blue-100 text-lg md:text-xl font-medium mb-12 max-w-2xl leading-relaxed opacity-90"
            >
              Mendukung konektivitas nasional melalui pengelolaan dan pembangunan infrastruktur jalan yang terpadu, mantap, dan berkelanjutan untuk kemajuan Bumi Raja-Raja.
            </motion.p>

            <AnimatePresence>
              {!showLogin && (
                <motion.button 
                  variants={{
                    hidden: { opacity: 0, scale: 0.9 },
                    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } }
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  onClick={() => setShowLogin(true)}
                  className="group flex items-center gap-4 bg-white/10 backdrop-blur-md border border-white/20 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#F5A800] hover:text-[#003B7A] hover:border-[#F5A800] transition-all duration-300 shadow-2xl"
                >
                  Mulai Eksplorasi
                  <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </main>

        <footer className="p-8 lg:px-20 text-blue-300/40 text-xs font-bold uppercase tracking-[0.2em]">
          &copy; 2026 BPJN MALUKU - KEMENTERIAN PEKERJAAN UMUM
        </footer>
      </motion.div>

      {/* Login Sidebar - 1/3 on desktop */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 150 }}
            className="lg:w-1/3 w-full bg-white relative z-20 shadow-[-20px_0_60px_rgba(0,0,0,0.2)] flex flex-col"
          >
            {/* Close Button Mobile / Desktop Toggle */}
            <button 
              onClick={() => setShowLogin(false)}
              className="absolute top-8 right-8 p-3 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-2xl transition-all"
            >
              <X size={24} />
            </button>

            <div className="flex-1 flex flex-col justify-center px-10 sm:px-16 lg:px-12 py-20">
              <div className="mb-12 text-center lg:text-left">
                <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 mx-auto lg:mx-0 shadow-inner">
                  <LogIn className="text-[#003B7A]" size={36} />
                </div>
                <h2 className="text-3xl font-black text-[#003B7A] mb-2 uppercase tracking-tight">Otentikasi</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Akses Dashboard RoadTrack</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Username / Email</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <User size={18} />
                    </div>
                    <input 
                      type="text" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@roadtrack.id"
                      required
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-800 outline-none focus:border-[#003B7A] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Kata Sandi</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock size={18} />
                    </div>
                    <input 
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-12 text-sm font-bold text-slate-800 outline-none focus:border-[#003B7A] transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#003B7A]"
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-50 border-l-4 border-red-500 rounded-xl text-red-600 text-xs font-bold"
                  >
                    {error}
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#003B7A] text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:bg-[#125B9A] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                >
                  {loading ? 'Memvalidasi...' : 'Masuk Dashboard'}
                </button>
              </form>

              <div className="mt-12 text-center lg:text-left">
                <p className="text-slate-400 text-[10px] font-black uppercase leading-relaxed tracking-wider">
                  Sistem ini hanya dapat diakses oleh petugas internal yang telah terdaftar secara resmi di BPJN Maluku.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;

