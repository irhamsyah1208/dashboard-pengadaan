// ============================================================
// IMPORT.JS — Upload Excel ke server, auto-detect schema
// ============================================================

let importedData = null; // { file, previewData }

// ── Modal open/close ──────────────────────────────────────────────────────────
function showImportModal() {
    const modal = document.getElementById('importModal');
    if (!modal) return;
    modal.classList.add('open');

    // Reset state
    importedData = null;
    _setPreview(false);
    _setMessage('');
    _setBtn(false);
    const fi = document.getElementById('fileInput');
    if (fi) fi.value = '';

    // Setup drag-drop (re-attach each open to avoid duplicate listeners)
    const area = modal.querySelector('.import-upload');
    if (area) {
        const newArea = area.cloneNode(true); // clone removes old listeners
        area.parentNode.replaceChild(newArea, area);
        newArea.onclick = () => document.getElementById('fileInput').click();

        newArea.addEventListener('dragover', e => {
            e.preventDefault();
            newArea.style.borderColor = 'var(--blue, #4f7ef7)';
            newArea.style.background  = 'rgba(79,126,247,0.08)';
        });
        newArea.addEventListener('dragleave', () => {
            newArea.style.borderColor = '';
            newArea.style.background  = '';
        });
        newArea.addEventListener('drop', e => {
            e.preventDefault();
            newArea.style.borderColor = '';
            newArea.style.background  = '';
            const file = e.dataTransfer.files[0];
            if (file) _handleFile(file);
        });
    }
}

// ── File input onChange ────────────────────────────────────────────────────────
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) _handleFile(file);
}

// ── Core file handler ─────────────────────────────────────────────────────────
function _handleFile(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        _setMessage('Format tidak didukung. Gunakan .xlsx, .xls, atau .csv', 'error');
        return;
    }

    // Store file immediately — for upload
    importedData = { file };

    // Show filename feedback
    _setMessage(`📄 File dipilih: <strong>${file.name}</strong> (${_fmtSize(file.size)})`, 'info');

    // Parse locally for preview only
    if (name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = e => {
            const rows = _parseCSV(e.target.result);
            _showPreview(rows, file.name);
        };
        reader.readAsText(file);
    } else {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const arr = new Uint8Array(e.target.result);
                const wb  = XLSX.read(arr, { type:'array' });
                // Prioritas: sheet bernama paket, vendor, atau sheet pertama
                const sn  = wb.SheetNames.find(s => /paket|data|sheet1/i.test(s)) || wb.SheetNames[0];
                const ws  = wb.Sheets[sn];
                const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });
                _showPreview(rows, file.name);
            } catch(err) {
                _setMessage('Gagal membaca Excel: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

// ── Preview ───────────────────────────────────────────────────────────────────
function _showPreview(rows, fileName) {
    if (!rows || rows.length === 0) {
        _setMessage('File tidak berisi data yang bisa dibaca.', 'error');
        return;
    }

    const headers = Object.keys(rows[0]);
    const sample  = rows.slice(0, 5);
    const total   = rows.length;

    let html = `<div style="margin-bottom:8px;font-size:12px;color:var(--text3,#8b92a8)">
        Preview <strong style="color:var(--text1,#fff)">${total} baris</strong> 
        × <strong style="color:var(--text1,#fff)">${headers.length} kolom</strong>
        — File: <em>${fileName}</em>
    </div>`;

    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:var(--bg2,#23283a)">';
    headers.slice(0, 7).forEach(h => {
        html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.07);color:var(--text2,#c8cfe0);font-weight:500;white-space:nowrap">${h}</th>`;
    });
    if (headers.length > 7) html += `<th style="padding:6px 8px;color:var(--text3,#8b92a8)">+${headers.length-7} kolom</th>`;
    html += '</tr></thead><tbody>';

    sample.forEach((row, idx) => {
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)${idx%2===0?';background:var(--bg0,#181c29)':''}">`;
        headers.slice(0, 7).forEach(h => {
            const val = String(row[h] ?? '').substring(0, 28);
            html += `<td style="padding:5px 8px;color:var(--text2,#c8cfe0)">${val || '<span style="color:var(--text3)">—</span>'}</td>`;
        });
        if (headers.length > 7) html += '<td style="padding:5px 8px;color:var(--text3)">…</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    if (total > 5) {
        html += `<div style="font-size:11px;color:var(--text3,#8b92a8);margin-top:6px">... dan ${total-5} baris lainnya</div>`;
    }

    _setPreview(true, html);
    _setMessage('✅ File siap di-import. Klik tombol <strong>Import</strong> untuk lanjut.', 'success');
    _setBtn(true);
}

// ── Upload to server ──────────────────────────────────────────────────────────
async function processImport() {
    if (!importedData || !importedData.file) {
        _setMessage('Tidak ada file yang dipilih.', 'error');
        return;
    }

    const btn = document.getElementById('importBtn');
    const origLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '⏳ Mengupload...'; btn.disabled = true; }

    const fd = new FormData();
    fd.append('file', importedData.file);

    try {
        const resp = await fetch('/api/upload-excel', { method:'POST', body:fd });

        let result;
        try { result = await resp.json(); }
        catch(e) { throw new Error('Server tidak mengembalikan JSON valid'); }

        if (resp.ok && result.status === 'success') {
            _setMessage('✅ Import berhasil! Dashboard diperbarui...', 'success');
            _setBtn(false);

            // Reload semua data di dashboard setelah 1 detik
            setTimeout(async () => {
                if (typeof loadAllData === 'function') {
                    await loadAllData();
                    if (typeof initChartsFromAPI === 'function') await initChartsFromAPI();
                }
                closeModal('importModal');
                if (typeof showToast === 'function') showToast('✅ Data Excel berhasil diimport!');
            }, 1200);
        } else {
            const detail = result.detail || result.message || 'Terjadi kesalahan';
            _setMessage(`❌ Gagal: ${detail}`, 'error');
        }
    } catch(err) {
        console.error('Upload error:', err);
        _setMessage(`❌ Koneksi gagal: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.innerHTML = origLabel; btn.disabled = false; }
    }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function _setPreview(show, html='') {
    const el = document.getElementById('importPreview');
    if (!el) return;
    el.style.display = show ? 'block' : 'none';
    if (html) el.innerHTML = html;
}

function _setMessage(html, type='') {
    const el = document.getElementById('importMessage');
    if (!el) return;
    if (!html) { el.style.display = 'none'; return; }
    const colors = {
        error:   { bg:'rgba(247,79,79,0.10)',   border:'#f74f4f', color:'#f74f4f' },
        success: { bg:'rgba(34,201,122,0.10)',   border:'#22c97a', color:'#22c97a' },
        info:    { bg:'rgba(79,126,247,0.10)',   border:'#4f7ef7', color:'#c8cfe0' },
    };
    const c = colors[type] || colors.info;
    el.style.cssText = `display:block;margin-top:12px;padding:10px 14px;background:${c.bg};border-left:3px solid ${c.border};color:${c.color};font-size:12px;border-radius:4px;line-height:1.5`;
    el.innerHTML = html;
}

function _setBtn(show) {
    const el = document.getElementById('importBtn');
    if (el) el.style.display = show ? 'inline-block' : 'none';
}

function _fmtSize(bytes) {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024*1024)   return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function _parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
        const row  = {};
        headers.forEach((h,i) => { row[h] = vals[i] ?? ''; });
        return row;
    }).filter(r => Object.values(r).some(v => v !== ''));
}
