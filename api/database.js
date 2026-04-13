/**
 * DATABASE.JS — SQLite Connection & Schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Database connection
const dbPath = path.join(dataDir, 'pengadaan.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
db.serialize(() => {
    // Paket table
    db.run(`
        CREATE TABLE IF NOT EXISTS paket (
            id TEXT PRIMARY KEY,
            nama TEXT NOT NULL,
            unit TEXT NOT NULL,
            jenis TEXT NOT NULL,
            pic TEXT,
            target TEXT,
            realisasi TEXT,
            progress INTEGER DEFAULT 0,
            nilai REAL DEFAULT 0,
            vendor TEXT,
            status TEXT DEFAULT 'Perencanaan',
            risiko TEXT DEFAULT 'Rendah',
            ket TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Vendor table
    db.run(`
        CREATE TABLE IF NOT EXISTS vendor (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama TEXT UNIQUE NOT NULL,
            kontrak INTEGER DEFAULT 0,
            tepat_waktu INTEGER DEFAULT 0,
            kualitas INTEGER DEFAULT 0,
            rating REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Alerts table
    db.run(`
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            msg TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert sample data if tables are empty
    db.get("SELECT COUNT(*) as count FROM paket", (err, row) => {
        if (row.count === 0) {
            insertSampleData();
        }
    });
});

function insertSampleData() {
    const stmt = db.prepare(`
        INSERT INTO paket (id, nama, unit, jenis, pic, target, realisasi, progress, nilai, vendor, status, risiko, ket)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleData = [
        ['PKT001', 'Pengadaan Server Datacenter', 'Unit C - Teknologi', 'Barang', 'Andi Wijaya', '2026-03-31', '2026-04-15', 90, 4800, 'PT Maju Jaya', 'Terlambat', 'Tinggi', 'Vendor terlambat pengiriman'],
        ['PKT002', 'Jasa Kebersihan Kantor', 'Unit A - Keuangan', 'Jasa', 'Sari Melati', '2026-02-28', '2026-02-28', 100, 480, 'CV Bersih Indah', 'Selesai', 'Rendah', 'Selesai tepat waktu'],
        ['PKT003', 'Konstruksi Gedung Baru', 'Unit B - Infrastruktur', 'Konstruksi', 'Budi Santoso', '2026-06-30', null, 45, 12500, 'PT Bangun Nusa', 'Risiko', 'Tinggi', 'Progress di bawah target 10%'],
        ['PKT004', 'Lisensi Software ERP', 'Unit C - Teknologi', 'Jasa', 'Dewi Lestari', '2026-03-15', '2026-03-10', 100, 850, 'PT Tech Solusi', 'Selesai', 'Rendah', 'Selesai lebih awal'],
        ['PKT005', 'Renovasi Ruang Meeting', 'Unit A - Keuangan', 'Konstruksi', 'Rudi Hartono', '2026-05-20', null, 30, 320, 'CV Karya Abadi', 'On Track', 'Sedang', 'Sesuai rencana'],
    ];

    sampleData.forEach(row => stmt.run(row));
    stmt.finalize();

    // Insert sample vendors
    const vendorStmt = db.prepare(`INSERT INTO vendor (nama, kontrak, tepat_waktu, kualitas, rating) VALUES (?, ?, ?, ?, ?)`);
    [
        ['PT Maju Jaya', 8, 75, 85, 4.2],
        ['CV Karya Abadi', 5, 90, 88, 4.5],
        ['PT Bangun Nusa', 3, 60, 70, 3.5],
        ['PT Tech Solusi', 4, 80, 90, 4.3],
        ['CV Digital Pro', 6, 83, 87, 4.1],
        ['CV Bersih Indah', 2, 95, 92, 4.7],
    ].forEach(row => vendorStmt.run(row));
    vendorStmt.finalize();

    console.log('✅ Sample data inserted into SQLite database');
}

module.exports = db;