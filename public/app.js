const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-link[data-page]');
const search = document.querySelector('#site-search');
const pageNames = {overview: 'Buscar sensores, alertas o reportes...', sensors: 'Buscar sensor, ubicación o ID...', alerts: 'Buscar ID de sensor...', quality: 'Buscar parámetros de calidad...', reports: 'Buscar reportes o datos de sensores...', settings: 'Buscar configuración...'};
const previewMode = new URLSearchParams(location.search).has('preview');
if (previewMode) document.documentElement.classList.add('preview-frame');

function showPage(id) {
  pages.forEach((page) => page.classList.toggle('active', page.id === id));
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.page === id));
  search.placeholder = pageNames[id];
  history.replaceState(null, '', `#${id}`);
  window.scrollTo({top: 0, behavior: 'smooth'});
}
navLinks.forEach((link) => link.addEventListener('click', () => showPage(link.dataset.page)));
document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (e) => { const id = link.getAttribute('href').slice(1); if (document.getElementById(id)) { e.preventDefault(); showPage(id); }}));
if (location.hash && document.getElementById(location.hash.slice(1))) showPage(location.hash.slice(1));

function sensorToRow(s) {
  const stateLabel = { healthy: 'ONLINE', warning: 'ALERT', danger: 'ALERT', offline: 'OFFLINE' }[s.status] || 'ONLINE';
  const flowClass = (s.status === 'danger' || s.status === 'warning') ? 'red' : '';
  const battClass = s.battery <= 15 ? 'low' : '';
  return `<tr><td class="mono blue">${s.id}</td><td>${s.place}</td><td><mark class="${s.status}">${stateLabel}</mark></td><td class="mono ${flowClass}">${s.flow.toFixed(1)} m³/h</td><td><span class="battery ${battClass}">▰▰▰▱</span> ${s.battery}%</td><td><button class="more" aria-label="Más acciones">⋮</button></td></tr>`;
}

function alertToRow(a) {
  const cls = a.level === 'CRÍTICA' ? 'danger' : a.level === 'ADVERTENCIA' ? 'warning' : 'info';
  return `<tr><td><mark class="${cls}">${a.level}</mark></td><td class="mono">${a.sensorId || '—'}</td><td>${a.type}</td><td>${a.place}</td><td class="mono">${a.time}</td><td><button class="details" data-toast="Abriendo detalles de ${a.id}">VER DETALLES</button></td></tr>`;
}

// En pantallas pequeñas, cada fila se presenta como una ficha con etiquetas claras.
// Debe re-ejecutarse cada vez que se reemplaza el innerHTML de una tabla.
function applyResponsiveLabels() {
  document.querySelectorAll('table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.cells].forEach((cell, index) => cell.dataset.label = labels[index] || 'Detalle');
    });
  });
}

function updateMapPins(activeAlerts) {
  const sectorsWithCritical = new Set(activeAlerts.filter((a) => a.level === 'CRÍTICA').map((a) => {
    const sensor = AquaSim.getState().sensors.find((s) => s.id === a.sensorId);
    return sensor ? sensor.sectorId : null;
  }));
  const pins = document.querySelectorAll('.map-grid .pin');
  pins.forEach((pin) => pin.classList.toggle('active', sectorsWithCritical.has(pin.dataset.sector)));
  const label = document.querySelector('#map-label');
  if (!label) return;
  if (sectorsWithCritical.size === 0) { label.textContent = 'Sin incidentes activos'; return; }
  const firstSectorId = [...sectorsWithCritical][0];
  const sector = AquaSim.sectors.find((s) => s.id === firstSectorId);
  label.textContent = sector ? sector.name : 'Incidente activo';
}

const SPARK_CHARS = '▁▂▃▄▅▆▇█';
function sparkline(values, max) {
  return values.map((v) => SPARK_CHARS[Math.max(0, Math.min(SPARK_CHARS.length - 1, Math.floor((v / max) * (SPARK_CHARS.length - 1))))]).join('');
}

function componentToRow(c) {
  const def = AquaSim.qualityComponents.find((d) => d.id === c.id);
  const safe = c.level <= def.limit;
  const displayLevel = def.decimals === 3 && c.level <= 0.001 ? '< 0.001' : c.level.toFixed(def.decimals);
  return `<tr><td>${def.name}</td><td>${displayLevel} ${def.unit}</td><td><mark class="${safe ? 'healthy' : 'danger'}">${safe ? '✓ SEGURO' : '⚠ FUERA DE RANGO'}</mark></td><td>${sparkline(c.trend, def.limit)}</td></tr>`;
}

function renderQualityPage(state) {
  const components = state.quality.components;
  const unsafeCount = components.filter((c) => {
    const def = AquaSim.qualityComponents.find((d) => d.id === c.id);
    return c.level > def.limit;
  }).length;
  const purity = Math.max(0, +(100 - unsafeCount * 8 - components.reduce((sum, c) => {
    const def = AquaSim.qualityComponents.find((d) => d.id === c.id);
    return sum + Math.min(1, c.level / def.limit) * 2;
  }, 0)).toFixed(1));
  // Promedio continuo de cuánto se acerca (o excede) cada componente a su límite,
  // en vez de un conteo discreto, para que el anillo avance de forma gradual.
  const contaminantPct = Math.round(Math.min(100, components.reduce((sum, c) => {
    const def = AquaSim.qualityComponents.find((d) => d.id === c.id);
    return sum + Math.min(1.5, c.level / def.limit) * (100 / 1.5) / components.length;
  }, 0)));

  document.querySelector('#stat-purity').textContent = `${purity}%`;
  const ringPurity = document.querySelector('#ring-purity');
  ringPurity.style.setProperty('--pct', purity);
  ringPurity.classList.toggle('alert', unsafeCount > 0);
  document.querySelector('#stat-purity-trend').textContent = unsafeCount === 0 ? '↗ Dentro de parámetros' : '↘ Requiere atención';
  document.querySelector('#stat-purity-trend').classList.toggle('good', unsafeCount === 0);
  document.querySelector('#stat-purity-trend').classList.toggle('red', unsafeCount > 0);

  document.querySelector('#stat-solids').innerHTML = `${state.quality.dissolvedSolids} <small>ppm</small>`;
  document.querySelector('#ring-solids').style.setProperty('--pct', Math.max(0, Math.min(100, (state.quality.dissolvedSolids / 60) * 100)));

  document.querySelector('#stat-contaminants').textContent = `${contaminantPct}%`;
  const ringContaminants = document.querySelector('#ring-contaminants');
  ringContaminants.style.setProperty('--pct', contaminantPct);
  ringContaminants.classList.toggle('alert', unsafeCount > 0);
  const contamLabel = document.querySelector('#stat-contaminants-label');
  contamLabel.textContent = unsafeCount === 0 ? '✓ SEGURIDAD TOTAL' : `⚠ ${unsafeCount} COMPONENTE(S) EN ALERTA`;
  contamLabel.classList.toggle('good', unsafeCount === 0);
  contamLabel.classList.toggle('red', unsafeCount > 0);

  document.querySelector('#quality-rows').innerHTML = components.map(componentToRow).join('');
  document.querySelector('#quality-updated').textContent = `ÚLTIMA ACTUALIZACIÓN: ${new Date().toTimeString().slice(0, 5)}`;
  document.querySelector('#quality-history').innerHTML = state.quality.history24h.map((h) => `<span style="--h:${h}%"></span>`).join('');
  document.querySelector('#quality-summary').textContent = unsafeCount === 0
    ? 'Todos los niveles se mantienen dentro de los rangos de seguridad establecidos por la OMS.'
    : 'Uno o más componentes superan el rango de seguridad recomendado por la OMS. Se recomienda intervención.';
}

function renderFromState() {
  const state = AquaSim.getState();
  document.querySelector('#sensor-rows').innerHTML = state.sensors.map(sensorToRow).join('');
  document.querySelector('#overview-sensor-rows').innerHTML = state.sensors.map(sensorToRow).join('');
  const activeAlerts = state.alerts.filter((a) => !a.resolved);
  document.querySelector('#alert-rows').innerHTML = activeAlerts.map(alertToRow).join('');

  const onlineCount = state.sensors.filter((s) => s.status !== 'offline').length;
  document.querySelector('#stat-active-sensors').innerHTML = `${onlineCount}<small> / ${state.sensors.length}</small>`;
  const criticalCount = activeAlerts.filter((a) => a.level === 'CRÍTICA').length;
  document.querySelector('#stat-active-alerts').textContent = criticalCount;
  document.querySelector('#critical-count').textContent = criticalCount;
  document.querySelector('#alert-badge').textContent = activeAlerts.length;

  const offlineCount = state.sensors.filter((s) => s.status === 'offline').length;
  const alertSensorCount = state.sensors.filter((s) => s.status === 'warning' || s.status === 'danger').length;
  const lowBatteryCount = state.sensors.filter((s) => s.battery <= 15).length;
  document.querySelector('#stat-sensors-online').textContent = onlineCount;
  document.querySelector('#stat-sensors-alerts').textContent = alertSensorCount;
  document.querySelector('#stat-sensors-lowbatt').textContent = lowBatteryCount;
  document.querySelector('#stat-sensors-offline').textContent = offlineCount;
  document.querySelector('#sensors-total-count').textContent = state.sensors.length;
  document.querySelector('#sensors-table-count').textContent = state.sensors.length;

  applyResponsiveLabels();
  updateMapPins(activeAlerts);
  renderQualityPage(state);
}

renderFromState();
AquaSim.onChange(renderFromState);
document.querySelectorAll('.tabs button').forEach(btn => btn.addEventListener('click', () => { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); }));
let toastTimer;
function toast(message) { const box = document.querySelector('#toast'); box.textContent = message; box.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), 2600); }
document.addEventListener('click', (e) => { const target = e.target.closest('[data-toast]'); if (target) toast(target.dataset.toast); });
search.addEventListener('input', () => { const query = search.value.toLowerCase().trim(); document.querySelectorAll('tbody tr').forEach(row => row.hidden = query && !row.textContent.toLowerCase().includes(query)); });

if (!previewMode) {
  const demo = document.querySelector('.device-demo');
  const frame = demo.querySelector('iframe');
  const deviceFrame = demo.querySelector('.device-frame');
  document.querySelector('.demo-trigger').addEventListener('click', () => {
    frame.src = `${location.pathname}?preview=1${location.hash || '#overview'}`;
    demo.classList.add('open'); demo.setAttribute('aria-hidden', 'false');
  });
  const closeDemo = () => { demo.classList.remove('open'); demo.setAttribute('aria-hidden', 'true'); frame.src = ''; };
  demo.querySelector('.close-demo').addEventListener('click', closeDemo);
  demo.addEventListener('click', (event) => { if (event.target === demo) closeDemo(); });
  demo.querySelectorAll('[data-width]').forEach((button) => button.addEventListener('click', () => {
    demo.querySelectorAll('[data-width]').forEach((item) => item.classList.toggle('selected', item === button));
    deviceFrame.dataset.width = button.dataset.width;
  }));
}
