import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Download } from 'lucide-react';

const IRI_COLORS = {
  'Baik': '#10B981',        // Hijau
  'Sedang': '#FBBF24',      // Kuning
  'Marginal': '#F97316',    // Oranye
  'Rusak Ringan': '#F472B6',// Merah Muda
  'Rusak Berat': '#DC2626'  // Merah Tua
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

  const val = parseFloat(s);
  if (isNaN(val) || val < 0) return 'Tidak Ada Data';
  if (val < 50) return 'Baik';
  if (val < 100) return 'Sedang';
  if (val < 150) return 'Rusak Ringan';
  return 'Rusak Berat';
};

export const AnalyticsDashboard = ({ 
  ruasData, 
  selectedYear, 
  availableYears, 
  externalFilterKewenangan,
  externalSearchQuery,
  externalFilterKecamatan,
  externalFilterRuas,
  externalFilterStatus
}: { 
  ruasData: any[], 
  selectedYear: string, 
  availableYears: string[], 
  externalFilterKewenangan?: string,
  externalSearchQuery?: string,
  externalFilterKecamatan?: string,
  externalFilterRuas?: string,
  externalFilterStatus?: string
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'warning' | 'summary' | 'sdi_analysis'>('dashboard');
  
  // Set initial tab based on kewenangan
  React.useEffect(() => {
    if (externalFilterKewenangan === 'nasional') {
      setActiveTab('dashboard');
    } else if (externalFilterKewenangan) {
      setActiveTab('sdi_analysis');
    }
  }, [externalFilterKewenangan]);

  const [selectedRuasId, setSelectedRuasId] = useState<string | null>(null);
  
  // Use external filter as initial state or when it changes
  const [filterKewenangan, setFilterKewenangan] = useState<string>('');
  const [filterKecamatan, setFilterKecamatan] = useState<string>('all');
  const [filterRuas, setFilterRuas] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (externalFilterKewenangan !== undefined) setFilterKewenangan(externalFilterKewenangan);
  }, [externalFilterKewenangan]);

  React.useEffect(() => {
    if (externalSearchQuery !== undefined) setSearchQuery(externalSearchQuery);
  }, [externalSearchQuery]);

  React.useEffect(() => {
    if (externalFilterKecamatan !== undefined) setFilterKecamatan(externalFilterKecamatan);
  }, [externalFilterKecamatan]);

  React.useEffect(() => {
    if (externalFilterRuas !== undefined) setFilterRuas(externalFilterRuas);
  }, [externalFilterRuas]);

  React.useEffect(() => {
    if (externalFilterStatus !== undefined) setFilterStatus(externalFilterStatus);
  }, [externalFilterStatus]);

  React.useEffect(() => {
    if (filterKewenangan === 'nasional' && activeTab === 'sdi_analysis') {
      setActiveTab('dashboard');
    }
  }, [filterKewenangan, activeTab]);

  const [currentPageWarning, setCurrentPageWarning] = useState(1);
  const [currentPageSummary, setCurrentPageSummary] = useState(1);
  const itemsPerPage = 20;

  // 1. Logika Input & Transformasi Data
  // Build flattened segments data specifically for the selected year
  const allSegments = useMemo(() => {
    let segs: any[] = [];
    if (!Array.isArray(ruasData)) return segs;
    
    ruasData.forEach(ruas => {
      if (!Array.isArray(ruas.segments)) return;
      const pengelola = String(ruas.pengelola || 'nasional').toLowerCase();
      const isNasional = pengelola === 'nasional';

      ruas.segments.forEach(seg => {
        const yearData = seg[selectedYear] || { iri: 0, sdi: 0, treatment: 'NONE' };
        
        // Calculate previous year data if available
        let prevYearData = null;
        if (availableYears.length > 1) {
          const sortedYears = [...availableYears].sort();
          const currentIdx = sortedYears.indexOf(selectedYear);
          if (currentIdx > 0) {
            const prevYear = sortedYears[currentIdx - 1];
            prevYearData = seg[prevYear];
          }
        }

        const conditionVal = isNasional ? (parseFloat(yearData.iri) || 0) : (yearData.sdi || "");
        const category = isNasional ? getIriCategory(conditionVal as number) : getSdiCategory(conditionVal);
        
        const prevConditionVal = prevYearData ? (isNasional ? (parseFloat(prevYearData.iri) || 0) : (prevYearData.sdi || "")) : null;
        const prevCategory = prevConditionVal !== null ? (isNasional ? getIriCategory(prevConditionVal as number) : getSdiCategory(prevConditionVal)) : null;

        const isCritical = isNasional ? (Number(conditionVal) > 8) : (category === 'Rusak Berat');

        // Calculate length assuming sta_akhir and sta_awal are in meters or km? Usually meters if 100, 200, but let's just do absolute difference.
        // Wait, STA are usually km, or STA 0+100 means 0.1. Let's just use sta_akhir - sta_awal if it's km, or normalize to km.
        let lengthKm = 0;
        if (seg.panjang_km !== undefined && seg.panjang_km !== null) {
          lengthKm = parseFloat(seg.panjang_km);
        } else {
          const staAwal = parseFloat(seg.sta_awal) || 0;
          const staAkhir = parseFloat(seg.sta_akhir) || 0;
          lengthKm = Math.abs(staAkhir - staAwal) / 1000;
        }
        
        if (isNaN(lengthKm) || lengthKm <= 0) lengthKm = 0.1;

        segs.push({
          ...seg,
          no_ruas: ruas.no_ruas || ruas.id,
          nama_jalan: ruas.nama_jalan || ruas.nama || 'Tanpa Nama',
          ppk: ruas.ppk || 'Tanpa PPK',
          pengelola,
          isNasional,
          conditionVal,
          category,
          prevConditionVal,
          prevCategory,
          isCritical,
          treatment: yearData.treatment,
          lengthKm
        });
      });
    });
    return segs;
  }, [ruasData, selectedYear, availableYears]);

  // Apply Filters
  const filteredSegments = useMemo(() => {
    return allSegments.filter(seg => {
      // Kewenangan filter
      if (filterKewenangan === 'nasional') {
        if (!seg.isNasional) return false;
      } else if (filterKewenangan === 'daerah') {
        if (seg.isNasional) return false;
      } else if (filterKewenangan) {
        // Specific local authority (Provinsi, Kabupaten, Kota)
        const q = filterKewenangan.toLowerCase();
        if (seg.pengelola.toLowerCase() !== q && String(seg.kabupaten_kota || '').toLowerCase() !== q) return false;
      }
      
      if (filterKecamatan !== 'all' && seg.ppk !== filterKecamatan) return false;
      if (filterRuas !== 'all' && seg.no_ruas !== filterRuas) return false;
      if (filterStatus !== 'all' && seg.category !== filterStatus) return false;
      
      const q = searchQuery.toLowerCase();
      if (q && !seg.nama_jalan.toLowerCase().includes(q) && !String(seg.segment_id).toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allSegments, filterKecamatan, filterRuas, filterStatus, searchQuery]);

  // 2. Logika Indikator Utama (KPI Cards)
  const totalKm = filteredSegments.reduce((sum, seg) => sum + seg.lengthKm, 0);
  const baikSedangKm = filteredSegments.reduce((sum, seg) => (seg.category === 'Baik' || seg.category === 'Sedang') ? sum + seg.lengthKm : sum, 0);
  const pctMantap = totalKm > 0 ? (baikSedangKm / totalKm) * 100 : 0;
  const criticalSegmentsCount = filteredSegments.filter(seg => seg.isCritical).length;

  // 4. Logika Alert (Peringatan Dini)
  const warnings = useMemo(() => {
    return filteredSegments.filter(seg => {
      // Trigger "Segmen Kritis"
      const isCritical = seg.isCritical;
      // Trigger Pemeliharaan: status berubah dari "Sedang" ke "Marginal"
      const statusDropped = seg.prevCategory === 'Sedang' && seg.category === 'Marginal';
      return isCritical || statusDropped;
    }).map(seg => ({
      ...seg,
      statusDropped: seg.prevCategory === 'Sedang' && seg.category === 'Marginal'
    }));
  }, [filteredSegments]);

  // 5. Logika Visualisasi Grafik
  const pieData = [
    { name: 'Baik', value: filteredSegments.filter(s => s.category === 'Baik').reduce((a, b) => a + b.lengthKm, 0), color: IRI_COLORS['Baik'] },
    { name: 'Sedang', value: filteredSegments.filter(s => s.category === 'Sedang').reduce((a, b) => a + b.lengthKm, 0), color: IRI_COLORS['Sedang'] },
    { name: 'Marginal', value: filteredSegments.filter(s => s.category === 'Marginal').reduce((a, b) => a + b.lengthKm, 0), color: IRI_COLORS['Marginal'] },
    { name: 'Rusak Ringan', value: filteredSegments.filter(s => s.category === 'Rusak Ringan').reduce((a, b) => a + b.lengthKm, 0), color: IRI_COLORS['Rusak Ringan'] },
    { name: 'Rusak Berat', value: filteredSegments.filter(s => s.category === 'Rusak Berat').reduce((a, b) => a + b.lengthKm, 0), color: IRI_COLORS['Rusak Berat'] },
  ].filter(d => d.value > 0);

  // Bar chart: Perbandingan antar PPK/Kecamatan
  const ppkMap = new Map();
  filteredSegments.forEach(seg => {
    if (!ppkMap.has(seg.ppk)) {
      ppkMap.set(seg.ppk, { name: seg.ppk, Baik: 0, Sedang: 0, Marginal: 0, 'Rusak Ringan': 0, 'Rusak Berat': 0, total: 0 });
    }
    const d = ppkMap.get(seg.ppk);
    d[seg.category] += seg.lengthKm;
    d.total += seg.lengthKm;
  });
  const barData = Array.from(ppkMap.values()).sort((a, b) => b.total - a.total);

  // Ruas Summary Data
  const ruasSummaryMap = new Map();
  filteredSegments.forEach(seg => {
    const key = seg.no_ruas;
    if (!ruasSummaryMap.has(key)) {
      ruasSummaryMap.set(key, {
        no_ruas: seg.no_ruas,
        nama_jalan: seg.nama_jalan,
        ppk: seg.ppk,
        totalKm: 0,
        baikKm: 0,
        sedangKm: 0,
        marginalKm: 0,
        ringanKm: 0,
        beratKm: 0,
      });
    }
    const r = ruasSummaryMap.get(key);
    r.totalKm += seg.lengthKm;
    if (seg.category === 'Baik') r.baikKm += seg.lengthKm;
    if (seg.category === 'Sedang') r.sedangKm += seg.lengthKm;
    if (seg.category === 'Marginal') r.marginalKm += seg.lengthKm;
    if (seg.category === 'Rusak Ringan') r.ringanKm += seg.lengthKm;
    if (seg.category === 'Rusak Berat') r.beratKm += seg.lengthKm;
  });

  const ruasSummary = Array.from(ruasSummaryMap.values()).sort((a, b) => b.totalKm - a.totalKm);

  // Pagination Logic
  const paginatedWarnings = useMemo(() => {
    const startIndex = (currentPageWarning - 1) * itemsPerPage;
    return warnings.slice(startIndex, startIndex + itemsPerPage);
  }, [warnings, currentPageWarning]);

  const totalWarningPages = Math.ceil(warnings.length / itemsPerPage);

  const paginatedSummary = useMemo(() => {
    const startIndex = (currentPageSummary - 1) * itemsPerPage;
    return ruasSummary.slice(startIndex, startIndex + itemsPerPage);
  }, [ruasSummary, currentPageSummary]);

  const totalSummaryPages = Math.ceil(ruasSummary.length / itemsPerPage);
  
  // SDI Analysis Logic for Local Roads
  const sdiData = useMemo(() => {
    let localRoads = ruasData.filter(r => String(r.pengelola).toLowerCase() !== 'nasional');
    
    // Apply specific authority filter if provided (e.g., Kota Ambon)
    if (externalFilterKewenangan && !['all', 'nasional', 'daerah'].includes(externalFilterKewenangan)) {
      localRoads = localRoads.filter(r => 
        String(r.pengelola).toLowerCase() === externalFilterKewenangan.toLowerCase() ||
        String(r.kabupaten_kota).toLowerCase() === externalFilterKewenangan.toLowerCase()
      );
    }

    const summary = localRoads.map(ruas => {
      // Calculate avg SDI for current year across all segments
      let totalSdi = 0;
      let count = 0;
      const treatments: any[] = [];
      const history: any[] = [];

      ruas.segments.forEach((seg: any) => {
        const yearData = seg[selectedYear];
        if (yearData && yearData.sdi !== undefined) {
          const val = parseFloat(yearData.sdi);
          if (!isNaN(val)) {
            totalSdi += val;
            count++;
          }
        }
        
        // Collect all treatments
        availableYears.forEach(y => {
          if (seg[y] && seg[y].treatment && seg[y].treatment !== 'NONE') {
            treatments.push({ year: y, type: seg[y].treatment, sta: `${seg.sta_awal}-${seg.sta_akhir}` });
          }
        });
      });

      const avgSdi = count > 0 ? totalSdi / count : 0;
      
      // History average per year
      availableYears.forEach(y => {
        let yTotal = 0;
        let yCount = 0;
        ruas.segments.forEach((seg: any) => {
          if (seg[y] && seg[y].sdi !== undefined) {
            const val = parseFloat(seg[y].sdi);
            if (!isNaN(val)) {
              yTotal += val;
              yCount++;
            }
          }
        });
        if (yCount > 0) history.push({ year: y, sdi: parseFloat((yTotal / yCount).toFixed(2)) });
      });

      return {
        id: ruas.no_ruas || ruas.id,
        nama: ruas.nama_jalan || ruas.nama || 'Tanpa Nama',
        avgSdi: parseFloat(avgSdi.toFixed(2)),
        condition: avgSdi < 50 ? 'Baik' : avgSdi < 100 ? 'Sedang' : avgSdi < 150 ? 'Rusak Ringan' : 'Rusak Berat',
        treatments: treatments.sort((a, b) => b.year.localeCompare(a.year)),
        history: history.sort((a, b) => a.year.localeCompare(b.year))
      };
    });

    const stats = {
      total: summary.length,
      avg: summary.length > 0 ? summary.reduce((a, b) => a + b.avgSdi, 0) / summary.length : 0,
      baik: summary.filter(s => s.condition === 'Baik').length,
      sedang: summary.filter(s => s.condition === 'Sedang').length,
      ringan: summary.filter(s => s.condition === 'Rusak Ringan').length,
      berat: summary.filter(s => s.condition === 'Rusak Berat').length,
    };

    return { summary, stats };
  }, [ruasData, selectedYear, availableYears]);

  const ppks = Array.from(new Set(allSegments.map(s => s.ppk)));
  
  const ruasOptionsMap = new Map();
  allSegments
    .filter(s => filterKecamatan === 'all' || s.ppk === filterKecamatan)
    .forEach(s => {
      if (!ruasOptionsMap.has(s.no_ruas)) {
        ruasOptionsMap.set(s.no_ruas, s.nama_jalan);
      }
    });

  const ruasOptions = Array.from(ruasOptionsMap.entries()).map(([no, nama]) => ({ no_ruas: no, nama_jalan: nama }));

  // Automatically reset selected Ruas if it is no longer valid
  React.useEffect(() => {
    if (filterRuas !== 'all' && !ruasOptionsMap.has(filterRuas)) {
      setFilterRuas('all');
    }
  }, [filterKecamatan, filterRuas, ruasOptionsMap]);

  const exportToCSV = () => {
    const headers = [
      'No. Ruas', 'Nama Jalan', 'PPK', 'Total Panjang (KM)', 'Baik (KM)', 
      'Sedang (KM)', 'Marginal (KM)', 'Rusak Ringan (KM)', 'Rusak Berat (KM)', '% Mantap'
    ];

    const rows = ruasSummary.map(r => {
      const pctMantap = r.totalKm > 0 ? ((r.baikKm + r.sedangKm) / r.totalKm) * 100 : 0;
      return [
        r.no_ruas,
        r.nama_jalan,
        r.ppk,
        r.totalKm.toFixed(2),
        r.baikKm.toFixed(2),
        r.sedangKm.toFixed(2),
        r.marginalKm.toFixed(2),
        r.ringanKm.toFixed(2),
        r.beratKm.toFixed(2),
        pctMantap.toFixed(1) + '%'
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Laporan_Analisis_Jalan_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportWarningsToCSV = () => {
    const headers = [
      'Alert', 'Ruas', 'Nama Jalan', 'STA', 'Kondisi Sebelumnya', 'IRI Sebelumnya', 'IRI Saat Ini', 'Status'
    ];

    const rows = warnings.map(w => {
      let alertMsg = [];
      if (w.isCritical) alertMsg.push('Kritis (IRI > 8)');
      if (w.statusDropped) alertMsg.push('Penurunan Kinerja');

      return [
        alertMsg.join(' - '),
        w.no_ruas,
        w.nama_jalan === 'Tanpa Nama' ? w.no_ruas : w.nama_jalan,
        `${w.sta_awal} - ${w.sta_akhir}`,
        w.prevCategory || '-',
        typeof w.prevConditionVal === 'number' ? w.prevConditionVal.toFixed(2) : (w.prevConditionVal || '-'),
        typeof w.conditionVal === 'number' ? w.conditionVal.toFixed(2) : (w.conditionVal || '-'),
        w.category
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Peringatan_Dini_Segmen_Kritis_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-hidden flex flex-col p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 flex-1 flex flex-col w-full h-full">
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-[#003B7A] tracking-tight uppercase">Analisis & Laporan Jaringan Jalan</h1>
            <p className="text-sm text-slate-500 font-medium">Data Tahun: <span className="text-[#F5A800] font-bold">{selectedYear || '-'}</span></p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-white shadow-sm border border-slate-200 rounded-lg p-1 text-sm font-bold">
              <button className="px-3 py-1 flex items-center gap-2 text-slate-600 hover:text-[#003B7A] transition" onClick={exportToCSV}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 shrink-0 overflow-x-auto no-scrollbar">
          {(filterKewenangan === 'nasional' || filterKewenangan === '') && (
            <>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'border-[#003B7A] text-[#003B7A] bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('warning')}
                className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'warning' ? 'border-red-600 text-red-600 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Peringatan Dini & Segmen Kritis ({warnings.length})
              </button>
              <button 
                onClick={() => setActiveTab('summary')}
                className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'summary' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Ringkasan Kondisi per Ruas Jalan ({ruasSummary.length} Ruas)
              </button>
            </>
          )}

          {(filterKewenangan !== 'nasional') && (
            <button 
              onClick={() => setActiveTab('sdi_analysis')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'sdi_analysis' ? 'border-[#F5A800] text-[#F5A800] bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Analisis SDI (Jalan Daerah)
            </button>
          )}
        </div>

        {activeTab === 'dashboard' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-[#003B7A]">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total Panjang Jalan</div>
                <div className="text-3xl font-black text-slate-800">{totalKm.toFixed(2)} <span className="text-sm font-medium text-slate-500">KM</span></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-[#10B981]">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Kemantapan Jalan</div>
                <div className="text-3xl font-black text-slate-800">{pctMantap.toFixed(1)} <span className="text-sm font-medium text-slate-500">%</span></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-[#DC2626]">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Jumlah Segmen Kritis</div>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-black text-slate-800">{criticalSegmentsCount}</div>
                  {criticalSegmentsCount > 0 && <AlertTriangle className="text-red-500" size={24}/>}
                </div>
              </div>
            </div>

            {/* Authority Breakdown (Shown when 'all' is selected) */}
            {filterKewenangan === '' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                  <div className="p-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                    <h3 className="text-xs font-black text-[#003B7A] uppercase tracking-widest">Jalan Nasional</h3>
                    <span className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-100">Kewenangan Pusat</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Panjang</div>
                      <div className="text-xl font-black text-slate-700">
                        {filteredSegments.filter(s => s.isNasional).reduce((a, b) => a + b.lengthKm, 0).toFixed(2)} <span className="text-[10px] font-medium">KM</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Mantap</div>
                      <div className="text-xl font-black text-emerald-600">
                        {(() => {
                          const nas = filteredSegments.filter(s => s.isNasional);
                          const total = nas.reduce((a, b) => a + b.lengthKm, 0);
                          const mantap = nas.filter(s => s.category === 'Baik' || s.category === 'Sedang').reduce((a, b) => a + b.lengthKm, 0);
                          return total > 0 ? ((mantap / total) * 100).toFixed(1) : '0.0';
                        })()}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden">
                  <div className="p-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                    <h3 className="text-xs font-black text-orange-800 uppercase tracking-widest">Jalan Daerah</h3>
                    <span className="text-[10px] font-bold text-orange-600 bg-white px-2 py-0.5 rounded-full border border-orange-100">Kewenangan Daerah</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Panjang</div>
                      <div className="text-xl font-black text-slate-700">
                        {filteredSegments.filter(s => !s.isNasional).reduce((a, b) => a + b.lengthKm, 0).toFixed(2)} <span className="text-[10px] font-medium">KM</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Mantap</div>
                      <div className="text-xl font-black text-emerald-600">
                        {(() => {
                          const dae = filteredSegments.filter(s => !s.isNasional);
                          const total = dae.reduce((a, b) => a + b.lengthKm, 0);
                          const mantap = dae.filter(s => s.category === 'Baik' || s.category === 'Sedang').reduce((a, b) => a + b.lengthKm, 0);
                          return total > 0 ? ((mantap / total) * 100).toFixed(1) : '0.0';
                        })()}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl shadow-sm lg:col-span-1">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b pb-2 mb-4">Komposisi Kondisi (KM)</h3>
            <div className="h-[500px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="40%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => [`${value.toFixed(2)} KM (${totalKm > 0 ? ((value / totalKm) * 100).toFixed(1) : 0}%)`]} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center" 
                    wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b pb-2 mb-4">Perbandingan Antar Wilayah (KM)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-30} textAnchor="end" height={80} />
                  <YAxis tick={{fontSize: 12}} />
                  <RechartsTooltip 
                    cursor={{fill: 'transparent'}} 
                    formatter={(value: number, name: string, props: any) => [
                      `${value.toFixed(2)} KM (${props.payload.total > 0 ? ((value / props.payload.total) * 100).toFixed(1) : 0}%)`, 
                      name
                    ]} 
                  />
                  <Legend />
                  <Bar dataKey="Baik" stackId="a" fill={IRI_COLORS['Baik']} />
                  <Bar dataKey="Sedang" stackId="a" fill={IRI_COLORS['Sedang']} />
                  <Bar dataKey="Marginal" stackId="a" fill={IRI_COLORS['Marginal']} />
                  <Bar dataKey="Rusak Ringan" stackId="a" fill={IRI_COLORS['Rusak Ringan']} />
                  <Bar dataKey="Rusak Berat" stackId="a" fill={IRI_COLORS['Rusak Berat']} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </>
    )}

        {/* Warning / Critical Table */}
        {activeTab === 'warning' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-red-50/50 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              <h3 className="font-bold text-red-900 uppercase tracking-wide text-sm">Peringatan Dini & Segmen Kritis ({warnings.length})</h3>
            </div>
            {warnings.length > 0 && (
              <button 
                onClick={exportWarningsToCSV}
                className="px-2 py-1 flex items-center gap-1.5 text-xs font-bold text-red-700 bg-white border border-red-200 rounded shadow-sm hover:bg-red-50 transition"
              >
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed min-w-[800px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-[15%]">Alert</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-12">Ruas</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-[25%]">Nama Jalan</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-24">STA</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-[18%]">Kondisi Sebelumnya</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] text-right w-[15%]">Kondisi Saat Ini</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] w-[12%]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedWarnings.map((w, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {w.isCritical && <span className="bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded text-[9px] border border-red-200">{w.isNasional ? 'Kritis (IRI > 8)' : 'Rusak Berat'}</span>}
                        {w.statusDropped && <span className="bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded text-[9px] border border-orange-200">Penurunan Kinerja</span>}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-xs">{w.no_ruas}</td>
                    <td className="p-3 text-xs truncate" title={w.nama_jalan}>{w.nama_jalan === 'Tanpa Nama' ? w.no_ruas : w.nama_jalan}</td>
                    <td className="p-3 text-xs">{w.sta_awal} - {w.sta_akhir}</td>
                    <td className="p-3 text-xs text-slate-500">{w.prevCategory || '-'} ({typeof w.prevConditionVal === 'number' ? w.prevConditionVal.toFixed(2) : (w.prevConditionVal || '-')})</td>
                    <td className="p-3 text-right font-black text-xs">{typeof w.conditionVal === 'number' ? w.conditionVal.toFixed(2) : (w.conditionVal || '-')}</td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-sm" style={{backgroundColor: (IRI_COLORS as any)[w.category]}}>
                        {w.category}
                      </span>
                    </td>
                  </tr>
                ))}
                {warnings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">Tidak ada segmen kritis atau peringatan dini.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {totalWarningPages > 1 && (
            <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Menampilkan {(currentPageWarning - 1) * itemsPerPage + 1} - {Math.min(currentPageWarning * itemsPerPage, warnings.length)} dari {warnings.length} data
              </div>
              <div className="flex gap-2">
                <button 
                  disabled={currentPageWarning === 1}
                  onClick={() => setCurrentPageWarning(p => Math.max(1, p - 1))}
                  className="px-3 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Prev
                </button>
                {[...Array(totalWarningPages)].map((_, i) => {
                  const p = i + 1;
                  if (totalWarningPages > 7 && Math.abs(p - currentPageWarning) > 2 && p !== 1 && p !== totalWarningPages) return null;
                  return (
                    <button 
                      key={p}
                      onClick={() => setCurrentPageWarning(p)}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold border rounded transition ${currentPageWarning === p ? 'bg-[#003B7A] text-white' : 'bg-white hover:bg-slate-50'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button 
                  disabled={currentPageWarning === totalWarningPages}
                  onClick={() => setCurrentPageWarning(p => Math.min(totalWarningPages, p + 1))}
                  className="px-3 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

        {/* Ringkasan per Ruas Table */}
        {activeTab === 'summary' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
            <h3 className="font-bold text-[#003B7A] uppercase tracking-wide text-sm">Ringkasan Kondisi per Ruas Jalan ({ruasSummary.length} Ruas)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] table-fixed min-w-[900px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-2 font-black text-slate-500 uppercase tracking-tighter w-16">No. Ruas</th>
                  <th className="p-2 font-black text-slate-500 uppercase tracking-tighter">Nama Jalan</th>
                  <th className="p-2 font-black text-slate-500 uppercase tracking-tighter w-24">PPK</th>
                  <th className="p-2 font-black text-slate-500 uppercase tracking-tighter text-right w-16">Panjang</th>
                  <th className="p-2 font-black text-[#10B981] uppercase tracking-tighter text-right w-14">Baik</th>
                  <th className="p-2 font-black text-[#FBBF24] uppercase tracking-tighter text-right w-14">Sedang</th>
                  <th className="p-2 font-black text-[#F97316] uppercase tracking-tighter text-right w-14">Marginal</th>
                  <th className="p-2 font-black text-[#F472B6] uppercase tracking-tighter text-right w-14">R. Ringan</th>
                  <th className="p-2 font-black text-[#DC2626] uppercase tracking-tighter text-right w-14">R. Berat</th>
                  <th className="p-2 font-black text-blue-600 uppercase tracking-tighter text-right w-16">% Mantap</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedSummary.map((r, i) => {
                  const pctMantap = r.totalKm > 0 ? ((r.baikKm + r.sedangKm) / r.totalKm) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 font-black text-slate-700">{r.no_ruas}</td>
                      <td className="p-2 truncate" title={r.nama_jalan}>{r.nama_jalan === 'Tanpa Nama' ? r.no_ruas : r.nama_jalan}</td>
                      <td className="p-2 text-slate-500 truncate" title={r.ppk}>{r.ppk}</td>
                      <td className="p-2 text-right font-bold">{r.totalKm.toFixed(2)}</td>
                      <td className="p-2 text-right text-[#10B981] font-medium">{r.baikKm > 0 ? r.baikKm.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right text-[#FBBF24] font-medium">{r.sedangKm > 0 ? r.sedangKm.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right text-[#F97316] font-medium">{r.marginalKm > 0 ? r.marginalKm.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right text-[#F472B6] font-medium">{r.ringanKm > 0 ? r.ringanKm.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right text-[#DC2626] font-medium">{r.beratKm > 0 ? r.beratKm.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right font-black text-[#003B7A] bg-slate-50">{pctMantap.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalSummaryPages > 1 && (
            <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Menampilkan {(currentPageSummary - 1) * itemsPerPage + 1} - {Math.min(currentPageSummary * itemsPerPage, ruasSummary.length)} dari {ruasSummary.length} data
              </div>
              <div className="flex gap-2">
                <button 
                  disabled={currentPageSummary === 1}
                  onClick={() => setCurrentPageSummary(p => Math.max(1, p - 1))}
                  className="px-3 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Prev
                </button>
                {[...Array(totalSummaryPages)].map((_, i) => {
                  const p = i + 1;
                  if (totalSummaryPages > 7 && Math.abs(p - currentPageSummary) > 2 && p !== 1 && p !== totalSummaryPages) return null;
                  return (
                    <button 
                      key={p}
                      onClick={() => setCurrentPageSummary(p)}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold border rounded transition ${currentPageSummary === p ? 'bg-blue-600 text-white shadow-sm' : 'bg-white hover:bg-slate-50'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button 
                  disabled={currentPageSummary === totalSummaryPages}
                  onClick={() => setCurrentPageSummary(p => Math.min(totalSummaryPages, p + 1))}
                  className="px-3 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sdi_analysis' && (
        <div className="space-y-6">
          {/* Block 1: Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-slate-700">
              <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Total Ruas</div>
              <div className="text-xl font-black text-slate-800">{sdiData.stats.total}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-emerald-500">
              <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Baik [SDI &lt; 50]</div>
              <div className="text-xl font-black text-emerald-600">{sdiData.stats.baik}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-400">
              <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Sedang [50-100]</div>
              <div className="text-xl font-black text-amber-600">{sdiData.stats.sedang}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-500">
              <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Rusak Ringan</div>
              <div className="text-xl font-black text-orange-600">{sdiData.stats.ringan}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-600">
              <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Rusak Berat</div>
              <div className="text-xl font-black text-red-700">{sdiData.stats.berat}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Block 2: Interactive SDI Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[600px]">
              <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-sm font-black text-[#003B7A] uppercase tracking-wider">Tabel SDI per Ruas</h3>
                <span className="text-[10px] font-bold text-slate-400 italic">* Klik ruas untuk melihat analisis detil</span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-white sticky top-0 border-b z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-black text-slate-400 uppercase tracking-tighter w-24">No. Ruas</th>
                      <th className="p-3 font-black text-slate-400 uppercase tracking-tighter">Nama Jalan</th>
                      <th className="p-3 font-black text-slate-400 uppercase tracking-tighter w-24">SDI</th>
                      <th className="p-3 font-black text-slate-400 uppercase tracking-tighter w-24">Kondisi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sdiData.summary.map((r) => (
                      <tr 
                        key={r.id} 
                        onClick={() => setSelectedRuasId(r.id)}
                        className={`cursor-pointer transition-colors ${selectedRuasId === r.id ? 'bg-[#003B7A]/5 border-l-2 border-l-[#003B7A]' : 'hover:bg-slate-50'}`}
                      >
                        <td className="p-3 font-black text-slate-700">{r.id}</td>
                        <td className="p-3 truncate font-medium text-slate-600">{r.nama}</td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-black text-slate-500">
                              <span>{r.avgSdi}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${r.avgSdi < 50 ? 'bg-emerald-500' : r.avgSdi < 100 ? 'bg-amber-400' : r.avgSdi < 150 ? 'bg-orange-500' : 'bg-red-600'}`}
                                style={{ width: `${Math.min((r.avgSdi / 400) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white shadow-sm ${r.avgSdi < 50 ? 'bg-emerald-500' : r.avgSdi < 100 ? 'bg-amber-400' : r.avgSdi < 150 ? 'bg-orange-500' : 'bg-red-600'}`}>
                            {r.condition}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Blocks 3 & 4: Trend and Treatments */}
            <div className="flex flex-col gap-6">
              {selectedRuasId ? (
                <>
                  {/* Block 3: SDI Trend Chart */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 min-h-[300px]">
                    <h3 className="text-sm font-black text-[#003B7A] uppercase tracking-wider mb-4 border-b pb-2">
                      Tren SDI: {sdiData.summary.find(s => s.id === selectedRuasId)?.nama}
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sdiData.summary.find(s => s.id === selectedRuasId)?.history || []}>
                          <XAxis dataKey="year" tick={{fontSize: 10}} />
                          <YAxis tick={{fontSize: 10}} />
                          <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                          <Bar 
                            dataKey="sdi" 
                            fill="#003B7A" 
                            radius={[4, 4, 0, 0]}
                            label={{ position: 'top', fontSize: 10, fontWeight: 'bold' }} 
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Block 4: Treatment History */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex-1 min-h-[240px]">
                    <h3 className="text-sm font-black text-[#003B7A] uppercase tracking-wider mb-4 border-b pb-2">Riwayat Penanganan</h3>
                    <div className="space-y-3 max-h-[220px] overflow-auto pr-2">
                      {sdiData.summary.find(s => s.id === selectedRuasId)?.treatments.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-xs italic">Belum ada riwayat penanganan</div>
                      ) : (
                        sdiData.summary.find(s => s.id === selectedRuasId)?.treatments.map((t, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="bg-[#F5A800] text-white p-2 rounded-lg">
                              <TrendingUp size={16} />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-black text-slate-700">{t.type}</span>
                                <span className="text-[10px] font-bold text-white bg-slate-400 px-1.5 rounded">{t.year}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">Lokasi: STA {t.sta}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-dashed p-12 flex flex-col items-center justify-center h-full text-slate-400 text-center">
                  <TrendingUp size={48} className="mb-4 opacity-20" />
                  <p className="font-bold text-sm">Pilih ruas jalan dari tabel</p>
                  <p className="text-[11px]">untuk melihat detil analisis tren dan riwayat penanganan</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};
