import React, { useState, useEffect, useRef } from 'react';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { TrendDashboard } from '../components/TrendDashboard';
import { 
  Map as MapIcon, 
  BarChart3,
  TrendingUp, 
  Upload, 
  Wrench, 
  Settings, 
  Database,
  Save,
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Search,
  LogOut,
  User,
  List,
  X,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// --- DESIGN SYSTEM TOKENS ---
const IRI_COLORS = {
  'Baik': '#1A7A2E',           // Dark Green
  'Sedang': '#FFFF00',         // Yellow
  'Sedang Marginal': '#92D050', // Light Green
  'Rusak Ringan': '#FFC000',   // Orange
  'Rusak Berat': '#FF0000',    // Red
  'Tidak Ada Data': '#CBD5E1'    // Gray
};


const TREAT_COLORS = {
  'RM': { bg: '#92D050', fg: '#000', label: 'Routine Maintanance' },
  'RK': { bg: '#FFFF00', fg: '#000', label: 'Rutin Kondisi' },
  'HLD': { bg: '#FFC000', fg: '#000', label: 'Holding' },
  'PRV': { bg: '#E26B67', fg: '#fff', label: 'Preventif' },
  'MNR': { bg: '#A392C1', fg: '#fff', label: 'Rehab. Minor' },
  'MYR': { bg: '#C5C1AA', fg: '#000', label: 'Rehab. Mayor' },
  'RKN': { bg: '#FF0000', fg: '#fff', label: 'Rekonstruksi' },
  'NONE': { bg: '#F1F5F9', fg: '#64748B', label: 'None' }
};

const getTreatmentConfig = (t: string | undefined | null) => {
  const input = String(t || 'NONE').toUpperCase().trim();
  
  if (input === 'RM' || input.includes('ROUTINE') || input.includes('MAINTENANCE') || input.includes('RUTIN PEMELIHARAAN')) return TREAT_COLORS['RM'];
  if (input === 'RK' || input.includes('KONDISI') || input.includes('RUTIN KONDISI')) return TREAT_COLORS['RK'];
  if (input === 'HLD' || input.includes('HOLDING')) return TREAT_COLORS['HLD'];
  if (input === 'PRV' || input.includes('PREVENTIF') || input.includes('PREVENTIVE')) return TREAT_COLORS['PRV'];
  if (input === 'MNR' || input.includes('MINOR') || input.includes('REHAB MINOR')) return TREAT_COLORS['MNR'];
  if (input === 'MYR' || input.includes('MAYOR') || input.includes('REHAB MAYOR')) return TREAT_COLORS['MYR'];
  if (input === 'RKN' || input.includes('REKON') || input.includes('REKONSTRUKSI')) return TREAT_COLORS['RKN'];
  
  return TREAT_COLORS['NONE'];
};

// --- UTILS ---
const formatSTA = (sta: number | string | undefined | null) => {
  if (sta === undefined || sta === null) return "0+000";
  const val = typeof sta === "number" ? sta : parseFloat(String(sta));
  if (isNaN(val)) return "0+000";
  const km = Math.floor(val / 1000);
  const m = Math.floor(val % 1000);
  return `${km}+${String(m).padStart(3, '0')}`;
};

const getIriCategory = (iri: number | undefined | null) => {
  if (iri === undefined || iri === null || iri <= 0) return 'Tidak Ada Data';
  if (iri <= 4) return 'Baik';
  if (iri <= 6) return 'Sedang';
  if (iri <= 8) return 'Sedang Marginal';
  if (iri <= 12) return 'Rusak Ringan';
  return 'Rusak Berat';
};

  const getSegmentColor = (segment: any, year: string, mode: string) => {
    const dataYear = segment[year] || { iri: 0, treatment: 'NONE' };
    if (mode === 'iri') {
      return (IRI_COLORS as any)[getIriCategory(dataYear.iri)];
    } else {
      return getTreatmentConfig(dataYear.treatment).bg;
    }
  };

// --- CUSTOM HOOK: LOAD LEAFLET ---
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

const DashboardPage = ({ setView }: { setView: (v: string) => void }) => {
  const isLeafletLoaded = useLeaflet();
  const mapRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);

  const [ruasData, setRuasData] = useState<any[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [year, setYear] = useState<string>('');
  const [mode, setMode] = useState('iri'); // 'iri' or 'treatment'
  const [mainView, setMainView] = useState<'map' | 'analytics' | 'trend'>('map');
  const [selectedRuasId, setSelectedRuasId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Correction Form State
  const [editableSegments, setEditableSegments] = useState<any[]>([]);
  const [dbTab, setDbTab] = useState<'kondisi' | 'treatment'>('kondisi');
  const [searchSegQuery, setSearchSegQuery] = useState('');
  const [selectedDbRuas, setSelectedDbRuas] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isStripmapExpanded, setIsStripmapExpanded] = useState(false);
  const [selectedDbYear, setSelectedDbYear] = useState<string>('');

  const filteredEditableSegments = editableSegments.filter(s => {
    if (!selectedDbYear || !selectedDbRuas) return false;
    const q = searchSegQuery.toLowerCase();
    const matchesSearch = (
      String(s.no_ruas || "").toLowerCase().includes(q) || 
      String(s.nama_jalan || "").toLowerCase().includes(q) || 
      String(s.segment_id || "").toLowerCase().includes(q)
    );
    const matchesRuas = selectedDbRuas === 'all' || s.no_ruas === selectedDbRuas;
    return matchesSearch && matchesRuas;
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/ruas/all');
        const data = res.data;
        setRuasData(data);
        
        // Extract all unique labels (years) from segments
        const yearsSet = new Set<string>();
        data.forEach((r: any) => {
          if (!r.segments) return;
          r.segments.forEach((s: any) => {
            Object.entries(s).forEach(([k, v]) => {
              // Any key that has an object with 'iri' or 'treatment' is a valid year/period
              if (v && typeof v === 'object' && v !== null && ('iri' in (v as any) || 'treatment' in (v as any))) {
                // Only add if it has actual data (iri > 0 or non-default treatment)
                const val = v as any;
                if ((val.iri && val.iri > 0) || (val.treatment && val.treatment !== 'NONE')) {
                  yearsSet.add(k);
                }
              }
            });
          });
        });
        
        // Natural sort descending: 2026, 2025 S2, 2025
        const sortedYears = Array.from(yearsSet).sort((a, b) => 
          b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        if (sortedYears.length > 0) {
          setAvailableYears(sortedYears);
          // Set to latest year by default if not set
          setYear(prev => {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(0);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(dataBuffer, { type: 'buffer' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("File Excel kosong atau tidak terbaca.");
        }

        setUploadProgress(20); // Data parsed
        
        // Use a timeout for responsiveness
        await new Promise(r => setTimeout(r, 100));
        
        setUploadProgress(40); // Sending...
        
        await axios.post('/api/import/save', { data }, {
            timeout: 60000 // 60 seconds timeout for 4000 rows
        });

        setUploadProgress(100);
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setUploadProgress(null);
          alert(`Berhasil mengunggah ${data.length} baris data!`);
          window.location.reload();
        }, 800);
      } catch (error: any) {
        console.error("Upload error:", error);
        const msg = error.response?.data?.detail || error.message || "Gagal membaca atau menyimpan data. Periksa format file Anda.";
        alert(msg);
        setUploadProgress(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };


  const getIriBg = (v: number | undefined | null) => {
    if (v === undefined || v === null || v <= 0) return { bg: '#CBD5E1', fg: '#64748B' };
    if (v <= 4) return { bg: '#1A7A2E', fg: '#fff' };
    if (v <= 6) return { bg: '#A8C822', fg: '#333' };
    if (v <= 8) return { bg: '#F5C800', fg: '#333' };
    if (v <= 12) return { bg: '#E07820', fg: '#fff' };
    return { bg: '#CC1A1A', fg: '#fff' };
  };

  const selectedRuas = ruasData.find(r => r.no_ruas === selectedRuasId || r.id === selectedRuasId);

  useEffect(() => {
    if (isSettingsModalOpen && ruasData.length > 0) {
      try {
        const flattened = ruasData.flatMap(r => (r.segments || []).map((s: any) => ({
          ...s,
          db_id: s.id, 
          no_ruas: r.no_ruas,
          nama_jalan: r.nama_jalan,
          ppk: r.ppk,
          tahun: selectedDbYear,
          iri_value: s[selectedDbYear]?.iri || 0,
          treatment: s[selectedDbYear]?.treatment || 'NONE'
        })));
        setEditableSegments(flattened);
      } catch (err) {
        console.error("Error flattening segments:", err);
      }
    }
  }, [isSettingsModalOpen, ruasData, selectedDbYear]);

  const handleUpdateLocalSegment = (id: any, field: string, value: any) => {
    setEditableSegments(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSaveAllCorrections = async () => {
    setIsSaving(true);
    try {
      // For simplicity, we loop the update calls or add a batch endpoint
      // Here we'll just alert and refresh for now, or implement a batch if needed
      for (const seg of editableSegments) {
        // Only update if changed (optional optimization)
        await axios.post('/api/segmen/update-manual', {
          id: seg.db_id,
          no_ruas: seg.no_ruas,
          nama_jalan: seg.nama_jalan,
          ppk: seg.ppk,
          segment_id: seg.segment_id,
          sta_awal: seg.sta_awal,
          sta_akhir: seg.sta_akhir,
          longitude: seg.longitude,
          latitude: seg.latitude,
          iri_value: seg.iri_value,
          treatment: seg.treatment,
          tahun: seg.tahun
        });
      }
      alert("Seluruh database berhasil diperbarui!");
      setIsSettingsModalOpen(false);
      window.location.reload();
    } catch (err) {
      alert("Gagal memperbarui beberapa data. Cek koneksi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} segmen terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;

    setIsSaving(true);
    try {
      await axios.post('/api/segmen/delete-multiple', { ids: Array.from(selectedIds) });
      alert("Segmen terpilih berhasil dihapus!");
      window.location.reload();
    } catch (err) {
      alert("Gagal menghapus data.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm("PERINGATAN: Anda akan menghapus SELURUH data jalan (Ruas, Segmen, dan Kondisi) dari database. Tindakan ini tidak dapat dibatalkan. Lanjutkan?")) return;
    if (!confirm("Konfirmasi terakhir: Apakah Anda benar-benar yakin ingin mengosongkan seluruh database jalan?")) return;

    setIsSaving(true);
    try {
      await axios.post('/api/admin/clear-database');
      alert("Database road data telah berhasil dikosongkan!");
      setIsSettingsModalOpen(false);
      window.location.reload();
    } catch (err) {
      alert("Gagal mengosongkan database.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteYearData = async () => {
    if (!selectedDbYear) return;
    if (!confirm(`Hapus SELURUH data kondisi dan penanganan untuk periode/tahun "${selectedDbYear}"? Segmen dan Ruas jalan TIDAK akan dihapus. Lanjutkan?`)) return;

    setIsSaving(true);
    try {
      await axios.post('/api/admin/clear-database', { year: selectedDbYear });
      alert(`Data untuk periode ${selectedDbYear} telah berhasil dihapus!`);
      window.location.reload();
    } catch (err) {
      alert("Gagal menghapus data tahun.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadRuasExcel = async () => {
    if (!selectedRuas) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stripmap Data');

    // Setup Columns
    const columns = [
      { header: 'No. Ruas', key: 'no_ruas', width: 12 },
      { header: 'Nama Jalan', key: 'nama_jalan', width: 30 },
      { header: 'PPK', key: 'ppk', width: 15 },
      { header: 'ID Segmen', key: 'segment_id', width: 15 },
      { header: 'STA Awal', key: 'sta_awal', width: 10 },
      { header: 'STA Akhir', key: 'sta_akhir', width: 10 },
      { header: 'STA Label', key: 'sta_label', width: 12 },
      { header: 'Lon', key: 'lon', width: 15 },
      { header: 'Lat', key: 'lat', width: 15 },
    ];

    availableYears.forEach(y => {
      columns.push({ header: `IRI ${y}`, key: `iri_${y}`, width: 10 });
      columns.push({ header: `Penanganan ${y}`, key: `treatment_${y}`, width: 18 });
    });

    worksheet.columns = columns;

    // Add Data Rows
    selectedRuas.segments.forEach((seg: any) => {
      const rowData: any = {
        no_ruas: selectedRuas.no_ruas || selectedRuas.id,
        nama_jalan: selectedRuas.nama_jalan || selectedRuas.nama,
        ppk: selectedRuas.ppk,
        segment_id: seg.segment_id || seg.id,
        sta_awal: seg.sta_awal,
        sta_akhir: seg.sta_akhir,
        sta_label: formatSTA(seg.sta_awal),
        lon: seg.longitude || seg.lon1,
        lat: seg.latitude || seg.lat1,
      };

      availableYears.forEach(y => {
        const dataYear = seg[y] || { iri: 0, treatment: 'NONE' };
        rowData[`iri_${y}`] = dataYear.iri || 0;
        rowData[`treatment_${y}`] = dataYear.treatment || 'NONE';
      });

      const row = worksheet.addRow(rowData);

      // Apply Colors to IRI cells
      availableYears.forEach((y) => {
        const iriVal = rowData[`iri_${y}`];
        const cell = row.getCell(`iri_${y}`);
        
        if (iriVal > 0) {
          const cfg = getIriBg(iriVal);
          const argbBg = 'FF' + cfg.bg.replace('#', '').toUpperCase();
          const argbFg = (cfg.fg === '#fff' || cfg.fg === 'fff' || cfg.fg === '#FFFFFF') ? 'FFFFFFFF' : 'FF333333';
          
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: argbBg }
          };
          cell.font = {
            color: { argb: argbFg },
            bold: true,
            name: 'Courier New',
            size: 9
          };
          cell.alignment = { horizontal: 'center' };
        }

        // Apply Colors to Treatment cells
        const treatVal = rowData[`treatment_${y}`];
        const cellTrt = row.getCell(`treatment_${y}`);
        if (treatVal && treatVal !== 'NONE') {
          const cfg = getTreatmentConfig(treatVal);
          const argbBg = 'FF' + cfg.bg.replace('#', '').toUpperCase();
          const argbFg = (cfg.fg === '#fff' || cfg.fg === 'fff' || cfg.fg === '#FFFFFF') ? 'FFFFFFFF' : 'FF333333';
          
          cellTrt.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: argbBg }
          };
          cellTrt.font = {
            color: { argb: argbFg },
            bold: true,
            size: 9
          };
          cellTrt.alignment = { horizontal: 'center' };
        }
      });
    });

    // Style header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF003B7A' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Generate and Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Stripmap_${selectedRuas.no_ruas || selectedRuas.id}_Export.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleSelectAll = (visibleSegments: any[]) => {
    if (selectedIds.size === visibleSegments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleSegments.map(s => s.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Initialize Map
  useEffect(() => {
    if (!isLeafletLoaded || mapRef.current) return;

    // Default center Ambon
    const map = (window as any).L.map('gis-map', { 
      zoomControl: false,
      preferCanvas: true 
    }).setView([-3.67, 128.20], 13);
    (window as any).L.control.zoom({ position: 'bottomright' }).addTo(map);

    (window as any).L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isLeafletLoaded]);

  // Render/Update Polylines based on year and mode
  useEffect(() => {
    if (!mapRef.current) return;

    try {
      // Clear old
      polylinesRef.current.forEach(layer => {
        if (mapRef.current && layer) mapRef.current.removeLayer(layer);
      });
      polylinesRef.current = [];

      if (!Array.isArray(ruasData)) return;

      ruasData.forEach(ruas => {
        if (!ruas || !Array.isArray(ruas.segments)) return;
        
        ruas.segments.forEach((seg, idx) => {
          if (!seg) return;
          const lat = parseFloat(seg.latitude || seg.lat1);
          const lon = parseFloat(seg.longitude || seg.lon1);
          
          if (isNaN(lat) || isNaN(lon)) return; // Skip invalid segments

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

          const color = getSegmentColor(seg, year, mode);
          
          const polyline = (window as any).L.polyline(
            [[lat, lon], [nextLat, nextLon]], 
            { 
              color: color, 
              weight: selectedRuasId === (ruas.no_ruas || ruas.id) ? 10 : 6,
              opacity: selectedRuasId && selectedRuasId !== (ruas.no_ruas || ruas.id) ? 0.3 : 1,
              lineCap: 'round',
              lineJoin: 'round'
            }
          );

          const dataYear = seg[year] || { iri: 0, treatment: 'NONE' };
          const iriKat = getIriCategory(dataYear.iri);
          polyline.bindTooltip(`
            <div class="font-sans text-sm p-1">
              <strong class="block border-b pb-1 mb-1">${ruas.nama_jalan === 'Tanpa Nama' ? (ruas.no_ruas || 'Tanpa Nama') : (ruas.nama_jalan || ruas.nama || ruas.no_ruas || 'Tanpa Nama')} (STA ${seg.sta_awal}-${seg.sta_akhir})</strong>
              <div>IRI ${year}: <b style="color:${(IRI_COLORS as any)[iriKat]}">${(dataYear.iri || 0).toFixed(2)}</b> (${iriKat})</div>
              <div>Treatment: <b>${dataYear.treatment && dataYear.treatment !== 'NONE' ? dataYear.treatment : '-'}</b></div>
            </div>
          `, { sticky: true });

          polyline.on('click', () => {
            setSelectedRuasId(ruas.no_ruas || ruas.id);
          });

          polylinesRef.current.push(polyline);
        });
      });
      
      // Batch add all polylines to map at once for maximum performance
      if (polylinesRef.current.length > 0) {
        (window as any).L.layerGroup(polylinesRef.current).addTo(mapRef.current);
      }
    } catch (err) {
      console.error("Error updating map polylines:", err);
    }
  }, [year, mode, selectedRuasId, isLeafletLoaded, ruasData]);

  return (
    <div className="h-screen w-full flex flex-col bg-[#F5F7FA] font-sans overflow-hidden">
      {/* Topbar */}
      <div className="h-14 bg-[#003B7A] text-white flex items-center justify-between px-4 z-20 shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/c/c6/Logo_Kementerian_Pekerjaan_Umum_Republik_Indonesia.svg" 
              alt="PU PR" 
              className="h-8 w-auto block" 
            />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg leading-none tracking-tight uppercase">RoadTrack</span>
            <span className="text-[8px] font-black text-[#F5A800] uppercase tracking-widest">BPJN MALUKU</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-blue-900 rounded p-1">
            <button 
              onClick={() => setMainView('map')} 
              className={`px-3 py-1 font-bold text-xs rounded transition-colors ${mainView === 'map' ? 'bg-white text-blue-900 shadow' : 'text-white hover:bg-blue-800'}`}
            >
              Peta Utama
            </button>
            <button 
              onClick={() => setMainView('analytics')} 
              className={`px-3 py-1 font-bold text-xs rounded transition-colors ${mainView === 'analytics' ? 'bg-white text-blue-900 shadow' : 'text-white hover:bg-blue-800'}`}
            >
              Analitik & Laporan
            </button>
            <button 
              onClick={() => setMainView('trend')} 
              className={`px-3 py-1 font-bold text-xs rounded transition-colors flex items-center gap-1 ${mainView === 'trend' ? 'bg-white text-blue-900 shadow' : 'text-white hover:bg-blue-800'}`}
            >
              <TrendingUp size={14} /> Prediksi Tren
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm bg-blue-800/50 px-3 py-1.5 rounded-full border border-blue-700">
            <User size={16} className="text-[#F5A800]"/>
            <span>Admin Teknis</span>
          </div>
          <button onClick={() => setView('landing')} className="hover:text-[#F5A800] transition">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 relative overflow-hidden">
        <div className={`w-full flex-1 flex ${mainView !== 'map' ? 'hidden' : ''}`}>
            <motion.div 
              animate={{ width: sidebarExpanded ? 320 : 56 }}
              className={`relative z-[1000] bg-white border-r shadow-sm transition-all duration-300 flex flex-col shrink-0`}
            >
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex border-b border-slate-100">
              <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="p-4 hover:bg-slate-50 text-slate-500 w-14 shrink-0 flex justify-center items-center">
                {sidebarExpanded ? <ChevronLeft size={20} /> : <BarChart3 size={20} />}
              </button>
              {sidebarExpanded && <div className="p-4 font-bold text-slate-800 flex-1">Filter & Layer</div>}
            </div>

            {sidebarExpanded && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 space-y-6"
              >
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Cari Ruas</label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input type="text" placeholder="No. Ruas atau Nama..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-[#003B7A]" />
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Pilih Tahun / Periode</label>
                  <select 
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full pl-3 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-bold text-[#003B7A] focus:outline-none focus:border-[#003B7A]"
                  >
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Mode Tampilan</label>
                  <div className="flex bg-white rounded-md p-1 border border-slate-200">
                    <button 
                      onClick={() => setMode('iri')}
                      className={`flex-1 text-xs py-1.5 rounded font-semibold transition ${mode === 'iri' ? 'bg-[#003B7A] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Kondisi IRI
                    </button>
                    <button 
                      onClick={() => setMode('treatment')}
                      className={`flex-1 text-xs py-1.5 rounded font-semibold transition ${mode === 'treatment' ? 'bg-[#003B7A] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Riwayat Treatment
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Legenda</label>
                  {mode === 'iri' ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#1A7A2E' }}></span><span className="text-slate-600 text-[11px] font-medium">Baik (0-4)</span></div>
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#FFFF00' }}></span><span className="text-slate-600 text-[11px] font-medium">Sedang (4-6)</span></div>
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#92D050' }}></span><span className="text-slate-600 text-[11px] font-medium">Sedang Marginal (6-8)</span></div>
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#FFC000' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Ringan (8-12)</span></div>
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#FF0000' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Berat ({'>'}12)</span></div>
                      <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#CBD5E1' }}></span><span className="text-slate-600 text-[11px] font-medium">Tidak Ada Data</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.entries(TREAT_COLORS).filter(([k]) => k!=='NONE' && k !== 'ROUTINE').map(([label, cfg]) => (
                        <div key={label} className="flex items-center gap-2 group cursor-help" title={cfg.label}>
                          <span className="w-4 h-4 rounded border border-black/10 flex-shrink-0" style={{ backgroundColor: cfg.bg }}></span>
                          <span className="text-slate-600 text-[10px] font-bold uppercase w-8">{label}</span>
                          <span className="text-slate-400 text-[9px] font-medium truncate">{cfg.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Daftar Ruas</label>
                  <select 
                    value={selectedRuasId || ""}
                    onChange={(e) => setSelectedRuasId(e.target.value || null)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#003B7A] focus:ring-2 focus:ring-blue-100 text-slate-700 font-semibold shadow-sm cursor-pointer"
                  >
                    <option value="">-- Pilih Ruas Jalan --</option>
                    {ruasData.map(r => (
                      <option key={r.id} value={r.no_ruas || r.id}>
                        {r.no_ruas || r.id} : {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : (r.nama_jalan || r.nama || 'Tanpa Nama')}
                      </option>
                    ))}
                  </select>
                  {selectedRuas && (
                    <div className="mt-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                      <div className="text-[10px] font-bold text-blue-400 uppercase mb-0.5">Ruas Terpilih</div>
                      <div className="text-sm font-bold text-[#003B7A] truncate line-clamp-2">{selectedRuas.nama_jalan || selectedRuas.nama}</div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100">{selectedRuas.no_ruas || selectedRuas.id}</span>
                        <span className="text-[11px] font-bold text-slate-600">{selectedRuas.panjang_km || selectedRuas.panjang} km</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
          
          <div className={`border-t border-slate-200 flex flex-col ${!sidebarExpanded && 'items-center'}`}>
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="p-3 text-slate-500 hover:bg-slate-50 flex items-center gap-3 transition w-full text-left"
            >
              <Upload size={18} /> {sidebarExpanded && <span className="text-sm font-medium">Upload Excel</span>}
            </button>
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-3 text-slate-500 hover:bg-slate-50 flex items-center gap-3 transition w-full text-left"
            >
              <Database size={18} /> {sidebarExpanded && <span className="text-sm font-medium">Koreksi Database</span>}
            </button>
          </div>
        </motion.div>

        <div className="flex-1 relative bg-slate-200 overflow-hidden">
          <div id="gis-map" className="w-full h-full z-0"></div>

          {/* Map Controls Overlay (Dropdown Tahun) */}
          <div className="absolute top-4 right-4 z-[400] bg-white rounded-lg shadow-lg border border-slate-200 p-2 flex flex-col gap-1 min-w-[120px]">
            <label className="text-[10px] font-black text-slate-400 uppercase px-2">Tahun Data</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full bg-slate-50 border-none rounded text-sm font-bold text-[#003B7A] focus:ring-0 cursor-pointer py-1.5 px-2"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Stripmap Bottom Panel */}
          <AnimatePresence>
            {selectedRuasId && (
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ 
                  y: 0,
                  height: isStripmapExpanded ? 'auto' : '68px',
                  maxHeight: isStripmapExpanded ? '60vh' : '68px'
                }}
                exit={{ y: '100%' }}
                className={`absolute bottom-0 left-0 right-0 z-[500] bg-white shadow-[0_-4px_32px_rgba(0,0,0,0.15)] border-t-2 border-[#003B7A] overflow-hidden flex flex-col transition-all duration-300`}
              >
                {selectedRuas && (
                  <>
                    <style>{`
                      .custom-stripmap-scrollbar::-webkit-scrollbar {
                        height: 8px;
                        width: 8px;
                      }
                      .custom-stripmap-scrollbar::-webkit-scrollbar-track {
                        background: #f1f5f9;
                      }
                      .custom-stripmap-scrollbar::-webkit-scrollbar-thumb {
                        background: #cbd5e1;
                        border-radius: 4px;
                      }
                      .custom-stripmap-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #94a3b8;
                      }
                      .writing-vertical-lr {
                        writing-mode: vertical-lr;
                      }
                    `}</style>
                    {/* Header / Toggle Handle */}
                    <div 
                      onClick={() => setIsStripmapExpanded(!isStripmapExpanded)}
                      className="p-3 flex justify-between items-center bg-white cursor-pointer hover:bg-slate-50 transition-colors shrink-0 group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-[#003B7A] text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                          Stripmap
                        </div>
                        <div className="flex flex-col">
                          <h3 className="font-black text-sm text-slate-800 leading-none">{selectedRuas.nama_jalan || selectedRuas.nama}</h3>
                          <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Ruas {selectedRuas.no_ruas || selectedRuas.id} • {selectedRuas.ppk}</span>
                        </div>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="hidden md:flex gap-4">
                           {Object.entries(TREAT_COLORS).filter(([k]) => k !== 'NONE' && k !== 'RM').slice(0, 4).map(([k, cfg]) => (
                             <div key={k} className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition">
                               <div className="w-3 h-1.5 rounded-full" style={{ background: cfg.bg }}></div>
                               <span className="text-[9px] font-black text-slate-500 uppercase">{k}</span>
                             </div>
                           ))}
                        </div>
                        
                        <div className="h-6 w-px bg-slate-200 mx-2"></div>

                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#003B7A] text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition whitespace-nowrap">
                            {isStripmapExpanded ? 'Tutup Detail' : 'Buka Detail Stripmap'}
                            {isStripmapExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRuasId(null);
                            }}
                            className="text-slate-300 hover:text-red-500 transition p-1"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Table Content */}
                    <div className={`flex-1 overflow-auto bg-slate-50 transition-opacity duration-300 ${isStripmapExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                      <div className="p-4 space-y-8 custom-stripmap-scrollbar">
                        {(() => {
                          const allSegments = selectedRuas.segments || [];
                          const chunkSize = 40; // 4km sections (assuming 100m segments)
                          const chunks = [];
                          for (let i = 0; i < allSegments.length; i += chunkSize) {
                            chunks.push(allSegments.slice(i, i + chunkSize));
                          }

                          return chunks.map((chunk, chunkIdx) => (
                            <div key={`chunk-${chunkIdx}`} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                              <div className="px-4 py-2 bg-slate-50 border-b flex justify-between items-center">
                                <span className="text-[10px] font-black text-[#003B7A] uppercase tracking-widest">
                                  Seksi {chunkIdx + 1} | {formatSTA(chunk[0].sta_awal)} - {formatSTA(chunk[chunk.length - 1].sta_akhir)}
                                </span>
                              </div>
                              <div className="overflow-hidden">
                                <table className="w-full border-collapse table-fixed border-hidden">
                                  <thead>
                                    <tr>
                                      <th className="w-16 sticky left-0 z-30 bg-white border-r-2 border-slate-200 p-1 text-[9px] font-black uppercase text-slate-400 text-right">STA</th>
                                      {chunk.map((seg: any) => {
                                        const km = Math.floor(seg.sta_awal / 1000);
                                        const m = seg.sta_awal % 1000;
                                        const mStr = String(m).padStart(3, "0");
                                        return (
                                          <th key={seg.id} className="border bg-slate-50 p-0 text-center">
                                            <div className="font-black text-[8px] text-[#003B7A] h-12 flex items-center justify-center [writing-mode:vertical-lr] rotate-180 mx-auto">
                                              {km}+{mStr}
                                            </div>
                                          </th>
                                        );
                                      })}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {availableYears.map((y) => (
                                      <React.Fragment key={`rows-${chunkIdx}-${y}`}>
                                        {/* IRI Row */}
                                        {mode === 'iri' && (
                                          <tr className="group/row">
                                            <td className="sticky left-0 z-30 border bg-white p-1 text-[8px] font-black text-slate-400 text-right whitespace-nowrap border-r-2 border-slate-200 group-hover/row:bg-blue-50 transition border-b-0">
                                              {y} (IRI)
                                            </td>
                                            {chunk.map((seg: any) => {
                                              const val = seg[y]?.iri || 0;
                                              const cfg = getIriBg(val);
                                              return (
                                                <td 
                                                  key={`iri-${y}-${seg.id}`} 
                                                  className="border border-slate-200 p-0 text-center font-mono text-[7px] font-black transition-all hover:scale-110 hover:z-50 hover:shadow-lg cursor-default h-6"
                                                  style={{ backgroundColor: cfg.bg, color: cfg.fg }}
                                                  title={`STA ${formatSTA(seg.sta_awal)} | IRI ${y}: ${val.toFixed(2)}`}
                                                >
                                                  {val > 0 ? val.toFixed(1).replace(".", ",") : ""}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        )}
                                        {/* Treatment Row */}
                                        {mode === 'treatment' && (
                                          <tr className="group/row">
                                            <td className="sticky left-0 z-30 border bg-white p-1 text-[7px] font-black text-slate-400 text-right whitespace-nowrap border-r-2 border-slate-200 group-hover/row:bg-blue-50 transition">
                                              {y} (TRT)
                                            </td>
                                            {chunk.map((seg: any) => {
                                              const treatValue = seg[y]?.treatment;
                                              const cfg = getTreatmentConfig(treatValue);
                                              return (
                                                <td 
                                                  key={`trt-${y}-${seg.id}`} 
                                                  className="border border-slate-200 p-0 text-center font-mono text-[6px] font-black transition-all hover:scale-110 hover:z-50 cursor-default h-6"
                                                  style={{ backgroundColor: cfg.bg, color: cfg.fg }}
                                                  title={`STA ${formatSTA(seg.sta_awal)} | Treatment ${y}: ${treatValue || 'NONE'}`}
                                                >
                                                  {treatValue && treatValue !== 'NONE' ? treatValue : ""}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Legends Sub-Footer */}
                      <div className="sticky bottom-0 left-0 right-0 p-3 bg-white border-t flex justify-between items-center px-6">
                        <div className="flex gap-8 items-center">
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Kondisi:</span>
                            <div className="flex gap-4">
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#1A7A2E]"></div><span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">Baik</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FFFF00]"></div><span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">Sedang</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#92D050]"></div><span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">Marginal</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FFC000]"></div><span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">R. Ringan</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF0000]"></div><span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">R. Berat</span></div>
                            </div>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">TRT:</span>
                            <div className="flex gap-3 overflow-x-auto max-w-md no-scrollbar">
                              {Object.entries(TREAT_COLORS).filter(([k]) => k !== 'NONE' && k !== 'ROUTINE').map(([k, cfg]) => (
                                <div key={k} className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-1.5 rounded-sm" style={{ background: cfg.bg }}></div>
                                  <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap">{k}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={handleDownloadRuasExcel}
                             className="px-3 py-1 bg-[#003B7A] text-white text-[10px] font-bold rounded flex items-center gap-2 hover:bg-blue-900 transition shadow-sm"
                           >
                             <Database size={12} /> Unduh Data Ruas
                           </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>

        {mainView === 'analytics' && (
          <AnalyticsDashboard ruasData={ruasData} selectedYear={year} availableYears={availableYears} />
        )}

        {mainView === 'trend' && (
          <TrendDashboard ruasData={ruasData} availableYears={availableYears} />
        )}
      </div>

      {/* --- MODALS --- */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-4 border-b flex justify-between items-center bg-[#003B7A] text-white">
                <h3 className="font-bold flex items-center gap-2"><Upload size={18}/> Unggah Data Excel Database</h3>
                <button onClick={() => setIsUploadModalOpen(false)}><X size={20}/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center hover:border-[#003B7A] transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-blue-50 text-[#003B7A] rounded-full flex items-center justify-center">
                      <Upload size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Klik atau seret file ke sini</p>
                      <p className="text-sm text-slate-500">Mendukung .xlsx, .xls, dan .csv</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase mb-2 flex items-center gap-2">
                    <Info size={12}/> Format Kolom yang Dibutuhkan
                  </h4>
                  <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                    Kolom Wajib: <code className="bg-slate-200 px-1 rounded text-[#003B7A]">No. Ruas</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Nama Jalan</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">PPK</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">ID Segmen</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">STA Awal</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">STA Akhir</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Lon</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Lat</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Tahun</code>.
                    <br/>
                    Data Kondisi & Treatment: <code className="bg-slate-200 px-1 rounded text-[#003B7A]">IRI</code> (opsional), <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Treatment</code> (opsional).
                  </p>
                </div>

                {uploadProgress !== null && (
                  <div className="mt-6">
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                      <span>Memproses data...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        className="h-full bg-[#F5A800]"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="text-xs font-bold text-[#003B7A] uppercase mb-2">Petunjuk Format</h4>
                  <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                    <li><b>ID Segmen:</b> Kode unik segmen (contoh: 60003.1).</li>
                    <li><b>Lon & Lat:</b> Koordinat geografis titik segmen.</li>
                    <li><b>Tahun:</b> Kolom "Tahun" menentukan data periode tahun tersebut (e.g. 2024, 2025).</li>
                    <li><b>IRI & Treatment:</b> Kolom untuk nilai kondisi jalan dan jenis penanganan.</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isSettingsModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-xl shadow-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b flex justify-between items-center bg-[#003B7A] text-white">
                <div className="flex-1 flex items-center gap-6">
                  <h3 className="font-bold flex items-center gap-2"><Database size={18}/> Koreksi Database</h3>
                  
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 border border-white/20">
                    <span className="text-[10px] font-bold text-white/60 uppercase">Pilih Tahun:</span>
                    <select 
                      value={selectedDbYear}
                      onChange={(e) => setSelectedDbYear(e.target.value)}
                      className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="" disabled className="text-slate-400">-- Pilih --</option>
                      {availableYears.map(y => (
                        <option key={y} value={y} className="text-slate-900">{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 border border-white/20">
                    <span className="text-[10px] font-bold text-white/60 uppercase">Pilih Ruas:</span>
                    <select 
                      value={selectedDbRuas}
                      onChange={(e) => setSelectedDbRuas(e.target.value)}
                      className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer min-w-[200px] max-w-[500px]"
                    >
                      <option value="" disabled className="text-slate-400">-- Pilih --</option>
                      <option value="all" className="text-slate-900">Semua Ruas (Hati-hati, berat)</option>
                      {ruasData.map(r => (
                        <option key={r.id} value={r.no_ruas} className="text-slate-900">{r.no_ruas} : {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : r.nama_jalan}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative ml-auto mr-4">
                    <Search size={14} className="absolute left-3 top-2.5 text-white/50" />
                    <input 
                      type="text" 
                      placeholder="Cari..."
                      value={searchSegQuery}
                      onChange={(e) => setSearchSegQuery(e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-full pl-9 pr-4 py-1.5 text-xs focus:bg-white/20 outline-none w-64"
                    />
                  </div>
                </div>
                <button onClick={() => setIsSettingsModalOpen(false)}><X size={20}/></button>
              </div>
              
              <div className="flex-1 overflow-auto bg-slate-50">
                <table className="w-full text-left bg-white text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 shadow-sm z-20">
                    <tr>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-10 text-center">
                        <input 
                          type="checkbox" 
                          checked={filteredEditableSegments.length > 0 && selectedIds.size === filteredEditableSegments.length}
                          onChange={() => toggleSelectAll(filteredEditableSegments)}
                        />
                      </th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">No. Ruas</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase">Nama Jalan</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">PPK</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">ID Segmen</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20">STA Awal</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20">STA Akhir</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24 text-center">Lon</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24 text-center">Lat</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20 text-center">IRI</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-40 text-center">Treatment</th>
                      <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20 text-center">Tahun</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!selectedDbYear || !selectedDbRuas) ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-500">
                          Silahkan pilih Tahun dan Ruas di atas terlebih dahulu untuk memuat data koreksi. 
                          <br />
                          <span className="text-xs opacity-75 mt-2 block">(Data sengaja tidak dimuat otomatis untuk menjaga performa browser)</span>
                        </td>
                      </tr>
                    ) : filteredEditableSegments.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-500">
                          Tidak ada data yang sesuai dengan pencarian Anda.
                        </td>
                      </tr>
                    ) : filteredEditableSegments.map((s) => (
                      <tr key={s.id} className={`hover:bg-blue-50/50 ${selectedIds.has(s.id) ? 'bg-blue-50' : ''}`}>
                        <td className="p-1 border-b text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelectOne(s.id)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1"
                            value={s.no_ruas}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'no_ruas', e.target.value)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1"
                            value={s.nama_jalan}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'nama_jalan', e.target.value)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1"
                            value={s.ppk}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'ppk', e.target.value)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1"
                            value={s.segment_id}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'segment_id', e.target.value)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="number" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center"
                            value={s.sta_awal}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'sta_awal', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="number" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center"
                            value={s.sta_akhir}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'sta_akhir', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="number" 
                            step="0.000001"
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center font-mono"
                            value={s.longitude}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'longitude', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="number" 
                            step="0.000001"
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center font-mono"
                            value={s.latitude}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'latitude', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <input 
                            type="number" 
                            step="0.01"
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center font-bold"
                            value={s.iri_value}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'iri_value', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b text-center">
                          <select 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-xs font-bold"
                            value={String(s.treatment || "NONE")}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'treatment', e.target.value)}
                          >
                            {Object.entries(TREAT_COLORS).map(([code, cfg]) => (
                              <option key={code} value={code}>{code} - {cfg.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1 border-b text-center text-[10px] font-bold text-slate-400">
                          {s.tahun}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t bg-white flex justify-between items-center">
                <div className="text-xs text-slate-400">
                  Total <b>{editableSegments.length}</b> segmen dimuat. Gunakan tab untuk berpindah kolom.
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleDeleteYearData}
                    disabled={isSaving || !selectedDbYear}
                    className="px-4 py-2 text-sm font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
                  >
                    Hapus Data {selectedDbYear}
                  </button>
                  <button 
                    onClick={handleClearDatabase}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition mr-4"
                  >
                    Kosongkan Database
                  </button>
                  {selectedIds.size > 0 && (
                    <button 
                      onClick={handleDeleteSelected}
                      className="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition flex items-center gap-2"
                    >
                      Hapus Terpilih ({selectedIds.size})
                    </button>
                  )}
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)} 
                    className="px-6 py-2 text-sm font-bold text-slate-500 border rounded hover:bg-slate-50 transition"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleSaveAllCorrections}
                    disabled={isSaving}
                    className={`px-8 py-2 text-sm font-bold bg-[#F5A800] text-[#003B7A] rounded-lg shadow-md hover:bg-yellow-500 transition-all flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSaving ? 'Menyimpan...' : <><Save size={18} /> Simpan Perubahan Database</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DashboardPage;
