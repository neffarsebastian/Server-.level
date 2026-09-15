// =========================================================
// LEVEL GASTROBAR - DASHBOARD LOGIC (CLIENT SIDE)
// =========================================================

let enteredPin = '';
let authToken = sessionStorage.getItem('level_auth_token') || null;
let currentTab = 'overview';
let cachedData = {
  overview: null,
  movements: [],
  sales: [],
  inventory: []
};
let pollInterval = null;
let searchDebounceTimer = null;

// Estados de Inventario
let currentInventoryFilter = 'todos';
let currentInventoryView = 'cards';
let activeAdjustProduct = null;

// ==========================================
// 1. AUTENTICACIÓN POR PIN
// ==========================================

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dot${i}`);
    if (dot) {
      if (i <= enteredPin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

function pressKey(num) {
  if (enteredPin.length < 4) {
    enteredPin += num;
    updatePinDots();
    document.getElementById('loginError').classList.add('hidden');

    if (enteredPin.length === 4) {
      setTimeout(verifyPin, 150);
    }
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
}

function backspacePin() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
  }
}

async function verifyPin() {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });

    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      sessionStorage.setItem('level_auth_token', authToken);
      showApp();
    } else {
      showPinError();
    }
  } catch (err) {
    // Fallback offline / local
    if (enteredPin === '1234' || enteredPin === 'level2026') {
      authToken = 'local-valid';
      sessionStorage.setItem('level_auth_token', authToken);
      showApp();
    } else {
      showPinError();
    }
  }
}

function showPinError() {
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('hidden');
  enteredPin = '';
  updatePinDots();
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
  
  // Inicializar vistas
  initDashboard();
}

function logout() {
  sessionStorage.removeItem('level_auth_token');
  authToken = null;
  if (pollInterval) clearInterval(pollInterval);
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  clearPin();
}

// ==========================================
// 2. SISTEMA DE AUDIO, FULLSCREEN & NAVEGACIÓN
// ==========================================

let soundEnabled = localStorage.getItem('level_sound_enabled') !== 'false';

function playChime(type = 'sale') {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'sale') {
      // Acorde ascendente cyber (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.18, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.36);
      });
    } else if (type === 'alert') {
      // Alerta de campana digital
      [880, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.22, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.51);
      });
    }
  } catch (e) {}
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('level_sound_enabled', soundEnabled);
  const btn = document.getElementById('btnSoundToggle');
  const icon = document.getElementById('soundIcon');
  if (btn) btn.classList.toggle('sound-active', soundEnabled);
  if (icon) icon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  if (soundEnabled) playChime('sale');
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function switchTab(tabId) {
  currentTab = tabId;
  // Desactivar todos los botones desktop y móviles
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

  const activeBtn = document.getElementById(`tab-${tabId}`);
  const activeMBtn = document.getElementById(`mnav-${tabId}`);
  const activePanel = document.getElementById(`view-${tabId}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activeMBtn) activeMBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tabId === 'movements') loadMovements();
  if (tabId === 'sales') loadSales();
  if (tabId === 'inventory') loadInventory();
}

// ==========================================
// 3. INICIALIZACIÓN Y POLLING EN VIVO
// ==========================================

let liveEventSource = null;

function initEventSourceStream() {
  if (liveEventSource) {
    try { liveEventSource.close(); } catch (e) {}
  }

  try {
    liveEventSource = new EventSource('/api/live-stream');

    liveEventSource.addEventListener('connected', (e) => {
      console.log('⚡ [SSE] Canal en Tiempo Real Conectado:', e.data);
      fetchDashboardData();
    });

    liveEventSource.addEventListener('sale_created', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const monto = formatMoney(payload.venta?.monto);
        const lugar = payload.venta?.mesa || 'Caja';
        const cajero = payload.venta?.cajero || 'Cajero';
        showLiveNotification(`🔔 Nueva Venta: ${monto}`, `${lugar} | ${cajero}`);
        playChime('sale');
      } catch (err) {}
      fetchDashboardData();
      if (currentTab === 'sales') loadSales();
      if (currentTab === 'movements') loadMovements();
    });

    liveEventSource.addEventListener('tables_updated', () => {
      fetchDashboardData();
    });

    liveEventSource.addEventListener('session_changed', () => {
      fetchDashboardData();
      playChime('alert');
      if (currentTab === 'movements') loadMovements();
    });

    liveEventSource.addEventListener('expense_created', () => {
      fetchDashboardData();
      if (currentTab === 'movements') loadMovements();
    });

    liveEventSource.addEventListener('inventory_updated', () => {
      fetchDashboardData();
      if (currentTab === 'inventory') loadInventory();
    });

    liveEventSource.addEventListener('pos_heartbeat', () => {
      fetchDashboardData();
    });

    liveEventSource.addEventListener('pos_exit', () => {
      fetchDashboardData();
      playChime('alert');
    });

    liveEventSource.onerror = () => {
      setTimeout(() => {
        if (sessionStorage.getItem('level_auth_token')) {
          initEventSourceStream();
        }
      }, 5000);
    };
  } catch (err) {
    console.warn("EventSource no soportado o error de red:", err);
  }
}

function showLiveNotification(title, message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 25px;
    right: 25px;
    background: linear-gradient(135deg, #0d1b2a, #070a13);
    border: 1px solid #00f3ff;
    box-shadow: 0 10px 30px rgba(0, 243, 255, 0.4);
    color: #fff;
    padding: 14px 20px;
    border-radius: 14px;
    z-index: 999999;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: tabSlideUp 0.3s ease;
  `;
  toast.innerHTML = `
    <i class="fa-solid fa-bolt" style="color:#00f3ff; font-size:20px;"></i>
    <div>
      <div style="font-weight:700; font-size:13px; color:#00f3ff; font-family:'Orbitron', sans-serif;">${title}</div>
      <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${message}</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function initDashboard() {
  fetchDashboardData();
  initEventSourceStream();

  // Sonido botón
  const soundBtn = document.getElementById('btnSoundToggle');
  const soundIcon = document.getElementById('soundIcon');
  if (soundBtn) soundBtn.classList.toggle('sound-active', soundEnabled);
  if (soundIcon) soundIcon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';

  // Configurar URLs en vista de ajustes
  const curOrigin = window.location.origin;
  const urlDisplay = document.getElementById('serverUrlDisplay');
  if (urlDisplay) urlDisplay.value = curOrigin;
  
  const qrImg = document.getElementById('qrCodeImage');
  if (qrImg) {
    qrImg.onerror = function() {
      this.onerror = null;
      this.src = `https://quickchart.io/qr?text=${encodeURIComponent(curOrigin)}&size=180`;
    };
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(curOrigin)}`;
  }

  // Polling de respaldo de alta velocidad (cada 3.5 segundos)
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchDashboardData, 3500);
}

// Formateador de dinero en pesos colombianos
function formatMoney(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('es-CO');
}

// Animación de contador numérico fluido (Count-Up)
function animateCounter(elementId, targetValue, isCurrency = true) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const target = Number(targetValue) || 0;
  const currentStr = el.textContent.replace(/[^0-9.-]/g, '');
  const start = Number(currentStr) || 0;

  if (start === target) {
    el.textContent = isCurrency ? formatMoney(target) : target.toLocaleString('es-CO');
    return;
  }

  el.classList.remove('bump-anim');
  void el.offsetWidth;
  el.classList.add('bump-anim');

  const duration = 500;
  const startTime = performance.now();

  function update(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = Math.round(start + (target - start) * ease);

    el.textContent = isCurrency ? formatMoney(current) : current.toLocaleString('es-CO');

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = isCurrency ? formatMoney(target) : target.toLocaleString('es-CO');
    }
  }

  requestAnimationFrame(update);
}

async function fetchDashboardData() {
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  try {
    const res = await fetch('/api/overview');
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    cachedData.overview = data;

    renderOverview(data);
    renderTables(data.mesasActivas);

    // Actualizar indicador de sincronización
    const now = new Date();
    const syncTimeText = document.getElementById('syncTimeText');
    const syncStatusText = document.getElementById('syncStatusText');
    const syncStatusPill = document.getElementById('syncStatusPill');

    if (syncTimeText) syncTimeText.textContent = now.toLocaleTimeString('es-CO');
    if (syncStatusText) syncStatusText.textContent = 'En vivo (0ms)';
    if (syncStatusPill) syncStatusPill.style.borderColor = 'rgba(0, 255, 136, 0.4)';
  } catch (err) {
    console.warn("Error en polling dashboard:", err);
    const syncStatusText = document.getElementById('syncStatusText');
    const syncStatusPill = document.getElementById('syncStatusPill');
    if (syncStatusText) syncStatusText.textContent = 'Reconectando...';
    if (syncStatusPill) syncStatusPill.style.borderColor = 'rgba(255, 51, 102, 0.4)';
  } finally {
    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('fa-spin'), 300);
  }
}

// ==========================================
// 4. RENDERIZADO: PANEL GENERAL & KPIS
// ==========================================

function renderOverview(data) {
  const k = data.kpis || {};
  const posStatus = data.posStatus || {};

  // Caja Banner
  const cajaBanner = document.getElementById('cajaLiveBanner');
  const cajaStatusLabel = document.getElementById('cajaStatusLabel');
  const cajeroActiveName = document.getElementById('cajeroActiveName');
  const cajaCalculatedBalance = document.getElementById('cajaCalculatedBalance');
  const cajaSubtext = document.getElementById('cajaSubtext');
  const syncStatusText = document.getElementById('syncStatusText');

  if (cajaBanner && cajaStatusLabel && cajeroActiveName && cajaCalculatedBalance) {
    if (k.posOnline && k.cajaAbierta) {
      // 1. POS ABIERTO Y OPERANDO
      cajaStatusLabel.innerHTML = '<span style="color:#00ff88;"><i class="fa-solid fa-circle-check"></i> ESTADO: TURNO ABIERTO & EN LÍNEA</span>';
      cajeroActiveName.textContent = `Cajero: ${k.cajeroActual || 'Activo'}`;
      cajaCalculatedBalance.textContent = formatMoney(k.saldoEnCajaCalculado);
      if (cajaSubtext) cajaSubtext.textContent = 'Turno en curso | Ventas activas en tiempo real';
      cajaBanner.style.borderColor = 'rgba(0, 255, 136, 0.4)';
      cajaBanner.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.08), rgba(15, 23, 42, 0.9))';
      cajaBanner.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.15)';
      if (syncStatusText) syncStatusText.textContent = 'POS En Línea (Activo)';
    } else if (k.posOnline && !k.cajaAbierta) {
      // 2. POS ABIERTO PERO ESPERANDO APERTURA DE CAJA
      cajaStatusLabel.innerHTML = '<span style="color:#ffd700;"><i class="fa-solid fa-clock"></i> POS EN LÍNEA (ESPERANDO APERTURA)</span>';
      cajeroActiveName.textContent = `Usuario: ${k.cajeroActual || 'Esperando inicio de turno'}`;
      cajaCalculatedBalance.textContent = '$0';
      if (cajaSubtext) cajaSubtext.textContent = 'Aplicación ejecutándose | Caja en espera de apertura';
      cajaBanner.style.borderColor = 'rgba(255, 215, 0, 0.4)';
      cajaBanner.style.background = 'linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(15, 23, 42, 0.9))';
      cajaBanner.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.15)';
      if (syncStatusText) syncStatusText.textContent = 'POS En Línea (Esperando Apertura)';
    } else {
      // 3. PROGRAMA CERRADO O CAJA BLOQUEADA
      cajaStatusLabel.innerHTML = '<span style="color:#ff3366; animation: pulse 1.5s infinite;"><i class="fa-solid fa-lock"></i> 🔒 PROGRAMA CERRADO - CAJA BLOQUEADA</span>';
      cajeroActiveName.textContent = 'Terminal Desconectada / Cerrada';
      cajaCalculatedBalance.textContent = formatMoney(k.saldoEnCajaCalculado);
      if (cajaSubtext) cajaSubtext.textContent = 'La aplicación de caja física no está en ejecución';
      cajaBanner.style.borderColor = 'rgba(255, 51, 102, 0.5)';
      cajaBanner.style.background = 'linear-gradient(135deg, rgba(255, 51, 102, 0.12), rgba(15, 23, 42, 0.95))';
      cajaBanner.style.boxShadow = '0 0 25px rgba(255, 51, 102, 0.25)';
      if (syncStatusText) syncStatusText.textContent = 'Desconectado / Caja Bloqueada';
    }
  }

  // Actualizar KPIs de tarjetas con animación Count-Up
  const totalSalesVal = k.totalVentasHoy || k.totalSales || 0;
  const netProfitVal = k.balanceNetoHoy || k.gananciaNetaHoy || 0;
  const cashVal = k.efectivoHoy || k.cash || 0;
  const transferVal = k.transferenciaHoy || k.transferenciasHoy || 0;
  const expensesVal = k.totalGastosHoy || k.gastosHoy || 0;
  const txCountVal = k.totalTransaccionesHoy || k.cantidadVentasHoy || (data.ventasHoy && data.ventasHoy.length) || 0;
  const activeTablesVal = (data.mesasActivas || []).length;
  const tablesTotalVal = k.totalEnMesas || k.totalMesasActivas || 0;

  animateCounter('kpiTotalSales', totalSalesVal, true);
  animateCounter('kpiNetProfit', netProfitVal, true);
  animateCounter('kpiCash', cashVal, true);
  animateCounter('kpiTransfer', transferVal, true);
  animateCounter('kpiExpenses', expensesVal, true);
  animateCounter('kpiActiveTables', activeTablesVal, false);

  // Utilidad & Margen Estimado
  const utilityVal = k.utilidadBrutaHoy !== undefined ? k.utilidadBrutaHoy : (k.utilidadEstimada || (totalSalesVal - (k.totalCostoHoy || 0)));
  const marginPctVal = k.margenUtilidadPct !== undefined ? k.margenUtilidadPct : (totalSalesVal > 0 ? Math.round((utilityVal / totalSalesVal) * 100) : 0);
  animateCounter('kpiUtility', utilityVal, true);

  const kpiMarginPct = document.getElementById('kpiMarginPct');
  if (kpiMarginPct) kpiMarginPct.textContent = `Margen: ${marginPctVal}%`;

  const kpiNetUtilityTrend = document.getElementById('kpiNetUtilityTrend');
  if (kpiNetUtilityTrend && k.totalCostoHoy) {
    kpiNetUtilityTrend.innerHTML = `<i class="fa-solid fa-tag"></i> Costo: ${formatMoney(k.totalCostoHoy)}`;
  }

  const kpiTxCount = document.getElementById('kpiTxCount');
  if (kpiTxCount) kpiTxCount.textContent = `${txCountVal} transacciones hoy`;

  const kpiTablesTotal = document.getElementById('kpiTablesTotal');
  if (kpiTablesTotal) kpiTablesTotal.textContent = `${formatMoney(tablesTotalVal)} en consumo`;

  // Badges de mesas en tabs desktop y mobile
  const tabBadge = document.getElementById('tabTablesCount');
  const mTabBadge = document.getElementById('mTabTablesCount');
  if (tabBadge) tabBadge.textContent = activeTablesVal;
  if (mTabBadge) mTabBadge.textContent = activeTablesVal;

  // Gráfico de Barras por Hora
  renderHourlyChart(data.ventasPorHora || []);

  // Top Productos
  renderTopProducts(data.topProductos || []);

  // Quick movements list
  renderQuickMovements(data.ultimosMovimientos || []);
}

function renderHourlyChart(hourlyArray) {
  const container = document.getElementById('hourlyChartContainer');
  if (!container) return;

  const maxVal = Math.max(...hourlyArray, 10000);
  let html = '';
  for (let h = 0; h < 24; h++) {
    const val = hourlyArray[h] || 0;
    const heightPct = Math.round((val / maxVal) * 100);
    const label = `${h}:00`;
    html += `
      <div class="chart-bar-wrap" title="${label} - ${formatMoney(val)}">
        <div class="chart-bar" style="height: ${Math.max(heightPct, 4)}%;"></div>
        <span class="chart-label">${h}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderTopProducts(products) {
  const container = document.getElementById('topProductsList');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Sin ventas registradas hoy</div>';
    return;
  }

  container.innerHTML = products.map((p, idx) => `
    <div class="top-product-item">
      <span class="prod-rank">#${idx + 1}</span>
      <div class="prod-info">
        <div class="prod-name">${escapeHtml(p.nombre)}</div>
        <div class="prod-qty">${p.cantidad} unidades vendidas</div>
      </div>
      <div class="prod-total">${formatMoney(p.total)}</div>
    </div>
  `).join('');
}

function renderQuickMovements(movs) {
  const container = document.getElementById('quickMovementsList');
  if (!container) return;

  if (movs.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No hay movimientos recientes</div>';
    return;
  }

  container.innerHTML = movs.slice(0, 5).map(m => createTimelineItemHTML(m)).join('');
}

// ==========================================
// 5. RENDERIZADO: MESAS EN VIVO
// ==========================================

function renderTables(tables) {
  const container = document.getElementById('tablesGridContainer');
  const countBadge = document.getElementById('tablesSummaryCount');
  const totalBadge = document.getElementById('tablesSummaryTotal');
  if (!container) return;

  const list = tables || [];
  const totalConsumo = list.reduce((acc, t) => acc + (Number(t.total) || (Array.isArray(t.items) ? t.items.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0) : 0)), 0);

  if (countBadge) countBadge.textContent = `${list.length} ${list.length === 1 ? 'Mesa Ocupada' : 'Mesas Ocupadas'}`;
  if (totalBadge) totalBadge.textContent = `${formatMoney(totalConsumo)} en Consumo`;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-card);">
        <i class="fa-solid fa-champagne-glasses" style="font-size: 32px; color: var(--text-muted); margin-bottom: 10px;"></i>
        <h3 style="font-size: 16px;">Todas las mesas están libres</h3>
        <p style="font-size: 12px; color: var(--text-secondary);">Cuando se abra una cuenta en el POS físico aparecerá aquí al instante.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(t => {
    const items = Array.isArray(t.items) ? t.items : [];
    const total = Number(t.total) || items.reduce((s, i) => s + ((Number(i.price || i.precio) || 0) * (Number(i.qty || i.cantidad) || 1)), 0);
    const mesaNombre = t.mesa || t.name || 'Mesa';
    const horaApertura = t.hora || (t.createdAt ? new Date(t.createdAt).toLocaleTimeString('es-CO') : '');

    return `
      <div class="table-card">
        <div class="table-card-header">
          <div class="table-title">
            <i class="fa-solid fa-martini-glass"></i>
            ${escapeHtml(mesaNombre)}
          </div>
          <span class="table-time-badge"><i class="fa-regular fa-clock"></i> ${horaApertura || 'En curso'}</span>
        </div>

        <div class="table-items-list">
          ${items.map(it => `
            <div class="table-item-row">
              <span>${it.qty || it.cantidad || 1}x ${escapeHtml(it.name || it.nombre || 'Item')}</span>
              <span>${formatMoney((Number(it.price || it.precioUnitario) || 0) * (Number(it.qty || it.cantidad) || 1))}</span>
            </div>
          `).join('')}
        </div>

        <div class="table-footer">
          <span style="font-size: 12px; color: var(--text-secondary);">Total Consumo:</span>
          <span class="table-total">${formatMoney(total)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 6. RENDERIZADO: AUDITORÍA Y TIMELINE
// ==========================================

let movementSearchTimer = null;
function debounceMovementSearch() {
  clearTimeout(movementSearchTimer);
  movementSearchTimer = setTimeout(loadMovements, 300);
}

async function loadMovements() {
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  const type = document.getElementById('filterMovementType')?.value || 'todos';
  const search = document.getElementById('filterMovementSearch')?.value || '';

  try {
    const url = `/api/movements?tipo=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}&limit=100`;
    const res = await fetch(url);
    const data = await res.json();
    cachedData.movements = data.movements || [];

    if (cachedData.movements.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md);">No se encontraron movimientos registrados</div>';
      return;
    }

    container.innerHTML = cachedData.movements.map(m => createTimelineItemHTML(m)).join('');
  } catch (err) {
    container.innerHTML = '<div style="color: var(--level-red); padding: 20px;">Error al cargar movimientos</div>';
  }
}

function createTimelineItemHTML(m) {
  const tipo = (m.tipo || 'aviso').toLowerCase();
  const iconClass = {
    venta: 'fa-solid fa-cart-shopping',
    gasto: 'fa-solid fa-arrow-down',
    ingreso: 'fa-solid fa-arrow-up',
    apertura: 'fa-solid fa-lock-open',
    cierre: 'fa-solid fa-lock',
    inventario: 'fa-solid fa-boxes-stacked',
    aviso: 'fa-solid fa-satellite-dish'
  }[tipo] || 'fa-solid fa-circle-dot';

  const tipoLabel = {
    venta: 'Venta Registrada',
    gasto: 'Gasto / Salida',
    ingreso: 'Ingreso Extra',
    apertura: 'Apertura de Caja',
    cierre: 'Cierre de Turno',
    inventario: 'Ajuste Inventario',
    aviso: 'Mensaje Remoto'
  }[tipo] || tipo.toUpperCase();

  const amountFormatted = m.monto ? formatMoney(m.monto) : '';

  // Pills de metadatos profesionales
  const userPill = `<span class="timeline-pill user-pill"><i class="fa-solid fa-user-shield"></i> ${escapeHtml(m.usuario || 'Sistema')}</span>`;
  const mesaPill = m.mesa ? `<span class="timeline-pill mesa-pill"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(m.mesa)}</span>` : '';
  const metodoPill = m.metodoPago ? `<span class="timeline-pill pay-pill"><i class="fa-solid fa-credit-card"></i> ${escapeHtml(m.metodoPago)}</span>` : '';

  return `
    <div class="timeline-item">
      <div class="timeline-icon type-${tipo}">
        <i class="${iconClass}"></i>
      </div>
      <div class="timeline-body">
        <div class="timeline-header-row">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="badge-tipo badge-${tipo}"><i class="${iconClass}"></i> ${tipoLabel}</span>
            <div class="timeline-title">${escapeHtml(m.titulo || 'Movimiento')}</div>
          </div>
          <div class="timeline-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(m.hora || '')} <span style="opacity:0.6;">(${escapeHtml(m.fecha || '')})</span></div>
        </div>
        <div class="timeline-detail">${escapeHtml(m.detalle || '')}</div>
        <div class="timeline-meta">
          ${userPill}
          ${mesaPill}
          ${metodoPill}
        </div>
      </div>
      ${amountFormatted ? `<div class="timeline-amount ${tipo === 'gasto' ? 'text-danger' : 'text-success'}">${tipo === 'gasto' ? '-' : '+'}${amountFormatted}</div>` : ''}
    </div>
  `;
}

function exportMovementsCSV() {
  if (!cachedData.movements || cachedData.movements.length === 0) {
    alert("No hay movimientos para exportar.");
    return;
  }

  let csv = "ID,Fecha,Hora,Tipo,Titulo,Detalle,Monto,Usuario,Mesa,MetodoPago\n";
  cachedData.movements.forEach(m => {
    const row = [
      m.id || '',
      `"${m.fecha || ''}"`,
      `"${m.hora || ''}"`,
      `"${m.tipo || ''}"`,
      `"${(m.titulo || '').replace(/"/g, '""')}"`,
      `"${(m.detalle || '').replace(/"/g, '""')}"`,
      m.monto || 0,
      `"${m.usuario || ''}"`,
      `"${m.mesa || ''}"`,
      `"${m.metodoPago || ''}"`
    ];
    csv += row.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Auditoria_Movimientos_LEVEL_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Exportar Reporte Ejecutivo Oficial en PDF
function exportMovementsPDF() {
  const movs = cachedData.movements || [];
  if (movs.length === 0) {
    alert("No hay movimientos registrados para exportar.");
    return;
  }

  const k = cachedData.metrics?.kpis || {};
  const fechaHoy = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const horaHoy = new Date().toLocaleTimeString('es-CO');

  // Si jsPDF está disponible en el navegador
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // 1. Cabecera Ejecutiva Oscura y Dorada
      doc.setFillColor(10, 17, 40); // Navy Dark
      doc.rect(0, 0, 210, 38, 'F');

      // Línea de Acento Cian / Oro
      doc.setFillColor(0, 243, 255);
      doc.rect(0, 38, 210, 1.5, 'F');

      // Título
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(255, 215, 0); // Gold
      doc.text("LEVEL GASTROBAR", 14, 16);

      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text("REPORTE EJECUTIVO DE AUDITORÍA Y REGISTRO DE MOVIMIENTOS", 14, 23);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Fecha de emisión: ${fechaHoy} - ${horaHoy} | Generado por: Administrador`, 14, 30);
      doc.text(`Estado del POS: ${k.posOnline ? (k.cajaAbierta ? 'TURNO EN CURSO' : 'POS EN LÍNEA') : 'DESCONECTADO'} | Cajero: ${k.cajeroActual || 'N/A'}`, 14, 35);

      // 2. Resumen de Métricas Financieras (Cajas KPI en el PDF)
      const startY = 46;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, startY, 182, 22, 2, 2, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, startY, 182, 22, 2, 2, 'S');

      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("VENTAS TOTALES", 20, startY + 6);
      doc.text("UTILIDAD ESTIMADA", 65, startY + 6);
      doc.text("GASTOS TOTALES", 115, startY + 6);
      doc.text("BALANCE NETO", 155, startY + 6);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129); // Verde
      doc.text(formatMoney(k.totalVentasHoy || 0), 20, startY + 14);

      doc.setTextColor(6, 182, 212); // Cian
      const utilTxt = `${formatMoney(k.utilidadBrutaHoy || 0)} (${k.margenUtilidadPct || 0}%)`;
      doc.text(utilTxt, 65, startY + 14);

      doc.setTextColor(239, 68, 68); // Rojo
      doc.text(formatMoney(k.totalGastosHoy || 0), 115, startY + 14);

      doc.setTextColor(15, 23, 42); // Navy
      doc.text(formatMoney(k.balanceNetoHoy || 0), 155, startY + 14);

      // 3. Tabla de Movimientos
      const tableData = movs.map((m, idx) => [
        idx + 1,
        `${m.hora || ''}\n${m.fecha || ''}`,
        (m.tipo || '').toUpperCase(),
        `${m.titulo || ''}\n${m.detalle || ''}`,
        m.usuario || 'Sistema',
        m.mesa ? `Mesa: ${m.mesa}` : (m.metodoPago || '-'),
        m.monto ? (m.tipo === 'gasto' ? `-${formatMoney(m.monto)}` : `+${formatMoney(m.monto)}`) : '-'
      ]);

      doc.autoTable({
        startY: startY + 28,
        head: [['#', 'Hora/Fecha', 'Tipo', 'Detalle del Movimiento', 'Usuario', 'Ubicación / Pago', 'Monto ($)']],
        body: tableData,
        theme: 'striped',
        styles: {
          fontSize: 7.5,
          cellPadding: 2.5,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [10, 17, 40],
          textColor: [0, 243, 255],
          fontStyle: 'bold',
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 24, fontSize: 7 },
          2: { cellWidth: 20, fontStyle: 'bold' },
          3: { cellWidth: 70 },
          4: { cellWidth: 22 },
          5: { cellWidth: 20 },
          6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didDrawPage: (data) => {
          // Pie de Página en cada hoja
          const pageCount = doc.internal.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(`LEVEL Gastrobar POS System • Documento Confidencial • Página ${data.pageNumber} de ${pageCount}`, 14, 290);
        }
      });

      doc.save(`Auditoria_Oficial_LEVEL_${new Date().toISOString().slice(0, 10)}.pdf`);
      showLiveNotification('📄 PDF Generado', 'Reporte oficial de auditoría descargado exitosamente');
      return;
    } catch (e) {
      console.warn("Fallo en jsPDF, utilizando vista de impresión:", e);
    }
  }

  // Fallback: Impresión directa profesional con HTML si jsPDF no estuviera listo
  const printWin = window.open('', '_blank');
  if (!printWin) {
    alert("Por favor habilita las ventanas emergentes para generar el PDF.");
    return;
  }

  const tableRows = movs.map((m, i) => `
    <tr>
      <td style="text-align:center;">${i+1}</td>
      <td>${escapeHtml(m.hora || '')} ${escapeHtml(m.fecha || '')}</td>
      <td><strong>${escapeHtml((m.tipo || '').toUpperCase())}</strong></td>
      <td><strong>${escapeHtml(m.titulo || '')}</strong><br><small style="color:#666;">${escapeHtml(m.detalle || '')}</small></td>
      <td>${escapeHtml(m.usuario || 'Sistema')}</td>
      <td>${escapeHtml(m.mesa || m.metodoPago || '-')}</td>
      <td style="text-align:right; font-weight:bold; color:${m.tipo === 'gasto' ? '#dc2626' : '#16a34a'};">${m.monto ? (m.tipo === 'gasto' ? '-' : '+') + formatMoney(m.monto) : '-'}</td>
    </tr>
  `).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Auditoría LEVEL Gastrobar</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #1e293b; }
        .header { border-bottom: 3px solid #00f3ff; padding-bottom: 12px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end; }
        h1 { margin: 0; color: #0a1128; font-size: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 15px; }
        th { background: #0a1128; color: #00f3ff; padding: 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 15px; }
        .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; }
        .kpi-title { font-size: 10px; color: #64748b; font-weight: bold; }
        .kpi-val { font-size: 16px; font-weight: bold; margin-top: 4px; }
        @media print { body { padding: 0; } button { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>LEVEL GASTROBAR</h1>
          <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Reporte Oficial de Auditoría y Movimientos</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#64748b;">
          Emisión: ${fechaHoy} ${horaHoy}
        </div>
      </div>
      <div class="kpis">
        <div class="kpi-box"><div class="kpi-title">VENTAS HOY</div><div class="kpi-val" style="color:#16a34a;">${formatMoney(k.totalVentasHoy || 0)}</div></div>
        <div class="kpi-box"><div class="kpi-title">UTILIDAD ESTIMADA</div><div class="kpi-val" style="color:#0284c7;">${formatMoney(k.utilidadBrutaHoy || 0)} (${k.margenUtilidadPct || 0}%)</div></div>
        <div class="kpi-box"><div class="kpi-title">GASTOS HOY</div><div class="kpi-val" style="color:#dc2626;">${formatMoney(k.totalGastosHoy || 0)}</div></div>
        <div class="kpi-box"><div class="kpi-title">BALANCE NETO</div><div class="kpi-val" style="color:#0a1128;">${formatMoney(k.balanceNetoHoy || 0)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Hora/Fecha</th>
            <th>Tipo</th>
            <th>Detalle</th>
            <th>Usuario</th>
            <th>Mesa / Pago</th>
            <th style="text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  printWin.document.close();
}

// ==========================================
// 7. HISTORIAL DE VENTAS
// ==========================================

async function loadSales() {
  const search = document.getElementById('salesSearchInput')?.value || '';
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/sales?search=${encodeURIComponent(search)}&limit=50`);
    const data = await res.json();
    cachedData.sales = data.sales || [];

    if (cachedData.sales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No hay ventas registradas</td></tr>';
      return;
    }

    tbody.innerHTML = cachedData.sales.map(v => {
      const itemsTxt = Array.isArray(v.items) ? v.items.map(i => `${i.cantidad || i.qty}x ${i.nombre || i.name}`).join(', ') : '';
      return `
        <tr>
          <td><strong class="text-gold">#${v.id}</strong></td>
          <td>${escapeHtml(v.fecha || '')} ${escapeHtml(v.hora || '')}</td>
          <td>${escapeHtml(v.mesa || 'Caja')}</td>
          <td>${escapeHtml(v.cajero || 'Cajero')}</td>
          <td><span class="badge-remote">${escapeHtml(v.metodoPago || 'Efectivo')}</span></td>
          <td style="max-width: 300px; font-size: 12px; color: var(--text-secondary);">${escapeHtml(itemsTxt)}</td>
          <td><strong class="text-success">${formatMoney(v.monto)}</strong></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--level-red);">Error al cargar ventas</td></tr>';
  }
}

// ==========================================
// 8. INVENTARIO & STOCK EN LA NUBE (PRO)
// ==========================================

async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    const data = await res.json();
    cachedData.inventory = data.products || [];

    // Llenar selector de categorías
    const catSelect = document.getElementById('inventoryCategoryFilter');
    if (catSelect) {
      const cats = Array.from(new Set(cachedData.inventory.map(p => p.category).filter(Boolean)));
      const curVal = catSelect.value;
      catSelect.innerHTML = '<option value="todas">Todas las categorías</option>' + cats.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
      if (curVal && cats.includes(curVal)) {
        catSelect.value = curVal;
      }
    }

    renderInventory();
  } catch (err) {
    console.error("Error al cargar inventario:", err);
  }
}

function setInventoryQuickFilter(filter, btnElement) {
  currentInventoryFilter = filter;
  document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
  if (btnElement) {
    btnElement.classList.add('active');
  }
  renderInventory();
}

function setInventoryViewMode(mode) {
  currentInventoryView = mode;
  const btnCards = document.getElementById('btnViewCards');
  const btnTable = document.getElementById('btnViewTable');
  const cardsGrid = document.getElementById('inventoryCardsGrid');
  const tableView = document.getElementById('inventoryTableView');

  if (mode === 'cards') {
    if (btnCards) btnCards.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
    if (cardsGrid) cardsGrid.classList.remove('hidden');
    if (tableView) tableView.classList.add('hidden');
  } else {
    if (btnTable) btnTable.classList.add('active');
    if (btnCards) btnCards.classList.remove('active');
    if (tableView) tableView.classList.remove('hidden');
    if (cardsGrid) cardsGrid.classList.add('hidden');
  }

  renderInventory();
}

function renderInventory() {
  const allProducts = cachedData.inventory || [];
  const search = document.getElementById('inventorySearchInput')?.value.toLowerCase().trim() || '';
  const categorySelect = document.getElementById('inventoryCategoryFilter')?.value || 'todas';

  // 1. Calcular KPIs Globales de Inventario
  const totalCountEl = document.getElementById('invTotalCount');
  const totalValueEl = document.getElementById('invTotalValue');
  const lowCountEl = document.getElementById('invLowCount');
  const emptyCountEl = document.getElementById('invEmptyCount');

  let totalValue = 0;
  let lowCount = 0;
  let emptyCount = 0;

  allProducts.forEach(p => {
    const stock = typeof p.stock === 'number' ? p.stock : Number(p.stock) || 0;
    const price = Number(p.price || p.precio) || 0;
    totalValue += (stock * price);
    if (stock <= 0) emptyCount++;
    else if (stock <= 5) lowCount++;
  });

  if (totalCountEl) totalCountEl.textContent = allProducts.length;
  if (totalValueEl) totalValueEl.textContent = formatMoney(totalValue);
  if (lowCountEl) lowCountEl.textContent = lowCount;
  if (emptyCountEl) emptyCountEl.textContent = emptyCount;

  // 2. Filtrar lista según búsqueda, categoría y botón rápido
  let list = [...allProducts];

  // Filtro por selector
  if (categorySelect !== 'todas') {
    list = list.filter(p => (p.category || '').toLowerCase() === categorySelect.toLowerCase());
  }

  // Filtro por Quick Filter
  if (currentInventoryFilter === 'low') {
    list = list.filter(p => {
      const s = Number(p.stock) || 0;
      return s > 0 && s <= 5;
    });
  } else if (currentInventoryFilter === 'empty') {
    list = list.filter(p => (Number(p.stock) || 0) <= 0);
  } else if (currentInventoryFilter === 'cervezas') {
    list = list.filter(p => (p.category || '').toLowerCase().includes('cerveza'));
  } else if (currentInventoryFilter === 'licores') {
    list = list.filter(p => (p.category || '').toLowerCase().includes('licor'));
  } else if (currentInventoryFilter === 'whisky') {
    list = list.filter(p => (p.category || '').toLowerCase().includes('whisky'));
  }

  // Filtro por texto de búsqueda
  if (search) {
    list = list.filter(p => {
      const name = (p.name || p.nombre || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return name.includes(search) || cat.includes(search);
    });
  }

  // 3. Renderizar Vista de Tarjetas (Cards View)
  const cardsGrid = document.getElementById('inventoryCardsGrid');
  if (cardsGrid) {
    if (list.length === 0) {
      cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fa-solid fa-boxes-stacked" style="font-size: 32px; margin-bottom: 10px; color: rgba(255,255,255,0.2);"></i>
          <p>No se encontraron productos con los filtros seleccionados.</p>
        </div>
      `;
    } else {
      cardsGrid.innerHTML = list.map(p => {
        const prodName = p.name || p.nombre || 'Producto';
        const prodCat = p.category || 'Varios';
        const prodPrice = Number(p.price || p.precio) || 0;
        const prodCost = Number(p.cost || p.costo) || 0;
        const stock = typeof p.stock === 'number' ? p.stock : Number(p.stock) || 0;

        let badgeClass = 'ok';
        let badgeText = 'Óptimo';
        let barColor = '#00ff88';
        let pct = Math.min(100, Math.max(8, (stock / 24) * 100));

        if (stock <= 0) {
          badgeClass = 'empty';
          badgeText = 'Agotado';
          barColor = '#ff3366';
          pct = 4;
        } else if (stock <= 5) {
          badgeClass = 'low';
          badgeText = 'Stock Bajo';
          barColor = '#ffaa00';
          pct = Math.max(12, (stock / 24) * 100);
        }

        // Icono por categoría
        let catIcon = 'fa-solid fa-wine-glass';
        if (prodCat.includes('cerveza')) catIcon = 'fa-solid fa-beer-mug-empty text-gold';
        else if (prodCat.includes('whisky')) catIcon = 'fa-solid fa-martini-glass text-gold';
        else if (prodCat.includes('michelada')) catIcon = 'fa-solid fa-lemon text-cyan';
        else if (prodCat.includes('licor')) catIcon = 'fa-solid fa-wine-bottle text-purple';

        const imgTag = p.image 
          ? `<img src="${p.image}" class="inv-prod-img" onerror="this.outerHTML='<div class=\\'inv-prod-img\\' style=\\'display:flex;align-items:center;justify-content:center;\\'><i class=\\'${catIcon}\\'></i></div>'">`
          : `<div class="inv-prod-img" style="display:flex;align-items:center;justify-content:center;"><i class="${catIcon}"></i></div>`;

        return `
          <div class="inv-prod-card">
            <div class="inv-card-top">
              ${imgTag}
              <div class="inv-prod-info">
                <div class="inv-prod-title" title="${escapeHtml(prodName)}">${escapeHtml(prodName)}</div>
                <div class="inv-prod-cat">${escapeHtml(prodCat)}</div>
              </div>
            </div>

            <div>
              <div class="inv-stock-row">
                <div class="inv-stock-qty" style="color: ${barColor};">${stock} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">unidades</span></div>
                <span class="stock-badge ${badgeClass}">${badgeText}</span>
              </div>
              <div class="inv-stock-bar-wrap">
                <div class="inv-stock-bar" style="width: ${pct}%; background: ${barColor};"></div>
              </div>
            </div>

            <div class="inv-card-footer">
              <div>
                <div class="inv-price-tag">${formatMoney(prodPrice)}</div>
                ${prodCost > 0 ? `<div style="font-size: 10px; color: var(--text-muted);">Costo: ${formatMoney(prodCost)}</div>` : ''}
              </div>
              <div style="display: flex; gap: 5px; align-items: center;">
                <button type="button" class="btn-refresh" style="padding: 4px 7px; font-size: 11px; background: rgba(255, 51, 102, 0.15); border-color: #ff3366; color: #ff3366;" onclick="quickAdjustStock(${p.id}, -1)" title="Restar 1">-1</button>
                <button type="button" class="btn-refresh" style="padding: 4px 7px; font-size: 11px; background: rgba(0, 255, 136, 0.15); border-color: #00ff88; color: #00ff88;" onclick="quickAdjustStock(${p.id}, 1)" title="Sumar 1">+1</button>
                <button type="button" class="btn-adjust-stock" onclick="openStockModal(${p.id})" title="Ajuste de Stock">
                  <i class="fa-solid fa-sliders"></i>
                </button>
                <button type="button" class="btn-adjust-stock" onclick="openProductEditModal(${p.id})" title="Editar Producto Completo" style="border-color: #00f3ff; color: #00f3ff;">
                  <i class="fa-solid fa-pen"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Renderizar Vista de Tabla (Table View)
  const tbody = document.getElementById('inventoryTableBody');
  if (tbody) {
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 25px; color: var(--text-muted);">No se encontraron productos</td></tr>';
    } else {
      tbody.innerHTML = list.map(p => {
        const prodName = p.name || p.nombre || 'Producto';
        const prodCat = p.category || 'Varios';
        const prodPrice = Number(p.price || p.precio) || 0;
        const prodCost = Number(p.cost || p.costo) || 0;
        const stock = typeof p.stock === 'number' ? p.stock : Number(p.stock) || 0;
        const margin = prodPrice - prodCost;
        const marginPct = prodPrice > 0 ? Math.round((margin / prodPrice) * 100) : 0;

        let badgeClass = 'ok';
        let badgeText = 'Óptimo';
        if (stock <= 0) { badgeClass = 'empty'; badgeText = 'Agotado'; }
        else if (stock <= 5) { badgeClass = 'low'; badgeText = 'Stock Bajo'; }

        return `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong>${escapeHtml(prodName)}</strong>
              </div>
            </td>
            <td><span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${escapeHtml(prodCat)}</span></td>
            <td>${formatMoney(prodCost)}</td>
            <td><strong class="text-gold">${formatMoney(prodPrice)}</strong></td>
            <td><span style="font-size: 12px; color: ${margin > 0 ? '#00ff88' : 'var(--text-muted)'};">${formatMoney(margin)} (${marginPct}%)</span></td>
            <td><strong style="font-size: 15px; font-family: 'Orbitron', monospace;">${stock}</strong> un.</td>
            <td><span class="stock-badge ${badgeClass}">${badgeText}</span></td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 4px;">
                <button type="button" class="btn-refresh" style="padding: 2px 6px; font-size: 11px; background: rgba(255, 51, 102, 0.15); border-color: #ff3366; color: #ff3366;" onclick="quickAdjustStock(${p.id}, -1)">-1</button>
                <button type="button" class="btn-refresh" style="padding: 2px 6px; font-size: 11px; background: rgba(0, 255, 136, 0.15); border-color: #00ff88; color: #00ff88;" onclick="quickAdjustStock(${p.id}, 1)">+1</button>
                <button type="button" class="btn-refresh" style="padding: 2px 6px; font-size: 11px; background: rgba(0, 243, 255, 0.15); border-color: #00f3ff; color: #00f3ff;" onclick="openStockModal(${p.id})" title="Stock"><i class="fa-solid fa-sliders"></i></button>
                <button type="button" class="btn-refresh" style="padding: 2px 6px; font-size: 11px; background: rgba(168, 85, 247, 0.15); border-color: #a855f7; color: #a855f7;" onclick="openProductEditModal(${p.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function parseMoneyNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const clean = String(val).replace(/[^0-9]/g, '');
  return parseInt(clean, 10) || 0;
}

function parseStockNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  const clean = String(val).replace(/[^0-9]/g, '');
  return Math.max(0, parseInt(clean, 10) || 0);
}

// Modal de Ajuste de Stock
function openStockModal(prodId) {
  const prod = (cachedData.inventory || []).find(p => String(p.id) === String(prodId));
  if (!prod) return;

  activeAdjustProduct = prod;
  const modal = document.getElementById('modalStockAdjust');
  const nameEl = document.getElementById('modalStockProdName');
  const catEl = document.getElementById('modalStockProdCategory');
  const displayEl = document.getElementById('modalStockCurrentDisplay');
  const inputEl = document.getElementById('modalStockExactInput');

  if (nameEl) nameEl.textContent = prod.name || prod.nombre;
  if (catEl) catEl.textContent = prod.category || 'Categoría';
  const curStock = parseStockNumber(prod.stock);
  if (displayEl) displayEl.textContent = curStock;
  if (inputEl) inputEl.value = curStock;

  if (modal) modal.classList.remove('hidden');
}

function closeStockModal() {
  activeAdjustProduct = null;
  const modal = document.getElementById('modalStockAdjust');
  if (modal) modal.classList.add('hidden');
}

function adjustStockDelta(delta) {
  const inputEl = document.getElementById('modalStockExactInput');
  const displayEl = document.getElementById('modalStockCurrentDisplay');
  if (!inputEl) return;

  let val = parseStockNumber(inputEl.value);
  val = Math.max(0, val + Number(delta));
  inputEl.value = val;
  if (displayEl) displayEl.textContent = val;
}

async function saveStockAdjustment() {
  if (!activeAdjustProduct) return;

  const inputEl = document.getElementById('modalStockExactInput');
  const newStock = parseStockNumber(inputEl ? inputEl.value : 0);
  const prodId = activeAdjustProduct.id;

  try {
    const res = await fetch('/api/remote/update-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': authToken || 'level-secret-token-2026'
      },
      body: JSON.stringify({
        productId: prodId,
        newStock: newStock,
        razon: 'Ajuste remoto desde Dashboard Web',
        usuario: 'Administrador (Dashboard)'
      })
    });

    const data = await res.json();
    if (data.success && data.product) {
      const idx = (cachedData.inventory || []).findIndex(p => String(p.id) === String(prodId));
      if (idx >= 0) {
        cachedData.inventory[idx] = data.product;
      }
      closeStockModal();
      renderInventory();
      showLiveNotification('📦 Stock Actualizado', `${activeAdjustProduct.name || 'Producto'} fijado en ${newStock} unidades`);
    } else {
      alert("Error actualizando stock: " + (data.error || 'Desconocido'));
    }
  } catch (err) {
    alert("Error de conexión al actualizar stock: " + err.message);
  }
}

// Modal de Creación / Edición Completa de Producto
function openNewProductModal() {
  const modal = document.getElementById('modalProductEdit');
  const title = document.getElementById('modalProdEditTitle');
  const idInput = document.getElementById('editProdId');
  const nameInput = document.getElementById('editProdName');
  const catInput = document.getElementById('editProdCategory');
  const stockInput = document.getElementById('editProdStock');
  const costInput = document.getElementById('editProdCost');
  const priceInput = document.getElementById('editProdPrice');

  if (title) title.textContent = 'Nuevo Producto';
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (catInput) catInput.value = 'cervezas';
  if (stockInput) stockInput.value = '10';
  if (costInput) costInput.value = '';
  if (priceInput) priceInput.value = '';

  if (modal) modal.classList.remove('hidden');
}

function openProductEditModal(prodId) {
  const prod = (cachedData.inventory || []).find(p => String(p.id) === String(prodId));
  if (!prod) return;

  const modal = document.getElementById('modalProductEdit');
  const title = document.getElementById('modalProdEditTitle');
  const idInput = document.getElementById('editProdId');
  const nameInput = document.getElementById('editProdName');
  const catInput = document.getElementById('editProdCategory');
  const stockInput = document.getElementById('editProdStock');
  const costInput = document.getElementById('editProdCost');
  const priceInput = document.getElementById('editProdPrice');

  if (title) title.textContent = `Editar Producto: ${prod.name || prod.nombre}`;
  if (idInput) idInput.value = prod.id;
  if (nameInput) nameInput.value = prod.name || prod.nombre || '';
  if (catInput) catInput.value = (prod.category || 'otros').toLowerCase();
  if (stockInput) stockInput.value = parseStockNumber(prod.stock);
  if (costInput) costInput.value = parseMoneyNumber(prod.cost || prod.costo);
  if (priceInput) priceInput.value = parseMoneyNumber(prod.price || prod.precio);

  if (modal) modal.classList.remove('hidden');
}

function closeProductEditModal() {
  const modal = document.getElementById('modalProductEdit');
  if (modal) modal.classList.add('hidden');
}

async function saveProductEdit() {
  const idInput = document.getElementById('editProdId');
  const nameInput = document.getElementById('editProdName');
  const catInput = document.getElementById('editProdCategory');
  const stockInput = document.getElementById('editProdStock');
  const costInput = document.getElementById('editProdCost');
  const priceInput = document.getElementById('editProdPrice');

  const prodId = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const category = catInput ? catInput.value : 'otros';
  const stock = parseStockNumber(stockInput ? stockInput.value : 0);
  const cost = parseMoneyNumber(costInput ? costInput.value : 0);
  const price = parseMoneyNumber(priceInput ? priceInput.value : 0);

  if (!name) {
    alert("Por favor ingresa el nombre del producto.");
    return;
  }
  if (price <= 0) {
    alert("Por favor ingresa un precio de venta válido (ej: 6000 o 10000).");
    return;
  }

  const isNew = !prodId;
  const endpoint = isNew ? '/api/remote/create-product' : '/api/remote/update-product';
  const payload = {
    id: prodId ? Number(prodId) : undefined,
    name,
    category,
    stock,
    cost,
    price,
    usuario: 'Administrador (Dashboard)'
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': authToken || 'level-secret-token-2026'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.product) {
      if (isNew) {
        cachedData.inventory.push(data.product);
      } else {
        const idx = cachedData.inventory.findIndex(p => String(p.id) === String(prodId));
        if (idx >= 0) cachedData.inventory[idx] = data.product;
      }
      closeProductEditModal();
      renderInventory();
      showLiveNotification('✅ Producto Sincronizado', `${data.product.name} actualizado y enviado a la caja`);
    } else {
      alert("Error al guardar: " + (data.error || 'Desconocido'));
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  }
}

// Ajuste rápido en un solo clic (+1 / -1)
async function quickAdjustStock(prodId, delta) {
  const prod = (cachedData.inventory || []).find(p => String(p.id) === String(prodId));
  if (!prod) return;

  const curStock = parseStockNumber(prod.stock);
  const newStock = Math.max(0, curStock + delta);

  // Optimistic UI Update
  prod.stock = newStock;
  renderInventory();

  try {
    const res = await fetch('/api/remote/update-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': authToken || 'level-secret-token-2026'
      },
      body: JSON.stringify({
        productId: prodId,
        delta: delta,
        razon: `Ajuste rápido (${delta > 0 ? '+' : ''}${delta})`,
        usuario: 'Administrador (Dashboard)'
      })
    });

    const data = await res.json();
    if (data.success && data.product) {
      prod.stock = data.product.stock;
      renderInventory();
    } else if (!data.success) {
      prod.stock = curStock; // Rollback
      renderInventory();
      alert("Error al ajustar stock: " + data.error);
    }
  } catch (err) {
    prod.stock = curStock; // Rollback
    renderInventory();
    console.error("Error en quickAdjustStock:", err);
  }
}

// ==========================================
// 9. HELPERS Y UTILIDADES
// ==========================================

function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.value).then(() => {
      alert("Copiado al portapapeles: " + el.value);
    }).catch(() => {
      el.select();
      document.execCommand('copy');
      alert("Copiado: " + el.value);
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendRemoteBroadcast() {
  const input = document.getElementById('remoteBroadcastMsg');
  const statusEl = document.getElementById('broadcastStatus');
  const mensaje = input ? input.value.trim() : '';

  if (!mensaje) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#ff3366;"><i class="fa-solid fa-circle-exclamation"></i> Por favor escribe un mensaje.</span>';
    return;
  }

  if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transmitiendo a la caja...';

  try {
    const res = await fetch('/api/remote/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': authToken || 'level-secret-token-2026'
      },
      body: JSON.stringify({
        mensaje,
        emisor: 'Administrador (Control Remoto)',
        tipo: 'aviso'
      })
    });

    const data = await res.json();
    if (data.success) {
      if (input) input.value = '';
      if (statusEl) statusEl.innerHTML = '<span style="color:#00ff88;"><i class="fa-solid fa-circle-check"></i> ¡Mensaje enviado con éxito! Aparecerá en la pantalla del cajero.</span>';
      setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 4000);
      fetchDashboardData();
    } else {
      throw new Error(data.error || 'Error al enviar');
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#ff3366;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message}</span>`;
  }
}

// Auto-login si ya existe token
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('level_auth_token')) {
    showApp();
  }
});

