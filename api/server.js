/**
 * API SERVER — Dashboard Monitoring Pengadaan v4
 * Data: SQLite (di-sync dari Excel secara dinamis)
 * Fitur baru:
 *   - Auto-detect kolom dari schema_meta
 *   - Endpoint nilai_bulanan sadar bulan kosong
 *   - Endpoint schema untuk debug
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { exec } = require('child_process');
const sqlite3  = require('sqlite3').verbose();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database ────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'pengadaan.db');
const db = new sqlite3.Database(DB_PATH, err => {
    if (err) console.error('❌ DB error:', err);
    else     console.log('✅ Connected to SQLite:', DB_PATH);
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNilai(n) {
    n = Number(n) || 0;
    return n >= 1000 ? `Rp ${(n/1000).toFixed(1)} M` : `Rp ${n} jt`;
}

function dbAll(sql, params=[]) {
    return new Promise((res, rej) => db.all(sql, params, (e,r) => e ? rej(e) : res(r)));
}
function dbGet(sql, params=[]) {
    return new Promise((res, rej) => db.get(sql, params, (e,r) => e ? rej(e) : res(r)));
}
function dbRun(sql, params=[]) {
    return new Promise((res, rej) => db.run(sql, params, function(e){ e ? rej(e) : res(this); }));
}

// Check if table exists
async function tableExists(name) {
    const r = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]);
    return !!r;
}

// Get column names for a table
async function getColumns(tableName) {
    const rows = await dbAll(`PRAGMA table_info(${tableName})`);
    return rows.map(r => r.name);
}

// ── API: Health ──────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    const hasMeta = await tableExists('schema_meta');
    let lastSync  = null;
    if (hasMeta) {
        const r = await dbGet("SELECT MAX(synced_at) as last FROM schema_meta");
        lastSync = r?.last || null;
    }
    res.json({ status:'ok', timestamp:new Date().toISOString(), lastSync });
});

// ── API: Schema (debug) ──────────────────────────────────────────────────────
app.get('/api/schema', async (req, res) => {
    try {
        const hasMeta = await tableExists('schema_meta');
        if (!hasMeta) return res.json({ status:'success', data:[] });
        const rows = await dbAll("SELECT * FROM schema_meta ORDER BY table_name, id");
        res.json({ status:'success', data:rows });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── API: Summary / KPI ───────────────────────────────────────────────────────
app.get('/api/v1/pengadaan/summary', async (req, res) => {
    try {
        const hasPaket = await tableExists('paket');
        const hasKpi   = await tableExists('kpi_summary');

        let data = {};

        if (hasKpi) {
            // Use KPI Summary sheet data first
            const kpiRows = await dbAll("SELECT indikator, nilai FROM kpi_summary");
            const kpi     = {};
            kpiRows.forEach(r => { kpi[r.indikator?.toLowerCase()] = r.nilai; });
            data = {
                total:          kpiRows.find(r=>r.indikator?.toLowerCase().includes('total paket'))?.nilai || 0,
                proses:         kpiRows.find(r=>r.indikator?.toLowerCase().includes('proses'))?.nilai || 0,
                selesai:        kpiRows.find(r=>r.indikator?.toLowerCase().includes('selesai'))?.nilai || 0,
                terlambat:      kpiRows.find(r=>r.indikator?.toLowerCase().includes('terlambat'))?.nilai || 0,
                onTimePercent:  kpiRows.find(r=>r.indikator?.toLowerCase().includes('on-time')||r.indikator?.toLowerCase().includes('ontime'))?.nilai || 0,
                nilaiTotal:     (kpiRows.find(r=>r.indikator?.toLowerCase().includes('nilai')||r.indikator?.toLowerCase().includes('miliar'))?.nilai || 0) * 1000,
            };
        }

        if (hasPaket) {
            // Fallback / cross-check from paket table
            const totalRow   = await dbGet("SELECT COUNT(*) as c FROM paket");
            const selesaiRow = await dbGet("SELECT COUNT(*) as c FROM paket WHERE status='Selesai'");
            const terlambRow = await dbGet("SELECT COUNT(*) as c FROM paket WHERE status='Terlambat'");
            const nilaiRow   = await dbGet("SELECT SUM(nilai) as s FROM paket");
            const tot = totalRow?.c || 0;
            const sel = selesaiRow?.c || 0;
            // Only override if KPI sheet wasn't found
            if (!hasKpi) {
                data = {
                    total:         tot,
                    selesai:       sel,
                    terlambat:     terlambRow?.c || 0,
                    proses:        tot - sel - (terlambRow?.c || 0),
                    onTimePercent: tot > 0 ? Math.round(sel/tot*100) : 0,
                    nilaiTotal:    nilaiRow?.s || 0,
                };
            }
        }

        data.nilaiTotalFormatted = formatNilai(data.nilaiTotal || 0);
        data.updatedAt = new Date().toISOString();

        res.json({ status:'success', data });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── API: Paket (dinamis, pakai kolom apa adanya) ─────────────────────────────
app.get('/api/v1/pengadaan/paket', async (req, res) => {
    try {
        if (!(await tableExists('paket'))) {
            return res.json({ status:'success', data:[] });
        }
        const { status, unit, jenis } = req.query;
        let q = "SELECT * FROM paket WHERE 1=1";
        const p = [];
        if (status) { q += " AND status=?";      p.push(status); }
        if (unit)   { q += " AND unit LIKE ?";   p.push(`%${unit}%`); }
        if (jenis)  { q += " AND jenis=?";       p.push(jenis); }
        q += " ORDER BY id";
        const rows = await dbAll(q, p);
        const data = rows.map(r => ({
            ...r,
            nilai_formatted: formatNilai(r.nilai)
        }));
        res.json({ status:'success', data });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── API: Vendor ───────────────────────────────────────────────────────────────
app.get('/api/v1/pengadaan/vendor', async (req, res) => {
    try {
        if (!(await tableExists('vendor'))) {
            return res.json({ status:'success', data:[] });
        }
        const rows = await dbAll("SELECT id,nama,kontrak,tepat_waktu as tepatWaktu,kualitas,rating FROM vendor ORDER BY rating DESC");
        res.json({ status:'success', data:rows });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── API: Nilai Bulanan ── UTAMA: sadar bulan kosong ──────────────────────────
app.get('/api/v1/pengadaan/nilai', async (req, res) => {
    try {
        if (!(await tableExists('nilai_bulanan'))) {
            return res.json({ status:'success', data:{ labels:[], series:[], emptyMonths:[] } });
        }

        const rows = await dbAll("SELECT * FROM nilai_bulanan ORDER BY id");
        if (!rows.length) {
            return res.json({ status:'success', data:{ labels:[], series:[], emptyMonths:[] } });
        }

        // Get schema meta untuk label unit yang bagus
        const hasMeta = await tableExists('schema_meta');
        let colLabels = {};  // safe_col → original_header
        if (hasMeta) {
            const meta = await dbAll("SELECT physical_col, original_header FROM schema_meta WHERE table_name='nilai_bulanan'");
            meta.forEach(m => { colLabels[m.physical_col] = m.original_header; });
        }

        // Exclude non-data cols
        const skip = new Set(['id','bulan','has_data','synced_at']);
        const valueCols = Object.keys(rows[0]).filter(k => !skip.has(k));

        const labels      = rows.map(r => r.bulan);
        const emptyMonths = rows.filter(r => r.has_data === 0).map(r => r.bulan);

        // Build series — for empty months, value is null (tidak di-hitung)
        const series = valueCols.map(col => ({
            unit:   colLabels[col] || col,
            values: rows.map(r => r.has_data === 0 ? null : (Number(r[col]) || 0)),
            // emptyIndices untuk keperluan tooltip
            emptyIndices: rows.map((r,i) => r.has_data === 0 ? i : -1).filter(i => i >= 0)
        }));

        res.json({
            status:'success',
            data:{ labels, series, emptyMonths }
        });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── API: KPI Raw ─────────────────────────────────────────────────────────────
app.get('/api/v1/pengadaan/kpi', async (req, res) => {
    try {
        if (!(await tableExists('kpi_summary'))) {
            return res.json({ status:'success', data:[] });
        }
        const rows = await dbAll("SELECT * FROM kpi_summary ORDER BY id");
        res.json({ status:'success', data:rows });
    } catch(e) {
        res.status(500).json({ status:'error', message:e.message });
    }
});

// ── Upload & Sync Excel ───────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits:{ fileSize: 20*1024*1024 } });

app.post('/api/upload-excel', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status:'error', message:'Tidak ada file yang diupload' });
    }

    const filePath   = req.file.path;
    const scriptPath = path.join(__dirname, '../sync_any_excel_to_sqlite.py');
    const dbArg      = DB_PATH;

    console.log(`📂 Processing: ${filePath}`);

    exec(`python "${scriptPath}" "${filePath}" "${dbArg}"`,
         { timeout: 120000 },
         (error, stdout, stderr) => {
             fs.unlink(filePath, ()=>{});

             if (error) {
                 console.error('❌ Sync error:', stderr);
                 return res.status(500).json({
                     status:'error',
                     message:'Gagal memproses file Excel',
                     detail: stderr
                 });
             }

             console.log('✅ Sync completed');
             res.json({
                 status:'success',
                 message:'Data berhasil diimport dan disync ke database',
                 output: stdout,
                 synced_at: new Date().toISOString()
             });
         }
    );
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   Dashboard Monitoring Pengadaan — API v4    ║
║   http://localhost:${PORT}                      ║
╠══════════════════════════════════════════════╣
║   Dynamic Schema + Empty-Month Detection     ║
║   Status: READY                              ║
╚══════════════════════════════════════════════╝
    `);
});

module.exports = app;
