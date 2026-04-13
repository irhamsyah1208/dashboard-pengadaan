// ============================================================
// APP.JS — Dashboard Monitoring Pengadaan (COMPLETE)
// ============================================================

const API_BASE = '/api/v1/pengadaan';

// Global data store
let appData = { paket: [], vendor: [], nilaiBulanan: null, kpi: null };
let sortDir = {};
let filteredRows = [];
let paketSearchQuery = '';
let monitoringSearchQuery = '';

// Period filters
let currentPeriod = 'Bulanan';
let currentYear = 2026;
let currentMonth = 'all';

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Dashboard starting...');
    setLastUpdate();
    await loadAllData();
    initAlertBanner();
    await initChartsFromAPI();
    renderMonitorTable(appData.paket);
    renderVendorTable();
    renderTopPaket();
    startAutoRefresh();
    loadYearOptions();
    
    // Sembunyikan month selector jika default Tahunan
    const monthSelector = document.getElementById('monthSelector');
    if (monthSelector && currentPeriod === 'Tahunan') monthSelector.style.display = 'none';
    
    setInterval(async () => {
        await loadAllData();
        setLastUpdate();
        await initChartsFromAPI();
    }, 30000);
    window.addEventListener('resize', () => {
    if (window.donutChartInst) window.donutChartInst.resize();
    if (window.barChartInst) window.barChartInst.resize();
    if (window.ganttChartInst) window.ganttChartInst.resize();
    if (window.vendorChartInst) window.vendorChartInst.resize();
});
});

// =================== API CALLS ===================
async function loadAllData() {
    try {
        console.log('📡 Fetching data from API...');
        const [kpiRes, paketRes, vendorRes, nilaiRes] = await Promise.all([
            fetch(`${API_BASE}/summary`),
            fetch(`${API_BASE}/paket`),
            fetch(`${API_BASE}/vendor`),
            fetch(`${API_BASE}/nilai`)
        ]);
        
        const kpiData = await kpiRes.json();
        const paketData = await paketRes.json();
        const vendorData = await vendorRes.json();
        const nilaiData = await nilaiRes.json();
        
        if (kpiData.status === 'success') { appData.kpi = kpiData.data; updateKPIFromData(kpiData.data); }
        if (paketData.status === 'success') { appData.paket = paketData.data || []; filteredRows = [...appData.paket]; renderMonitorTable(appData.paket); renderTopPaket(); renderPaketPage(); }
        if (vendorData.status === 'success') { appData.vendor = vendorData.data || []; renderVendorTable(); renderAllVendorPage(); updateVendorChart(); }
        if (nilaiData.status === 'success') { appData.nilaiBulanan = nilaiData.data; updateBarChartByPeriod(); updateDonutChart(); updateGanttChart(); }
        
        updateAlertBanner();
        console.log('✅ Data loaded:', appData.paket.length, 'paket');
    } catch (error) {
        console.error('❌ Failed to load:', error);
        showToast('Gagal load data dari API');
    }
}

// =================== KPI UPDATE ===================
function updateKPIFromData(data) {
    setVal('kpiTotal', data.total || 0);
    setVal('kpiProses', data.proses || 0);
    setVal('kpiSelesai', data.selesai || 0);
    setVal('kpiTerlambat', data.terlambat || 0);
    setVal('kpiNilai', formatNilai(data.nilaiTotal || 0));
    setVal('kpiOnTime', (data.onTimePercent || 0) + '%');
}

function formatNilai(nilai) {
    return nilai >= 1000 ? 'Rp ' + (nilai / 1000).toFixed(1) + 'M' : 'Rp ' + nilai + ' jt';
}

function setVal(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function setLastUpdate() {
    const el = document.getElementById('lastUpdate');
    if (el) el.textContent = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2800); }
}

// =================== ALERT BANNER ===================
function updateAlertBanner() {
    const terlambat = appData.paket.filter(p => p.status === 'Terlambat').length;
    const banner = document.getElementById('alertBanner');
    const ticker = document.getElementById('alertTicker');
    if (ticker) ticker.textContent = terlambat > 0 ? `❗ ${terlambat} paket terlambat` : '✅ Semua paket on track';
    if (banner && terlambat > 0) banner.style.display = 'flex';
}

function initAlertBanner() { updateAlertBanner(); }

// =================== CHARTS ===================
async function initChartsFromAPI() {
    updateBarChartByPeriod();
    updateDonutChart();
    updateGanttChart();
    updateVendorChart();
}

function updateDonutChart() {
    const ctx = document.getElementById('donutChart');
    if (!ctx) return;
    
    // Cek data kosong
    if (!appData.paket || appData.paket.length === 0) {
        if (window.donutChartInst) window.donutChartInst.destroy();
        const legendEl = document.getElementById('donutLegend');
        if (legendEl) legendEl.innerHTML = '<span style="color:var(--text3);font-size:12px">Tidak ada data</span>';
        return;
    }
    
    const statusCount = {};
    appData.paket.forEach(p => { statusCount[p.status] = (statusCount[p.status] || 0) + 1; });
    const labels = Object.keys(statusCount), values = Object.values(statusCount);
    const colors = ['#4f7ef7', '#f7a74f', '#22c97a', '#f74f4f', '#a78bfa'];
    
    const legendEl = document.getElementById('donutLegend');
    if (legendEl) legendEl.innerHTML = labels.map((l, i) => `<span class="legend-item"><span class="legend-dot" style="background:${colors[i % colors.length]}"></span>${l} ${values[i]}</span>`).join('');
    
    if (window.donutChartInst) window.donutChartInst.destroy();
    window.donutChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
    });
}

function updateGanttChart() {
    const ctx = document.getElementById('ganttChart');
    if (!ctx) return;
    
    if (!appData.paket || appData.paket.length === 0) {
        if (window.ganttChartInst) window.ganttChartInst.destroy();
        return;
    }
    
    const topPaket = appData.paket.slice(0, 8);
    const labels = topPaket.map(p => p.nama?.length > 22 ? p.nama.slice(0,22)+'…' : p.nama);
    const progress = topPaket.map(p => p.progress || 0);
    const remaining = topPaket.map(p => 100 - (p.progress || 0));
    
    // Set tinggi container dinamis
    const container = ctx.parentElement;
    if (container) {
        const height = Math.max(300, topPaket.length * 45 + 60);
        container.style.height = height + 'px';
    }
    
    if (window.ganttChartInst) window.ganttChartInst.destroy();
    window.ganttChartInst = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Progress', data: progress, backgroundColor: '#4f7ef7', borderRadius: 4, barPercentage: 0.55 },
            { label: 'Sisa', data: remaining, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, barPercentage: 0.55 }
        ] },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { 
                x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, 
                y: { stacked: true, grid: { display: false } } 
            } 
        }
    });
}

function updateVendorChart() {
    const ctx = document.getElementById('vendorChart');
    if (!ctx) return;
    
    // Cek data kosong
    if (!appData.vendor || appData.vendor.length === 0) {
        if (window.vendorChartInst) window.vendorChartInst.destroy();
        return;
    }
    
    const labels = appData.vendor.map(v => v.nama?.length > 14 ? v.nama.slice(0,14)+'…' : v.nama);
    
    if (window.vendorChartInst) window.vendorChartInst.destroy();
    window.vendorChartInst = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Tepat Waktu (%)', data: appData.vendor.map(v => v.tepatWaktu || 0), backgroundColor: '#4f7ef7', borderRadius: 4, barPercentage: 0.4 },
            { label: 'Kualitas (%)', data: appData.vendor.map(v => v.kualitas || 0), backgroundColor: '#2ed8c3', borderRadius: 4, barPercentage: 0.4 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b92a8', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#8b92a8', font: { size: 10 } } }, y: { max: 100, ticks: { callback: v => v + '%', color: '#8b92a8' } } } }
    });
}

// =================== BAR CHART WITH PERIOD FILTER + EMPTY MONTH DETECTION ===================
function updateBarChartByPeriod() {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;

    const nd = appData.nilaiBulanan;

    // ── No data at all ──
    if (!nd || !nd.labels || nd.labels.length === 0) {
        if (window.barChartInst) window.barChartInst.destroy();
        showBarChartEmpty('Tidak ada data nilai bulanan yang tersedia.');
        return;
    }

    let labels   = [...nd.labels];
    let series   = nd.series   ? nd.series.map(s => ({ ...s, values: [...s.values] })) : [];
    const emptyMonths = nd.emptyMonths || [];

    // ── Single month filter ──
    if (currentPeriod === 'Bulanan' && currentMonth !== 'all') {
        const idx = labels.indexOf(currentMonth);
        if (idx === -1) {
            showBarChartEmpty(`Data bulan "${currentMonth}" tidak ditemukan.`);
            return;
        }
        // Check if that specific month is empty
        if (emptyMonths.includes(currentMonth)) {
            if (window.barChartInst) window.barChartInst.destroy();
            showBarChartEmpty(`⚠️ Tidak ada data yang dapat ditampilkan untuk bulan "${currentMonth}" karena data kosong.`);
            return;
        }
        labels = [labels[idx]];
        series = series.map(ds => ({ ...ds, values: [ds.values[idx]] }));
    }

    // ── Yearly aggregate ── (skip null months from sum)
    if (currentPeriod === 'Tahunan') {
        const totals = {};
        series.forEach(ds => {
            totals[ds.unit] = ds.values.reduce((a, b) => a + (b === null ? 0 : b), 0);
        });
        labels = [currentYear.toString()];
        series = Object.entries(totals).map(([unit, total]) => ({ unit, values: [total] }));
    }

    if (!series.length || !labels.length) {
        showBarChartEmpty('Tidak ada data untuk ditampilkan.');
        return;
    }

    // ── Clear empty-month notice ──
    hideBarChartEmpty();

    const colors = ['#4f7ef7', '#f7a74f', '#22c97a', '#2ed8c3', '#a78bfa', '#f472b6'];
    if (window.barChartInst) window.barChartInst.destroy();

    window.barChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: series.map((ds, i) => ({
                label: ds.unit,
                data: ds.values,
                backgroundColor: colors[i % colors.length],
                borderRadius: 4,
                barPercentage: 0.7,
                // null values render as gap — no bar, tooltip shows "Kosong"
                skipNull: true,
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position:'top', labels:{ color:'#8b92a8' } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.parsed.y === null) return `${ctx.dataset.label}: (kosong)`;
                            return `${ctx.dataset.label}: Rp ${ctx.parsed.y}M`;
                        }
                    }
                }
            },
            scales: {
                x: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#8b92a8' }, border:{ color:'rgba(255,255,255,0.07)' } },
                y: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#8b92a8', callback: v => 'Rp '+v+'M' }, border:{ color:'rgba(255,255,255,0.07)' } }
            }
        }
    });

    // ── Show inline notice if some months in range are empty ──
    if (currentPeriod !== 'Bulanan' || currentMonth === 'all') {
        const visibleEmpties = labels.filter(l => emptyMonths.includes(l));
        if (visibleEmpties.length) {
            showBarChartNotice(`⚠️ Bulan berikut tidak memiliki data: ${visibleEmpties.join(', ')}`);
        } else {
            hideBarChartNotice();
        }
    } else {
        hideBarChartNotice();
    }
}

function showBarChartEmpty(msg) {
    const ctx = document.getElementById('barChart');
    if (ctx) ctx.style.display = 'none';
    let el = document.getElementById('barChartEmpty');
    if (!el) {
        el = document.createElement('div');
        el.id = 'barChartEmpty';
        el.style.cssText = 'text-align:center;padding:32px 16px;color:var(--text3,#8b92a8);font-size:13px;line-height:1.6;';
        ctx?.parentElement?.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
}

function hideBarChartEmpty() {
    const ctx = document.getElementById('barChart');
    if (ctx) ctx.style.display = '';
    const el = document.getElementById('barChartEmpty');
    if (el) el.style.display = 'none';
}

function showBarChartNotice(msg) {
    let el = document.getElementById('barChartNotice');
    if (!el) {
        el = document.createElement('div');
        el.id = 'barChartNotice';
        el.style.cssText = 'margin-top:6px;padding:6px 12px;background:rgba(247,167,79,0.12);border-left:3px solid #f7a74f;color:#f7a74f;font-size:12px;border-radius:4px;';
        const ctx = document.getElementById('barChart');
        ctx?.parentElement?.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
}

function hideBarChartNotice() {
    const el = document.getElementById('barChartNotice');
    if (el) el.style.display = 'none';
}

function filterByMonth() {
    const monthSelect = document.getElementById('monthSelector');
    if (monthSelect) { currentMonth = monthSelect.value; updateBarChartByPeriod(); }
}

function loadYearOptions() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;
    const startYear = 2024, endYear = new Date().getFullYear() + 2;
    for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement('option');
        option.value = y; option.textContent = y;
        if (y === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
    yearSelect.onchange = (e) => { currentYear = parseInt(e.target.value); updateBarChartByPeriod(); };
}

function setPeriod(btn, period) {
    document.querySelectorAll('.ptbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = period;
    const monthSelector = document.getElementById('monthSelector');
    if (monthSelector) {
        if (period === 'Tahunan') { monthSelector.style.display = 'none'; currentMonth = 'all'; }
        else { monthSelector.style.display = 'inline-block'; }
    }
    updateBarChartByPeriod();
    showToast('Periode: ' + period);
}

// =================== MONITOR TABLE ===================
function renderMonitorTable(rows) {
    filteredRows = [...rows];
    const tbody = document.getElementById('monitorBody');
    if (!tbody) return;
    if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px">Tidak ada数据</td></tr>'; return; }
    
    tbody.innerHTML = rows.map(p => {
        const sc = getStatusClass(p.status);
        const barColor = sc === 'red' ? '#f74f4f' : sc === 'yellow' ? '#f7a74f' : '#22c97a';
        return `<tr>
            <td style="font-weight:500">${p.nama || ''}</td>
            <td style="color:var(--text2)">${p.unit || ''}</td>
            <td>${p.pic || ''}</td>
            <td style="font-family:monospace;font-size:11px">${p.target || ''}</td>
            <td style="font-family:monospace;font-size:11px">${p.realisasi || '—'}</td>
            <td><div style="display:flex;align-items:center;gap:5px"><div class="prog-bar"><div style="width:${p.progress || 0}%;background:${barColor}"></div></div>${p.progress || 0}%</div></td>
            <td><span class="badge ${sc}">${p.status || ''}</span></td>
            <td style="color:var(--text2);font-size:11px">${p.ket || ''}</td>
        </tr>`;
    }).join('');
}

function getStatusClass(status) {
    const map = { 'Selesai': 'green', 'On Track': 'info', 'Perencanaan': 'info', 'Proses Tender': 'yellow', 'Kontrak': 'info', 'Risiko': 'yellow', 'Terlambat': 'red' };
    return map[status] || 'info';
}

// =================== FILTERS ===================
let activeFilters = { unit: '', jenis: '', status: '', search: '' };

function applyFilters() {
    activeFilters.unit = document.getElementById('filterUnit')?.value || '';
    activeFilters.jenis = document.getElementById('filterJenis')?.value || '';
    activeFilters.status = document.getElementById('filterStatus')?.value || '';
    applyAllFilters();
}

function filterTable(q) { activeFilters.search = q.toLowerCase(); applyAllFilters(); }

function applyAllFilters() {
    const { unit, jenis, status, search } = activeFilters;
    const rows = appData.paket.filter(p => {
        if (unit && p.unit !== unit) return false;
        if (jenis && p.jenis !== jenis) return false;
        if (status && p.status !== status) return false;
        if (search && !`${p.nama} ${p.unit} ${p.pic} ${p.status}`.toLowerCase().includes(search)) return false;
        return true;
    });
    renderMonitorTable(rows);
}

function sortTable(colIdx) {
    const dir = sortDir[colIdx] = !sortDir[colIdx];
    const keys = ['nama', 'unit', 'pic', 'target', 'realisasi', 'progress', 'status', 'ket'];
    const key = keys[colIdx];
    filteredRows.sort((a, b) => {
        let va = a[key] || '', vb = b[key] || '';
        if (key === 'progress') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return dir ? va - vb : vb - va; }
        return dir ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    renderMonitorTable(filteredRows);
}

// =================== VENDOR TABLE ===================
function renderVendorTable() {
    const tbody = document.getElementById('vendorBody');
    if (!tbody) return;
    if (!appData.vendor.length) { tbody.innerHTML = '<tr><td colspan="5">Tidak ada数据</td></tr>'; return; }
    tbody.innerHTML = appData.vendor.map(v => {
        const stars = '★'.repeat(Math.round(v.rating || 0)) + '☆'.repeat(5 - Math.round(v.rating || 0));
        const twColor = (v.tepatWaktu || 0) >= 85 ? '#22c97a' : (v.tepatWaktu || 0) >= 70 ? '#f7a74f' : '#f74f4f';
        return `<tr>
            <td style="font-weight:500">${v.nama}</td>
            <td style="font-family:monospace">${v.kontrak || 0}</td>
            <td style="color:${twColor}">${v.tepatWaktu || 0}%</td>
            <td>${v.kualitas || 0}%</td>
            <td><span class="stars">${stars}</span> ${v.rating || 0}</td>
        </tr>`;
    }).join('');
}

function renderTopPaket() {
    const el = document.getElementById('topPaketList');
    if (!el) return;
    const sorted = [...appData.paket].sort((a,b) => (b.nilai||0)-(a.nilai||0)).slice(0,5);
    if (!sorted.length) { el.innerHTML = '<div style="padding:20px;text-align:center">Tidak ada data</div>'; return; }
    el.innerHTML = sorted.map((p,i) => {
        const riskColor = p.risiko === 'Tinggi' ? '#f74f4f' : p.risiko === 'Sedang' ? '#f7a74f' : '#22c97a';
        return `<div class="top-item">
            <div class="top-item-name"><span class="top-rank">${i+1}</span>${p.nama}</div>
            <div class="top-item-meta">
                <span class="top-item-val">${formatNilai(p.nilai||0)}</span>
                <span class="badge" style="background:${riskColor}22;color:${riskColor}">${p.risiko || 'Rendah'}</span>
            </div>
            <div style="margin-top:6px;font-size:11px;color:var(--text2)">Vendor: ${p.vendor || '-'} · PIC: ${p.pic || '-'}</div>
        </div>`;
    }).join('');
}

// =================== PAGE NAVIGATION ===================
function showPage(page) {
    document.getElementById('dashboardPage')?.style.setProperty('display', page === 'dashboard' ? 'block' : 'none');
    document.getElementById('paketPage')?.style.setProperty('display', page === 'paket' ? 'block' : 'none');
    document.getElementById('vendorPage')?.style.setProperty('display', page === 'vendor' ? 'block' : 'none');
    document.getElementById('monitoringPage')?.style.setProperty('display', page === 'monitoring' ? 'block' : 'none');
    document.getElementById('integrasiPage')?.style.setProperty('display', page === 'integrasi' ? 'block' : 'none');
    
    const breadcrumb = document.getElementById('breadcrumb');
    const pageNames = { dashboard: 'Dashboard', paket: 'Paket Pengadaan', vendor: 'Kinerja Vendor', monitoring: 'Monitoring', integrasi: 'Integrasi' };
    if (breadcrumb) breadcrumb.textContent = pageNames[page] || 'Dashboard';
    
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    
    if (page === 'paket') renderPaketPage();
    if (page === 'vendor') renderAllVendorPage();
    if (page === 'monitoring') renderMonitoringPage();
    closeSidebar();
}

function renderPaketPage() {
    const tbody = document.getElementById('paketTableBody');
    if (!tbody) return;
    let data = appData.paket;
    if (paketSearchQuery) data = data.filter(p => p.nama?.toLowerCase().includes(paketSearchQuery));
    tbody.innerHTML = data.map(p => `<tr>
        <td style="font-family:monospace">${p.id || '-'}</td>
        <td style="font-weight:500">${p.nama || '-'}</td>
        <td>${p.unit || '-'}</td>
        <td>${p.jenis || '-'}</td>
        <td>${p.pic || '-'}</td>
        <td style="font-family:monospace">${p.target || '-'}</td>
        <td><div class="prog-bar"><div style="width:${p.progress || 0}%;background:#4f7ef7"></div></div> ${p.progress || 0}%</td>
        <td><span class="badge ${getStatusClass(p.status)}">${p.status || '-'}</span></td>
        <td style="font-family:monospace">${formatNilai(p.nilai || 0)}</td>
    </tr>`).join('');
}
function filterPaketPage(q) { paketSearchQuery = q.toLowerCase(); renderPaketPage(); }

function renderAllVendorPage() {
    const tbody = document.getElementById('allVendorBody');
    if (!tbody) return;
    tbody.innerHTML = appData.vendor.map(v => `<tr>
        <td style="font-weight:500">${v.nama || '-'}</td>
        <td style="font-family:monospace">${v.kontrak || 0}</td>
        <td style="color:${(v.tepatWaktu||0)>=85?'#22c97a':(v.tepatWaktu||0)>=70?'#f7a74f':'#f74f4f'}">${v.tepatWaktu || 0}%</td>
        <td>${v.kualitas || 0}%</td>
        <td>${'★'.repeat(Math.round(v.rating||0))}${'☆'.repeat(5-Math.round(v.rating||0))} ${v.rating||0}</td>
    </tr>`).join('');
}

function renderMonitoringPage() {
    const tbody = document.getElementById('monitoringBody');
    if (!tbody) return;
    let data = appData.paket.filter(p => p.status === 'Terlambat' || p.risiko === 'Tinggi');
    if (monitoringSearchQuery) data = data.filter(p => p.nama?.toLowerCase().includes(monitoringSearchQuery));
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Tidak ada paket terlambat atau berisiko tinggi</td></tr>'; return; }
    tbody.innerHTML = data.map(p => `<tr>
        <td style="font-weight:500">${p.nama || '-'}</td>
        <td>${p.unit || '-'}</td>
        <td><span class="badge ${getStatusClass(p.status)}">${p.status || '-'}</span></td>
        <td style="font-family:monospace">${p.target || '-'}</td>
        <td>${p.progress || 0}%</td>
        <td><span class="badge ${p.risiko === 'Tinggi' ? 'red' : 'yellow'}">${p.risiko || 'Rendah'}</span></td>
        <td style="color:var(--text2);font-size:11px">${p.ket || '-'}</td>
    </tr>`).join('');
}
function filterMonitoringPage(q) { monitoringSearchQuery = q.toLowerCase(); renderMonitoringPage(); }

// =================== SIDEBAR ===================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}
function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
    document.body.style.overflow = '';
}
function startAutoRefresh() { let c=30; setInterval(()=>{ c--; document.getElementById('refreshCountdown').textContent=`Auto-refresh: ${c}s`; if(c<=0)c=30; },1000); }

// =================== EXPORT FUNCTIONS ===================
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blob);
}

function exportTableCSV() {
    if (!filteredRows.length) { showToast('Tidak ada data untuk diexport'); return; }
    const headers = ['Nama Paket', 'Unit', 'PIC', 'Target', 'Realisasi', 'Progress', 'Status', 'Keterangan'];
    const rows = filteredRows.map(p => [p.nama, p.unit, p.pic, p.target, p.realisasi || '', p.progress + '%', p.status, p.ket]);
    let csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    downloadFile(csv, 'monitoring.csv', 'text/csv');
    showToast('Data diexport ke CSV');
}

function exportTableExcel() {
    if (typeof XLSX === 'undefined') { showToast('Library Excel tidak tersedia'); return; }
    const ws = XLSX.utils.json_to_sheet(filteredRows.map(p => ({
        'Nama Paket': p.nama, 'Unit': p.unit, 'PIC': p.pic, 'Target': p.target,
        'Realisasi': p.realisasi || '', 'Progress': p.progress + '%', 'Status': p.status, 'Keterangan': p.ket
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoring');
    XLSX.writeFile(wb, `monitoring-${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Data diexport ke Excel');
}

window.exportGanttCSV = function() {
    if (!appData.paket.length) return;
    const headers = ['ID', 'Nama Paket', 'Unit', 'Target', 'Progress', 'Status'];
    const rows = appData.paket.slice(0,8).map(p => [p.id, p.nama, p.unit, p.target, p.progress+'%', p.status]);
    let csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${c||''}"`).join(',')).join('\n');
    downloadFile(csv, 'gantt-timeline.csv', 'text/csv');
    showToast('CSV timeline diunduh');
};

window.exportVendorCSV = function() {
    if (!appData.vendor.length) return;
    const headers = ['Nama Vendor', 'Jumlah Kontrak', 'Tepat Waktu (%)', 'Kualitas (%)', 'Rating'];
    const rows = appData.vendor.map(v => [v.nama, v.kontrak, v.tepatWaktu, v.kualitas, v.rating]);
    let csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    downloadFile(csv, 'vendor-kinerja.csv', 'text/csv');
    showToast('CSV vendor diunduh');
};

window.exportCSVAll = function() {
    if (!appData.paket.length) return;
    const headers = ['ID', 'Nama Paket', 'Unit', 'Jenis', 'PIC', 'Target', 'Progress', 'Status', 'Nilai', 'Vendor', 'Risiko'];
    const rows = appData.paket.map(p => [p.id, p.nama, p.unit, p.jenis, p.pic, p.target, p.progress+'%', p.status, p.nilai, p.vendor, p.risiko]);
    let csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${c||''}"`).join(',')).join('\n');
    downloadFile(csv, 'semua-paket.csv', 'text/csv');
    showToast('CSV semua data diunduh');
};

window.exportJSON = function() {
    const exportData = { exported_at: new Date().toISOString(), kpi: appData.kpi, paket: appData.paket, vendor: appData.vendor, nilai_bulanan: appData.nilaiBulanan };
    downloadFile(JSON.stringify(exportData, null, 2), 'dashboard-data.json', 'application/json');
    showToast('JSON diunduh');
};

window.exportPDF = function() { showToast('Membuka dialog cetak...'); setTimeout(() => window.print(), 500); };
window.exportXLSX = exportTableExcel;
window.downloadChart = function(canvasId, filename) {
    const canvas = document.getElementById(canvasId);
    if (canvas) { const link = document.createElement('a'); link.download = (filename || canvasId) + '.png'; link.href = canvas.toDataURL(); link.click(); showToast('Chart diunduh sebagai PNG'); }
};
window.copyText = (text) => { navigator.clipboard?.writeText(text).then(() => showToast('Copied: '+text)).catch(() => prompt('Copy manually:', text)); };
window.showExportModal = () => document.getElementById('exportModal')?.classList.add('open');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('open');

// ============================================================
// IMPORT SYSTEM v3 — satu definisi, tidak ada konflik
// ============================================================
let _importFile = null;

window.showImportModal = function() {
    console.log('[Import] showImportModal called');
    const modal = document.getElementById('importModal');
    if (!modal) { console.error('[Import] #importModal not found'); return; }
    modal.classList.add('open');

    // Reset
    _importFile = null;
    _importSetBtn(false);
    _importSetMsg('');
    _importSetPreview(false);
    const fi = document.getElementById('fileInput');
    if (fi) fi.value = '';

    // Re-clone drop zone to remove old event listeners
    const oldZone = modal.querySelector('.import-upload');
    if (!oldZone) { console.error('[Import] .import-upload not found inside modal'); return; }
    const zone = oldZone.cloneNode(true);
    oldZone.parentNode.replaceChild(zone, oldZone);

    // Click → open file picker
    zone.addEventListener('click', function(e) {
        console.log('[Import] zone clicked');
        document.getElementById('fileInput')?.click();
    });

    // Drag over
    zone.addEventListener('dragenter', function(e) {
        e.preventDefault(); e.stopPropagation();
        zone.style.borderColor = '#4f7ef7';
        zone.style.background  = 'rgba(79,126,247,0.10)';
        console.log('[Import] dragenter');
    });
    zone.addEventListener('dragover', function(e) {
        e.preventDefault(); e.stopPropagation();
        zone.style.borderColor = '#4f7ef7';
        zone.style.background  = 'rgba(79,126,247,0.10)';
    });
    zone.addEventListener('dragleave', function(e) {
        zone.style.borderColor = '';
        zone.style.background  = '';
        console.log('[Import] dragleave');
    });
    zone.addEventListener('drop', function(e) {
        e.preventDefault(); e.stopPropagation();
        zone.style.borderColor = '';
        zone.style.background  = '';
        const file = e.dataTransfer.files[0];
        console.log('[Import] drop:', file ? file.name : 'NO FILE');
        if (file) _importHandleFile(file);
    });

    console.log('[Import] modal open, drop zone ready');
};

// Called by <input onchange="handleFileSelect(event)">
window.handleFileSelect = function(event) {
    const file = event.target.files[0];
    console.log('[Import] handleFileSelect:', file ? file.name : 'NO FILE');
    if (file) _importHandleFile(file);
};

// Called by Import button
window.processImport = async function() {
    if (!_importFile) {
        _importSetMsg('Tidak ada file yang dipilih.', 'error');
        return;
    }
    const btn = document.getElementById('importBtn');
    if (btn) { btn.textContent = '⏳ Mengupload...'; btn.disabled = true; }

    try {
        const fd = new FormData();
        fd.append('file', _importFile);

        console.log('[Import] Uploading to /api/upload-excel...');
        const resp = await fetch('/api/upload-excel', { method: 'POST', body: fd });
        let result;
        try { result = await resp.json(); }
        catch(e) { throw new Error('Server tidak merespons JSON'); }

        console.log('[Import] Server response:', result);

        if (resp.ok && result.status === 'success') {
            _importSetMsg('✅ Import berhasil! Memuat ulang data...', 'success');
            _importSetBtn(false);
            setTimeout(async () => {
                try {
                    await loadAllData();
                    await initChartsFromAPI();
                } catch(e) { console.error('[Import] Reload error:', e); }
                window.closeModal('importModal');
                showToast('✅ Data Excel berhasil diimport!');
            }, 1000);
        } else {
            _importSetMsg('❌ Gagal: ' + (result.detail || result.message || 'Error tidak diketahui'), 'error');
        }
    } catch(err) {
        console.error('[Import] Upload error:', err);
        _importSetMsg('❌ ' + err.message, 'error');
    } finally {
        if (btn) { btn.textContent = '🚀 Import ke Dashboard'; btn.disabled = false; }
    }
};

function _importHandleFile(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        _importSetMsg('Format tidak didukung. Gunakan .xlsx, .xls, atau .csv', 'error');
        return;
    }
    _importFile = file;
    _importSetMsg('📄 ' + file.name + ' (' + _importFmtSize(file.size) + ') — sedang dibaca...', 'info');

    if (name.endsWith('.csv')) {
        const r = new FileReader();
        r.onload = function(e) { _importShowPreview(_importParseCSV(e.target.result), file.name); };
        r.onerror = function() { _importSetMsg('Gagal membaca file CSV.', 'error'); };
        r.readAsText(file);
    } else {
        const r = new FileReader();
        r.onload = function(e) {
            try {
                const wb  = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const sn  = wb.SheetNames.find(function(s){ return /paket|data/i.test(s); }) || wb.SheetNames[0];
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
                console.log('[Import] Excel parsed:', wb.SheetNames.length, 'sheets,', rows.length, 'rows from', sn);
                _importShowPreview(rows, file.name + ' [sheet: ' + sn + ']');
            } catch(err) {
                console.error('[Import] XLSX parse error:', err);
                _importSetMsg('Gagal membaca Excel: ' + err.message, 'error');
            }
        };
        r.onerror = function() { _importSetMsg('Gagal membaca file Excel.', 'error'); };
        r.readAsArrayBuffer(file);
    }
}

function _importShowPreview(rows, label) {
    if (!rows || !rows.length) {
        _importSetMsg('File tidak berisi data yang bisa dibaca.', 'error');
        return;
    }
    const headers = Object.keys(rows[0]);
    let html = '<div style="font-size:12px;color:#8b92a8;margin-bottom:8px">'
             + 'Preview: <strong style="color:#fff">' + rows.length + ' baris</strong>'
             + ' × <strong style="color:#fff">' + headers.length + ' kolom</strong>'
             + ' — <em>' + label + '</em></div>'
             + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">'
             + '<thead><tr style="background:#23283a">';
    headers.slice(0, 7).forEach(function(h) {
        html += '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.07);color:#c8cfe0;font-weight:500;white-space:nowrap">' + h + '</th>';
    });
    if (headers.length > 7) html += '<th style="padding:6px 8px;color:#8b92a8">+' + (headers.length - 7) + '</th>';
    html += '</tr></thead><tbody>';
    rows.slice(0, 5).forEach(function(row, i) {
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)' + (i % 2 === 0 ? ';background:#181c29' : '') + '">';
        headers.slice(0, 7).forEach(function(h) {
            const v = String(row[h] !== undefined ? row[h] : '').substring(0, 30);
            html += '<td style="padding:5px 8px;color:#c8cfe0">' + (v || '<span style="color:#555">—</span>') + '</td>';
        });
        if (headers.length > 7) html += '<td style="padding:5px 8px;color:#555">...</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (rows.length > 5) html += '<div style="font-size:11px;color:#8b92a8;margin-top:4px">... dan ' + (rows.length - 5) + ' baris lainnya</div>';

    _importSetPreview(true, html);
    _importSetMsg('✅ File siap. Klik <strong>Import ke Dashboard</strong> untuk lanjut.', 'success');
    _importSetBtn(true);
}

function _importSetPreview(show, html) {
    const el = document.getElementById('importPreview');
    if (!el) return;
    el.style.display = show ? 'block' : 'none';
    if (html !== undefined) el.innerHTML = html;
}
function _importSetMsg(html, type) {
    const el = document.getElementById('importMessage');
    if (!el) return;
    if (!html) { el.style.display = 'none'; return; }
    const c = type === 'error' ? '#f74f4f' : type === 'success' ? '#22c97a' : '#4f7ef7';
    el.style.cssText = 'display:block;margin-top:10px;padding:10px 14px;'
        + 'background:' + c + '18;border-left:3px solid ' + c + ';'
        + 'color:' + c + ';font-size:12px;border-radius:4px;line-height:1.6';
    el.innerHTML = html;
}
function _importSetBtn(show) {
    const el = document.getElementById('importBtn');
    if (el) el.style.display = show ? 'inline-block' : 'none';
}
function _importFmtSize(b) {
    return b < 1024 ? b + 'B' : b < 1048576 ? (b/1024).toFixed(1) + 'KB' : (b/1048576).toFixed(1) + 'MB';
}
function _importParseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(function(h){ return h.trim().replace(/^"|"$/g, ''); });
    return lines.slice(1).map(function(line) {
        const vals = line.split(',').map(function(v){ return v.trim().replace(/^"|"$/g, ''); });
        const row  = {};
        headers.forEach(function(h, i) { row[h] = vals[i] !== undefined ? vals[i] : ''; });
        return row;
    }).filter(function(r){ return Object.values(r).some(function(v){ return v !== ''; }); });
}


// Export table functions
window.exportTableCSV = exportTableCSV;
window.exportTableExcel = exportTableExcel;

// Make all functions globally available
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.applyFilters = applyFilters;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.setPeriod = setPeriod;
window.filterByMonth = filterByMonth;
window.filterPaketPage = filterPaketPage;
window.filterMonitoringPage = filterMonitoringPage;
window.showPage = showPage;