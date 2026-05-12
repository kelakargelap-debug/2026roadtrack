import React, { useMemo, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart, Bar 
} from 'recharts';
import { AlertTriangle, Download, ArrowRight, Settings2 } from 'lucide-react';

const TREN_COLORS = {
  'Tidak Signifikan': '#639922',
  'Signifikan': '#BA7517',
  'Sangat Signifikan': '#E24B4A'
};

const KONDISI_COLORS = {
  'Baik': '#10B981',        
  'Sedang': '#FBBF24',      
  'Rusak Ringan': '#F97316',
  'Rusak Berat': '#DC2626'  
};

const TREATMENT_MARK_COLORS = {
  'RM': '#888780', 
  'RK': '#888780', 
  'HLD': '#888780',
  'PRV': '#378ADD',
  'MNR': '#1D9E75',
  'MYR': '#7F77DD',
  'RKN': '#D85A30',
};

const evalTreatment = (type: string, condBefore: number, condAfter: number) => {
  const delta = condAfter - condBefore; 
  
  if (['RM', 'RK', 'HLD'].includes(type)) {
     if (delta <= 0.5) return 'Efektif'; 
     if (delta <= 1.0) return 'Kurang Efektif';
     return 'Tidak Efektif';
  }

  let expectedMinDrop = 0;
  if (type === 'PRV') expectedMinDrop = 1.0;
  if (type === 'MNR') expectedMinDrop = 2.0;
  if (type === 'MYR') expectedMinDrop = 4.0;
  if (type === 'RKN') {
     if (condAfter < 4) return 'Efektif';
     expectedMinDrop = Math.max(0, condBefore - 4) * 0.8; 
  }

  if (delta <= -expectedMinDrop) return 'Efektif';
  if (delta < 0) return 'Kurang Efektif';
  return 'Tidak Efektif';
};

const getKondisi = (val: number, isNasional: boolean) => {
  if (isNasional) {
    if (val < 4) return 'Baik';
    if (val <= 8) return 'Sedang';
    if (val <= 12) return 'Rusak Ringan';
    return 'Rusak Berat';
  } else {
    if (val < 50) return 'Baik';
    if (val < 100) return 'Sedang';
    if (val < 150) return 'Rusak Ringan';
    return 'Rusak Berat';
  }
};

const getSdiNumericValue = (sdi: any): number => {
  if (sdi === undefined || sdi === null || sdi === "") return 0;
  const s = String(sdi).toUpperCase().trim();
  if (s === 'B' || s === 'BAIK') return 25;
  if (s === 'S' || s === 'SEDANG') return 75;
  if (s === 'RR' || s === 'RUSAK RINGAN') return 125;
  if (s === 'RB' || s === 'RUSAK BERAT') return 200;
  return parseFloat(s) || 0;
};

const getTren = (delta: number, isNasional: boolean) => {
  const absDelta = Math.abs(delta);
  if (isNasional) {
    if (absDelta <= 1.0) return 'Tidak Signifikan';
    if (absDelta <= 3.0) return 'Signifikan';
    return 'Sangat Signifikan';
  } else {
    if (absDelta <= 20.0) return 'Tidak Signifikan';
    if (absDelta <= 50.0) return 'Signifikan';
    return 'Sangat Signifikan';
  }
};

export const TrendDashboard = ({ 
  ruasData, 
  availableYears,
  externalFilterKewenangan,
  externalFilterRuas,
  externalFilterSegmen,
  externalFilterTren,
  externalFilterKondisi,
  externalFilterTreatment
}: { 
  ruasData: any[], 
  availableYears: string[],
  externalFilterKewenangan?: string,
  externalFilterRuas?: string,
  externalFilterSegmen?: string,
  externalFilterTren?: string,
  externalFilterKondisi?: string,
  externalFilterTreatment?: string
}) => {
  const sortedYears = useMemo(() => [...availableYears].sort(), [availableYears]);
  const [filterKewenangan, setFilterKewenangan] = useState<string>('');
  const [filterRuas, setFilterRuas] = useState<string>('all');
  const [filterSegmen, setFilterSegmen] = useState<string>('all');
  const [filterTren, setFilterTren] = useState<string>('all');
  const [filterKondisi, setFilterKondisi] = useState<string>('all');
  const [filterTreatment, setFilterTreatment] = useState<string>('all');

  React.useEffect(() => {
    if (externalFilterKewenangan !== undefined) setFilterKewenangan(externalFilterKewenangan);
  }, [externalFilterKewenangan]);

  React.useEffect(() => {
    if (externalFilterRuas !== undefined) setFilterRuas(externalFilterRuas);
  }, [externalFilterRuas]);

  React.useEffect(() => {
    if (externalFilterSegmen !== undefined) setFilterSegmen(externalFilterSegmen);
  }, [externalFilterSegmen]);

  React.useEffect(() => {
    if (externalFilterTren !== undefined) setFilterTren(externalFilterTren);
  }, [externalFilterTren]);

  React.useEffect(() => {
    if (externalFilterKondisi !== undefined) setFilterKondisi(externalFilterKondisi);
  }, [externalFilterKondisi]);

  React.useEffect(() => {
    if (externalFilterTreatment !== undefined) setFilterTreatment(externalFilterTreatment);
  }, [externalFilterTreatment]);

  const [showPrediksi, setShowPrediksi] = useState(true);
  const [showThreshold, setShowThreshold] = useState(true);
  const [activeTab, setActiveTab] = useState<'grafik' | 'tabel'>('grafik');

  // Parse data
  const segmentsStats = useMemo(() => {
    let segs: any[] = [];
    if (!Array.isArray(ruasData) || sortedYears.length < 2) return segs;

    ruasData.forEach(ruas => {
      if (!Array.isArray(ruas.segments)) return;
      const pengelola = String(ruas.pengelola || 'nasional').toLowerCase();
      const isNasional = pengelola === 'nasional';

      ruas.segments.forEach(seg => {
        // Find first and last year data for Condition
        let firstYear = null;
        let lastYear = null;
        let firstVal = 0;
        let lastVal = 0;

        for (const yr of sortedYears) {
          const rawVal = isNasional ? seg[yr]?.iri : seg[yr]?.sdi;
          const numericVal = isNasional ? (parseFloat(rawVal) || 0) : getSdiNumericValue(rawVal);
          
          if (numericVal > 0) {
            if (!firstYear) {
              firstYear = yr;
              firstVal = numericVal;
            }
            lastYear = yr;
            lastVal = numericVal;
          }
        }

        if (firstYear && lastYear && firstYear !== lastYear) {
          const yearDiff = parseInt(lastYear) - parseInt(firstYear);
          const delta = yearDiff > 0 ? (lastVal - firstVal) / yearDiff : 0;
          const tren = getTren(delta, isNasional);
          const kondisi = getKondisi(lastVal, isNasional);
          
          const prediksi1 = lastVal + (delta * 1);
          const prediksi2 = lastVal + (delta * 2);
          const prediksi3 = lastVal + (delta * 3);
          
          let alert = 'Hijau';
          const criticalThreshold = isNasional ? 12 : 150;
          const warningThreshold = isNasional ? 8 : 100;

          if (lastVal > criticalThreshold || (isNasional ? delta > 3.0 : delta > 50) || prediksi1 > criticalThreshold) {
            alert = 'Merah';
          } else if ((lastVal > warningThreshold && lastVal <= criticalThreshold) || (isNasional ? (delta > 1.0 && delta <= 3.0) : (delta > 20 && delta <= 50)) || prediksi2 > criticalThreshold) {
            alert = 'Kuning';
          }

          const skorPrioritas = isNasional 
            ? (lastVal * 0.6) + (delta * 0.4)
            : (lastVal / 10 * 0.6) + (delta / 10 * 0.4);

          // Find last treatment
          let lastTreatmentInfo: any = null;
          for (let i = 0; i < sortedYears.length; i++) {
             const yr = sortedYears[i];
             if (seg[yr] && seg[yr].treatment && seg[yr].treatment !== 'NONE') {
                const trtType = seg[yr].treatment;
                const trtYear = yr;
                
                let valBefore = null;
                if (i > 0) {
                   const prevYear = sortedYears[i-1];
                   const rawPrev = isNasional ? seg[prevYear]?.iri : seg[prevYear]?.sdi;
                   valBefore = isNasional ? (parseFloat(rawPrev) || 0) : getSdiNumericValue(rawPrev);
                }
                const rawAfter = isNasional ? seg[yr]?.iri : seg[yr]?.sdi;
                const valAfter = isNasional ? (parseFloat(rawAfter) || 0) : getSdiNumericValue(rawAfter);
                
                let efektivitas = '-';
                if (valBefore !== null && valAfter !== null) {
                   efektivitas = evalTreatment(trtType, valBefore, valAfter);
                }

                const age = parseInt(lastYear) - parseInt(trtYear);
                lastTreatmentInfo = { type: trtType, year: trtYear, age, efektivitas };
             }
          }

          let rekomendasi = '-';
          if (isNasional) {
            if (lastVal < 4 && delta <= 1) rekomendasi = 'RM';
            else if (lastVal >= 4 && lastVal <= 6 && delta <= 1) rekomendasi = 'RK / PRV';
            else if (lastVal >= 4 && lastVal <= 8 && delta > 1) rekomendasi = 'PRV / MNR';
            else if (lastVal > 8 && lastVal <= 12 && delta <= 2) rekomendasi = 'MNR';
            else if (lastVal > 8 && lastVal <= 12 && delta > 2) rekomendasi = 'MYR';
            else if (lastVal > 12) rekomendasi = 'RKN';
          } else {
            if (lastVal < 50) rekomendasi = 'Pemeliharaan Rutin';
            else if (lastVal < 100) rekomendasi = 'Pemeliharaan Berkala';
            else if (lastVal < 150) rekomendasi = 'Rehabilitasi';
            else rekomendasi = 'Rekonstruksi';
          }

          let note = '';
          if (lastTreatmentInfo && ['MYR', 'RKN'].includes(lastTreatmentInfo.type)) {
             if (lastTreatmentInfo.age < 3 && lastVal > (isNasional ? 8 : 100)) {
                note = 'Investigasi Mutu / Overloading';
             }
          }

          // Data points for chart
          const chartData: any[] = [];
          for (const yr of sortedYears) {
            const rawVal = isNasional ? seg[yr]?.iri : seg[yr]?.sdi;
            const numericVal = isNasional ? (parseFloat(rawVal) || 0) : getSdiNumericValue(rawVal);
            if (numericVal >= 0) {
              chartData.push({ 
                tahun: yr, 
                val: numericVal,
                treatment: seg[yr]?.treatment && seg[yr].treatment !== 'NONE' ? seg[yr].treatment : null 
              });
            }
          }
          
          if (showPrediksi) {
            const lastYInt = parseInt(lastYear);
            chartData.push({ tahun: String(lastYInt + 1), val_prediksi: Math.max(0, prediksi1) });
            chartData.push({ tahun: String(lastYInt + 2), val_prediksi: Math.max(0, prediksi2) });
            chartData.push({ tahun: String(lastYInt + 3), val_prediksi: Math.max(0, prediksi3) });
          }

          segs.push({
            id: seg.id || seg.segment_id,
            segment_id: seg.segment_id,
            no_ruas: ruas.no_ruas,
            nama_jalan: ruas.nama_jalan === 'Tanpa Nama' ? ruas.no_ruas : ruas.nama_jalan,
            sta: `${seg.sta_awal} - ${seg.sta_akhir}`,
            pengelola,
            isNasional,
            firstYear, firstVal,
            lastYear, lastVal,
            delta, tren, kondisi,
            prediksi1, prediksi2, prediksi3,
            alert, skorPrioritas,
            chartData,
            lastTreatmentInfo,
            rekomendasi,
            note
          });
        }
      });
    });

    return segs.sort((a, b) => b.skorPrioritas - a.skorPrioritas);
  }, [ruasData, sortedYears, showPrediksi]);

  const filteredSegments = useMemo(() => {
    return segmentsStats.filter(s => {
      // Kewenangan filter
      if (filterKewenangan === 'nasional') {
        if (!s.isNasional) return false;
      } else if (filterKewenangan === 'daerah') {
        if (s.isNasional) return false;
      } else if (filterKewenangan) {
        // Specific local authority
        if (s.pengelola !== filterKewenangan && String(s.kabupaten_kota || '').toLowerCase() !== filterKewenangan) return false;
      }

      if (filterRuas !== 'all' && s.no_ruas !== filterRuas) return false;
      if (filterSegmen !== 'all' && s.segment_id !== filterSegmen) return false;
      if (filterTren !== 'all' && s.tren !== filterTren) return false;
      if (filterKondisi !== 'all' && s.kondisi !== filterKondisi) return false;
      if (filterTreatment !== 'all') {
         if (filterTreatment === 'none' && s.lastTreatmentInfo) return false;
         if (filterTreatment !== 'none' && (!s.lastTreatmentInfo || s.lastTreatmentInfo.type !== filterTreatment)) return false;
      }
      return true;
    });
  }, [segmentsStats, filterKewenangan, filterRuas, filterSegmen, filterTren, filterKondisi, filterTreatment]);

  const ruasOptions = useMemo(() => {
    const map = new Map();
    segmentsStats.forEach(s => map.set(s.no_ruas, s.nama_jalan));
    return Array.from(map.entries()).map(([no, nama]) => ({ no_ruas: no, nama_jalan: nama }));
  }, [segmentsStats]);

  const segmenOptions = useMemo(() => {
    if (filterRuas === 'all') return [];
    return Array.from(new Set(segmentsStats.filter(s => s.no_ruas === filterRuas).map(s => s.segment_id)));
  }, [segmentsStats, filterRuas]);

  if (sortedYears.length < 2) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-8 h-full">
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto text-orange-400 mb-4" size={48} />
          <h2 className="text-xl font-bold text-slate-700 mb-2">Data Kurang Lengkap</h2>
          <p className="text-slate-500 font-medium">Fitur Prediksi & Tren membutuhkan data setidaknya 2 tahun yang berbeda untuk melakukan kalkulasi tren.</p>
        </div>
      </div>
    );
  }

  // Build combined chart data for the selected segments (max 10 for readability)
  const chartLines = filteredSegments.slice(0, 10);
  const combinedChartData = useMemo(() => {
    const dataMap = new Map();
    const allYearsToTrack = new Set<string>();
    
    chartLines.forEach(s => {
      s.chartData.forEach((d: any) => {
        allYearsToTrack.add(d.tahun);
        if (!dataMap.has(d.tahun)) dataMap.set(d.tahun, { tahun: d.tahun });
        const row = dataMap.get(d.tahun);
        if (d.val !== undefined) row[`${s.segment_id}_val`] = d.val;
        if (d.val_prediksi !== undefined) row[`${s.segment_id}_prediksi`] = d.val_prediksi;
      });
    });

    return Array.from(allYearsToTrack).sort().map(y => dataMap.get(y));
  }, [chartLines]);

  const treatmentLines = useMemo(() => {
    const lines: any[] = [];
    chartLines.forEach(s => {
      s.chartData.forEach((d: any) => {
        if (d.treatment) {
          lines.push({ tahun: d.tahun, type: d.treatment, segment_id: s.segment_id });
        }
      });
    });
    return lines;
  }, [chartLines]);

  const treatmentDistribution = useMemo(() => {
    const dataMap = new Map<string, any>();
    sortedYears.forEach(y => dataMap.set(y, { tahun: y, PRV: 0, MNR: 0, MYR: 0, RKN: 0, RM: 0, RK: 0, HLD: 0 }));

    filteredSegments.forEach(s => {
      s.chartData.forEach((d: any) => {
        if (d.treatment && d.treatment !== 'NONE' && dataMap.has(d.tahun)) {
           dataMap.get(d.tahun)[d.treatment] = (dataMap.get(d.tahun)[d.treatment] || 0) + 1;
        }
      });
    });

    return Array.from(dataMap.values());
  }, [filteredSegments, sortedYears]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterKewenangan, filterRuas, filterSegmen, filterTren, filterKondisi, filterTreatment]);

  const totalPages = Math.ceil(filteredSegments.length / itemsPerPage);
  const paginatedSegments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSegments.slice(start, start + itemsPerPage);
  }, [filteredSegments, currentPage, itemsPerPage]);

  const exportToCSV = () => {
    const headers = [
      'Prioritas', 'Alert', 'Ruas', 'Segmen', 'STA', 'IRI ' + sortedYears[sortedYears.length - 1], 'Kondisi', 
      'Delta IRI/Thn', 'Tren', 'Trt. Terakhir', 'Umur', 'Efektivitas', 
      'Rekomendasi', 'Note', 'Prediksi +3 Thn', 'Skor'
    ];

    const rows = filteredSegments.map((s, idx) => {
      const displayCondition = s.isNasional ? s.lastVal.toFixed(2) : (s.lastVal === 25 ? 'B' : s.lastVal === 75 ? 'S' : s.lastVal === 125 ? 'RR' : s.lastVal === 200 ? 'RB' : s.lastVal);
      const displayDelta = s.isNasional ? s.delta.toFixed(2) : s.delta.toFixed(0);

      return [
        idx + 1,
        s.alert === 'Merah' ? 'Kritis' : s.alert === 'Kuning' ? 'Waspada' : 'Aman',
        s.no_ruas,
        s.segment_id,
        s.sta,
        displayCondition,
        s.kondisi,
        displayDelta,
        s.tren,
        s.lastTreatmentInfo ? s.lastTreatmentInfo.type : '-',
        s.lastTreatmentInfo ? s.lastTreatmentInfo.age : '-',
        s.lastTreatmentInfo ? s.lastTreatmentInfo.efektivitas : '-',
        s.rekomendasi,
        s.note || '-',
        s.prediksi3.toFixed(2),
        s.skorPrioritas.toFixed(2)
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Data_Tren_Dan_Prediksi.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full font-sans overflow-hidden">
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        <div className="w-full space-y-6 flex flex-col">
          
          {/* Sub-Header & Export */}
          <div className="flex justify-between items-start md:items-end flex-col md:flex-row gap-4 shrink-0">
            <div>
              <h1 className="text-2xl font-black text-[#003B7A] tracking-tight uppercase">Prediksi & Tren Kemantapan (Δ Kondisi)</h1>
              <p className="text-sm text-slate-500 font-medium mt-1 max-w-xl">
                Menganalisis laju kerusakan rata-rata per tahun untuk memproyeksi kebutuhan preservasi 3 tahun ke depan. Untuk SDI, B=25, S=75, RR=125, RB=200.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="hidden md:flex flex-wrap justify-end gap-3 text-xs font-bold text-slate-600 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                <label className="flex items-center gap-2 cursor-pointer border-r pr-3">
                  <input type="checkbox" checked={showPrediksi} onChange={e => setShowPrediksi(e.target.checked)} className="accent-[#003B7A] w-3.5 h-3.5" />
                  Prediksi
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showThreshold} onChange={e => setShowThreshold(e.target.checked)} className="accent-[#003B7A] w-3.5 h-3.5" />
                  Batas Kritis
                </label>
              </div>

              <div className="flex bg-white shadow-sm border border-slate-200 rounded-lg p-1 text-sm font-bold">
                <button className="px-3 py-1.5 flex items-center gap-2 text-slate-600 hover:text-[#003B7A] transition" onClick={exportToCSV}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 shrink-0">
            <button 
              onClick={() => setActiveTab('grafik')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'grafik' ? 'border-[#003B7A] text-[#003B7A] bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Dashboard Grafik
            </button>
            <button 
              onClick={() => setActiveTab('tabel')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'tabel' ? 'border-[#003B7A] text-[#003B7A] bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Prioritas Penanganan Segmen
            </button>
          </div>

          {/* Charts Section */}
          {activeTab === 'grafik' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
            <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Grafik Tren Kondisi</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Interpelasi kondisi hingga 3 tahun mendatang. (Max 10 segmen ditampilkan)</p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold uppercase flex-wrap justify-end">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Tidak Signifikan']}}></div> Tidak Sig.</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Signifikan']}}></div> Signifikan</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Sangat Signifikan']}}></div> Sgt. Sig.</div>
                </div>
              </div>
              
              <div className="h-64">
                {chartLines.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 font-bold">Tidak ada data untuk filter tersebut.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={combinedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="tahun" tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} />
                      <YAxis tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} domain={[0, 'dataMax + 2']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                        labelStyle={{ fontSize: '11px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}
                        formatter={(val: number) => [val.toFixed(2), "Skor Kondisi"]}
                      />
                      
                      {showThreshold && (
                        <>
                          <ReferenceLine y={4} stroke="#10B981" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Batas Nasional - Baik (IRI 4)', fill: '#10B981', fontSize: 10, fontWeight: 800 }} opacity={0.5} />
                          <ReferenceLine y={8} stroke="#F5A800" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Batas Nasional - Sedang (IRI 8)', fill: '#F5A800', fontSize: 10, fontWeight: 800 }} opacity={0.5} />
                          <ReferenceLine y={50} stroke="#10B981" strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'Batas Daerah - Baik (SDI 50)', fill: '#10B981', fontSize: 10, fontWeight: 800 }} opacity={0.5} />
                          <ReferenceLine y={100} stroke="#F5A800" strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'Batas Daerah - Sedang (SDI 100)', fill: '#F5A800', fontSize: 10, fontWeight: 800 }} opacity={0.5} />
                        </>
                      )}

                      {treatmentLines.map((t, idx) => {
                        const color = (TREATMENT_MARK_COLORS as any)[t.type] || '#888780';
                        return (
                          <ReferenceLine 
                            key={`trt-${idx}`} 
                            x={t.tahun} 
                            stroke={color} 
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            label={{ position: 'top', value: `${t.type} (${t.segment_id})`, fill: color, fontSize: 10, fontWeight: 800 }} 
                          />
                        );
                      })}

                      {chartLines.map(s => {
                        const color = (TREN_COLORS as any)[s.tren];
                        return (
                          <React.Fragment key={s.segment_id}>
                            <Line 
                              type="monotone" 
                              dataKey={`${s.segment_id}_val`} 
                              name={`${s.segment_id}`} 
                              stroke={color} 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                              activeDot={{ r: 6 }}
                              isAnimationActive={false}
                            />
                            {showPrediksi && (
                              <Line 
                                type="monotone" 
                                dataKey={`${s.segment_id}_prediksi`} 
                                name={`${s.segment_id} (Prediksi)`} 
                                stroke={color} 
                                strokeWidth={3}
                                strokeDasharray="5 5"
                                dot={{ r: 4, fill: '#fff', strokeWidth: 2 }}
                                activeDot={false}
                                opacity={0.5}
                                isAnimationActive={false}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Distribusi Treatment</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Jumlah segmen yang ditangani per tahun</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={treatmentDistribution} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="tahun" tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} />
                    <YAxis tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 800 }} />
                    <Bar dataKey="RM" stackId="a" fill={TREATMENT_MARK_COLORS['RM']} name="RM / RK" />
                    <Bar dataKey="RK" stackId="a" fill={TREATMENT_MARK_COLORS['RK']} name="RK" hide /> 
                    <Bar dataKey="HLD" stackId="a" fill={TREATMENT_MARK_COLORS['HLD']} name="HLD" hide />
                    <Bar dataKey="PRV" stackId="a" fill={TREATMENT_MARK_COLORS['PRV']} name="PRV" />
                    <Bar dataKey="MNR" stackId="a" fill={TREATMENT_MARK_COLORS['MNR']} name="MNR" />
                    <Bar dataKey="MYR" stackId="a" fill={TREATMENT_MARK_COLORS['MYR']} name="MYR" />
                    <Bar dataKey="RKN" stackId="a" fill={TREATMENT_MARK_COLORS['RKN']} name="RKN" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

          {/* Priority Table Section - Fills remaining height */}
          {activeTab === 'tabel' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-[500px]">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-[#003B7A] uppercase tracking-wide text-sm">Prioritas Penanganan Segmen ({filteredSegments.length})</h3>
              <div className="flex items-center gap-3">
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-1">
                    <button 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="p-1 hover:bg-slate-50 disabled:opacity-30 transition rounded"
                    >
                      <ArrowRight className="rotate-180" size={14} />
                    </button>
                    <span className="text-[10px] font-black text-slate-500 px-2 uppercase">Hal {currentPage} / {totalPages}</span>
                    <button 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="p-1 hover:bg-slate-50 disabled:opacity-30 transition rounded"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded">Skor = (IRI × 0.6) + (Δ IRI × 0.4)</span>
                {filteredSegments.length > 0 && (
                  <button 
                    onClick={exportToCSV}
                    className="px-2 py-1 flex items-center gap-1.5 text-xs font-bold text-[#003B7A] bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 sticky top-0 border-b z-10">
                  <tr>
                    <th className="p-3 font-bold text-slate-500 uppercase sticky left-0 bg-slate-100 z-20">Alert</th>
                    <th className="p-3 font-bold text-slate-500 uppercase">Ruas</th>
                    <th className="p-3 font-bold text-slate-500 uppercase">Segmen</th>
                    <th className="p-3 font-bold text-slate-500 uppercase border-l text-center bg-blue-50/50">Δ / Tahun</th>
                    <th className="p-3 font-bold text-slate-500 uppercase text-center bg-blue-50/50">Tren (Kondisi)</th>
                    <th className="p-3 font-bold text-slate-500 uppercase border-l text-center">Trt. Terakhir</th>
                    <th className="p-3 font-bold text-slate-500 uppercase text-center">Efektivitas</th>
                    <th className="p-3 font-bold text-slate-500 uppercase text-center">Rekomendasi</th>
                    <th className="p-3 font-bold text-slate-500 uppercase border-l text-center bg-orange-50/50">+3 Thn (Prediksi)</th>
                    <th className="p-3 font-bold text-slate-500 uppercase border-l text-center">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSegments.map((s, i) => {
                    let alertBadge = null;
                    if (s.alert === 'Merah') {
                      alertBadge = <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-red-200"><div className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></div> Kritis</span>;
                    } else if (s.alert === 'Kuning') {
                      alertBadge = <span className="bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-orange-200"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Waspada</span>;
                    } else {
                      alertBadge = <span className="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-green-200"><div className="w-2 h-2 rounded-full bg-green-500"></div> Aman</span>;
                    }

                    let trtBadge = s.lastTreatmentInfo ? 
                      <div className="flex flex-col items-center">
                        <span className="font-black text-sm" style={{color: (TREATMENT_MARK_COLORS as any)[s.lastTreatmentInfo.type] || '#64748B'}}>{s.lastTreatmentInfo.type}</span>
                        <span className="text-[10px] text-slate-500">Umur: {s.lastTreatmentInfo.age}th</span>
                      </div> : 
                      <span className="text-slate-400">-</span>;

                    let efekBadge = s.lastTreatmentInfo ? 
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        s.lastTreatmentInfo.efektivitas === 'Efektif' ? 'bg-green-100 text-green-700' : 
                        s.lastTreatmentInfo.efektivitas === 'Kurang Efektif' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {s.lastTreatmentInfo.efektivitas}
                      </span> : 
                      <span className="text-slate-400">-</span>;

                    const displayLastVal = s.isNasional ? s.lastVal.toFixed(2) : (s.lastVal === 25 ? 'B' : s.lastVal === 75 ? 'S' : s.lastVal === 125 ? 'RR' : s.lastVal === 200 ? 'RB' : s.lastVal);

                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10">{alertBadge}</td>
                        <td className="p-3 font-bold">{s.no_ruas} <br/><span className="font-normal text-slate-500 text-[10px]">{s.nama_jalan}</span></td>
                        <td className="p-3 font-black text-blue-900">{s.segment_id} <br/><span className="font-normal text-slate-500 text-[10px]">{s.sta}</span></td>
                        
                        <td className="p-3 text-center border-l bg-blue-50/30 font-black text-blue-700">
                          {s.isNasional ? `+${s.delta.toFixed(2)}` : `+${s.delta.toFixed(0)}`}
                        </td>
                        <td className="p-3 text-center bg-blue-50/30">
                          <div className="flex flex-col gap-1 items-center">
                            <span className="px-2 py-0.5 rounded font-bold text-white shadow-sm w-32" style={{backgroundColor: (TREN_COLORS as any)[s.tren]}}>
                              {s.tren}
                            </span>
                            <span className="px-2 py-0.5 rounded font-bold text-white shadow-sm w-32" style={{backgroundColor: (KONDISI_COLORS as any)[s.kondisi]}}>
                              {s.kondisi} ({displayLastVal})
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-center border-l">{trtBadge}</td>
                        <td className="p-3 text-center">{efekBadge}</td>
                        
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center">
                             <span className="font-bold text-[#003B7A]">{s.rekomendasi}</span>
                             {s.note && <span className="text-[10px] font-bold text-red-600 mt-1">{s.note}</span>}
                          </div>
                        </td>

                        <td className="p-3 text-center border-l bg-orange-50/30 font-bold text-orange-800">{s.prediksi3.toFixed(s.isNasional ? 2 : 0)}</td>
                        
                        <td className="p-3 text-center border-l">
                          <div className="font-black text-lg bg-slate-100 w-12 h-12 flex flex-col items-center justify-center rounded-lg mx-auto shadow-sm border border-slate-200">
                            {s.skorPrioritas.toFixed(1)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-center items-center gap-2 shrink-0">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-[#003B7A] hover:bg-slate-50 disabled:opacity-50 transition shadow-sm uppercase tracking-widest"
                >
                  <ArrowRight className="rotate-180" size={14} />
                  Sebelumnya
                </button>
                
                <div className="flex items-center gap-1 mx-4">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage;
                    if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    
                    if (pageNum <= 0 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-[#003B7A] text-white shadow-md' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-100'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-[#003B7A] hover:bg-slate-50 disabled:opacity-50 transition shadow-sm uppercase tracking-widest"
                >
                  Berikutnya
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
};
