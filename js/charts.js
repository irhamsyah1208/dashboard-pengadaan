// ============================================================
// CHARTS.JS — Semua inisialisasi Chart.js
// ============================================================

let donutChartInst, barChartInst, ganttChartInst, vendorChartInst;

const COLORS = {
  blue:   '#4f7ef7',
  green:  '#22c97a',
  amber:  '#f7a74f',
  red:    '#f74f4f',
  teal:   '#2ed8c3',
  purple: '#a78bfa',
  pink:   '#f472b6',
};

function initCharts() {
  initDonut();
  initBar();
  initGantt();
  initVendorChart();
}

// ------ DONUT ------
function initDonut() {
  const ctx = document.getElementById('donutChart');
  if (!ctx) return;
  const data = DB.statusDistribusi;
  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = [COLORS.blue, COLORS.amber, COLORS.teal, COLORS.green];

  // Custom legend
  const legendEl = document.getElementById('donutLegend');
  if (legendEl) {
    legendEl.innerHTML = labels.map((l,i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l} ${values[i]}%</span>`
    ).join('');
  }

  donutChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
        }
      }
    }
  });
}

// ------ BAR (nilai bulanan) ------
function initBar() {
  const ctx = document.getElementById('barChart');
  if (!ctx) return;
  const d = DB.nilaiBulanan;
  const colors = [COLORS.blue, COLORS.amber, COLORS.green];
  const units = ['Unit A - Keuangan', 'Unit B - Infrastruktur', 'Unit C - Teknologi'];
  const vals = [d.unitA, d.unitB, d.unitC];

  const legendEl = document.getElementById('barLegend');
  if (legendEl) {
    legendEl.innerHTML = units.map((u,i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${u.split(' - ')[0]}</span>`
    ).join('');
  }

  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: units.map((u,i) => ({
        label: u,
        data: vals[i],
        backgroundColor: colors[i],
        borderRadius: 4,
        barPercentage: 0.7
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b92a8', font: { size: 11 } },
          border: { color: 'rgba(255,255,255,0.07)' }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#8b92a8', font: { size: 11 },
            callback: v => 'Rp ' + v + 'M'
          },
          border: { color: 'rgba(255,255,255,0.07)' }
        }
      }
    }
  });
}

// ------ GANTT / HORIZONTAL BAR ------
function initGantt() {
  const ctx = document.getElementById('ganttChart');
  if (!ctx) return;

  // Ambil 8 paket teratas untuk Gantt
  const paket = DB.paket.slice(0, 8);
  const labels = paket.map(p => p.nama.length > 22 ? p.nama.slice(0,22)+'…' : p.nama);
  const progress = paket.map(p => p.progress);
  const remaining = paket.map(p => 100 - p.progress);
  const barColors = paket.map(p => {
    if (p.status === 'Terlambat') return COLORS.red;
    if (p.status === 'Risiko') return COLORS.amber;
    if (p.status === 'Selesai') return COLORS.green;
    return COLORS.blue;
  });

  const wrapHeight = paket.length * 40 + 80;
  const wrap = ctx.parentElement;
  if (wrap) wrap.style.height = wrapHeight + 'px';

  ganttChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Progress',
          data: progress,
          backgroundColor: barColors,
          borderRadius: { topLeft:4, bottomLeft:4, topRight:0, bottomRight:0 },
          barPercentage: 0.55
        },
        {
          label: 'Sisa',
          data: remaining,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: { topLeft:0, bottomLeft:0, topRight:4, bottomRight:4 },
          barPercentage: 0.55
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ` Progress: ${ctx.parsed.x}%`
              : ` Sisa: ${ctx.parsed.x}%`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b92a8', font: { size: 10 }, callback: v => v + '%' },
          border: { color: 'rgba(255,255,255,0.07)' }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#8b92a8', font: { size: 11 } },
          border: { color: 'rgba(255,255,255,0.07)' }
        }
      }
    }
  });
}

// ------ VENDOR BAR ------
function initVendorChart() {
  const ctx = document.getElementById('vendorChart');
  if (!ctx) return;

  const vendors = DB.vendor;
  const labels = vendors.map(v => v.nama.length > 14 ? v.nama.slice(0,14)+'…' : v.nama);

  vendorChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Tepat Waktu (%)', data: vendors.map(v => v.tepatWaktu), backgroundColor: COLORS.blue, borderRadius: 4, barPercentage: 0.4 },
        { label: 'Kualitas (%)', data: vendors.map(v => v.kualitas), backgroundColor: COLORS.teal, borderRadius: 4, barPercentage: 0.4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#8b92a8', font: { size: 10 }, boxWidth: 10, boxHeight: 10 }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8b92a8', font: { size: 10 } }, border: { color: 'rgba(255,255,255,0.07)' } },
        y: {
          max: 100, grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b92a8', font: { size: 10 }, callback: v => v + '%' },
          border: { color: 'rgba(255,255,255,0.07)' }
        }
      }
    }
  });
}

// ------ DOWNLOAD CHART ------
function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename + '-' + new Date().toISOString().slice(0,10) + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Chart diunduh sebagai PNG');
}
