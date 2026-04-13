/**
 * API SERVER — Dashboard Monitoring Pengadaan v5
 * Database: better-sqlite3 (stabil untuk Railway)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Setup (better-sqlite3) ---
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'pengadaan.db');
const db = new Database(DB_PATH, { verbose: console.log });
console.log('✅ Connected to SQLite:', DB_PATH);

// --- Middleware ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// --- Helpers ---
function formatNilai(n) {
    n = Number(n) || 0;
    return n >= 1000 ? `Rp ${(n / 1000).toFixed(1)} M` : `Rp ${n} jt`;
}

function tableExists(name) {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
        return !!stmt.get(name);
    } catch (e) {
        return false;
    }
}

// --- API: Health ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API: Summary / KPI ---
app.get('/api/v1/pengadaan/summary', (req, res) => {
    try {
        const hasPaket = tableExists('paket');
        const hasKpi = tableExists('kpi_summary');
        let data = {};

        if (hasKpi) {
            const stmt = db.prepare("SELECT indikator, nilai FROM kpi_summary");
            const kpiRows = stmt.all();
            data = {
                total: kpiRows.find(r => r.indikator?.toLowerCase().includes('total paket'))?.nilai || 0,
                proses: kpiRows.find(r => r.indikator?.toLowerCase().includes('proses'))?.nilai || 0,
                selesai: kpiRows.find(r => r.indikator?.toLowerCase().includes('selesai'))?.nilai || 0,
                terlambat: kpiRows.find(r => r.indikator?.toLowerCase().includes('terlambat'))?.nilai || 0,
                onTimePercent: kpiRows.find(r => r.indikator?.toLowerCase().includes('on-time') || r.indikator?.toLowerCase().includes('ontime'))?.nilai || 0,
                nilaiTotal: (kpiRows.find(r => r.indikator?.toLowerCase().includes('nilai') || r.indikator?.toLowerCase().includes('miliar'))?.nilai || 0) * 1000,
            };
        }

        if (hasPaket) {
            const totalRow = db.prepare("SELECT COUNT(*) as c FROM paket").get();
            const selesaiRow = db.prepare("SELECT COUNT(*) as c FROM paket WHERE status='Selesai'").get();
            const terlambRow = db.prepare("SELECT COUNT(*) as c FROM paket WHERE status='Terlambat'").get();
            const nilaiRow = db.prepare("SELECT SUM(nilai) as s FROM paket").get();
            const tot = totalRow?.c || 0;
            const sel = selesaiRow?.c || 0;
            if (!hasKpi) {
                data = {
                    total: tot,
                    selesai: sel,
                    terlambat: terlambRow?.c || 0,
                    proses: tot - sel - (terlambRow?.c || 0),
                    onTimePercent: tot > 0 ? Math.round(sel / tot * 100) : 0,
                    nilaiTotal: nilaiRow?.s || 0,
                };
            }
        }

        data.nilaiTotalFormatted = formatNilai(data.nilaiTotal || 0);
        data.updatedAt = new Date().toISOString();
        res.json({ status: 'success', data });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// --- API: Paket ---
app.get('/api/v1/pengadaan/paket', (req, res) => {
    try {
        if (!tableExists('paket')) {
            return res.json({ status: 'success', data: [] });
        }
        const { status, unit, jenis } = req.query;
        let q = "SELECT * FROM paket WHERE 1=1";
        const p = [];
        if (status) { q += " AND status=?"; p.push(status); }
        if (unit) { q += " AND unit LIKE ?"; p.push(`%${unit}%`); }
        if (jenis) { q += " AND jenis=?"; p.push(jenis); }
        q += " ORDER BY id";
        const stmt = db.prepare(q);
        const rows = stmt.all(...p);
        const data = rows.map(r => ({ ...r, nilai_formatted: formatNilai(r.nilai) }));
        res.json({ status: 'success', data });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// --- API: Vendor ---
app.get('/api/v1/pengadaan/vendor', (req, res) => {
    try {
        if (!tableExists('vendor')) {
            return res.json({ status: 'success', data: [] });
        }
        const stmt = db.prepare("SELECT id,nama,kontrak,tepat_waktu as tepatWaktu,kualitas,rating FROM vendor ORDER BY rating DESC");
        res.json({ status: 'success', data: stmt.all() });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// --- API: Nilai Bulanan ---
app.get('/api/v1/pengadaan/nilai', (req, res) => {
    try {
        if (!tableExists('nilai_bulanan')) {
            return res.json({ status: 'success', data: { labels: [], series: [], emptyMonths: [] } });
        }
        const stmt = db.prepare("SELECT * FROM nilai_bulanan ORDER BY id");
        const rows = stmt.all();
        if (!rows.length) {
            return res.json({ status: 'success', data: { labels: [], series: [], emptyMonths: [] } });
        }
        const skip = new Set(['id', 'bulan', 'has_data', 'synced_at']);
        const valueCols = Object.keys(rows[0]).filter(k => !skip.has(k));
        const labels = rows.map(r => r.bulan);
        const emptyMonths = rows.filter(r => r.has_data === 0).map(r => r.bulan);
        const series = valueCols.map(col => ({
            unit: col,
            values: rows.map(r => r.has_data === 0 ? null : (Number(r[col]) || 0))
        }));
        res.json({ status: 'success', data: { labels, series, emptyMonths } });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// --- Upload & Sync Excel ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/upload-excel', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'Tidak ada file yang diupload' });
    }
    const filePath = req.file.path;
    const scriptPath = path.join(__dirname, '../sync_any_excel_to_sqlite.py');
    const dbArg = DB_PATH;
    console.log(`📂 Processing: ${filePath}`);
    exec(`python3 "${scriptPath}" "${filePath}" "${dbArg}"`,
        { timeout: 120000 },
        (error, stdout, stderr) => {
            fs.unlink(filePath, () => { });
            if (error) {
                console.error('❌ Sync error:', stderr);
                return res.status(500).json({ status: 'error', message: 'Gagal memproses file Excel', detail: stderr });
            }
            console.log('✅ Sync completed');
            res.json({ status: 'success', message: 'Data berhasil diimport', synced_at: new Date().toISOString() });
        }
    );
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;