import React, { useState, useEffect, useRef } from 'react';
import { 
  Map as MapIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import axios from 'axios';

// --- SHARED DESIGN TOKENS (Synced with Dashboard) ---
const IRI_COLORS = {
  'Baik': '#1A7A2E',           
  'Sedang': '#FFFF00',         
  'Rusak Ringan': '#FFC000',   
  'Rusak Berat': '#FF0000',
  'Tidak Ada Data': '#CBD5E1'
};

const getIriCategory = (iri: number | undefined | null) => {
  if (iri === undefined || iri === null || iri <= 0) return 'Tidak Ada Data';
  if (iri < 4) return 'Baik';
  if (iri < 8) return 'Sedang';
  if (iri <= 12) return 'Rusak Ringan';
  return 'Rusak Berat';
};

const useLeaflet = () => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if ((window as any).L) {
      setLoaded(true);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, []);
  return loaded;
};

const LandingPage = ({ setView }: { setView: (v: string) => void }) => {
  const isLeafletLoaded = useLeaflet();
  const mapRef = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);
  const [ruasData, setRuasData] = useState<any[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/ruas/all');
        const data = res.data;
        setRuasData(data);
        
        const yearsSet = new Set<string>();
        data.forEach((r: any) => {
          if (!r.segments) return;
          r.segments.forEach((s: any) => {
            Object.entries(s).forEach(([k, v]) => {
              if (v && typeof v === 'object' && v !== null && ('iri' in (v as any) || 'treatment' in (v as any))) {
                const val = v as any;
                if ((val.iri && val.iri > 0) || (val.treatment && val.treatment !== 'NONE')) {
                  yearsSet.add(k);
                }
              }
            });
          });
        });
        
        const sortedYears = Array.from(yearsSet).sort((a, b) => 
          b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        setAvailableYears(sortedYears);
        if (sortedYears.length > 0) {
          setSelectedYear(prev => {
            const prevStr = String(prev);
            return sortedYears.includes(prevStr) ? prevStr : sortedYears[0];
          });
        }
      } catch (err) {
        console.error("Gagal mengambil data ruas:", err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!isLeafletLoaded) return;
    if (!mapRef.current) {
      const map = (window as any).L.map('public-map', { 
        zoomControl: true,
        scrollWheelZoom: false,
        preferCanvas: true 
      }).setView([-3.67, 128.20], 12);
      
      (window as any).L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO'
      }).addTo(map);
      
      mapRef.current = map;
    }

    const map = mapRef.current;
    
    // Clear existing GeoJSON layer
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (!ruasData.length || !selectedYear) return;

    const features: any[] = [];

    ruasData.forEach(ruas => {
      if (!ruas.segments || !Array.isArray(ruas.segments)) return;
      
      ruas.segments.forEach((seg: any, idx: number) => {
        const lat = parseFloat(seg.latitude || seg.lat1);
        const lon = parseFloat(seg.longitude || seg.lon1);
        if (isNaN(lat) || isNaN(lon)) return;

        let nextLat = lat + 0.0005;
        let nextLon = lon + 0.0005;
        const nextSeg = ruas.segments[idx + 1];
        if (nextSeg) {
          const nLat = parseFloat(nextSeg.latitude || nextSeg.lat1);
          const nLon = parseFloat(nextSeg.longitude || nextSeg.lon1);
          if (!isNaN(nLat) && !isNaN(nLon)) {
            nextLat = nLat;
            nextLon = nLon;
          }
        }

        const dataYear = seg[selectedYear] || { iri: 0 };
        
        const cat = getIriCategory(dataYear.iri);
        const color = (IRI_COLORS as any)[cat] || '#CBD5E1';

        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[lon, lat], [nextLon, nextLat]]
          },
          properties: {
            color: color,
            jalan: ruas.nama_jalan === 'Tanpa Nama' ? ruas.no_ruas : (ruas.nama_jalan || ruas.nama_ruas || ruas.no_ruas || 'Ruas Jalan'),
            kategori: getIriCategory(dataYear.iri)
          }
        });
      });
    });

    if (features.length > 0) {
      const geoJsonData = { type: "FeatureCollection", features };
      const geoJsonLayer = (window as any).L.geoJSON(geoJsonData, {
        style: (feature: any) => ({
          color: feature.properties.color,
          weight: 6,
          opacity: 0.9,
          lineJoin: 'round'
        }),
        onEachFeature: (feature: any, layer: any) => {
          layer.bindTooltip(`
            <div style="font-family: inherit; padding: 4px">
              <div style="font-size: 10px; font-weight: 900; color: #64748B; text-transform: uppercase; margin-bottom: 2px">${feature.properties.jalan}</div>
              <div style="font-size: 12px; font-weight: 800; color: #003B7A">${feature.properties.kategori}</div>
            </div>
          `, { sticky: true });
        }
      }).addTo(map);
      
      geoJsonLayerRef.current = geoJsonLayer;
      map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
    }

  }, [isLeafletLoaded, ruasData, selectedYear]);

  const [stats, setStats] = useState({ 
    mantap: 0, 
    tidakMantap: 0,
    kritis: 0, 
    totalKm: 0,
    baik: 0,
    sedang: 0,
    rusakRingan: 0,
    rusakBerat: 0
  });

  useEffect(() => {
    if (!ruasData.length || !selectedYear) return;

    let totalMeters = 0;
    let panjangMantap = 0;
    let panjangTidakMantap = 0;
    let panjangBaik = 0;
    let panjangSedang = 0;
    let panjangRR = 0;
    let panjangRB = 0;
    let kritisSegments = 0;

    ruasData.forEach(ruas => {
      if (!ruas.segments) return;
      ruas.segments.forEach((seg: any) => {
        const dataYear = seg[selectedYear];
        
        let pKm = 0;
        if (seg.panjang_km !== undefined) {
           pKm = parseFloat(seg.panjang_km); // Already in km
        } else if (seg.sta_akhir !== undefined && seg.sta_awal !== undefined) {
           pKm = Math.abs(parseFloat(seg.sta_akhir) - parseFloat(seg.sta_awal)) / 1000; // Convert meters to km
        }
        
        if (isNaN(pKm) || pKm <= 0) {
            pKm = 0.1; // Fallback jika tidak ada info length, asumsikan 100m = 0.1 km
        }

        if (dataYear && typeof dataYear.iri === 'number' && dataYear.iri > 0) {
          totalMeters += pKm;
          
          if (dataYear.iri < 8) {
            panjangMantap += pKm;
            if (dataYear.iri < 4) {
              panjangBaik += pKm;
            } else {
              panjangSedang += pKm;
            }
          } else {
            panjangTidakMantap += pKm;
            if (dataYear.iri <= 12) {
              panjangRR += pKm;
            } else {
              panjangRB += pKm;
              kritisSegments++;
            }
          }
        }
      });
    });

    const calculatePct = (val: number, total: number) => total > 0 ? parseFloat(((val / total) * 100).toFixed(2)) : 0;

    setStats({
      mantap: calculatePct(panjangMantap, totalMeters),
      tidakMantap: calculatePct(panjangTidakMantap, totalMeters),
      kritis: kritisSegments,
      totalKm: parseFloat(totalMeters.toFixed(2)),
      baik: calculatePct(panjangBaik, totalMeters),
      sedang: calculatePct(panjangSedang, totalMeters),
      rusakRingan: calculatePct(panjangRR, totalMeters),
      rusakBerat: calculatePct(panjangRB, totalMeters)
    });
  }, [ruasData, selectedYear]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative overflow-x-hidden">
      {/* Background Decorative */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden">
         <div className="absolute -top-[200px] -left-[100px] w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[100px]"></div>
         <div className="absolute top-[100px] -right-[100px] w-[600px] h-[600px] bg-[#003B7A]/5 rounded-full blur-[100px]"></div>
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/topography.png')] opacity-[0.15]"></div>
         <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-50/50 to-slate-50"></div>
      </div>

      {/* Navbar */}
      <nav className="fixed w-full z-50 bg-[#003B7A] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-16 items-center">
          <div className="flex items-center gap-3">
             <div className="">
               <img 
                 src="https://upload.wikimedia.org/wikipedia/commons/c/c6/Logo_Kementerian_Pekerjaan_Umum_Republik_Indonesia.svg" 
                 alt="PU PR" 
                 className="h-10 w-auto block object-contain"
               />
             </div>
             <div className="flex flex-col">
               <span className="font-black text-xl leading-none tracking-tighter text-white">ROADTRACK</span>
               <span className="text-[9px] font-black opacity-90 uppercase tracking-[0.2em] text-[#F5A800]">BPJN MALUKU</span>
             </div>
          </div>
          <div>
            <button 
              onClick={() => setView('login')}
              className="bg-[#F5A800] hover:bg-yellow-500 text-[#003B7A] font-black text-xs px-5 py-2 rounded-full shadow-lg transition-all active:scale-95"
            >
              MASUK DASHBOARD &rarr;
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 w-full relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center w-full max-w-6xl mx-auto mb-12"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight leading-[1.1] w-full">
            Sistem Informasi Kemantapan Jalan{" "} 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#003B7A] to-[#125B9A]">
              Provinsi Maluku
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-600 font-medium max-w-4xl mx-auto mb-0 leading-relaxed">
            Mendukung konektivitas nasional melalui pengelolaan dan pembangunan infrastruktur jalan yang terpadu, mantap, dan berkelanjutan untuk kemajuan Bumi Raja-Raja.
          </p>
        </motion.div>

        {/* Main Content Area */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch text-left">
          
          {/* Side Panel (Vertical List) */}
          <div className="w-full lg:w-[380px] flex flex-col gap-5">
            
            {/* Filter Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Pengaturan Peta</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">Tahun Data</label>
                  <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold text-[#003B7A] outline-none focus:ring-2 focus:ring-[#F5A800]/20 transition cursor-pointer"
                  >
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Stats Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex-1 flex flex-col">
               <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Ringkasan Statistik ({selectedYear})</h2>
               
               <div className="flex flex-col gap-4 flex-1">
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex justify-between items-center">
                   <div className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Total Panjang</div>
                   <div className="text-lg font-black text-[#003B7A]">{stats.totalKm.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs font-medium text-slate-400">km</span></div>
                 </div>
                 
                 <div className="bg-[#1A7A2E]/5 p-4 rounded-lg border border-[#1A7A2E]/20 flex justify-between items-center">
                   <div className="text-[11px] font-black text-[#1A7A2E] uppercase tracking-wide">Kemantapan</div>
                   <div className="text-2xl font-black text-[#1A7A2E]">{stats.mantap.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</div>
                 </div>

                 <div className="bg-[#FF0000]/5 p-4 rounded-lg border border-[#FF0000]/20 flex justify-between items-center">
                   <div className="text-[11px] font-black text-[#FF0000] uppercase tracking-wide">Segmen Kritis (RB)</div>
                   <div className="text-lg font-black text-[#FF0000]">{stats.kritis} <span className="text-xs font-medium text-[#FF0000]/60">titik</span></div>
                 </div>

                 {/* Rincian Kondisi */}
                 <div className="mt-2 space-y-3">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-1">Rincian Kondisi</h3>
                   
                   <div className="flex items-center gap-3">
                     <div className="w-1.5 h-8 rounded bg-[#1A7A2E]"></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-end mb-1">
                         <span className="text-[10px] font-black text-slate-600 uppercase">Baik (Mantap)</span>
                         <span className="text-xs font-black text-slate-800">{stats.baik}%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                         <div className="bg-[#1A7A2E] h-full" style={{ width: `${stats.baik}%` }}></div>
                       </div>
                     </div>
                   </div>

                   <div className="flex items-center gap-3">
                     <div className="w-1.5 h-8 rounded bg-[#FFFF00]"></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-end mb-1">
                         <span className="text-[10px] font-black text-slate-600 uppercase">Sedang (Mantap)</span>
                         <span className="text-xs font-black text-slate-800">{stats.sedang}%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                         <div className="bg-[#FFFF00] h-full" style={{ width: `${stats.sedang}%` }}></div>
                       </div>
                     </div>
                   </div>

                   <div className="flex items-center gap-3">
                     <div className="w-1.5 h-8 rounded bg-[#FFC000]"></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-end mb-1">
                         <span className="text-[10px] font-black text-slate-600 uppercase">R. Ringan (Tdk Mantap)</span>
                         <span className="text-xs font-black text-slate-800">{stats.rusakRingan}%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                         <div className="bg-[#FFC000] h-full" style={{ width: `${stats.rusakRingan}%` }}></div>
                       </div>
                     </div>
                   </div>

                   <div className="flex items-center gap-3">
                     <div className="w-1.5 h-8 rounded bg-[#FF0000]"></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-end mb-1">
                         <span className="text-[10px] font-black text-slate-600 uppercase">R. Berat (Tdk Mantap)</span>
                         <span className="text-xs font-black text-slate-800">{stats.rusakBerat}%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                         <div className="bg-[#FF0000] h-full" style={{ width: `${stats.rusakBerat}%` }}></div>
                       </div>
                     </div>
                   </div>

                 </div>
               </div>
            </div>

            {/* Legend Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest block mb-4 border-b pb-2">Legenda Visual Peta</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded shadow-sm bg-[#1A7A2E]"></div><span className="text-[10px] font-bold text-slate-700 uppercase">Baik ({'<'} 4)</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded shadow-sm bg-[#FFFF00]"></div><span className="text-[10px] font-bold text-slate-700 uppercase">Sedang (4-8)</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded shadow-sm bg-[#FFC000]"></div><span className="text-[10px] font-bold text-slate-700 uppercase">R. Ringan (8-12)</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded shadow-sm bg-[#FF0000]"></div><span className="text-[10px] font-bold text-slate-700 uppercase">R. Berat ({'>'} 12)</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded shadow-sm bg-[#CBD5E1]"></div><span className="text-[10px] font-bold text-slate-700 uppercase">Tanpa Data</span></div>
                </div>
            </div>

          </div>

          {/* Map Area */}
          <div className="flex-1 bg-white p-2 rounded-xl shadow-lg border border-slate-200 relative min-h-[600px] lg:min-h-auto">
            <div className="absolute top-4 right-4 z-[400] bg-white/95 backdrop-blur px-4 py-2 rounded-lg shadow-sm border border-slate-200 text-right pointer-events-none">
              <span className="text-[10px] font-black text-slate-400 uppercase block mb-0.5 tracking-wider">Status Tampilan</span>
              <span className="text-sm font-black text-[#003B7A]">Kondisi Permukaan Jalan ({selectedYear})</span>
            </div>
            
            <div id="public-map" className="w-full h-full min-h-[600px] rounded-lg overflow-hidden border border-slate-100 z-10 bg-slate-50"></div>
            
            {!isLeafletLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur z-[1000] flex-col gap-3 rounded-xl">
                <MapIcon className="animate-bounce text-[#003B7A]" size={40} />
                <p className="text-xs font-black text-[#003B7A] uppercase tracking-widest">Memuat Peta...</p>
              </div>
            )}
          </div>
        </div>

      </div>
      
      {/* Footer */}
      <footer className="bg-slate-800 text-slate-400 py-8 text-center text-sm border-t-4 border-[#003B7A]">
        <p className="font-medium">&copy; 2026 BPJN Maluku - RoadTrack v2.0.0. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
