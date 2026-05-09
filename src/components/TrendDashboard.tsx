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

const evalTreatment = (type: string, iriBefore: number, iriAfter: number) => {
  const delta = iriAfter - iriBefore; 
  
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
     if (iriAfter < 4) return 'Efektif';
     expectedMinDrop = Math.max(0, iriBefore - 4) * 0.8; 
  }

  if (delta <= -expectedMinDrop) return 'Efektif';
  if (delta < 0) return 'Kurang Efektif';
  return 'Tidak Efektif';
};

const getKondisi = (iri: number) => {
  if (iri < 4) return 'Baik';
  if (iri <= 8) return 'Sedang';
  if (iri <= 12) return 'Rusak Ringan';
  return 'Rusak Berat';
};

const getTren = (deltaIri: number) => {
  if (deltaIri <= 1.0) return 'Tidak Signifikan';
  if (deltaIri <= 3.0) return 'Signifikan';
  return 'Sangat Signifikan';
};

export const TrendDashboard = ({ ruasData, availableYears }: { ruasData: any[], availableYears: string[] }) => {
  const sortedYears = useMemo(() => [...availableYears].sort(), [availableYears]);
  const [filterRuas, setFilterRuas] = useState<string>('all');
  const [filterSegmen, setFilterSegmen] = useState<string>('all');
  const [filterTren, setFilterTren] = useState<string>('all');
  const [filterKondisi, setFilterKondisi] = useState<string>('all');
  const [filterTreatment, setFilterTreatment] = useState<string>('all');
  const [showPrediksi, setShowPrediksi] = useState(true);
  const [showThreshold, setShowThreshold] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterRuas, filterSegmen, filterTren, filterKondisi, filterTreatment]);

  // Parse data
  const segmentsStats = useMemo(() => {
    let segs: any[] = [];
    if (!Array.isArray(ruasData) || sortedYears.length < 2) return segs;

    ruasData.forEach(ruas => {
      if (!Array.isArray(ruas.segments)) return;
      ruas.segments.forEach(seg => {
        // Find first and last year data for IRI
        let firstYear = null;
        let lastYear = null;
        let firstIri = 0;
        let lastIri = 0;

        for (const yr of sortedYears) {
          if (seg[yr] && seg[yr].iri !== undefined && seg[yr].iri > 0) {
            if (!firstYear) {
              firstYear = yr;
              firstIri = parseFloat(seg[yr].iri);
            }
            lastYear = yr;
            lastIri = parseFloat(seg[yr].iri);
          }
        }

        if (firstYear && lastYear && firstYear !== lastYear) {
          const yearDiff = parseInt(lastYear) - parseInt(firstYear);
          const deltaIri = yearDiff > 0 ? (lastIri - firstIri) / yearDiff : 0;
          const tren = getTren(deltaIri);
          const kondisi = getKondisi(lastIri);
          const prediksi1 = lastIri + (deltaIri * 1);
          const prediksi2 = lastIri + (deltaIri * 2);
          const prediksi3 = lastIri + (deltaIri * 3);
          
          let alert = 'Hijau';
          if (lastIri > 12 || deltaIri > 3.0 || prediksi1 > 12) {
            alert = 'Merah';
          } else if ((lastIri > 8 && lastIri <= 12) || (deltaIri > 1.0 && deltaIri <= 3.0) || prediksi2 > 12) {
            alert = 'Kuning';
          }

          const skorPrioritas = (lastIri * 0.6) + (deltaIri * 0.4);

          // Find last treatment
          let lastTreatmentInfo: any = null;
          for (let i = 0; i < sortedYears.length; i++) {
             const yr = sortedYears[i];
             if (seg[yr] && seg[yr].treatment && seg[yr].treatment !== 'NONE') {
                const trtType = seg[yr].treatment;
                const trtYear = yr;
                
                let iriBefore = null;
                if (i > 0) {
                   const prevYear = sortedYears[i-1];
                   if (seg[prevYear] && seg[prevYear].iri !== undefined) {
                      iriBefore = parseFloat(seg[prevYear].iri);
                   }
                }
                const iriAfter = parseFloat(seg[yr].iri);
                
                let efektivitas = '-';
                if (iriBefore !== null && iriAfter !== null) {
                   efektivitas = evalTreatment(trtType, iriBefore, iriAfter);
                }

                const age = parseInt(lastYear) - parseInt(trtYear);
                lastTreatmentInfo = { type: trtType, year: trtYear, age, efektivitas };
             }
          }

          let rekomendasi = '-';
          if (lastIri < 4 && deltaIri <= 1) rekomendasi = 'RM';
          else if (lastIri >= 4 && lastIri <= 6 && deltaIri <= 1) rekomendasi = 'RK / PRV';
          else if (lastIri >= 4 && lastIri <= 8 && deltaIri > 1) rekomendasi = 'PRV / MNR';
          else if (lastIri > 8 && lastIri <= 12 && deltaIri <= 2) rekomendasi = 'MNR';
          else if (lastIri > 8 && lastIri <= 12 && deltaIri > 2) rekomendasi = 'MYR';
          else if (lastIri > 12) rekomendasi = 'RKN';

          let note = '';
          if (lastTreatmentInfo && ['MYR', 'RKN'].includes(lastTreatmentInfo.type)) {
             if (lastTreatmentInfo.age < 3 && lastIri > 8) {
                note = 'Investigasi Mutu / Overloading';
             }
          }

          // Data points for chart
          const chartData: any[] = [];
          for (const yr of sortedYears) {
            if (seg[yr] && seg[yr].iri !== undefined) {
              chartData.push({ 
                tahun: yr, 
                iri: parseFloat(seg[yr].iri),
                treatment: seg[yr].treatment && seg[yr].treatment !== 'NONE' ? seg[yr].treatment : null 
              });
            }
          }
          
          if (showPrediksi) {
            const lastYInt = parseInt(lastYear);
            chartData.push({ tahun: String(lastYInt + 1), iri_prediksi: Math.max(0, prediksi1) });
            chartData.push({ tahun: String(lastYInt + 2), iri_prediksi: Math.max(0, prediksi2) });
            chartData.push({ tahun: String(lastYInt + 3), iri_prediksi: Math.max(0, prediksi3) });
          }

          segs.push({
            id: seg.id || seg.segment_id,
            segment_id: seg.segment_id,
            no_ruas: ruas.no_ruas,
            nama_jalan: ruas.nama_jalan === 'Tanpa Nama' ? ruas.no_ruas : ruas.nama_jalan,
            sta: `${seg.sta_awal} - ${seg.sta_akhir}`,
            firstYear, firstIri,
            lastYear, lastIri,
            deltaIri, tren, kondisi,
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
  }, [segmentsStats, filterRuas, filterSegmen, filterTren, filterKondisi, filterTreatment]);

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
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto text-orange-400 mb-4" size={48} />
          <h2 className="text-xl font-bold text-slate-700 mb-2">Data Kurang Lengkap</h2>
          <p className="text-slate-500">Fitur Prediksi & Tren membutuhkan data setidaknya 2 tahun yang berbeda untuk melakukan kalkulasi tren.</p>
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
        if (d.iri !== undefined) row[`${s.segment_id}_iri`] = d.iri;
        if (d.iri_prediksi !== undefined) row[`${s.segment_id}_prediksi`] = d.iri_prediksi;
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

  const exportToCSV = () => {
    const headers = [
      'Prioritas', 'Alert', 'Ruas', 'Segmen', 'STA', 'IRI ' + sortedYears[sortedYears.length - 1], 'Kondisi', 
      'Delta IRI/Thn', 'Tren', 'Trt. Terakhir', 'Umur', 'Efektivitas', 
      'Rekomendasi', 'Note', 'Prediksi +3 Thn', 'Skor'
    ];

    const rows = filteredSegments.map((s, idx) => {
      return [
        idx + 1,
        s.alert ? 'Waspada' : 'Aman',
        s.no_ruas,
        s.segment_id,
        s.sta,
        s.lastIri.toFixed(2),
        s.kondisi,
        s.deltaIri.toFixed(2),
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
    <div className="flex-1 bg-slate-50 overflow-auto p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex justify-between items-start md:items-end flex-col md:flex-row gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#003B7A] tracking-tight uppercase">Prediksi & Tren Kemantapan (Δ IRI)</h1>
            <p className="text-sm text-slate-500 font-medium mt-1 max-w-xl">
              Menganalisis laju kerusakan rata-rata per tahun untuk memproyeksi kebutuhan preservasi 3 tahun ke depan.
            </p>
          </div>
          
          <div className="flex bg-white shadow-sm border border-slate-200 rounded-lg p-1 text-sm font-bold">
            <button className="px-3 py-1.5 flex items-center gap-2 text-slate-600 hover:text-[#003B7A] transition" onClick={exportToCSV}>
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 text-slate-500">
            <Settings2 size={18} />
            <span className="font-bold text-sm uppercase">Filter:</span>
          </div>
          
          <select value={filterRuas} onChange={e => { setFilterRuas(e.target.value); setFilterSegmen('all'); }} className="border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-slate-50 w-48 font-medium">
            <option value="all">Semua Ruas</option>
            {ruasOptions.map(r => <option key={r.no_ruas} value={r.no_ruas}>{r.no_ruas} : {r.nama_jalan}</option>)}
          </select>
          
          <select value={filterSegmen} onChange={e => setFilterSegmen(e.target.value)} disabled={filterRuas === 'all'} className="border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-slate-50 w-32 font-medium disabled:opacity-50">
            <option value="all">Semua Segmen</option>
            {segmenOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={filterKondisi} onChange={e => setFilterKondisi(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-slate-50 w-40 font-medium">
            <option value="all">Semua Kondisi</option>
            <option value="Baik">Baik</option>
            <option value="Sedang">Sedang</option>
            <option value="Rusak Ringan">Rusak Ringan</option>
            <option value="Rusak Berat">Rusak Berat</option>
          </select>

          <select value={filterTren} onChange={e => setFilterTren(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-slate-50 w-48 font-medium">
            <option value="all">Semua Tren Kerusakan</option>
            <option value="Tidak Signifikan">Tidak Signifikan (≤ 1.0)</option>
            <option value="Signifikan">Signifikan (1.0 - 3.0)</option>
            <option value="Sangat Signifikan">Sangat Signifikan (&gt; 3.0)</option>
          </select>

          <select value={filterTreatment} onChange={e => setFilterTreatment(e.target.value)} className="border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-slate-50 w-48 font-medium">
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

          <div className="flex-1 flex justify-end gap-4 text-sm font-bold text-slate-600">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showPrediksi} onChange={e => setShowPrediksi(e.target.checked)} className="accent-[#003B7A] w-4 h-4" />
              Garis Prediksi
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showThreshold} onChange={e => setShowThreshold(e.target.checked)} className="accent-[#003B7A] w-4 h-4" />
              Batas Kritis
            </label>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Grafik Tren IRI</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Interpelasi kondisi hingga 3 tahun mendatang. (Max 10 segmen ditampilkan)</p>
              </div>
              <div className="flex gap-4 text-[10px] font-bold uppercase flex-wrap justify-end">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Tidak Signifikan']}}></div> Tidak Sig.</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Signifikan']}}></div> Signifikan</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: TREN_COLORS['Sangat Signifikan']}}></div> Sgt. Sig.</div>
              </div>
            </div>
            
            <div className="h-80">
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
                    />
                    
                    {showThreshold && (
                      <>
                        <ReferenceLine y={4} stroke="#10B981" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Batas Baik / Sedang (IRI 4)', fill: '#10B981', fontSize: 10, fontWeight: 800 }} />
                        <ReferenceLine y={8} stroke="#F5A800" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Batas Sedang / RR (IRI 8)', fill: '#F5A800', fontSize: 10, fontWeight: 800 }} />
                        <ReferenceLine y={12} stroke="#DC2626" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Batas RR / RB (IRI 12)', fill: '#DC2626', fontSize: 10, fontWeight: 800 }} />
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
                            dataKey={`${s.segment_id}_iri`} 
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
            <div className="h-80">
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

        {/* Priority Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-[#003B7A] uppercase tracking-wide text-sm">Prioritas Penanganan Segmen ({filteredSegments.length})</h3>
            <div className="flex items-center gap-3">
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
          
          <div className="overflow-x-auto max-h-[500px]">
            
          {/* Pagination Controls Top */}
          <div className="px-4 py-2 bg-white flex items-center justify-between border-b border-slate-200 text-sm">
            <span className="text-slate-500 font-bold">
              Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredSegments.length)} dari {filteredSegments.length} segmen
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 border border-slate-300 rounded font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50"
              >
                Prev
              </button>
              <span className="font-bold text-[#003B7A] px-2">{currentPage} / {Math.ceil(filteredSegments.length / ITEMS_PER_PAGE) || 1}</span>
              <button 
                disabled={currentPage >= Math.ceil(filteredSegments.length / ITEMS_PER_PAGE)}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 border border-slate-300 rounded font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
          
          <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-100 sticky top-0 border-b z-10">
                <tr>
                  <th className="p-3 font-bold text-slate-500 uppercase">Alert</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Ruas</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Segmen</th>
                  <th className="p-3 font-bold text-slate-500 uppercase border-l text-center bg-blue-50/50">Δ IRI / Thn</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-center bg-blue-50/50">Tren (Kondisi)</th>
                  <th className="p-3 font-bold text-slate-500 uppercase border-l text-center">Trt. Terakhir</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-center">Efektivitas</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-center">Rekomendasi</th>
                  <th className="p-3 font-bold text-slate-500 uppercase border-l text-center bg-orange-50/50">+3 Thn (Prediksi)</th>
                  <th className="p-3 font-bold text-slate-500 uppercase border-l text-center">Skor</th>
                </tr>
              </thead>
              <tbody>
                {filteredSegments.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((s, i) => {
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

                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="p-3">{alertBadge}</td>
                      <td className="p-3 font-bold">{s.no_ruas} <br/><span className="font-normal text-slate-500 text-[10px]">{s.nama_jalan}</span></td>
                      <td className="p-3 font-black text-blue-900">{s.segment_id} <br/><span className="font-normal text-slate-500 text-[10px]">{s.sta}</span></td>
                      
                      <td className="p-3 text-center border-l bg-blue-50/30 font-black text-blue-700">
                        +{s.deltaIri.toFixed(2)}
                      </td>
                      <td className="p-3 text-center bg-blue-50/30">
                        <div className="flex flex-col gap-1 items-center">
                          <span className="px-2 py-0.5 rounded font-bold text-white shadow-sm w-32" style={{backgroundColor: (TREN_COLORS as any)[s.tren]}}>
                            {s.tren}
                          </span>
                          <span className="px-2 py-0.5 rounded font-bold text-white shadow-sm w-24" style={{backgroundColor: (KONDISI_COLORS as any)[s.kondisi]}}>
                            {s.kondisi} ({s.lastIri.toFixed(2)})
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

                      <td className="p-3 text-center border-l bg-orange-50/30 font-bold text-orange-800">{s.prediksi3.toFixed(2)}</td>
                      
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
        </div>

      </div>
    </div>
  );
};
