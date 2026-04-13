"""
sync_any_excel_to_sqlite.py
Auto-deteksi struktur Excel -> buat tabel baru -> hapus & isi ulang database.
"""
import sqlite3
import pandas as pd
import os, re, json
from pathlib import Path
from datetime import datetime
import sys, io

# Force UTF-8 for Windows CMD
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# --- Helpers ---
def find_col(df, patterns):
    for col in df.columns:
        s = str(col).lower()
        for p in patterns:
            if re.search(p, s):
                return col
    return None

def clean(val):
    if val is None: return None
    try:
        if pd.isna(val): return None
    except: pass
    if isinstance(val, pd.Timestamp): return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    return s if s and s.lower() not in ('nan','nat','none','<na>') else None

def to_num(val):
    if val is None: return 0
    try:
        if isinstance(val,(int,float)): return float(val)
        c = re.sub(r'[^\d.\-]','',str(val))
        return float(c) if c else 0
    except: return 0

def to_int(val): return int(round(to_num(val)))

def safe_col(col):
    s = re.sub(r'[^a-zA-Z0-9_]','_',str(col).strip())
    s = re.sub(r'_+',' ',s).strip().replace(' ','_').lower()
    return s or 'col'

# --- Pattern definitions ---
PAKET_PAT = {
    'id':        [r'id\s*paket',r'kode\s*paket',r'no\.?\s*paket',r'^id$',r'^no$',r'^kode$'],
    'nama':      [r'nama\s*paket',r'uraian',r'deskripsi',r'kegiatan',r'^nama$'],
    'unit':      [r'unit\s*kerja',r'\bunit\b',r'divisi',r'departemen',r'dept'],
    'jenis':     [r'\bjenis\b',r'\btipe\b',r'\bkategori\b'],
    'pic':       [r'\bpic\b',r'penanggung\s*jawab',r'\bpj\b'],
    'target':    [r'target\s*selesai',r'tgl\s*target',r'deadline'],
    'realisasi': [r'realisasi',r'tgl\s*selesai'],
    'progress':  [r'progress',r'persentase',r'kemajuan'],
    'nilai':     [r'\bnilai\b',r'\bpagu\b',r'\banggaran\b',r'harga\s*kontrak'],
    'vendor':    [r'\bvendor\b',r'kontraktor',r'penyedia'],
    'status':    [r'\bstatus\b'],
    'risiko':    [r'\brisiko\b',r'\brisk\b'],
    'ket':       [r'keterangan',r'\bket\b',r'catatan'],
}
VENDOR_PAT = {
    'nama':        [r'nama\s*vendor',r'^nama$',r'vendor'],
    'kontrak':     [r'jumlah\s*kontrak',r'\bkontrak\b'],
    'tepat_waktu': [r'tepat\s*waktu',r'on.?time'],
    'kualitas':    [r'kualitas',r'quality'],
    'rating':      [r'\brating\b',r'score'],
}
NILAI_PAT  = { 'bulan': [r'\bbulan\b',r'^month$'], 'total': [r'\btotal\b'] }
KPI_PAT    = { 'indikator':[r'indikator',r'kpi',r'^nama$'], 'nilai':[r'^nilai$',r'^value$'], 'satuan':[r'satuan',r'\bunit\b'] }

def is_paket(df):
    return sum(1 for k,p in PAKET_PAT.items() if find_col(df,p)) >= 2

def is_vendor(df): return bool(find_col(df, VENDOR_PAT['nama']))
def is_nilai(df):  return bool(find_col(df, NILAI_PAT['bulan']))
def is_kpi(df):    return bool(find_col(df, KPI_PAT['indikator']))

# --- Main ---
def sync_excel_to_sqlite(file_path, db_path=None):
    if db_path is None:
        api_db  = str(Path(__file__).parent / 'api'  / 'pengadaan.db')
        root_db = str(Path(__file__).parent / 'pengadaan.db')
        db_path = api_db if os.path.exists(Path(api_db).parent) else root_db

    if not os.path.exists(file_path):
        print(f"[ERROR] File tidak ditemukan: {file_path}")
        return False

    print(f"\n{'='*60}\nFILE  : {Path(file_path).name}\nDB    : {db_path}\n{'='*60}")

    xl = pd.ExcelFile(file_path)
    sheets = {}
    for name in xl.sheet_names:
        try:
            df = pd.read_excel(xl, sheet_name=name, dtype=str)
            df = df.dropna(how='all').reset_index(drop=True)
            df.columns = [str(c).strip() for c in df.columns]
            sheets[name] = df
            print(f"   [SHEET] '{name}': {len(df)} baris x {len(df.columns)} kolom")
        except Exception as e:
            print(f"   [WARN] Gagal baca '{name}': {e}")

    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")

    for tbl in ['paket','vendor','nilai_bulanan','kpi_summary','schema_meta']:
        cur.execute(f"DROP TABLE IF EXISTS {tbl}")

    cur.execute("""CREATE TABLE schema_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT, logical_key TEXT, physical_col TEXT,
        original_header TEXT, synced_at TEXT)""")

    synced_at = datetime.now().isoformat()
    summary   = {}

    for sheet_name, df in sheets.items():
        print(f"\n[DETECT] Sheet '{sheet_name}':", end=' ')
        if is_paket(df):
            print("-> DATA PAKET")
            summary['paket'] = _sync_paket(cur, df, synced_at)
        elif is_vendor(df):
            print("-> DATA VENDOR")
            summary['vendor'] = _sync_vendor(cur, df, synced_at)
        elif is_nilai(df):
            print("-> NILAI BULANAN")
            summary['nilai_bulanan'] = _sync_nilai(cur, df, synced_at)
        elif is_kpi(df):
            print("-> KPI SUMMARY")
            summary['kpi'] = _sync_kpi(cur, df, synced_at)
        else:
            print("-> tidak dikenali, dilewati")

    conn.commit()
    conn.close()
    print(f"\n[OK] SYNC SELESAI ({synced_at})")
    for k,v in summary.items(): print(f"   {k}: {v} baris")
    print('='*60)
    return True


# --- Per-sheet helpers ---
def _sync_paket(cur, df, synced_at):
    mapping = {k: find_col(df,p) for k,p in PAKET_PAT.items() if find_col(df,p)}
    print(f"   Mapping: {list(mapping.keys())}")
    mapped  = set(mapping.values())
    extras  = [c for c in df.columns if c not in mapped]

    fixed = ["id TEXT PRIMARY KEY","nama TEXT","unit TEXT","jenis TEXT","pic TEXT",
             "target TEXT","realisasi TEXT","progress INTEGER DEFAULT 0",
             "nilai REAL DEFAULT 0","vendor TEXT","status TEXT","risiko TEXT",
             "ket TEXT","synced_at TEXT"]
    reserved = {d.split()[0] for d in fixed}
    ext_map = {}
    for col in extras:
        sn = safe_col(col)
        while sn in reserved or sn in ext_map: sn += '_x'
        ext_map[sn] = col
        reserved.add(sn)

    all_defs = fixed + [f"{sn} TEXT" for sn in ext_map]
    cur.execute(f"CREATE TABLE paket ({','.join(all_defs)})")

    for k,col in mapping.items():
        cur.execute("INSERT INTO schema_meta VALUES(NULL,?,?,?,?,?)",
                    ('paket',k,k,col,synced_at))
    for sn,col in ext_map.items():
        cur.execute("INSERT INTO schema_meta VALUES(NULL,?,?,?,?,?)",
                    ('paket',f'extra_{sn}',sn,col,synced_at))

    inserted = 0
    for idx, row in df.iterrows():
        rid = clean(row.get(mapping.get('id',''),None)) if 'id' in mapping else None
        if not rid: rid = f"PKT{idx+1:04d}"
        vals = [rid,
                clean(row.get(mapping.get('nama',''),None)),
                clean(row.get(mapping.get('unit',''),None)),
                clean(row.get(mapping.get('jenis',''),None)),
                clean(row.get(mapping.get('pic',''),None)),
                clean(row.get(mapping.get('target',''),None)),
                clean(row.get(mapping.get('realisasi',''),None)),
                to_int(clean(row.get(mapping.get('progress',''),None))),
                to_num(clean(row.get(mapping.get('nilai',''),None))),
                clean(row.get(mapping.get('vendor',''),None)),
                clean(row.get(mapping.get('status',''),None)),
                clean(row.get(mapping.get('risiko',''),None)),
                clean(row.get(mapping.get('ket',''),None)),
                synced_at] + [clean(row.get(c,None)) for c in ext_map.values()]
        ph = ','.join(['?']*len(all_defs))
        cur.execute(f"INSERT OR REPLACE INTO paket VALUES({ph})", vals)
        inserted += 1
    print(f"   [OK] {inserted} paket inserted")
    return inserted


def _sync_vendor(cur, df, synced_at):
    cur.execute("""CREATE TABLE vendor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT UNIQUE, kontrak INTEGER DEFAULT 0,
        tepat_waktu INTEGER DEFAULT 0, kualitas INTEGER DEFAULT 0,
        rating REAL DEFAULT 0, synced_at TEXT)""")
    nc = find_col(df,VENDOR_PAT['nama'])
    kc = find_col(df,VENDOR_PAT['kontrak'])
    tc = find_col(df,VENDOR_PAT['tepat_waktu'])
    qc = find_col(df,VENDOR_PAT['kualitas'])
    rc = find_col(df,VENDOR_PAT['rating'])
    inserted = 0
    for _,row in df.iterrows():
        nama = clean(row.get(nc)) if nc else None
        if not nama: continue
        cur.execute("INSERT OR REPLACE INTO vendor (nama,kontrak,tepat_waktu,kualitas,rating,synced_at) VALUES(?,?,?,?,?,?)",
                    (nama,
                     to_int(clean(row.get(kc))) if kc else 0,
                     to_int(clean(row.get(tc))) if tc else 0,
                     to_int(clean(row.get(qc))) if qc else 0,
                     round(to_num(clean(row.get(rc))),1) if rc else 0,
                     synced_at))
        inserted += 1
    print(f"   [OK] {inserted} vendor inserted")
    return inserted


def _sync_nilai(cur, df, synced_at):
    bc = find_col(df, NILAI_PAT['bulan'])
    vc = [c for c in df.columns if c != bc]

    safe = {}
    reserved = {'id','bulan','has_data','synced_at'}
    for col in vc:
        sn = safe_col(col)
        while sn in reserved or sn in safe: sn += '_x'
        safe[sn] = col
        reserved.add(sn)

    col_defs = ["id INTEGER PRIMARY KEY AUTOINCREMENT","bulan TEXT","has_data INTEGER DEFAULT 1"]
    col_defs += [f"{sn} REAL" for sn in safe]
    col_defs += ["synced_at TEXT"]
    cur.execute(f"CREATE TABLE nilai_bulanan ({','.join(col_defs)})")

    for sn, orig in safe.items():
        cur.execute("INSERT INTO schema_meta VALUES(NULL,?,?,?,?,?)",
                    ('nilai_bulanan',sn,sn,orig,synced_at))

    inserted = 0
    for _,row in df.iterrows():
        bulan = clean(row.get(bc))
        if not bulan: continue
        nums = [to_num(clean(row.get(c))) for c in vc]
        has_data = 1 if any(n != 0 for n in nums) else 0
        sn_keys = ','.join(safe.keys())
        ph = ','.join(['?']*len(safe))
        cur.execute(f"INSERT INTO nilai_bulanan (bulan,has_data,{sn_keys},synced_at) VALUES(?,?,{ph},?)",
                    [bulan, has_data] + nums + [synced_at])
        inserted += 1
    print(f"   [OK] {inserted} bulan inserted (has_data=0 jika semua nilai 0/kosong)")
    return inserted


def _sync_kpi(cur, df, synced_at):
    cur.execute("""CREATE TABLE kpi_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        indikator TEXT, nilai REAL, satuan TEXT, synced_at TEXT)""")
    ic = find_col(df,KPI_PAT['indikator'])
    vc = find_col(df,KPI_PAT['nilai'])
    sc = find_col(df,KPI_PAT['satuan'])
    inserted = 0
    for _,row in df.iterrows():
        ind = clean(row.get(ic)) if ic else None
        if not ind: continue
        cur.execute("INSERT INTO kpi_summary (indikator,nilai,satuan,synced_at) VALUES(?,?,?,?)",
                    (ind, to_num(clean(row.get(vc))) if vc else 0, clean(row.get(sc)) if sc else None, synced_at))
        inserted += 1
    print(f"   [OK] {inserted} KPI inserted")
    return inserted


# --- CLI ---
if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        fp = sys.argv[1]
        dbp = sys.argv[2] if len(sys.argv) > 2 else None
        ok = sync_excel_to_sqlite(fp, dbp)
        sys.exit(0 if ok else 1)
    else:
        files = list(Path('.').glob('*.xlsx')) + list(Path('.').glob('*.xls'))
        if not files:
            print("[ERROR] Tidak ada file Excel\nUsage: python sync_any_excel_to_sqlite.py <file> [db]")
            sys.exit(1)
        print("\n[FILES] Excel files:")
        for i,f in enumerate(files): print(f"  {i+1}. {f.name}")
        try:
            fp = str(files[int(input("\nPilih (nomor): ").strip())-1])
        except:
            print("[ERROR] Tidak valid")
            sys.exit(1)
        sync_excel_to_sqlite(fp)