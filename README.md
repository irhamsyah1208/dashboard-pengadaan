# Dashboard Monitoring Pengadaan — Web App

Dashboard web monitoring pengadaan lengkap dengan integrasi Excel, Power BI, Looker Studio, dan sistem internal.

## Struktur Proyek

```
dashboard-pengadaan/
├── index.html              ← Halaman utama dashboard
├── css/
│   └── style.css           ← Semua styling
├── js/
│   ├── data.js             ← Data & konversi CSV/JSON
│   ├── charts.js           ← Chart.js: donut, bar, gantt, vendor
│   ├── integrations.js     ← Export: Excel, CSV, JSON, PDF; Modal integrasi
│   └── app.js              ← UI logic: tabel, filter, sort, alert, refresh
├── api/
│   └── server.js           ← Node.js REST API server (opsional)
└── README.md
```

## Cara Menjalankan

### Opsi 1 — Buka langsung (tanpa server)
Buka `index.html` di browser. Semua fitur export (Excel, CSV, JSON) berjalan client-side.

### Opsi 2 — Dengan Node.js API server
```bash
cd dashboard-pengadaan
npm install express cors helmet
node api/server.js
# Buka http://localhost:3000
```

## Fitur Utama

| Fitur | Keterangan |
|---|---|
| 6 KPI Cards | Total paket, proses, selesai, terlambat, nilai, on-time |
| Donut Chart | Distribusi status pengadaan |
| Bar Chart | Nilai pengadaan per bulan per unit |
| Gantt Chart | Progress & timeline semua paket |
| Tabel Monitoring | Sortable, searchable, color-coded status |
| Vendor Performance | Tabel + bar chart kinerja vendor |
| Top 5 Paket | Nilai terbesar + tingkat risiko |
| Alert Banner | Notifikasi keterlambatan real-time |
| Auto-refresh | Countdown 30 detik |
| Filter | Unit, jenis, status — semua terintegrasi |

## Integrasi

### Microsoft Excel
- **Export langsung**: Tombol Export → Excel → unduh `.xlsx` 4 sheet (Data Paket, Vendor, Nilai Bulanan, KPI Summary)
- **Power Query**: Data → Get Data → From Web → masukkan URL API (`/api/v1/pengadaan/paket`)
- **Pivot Table**: Gunakan sheet "Data Paket" → Insert → PivotTable

### Power BI
- **OData**: Get Data → OData Feed → `http://localhost:3000/api/v1/pengadaan/odata/Paket`
- **REST**: Get Data → Web → masukkan endpoint dengan header `Authorization: Bearer <API_KEY>`
- **Refresh**: Power BI Service → Scheduled Refresh → atur frekuensi (harian/jam)

### Looker Studio (Google Data Studio)
- **Google Sheets**: Export CSV → Upload ke Google Sheets → Looker Studio → Add Data → Google Sheets
- **JSON Direct**: Add Data → JSON/CSV → masukkan URL API
- **Apps Script Auto-sync**: Gunakan script di panel Integrasi dashboard untuk sync otomatis harian

### Sistem Internal (ERP/SIPD)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/pengadaan/summary` | KPI ringkasan |
| GET | `/api/v1/pengadaan/paket` | Daftar paket + filter |
| GET | `/api/v1/pengadaan/paket/:id` | Detail satu paket |
| POST | `/api/v1/pengadaan/paket` | Tambah paket baru |
| GET | `/api/v1/pengadaan/vendor` | Kinerja vendor |
| GET | `/api/v1/pengadaan/nilai` | Nilai per bulan |
| GET | `/api/v1/pengadaan/odata/Paket` | OData untuk Power BI |
| POST | `/api/v1/pengadaan/webhook` | Daftar webhook push |

**Autentikasi**: `Authorization: Bearer pk_live_<API_KEY>`

## Mengganti Data dari Database Nyata

Di `js/data.js`, ubah variabel `DB.paket` menjadi fetch dari API:
```javascript
// Ganti ini:
const DB = { paket: [...] }

// Menjadi:
const DB = {};
fetch('/api/v1/pengadaan/paket', {
  headers: { Authorization: 'Bearer ' + API_KEY }
})
.then(r => r.json())
.then(json => {
  DB.paket = json.data;
  renderMonitorTable(DB.paket);
  // ... render semua komponen
});
```

## Koneksi Database (server.js)

Ganti array `samplePaket` di `api/server.js` dengan query database:
```javascript
// PostgreSQL
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/api/v1/pengadaan/paket', async (req, res) => {
  const result = await pool.query('SELECT * FROM paket WHERE status = $1', [req.query.status]);
  res.json({ status: 'success', data: result.rows });
});

// MySQL
const mysql = require('mysql2/promise');
// ...

// MongoDB
const { MongoClient } = require('mongodb');
// ...
```

## Teknologi
- HTML5 / CSS3 / Vanilla JavaScript
- Chart.js 4.4.1
- SheetJS (xlsx) 0.18.5
- Node.js + Express (API server, opsional)
- Google Fonts: DM Sans + DM Mono
