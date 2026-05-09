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

const getCategory = (iri: number) => {
  if (iri <= 4) return 'Baik';
  if (iri <= 6) return 'Sedang';
  if (iri <= 8) return 'Marginal';
  if (iri <= 12) return 'Rusak Ringan';
  return 'Rusak Berat';
};

export const AnalyticsDashboard = ({ ruasData, selectedYear, availableYears }: { ruasData: any[], selectedYear: string, availableYears: string[] }) => {
  const [filterKecamatan, setFilterKecamatan] = useState<string>('all');
  const [filterRuas, setFilterRuas] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Logika Input & Transformasi Data
  // Build flattened segments data specifically for the selected year
  const allSegments = useMemo(() => {
    let segs: any[] = [];
    if (!Array.isArray(ruasData)) return segs;
    
    ruasData.forEach(ruas => {
      if (!Array.isArray(ruas.segments)) return;
      ruas.segments.forEach(seg => {
        const yearData = seg[selectedYear] || { iri: 0, treatment: 'NONE' };
        
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

        const iri = parseFloat(yearData.iri) || 0;
        const category = getCategory(iri);
        const prevIri = prevYearData ? (parseFloat(prevYearData.iri) || 0) : null;
        const prevCategory = prevIri !== null ? getCategory(prevIri) : null;

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
          iri,
          category,
          prevIri,
          prevCategory,
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
  const criticalSegmentsCount = filteredSegments.filter(seg => seg.iri > 8).length;

  // 4. Logika Alert (Peringatan Dini)
  const warnings = useMemo(() => {
    return filteredSegments.filter(seg => {
      // Trigger "Segmen Kritis": Jika IRI > 8
      const isCritical = seg.iri > 8;
      // Trigger Pemeliharaan: status berubah dari "Sedang" ke "Marginal"
      const statusDropped = seg.prevCategory === 'Sedang' && seg.category === 'Marginal';
      return isCritical || statusDropped;
    }).map(seg => ({
      ...seg,
      isCritical: seg.iri > 8,
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
        w.prevIri?.toFixed(2) || '-',
        w.iri.toFixed(2),
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
    <div className="flex-1 bg-slate-50 overflow-auto p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#003B7A] tracking-tight uppercase">Analisis & Laporan Jaringan Jalan</h1>
            <p className="text-sm text-slate-500 font-medium">Data Tahun: <span className="text-[#F5A800] font-bold">{selectedYear || '-'}</span></p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <input 
                type="text" 
                placeholder="Cari ruas/segmen..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm w-48"
              />
              <select value={filterKecamatan} onChange={e => setFilterKecamatan(e.target.value)} className="border border-slate-300 rounded px-3 py-1.5 text-sm outline-none">
                <option value="all">Semua Wilayah</option>
                {ppks.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterRuas} onChange={e => setFilterRuas(e.target.value)} className="border border-slate-300 rounded px-3 py-1.5 text-sm outline-none max-w-[150px]">
                <option value="all">Semua Ruas</option>
                {ruasOptions.map(r => <option key={r.no_ruas} value={r.no_ruas}>{r.no_ruas} : {r.nama_jalan === 'Tanpa Nama' ? 'Tanpa Nama' : r.nama_jalan}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-slate-300 rounded px-3 py-1.5 text-sm outline-none">
                <option value="all">Semua Kondisi</option>
                {Object.keys(IRI_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex bg-white shadow-sm border border-slate-200 rounded-lg p-1 text-sm font-bold">
              <button className="px-3 py-1 flex items-center gap-2 text-slate-600 hover:text-[#003B7A] transition" onClick={exportToCSV}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
        </div>

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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl shadow-sm lg:col-span-1">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b pb-2 mb-4">Komposisi Kondisi (KM)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={(entry) => `${((entry.value / totalKm) * 100).toFixed(1)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => [`${value.toFixed(2)} KM (${totalKm > 0 ? ((value / totalKm) * 100).toFixed(1) : 0}%)`]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b pb-2 mb-4">Perbandingan Antar Wilayah (KM)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{fontSize: 12}} interval={0} angle={-30} textAnchor="end" height={60} />
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

        {/* Warning / Critical Table */}
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
          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 border-b z-10">
                <tr>
                  <th className="p-3 font-bold text-slate-500 uppercase">Alert</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Ruas</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Nama Jalan</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">STA</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Kondisi Sebelumnya</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-right">IRI Saat Ini</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((w, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3">
                      {w.isCritical && <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded text-xs mr-2 border border-red-200">Kritis (IRI &gt; 8)</span>}
                      {w.statusDropped && <span className="bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded text-xs border border-orange-200">Penurunan Kinerja</span>}
                    </td>
                    <td className="p-3 font-medium">{w.no_ruas}</td>
                    <td className="p-3">{w.nama_jalan === 'Tanpa Nama' ? w.no_ruas : w.nama_jalan}</td>
                    <td className="p-3">{w.sta_awal} - {w.sta_akhir}</td>
                    <td className="p-3 text-slate-500">{w.prevCategory || '-'} ({w.prevIri?.toFixed(2) || '-'})</td>
                    <td className="p-3 text-right font-black">{w.iri.toFixed(2)}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded text-xs font-bold text-white shadow-sm" style={{backgroundColor: (IRI_COLORS as any)[w.category]}}>
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
        </div>

        {/* Ringkasan per Ruas Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
            <h3 className="font-bold text-[#003B7A] uppercase tracking-wide text-sm">Ringkasan Kondisi per Ruas Jalan ({ruasSummary.length} Ruas)</h3>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 border-b z-10">
                <tr>
                  <th className="p-3 font-bold text-slate-500 uppercase">No. Ruas</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">Nama Jalan</th>
                  <th className="p-3 font-bold text-slate-500 uppercase">PPK</th>
                  <th className="p-3 font-bold text-slate-500 uppercase text-right">Total Panjang</th>
                  <th className="p-3 font-bold text-[#10B981] uppercase text-right">Baik</th>
                  <th className="p-3 font-bold text-[#FBBF24] uppercase text-right">Sedang</th>
                  <th className="p-3 font-bold text-[#F97316] uppercase text-right">Marginal</th>
                  <th className="p-3 font-bold text-[#F472B6] uppercase text-right">Rusak Ringan</th>
                  <th className="p-3 font-bold text-[#DC2626] uppercase text-right">Rusak Berat</th>
                  <th className="p-3 font-bold text-blue-600 uppercase text-right">% Mantap</th>
                </tr>
              </thead>
              <tbody>
                {ruasSummary.map((r, i) => {
                  const pctMantap = r.totalKm > 0 ? ((r.baikKm + r.sedangKm) / r.totalKm) * 100 : 0;
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="p-3 font-bold">{r.no_ruas}</td>
                      <td className="p-3">{r.nama_jalan === 'Tanpa Nama' ? r.no_ruas : r.nama_jalan}</td>
                      <td className="p-3 text-slate-500">{r.ppk}</td>
                      <td className="p-3 text-right font-black">{r.totalKm.toFixed(2)} KM</td>
                      <td className="p-3 text-right text-[#10B981]">{r.baikKm > 0 ? r.baikKm.toFixed(2) + ' KM' : '-'}</td>
                      <td className="p-3 text-right text-[#FBBF24]">{r.sedangKm > 0 ? r.sedangKm.toFixed(2) + ' KM' : '-'}</td>
                      <td className="p-3 text-right text-[#F97316]">{r.marginalKm > 0 ? r.marginalKm.toFixed(2) + ' KM' : '-'}</td>
                      <td className="p-3 text-right text-[#F472B6]">{r.ringanKm > 0 ? r.ringanKm.toFixed(2) + ' KM' : '-'}</td>
                      <td className="p-3 text-right text-[#DC2626]">{r.beratKm > 0 ? r.beratKm.toFixed(2) + ' KM' : '-'}</td>
                      <td className="p-3 text-right font-bold text-blue-600 bg-blue-50/30">{pctMantap.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
