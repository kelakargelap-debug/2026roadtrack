import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  ChevronDown,
  Search,
  LogOut,
  User,
  List,
  X,
  Info,
  Filter,
  ClipboardList,
  Settings2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// --- DESIGN SYSTEM TOKENS ---
const IRI_COLORS = {
  'Baik': '#1A7A2E',           
  'Sedang': '#92D050',         
  'Sedang Marginal': '#F5C800', 
  'Rusak Ringan': '#E07820',   
  'Rusak Berat': '#CC1A1A',    
  'Tidak Ada Data': '#CBD5E1'    
};

const SDI_COLORS = {
  'Baik': '#1A7A2E',
  'Sedang': '#92D050',
  'Rusak Ringan': '#E07820',
  'Rusak Berat': '#CC1A1A',
  'Tidak Ada Data': '#CBD5E1'
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

const conditionValDisplayFix = (val: number, isNasional: boolean) => {
  if (isNasional) return val.toFixed(2);
  if (val === 25) return 'B';
  if (val === 75) return 'S';
  if (val === 125) return 'RR';
  if (val === 200) return 'RB';
  return val.toFixed(0);
};

const getIriCategory = (iri: number | undefined | null) => {
  if (iri === undefined || iri === null || iri <= 0) return 'Tidak Ada Data';
  if (iri <= 4) return 'Baik';
  if (iri <= 6) return 'Sedang';
  if (iri <= 8) return 'Marginal';
  if (iri <= 12) return 'Rusak Ringan';
  return 'Rusak Berat';
};

const getSdiCategory = (sdi: number | string | undefined | null) => {
  if (sdi === undefined || sdi === null || sdi === "") return 'Tidak Ada Data';
  
  const s = String(sdi).toUpperCase().trim();
  if (s === 'B' || s === 'BAIK') return 'Baik';
  if (s === 'S' || s === 'SEDANG') return 'Sedang';
  if (s === 'RR' || s === 'RUSAK RINGAN') return 'Rusak Ringan';
  if (s === 'RB' || s === 'RUSAK BERAT') return 'Rusak Berat';

  // Fallback to number if it's a numeric string
  const val = parseFloat(s);
  if (isNaN(val) || val < 0) return 'Tidak Ada Data';
  if (val < 50) return 'Baik';
  if (val < 100) return 'Sedang';
  if (val < 150) return 'Rusak Ringan';
  return 'Rusak Berat';
};

  const getSegmentColor = (ruas: any, segment: any, year: string, mode: string) => {
    const dataYear = segment[year] || { iri: 0, sdi: 0, treatment: 'NONE' };
    const pengelola = String(ruas.pengelola || 'nasional').toLowerCase();
    
    if (mode === 'iri') {
      if (pengelola === 'nasional') {
        return (IRI_COLORS as any)[getIriCategory(dataYear.iri)];
      } else {
        return (SDI_COLORS as any)[getSdiCategory(dataYear.sdi)];
      }
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
  const mapLayersRef = useRef<any>(null);

  const [ruasData, setRuasData] = useState<any[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [year, setYear] = useState<string>('');
  const [mode, setMode] = useState('iri'); // 'iri' or 'treatment'
  const [mainView, setMainView] = useState<'map' | 'analytics' | 'trend'>('map');
  const [selectedRuasId, setSelectedRuasId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [filterPengelola, setFilterPengelola] = useState<string>('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // --- ANALYTICS FILTERS STATE ---
  const [anaSearchQuery, setAnaSearchQuery] = useState('');
  const [anaFilterKecamatan, setAnaFilterKecamatan] = useState('all');
  const [anaFilterRuas, setAnaFilterRuas] = useState('all');
  const [anaFilterStatus, setAnaFilterStatus] = useState('all');

  // --- TREND FILTERS STATE ---
  const [treFilterRuas, setTreFilterRuas] = useState('all');
  const [treFilterSegmen, setTreFilterSegmen] = useState('all');
  const [treFilterTren, setTreFilterTren] = useState('all');
  const [treFilterKondisi, setTreFilterKondisi] = useState('all');
  const [treFilterTreatment, setTreFilterTreatment] = useState('all');

  // --- DERIVED DATA FOR SIDEBARS ---
  const anaSegments = useMemo(() => {
    let segs: any[] = [];
    if (!Array.isArray(ruasData)) return segs;
    ruasData.forEach(ruas => {
      const pengelola = String(ruas.pengelola || 'nasional').toLowerCase();
      
      // Authority Filter
      if (filterPengelola) {
        if (filterPengelola === 'nasional' && pengelola !== 'nasional') return;
        if (filterPengelola === 'daerah' && pengelola === 'nasional') return;
        if (!['nasional', 'daerah'].includes(filterPengelola)) {
           if (pengelola !== filterPengelola && String(ruas.kabupaten_kota).toLowerCase() !== filterPengelola) return;
        }
      }

      if (Array.isArray(ruas.segments)) {
        ruas.segments.forEach(seg => {
          if (seg[year]) {
            segs.push({
              ppk: seg[year].ppk || '-',
              no_ruas: ruas.no_ruas,
              nama_jalan: ruas.nama_jalan
            });
          }
        });
      }
    });
    return segs;
  }, [ruasData, year, filterPengelola]);

  const anaPpks = useMemo(() => Array.from(new Set(anaSegments.map(s => s.ppk))).sort(), [anaSegments]);
  
  const anaRuasOptions = useMemo(() => {
    const map = new Map();
    anaSegments.forEach(s => {
      if (anaFilterKecamatan !== 'all' && s.ppk !== anaFilterKecamatan) return;
      map.set(s.no_ruas, s.nama_jalan === 'Tanpa Nama' ? s.no_ruas : s.nama_jalan);
    });
    return Array.from(map.entries()).map(([no, nama]) => ({ no_ruas: no, nama_jalan: nama })).sort((a, b) => a.no_ruas.localeCompare(b.no_ruas));
  }, [anaSegments, anaFilterKecamatan]);

  const treRuasOptions = useMemo(() => {
    const map = new Map();
    ruasData.forEach(r => {
      const pengelola = String(r.pengelola || 'nasional').toLowerCase();
      
      // Authority Filter
      if (filterPengelola) {
        if (filterPengelola === 'nasional' && pengelola !== 'nasional') return;
        if (filterPengelola === 'daerah' && pengelola === 'nasional') return;
        if (!['nasional', 'daerah'].includes(filterPengelola)) {
          if (pengelola !== filterPengelola && String(r.kabupaten_kota).toLowerCase() !== filterPengelola) return;
        }
      }
      
      map.set(r.no_ruas, r.nama_jalan === 'Tanpa Nama' ? r.no_ruas : r.nama_jalan);
    });
    return Array.from(map.entries()).map(([no, nama]) => ({ no_ruas: no, nama_jalan: nama })).sort((a, b) => a.no_ruas.localeCompare(b.no_ruas));
  }, [ruasData, filterPengelola]);

  const treSegmenOptions = useMemo(() => {
    if (treFilterRuas === 'all') return [];
    const ruas = ruasData.find(r => r.no_ruas === treFilterRuas);
    if (!ruas || !ruas.segments) return [];
    return Array.from(new Set(ruas.segments.map((s: any) => s.segment_id))).sort();
  }, [ruasData, treFilterRuas]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [searchRuasSidebar, setSearchRuasSidebar] = useState('');

  // Correction Form State
  const [editableSegments, setEditableSegments] = useState<any[]>([]);
  const [dbTab, setDbTab] = useState<'kondisi' | 'treatment'>('kondisi');
  const [searchSegQuery, setSearchSegQuery] = useState('');
  const [selectedDbRuas, setSelectedDbRuas] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string | number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isStripmapExpanded, setIsStripmapExpanded] = useState(false);
  const [selectedDbYear, setSelectedDbYear] = useState<string>('');
  const [dbFilterPengelola, setDbFilterPengelola] = useState<string>('all');
  const [dbFilterKabupatenKota, setDbFilterKabupatenKota] = useState<string>('all');
  const [dbPage, setDbPage] = useState(1);
  const dbItemsPerPage = 50;

  const filteredEditableSegments = editableSegments.filter(s => {
    if (!selectedDbYear || !selectedDbRuas) return false;
    const q = searchSegQuery.toLowerCase();
    const matchesSearch = (
      String(s.no_ruas || "").toLowerCase().includes(q) || 
      String(s.nama_jalan || "").toLowerCase().includes(q) || 
      String(s.segment_id || "").toLowerCase().includes(q)
    );
    const matchesRuas = selectedDbRuas === 'all' || s.no_ruas === selectedDbRuas;
    
    // Authority Filter
    const p = String(s.pengelola || 'nasional').toLowerCase();
    const k = String(s.kabupaten_kota || '').toLowerCase();
    let matchesAuthority = true;
    if (dbFilterPengelola !== 'all') {
      if (dbFilterPengelola === 'nasional') matchesAuthority = p === 'nasional';
      else if (dbFilterPengelola === 'daerah') matchesAuthority = p !== 'nasional';
    }

    let matchesTerritory = true;
    if (dbFilterKabupatenKota !== 'all') {
      matchesTerritory = k === dbFilterKabupatenKota || p === dbFilterKabupatenKota;
    }

    return matchesSearch && matchesRuas && matchesAuthority && matchesTerritory;
  });

  const totalDbPages = Math.ceil(filteredEditableSegments.length / dbItemsPerPage);
  const paginatedSegments = filteredEditableSegments.slice(
    (dbPage - 1) * dbItemsPerPage,
    dbPage * dbItemsPerPage
  );

  useEffect(() => {
    setDbPage(1);
  }, [selectedDbYear, selectedDbRuas, searchSegQuery, dbFilterPengelola, dbFilterKabupatenKota]);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await axios.get('/api/ruas/all');
      setRuasData(res.data);
      
      const yearsSet = new Set<string>();
      res.data.forEach((r: any) => {
        if (!r.segments) return;
        r.segments.forEach((s: any) => {
          Object.entries(s).forEach(([k, v]) => {
            if (v && typeof v === 'object' && v !== null && ('iri' in (v as any) || 'sdi' in (v as any) || 'treatment' in (v as any))) {
              const val = v as any;
              const hasIri = val.iri !== undefined && val.iri !== null && val.iri > 0;
              const hasSdi = val.sdi !== undefined && val.sdi !== null && val.sdi !== "" && val.sdi !== 0 && val.sdi !== "0";
              const hasTreatment = val.treatment && val.treatment !== 'NONE';
              
              if (hasIri || hasSdi || hasTreatment) {
                yearsSet.add(k);
              }
            }
          });
        });
      });
      
      const sortedYears = Array.from(yearsSet).sort((a, b) => 
        b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
      );
      
      if (sortedYears.length > 0) {
        setAvailableYears(sortedYears);
        setYear(prev => {
          const prevStr = String(prev);
          return sortedYears.includes(prevStr) ? prevStr : sortedYears[0];
        });
      }
    } catch (err) {
      console.error("Gagal mengambil data ruas:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          fetchData();
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
    if (v <= 6) return { bg: '#92D050', fg: '#333' };
    if (v <= 8) return { bg: '#F5C800', fg: '#333' };
    if (v <= 12) return { bg: '#E07820', fg: '#fff' };
    return { bg: '#CC1A1A', fg: '#fff' };
  };

  const getSdiBg = (v: number | string | undefined | null) => {
    if (v === undefined || v === null || v === "") return { bg: '#CBD5E1', fg: '#64748B' };
    
    const s = String(v).toUpperCase().trim();
    if (s === 'B' || s === 'BAIK') return { bg: '#1A7A2E', fg: '#fff' };
    if (s === 'S' || s === 'SEDANG') return { bg: '#92D050', fg: '#333' };
    if (s === 'RR' || s === 'RUSAK RINGAN') return { bg: '#E07820', fg: '#fff' };
    if (s === 'RB' || s === 'RUSAK BERAT') return { bg: '#CC1A1A', fg: '#fff' };

    const val = parseFloat(s);
    if (isNaN(val) || val < 0) return { bg: '#CBD5E1', fg: '#64748B' };
    if (val < 50) return { bg: '#1A7A2E', fg: '#fff' };
    if (val < 100) return { bg: '#92D050', fg: '#333' };
    if (val < 150) return { bg: '#E07820', fg: '#fff' };
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
          pengelola: r.pengelola || 'nasional',
          kabupaten_kota: r.kabupaten_kota || '',
          tahun: selectedDbYear,
          iri_value: s[selectedDbYear]?.iri || 0,
          sdi_value: s[selectedDbYear]?.sdi || 0,
          treatment: s[selectedDbYear]?.treatment || 'NONE'
        })));
        setEditableSegments(flattened);
      } catch (err) {
        console.error("Error flattening segments:", err);
      }
    }
  }, [isSettingsModalOpen, ruasData, selectedDbYear]);

  const handleUpdateLocalSegment = (id: any, field: string, value: any) => {
    setDirtyIds(prev => {
      const next = new Set(prev);
      const isSelected = selectedIds.has(id);
      if (isSelected && selectedIds.size > 1) {
        selectedIds.forEach(sid => next.add(sid));
      } else {
        next.add(id);
      }
      return next;
    });

    setEditableSegments(prev => {
      const isSelected = selectedIds.has(id);
      if (isSelected && selectedIds.size > 1) {
        return prev.map(s => selectedIds.has(s.id) ? { ...s, [field]: value } : s);
      }
      return prev.map(s => s.id === id ? { ...s, [field]: value } : s);
    });
  };

  const handleSaveAllCorrections = async () => {
    if (dirtyIds.size === 0) {
      alert("Tidak ada perubahan yang perlu disimpan.");
      return;
    }

    setIsSaving(true);
    try {
      const segmentsToSave = editableSegments
        .filter(s => dirtyIds.has(s.id))
        .map(seg => ({
          id: seg.db_id,
          no_ruas: seg.no_ruas,
          nama_jalan: seg.nama_jalan,
          ppk: seg.ppk,
          pengelola: seg.pengelola,
          kabupaten_kota: seg.kabupaten_kota,
          segment_id: seg.segment_id,
          sta_awal: seg.sta_awal,
          sta_akhir: seg.sta_akhir,
          longitude: seg.longitude,
          latitude: seg.latitude,
          iri_value: seg.iri_value,
          sdi_value: seg.sdi_value,
          treatment: seg.treatment,
          tahun: seg.tahun
        }));

      await axios.post('/api/segmen/update-batch', { updates: segmentsToSave });
      
      alert(`Berhasil menyimpan ${dirtyIds.size} perubahan!`);
      setDirtyIds(new Set());
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan perubahan.");
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
      setSelectedIds(new Set());
      fetchData();
    } catch (err) {
      alert("Gagal menghapus data.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFiltered = async () => {
    if (filteredEditableSegments.length === 0) return;
    if (!confirm(`Hapus SELURUH ${filteredEditableSegments.length} data yang muncul sesuai filter saat ini? Tindakan ini tidak dapat dibatalkan.`)) return;

    setIsSaving(true);
    try {
      const idsToDelete = filteredEditableSegments.map(s => s.id);
      await axios.post('/api/segmen/delete-multiple', { ids: idsToDelete });
      alert(`${filteredEditableSegments.length} data berhasil dihapus!`);
      fetchData();
    } catch (err) {
      alert("Gagal menghapus data terfilter.");
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
      fetchData();
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
      fetchData();
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
      { header: 'Pengelola', key: 'pengelola', width: 15 },
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

    const isNasional = String(selectedRuas.pengelola || 'nasional').toLowerCase() === 'nasional';

    availableYears.forEach(y => {
      if (isNasional) {
        columns.push({ header: `IRI ${y}`, key: `iri_${y}`, width: 10 });
      } else {
        columns.push({ header: `SDI ${y}`, key: `sdi_${y}`, width: 10 });
      }
      columns.push({ header: `Penanganan ${y}`, key: `treatment_${y}`, width: 18 });
    });

    worksheet.columns = columns;

    // Add Data Rows
    selectedRuas.segments.forEach((seg: any) => {
      const rowData: any = {
        pengelola: selectedRuas.pengelola || 'nasional',
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
        const dataYear = seg[y] || { iri: 0, sdi: 0, treatment: 'NONE' };
        if (isNasional) {
            rowData[`iri_${y}`] = dataYear.iri || 0;
        } else {
            rowData[`sdi_${y}`] = dataYear.sdi || 0;
        }
        rowData[`treatment_${y}`] = dataYear.treatment || 'NONE';
      });

      const row = worksheet.addRow(rowData);

      // Apply Colors to Condition cells
      availableYears.forEach((y) => {
        const condKey = isNasional ? `iri_${y}` : `sdi_${y}`;
        const val = rowData[condKey];
        const cell = row.getCell(condKey);
        
        if (val !== undefined) {
          const cfg = isNasional ? getIriBg(val) : getSdiBg(val);
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
    const allSelected = visibleSegments.length > 0 && visibleSegments.every(s => selectedIds.has(s.id));
    const newSet = new Set(selectedIds);
    if (allSelected) {
      visibleSegments.forEach(s => newSet.delete(s.id));
    } else {
      visibleSegments.forEach(s => newSet.add(s.id));
    }
    setSelectedIds(newSet);
  };

  const toggleSelectOne = (id: string | number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const [isMapLoading, setIsMapLoading] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!isLeafletLoaded || mapRef.current) return;

    // Default center Ambon
    const map = (window as any).L.map('gis-map', { 
      zoomControl: false,
      preferCanvas: true,
      renderer: (window as any).L.canvas()
    }).setView([-3.67, 128.20], 13);
    (window as any).L.control.zoom({ position: 'bottomright' }).addTo(map);

    (window as any).L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isLeafletLoaded]);

  // Optimized Render/Update Polylines based on year and mode
  useEffect(() => {
    if (!mapRef.current || !isLeafletLoaded) return;

    const renderMap = async () => {
      setIsMapLoading(true);
      
      // Use a small timeout to let the UI update first
      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        const L = (window as any).L;
        if (!L) return;

        // Clear old group
        if (mapLayersRef.current) {
          mapRef.current.removeLayer(mapLayersRef.current);
        }

        if (!Array.isArray(ruasData) || ruasData.length === 0) {
           setIsMapLoading(false);
           return;
        }

        const polylines: any[] = [];
        const allPoints: any[] = [];
        const selectedRoadPoints: any[] = [];

        // Helper for building tooltip content once needed
        const getTooltipContent = (ruas: any, seg: any, yearData: any, isNasional: boolean) => {
          const conditionLabel = isNasional ? 'IRI' : 'SDI';
          const conditionValRaw = isNasional ? (yearData.iri || 0) : (yearData.sdi || 0);
          const conditionValDisplay = (typeof conditionValRaw === 'number' && !isNaN(conditionValRaw) && conditionValRaw > 0) 
            ? conditionValDisplayFix(conditionValRaw, isNasional)
            : String(conditionValRaw || '-');

          const kat = isNasional ? getIriCategory(yearData.iri) : getSdiCategory(yearData.sdi);
          const colorObj = isNasional ? (IRI_COLORS as any)[kat] : (SDI_COLORS as any)[kat];
          const roadName = ruas.nama_jalan === 'Tanpa Nama' ? (ruas.no_ruas || 'Tanpa Nama') : (ruas.nama_jalan || ruas.nama || ruas.no_ruas || 'Tanpa Nama');

          return `
            <div class="font-sans text-xs p-1">
              <strong class="block border-b pb-1 mb-1 text-[11px]">${roadName}</strong>
              <div class="flex justify-between gap-4 mt-1">
                <span>STA:</span>
                <b>${formatSTA(seg.sta_awal)} - ${formatSTA(seg.sta_akhir)}</b>
              </div>
              <div class="flex justify-between gap-4">
                <span>${conditionLabel} ${year}:</span>
                <b style="color:${colorObj}">${conditionValDisplay} (${kat})</b>
              </div>
              <div class="flex justify-between gap-4">
                <span>Treatment:</span>
                <b class="text-blue-600">${yearData.treatment && yearData.treatment !== 'NONE' ? yearData.treatment : '-'}</b>
              </div>
            </div>
          `;
        };

        // We'll process in chunks to keep UI responsive
        const CHUNK_SIZE = 50; 
        for (let i = 0; i < ruasData.length; i += CHUNK_SIZE) {
          const chunk = ruasData.slice(i, i + CHUNK_SIZE);
          
          chunk.forEach(ruas => {
            if (!ruas || !Array.isArray(ruas.segments)) return;
            
            const pengelola = String(ruas.pengelola || 'nasional').toLowerCase();
            const kabupatenKota = String(ruas.kabupaten_kota || '').toLowerCase();
            const isSelectedRuas = selectedRuasId && (String(ruas.no_ruas) === String(selectedRuasId) || String(ruas.id) === String(selectedRuasId));

            if (filterPengelola) {
              if (filterPengelola === 'nasional') {
                 if (pengelola !== 'nasional') return;
              } else if (filterPengelola === 'daerah') {
                 if (pengelola === 'nasional') return;
              } else {
                 if (pengelola !== filterPengelola && kabupatenKota !== filterPengelola) return;
              }
            }

            ruas.segments.forEach((seg, idx) => {
              if (!seg) return;
              const lat = parseFloat(seg.latitude || seg.lat1 || seg.lat);
              const lon = parseFloat(seg.longitude || seg.lon1 || seg.lon);
              
              if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) return; 

              const point: [number, number] = [lat, lon];
              allPoints.push(point);
              if (isSelectedRuas) selectedRoadPoints.push(point);

              let nextLat = lat + 0.0001; 
              let nextLon = lon + 0.0001;

              const nextSeg = ruas.segments[idx + 1];
              if (nextSeg) {
                const nl = parseFloat(nextSeg.latitude || nextSeg.lat1 || nextSeg.lat);
                const nlo = parseFloat(nextSeg.longitude || nextSeg.lon1 || nextSeg.lon);
                if (!isNaN(nl) && !isNaN(nlo) && nl !== 0 && nlo !== 0) {
                  nextLat = nl;
                  nextLon = nlo;
                }
              }

              const color = getSegmentColor(ruas, seg, year, mode);
              const isNasional = pengelola === 'nasional';
              
              const polyline = L.polyline(
                [[lat, lon], [nextLat, nextLon]], 
                { 
                  color: color || '#334155', 
                  weight: isSelectedRuas ? 12 : 7,
                  opacity: selectedRuasId && !isSelectedRuas ? 0.2 : 1,
                  lineCap: 'round',
                  lineJoin: 'round'
                }
              );

              // Improved tooltip: only compute HTML on hover if possible, 
              // but standard bindTooltip is okay if we optimize the string build.
              const dataYear = seg[year] || { iri: 0, sdi: 0, treatment: 'NONE' };
              
              // Lazy bind or just pre-bind optimized
              polyline.bindTooltip(() => getTooltipContent(ruas, seg, dataYear, isNasional), { 
                sticky: true, 
                className: 'custom-tooltip' 
              });

              polyline.on('click', (e: any) => {
                L.DomEvent.stopPropagation(e);
                setSelectedRuasId(ruas.no_ruas || ruas.id);
              });

              polylines.push(polyline);
            });
          });

          // Yield to UI if many segments
          if (polylines.length > 500) {
             await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
        
        if (polylines.length > 0) {
          mapLayersRef.current = L.layerGroup(polylines).addTo(mapRef.current);
          
          // Auto fit zoom
          if (selectedRuasId && selectedRoadPoints.length > 0) {
             mapRef.current.fitBounds(L.latLngBounds(selectedRoadPoints), { padding: [50, 50], maxZoom: 16 });
          } else if (!selectedRuasId && allPoints.length > 0 && mapRef.current.getZoom() < 10) {
             // Only auto-fit all if zoomed out or first load
             mapRef.current.fitBounds(L.latLngBounds(allPoints), { padding: [20, 20] });
          }
        }
      } catch (err) {
        console.error("Error updating map polylines:", err);
      } finally {
        setIsMapLoading(false);
      }
    };

    renderMap();
  }, [year, mode, selectedRuasId, isLeafletLoaded, ruasData, filterPengelola]);

  const MALUKU_AUTHORITIES = [
    "provinsi maluku",
    "kabupaten buru",
    "kabupaten buru selatan",
    "kabupaten kepulauan aru",
    "kabupaten kepulauan tanimbar",
    "kabupaten maluku barat daya",
    "kabupaten maluku tengah",
    "kabupaten maluku tenggara",
    "kabupaten seram bagian barat",
    "kabupaten seram bagian timur",
    "kota ambon",
    "kota tual"
  ];

  const localAuthorities = Array.from(new Set([
    ...MALUKU_AUTHORITIES,
    ...ruasData.map(r => String(r.pengelola || 'nasional').toLowerCase())
  ]))
    .filter(p => p !== 'nasional' && p !== 'daerah')
    .sort();

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
        {/* Unified Sidebar for all views */}
        <motion.div 
          animate={{ width: sidebarExpanded ? 320 : 56 }}
          className={`relative z-[1000] bg-white border-r shadow-sm transition-all duration-300 flex flex-col shrink-0`}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex border-b border-slate-100">
              <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="p-4 hover:bg-slate-50 text-slate-500 w-14 shrink-0 flex justify-center items-center">
                {sidebarExpanded ? <ChevronLeft size={20} /> : <Filter size={20} />}
              </button>
              {sidebarExpanded && (
                <div className="p-4 font-black text-slate-800 flex-1 uppercase tracking-tight">
                  {mainView === 'map' ? 'Peta Utama' : mainView === 'analytics' ? 'Analisis' : 'Prediksi Tren'}
                </div>
              )}
            </div>

            {sidebarExpanded && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 space-y-6"
              >
                {/* --- MAP SIDEBAR CONTENT --- */}
                {mainView === 'map' && (
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <label className="text-xs font-black text-slate-400 uppercase mb-3 block">Filter Kewenangan</label>
                      <div className="flex flex-col gap-2">
                        <div className="relative group">
                          <select
                            value={filterPengelola || 'all'}
                            onChange={(e) => setFilterPengelola(e.target.value === 'all' ? '' : e.target.value)}
                            className="w-full text-[11px] py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-black text-[#003B7A] uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer appearance-none"
                          >
                            <option value="all">SEMUA KEWENANGAN</option>
                            <option value="nasional">NASIONAL</option>
                            <optgroup label="DAERAH (PROVINSI/KAB/KOTA)">
                              <option value="daerah">SELURUH DAERAH</option>
                              {localAuthorities.map(p => (
                                <option key={p} value={p}>
                                  {p.toUpperCase()}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronDown size={14} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Cari Ruas</label>
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Ketik minimal 2 huruf..." 
                          value={searchRuasSidebar}
                          onChange={(e) => setSearchRuasSidebar(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:border-[#003B7A] focus:ring-2 focus:ring-blue-100 transition-all font-semibold" 
                        />
                      </div>

                      {/* Recommendations Dropdown */}
                      {searchRuasSidebar.length >= 1 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] max-h-60 overflow-y-auto overflow-x-hidden border-t-0 p-1">
                          {ruasData.filter(r => {
                            const q = searchRuasSidebar.toLowerCase();
                            const name = String(r.nama_jalan || r.nama || '').toLowerCase();
                            const code = String(r.no_ruas || '').toLowerCase();
                            return name.includes(q) || code.includes(q);
                          }).slice(0, 15).map(r => (
                            <button
                              key={r.id}
                              onClick={() => {
                                setSelectedRuasId(r.no_ruas || r.id);
                                const auth = String(r.pengelola || 'nasional').toLowerCase();
                                if (auth === 'nasional') {
                                  setFilterPengelola('nasional');
                                } else {
                                  setFilterPengelola('daerah');
                                }
                                setSearchRuasSidebar('');
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 rounded-md flex flex-col gap-0 transition-colors group"
                            >
                              <div className="flex justify-between items-center">
                                <div className="text-[9px] font-black text-blue-500 uppercase">
                                  {r.no_ruas || r.id}
                                </div>
                                <div className={`text-[8px] font-black px-1 rounded border ${
                                  String(r.pengelola).toLowerCase() === 'nasional' 
                                    ? 'bg-orange-50 text-orange-600 border-orange-100' 
                                    : 'bg-blue-50 text-blue-600 border-blue-100'
                                }`}>
                                  {String(r.pengelola).toUpperCase()}
                                </div>
                              </div>
                              <div className="text-[11px] font-bold text-slate-700 truncate">
                                {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : (r.nama_jalan || r.nama || 'Tanpa Nama')}
                              </div>
                            </button>
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
                        {ruasData.filter(r => {
                          const p = String(r.pengelola || 'nasional').toLowerCase();
                          const k = String(r.kabupaten_kota || '').toLowerCase();
                          const q = searchRuasSidebar.toLowerCase();
                          let matchesAuthority = true;
                          if (filterPengelola === 'nasional') {
                            matchesAuthority = p === 'nasional';
                          } else if (filterPengelola === 'daerah') {
                            matchesAuthority = p !== 'nasional';
                          } else if (filterPengelola) {
                            matchesAuthority = p === filterPengelola || k === filterPengelola;
                          }
                          const matchesSearch = q === '' || 
                            String(r.no_ruas || '').toLowerCase().includes(q) || 
                            String(r.nama_jalan || r.nama || '').toLowerCase().includes(q);
                          return matchesAuthority && matchesSearch;
                        }).map(r => (
                          <option key={r.id} value={r.no_ruas || r.id}>
                            {r.no_ruas || r.id} : {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : (r.nama_jalan || r.nama || 'Tanpa Nama')}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Mode Tampilan</label>
                      <div className="flex bg-white rounded-md p-1 border border-slate-200">
                        <button 
                          onClick={() => setMode('iri')}
                          className={`flex-1 text-[10px] py-1.5 rounded font-black uppercase transition ${mode === 'iri' ? 'bg-[#003B7A] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          {filterPengelola === 'nasional' ? 'Kondisi IRI' : (!filterPengelola ? 'Kondisi (IRI/SDI)' : 'Kondisi SDI')}
                        </button>
                        <button 
                          onClick={() => setMode('treatment')}
                          className={`flex-1 text-[10px] py-1.5 rounded font-black uppercase transition ${mode === 'treatment' ? 'bg-[#003B7A] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Penanganan
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Legenda</label>
                      {mode === 'iri' ? (
                        <div className="space-y-4">
                          {(!filterPengelola || filterPengelola === 'nasional') && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-black text-[#003B7A] uppercase border-b pb-1 mb-2">Nasional (IRI)</div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#1A7A2E' }}></span><span className="text-slate-600 text-[11px] font-medium">Baik (0-4)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#92D050' }}></span><span className="text-slate-600 text-[11px] font-medium">Sedang (4-6)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#F5C800' }}></span><span className="text-slate-600 text-[11px] font-medium">Marginal (6-8)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#E07820' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Ringan (8-12)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#CC1A1A' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Berat ({'>'}12)</span></div>
                            </div>
                          )}
                          {(filterPengelola !== 'nasional') && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-black text-[#003B7A] uppercase border-b pb-1 mb-2">Daerah (SDI)</div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#1A7A2E' }}></span><span className="text-slate-600 text-[11px] font-medium">Baik ({'<'}50)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#92D050' }}></span><span className="text-slate-600 text-[11px] font-medium">Sedang (50-100)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#E07820' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Ringan (100-150)</span></div>
                              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-black/10" style={{ backgroundColor: '#CC1A1A' }}></span><span className="text-slate-600 text-[11px] font-medium">Rusak Berat ({'>'}150)</span></div>
                            </div>
                          )}
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
                  </div>
                )}

                {/* --- ANALYTICS SIDEBAR CONTENT --- */}
                {mainView === 'analytics' && (
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Pencarian</label>
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Cari ruas/segmen..." 
                          value={anaSearchQuery}
                          onChange={e => setAnaSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:border-[#003B7A] focus:ring-2 focus:ring-blue-100 transition-all font-semibold shadow-sm" 
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Filter Kewenangan</label>
                        <select 
                          value={filterPengelola} 
                          onChange={e => setFilterPengelola(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-black text-[#003B7A] uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="">-- PILIH KEWENANGAN --</option>
                          <option value="nasional">JALAN NASIONAL</option>
                          <option value="daerah">JALAN DAERAH</option>
                          {localAuthorities.length > 0 && (
                            <>
                              <option disabled className="text-slate-400">--- WILAYAH ---</option>
                              {localAuthorities.map(auth => (
                                <option key={auth} value={auth}>{auth.toUpperCase()}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Wilayah / PPK</label>
                        <select 
                          value={anaFilterKecamatan} 
                          onChange={e => setAnaFilterKecamatan(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Wilayah</option>
                          {anaPpks.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Pilih Ruas</label>
                        <select 
                          value={anaFilterRuas} 
                          onChange={e => setAnaFilterRuas(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Ruas</option>
                          {anaRuasOptions.map(r => <option key={r.no_ruas} value={r.no_ruas}>{r.no_ruas} : {r.nama_jalan}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Kondisi</label>
                        <select 
                          value={anaFilterStatus} 
                          onChange={e => setAnaFilterStatus(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Kondisi</option>
                          <option value="Baik">BAIK</option>
                          <option value="Sedang">SEDANG</option>
                          <option value="Marginal">MARGINAL</option>
                          <option value="Rusak Ringan">RUSAK RINGAN</option>
                          <option value="Rusak Berat">RUSAK BERAT</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-[#003B7A] rounded-xl text-white shadow-lg overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <BarChart3 size={80} />
                      </div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Status Laporan</h4>
                      <p className="text-xs font-medium leading-relaxed">
                        Gunakan filter di atas untuk menyaring data yang akan muncul pada tabel dan grafik di dashboard utama.
                      </p>
                    </div>
                  </div>
                )}

                {/* --- TREND SIDEBAR CONTENT --- */}
                {mainView === 'trend' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Filter Kewenangan</label>
                        <select 
                          value={filterPengelola} 
                          onChange={e => setFilterPengelola(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-black text-[#003B7A] uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="">-- PILIH KEWENANGAN --</option>
                          <option value="nasional">JALAN NASIONAL</option>
                          <option value="daerah">JALAN DAERAH</option>
                          {localAuthorities.length > 0 && (
                            <>
                              <option disabled className="text-slate-400">--- WILAYAH ---</option>
                              {localAuthorities.map(auth => (
                                <option key={auth} value={auth}>{auth.toUpperCase()}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Filter Ruas</label>
                        <select 
                          value={treFilterRuas} 
                          onChange={e => { setTreFilterRuas(e.target.value); setTreFilterSegmen('all'); }} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-[#003B7A] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Ruas</option>
                          {treRuasOptions.map(r => <option key={r.no_ruas} value={r.no_ruas}>{r.no_ruas} : {r.nama_jalan}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Pilih Segmen</label>
                        <select 
                          value={treFilterSegmen} 
                          onChange={e => setTreFilterSegmen(e.target.value)} 
                          disabled={treFilterRuas === 'all'}
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <option value="all">Semua Segmen</option>
                          {treSegmenOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Status Kondisi</label>
                        <select 
                          value={treFilterKondisi} 
                          onChange={e => setTreFilterKondisi(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Kondisi</option>
                          <option value="Baik">Baik</option>
                          <option value="Sedang">Sedang</option>
                          <option value="Rusak Ringan">Rusak Ringan</option>
                          <option value="Rusak Berat">Rusak Berat</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Tren Laju Kerusakan</label>
                        <select 
                          value={treFilterTren} 
                          onChange={e => setTreFilterTren(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Tren</option>
                          <option value="Tidak Signifikan">Tidak Signifikan (≤ 1.0)</option>
                          <option value="Signifikan">Signifikan (1.0 - 3.0)</option>
                          <option value="Sangat Signifikan">Sangat Signifikan (&gt; 3.0)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Jenis Penanganan</label>
                        <select 
                          value={treFilterTreatment} 
                          onChange={e => setTreFilterTreatment(e.target.value)} 
                          className="w-full text-xs py-2.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                        >
                          <option value="all">Semua Treatment</option>
                          <option value="none">Tidak Ada</option>
                          <option value="RM">Routine Maintenance (RM)</option>
                          <option value="RK">Rutin Kondisi (RK)</option>
                          <option value="HLD">Holding (HLD)</option>
                          <option value="PRV">Preventif (PRV)</option>
                          <option value="MNR">Rehab. Minor (MNR)</option>
                          <option value="MYR">Rehab. Mayor (MYR)</option>
                          <option value="RKN">Rekonstruksi (RKN)</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 text-orange-800 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={16} />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Tips Prediksi</h4>
                      </div>
                      <p className="text-[10px] font-medium leading-relaxed opacity-80">
                        Prediksi dihitung berdasarkan delta kondisi antar tahun yang tersedia dalam database.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
          
          {/* Sidebar Footer */}
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

        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {/* --- MAP VIEW --- */}
          <div className={`w-full h-full relative overflow-hidden ${mainView !== 'map' ? 'hidden' : ''}`}>
            {isMapLoading && (
              <div className="absolute inset-0 z-[600] bg-white/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-[#003B7A] rounded-full animate-spin"></div>
                  <span className="text-xs font-black text-[#003B7A] uppercase tracking-widest">Memproses Peta...</span>
                </div>
              </div>
            )}
            <div id="gis-map" className="w-full h-full z-0"></div>

          {/* Unified Map Controls */}
          <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2 pointer-events-none">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-2 min-w-[140px] pointer-events-auto">
              <label className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1 block">Tahun Data</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded text-xs font-bold text-[#003B7A] focus:ring-0 cursor-pointer py-1.5 px-2"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-1 flex flex-col gap-1 pointer-events-auto overflow-hidden">
               <div className="flex items-center gap-0.5">
                  <button 
                    onClick={() => setFilterPengelola('')}
                    className={`flex-1 px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all ${!filterPengelola ? 'bg-[#003B7A] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    Semua
                  </button>
                  <button 
                    onClick={() => setFilterPengelola('nasional')}
                    className={`flex-1 px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all ${filterPengelola === 'nasional' ? 'bg-[#003B7A] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    Nasional
                  </button>
                  <button 
                    onClick={() => setFilterPengelola('daerah')}
                    className={`flex-1 px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all ${['daerah', 'provinsi', 'kabupaten', 'kota'].includes(filterPengelola) ? 'bg-[#003B7A] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    Daerah
                  </button>
               </div>
               
               {['daerah', 'provinsi', 'kabupaten', 'kota'].includes(filterPengelola) || localAuthorities.includes(filterPengelola) ? (
                 <div className="border-t border-slate-100 p-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <select
                      value={['provinsi', 'kabupaten', 'kota'].includes(filterPengelola) || localAuthorities.includes(filterPengelola) ? filterPengelola : 'daerah'}
                      onChange={(e) => setFilterPengelola(e.target.value as any)}
                      className="w-full text-[9px] py-1 px-1.5 bg-slate-50 border border-slate-100 rounded font-black text-[#003B7A] focus:outline-none"
                    >
                      <option value="daerah">SELURUH DAERAH</option>
                      {localAuthorities.filter(p => !['provinsi', 'kabupaten', 'kota'].includes(p)).map(p => (
                        <option key={p} value={p}>{p.toUpperCase()}</option>
                      ))}
                    </select>
                 </div>
               ) : null}
            </div>
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
                                        {/* Condition Row (IRI or SDI) */}
                                        {mode === 'iri' && (
                                          <tr className="group/row">
                                            <td className="sticky left-0 z-30 border bg-white p-1 text-[8px] font-black text-slate-400 text-right whitespace-nowrap border-r-2 border-slate-200 group-hover/row:bg-blue-50 transition border-b-0 uppercase">
                                              {y} {String(selectedRuas.pengelola || 'nasional').toLowerCase() === 'nasional' ? '(IRI)' : '(SDI)'}
                                            </td>
                                            {chunk.map((seg: any) => {
                                              const pengelola = String(selectedRuas.pengelola || 'nasional').toLowerCase();
                                              const isNasional = pengelola === 'nasional';
                                              const val = isNasional ? (seg[y]?.iri || 0) : (seg[y]?.sdi || 0);
                                              const cfg = isNasional ? getIriBg(val) : getSdiBg(val);
                                              const label = isNasional 
                                                ? (typeof val === 'number' ? val.toFixed(1).replace(".", ",") : val) 
                                                : (typeof val === 'number' ? Math.round(val) : val);
                                              
                                              return (
                                                <td 
                                                  key={`cond-${y}-${seg.id}`} 
                                                  className="border border-slate-200 p-0 text-center font-mono text-[7px] font-black transition-all hover:scale-110 hover:z-50 hover:shadow-lg cursor-default h-6"
                                                  style={{ backgroundColor: cfg.bg, color: cfg.fg }}
                                                  title={`STA ${formatSTA(seg.sta_awal)} | ${isNasional ? 'IRI' : 'SDI'} ${y}: ${val}`}
                                                >
                                                  {val && val !== 0 && val !== "0" ? label : ""}
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
          
          {mainView === 'analytics' && (
            filterPengelola ? (
              <AnalyticsDashboard 
                ruasData={ruasData} 
                selectedYear={year} 
                availableYears={availableYears}
                externalFilterKewenangan={filterPengelola}
                externalSearchQuery={anaSearchQuery}
                externalFilterKecamatan={anaFilterKecamatan}
                externalFilterRuas={anaFilterRuas}
                externalFilterStatus={anaFilterStatus}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center h-full">
                <div className="bg-white p-12 rounded-3xl shadow-xl border border-blue-100 max-w-md">
                  <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Filter className="text-[#003B7A]" size={40} />
                  </div>
                  <h2 className="text-2xl font-black text-[#003B7A] mb-3 uppercase tracking-tight">Pilih Kewenangan</h2>
                  <p className="text-slate-500 font-medium mb-8">Silakan pilih kewenangan jalan pada sidebar sebelah kiri untuk melihat analisis dan laporan data jalan.</p>
                  <button 
                    onClick={() => setSidebarExpanded(true)}
                    className="px-8 py-3 bg-[#003B7A] text-white font-black rounded-xl shadow-lg hover:shadow-blue-200 transition-all uppercase tracking-wider text-sm"
                  >
                    Buka Sidebar Filter
                  </button>
                </div>
              </div>
            )
          )}
          
          {mainView === 'trend' && (
            filterPengelola ? (
              <TrendDashboard 
                ruasData={ruasData} 
                availableYears={availableYears}
                externalFilterKewenangan={filterPengelola}
                externalFilterRuas={treFilterRuas}
                externalFilterSegmen={treFilterSegmen}
                externalFilterTren={treFilterTren}
                externalFilterKondisi={treFilterKondisi}
                externalFilterTreatment={treFilterTreatment}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center h-full">
                <div className="bg-white p-12 rounded-3xl shadow-xl border border-blue-100 max-w-md">
                  <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <TrendingUp className="text-[#003B7A]" size={40} />
                  </div>
                  <h2 className="text-2xl font-black text-[#003B7A] mb-3 uppercase tracking-tight">Pilih Kewenangan</h2>
                  <p className="text-slate-500 font-medium mb-8">Silakan pilih kewenangan jalan pada sidebar sebelah kiri untuk melihat prediksi tren laju kerusakan jalan.</p>
                </div>
              </div>
            )
          )}
        </div>
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
                    Kolom Wajib: <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Pengelola</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">No. Ruas</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Nama Jalan</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">PPK</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">ID Segmen</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">STA Awal</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">STA Akhir</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Lon</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Lat</code>, <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Tahun</code>.
                    <br/>
                    Data Kondisi: <code className="bg-slate-200 px-1 rounded text-[#003B7A]">IRI</code> (Nasional) atau <code className="bg-slate-200 px-1 rounded text-[#003B7A]">SDI</code> (Daerah).
                    <br/>
                    Penanganan: <code className="bg-slate-200 px-1 rounded text-[#003B7A]">Treatment</code> (opsional).
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
                    <li><b>Pengelola:</b> Nasional / Provinsi / Kabupaten / Kota.</li>
                    <li><b>ID Segmen:</b> Kode unik segmen (contoh: 60003.1).</li>
                    <li><b>Lon & Lat:</b> Koordinat geografis titik segmen.</li>
                    <li><b>Tahun:</b> Kolom "Tahun" menentukan data periode tahun tersebut (e.g. 2024, 2025).</li>
                    <li><b>IRI & SDI:</b> Kondisi jalan sesuai kewenangan.</li>
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
              <div className="px-4 md:px-6 py-3 md:py-4 border-b bg-[#003B7A] text-white flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-6 shrink-0 z-30 relative">
                <div className="flex items-center gap-3 shrink-0 w-full lg:w-auto">
                  <Database size={20} className="text-[#F5A800] w-4 h-4 md:w-5 md:h-5" />
                  <h3 className="font-black text-sm md:text-base lg:text-lg uppercase tracking-tight">Koreksi Database</h3>
                </div>
                
                <div className="flex-1 flex flex-wrap items-center gap-2 md:gap-3 justify-start lg:justify-center w-full">
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2 md:px-3 py-1.5 border border-white/10">
                    <span className="text-[8px] md:text-[9px] font-black text-white/50 uppercase">Tahun</span>
                    <select 
                      value={selectedDbYear}
                      onChange={(e) => setSelectedDbYear(e.target.value)}
                      className="bg-transparent text-white text-[10px] md:text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="" disabled className="text-slate-400">Pilih...</option>
                      {availableYears.map(y => (
                        <option key={y} value={y} className="text-slate-900">{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2 md:px-3 py-1.5 border border-white/10">
                    <span className="text-[8px] md:text-[9px] font-black text-white/50 uppercase">Ruas</span>
                    <select 
                      value={selectedDbRuas}
                      onChange={(e) => setSelectedDbRuas(e.target.value)}
                      className="bg-transparent text-white text-[10px] md:text-xs font-bold outline-none cursor-pointer max-w-[120px] md:max-w-[200px]"
                    >
                      <option value="" disabled className="text-slate-400">Pilih...</option>
                      <option value="all" className="text-slate-900">SEMUA RUAS</option>
                      {ruasData.filter(r => {
                          const p = String(r.pengelola || 'nasional').toLowerCase();
                          const k = String(r.kabupaten_kota || '').toLowerCase();
                          
                          if (dbFilterPengelola !== 'all') {
                            if (dbFilterPengelola === 'nasional' && p !== 'nasional') return false;
                            if (dbFilterPengelola === 'daerah' && p === 'nasional') return false;
                          }

                          if (dbFilterKabupatenKota !== 'all') {
                            if (p !== dbFilterKabupatenKota && k !== dbFilterKabupatenKota) return false;
                          }

                          return true;
                      }).map(r => (
                        <option key={r.id} value={r.no_ruas} className="text-slate-900">{r.no_ruas} : {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : r.nama_jalan}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2 md:px-3 py-1.5 border border-white/10">
                    <span className="text-[8px] md:text-[9px] font-black text-white/50 uppercase">Kewenang</span>
                    <select 
                      value={dbFilterPengelola}
                      onChange={(e) => setDbFilterPengelola(e.target.value)}
                      className="bg-transparent text-white text-[10px] md:text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="all" className="text-slate-900">SEMUA</option>
                      <option value="nasional" className="text-slate-900">NASIONAL</option>
                      <option value="daerah" className="text-slate-900">DAERAH</option>
                    </select>
                  </div>

                  {dbFilterPengelola !== 'nasional' && (
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2 md:px-3 py-1.5 border border-white/10">
                      <span className="text-[8px] md:text-[9px] font-black text-white/50 uppercase">Wilayah</span>
                      <select 
                        value={dbFilterKabupatenKota}
                        onChange={(e) => setDbFilterKabupatenKota(e.target.value)}
                        className="bg-transparent text-white text-[10px] md:text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="all" className="text-slate-900">SELURUH</option>
                        {localAuthorities.map(p => (
                          <option key={p} value={p} className="text-slate-900">{p.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-white/40" />
                    <input 
                      type="text" 
                      placeholder="Cari..."
                      value={searchSegQuery}
                      onChange={(e) => setSearchSegQuery(e.target.value)}
                      className="bg-white/10 border border-white/10 rounded-full pl-9 pr-3 py-1.5 text-[10px] md:text-xs focus:bg-white/20 outline-none w-32 md:w-40 lg:w-48 transition-all focus:w-40 md:focus:w-64"
                    />
                  </div>
                </div>

                <div className="shrink-0 absolute top-3 md:top-4 right-4 lg:static">
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="p-1.5 md:p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                    title="Tutup"
                  >
                    <X className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto bg-slate-50">
                <table className="w-full text-left bg-white text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 shadow-sm z-20">
                    {(() => {
                      const allSelected = filteredEditableSegments.length > 0 && filteredEditableSegments.every(s => selectedIds.has(s.id));
                      return (
                        <tr>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-10 text-center">
                            <input 
                              type="checkbox" 
                              checked={allSelected}
                              onChange={() => toggleSelectAll(filteredEditableSegments)}
                            />
                          </th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">Pengelola</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-32">Kabupaten/Kota</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">No. Ruas</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase">Nama Jalan</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">PPK</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24">ID Segmen</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20">STA Awal</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20">STA Akhir</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24 text-center">Lon</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-24 text-center">Lat</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-16 text-center">IRI</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-16 text-center">SDI</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-40 text-center">Treatment</th>
                          <th className="px-2 py-3 border-b font-bold text-slate-500 uppercase w-20 text-center">Tahun</th>
                        </tr>
                      );
                    })()}
                  </thead>
                  <tbody>
                    {(!selectedDbYear || !selectedDbRuas) ? (
                      <tr>
                        <td colSpan={15} className="py-8 text-center text-slate-500">
                          Silahkan pilih Tahun dan Ruas di atas terlebih dahulu untuk memuat data koreksi. 
                          <br />
                          <span className="text-xs opacity-75 mt-2 block">(Data sengaja tidak dimuat otomatis untuk menjaga performa browser)</span>
                        </td>
                      </tr>
                    ) : filteredEditableSegments.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="py-8 text-center text-slate-500">
                          Tidak ada data yang sesuai dengan pencarian Anda.
                        </td>
                      </tr>
                    ) : paginatedSegments.map((s) => (
                      <tr key={s.id} className={`hover:bg-blue-50/50 ${selectedIds.has(s.id) ? 'bg-blue-50' : ''}`}>
                        <td className="p-1 border-b text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelectOne(s.id)}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <select 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-[10px] font-bold uppercase"
                            value={s.pengelola === 'nasional' ? 'nasional' : 'daerah'}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'pengelola', e.target.value)}
                          >
                            <option value="nasional">Nasional</option>
                            <option value="daerah">Daerah</option>
                          </select>
                        </td>
                        <td className="p-1 border-b">
                           <input 
                            type="text" 
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-[10px] font-bold"
                            placeholder={s.pengelola === 'nasional' ? '-' : 'Pilih Wilayah...'}
                            disabled={s.pengelola === 'nasional'}
                            value={s.kabupaten_kota || ''}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'kabupaten_kota', e.target.value)}
                            list="maluku-list"
                          />
                          <datalist id="maluku-list">
                            {MALUKU_AUTHORITIES.map(m => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
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
                            className={`w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center font-bold ${s.pengelola !== 'nasional' ? 'opacity-30' : ''}`}
                            value={s.iri_value}
                            disabled={s.pengelola !== 'nasional'}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'iri_value', Number(e.target.value))}
                          />
                        </td>
                        <td className="p-1 border-b">
                          <select 
                            className={`w-full bg-transparent border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-1 text-center font-bold ${s.pengelola === 'nasional' ? 'opacity-30' : ''}`}
                            value={String(s.sdi_value || "")}
                            disabled={s.pengelola === 'nasional'}
                            onChange={(e) => handleUpdateLocalSegment(s.id, 'sdi_value', e.target.value)}
                          >
                            <option value="">-</option>
                            <option value="B">B</option>
                            <option value="S">S</option>
                            <option value="RR">RR</option>
                            <option value="RB">RB</option>
                          </select>
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

              <div className="p-3 md:p-4 border-t bg-slate-50 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-inner z-30 gap-4">
                <div className="flex flex-col items-center md:items-start">
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center md:text-left">Status Sinkronisasi & Navigasi</span>
                  <div className="text-[10px] md:text-xs text-slate-600 font-medium text-center md:text-left">
                    Total <b>{filteredEditableSegments.length}</b> data. {selectedIds.size > 0 && <span>| <b>{selectedIds.size}</b> dipilih. </span>}
                    Halaman <b>{dbPage}</b> dari <b>{totalDbPages || 1}</b>.
                  </div>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden h-9">
                  <button 
                    disabled={dbPage === 1}
                    onClick={() => setDbPage(1)}
                    className="px-3 h-full flex items-center justify-center text-blue-600 hover:bg-slate-50 disabled:opacity-30 border-r border-slate-200 transition-colors"
                  >
                    «
                  </button>
                  
                  {(() => {
                    const pages = [];
                    const maxVisible = 2; // Pages to show on each side of current
                    
                    // Always show page 1
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setDbPage(1)}
                        className={`px-3 h-full flex items-center justify-center text-[11px] font-bold border-r border-slate-200 transition-colors ${
                          dbPage === 1 ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-slate-50'
                        }`}
                      >
                        1
                      </button>
                    );

                    if (dbPage > maxVisible + 2) {
                      pages.push(<span key="sep1" className="px-2 text-blue-600 border-r border-slate-200 flex items-center">...</span>);
                    }

                    // Pages around current
                    for (let i = Math.max(2, dbPage - maxVisible); i <= Math.min(totalDbPages - 1, dbPage + maxVisible); i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setDbPage(i)}
                          className={`px-3 h-full flex items-center justify-center text-[11px] font-bold border-r border-slate-200 transition-colors ${
                            dbPage === i ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-slate-50'
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }

                    if (dbPage < totalDbPages - maxVisible - 1) {
                      pages.push(<span key="sep2" className="px-2 text-blue-600 border-r border-slate-200 flex items-center">...</span>);
                    }

                    // Always show last page if it's not 1
                    if (totalDbPages > 1) {
                      pages.push(
                        <button
                          key={totalDbPages}
                          onClick={() => setDbPage(totalDbPages)}
                          className={`px-3 h-full flex items-center justify-center text-[11px] font-bold border-r border-slate-200 transition-colors ${
                            dbPage === totalDbPages ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-slate-50'
                          }`}
                        >
                          {totalDbPages}
                        </button>
                      );
                    }

                    return pages;
                  })()}

                  <button 
                    disabled={dbPage >= totalDbPages}
                    onClick={() => setDbPage(totalDbPages)}
                    className="px-3 h-full flex items-center justify-center text-blue-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                  >
                    »
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 md:gap-3 w-full md:w-auto">
                  <div className="flex gap-2 pr-0 md:pr-4 border-none md:border-r border-slate-200">
                    <button 
                      onClick={handleDeleteYearData}
                      disabled={isSaving || !selectedDbYear}
                      className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition disabled:opacity-50"
                    >
                      Hapus Data {selectedDbYear}
                    </button>
                    <button 
                      onClick={handleClearDatabase}
                      disabled={isSaving}
                      className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                    >
                      Reset DB
                    </button>
                  </div>

                  {selectedIds.size > 0 && (
                    <button 
                      onClick={handleDeleteSelected}
                      className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200"
                    >
                      Hapus ({selectedIds.size})
                    </button>
                  )}

                  {filteredEditableSegments.length > 0 && (
                    <button 
                      onClick={handleDeleteFiltered}
                      className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase text-red-800 bg-red-100/50 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center gap-1.5"
                      title="Hapus semua data yang saat ini muncul di tabel sesuai filter"
                    >
                      Hapus Terfilter ({filteredEditableSegments.length})
                    </button>
                  )}
                  
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)} 
                    className="px-4 md:px-6 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase text-slate-500 border border-slate-200 rounded-lg hover:bg-white transition"
                  >
                    Batal
                  </button>
                  
                  <button 
                    onClick={handleSaveAllCorrections}
                    disabled={isSaving}
                    className={`px-5 md:px-8 py-1.5 md:py-2 text-[9px] md:text-[11px] font-black uppercase bg-[#F5A800] text-[#003B7A] rounded-lg shadow-lg hover:bg-[#FFB800] hover:shadow-xl transition-all flex items-center gap-1.5 transform active:scale-95 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSaving ? '...' : <><Save className="w-3.5 h-3.5 md:w-4 md:h-4" /> Simpan Perubahan</>}
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
