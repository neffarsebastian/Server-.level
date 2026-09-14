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
// 2. NAVEGACIÓN Y PESTAÑAS
// ==========================================

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

  const activeBtn = document.getElementById(`tab-${tabId}`);
  const activePanel = document.getElementById(`view-${tabId}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tabId === 'movements') loadMovements();
  if (tabId === 'sales') loadSales();
  if (tabId === 'inventory') loadInventory();
}

// ==========================================
// 3. INICIALIZACIÓN Y POLLING EN VIVO
// ==========================================

function initDashboard() {
  fetchDashboardData();

  // Configurar URLs en vista de ajustes
  const curOrigin = window.location.origin;
  document.getElementById('serverUrlDisplay').value = curOrigin;
  const qrImg = document.getElementById('qrCodeImage');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(curOrigin)}`;
  }

  // Polling automático cada 7 segundos para refresco en tiempo real
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchDashboardData, 7000);
}

// Formateador de dinero en pesos colombianos
function formatMoney(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('es-CO');
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
    document.getElementById('syncTimeText').textContent = now.toLocaleTimeString('es-CO');
    document.getElementById('syncStatusText').textContent = 'Conectado en vivo';
    document.getElementById('syncStatusPill').style.borderColor = 'rgba(0, 255, 136, 0.3)';
  } catch (err) {
    console.warn("Error en polling dashboard:", err);
    document.getElementById('syncStatusText').textContent = 'Sin conexión';
    document.getElementById('syncStatusPill').style.borderColor = 'rgba(255, 51, 102, 0.4)';
  } finally {
    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('fa-spin'), 400);
  }
}

// ==========================================
// 4. RENDERIZADO: PANEL GENERAL & KPIS
// ==========================================

function renderOverview(data) {
  const k = data.kpis || {};

  // Caja Banner
  const cajaBanner = document.getElementById('cajaLiveBanner');
  const cajaStatusLabel = document.getElementById('cajaStatusLabel');
  const cajeroActiveName = document.getElementById('cajeroActiveName');
  const cajaCalculatedBalance = document.getElementById('cajaCalculatedBalance');

  if (k.cajaAbierta) {
    cajaStatusLabel.textContent = 'ESTADO: TURNO ABIERTO';
    cajeroActiveName.textContent = `Cajero: ${k.cajeroActual || 'Activo'}`;
    cajaCalculatedBalance.textContent = formatMoney(k.saldoEnCajaCalculado);
    cajaBanner.style.borderColor = 'rgba(0, 255, 136, 0.4)';
  } else {
    cajaStatusLabel.textContent = 'ESTADO: CAJA CERRADA';
    cajeroActiveName.textContent = 'Sin turno activo';
    cajaCalculatedBalance.textContent = '$0';
    cajaBanner.style.borderColor = 'rgba(255, 215, 0, 0.3)';
  }

  // KPIs
  document.getElementById('kpiTotalSales').textContent = formatMoney(k.totalVentasHoy);
  document.getElementById('kpiTxCount').textContent = `${k.totalTransaccionesHoy || 0} transacciones`;
  document.getElementById('kpiNetProfit').textContent = formatMoney(k.balanceNetoHoy);
  document.getElementById('kpiCash').textContent = formatMoney(k.efectivoHoy);
  document.getElementById('kpiTransfer').textContent = formatMoney(k.transferenciaHoy);
  document.getElementById('kpiExpenses').textContent = formatMoney(k.totalGastosHoy);
  document.getElementById('kpiActiveTables').textContent = k.mesasActivasCount || 0;
  document.getElementById('kpiTablesTotal').textContent = `${formatMoney(k.totalEnMesas)} en consumo`;

  // Badge en pestaña de mesas
  const tabBadge = document.getElementById('tabTablesCount');
  if (tabBadge) tabBadge.textContent = k.mesasActivasCount || 0;

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
  // Mostrar desde las 10 AM hasta las 3 AM (rango típico gastrobar) o las 24h
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
    const total = Number(t.total) || items.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
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

        <div class="table-card-footer">
          <span style="font-size: 11px; color: var(--text-muted);">${items.length} productos</span>
          <div class="table-total-amount">${formatMoney(total)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 6. AUDITORÍA: LÍNEA DE TIEMPO DE MOVIMIENTOS
// ==========================================

function debounceMovementSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(loadMovements, 300);
}

async function loadMovements() {
  const type = document.getElementById('filterMovementType')?.value || 'todos';
  const search = document.getElementById('filterMovementSearch')?.value || '';
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando movimientos...</div>';

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
  const iconClass = {
    venta: 'fa-solid fa-receipt',
    gasto: 'fa-solid fa-arrow-down-wide-short',
    ingreso: 'fa-solid fa-arrow-up-wide-short',
    apertura: 'fa-solid fa-unlock-keyhole',
    cierre: 'fa-solid fa-lock',
    inventario: 'fa-solid fa-boxes-stacked'
  }[m.tipo] || 'fa-solid fa-circle-dot';

  const amountFormatted = m.monto ? formatMoney(m.monto) : '';

  return `
    <div class="timeline-item">
      <div class="timeline-icon type-${m.tipo}">
        <i class="${iconClass}"></i>
      </div>
      <div class="timeline-body">
        <div class="timeline-header-row">
          <div class="timeline-title">${escapeHtml(m.titulo || 'Movimiento')}</div>
          <div class="timeline-time">${escapeHtml(m.hora || '')} - ${escapeHtml(m.fecha || '')}</div>
        </div>
        <div class="timeline-detail">${escapeHtml(m.detalle || '')}</div>
        <div class="timeline-meta">
          <span><i class="fa-solid fa-user"></i> ${escapeHtml(m.usuario || 'Sistema')}</span>
          ${m.mesa ? `<span><i class="fa-solid fa-tag"></i> ${escapeHtml(m.mesa)}</span>` : ''}
          ${m.metodoPago ? `<span><i class="fa-solid fa-credit-card"></i> ${escapeHtml(m.metodoPago)}</span>` : ''}
        </div>
      </div>
      ${amountFormatted ? `<div class="timeline-amount ${m.tipo === 'gasto' ? 'text-danger' : 'text-success'}">${m.tipo === 'gasto' ? '-' : '+'}${amountFormatted}</div>` : ''}
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
// 8. INVENTARIO EN LA NUBE
// ==========================================

async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    const data = await res.json();
    cachedData.inventory = data.products || [];

    // Llenar categorías
    const catSelect = document.getElementById('inventoryCategoryFilter');
    if (catSelect) {
      const cats = Array.from(new Set(cachedData.inventory.map(p => p.category).filter(Boolean)));
      catSelect.innerHTML = '<option value="todas">Todas las categorías</option>' + cats.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    }

    renderInventory();
  } catch (err) {
    console.error("Error al cargar inventario:", err);
  }
}

function renderInventory() {
  const tbody = document.getElementById('inventoryTableBody');
  const search = document.getElementById('inventorySearchInput')?.value.toLowerCase() || '';
  const category = document.getElementById('inventoryCategoryFilter')?.value || 'todas';
  const totalCountEl = document.getElementById('invTotalCount');
  if (!tbody) return;

  let list = cachedData.inventory || [];
  if (category !== 'todas') {
    list = list.filter(p => p.category === category);
  }
  if (search) {
    list = list.filter(p => p.name && p.name.toLowerCase().includes(search));
  }

  if (totalCountEl) totalCountEl.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron productos</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => {
    const stock = typeof p.stock === 'number' ? p.stock : 0;
    let badgeClass = 'ok';
    let badgeText = 'Óptimo';
    if (stock <= 0) { badgeClass = 'empty'; badgeText = 'Agotado'; }
    else if (stock <= 5) { badgeClass = 'low'; badgeText = 'Stock Bajo'; }

    return `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${escapeHtml(p.category || 'Varios')}</span></td>
        <td>${formatMoney(p.price)}</td>
        <td><strong style="font-size: 14px;">${stock}</strong> un.</td>
        <td><span class="stock-badge ${badgeClass}">${badgeText}</span></td>
      </tr>
    `;
  }).join('');
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

// Auto-login si ya existe token
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('level_auth_token')) {
    showApp();
  }
});
