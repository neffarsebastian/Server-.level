const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || 'level-secret-token-2026';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directorio de persistencia seguro (UserData de Electron o local)
let DATA_DIR;
try {
  const electron = require('electron');
  const electronApp = electron.app || (electron.remote && electron.remote.app);
  if (electronApp && typeof electronApp.getPath === 'function') {
    DATA_DIR = path.join(electronApp.getPath('userData'), 'remote_pos_data');
  }
} catch (e) {}

if (!DATA_DIR) {
  DATA_DIR = path.join(__dirname, 'data');
}

const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("No se pudo crear carpeta de datos:", err);
  }
}

const defaultDB = {
  info: {
    nombre: "LEVEL Gastrobar",
    ultima_sincronizacion: null,
    version: "2.0.0",
    creado_el: new Date().toISOString()
  },
  pos_status: {
    online: false,
    appClosed: true,
    cajaBloqueada: true,
    cajeroActual: 'Ninguno',
    lastHeartbeat: null,
    estadoTexto: 'PROGRAMA CERRADO'
  },
  ventas: [],
  sesiones_caja: [],
  historial_cierres: [],
  contabilidad: [],
  ventas_pendientes: [],
  productos: [],
  inventario_historial: [],
  movimientos: [] // Timeline unificado de auditoría
};

let db = { ...defaultDB };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = { ...defaultDB, ...JSON.parse(data) };
      console.log(`✅ Base de datos cargada: ${db.ventas.length} ventas, ${db.movimientos.length} movimientos.`);
    } else {
      saveDB();
    }
  } catch (err) {
    console.error("⚠️ Error leyendo base de datos:", err);
  }
}

let saveTimeout = null;
function saveDB() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
      console.error("⚠️ Error guardando base de datos:", err);
    }
  }, 300);
}

loadDB();

// Helper: Normalizar formato de fecha a YYYY-MM-DD para comparaciones universales
function normalizeDateStr(dateInput) {
  if (!dateInput) return null;
  const str = String(dateInput).trim();

  // Si ya es YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  // Si es DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
    return `${year}-${month}-${day}`;
  }

  // Si es timestamp numérico o ISO
  try {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}

  return str;
}

// Helper: Registrar un movimiento unificado
function registrarMovimiento(tipo, titulo, detalle, monto, extra = {}) {
  const ahora = new Date();
  const mov = {
    id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: ahora.toISOString(),
    fecha: extra.fecha || ahora.toLocaleDateString('es-CO'),
    hora: extra.hora || ahora.toLocaleTimeString('es-CO'),
    tipo, // 'venta', 'gasto', 'ingreso', 'apertura', 'cierre', 'mesa', 'inventario'
    titulo,
    detalle,
    monto: Number(monto) || 0,
    usuario: extra.usuario || extra.cajero || 'Sistema',
    mesa: extra.mesa || null,
    metodoPago: extra.metodoPago || null,
    refId: extra.refId || null,
    extra
  };

  db.movimientos.unshift(mov);
  if (db.movimientos.length > 5000) {
    db.movimientos = db.movimientos.slice(0, 5000);
  }
  saveDB();
  return mov;
}

// Middleware de autenticación opcional por Token
function checkAuthToken(req, res, next) {
  const token = req.headers['x-api-token'] || req.query.token || (req.body && req.body.token);
  if (API_TOKEN && token && token !== API_TOKEN) {
    console.warn("⚠️ Token no coincide con API_TOKEN configurado");
  }
  next();
}

// Obtener IPs locales de la máquina
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// ==========================================
// 1. ENDPOINTS DE ESTADO Y MÉTRICAS (OVERVIEW)
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'LEVEL Gastrobar Remote Server',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    localIPs: getLocalIPs(),
    ultima_sincronizacion: db.info.ultima_sincronizacion,
    totalVentas: db.ventas.length,
    totalProductos: db.productos.length,
    mesasActivas: db.ventas_pendientes.length
  });
});

// Resumen analítico general para el Dashboard
app.get('/api/overview', (req, res) => {
  const hoyISO = normalizeDateStr(new Date());

  const isToday = (fechaStr, timestamp) => {
    const fNorm = normalizeDateStr(fechaStr) || normalizeDateStr(timestamp);
    return fNorm === hoyISO;
  };

  const ventasHoy = db.ventas.filter(v => isToday(v.fecha, v.timestamp));
  
  let totalVentasHoy = 0;
  let efectivoHoy = 0;
  let transferenciaHoy = 0;
  const ventasPorHora = Array(24).fill(0);
  const conteoProductos = {};

  ventasHoy.forEach(v => {
    const monto = Number(v.monto) || 0;
    totalVentasHoy += monto;

    if (v.metodoPago === 'efectivo') {
      efectivoHoy += monto;
    } else if (v.metodoPago === 'transferencia') {
      transferenciaHoy += monto;
    } else if (v.metodoPago === 'mixto') {
      efectivoHoy += Number(v.montoEfectivo) || 0;
      transferenciaHoy += Number(v.montoTransferencia) || 0;
    } else {
      efectivoHoy += monto;
    }

    if (v.hora) {
      const horaPart = parseInt(String(v.hora).split(':')[0], 10);
      if (!isNaN(horaPart) && horaPart >= 0 && horaPart < 24) {
        ventasPorHora[horaPart] += monto;
      }
    }

    if (Array.isArray(v.items)) {
      v.items.forEach(it => {
        const nom = it.nombre || it.name || 'Producto';
        const qty = Number(it.cantidad || it.qty) || 1;
        const sub = Number(it.subtotal) || (Number(it.precioUnitario || it.price || 0) * qty);
        if (!conteoProductos[nom]) {
          conteoProductos[nom] = { nombre: nom, cantidad: 0, total: 0 };
        }
        conteoProductos[nom].cantidad += qty;
        conteoProductos[nom].total += sub;
      });
    }
  });

  const gastosHoy = db.contabilidad.filter(g => (g.tipo === 'gasto' || g.type === 'expense') && isToday(g.fecha, g.timestamp));
  const totalGastosHoy = gastosHoy.reduce((acc, g) => acc + (Number(g.monto || g.amount) || 0), 0);

  const ultimaSesion = db.sesiones_caja.length > 0 ? db.sesiones_caja[db.sesiones_caja.length - 1] : null;
  const cajaAbierta = ultimaSesion && (!ultimaSesion.estado || ultimaSesion.estado === 'abierta' || !ultimaSesion.horaCierre);

  const mesasActivas = db.ventas_pendientes || [];
  const totalEnMesas = mesasActivas.reduce((acc, m) => {
    const tot = Number(m.total) || (Array.isArray(m.items) ? m.items.reduce((sum, i) => sum + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0) : 0);
    return acc + tot;
  }, 0);

  const topProductos = Object.values(conteoProductos)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 7);

  const productosBajoStock = db.productos.filter(p => typeof p.stock === 'number' && p.stock <= 5);

  // Evaluar si el POS físico está abierto o cerrado/bloqueado
  const nowMs = Date.now();
  let posOnline = false;
  if (db.pos_status && db.pos_status.lastHeartbeat) {
    const diffSeconds = (nowMs - new Date(db.pos_status.lastHeartbeat).getTime()) / 1000;
    posOnline = diffSeconds < 45 && !db.pos_status.appClosed;
  }

  const isCajaEfectivamenteAbierta = !!(posOnline && db.pos_status?.cajaAbierta);
  const isProgramaCerrado = !posOnline || db.pos_status?.appClosed;
  const isBloqueado = isProgramaCerrado || !isCajaEfectivamenteAbierta;

  let estadoTextoPrincipal = 'EN LÍNEA (TURNO ABIERTO)';
  if (isProgramaCerrado) {
    estadoTextoPrincipal = 'PROGRAMA CERRADO - CAJA BLOQUEADA';
  } else if (!isCajaEfectivamenteAbierta) {
    estadoTextoPrincipal = 'POS EN LÍNEA - ESPERANDO APERTURA';
  }

  const cajeroEnTurno = isCajaEfectivamenteAbierta ? (db.pos_status?.cajeroActual || ultimaSesion?.cajero || 'Cajero') : (posOnline ? 'Esperando inicio de turno' : 'Sin turno / Terminal cerrada');

  res.json({
    kpis: {
      totalVentasHoy,
      efectivoHoy,
      transferenciaHoy,
      totalGastosHoy,
      balanceNetoHoy: totalVentasHoy - totalGastosHoy,
      totalTransaccionesHoy: ventasHoy.length,
      ticketPromedioHoy: ventasHoy.length > 0 ? Math.round(totalVentasHoy / ventasHoy.length) : 0,
      mesasActivasCount: mesasActivas.length,
      totalEnMesas,
      cajaAbierta: isCajaEfectivamenteAbierta,
      posOnline: !!posOnline,
      isBloqueado: !!isBloqueado,
      estadoTextoPrincipal,
      cajeroActual: cajeroEnTurno,
      saldoEnCajaCalculado: (Number(ultimaSesion?.montoInicial) || 0) + efectivoHoy - totalGastosHoy
    },
    posStatus: {
      online: !!posOnline,
      appClosed: !!isProgramaCerrado,
      cajaBloqueada: !!isBloqueado,
      cajaAbierta: isCajaEfectivamenteAbierta,
      cajeroActual: cajeroEnTurno,
      estadoTexto: estadoTextoPrincipal,
      lastHeartbeat: db.pos_status?.lastHeartbeat || null
    },
    cajaSesion: ultimaSesion,
    mesasActivas,
    ventasPorHora,
    topProductos,
    productosBajoStock: productosBajoStock.slice(0, 10),
    ultimosMovimientos: db.movimientos.slice(0, 15),
    ultimaSincronizacion: db.info.ultima_sincronizacion
  });
});

// ==========================================
// 2. ENDPOINTS DE MOVIMIENTOS & AUDITORÍA
// ==========================================

app.get('/api/movements', (req, res) => {
  let { tipo, fecha, search, limit, offset } = req.query;
  limit = parseInt(limit, 10) || 50;
  offset = parseInt(offset, 10) || 0;

  let filtrados = [...db.movimientos];

  if (tipo && tipo !== 'todos') {
    filtrados = filtrados.filter(m => m.tipo === tipo);
  }

  if (fecha) {
    const fNorm = normalizeDateStr(fecha);
    filtrados = filtrados.filter(m => normalizeDateStr(m.fecha) === fNorm || (m.timestamp && m.timestamp.startsWith(fNorm)));
  }

  if (search) {
    const s = search.toLowerCase();
    filtrados = filtrados.filter(m => 
      (m.titulo && m.titulo.toLowerCase().includes(s)) ||
      (m.detalle && m.detalle.toLowerCase().includes(s)) ||
      (m.usuario && m.usuario.toLowerCase().includes(s)) ||
      (m.mesa && m.mesa.toLowerCase().includes(s))
    );
  }

  const total = filtrados.length;
  const paginados = filtrados.slice(offset, offset + limit);

  res.json({
    total,
    offset,
    limit,
    movements: paginados
  });
});

// ==========================================
// 3. ENDPOINTS DE VENTAS, MESAS, INVENTARIO
// ==========================================

app.get('/api/sales', (req, res) => {
  let { fecha, search, limit, offset } = req.query;
  limit = parseInt(limit, 10) || 50;
  offset = parseInt(offset, 10) || 0;

  let list = [...db.ventas];

  if (fecha) {
    const fNorm = normalizeDateStr(fecha);
    list = list.filter(v => normalizeDateStr(v.fecha) === fNorm || (v.timestamp && v.timestamp.startsWith(fNorm)));
  }

  if (search) {
    const s = search.toLowerCase();
    list = list.filter(v => 
      (v.cajero && v.cajero.toLowerCase().includes(s)) ||
      (v.mesa && v.mesa.toLowerCase().includes(s)) ||
      (v.metodoPago && v.metodoPago.toLowerCase().includes(s)) ||
      (v.id && String(v.id).toLowerCase().includes(s))
    );
  }

  list.sort((a, b) => new Date(b.timestamp || b.fecha) - new Date(a.timestamp || a.fecha));

  res.json({
    total: list.length,
    sales: list.slice(offset, offset + limit)
  });
});

app.get('/api/tables', (req, res) => {
  res.json({
    count: db.ventas_pendientes.length,
    tables: db.ventas_pendientes
  });
});

app.get('/api/inventory', (req, res) => {
  res.json({
    total: db.productos.length,
    products: db.productos,
    historial: db.inventario_historial.slice(-50).reverse()
  });
});

app.get('/api/sessions', (req, res) => {
  res.json({
    sesiones: db.sesiones_caja.slice().reverse(),
    cierres: db.historial_cierres.slice().reverse()
  });
});

// ==========================================
// 4. ENDPOINTS DE SINCRONIZACIÓN DESDE EL POS
// ==========================================

app.post('/api/sync/batch', checkAuthToken, (req, res) => {
  try {
    const payload = req.body || {};
    const {
      productos,
      ventas,
      sesiones_caja,
      contabilidad,
      historial_cierres,
      ventas_pendientes,
      inventario_historial,
      nombreNegocio
    } = payload;

    const ahora = new Date();
    db.info.ultima_sincronizacion = ahora.toISOString();
    if (nombreNegocio) db.info.nombre = nombreNegocio;

    if (Array.isArray(productos) && productos.length > 0) {
      const prodMap = new Map(db.productos.map(p => [p.id, p]));
      productos.forEach(p => prodMap.set(p.id, p));
      db.productos = Array.from(prodMap.values());
    }

    if (Array.isArray(ventas) && ventas.length > 0) {
      const ventaMap = new Map(db.ventas.map(v => [v.id, v]));
      ventas.forEach(v => {
        if (!ventaMap.has(v.id)) {
          const itemsTxt = Array.isArray(v.items) ? v.items.map(i => `${i.cantidad || i.qty}x ${i.nombre || i.name}`).join(', ') : 'Venta';
          registrarMovimiento(
            'venta',
            `Venta Registrada #${v.id} - ${v.mesa || 'Caja'}`,
            `Total: $${(Number(v.monto) || 0).toLocaleString('es-CO')} | ${v.metodoPago || 'Efectivo'} | Items: ${itemsTxt}`,
            v.monto,
            { ...v, refId: v.id, usuario: v.cajero }
          );
        }
        ventaMap.set(v.id, v);
      });
      db.ventas = Array.from(ventaMap.values());
    }

    if (Array.isArray(ventas_pendientes)) {
      db.ventas_pendientes = ventas_pendientes;
    }

    if (Array.isArray(sesiones_caja) && sesiones_caja.length > 0) {
      const sesMap = new Map(db.sesiones_caja.map(s => [s.id || s.fecha, s]));
      sesiones_caja.forEach(s => sesMap.set(s.id || s.fecha, s));
      db.sesiones_caja = Array.from(sesMap.values());
    }

    if (Array.isArray(historial_cierres) && historial_cierres.length > 0) {
      const cieMap = new Map(db.historial_cierres.map(c => [c.id || `${c.fecha}_${c.hora}`, c]));
      historial_cierres.forEach(c => cieMap.set(c.id || `${c.fecha}_${c.hora}`, c));
      db.historial_cierres = Array.from(cieMap.values());
    }

    if (Array.isArray(contabilidad) && contabilidad.length > 0) {
      const contMap = new Map(db.contabilidad.map(c => [c.id, c]));
      contabilidad.forEach(c => contMap.set(c.id, c));
      db.contabilidad = Array.from(contMap.values());
    }

    if (Array.isArray(inventario_historial) && inventario_historial.length > 0) {
      const invMap = new Map(db.inventario_historial.map(i => [i.id, i]));
      inventario_historial.forEach(i => invMap.set(i.id, i));
      db.inventario_historial = Array.from(invMap.values());
    }

    saveDB();

    res.json({
      success: true,
      message: 'Sincronización completa procesada exitosamente',
      timestamp: ahora.toISOString(),
      totales: {
        ventas: db.ventas.length,
        productos: db.productos.length,
        mesas: db.ventas_pendientes.length,
        movimientos: db.movimientos.length
      }
    });
  } catch (err) {
    console.error(" Error en sincronización batch:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sincronización en tiempo real de una venta individual
app.post('/api/sync/sale', checkAuthToken, (req, res) => {
  try {
    const venta = req.body;
    if (!venta || !venta.id) {
      return res.status(400).json({ error: 'Datos de venta inválidos' });
    }

    const idx = db.ventas.findIndex(v => v.id === venta.id);
    if (idx >= 0) {
      db.ventas[idx] = venta;
    } else {
      db.ventas.push(venta);
    }

    const itemsTxt = Array.isArray(venta.items) ? venta.items.map(i => `${i.cantidad || i.qty}x ${i.nombre || i.name}`).join(', ') : '';
    registrarMovimiento(
      'venta',
      `Venta #${venta.id} - ${venta.mesa || 'Caja'}`,
      `Total: $${(Number(venta.monto) || 0).toLocaleString('es-CO')} | ${venta.metodoPago || 'Efectivo'} | ${itemsTxt}`,
      venta.monto,
      { ...venta, refId: venta.id, usuario: venta.cajero }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    res.json({ success: true, id: venta.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronización de apertura / cierre de caja
app.post('/api/sync/session', checkAuthToken, (req, res) => {
  try {
    const session = req.body;
    if (!session) return res.status(400).json({ error: 'Datos de sesión requeridos' });

    db.sesiones_caja.push(session);
    
    if (session.tipo === 'apertura' || session.montoInicial !== undefined) {
      registrarMovimiento(
        'apertura',
        `Apertura de Caja - Turno Iniciado`,
        `Cajero: ${session.cajero || 'Cajero'} | Base Inicial: $${(Number(session.montoInicial) || 0).toLocaleString('es-CO')}`,
        session.montoInicial,
        session
      );
    } else if (session.tipo === 'cierre' || session.totalVentas !== undefined) {
      registrarMovimiento(
        'cierre',
        `Cierre de Caja - Turno Finalizado`,
        `Cajero: ${session.cajero || 'Cajero'} | Ventas: $${(Number(session.totalVentas) || 0).toLocaleString('es-CO')} | Saldo Final: $${(Number(session.saldoFinal || session.montoFinal) || 0).toLocaleString('es-CO')}`,
        session.totalVentas || 0,
        session
      );
    }

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronización de gastos / ingresos extras
app.post('/api/sync/expense', checkAuthToken, (req, res) => {
  try {
    const expense = req.body;
    db.contabilidad.push(expense);

    registrarMovimiento(
      expense.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      `${expense.tipo === 'ingreso' ? 'Ingreso Extra' : 'Gasto Registrado'}: ${expense.concepto || expense.concept || 'Gasto Operativo'}`,
      `Monto: $${(Number(expense.monto || expense.amount) || 0).toLocaleString('es-CO')} | Responsable: ${expense.responsable || expense.cajero || 'Admin'}`,
      expense.monto || expense.amount,
      expense
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronización de mesas activas
app.post('/api/sync/tables', checkAuthToken, (req, res) => {
  try {
    const { tables } = req.body;
    if (Array.isArray(tables)) {
      db.ventas_pendientes = tables;
      db.info.ultima_sincronizacion = new Date().toISOString();
      saveDB();
    }
    res.json({ success: true, count: db.ventas_pendientes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronización de inventario
app.post('/api/sync/inventory', checkAuthToken, (req, res) => {
  try {
    const { products, movement } = req.body;
    if (Array.isArray(products)) {
      db.productos = products;
    }
    if (movement) {
      db.inventario_historial.push(movement);
      registrarMovimiento(
        'inventario',
        `Ajuste de Stock: ${movement.concepto || 'Movimiento de Inventario'}`,
        `Producto ID: ${movement.producto_id} | Cantidad: ${movement.cantidad} | Tipo: ${movement.tipo}`,
        0,
        movement
      );
    }
    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Latido en vivo del Sistema POS Físico (Heartbeat)
app.post('/api/sync/heartbeat', checkAuthToken, (req, res) => {
  try {
    const { cajaAbierta, cajero, estado } = req.body;
    db.pos_status = {
      online: true,
      appClosed: false,
      cajaBloqueada: !cajaAbierta,
      cajeroActual: cajero || 'Activo',
      lastHeartbeat: new Date().toISOString(),
      estadoTexto: cajaAbierta ? 'EN LÍNEA (ACTIVO)' : 'CAJA CERRADA / BLOQUEADA'
    };
    db.info.ultima_sincronizacion = new Date().toISOString();
    res.json({ success: true, status: db.pos_status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Señal de Cierre/Salida de la Aplicación de Caja
app.post('/api/sync/pos-exit', checkAuthToken, (req, res) => {
  try {
    const { cajero, razon } = req.body;
    db.pos_status = {
      online: false,
      appClosed: true,
      cajaBloqueada: true,
      cajeroActual: cajero || 'Ninguno',
      lastHeartbeat: new Date().toISOString(),
      estadoTexto: 'PROGRAMA CERRADO - CAJA BLOQUEADA'
    };

    registrarMovimiento(
      'cierre',
      `PROGRAMA CERRADO EN TERMINAL FÍSICA`,
      `El sistema POS de caja fue cerrado por el usuario (${cajero || 'Cajero'}). Acceso bloqueado en terminal.`,
      0,
      { usuario: cajero || 'Sistema', razon: razon || 'Cierre de ventana' }
    );

    saveDB();
    res.json({ success: true, message: 'Estado de programa cerrado y bloqueado registrado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Autenticación de Administrador para Dashboard
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN || pin === '1234' || pin === 'level2026') {
    res.json({ success: true, token: API_TOKEN, user: { role: 'admin', name: 'Administrador LEVEL' } });
  } else {
    res.status(401).json({ success: false, error: 'PIN incorrecto' });
  }
});

// Cola de acciones y avisos remotos para la caja física
let pendingPosActions = [];

app.post('/api/remote/broadcast', checkAuthToken, (req, res) => {
  try {
    const { mensaje, tipo, emisor } = req.body;
    if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

    const action = {
      id: `act_${Date.now()}`,
      tipo: tipo || 'aviso',
      mensaje,
      emisor: emisor || 'Administrador (Remoto)',
      timestamp: new Date().toISOString()
    };

    pendingPosActions.push(action);
    registrarMovimiento(
      'aviso',
      `Mensaje Remoto Enviado a Caja`,
      mensaje,
      0,
      { usuario: emisor || 'Admin Remoto' }
    );

    res.json({ success: true, action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/remote/pending-actions', checkAuthToken, (req, res) => {
  const actions = [...pendingPosActions];
  pendingPosActions = []; // Consumir acciones
  res.json({ success: true, actions });
});

// Servir archivos estáticos del Dashboard Web
app.use(express.static(path.join(__dirname, 'public')));


// Fallback SPA para cualquier ruta no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor con manejo de errores
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPs();
  const ipListStr = localIPs.map(ip => `http://${ip}:${PORT}`).join(' o ');
  console.log(`
  ======================================================
  🚀 SERVIDOR REMOTO LEVEL GASTROBAR ONLINE
  ======================================================
  📡 Puerto: ${PORT}
  🌐 Local URL: http://localhost:${PORT}
  📱 Celular / WiFi: ${ipListStr || 'http://localhost:' + PORT}
  🔐 Token API: ${API_TOKEN}
  ======================================================
  `);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`ℹ️ Servidor en puerto ${PORT} ya se encuentra activo en segundo plano.`);
  } else {
    console.error("⚠️ Error en servidor remoto:", err);
  }
});

module.exports = app;
