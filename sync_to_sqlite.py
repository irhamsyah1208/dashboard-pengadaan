import sqlite3
import pandas as pd
import os

# Koneksi ke SQLite
conn = sqlite3.connect('pengadaan.db')
cursor = conn.cursor()

# ========== BUAT TABEL DULU ==========
print("📦 Creating tables...")

# Tabel paket
cursor.execute("""
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
""")

# Tabel vendor
cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT UNIQUE NOT NULL,
        kontrak INTEGER DEFAULT 0,
        tepat_waktu INTEGER DEFAULT 0,
        kualitas INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
""")

# Tabel nilai_bulanan
cursor.execute("""
    CREATE TABLE IF NOT EXISTS nilai_bulanan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bulan TEXT NOT NULL,
        unit_a REAL DEFAULT 0,
        unit_b REAL DEFAULT 0,
        unit_c REAL DEFAULT 0,
        total REAL DEFAULT 0,
        tahun INTEGER DEFAULT 2026,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
""")

print("✅ Tables created")

# Baca file Excel (path sesuai dengan struktur lu)
file_path = "Dashboard_Pengadaan_2026-04-10.xlsx"

# Cek juga kemungkinan file di folder Assets
if not os.path.exists(file_path):
    file_path = "Assets/Dashboard_Pengadaan_2026-04-10.xlsx"

if not os.path.exists(file_path):
    print(f"❌ File tidak ditemukan. Cek lokasi file Excel-nya")
    print(f"   Dicari di: {file_path}")
    exit(1)

print(f"📂 Membaca file: {file_path}")

# ========== 1. BACA SHEET DATA PAKET ==========
df_paket = pd.read_excel(file_path, sheet_name="Data Paket")
print(f"✅ Data Paket: {len(df_paket)} baris")

# Kosongkan tabel dulu
cursor.execute("DELETE FROM paket")

# Insert data paket
for _, row in df_paket.iterrows():
    cursor.execute("""
        INSERT INTO paket (id, nama, unit, jenis, pic, target, realisasi, progress, nilai, vendor, status, risiko, ket)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        row['ID Paket'],
        row['Nama Paket'],
        row['Unit Kerja'],
        row['Jenis'],
        row['PIC'],
        str(row['Target Selesai']) if pd.notna(row['Target Selesai']) else None,
        str(row['Realisasi']) if pd.notna(row['Realisasi']) else None,
        int(row['Progress (%)']) if pd.notna(row['Progress (%)']) else 0,
        float(row['Nilai(JT & M)']) if pd.notna(row['Nilai(JT & M)']) else 0,
        row['Vendor'],
        row['Status'],
        row['Risiko'],
        row['Keterangan'] if pd.notna(row['Keterangan']) else ''
    ))

print(f"   ✅ {len(df_paket)} paket masuk")

# ========== 2. BACA SHEET KINERJA VENDOR ==========
df_vendor = pd.read_excel(file_path, sheet_name="Kinerja Vendor")
print(f"✅ Data Vendor: {len(df_vendor)} baris")

cursor.execute("DELETE FROM vendor")

for _, row in df_vendor.iterrows():
    cursor.execute("""
        INSERT INTO vendor (nama, kontrak, tepat_waktu, kualitas, rating)
        VALUES (?, ?, ?, ?, ?)
    """, (
        row['Nama Vendor'],
        int(row['Jumlah Kontrak']) if pd.notna(row['Jumlah Kontrak']) else 0,
        int(row['Tepat Waktu (%)']) if pd.notna(row['Tepat Waktu (%)']) else 0,
        int(row['Kualitas (%)']) if pd.notna(row['Kualitas (%)']) else 0,
        float(row['Rating (1-5)']) if pd.notna(row['Rating (1-5)']) else 0
    ))

print(f"   ✅ {len(df_vendor)} vendor masuk")

# ========== 3. BACA SHEET NILAI BULANAN ==========
df_nilai = pd.read_excel(file_path, sheet_name="Nilai Bulanan")
print(f"✅ Data Nilai Bulanan: {len(df_nilai)} baris")

cursor.execute("DELETE FROM nilai_bulanan")

for _, row in df_nilai.iterrows():
    cursor.execute("""
        INSERT INTO nilai_bulanan (bulan, unit_a, unit_b, unit_c, total, tahun)
        VALUES (?, ?, ?, ?, ?, 2026)
    """, (
        row['Bulan'],
        float(row['Unit A - Keuangan (M)']) if pd.notna(row['Unit A - Keuangan (M)']) else 0,
        float(row['Unit B - Infrastruktur (M)']) if pd.notna(row['Unit B - Infrastruktur (M)']) else 0,
        float(row['Unit C - Teknologi (M)']) if pd.notna(row['Unit C - Teknologi (M)']) else 0,
        float(row['Total (M)']) if pd.notna(row['Total (M)']) else 0
    ))

print(f"   ✅ {len(df_nilai)} baris nilai bulanan masuk")

# Commit dan tutup
conn.commit()
conn.close()

print("\n" + "="*50)
print("✅ SEMUA DATA BERHASIL MASUK KE SQLITE!")
print("📁 Database: pengadaan.db")
print("="*50)