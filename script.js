// ============================================================
// script.js — MediPulse Hospital Dashboard Frontend Logic
// Handles: API calls, chart rendering, real-time updates, alerts
// ============================================================

// ── Config ──────────────────────────────────────────────────
const API_BASE = 'http://localhost:5000';   // Flask backend URL
let refreshInterval = 10000;               // Default: 10 seconds
let refreshTimer    = null;                // Holds the setInterval handle
let chartsInitialized = false;             // Flag to avoid re-creating charts

// ── Chart instances (kept globally so we can update them) ──
let chartBedsTrend, chartOxygenTrend, chartAdmissions,
    chartDonut, chartCorrelation, chartHourly;

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════

/**
 * Switch the visible section when a sidebar link is clicked.
 * Updates active class on nav items and shows the correct section.
 */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;

    // Update nav highlight
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // Show/hide sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${sectionId}`).classList.add('active');

    // Update header text
    const titles = {
      overview:    ['Overview',        'Real-time hospital resource monitoring'],
      analytics:   ['Analytics',       'Historical trends and correlation analysis'],
      predictions: ['AI Predictions',  '24-hour demand forecast powered by machine learning'],
      alerts:      ['Alert Log',       'System-generated resource alerts and notifications'],
    };
    document.getElementById('page-title').textContent    = titles[sectionId][0];
    document.getElementById('page-subtitle').textContent = titles[sectionId][1];

    // Load section-specific data
    if (sectionId === 'analytics' && !chartsInitialized) loadHistoricalCharts();
    if (sectionId === 'alerts') loadAlerts();
  });
});

// ════════════════════════════════════════════════════════════
// REFRESH INTERVAL CONTROL
// ════════════════════════════════════════════════════════════

document.getElementById('refresh-interval').addEventListener('change', function () {
  refreshInterval = parseInt(this.value);
  clearInterval(refreshTimer);
  if (refreshInterval > 0) {
    refreshTimer = setInterval(fetchHospitalData, refreshInterval);
  }
});

// ════════════════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Generic fetch wrapper with error handling.
 * Returns parsed JSON or null on failure.
 */
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] ${endpoint} failed:`, err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// FETCH HOSPITAL DATA — called on every refresh tick
// ════════════════════════════════════════════════════════════

async function fetchHospitalData() {
  setConnectionStatus('connecting');
  const data = await apiFetch('/getHospitalData');

  if (!data) {
    setConnectionStatus('error');
    return;
  }

  setConnectionStatus('connected');
  updateKPICards(data);
  updateAdmissionStrip(data);
  handleAlertBanner(data.active_alerts || []);

  // Refresh overview charts with latest spark data
  if (document.getElementById('section-overview').classList.contains('active')) {
    loadHistoricalCharts();
  }
}

// ════════════════════════════════════════════════════════════
// UPDATE KPI CARDS
// ════════════════════════════════════════════════════════════

function updateKPICards(d) {
  // Beds
  setText('val-available-beds', d.available_beds);
  setText('val-total-beds',     d.total_beds);
  updateGauge('gauge-beds',     'gauge-beds-pct',     d.bed_occupancy_pct);
  setAlertClass('kpi-beds', d.available_beds / d.total_beds);

  // ICU
  setText('val-icu-available', d.icu_available);
  setText('val-icu-total',     d.icu_total);
  updateGauge('gauge-icu',     'gauge-icu-pct',       d.icu_occupancy_pct);
  setAlertClass('kpi-icu', d.icu_available / d.icu_total);

  // Oxygen
  setText('val-oxygen',         d.oxygen_stock);
  setHTML('val-oxygen-pct',     `<span class="${oxygenClass(d.oxygen_pct)}">${d.oxygen_pct}%</span>`);
  updateGauge('gauge-oxygen',   'gauge-oxygen-pct',   d.oxygen_pct);
  setAlertClass('kpi-oxygen', d.oxygen_stock / 500);

  // Ventilators
  setText('val-ventilators',       d.ventilators_available);
  setText('val-ventilators-total', d.ventilators_total);
  updateGauge('gauge-ventilators', 'gauge-ventilators-pct', 100 - d.ventilator_occupancy);

  // Last updated
  setText('last-updated-time', formatTime(d.last_updated));
}

function updateAdmissionStrip(d) {
  setText('val-admission-rate', d.patient_admission_rate);
  setText('val-bed-occ',        `${d.bed_occupancy_pct}%`);
  setText('val-icu-occ',        `${d.icu_occupancy_pct}%`);
  setText('val-vent-occ',       `${d.ventilator_occupancy}%`);
}

/** Sets the circular gauge stroke-dasharray to reflect a percentage value. */
function updateGauge(gaugeId, textId, pct) {
  const pctValue = Math.min(100, Math.max(0, pct));
  const el = document.getElementById(gaugeId);
  const tx = document.getElementById(textId);
  if (el) el.setAttribute('stroke-dasharray', `${pctValue}, 100`);
  if (tx) tx.textContent = `${Math.round(pctValue)}%`;
}

/** Adds red/orange alert class to a card based on availability ratio. */
function setAlertClass(cardId, ratio) {
  const el = document.getElementById(cardId);
  if (!el) return;
  el.classList.remove('alert-card', 'warn-card');
  if (ratio <= 0.05) el.classList.add('alert-card');
  else if (ratio <= 0.15) el.classList.add('warn-card');
}

function oxygenClass(pct) {
  if (pct < 20) return 'highlight' ; // red in practice
  if (pct < 35) return 'highlight';
  return 'highlight';
}

// ════════════════════════════════════════════════════════════
// ALERT BANNER
// ════════════════════════════════════════════════════════════

function handleAlertBanner(alerts) {
  const banner = document.getElementById('alert-banner');
  const badge  = document.getElementById('alert-count');

  if (!alerts || alerts.length === 0) {
    banner.className = 'alert-banner hidden';
    badge.classList.remove('visible');
    setText('alert-count', '0');
    return;
  }

  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  // Show badge
  badge.textContent = alerts.length;
  badge.classList.add('visible');
  setText('alert-count', alerts.length);

  // Show banner for the most severe alert
  const topAlert = critical[0] || warnings[0];
  banner.className = `alert-banner ${topAlert.severity}`;
  banner.innerHTML = `⚠ ${topAlert.message}`;
}

// ════════════════════════════════════════════════════════════
// HISTORICAL CHARTS
// ════════════════════════════════════════════════════════════

async function loadHistoricalCharts() {
  const res = await apiFetch('/historicalTrends?days=30');
  if (!res || !res.data) return;

  const { dates, beds, oxygen, icu, patients } = res.data;

  // ── Overview: Beds & ICU trend ──────────────────────────
  if (chartBedsTrend) {
    chartBedsTrend.data.labels            = dates;
    chartBedsTrend.data.datasets[0].data  = beds;
    chartBedsTrend.data.datasets[1].data  = icu;
    chartBedsTrend.update('none');
  } else {
    chartBedsTrend = new Chart(document.getElementById('chart-beds-trend'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Beds Used',
            data:  beds,
            borderColor: '#4f86f7',
            backgroundColor: 'rgba(79,134,247,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'ICU Used',
            data:  icu,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: chartOptions('Beds', '#8899b4'),
    });
  }

  // ── Overview: Oxygen trend ──────────────────────────────
  if (chartOxygenTrend) {
    chartOxygenTrend.data.labels           = dates;
    chartOxygenTrend.data.datasets[0].data = oxygen;
    chartOxygenTrend.update('none');
  } else {
    chartOxygenTrend = new Chart(document.getElementById('chart-oxygen-trend'), {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          label: 'Oxygen Used',
          data:  oxygen,
          backgroundColor: 'rgba(34,212,200,0.5)',
          borderColor: '#22d4c8',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: chartOptions('Cylinders', '#8899b4'),
    });
  }

  chartsInitialized = true;

  // ── Analytics charts ────────────────────────────────────
  buildAnalyticsCharts(dates, beds, oxygen, icu, patients);
}

function buildAnalyticsCharts(dates, beds, oxygen, icu, patients) {
  // Patient admissions bar chart
  if (chartAdmissions) {
    chartAdmissions.data.labels = dates;
    chartAdmissions.data.datasets[0].data = patients;
    chartAdmissions.update('none');
  } else {
    chartAdmissions = new Chart(document.getElementById('chart-admissions'), {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          label: 'Patients Admitted',
          data:  patients,
          backgroundColor: 'rgba(79,134,247,0.6)',
          borderColor: '#4f86f7',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: chartOptions('Patients', '#8899b4'),
    });
  }

  // Donut — current distribution
  const latestBeds = beds[beds.length - 1];
  const latestIcu  = icu[icu.length - 1];
  const latestOx   = oxygen[oxygen.length - 1];

  if (chartDonut) {
    chartDonut.data.datasets[0].data = [latestBeds, latestIcu, latestOx];
    chartDonut.update();
  } else {
    chartDonut = new Chart(document.getElementById('chart-donut'), {
      type: 'doughnut',
      data: {
        labels: ['Beds Used', 'ICU Beds', 'Oxygen'],
        datasets: [{
          data: [latestBeds, latestIcu, latestOx],
          backgroundColor: ['#4f86f7', '#f97316', '#22d4c8'],
          borderColor: '#131928',
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom',
            labels: { color: '#8899b4', font: { size: 12 }, boxWidth: 12, padding: 16 } },
        },
        cutout: '65%',
      },
    });
  }

  // Correlation: all 4 resources on one chart
  if (chartCorrelation) {
    chartCorrelation.data.labels = dates;
    chartCorrelation.data.datasets[0].data = beds;
    chartCorrelation.data.datasets[1].data = icu;
    chartCorrelation.data.datasets[2].data = oxygen;
    chartCorrelation.data.datasets[3].data = patients;
    chartCorrelation.update('none');
  } else {
    chartCorrelation = new Chart(document.getElementById('chart-correlation'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          makeDS('Beds',     beds,     '#4f86f7'),
          makeDS('ICU',      icu,      '#f97316'),
          makeDS('Oxygen',   oxygen,   '#22d4c8'),
          makeDS('Patients', patients, '#a78bfa'),
        ],
      },
      options: chartOptions('Units', '#8899b4'),
    });
  }
}

/** Helper: create a line dataset config. */
function makeDS(label, data, color) {
  return { label, data, borderColor: color, backgroundColor: color + '20',
           fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2 };
}

/** Shared Chart.js options for dark theme. */
function chartOptions(yLabel, gridColor) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f1525',
        borderColor: '#1f2d44',
        borderWidth: 1,
        titleColor: '#e8edf8',
        bodyColor: '#8899b4',
        padding: 10,
      },
    },
    scales: {
      x: {
        ticks: { color: gridColor, font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 },
        grid:  { color: '#1a2235' },
      },
      y: {
        ticks: { color: gridColor, font: { size: 11 } },
        grid:  { color: '#1a2235' },
        title: { display: true, text: yLabel, color: gridColor, font: { size: 11 } },
      },
    },
  };
}

// ════════════════════════════════════════════════════════════
// AI PREDICTIONS
// ════════════════════════════════════════════════════════════

async function loadPredictions() {
  // Show loading state
  ['pred-beds','pred-oxygen','pred-icu','pred-confidence'].forEach(id =>
    setText(id, '…')
  );

  const res = await apiFetch('/predictDemand');
  if (!res || !res.predictions) {
    alert('Prediction service unavailable. Make sure the backend is running.');
    return;
  }

  const p = res.predictions;

  setText('pred-beds',       p.predicted_beds_24h);
  setText('pred-oxygen',     p.predicted_oxygen_24h);
  setText('pred-icu',        p.predicted_icu_24h);
  setText('pred-confidence', `${p.confidence}%`);

  // Render hourly breakdown chart
  if (p.hourly_breakdown && p.hourly_breakdown.length > 0) {
    document.getElementById('hourly-chart-container').style.display = 'block';
    renderHourlyChart(p.hourly_breakdown);
  }
}

function renderHourlyChart(hourly) {
  const hours  = hourly.map(h => h.hour);
  const beds   = hourly.map(h => h.beds);
  const oxygen = hourly.map(h => h.oxygen);

  if (chartHourly) {
    chartHourly.data.labels = hours;
    chartHourly.data.datasets[0].data = beds;
    chartHourly.data.datasets[1].data = oxygen;
    chartHourly.update();
    return;
  }

  chartHourly = new Chart(document.getElementById('chart-hourly'), {
    type: 'line',
    data: {
      labels: hours,
      datasets: [
        {
          label: 'Predicted Beds',
          data:  beds,
          borderColor: '#4f86f7',
          backgroundColor: 'rgba(79,134,247,0.1)',
          fill: true,
          tension: 0.5,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: 'Predicted Oxygen',
          data:  oxygen,
          borderColor: '#22d4c8',
          backgroundColor: 'rgba(34,212,200,0.1)',
          fill: true,
          tension: 0.5,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...chartOptions('Units', '#8899b4'),
      plugins: {
        ...chartOptions().plugins,
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#8899b4', boxWidth: 12 },
        },
      },
    },
  });
}

// ════════════════════════════════════════════════════════════
// ALERTS LOG
// ════════════════════════════════════════════════════════════

async function loadAlerts() {
  const res = await apiFetch('/alerts');
  const container = document.getElementById('alerts-list');

  if (!res || !res.alerts || res.alerts.length === 0) {
    container.innerHTML = '<div class="empty-state">No alerts recorded yet.</div>';
    return;
  }

  container.innerHTML = res.alerts.map(a => `
    <div class="alert-item ${a.severity || 'info'}">
      <div class="alert-dot-${a.severity || 'info'}">●</div>
      <div class="alert-body">
        <div class="alert-msg">${a.message}</div>
        <div class="alert-time">${a.created_at}</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════════
// UPDATE RESOURCES MODAL
// ════════════════════════════════════════════════════════════

function openModal() {
  document.getElementById('update-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('update-modal').classList.add('hidden');
}

async function submitUpdate() {
  const body = {};
  const beds        = document.getElementById('input-beds').value;
  const icu         = document.getElementById('input-icu').value;
  const oxygen      = document.getElementById('input-oxygen').value;
  const ventilators = document.getElementById('input-ventilators').value;

  if (beds)        body.available_beds          = parseInt(beds);
  if (icu)         body.icu_available           = parseInt(icu);
  if (oxygen)      body.oxygen_stock            = parseInt(oxygen);
  if (ventilators) body.ventilators_available   = parseInt(ventilators);

  if (Object.keys(body).length === 0) { alert('Please fill at least one field.'); return; }

  const res = await apiFetch('/updateResources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res && res.success) {
    closeModal();
    fetchHospitalData();   // Refresh dashboard immediately
  } else {
    alert('Update failed. Check backend logs.');
  }
}

// ════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════════════

/** Safe text setter. */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** Safe innerHTML setter. */
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setConnectionStatus(state) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const map  = {
    connecting: ['',          'Connecting…'],
    connected:  ['connected', 'Live'],
    error:      ['error',     'Offline'],
  };
  dot.className  = `status-dot ${map[state][0]}`;
  text.textContent = map[state][1];
}

function manualRefresh() {
  fetchHospitalData();
}

// ════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════

/**
 * On page load: fetch data immediately, then set up the auto-refresh timer.
 */
(function init() {
  fetchHospitalData();
  loadHistoricalCharts();
  refreshTimer = setInterval(fetchHospitalData, refreshInterval);
  console.log('[Dashboard] MediPulse initialized. Refresh interval:', refreshInterval, 'ms');
})();
