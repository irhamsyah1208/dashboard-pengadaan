// ============================================================
// INTEGRATIONS.JS — Excel, Power BI, Looker Studio, Internal API
// ============================================================

// =================== EXCEL EXPORT ===================
function exportXLSX() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap'); return; }
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data Paket
  const paketRows = DB.paket.map(p => ({
    'ID Paket': p.id,
    'Nama Paket': p.nama,
    'Unit Kerja': p.unit,
    'Jenis': p.jenis,
    'PIC': p.pic,
    'Target Selesai': p.target,
    'Realisasi': p.realisasi || '',
    'Progress (%)': p.progress,
    'Nilai (Juta Rp)': p.nilai,
    'Vendor': p.vendor,
    'Status': p.status,
    'Risiko': p.risiko,
    'Keterangan': p.ket
  }));
  const ws1 = XLSX.utils.json_to_sheet(paketRows);
  ws1['!cols'] = [
    {wch:8},{wch:32},{wch:22},{wch:12},{wch:16},
    {wch:14},{wch:12},{wch:12},{wch:14},{wch:18},
    {wch:14},{wch:10},{wch:30}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Data Paket');

  // Sheet 2: Vendor
  const vendorRows = DB.vendor.map(v => ({
    'Nama Vendor': v.nama,
    'Jumlah Kontrak': v.kontrak,
    'Tepat Waktu (%)': v.tepatWaktu,
    'Kualitas (%)': v.kualitas,
    'Rating (1-5)': v.rating
  }));
  const ws2 = XLSX.utils.json_to_sheet(vendorRows);
  ws2['!cols'] = [{wch:22},{wch:16},{wch:16},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Kinerja Vendor');

  // Sheet 3: Nilai Bulanan (siap pivot)
  const nilaiRows = DB.nilaiBulanan.labels.map((bln, i) => ({
    'Bulan': bln,
    'Unit A - Keuangan (M)': DB.nilaiBulanan.unitA[i],
    'Unit B - Infrastruktur (M)': DB.nilaiBulanan.unitB[i],
    'Unit C - Teknologi (M)': DB.nilaiBulanan.unitC[i],
    'Total (M)': +(DB.nilaiBulanan.unitA[i] + DB.nilaiBulanan.unitB[i] + DB.nilaiBulanan.unitC[i]).toFixed(1)
  }));
  const ws3 = XLSX.utils.json_to_sheet(nilaiRows);
  ws3['!cols'] = [{wch:8},{wch:22},{wch:24},{wch:22},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Nilai Bulanan');

  // Sheet 4: KPI Summary
  const kpiRows = [
    { Indikator: 'Total Paket Pengadaan', Nilai: DB.kpi.total, Satuan: 'Paket' },
    { Indikator: 'Dalam Proses', Nilai: DB.kpi.proses, Satuan: 'Paket' },
    { Indikator: 'Selesai', Nilai: DB.kpi.selesai, Satuan: 'Paket' },
    { Indikator: 'Terlambat', Nilai: DB.kpi.terlambat, Satuan: 'Paket' },
    { Indikator: 'On-Time Delivery', Nilai: DB.kpi.onTime, Satuan: '%' },
    { Indikator: 'Total Nilai Pengadaan', Nilai: 24.6, Satuan: 'Miliar Rp' },
  ];
  const ws4 = XLSX.utils.json_to_sheet(kpiRows);
  ws4['!cols'] = [{wch:28},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws4, 'KPI Summary');

  const fname = 'Dashboard_Pengadaan_' + new Date().toISOString().slice(0,10) + '.xlsx';
  XLSX.writeFile(wb, fname);
  showToast('File Excel berhasil diunduh: ' + fname);
  closeModal('exportModal');
}

// =================== CSV EXPORTS ===================
function exportCSVAll() {
  downloadFile(dbToCSV(DB.paket), 'pengadaan-paket-' + today() + '.csv', 'text/csv');
  showToast('CSV semua paket diunduh');
  closeModal('exportModal');
}

function exportTableCSV() {
  const rows = getFilteredPaket();
  downloadFile(dbToCSV(rows), 'paket-filtered-' + today() + '.csv', 'text/csv');
  showToast('CSV tabel monitoring diunduh');
}

function exportGanttCSV() {
  const rows = DB.paket.slice(0,8).map(p => ({
    id: p.id, nama: p.nama, unit: p.unit, target: p.target,
    realisasi: p.realisasi||'', progress: p.progress, status: p.status
  }));
  const csv = 'ID,Nama,Unit,Target,Realisasi,Progress,Status\n' +
    rows.map(r => `${r.id},"${r.nama}","${r.unit}",${r.target},${r.realisasi},${r.progress},${r.status}`).join('\n');
  downloadFile(csv, 'timeline-' + today() + '.csv', 'text/csv');
  showToast('CSV timeline diunduh');
}

function exportVendorCSV() {
  downloadFile(vendorToCSV(DB.vendor), 'vendor-kinerja-' + today() + '.csv', 'text/csv');
  showToast('CSV vendor diunduh');
}

// =================== JSON EXPORT ===================
function exportJSON() {
  const payload = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    kpi: DB.kpi,
    paket: DB.paket,
    vendor: DB.vendor,
    nilai_bulanan: DB.nilaiBulanan
  };
  downloadFile(JSON.stringify(payload, null, 2), 'pengadaan-data-' + today() + '.json', 'application/json');
  showToast('JSON API payload diunduh');
  closeModal('exportModal');
}

// =================== PDF (print-triggered) ===================
function exportPDF() {
  closeModal('exportModal');
  showToast('Membuka dialog cetak PDF...');
  setTimeout(() => window.print(), 500);
}

// =================== INTEGRASI MODALS ===================
const integContent = {
  excel: {
    title: '📗 Integrasi Microsoft Excel',
    html: `
      <div class="integ-detail-section">
        <h4>Export Langsung</h4>
        <p style="font-size:12.5px;color:var(--text2);margin-bottom:12px">Klik tombol di bawah untuk mengunduh file Excel yang sudah dilengkapi 4 sheet dan siap untuk Pivot Table & Chart.</p>
        <button class="btn-export" onclick="exportXLSX();closeModal('integModal')">⬇ Download Excel (.xlsx)</button>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Cara Membuat Pivot Table di Excel</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Buka file Excel yang diunduh → pilih sheet <code>Data Paket</code></p></div>
          <div class="step"><div class="step-num">2</div><p>Klik sel mana saja dalam tabel → <strong>Insert → PivotTable</strong></p></div>
          <div class="step"><div class="step-num">3</div><p>Drag <code>Unit Kerja</code> ke Rows, <code>Status</code> ke Columns, <code>Nilai (Juta Rp)</code> ke Values (Sum)</p></div>
          <div class="step"><div class="step-num">4</div><p>Insert → PivotChart untuk visualisasi otomatis</p></div>
          <div class="step"><div class="step-num">5</div><p>Gunakan sheet <code>Nilai Bulanan</code> untuk trend chart garis per bulan</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Refresh Data Otomatis (Power Query)</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Data → Get Data → From Web → masukkan URL: <code>http://localhost:3000/api/v1/pengadaan/paket</code></p></div>
          <div class="step"><div class="step-num">2</div><p>Transform → Expand kolom sesuai kebutuhan → Load</p></div>
          <div class="step"><div class="step-num">3</div><p>Data → Refresh All untuk sinkronisasi data terbaru dari API</p></div>
        </div>
      </div>
    `
  },
  powerbi: {
    title: '🟡 Integrasi Power BI',
    html: `
      <div class="integ-detail-section">
        <h4>Koneksi via OData (Rekomendasi)</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Buka Power BI Desktop → Get Data → OData Feed</p></div>
          <div class="step"><div class="step-num">2</div><p>Masukkan URL: <code>http://your-server/api/v1/pengadaan/odata/Paket</code></p></div>
          <div class="step"><div class="step-num">3</div><p>Authentication: pilih <strong>Basic</strong> atau <strong>API Key</strong>, masukkan token dari panel API</p></div>
          <div class="step"><div class="step-num">4</div><p>Load semua tabel: <code>Paket</code>, <code>Vendor</code>, <code>NilaiBulanan</code></p></div>
          <div class="step"><div class="step-num">5</div><p>Buat relasi antar tabel di Model View, lalu buat visual sesuai kebutuhan</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Koneksi via REST API (JSON)</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Get Data → Web → masukkan endpoint: <code>/api/v1/pengadaan/summary</code></p></div>
          <div class="step"><div class="step-num">2</div><p>Di Advanced, tambahkan Header: <code>Authorization: Bearer &lt;API_KEY&gt;</code></p></div>
          <div class="step"><div class="step-num">3</div><p>Power Query akan parse JSON otomatis → Transform → Expand Records</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Scheduled Refresh (Power BI Service)</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Publish report ke Power BI Service</p></div>
          <div class="step"><div class="step-num">2</div><p>Settings → Datasets → Scheduled Refresh → atur frekuensi (misal: harian jam 07.00)</p></div>
          <div class="step"><div class="step-num">3</div><p>Pastikan gateway data sudah dikonfigurasi untuk koneksi ke server on-premise</p></div>
        </div>
      </div>
      <div class="api-panel" style="margin-top:12px">
        <div class="api-panel-title">Sample M Query (Power Query)</div>
        <div style="background:var(--bg);border-radius:6px;padding:12px;font-family:'DM Mono',monospace;font-size:11px;color:#4f7ef7;line-height:1.8;overflow-x:auto">
let<br>
&nbsp;&nbsp;Source = Json.Document(Web.Contents("http://your-server/api/v1/pengadaan/paket")),<br>
&nbsp;&nbsp;ToTable = Table.FromList(Source, Splitter.SplitByNothing()),<br>
&nbsp;&nbsp;Expanded = Table.ExpandRecordColumn(ToTable, "Column1", {"id","nama","unit","status","nilai","progress"})<br>
in<br>
&nbsp;&nbsp;Expanded
        </div>
      </div>
    `
  },
  looker: {
    title: '🔵 Integrasi Looker Studio (Google Data Studio)',
    html: `
      <div class="integ-detail-section">
        <h4>Metode 1: Google Sheets Connector (Paling Mudah)</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Download file CSV atau Excel dari dashboard ini</p></div>
          <div class="step"><div class="step-num">2</div><p>Upload ke Google Sheets → <strong>File → Import</strong></p></div>
          <div class="step"><div class="step-num">3</div><p>Buka <a href="https://lookerstudio.google.com" target="_blank" style="color:var(--blue)">Looker Studio</a> → Create Report → Add Data → Google Sheets</p></div>
          <div class="step"><div class="step-num">4</div><p>Pilih spreadsheet yang sudah diupload → Connect</p></div>
          <div class="step"><div class="step-num">5</div><p>Untuk refresh otomatis: gunakan Google Apps Script untuk sync data dari API setiap hari</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Metode 2: JSON/CSV Connector Langsung</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Di Looker Studio → Add Data → pilih connector <strong>JSON/CSV/XML</strong></p></div>
          <div class="step"><div class="step-num">2</div><p>Masukkan URL endpoint: <code>http://your-server/api/v1/pengadaan/paket</code></p></div>
          <div class="step"><div class="step-num">3</div><p>Atur header autentikasi jika diperlukan</p></div>
          <div class="step"><div class="step-num">4</div><p>Map kolom data → Create Report</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Apps Script Auto-Sync (Jadwal Harian)</h4>
        <div style="background:var(--bg);border-radius:6px;padding:12px;font-family:'DM Mono',monospace;font-size:11px;color:#22c97a;line-height:1.8;overflow-x:auto">
function syncPengadaan() {<br>
&nbsp;&nbsp;const url = 'http://your-server/api/v1/pengadaan/paket';<br>
&nbsp;&nbsp;const res = UrlFetchApp.fetch(url, {headers:{Authorization:'Bearer API_KEY'}});<br>
&nbsp;&nbsp;const data = JSON.parse(res.getContentText());<br>
&nbsp;&nbsp;const sheet = SpreadsheetApp.getActiveSheet();<br>
&nbsp;&nbsp;sheet.clearContents();<br>
&nbsp;&nbsp;sheet.appendRow(Object.keys(data[0]));<br>
&nbsp;&nbsp;data.forEach(row => sheet.appendRow(Object.values(row)));<br>
}
        </div>
        <p style="font-size:11px;color:var(--text2);margin-top:8px">Atur trigger: Extensions → Apps Script → Triggers → Time-driven → Daily</p>
      </div>
    `
  },
  internal: {
    title: '🟣 Integrasi Sistem Internal (ERP/SIPD)',
    html: `
      <div class="integ-detail-section">
        <h4>REST API Endpoints</h4>
        <p style="font-size:12px;color:var(--text2);margin-bottom:10px">Semua endpoint mengembalikan JSON. Autentikasi menggunakan Bearer Token.</p>
        <div class="api-endpoints">
          <div class="api-row"><span class="api-method get">GET</span><code>/api/v1/pengadaan/paket</code><span class="api-desc">Semua paket + filter</span></div>
          <div class="api-row"><span class="api-method get">GET</span><code>/api/v1/pengadaan/paket/:id</code><span class="api-desc">Detail satu paket</span></div>
          <div class="api-row"><span class="api-method post">POST</span><code>/api/v1/pengadaan/paket</code><span class="api-desc">Tambah paket baru</span></div>
          <div class="api-row"><span class="api-method get">GET</span><code>/api/v1/pengadaan/summary</code><span class="api-desc">Data KPI dashboard</span></div>
          <div class="api-row"><span class="api-method post">POST</span><code>/api/v1/pengadaan/webhook</code><span class="api-desc">Subscribe notifikasi push</span></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Contoh Request (cURL)</h4>
        <div style="background:var(--bg);border-radius:6px;padding:12px;font-family:'DM Mono',monospace;font-size:11px;color:#f7a74f;line-height:1.8;overflow-x:auto">
curl -X GET "http://your-server/api/v1/pengadaan/paket?status=Terlambat&unit=Unit+C" \<br>
&nbsp;&nbsp;-H "Authorization: Bearer pk_live_demo1234567890abcdef" \<br>
&nbsp;&nbsp;-H "Content-Type: application/json"
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Webhook Notifikasi</h4>
        <div class="step-list">
          <div class="step"><div class="step-num">1</div><p>Register webhook URL sistem internal Anda ke endpoint <code>POST /api/v1/pengadaan/webhook</code></p></div>
          <div class="step"><div class="step-num">2</div><p>Payload event: <code>paket.terlambat</code>, <code>paket.selesai</code>, <code>kontrak.berakhir</code>, <code>paket.baru</code></p></div>
          <div class="step"><div class="step-num">3</div><p>Sistem internal akan menerima POST request JSON setiap event terjadi secara real-time</p></div>
        </div>
      </div>
      <div class="integ-detail-section" style="margin-top:20px">
        <h4>Contoh Response JSON</h4>
        <div style="background:var(--bg);border-radius:6px;padding:12px;font-family:'DM Mono',monospace;font-size:11px;color:#e8eaf0;line-height:1.8;overflow-x:auto">
{<br>
&nbsp;&nbsp;"status": "success",<br>
&nbsp;&nbsp;"data": [<br>
&nbsp;&nbsp;&nbsp;&nbsp;{ "id": "PKT001", "nama": "Pengadaan Server", "status": "Terlambat",<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"progress": 90, "nilai": 4800, "risiko": "Tinggi" }<br>
&nbsp;&nbsp;],<br>
&nbsp;&nbsp;"meta": { "total": 48, "page": 1, "per_page": 20 }<br>
}
        </div>
      </div>
    `
  }
};

function showIntegModal(type) {
  const content = integContent[type];
  if (!content) return;
  document.getElementById('integModalTitle').innerHTML = content.title +
    '<button class="modal-close" onclick="closeModal(\'integModal\')">✕</button>';
  document.getElementById('integModalBody').innerHTML = content.html;
  document.getElementById('integModal').classList.add('open');
}

// =================== UTILS ===================
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0,10);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Disalin: ' + text));
}

function toggleApiKey() {
  const el = document.getElementById('apiKeyDisplay');
  if (!el) return;
  if (el.textContent.includes('•')) {
    el.textContent = 'pk_live_demo1234567890abcdef';
  } else {
    el.textContent = 'pk_live_••••••••••••••••••';
  }
}
