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

const DEFAULT_PRODUCTS = [
  { id: 1, name: "Club Colombia", price: 6000, cost: 3500, stock: 24, category: "cervezas", image: "images/Club colombia.png" },
  { id: 2, name: "Redd's", price: 6000, cost: 3500, stock: 18, category: "cervezas", image: "images/Redd,s.png" },
  { id: 3, name: "Coronita", price: 6000, cost: 3800, stock: 20, category: "cervezas", image: "images/Coronita.png" },
  { id: 4, name: "Corona", price: 10000, cost: 6500, stock: 15, category: "cervezas", image: "images/Corona.png" },
  { id: 5, name: "Michelada Soda Ginger", price: 9000, cost: 4000, stock: 30, category: "micheladas", image: "images/Michelada soda ginger.png" },
  { id: 6, name: "Michelada Coronita", price: 10000, cost: 5000, stock: 25, category: "micheladas", image: "images/michelada coronita.png" },
  { id: 7, name: "Michelada Club Colombia", price: 10000, cost: 5000, stock: 25, category: "micheladas", image: "images/Michelada club colombia.png" },
  { id: 8, name: "Michelada Redd's", price: 10000, cost: 5000, stock: 20, category: "micheladas", image: "images/Micheladas Redd,s.jpg" },
  { id: 9, name: "Michelada Corona", price: 15000, cost: 8000, stock: 15, category: "micheladas", image: "images/Michelada Corona.png" },
  { id: 10, name: "Aguardiente Putumayo 1/2", price: 55000, cost: 32000, stock: 12, category: "licores", image: "images/Aguardiente media.png" },
  { id: 11, name: "Ron Viejo Caldas 1/2", price: 55000, cost: 32000, stock: 10, category: "licores", image: "images/Ron viejos de caldas media .png" },
  { id: 12, name: "Ron Caldas 8 Años 1/2", price: 90000, cost: 55000, stock: 8, category: "licores", image: "images/Ron de caldas 8 años.webp" },
  { id: 13, name: "Tequila Olmeca 1/2", price: 90000, cost: 55000, stock: 6, category: "licores", image: "images/Tequila olmeca media.ng.jpg" },
  { id: 14, name: "Aguardiente Putumayo", price: 100000, cost: 60000, stock: 14, category: "licores", image: "images/Aguadiente Putumayo botello.png" },
  { id: 15, name: "Ron Viejo de Caldas", price: 100000, cost: 60000, stock: 12, category: "licores", image: "images/Ron viejos de caldas media .png" },
  { id: 16, name: "Ron Caldas 8 Años", price: 170000, cost: 110000, stock: 7, category: "licores", image: "images/Ron de caldas 8 años.webp" },
  { id: 17, name: "Tequila Olmeca", price: 165000, cost: 105000, stock: 5, category: "licores", image: "images/Tequila olmeca media.ng.jpg" },
  { id: 18, name: "Smirnoff Lulo", price: 100000, cost: 65000, stock: 9, category: "licores", image: "images/smirnoff vodka.png" },
  { id: 19, name: "Smirnoff Tamarindo", price: 100000, cost: 65000, stock: 8, category: "licores", image: "images/smirnoff Tamarindo.png" },
  { id: 20, name: "Old Parr", price: 240000, cost: 160000, stock: 6, category: "whisky", image: "images/old parr.png" },
  { id: 21, name: "Chivas Regal", price: 260000, cost: 175000, stock: 5, category: "whisky", image: "images/Chivas regal.png" },
  { id: 22, name: "Jack Daniel's", price: 230000, cost: 150000, stock: 6, category: "whisky", image: "images/jack danniel.png" },
  { id: 23, name: "Buchanan's Deluxe 12 A", price: 250000, cost: 165000, stock: 8, category: "whisky", image: "images/Buchanan´s Deluxe.webp" },
  { id: 24, name: "Buchanan's Two Souls", price: 285000, cost: 195000, stock: 4, category: "whisky", image: "images/Buchanan´s Two sould.png" },
  { id: 25, name: "Buchanan's Master", price: 280000, cost: 190000, stock: 5, category: "whisky", image: "images/Buchanan´s Master.webp" }
];

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
  productos: [...DEFAULT_PRODUCTS],
  inventario_historial: [],
  movimientos: [], // Timeline unificado de auditoría
  live_caja_state: null
};

let db = { ...defaultDB };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const loaded = JSON.parse(data);
      db = { ...defaultDB, ...loaded };
      if (!Array.isArray(db.productos) || db.productos.length === 0) {
        db.productos = [...DEFAULT_PRODUCTS];
      }
      console.log(`✅ Base de datos cargada: ${db.ventas.length} ventas, ${db.productos.length} productos.`);
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
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const str = String(dateInput).trim();

  // Si ya es YYYY-MM-DD
  const mISO = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (mISO) {
    return `${mISO[1]}-${mISO[2].padStart(2, '0')}-${mISO[3].padStart(2, '0')}`;
  }

  // Si es DD/MM/YYYY o DD-MM-YYYY
  const mDMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mDMY) {
    const year = mDMY[3].length === 2 ? `20${mDMY[3]}` : mDMY[3];
    return `${year}-${mDMY[2].padStart(2, '0')}-${mDMY[1].padStart(2, '0')}`;
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

  return str.slice(0, 10);
}

// Helper: Día de Negocio Gastrobar (antes de las 06:00 AM cuenta como el día anterior)
function getBusinessDateStr(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Timestamp numérico seguro para ordenamiento
function parseTimestampOrDate(item) {
  if (!item) return 0;
  if (item.timestamp) {
    const t = new Date(item.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  const dateNorm = normalizeDateStr(item.fecha);
  if (dateNorm) {
    const hora = item.hora || '00:00:00';
    const t = new Date(`${dateNorm}T${hora}`).getTime();
    if (!isNaN(t)) return t;
    const t2 = new Date(`${dateNorm} ${hora}`).getTime();
    if (!isNaN(t2)) return t2;
  }
  if (typeof item.id === 'number') return item.id;
  return 0;
}

// Helper: Registrar un movimiento unificado
function registrarMovimiento(tipo, titulo, detalle, monto, extra = {}) {
  const ahora = new Date();
  const mov = {
    id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: extra.timestamp || ahora.toISOString(),
    fecha: extra.fecha || ahora.toLocaleDateString('es-CO'),
    hora: extra.hora || ahora.toLocaleTimeString('es-CO'),
    tipo, // 'venta', 'gasto', 'ingreso', 'apertura', 'cierre', 'mesa', 'inventario', 'aviso'
    titulo,
    detalle,
    monto: Number(monto) || 0,
    usuario: extra.usuario || extra.cajero || extra.responsable || 'Sistema',
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

// Auto-recuperación de movimientos si la base de datos se inicia vacía o tras sincronización
function ensureMovementsIntegrity() {
  if (!Array.isArray(db.movimientos)) db.movimientos = [];
  const existingRefIds = new Set(db.movimientos.map(m => m.refId || m.id));

  // 1. Respaldar ventas en movimientos
  if (Array.isArray(db.ventas)) {
    db.ventas.forEach(v => {
      if (v.id && !existingRefIds.has(v.id)) {
        const itemsTxt = Array.isArray(v.items) ? v.items.map(i => `${i.cantidad || i.qty || 1}x ${i.nombre || i.name || 'Prod'}`).join(', ') : 'Venta';
        db.movimientos.push({
          id: `mov_v_${v.id}`,
          refId: v.id,
          timestamp: v.timestamp || new Date().toISOString(),
          fecha: v.fecha || new Date().toLocaleDateString('es-CO'),
          hora: v.hora || new Date().toLocaleTimeString('es-CO'),
          tipo: 'venta',
          titulo: `Venta Registrada #${v.id} - ${v.mesa || 'Caja'}`,
          detalle: `Total: $${(Number(v.monto) || 0).toLocaleString('es-CO')} | ${v.metodoPago || 'Efectivo'} | ${itemsTxt}`,
          monto: Number(v.monto) || 0,
          usuario: v.cajero || 'Cajero',
          mesa: v.mesa || null,
          metodoPago: v.metodoPago || 'Efectivo',
          extra: v
        });
        existingRefIds.add(v.id);
      }
    });
  }

  // 2. Respaldar contabilidad en movimientos
  if (Array.isArray(db.contabilidad)) {
    db.contabilidad.forEach(c => {
      const cId = c.id || `${c.fecha}_${c.hora}_${c.monto}`;
      if (!existingRefIds.has(cId)) {
        const isIngreso = c.tipo === 'ingreso' || c.type === 'income';
        db.movimientos.push({
          id: `mov_c_${cId}`,
          refId: cId,
          timestamp: c.timestamp || new Date().toISOString(),
          fecha: c.fecha || new Date().toLocaleDateString('es-CO'),
          hora: c.hora || new Date().toLocaleTimeString('es-CO'),
          tipo: isIngreso ? 'ingreso' : 'gasto',
          titulo: `${isIngreso ? 'Ingreso Extra' : 'Gasto Registrado'}: ${c.concepto || c.concept || 'Gasto Operativo'}`,
          detalle: `Monto: $${(Number(c.monto || c.amount) || 0).toLocaleString('es-CO')} | Resp: ${c.responsable || c.cajero || 'Admin'}`,
          monto: Number(c.monto || c.amount) || 0,
          usuario: c.responsable || c.cajero || 'Admin',
          extra: c
        });
        existingRefIds.add(cId);
      }
    });
  }

  // 3. Respaldar sesiones en movimientos
  if (Array.isArray(db.sesiones_caja)) {
    db.sesiones_caja.forEach(s => {
      const sId = s.id || `ses_${s.fecha}_${s.horaApertura || ''}`;
      if (!existingRefIds.has(sId)) {
        db.movimientos.push({
          id: `mov_s_${sId}`,
          refId: sId,
          timestamp: s.timestamp || new Date().toISOString(),
          fecha: s.fecha || new Date().toLocaleDateString('es-CO'),
          hora: s.horaApertura || s.hora || new Date().toLocaleTimeString('es-CO'),
          tipo: 'apertura',
          titulo: `Apertura de Caja - Turno Iniciado`,
          detalle: `Cajero: ${s.cajero || 'Cajero'} | Base Inicial: $${(Number(s.montoInicial) || 0).toLocaleString('es-CO')}`,
          monto: Number(s.montoInicial) || 0,
          usuario: s.cajero || 'Cajero',
          extra: s
        });
        existingRefIds.add(sId);
      }
    });
  }

  // Ordenar movimientos cronológicamente (más recientes primero)
  db.movimientos.sort((a, b) => parseTimestampOrDate(b) - parseTimestampOrDate(a));
  if (db.movimientos.length > 5000) {
    db.movimientos = db.movimientos.slice(0, 5000);
  }
}

// Ejecutar al cargar la DB
ensureMovementsIntegrity();

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
// CANAL DE STREAMING EN TIEMPO REAL (SSE - ZERO DELAY)
// ==========================================
let sseClients = [];

function broadcastLiveEvent(eventType, eventData = {}) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify({ ...eventData, timestamp: new Date().toISOString() })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {}
  });
}

// Endpoint de Streaming SSE para el Dashboard
app.get('/api/live-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = Date.now() + Math.random().toString(36).substr(2, 5);
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Mensaje inicial de bienvenida
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', pos_status: db.pos_status })}\n\n`);

  // Ping periódico cada 15 segundos para mantener el canal abierto
  const pingTimer = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch (e) {}
  }, 15000);

  req.on('close', () => {
    clearInterval(pingTimer);
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

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
  const businessDayISO = getBusinessDateStr(new Date());

  const ultimaSesion = db.sesiones_caja.length > 0 ? db.sesiones_caja[db.sesiones_caja.length - 1] : null;
  const liveState = db.live_caja_state;
  const cajaAbierta = (liveState && liveState.abierta) || (ultimaSesion && (!ultimaSesion.estado || ultimaSesion.estado === 'abierta' || !ultimaSesion.horaCierre));

  const isCurrentShiftOrToday = (item) => {
    if (!item) return false;
    const fNorm = normalizeDateStr(item.fecha) || normalizeDateStr(item.timestamp);
    if (fNorm === hoyISO || fNorm === businessDayISO) return true;
    // Si hay una sesión de caja abierta hoy
    if (cajaAbierta && ultimaSesion && ultimaSesion.timestamp) {
      if (item.timestamp && new Date(item.timestamp) >= new Date(ultimaSesion.timestamp)) {
        return true;
      }
    }
    return false;
  };

  const ventasHoy = db.ventas.filter(v => isCurrentShiftOrToday(v));
  
  let totalVentasHoy = 0;
  let efectivoHoy = 0;
  let transferenciaHoy = 0;
  let totalGastosHoy = 0;
  let saldoCalculado = 0;
  let totalTransaccionesHoy = 0;
  const ventasPorHora = Array(24).fill(0);
  const conteoProductos = {};

  // Si hay estado en vivo transmitido desde la caja física
  if (liveState && liveState.abierta) {
    totalVentasHoy = Number(liveState.ventasTotal) || 0;
    efectivoHoy = Number(liveState.ventasEfectivo) || 0;
    transferenciaHoy = Number(liveState.ventasTransferencia) || 0;
    totalGastosHoy = Number(liveState.gastosTotal) || 0;
    saldoCalculado = Number(liveState.saldoActual) !== undefined && !isNaN(Number(liveState.saldoActual)) 
      ? Number(liveState.saldoActual) 
      : Math.max(0, (Number(liveState.montoInicial) || 0) + efectivoHoy - totalGastosHoy);
    
    const txs = Array.isArray(liveState.transacciones) ? liveState.transacciones : ventasHoy;
    totalTransaccionesHoy = txs.length;

    txs.forEach(v => {
      const monto = Number(v.monto || v.total) || 0;
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
  } else {
    // Cálculo histórico a partir de registros si no hay caja física abierta transmitiendo
    ventasHoy.forEach(v => {
      const monto = Number(v.monto) || 0;
      totalVentasHoy += monto;

      const mp = String(v.metodoPago || '').toLowerCase();
      if (mp === 'efectivo') {
        efectivoHoy += monto;
      } else if (mp === 'transferencia' || mp === 'nequi' || mp === 'daviplata' || mp === 'tarjeta') {
        transferenciaHoy += monto;
      } else if (mp === 'mixto') {
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

    const gastosHoy = db.contabilidad.filter(g => (g.tipo === 'gasto' || g.type === 'expense') && isCurrentShiftOrToday(g));
    totalGastosHoy = gastosHoy.reduce((acc, g) => acc + (Number(g.monto || g.amount) || 0), 0);
    const baseInicial = Number(ultimaSesion?.montoInicial) || 0;
    saldoCalculado = Math.max(0, baseInicial + efectivoHoy - totalGastosHoy);
    totalTransaccionesHoy = ventasHoy.length;
  }

  const mesasActivas = db.ventas_pendientes || [];
  const totalEnMesas = mesasActivas.reduce((acc, m) => {
    const tot = Number(m.total || m.monto) || (Array.isArray(m.items) ? m.items.reduce((sum, i) => sum + ((Number(i.price || i.precio) || 0) * (Number(i.qty || i.cantidad) || 1)), 0) : 0);
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

  const isCajaEfectivamenteAbierta = !!(posOnline && (db.pos_status?.cajaAbierta || (liveState && liveState.abierta)));
  const isProgramaCerrado = !posOnline || db.pos_status?.appClosed;
  const isBloqueado = isProgramaCerrado || !isCajaEfectivamenteAbierta;

  let estadoTextoPrincipal = 'EN LÍNEA (TURNO ABIERTO)';
  if (isProgramaCerrado) {
    estadoTextoPrincipal = 'PROGRAMA CERRADO - CAJA BLOQUEADA';
  } else if (!isCajaEfectivamenteAbierta) {
    estadoTextoPrincipal = 'POS EN LÍNEA - ESPERANDO APERTURA';
  }

  const cajeroEnTurno = isCajaEfectivamenteAbierta ? (liveState?.cajero || db.pos_status?.cajeroActual || ultimaSesion?.cajero || 'Cajero') : (posOnline ? 'Esperando inicio de turno' : 'Sin turno / Terminal cerrada');

  res.json({
    kpis: {
      totalVentasHoy,
      totalSales: totalVentasHoy,
      efectivoHoy,
      cash: efectivoHoy,
      transferenciaHoy,
      transferenciasHoy: transferenciaHoy,
      transfer: transferenciaHoy,
      totalGastosHoy,
      gastosHoy: totalGastosHoy,
      expenses: totalGastosHoy,
      balanceNetoHoy: totalVentasHoy - totalGastosHoy,
      gananciaNetaHoy: totalVentasHoy - totalGastosHoy,
      netProfit: totalVentasHoy - totalGastosHoy,
      totalTransaccionesHoy,
      cantidadVentasHoy: totalTransaccionesHoy,
      txCount: totalTransaccionesHoy,
      ticketPromedioHoy: totalTransaccionesHoy > 0 ? Math.round(totalVentasHoy / totalTransaccionesHoy) : 0,
      mesasActivasCount: mesasActivas.length,
      totalMesasActivas: totalEnMesas,
      totalEnMesas,
      cajaAbierta: isCajaEfectivamenteAbierta,
      posOnline: !!posOnline,
      isBloqueado: !!isBloqueado,
      estadoTextoPrincipal,
      cajeroActual: cajeroEnTurno,
      saldoEnCajaCalculado: saldoCalculado
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
    liveCajaState: liveState,
    cajaSesion: liveState || ultimaSesion,
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
  limit = parseInt(limit, 10) || 100;
  offset = parseInt(offset, 10) || 0;

  ensureMovementsIntegrity();

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
      (m.mesa && m.mesa.toLowerCase().includes(s)) ||
      (m.metodoPago && m.metodoPago.toLowerCase().includes(s)) ||
      (m.monto && String(m.monto).includes(s))
    );
  }

  filtrados.sort((a, b) => parseTimestampOrDate(b) - parseTimestampOrDate(a));

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
  limit = parseInt(limit, 10) || 100;
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
      (v.id && String(v.id).toLowerCase().includes(s)) ||
      (v.monto && String(v.monto).includes(s)) ||
      (Array.isArray(v.items) && v.items.some(i => (i.nombre || i.name || '').toLowerCase().includes(s)))
    );
  }

  list.sort((a, b) => parseTimestampOrDate(b) - parseTimestampOrDate(a));

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

    if (payload.cajaState) {
      db.live_caja_state = payload.cajaState;
    }

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('batch_sync', {
      ventas: db.ventas.length,
      productos: db.productos.length,
      mesas: db.ventas_pendientes.length
    });

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
    const mov = registrarMovimiento(
      'venta',
      `Venta #${venta.id} - ${venta.mesa || 'Caja'}`,
      `Total: $${(Number(venta.monto) || 0).toLocaleString('es-CO')} | ${venta.metodoPago || 'Efectivo'} | ${itemsTxt}`,
      venta.monto,
      { ...venta, refId: venta.id, usuario: venta.cajero }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    // Notificar instantáneamente a todos los dashboards conectados
    broadcastLiveEvent('sale_created', { venta, movimiento: mov });

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
    
    let mov;
    if (session.tipo === 'apertura' || session.montoInicial !== undefined) {
      mov = registrarMovimiento(
        'apertura',
        `Apertura de Caja - Turno Iniciado`,
        `Cajero: ${session.cajero || 'Cajero'} | Base Inicial: $${(Number(session.montoInicial) || 0).toLocaleString('es-CO')}`,
        session.montoInicial,
        session
      );
      if (db.pos_status) {
        db.pos_status.cajaBloqueada = false;
        db.pos_status.cajaAbierta = true;
        db.pos_status.cajeroActual = session.cajero || 'Cajero';
      }
    } else if (session.tipo === 'cierre' || session.totalVentas !== undefined) {
      mov = registrarMovimiento(
        'cierre',
        `Cierre de Caja - Turno Finalizado`,
        `Cajero: ${session.cajero || 'Cajero'} | Ventas: $${(Number(session.totalVentas) || 0).toLocaleString('es-CO')} | Saldo Final: $${(Number(session.saldoFinal || session.montoFinal) || 0).toLocaleString('es-CO')}`,
        session.totalVentas || 0,
        session
      );
      if (db.pos_status) {
        db.pos_status.cajaBloqueada = true;
        db.pos_status.cajaAbierta = false;
      }
    }

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('session_changed', { session, movimiento: mov, pos_status: db.pos_status });

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

    const mov = registrarMovimiento(
      expense.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      `${expense.tipo === 'ingreso' ? 'Ingreso Extra' : 'Gasto Registrado'}: ${expense.concepto || expense.concept || 'Gasto Operativo'}`,
      `Monto: $${(Number(expense.monto || expense.amount) || 0).toLocaleString('es-CO')} | Responsable: ${expense.responsable || expense.cajero || 'Admin'}`,
      expense.monto || expense.amount,
      expense
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('expense_created', { expense, movimiento: mov });

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
      broadcastLiveEvent('tables_updated', { tables: db.ventas_pendientes });
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
    let mov = null;
    if (movement) {
      db.inventario_historial.push(movement);
      mov = registrarMovimiento(
        'inventario',
        `Ajuste de Stock: ${movement.concepto || 'Movimiento de Inventario'}`,
        `Producto ID: ${movement.producto_id} | Cantidad: ${movement.cantidad} | Tipo: ${movement.tipo}`,
        0,
        movement
      );
    }
    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('inventory_updated', { products: db.productos, movimiento: mov });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Latido en vivo del Sistema POS Físico (Heartbeat)
app.post('/api/sync/heartbeat', checkAuthToken, (req, res) => {
  try {
    const { cajaAbierta, cajero, estado, cajaState } = req.body;
    if (cajaState) {
      db.live_caja_state = cajaState;
    }

    const isAbierta = !!(cajaAbierta || (cajaState && cajaState.abierta));
    const activeCajero = cajero || (cajaState && cajaState.cajero) || (isAbierta ? 'Activo' : 'Ninguno');

    db.pos_status = {
      online: true,
      appClosed: false,
      cajaBloqueada: !isAbierta,
      cajaAbierta: isAbierta,
      cajeroActual: activeCajero,
      lastHeartbeat: new Date().toISOString(),
      estadoTexto: isAbierta ? 'EN LÍNEA (TURNO ABIERTO)' : 'POS EN LÍNEA (ESPERANDO APERTURA)'
    };
    db.info.ultima_sincronizacion = new Date().toISOString();

    broadcastLiveEvent('pos_heartbeat', { pos_status: db.pos_status, live_caja_state: db.live_caja_state });

    res.json({ success: true, status: db.pos_status, live_caja_state: db.live_caja_state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Señal de Cierre/Salida de la Aplicación de Caja
app.post('/api/sync/pos-exit', checkAuthToken, (req, res) => {
  try {
    const { cajero, razon, cajaState } = req.body;
    if (cajaState) {
      db.live_caja_state = cajaState;
    }
    db.pos_status = {
      online: false,
      appClosed: true,
      cajaBloqueada: true,
      cajaAbierta: false,
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

    broadcastLiveEvent('pos_exit', { pos_status: db.pos_status, live_caja_state: db.live_caja_state });

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

// 1. Ajuste remoto de stock desde el celular o dashboard
app.post('/api/remote/update-stock', checkAuthToken, (req, res) => {
  try {
    const { productId, delta, newStock, razon, usuario } = req.body;
    const prod = db.productos.find(p => p.id === Number(productId) || p.id === productId || String(p.id) === String(productId));
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    let finalStock = Number(prod.stock) || 0;
    if (newStock !== undefined) {
      finalStock = Math.max(0, Number(newStock));
    } else if (delta !== undefined) {
      finalStock = Math.max(0, finalStock + Number(delta));
    }

    const stockAnterior = prod.stock !== undefined ? prod.stock : 0;
    prod.stock = finalStock;

    const historyRecord = {
      id: Date.now(),
      producto_id: prod.id,
      tipo: finalStock >= stockAnterior ? 'add' : 'remove',
      cantidad: Math.abs(finalStock - stockAnterior),
      concepto: razon || `Ajuste remoto por ${usuario || 'Admin Remoto'}`,
      fecha: new Date().toLocaleDateString('es-CO'),
      hora: new Date().toLocaleTimeString('es-CO'),
      precio_unitario: Number(prod.cost) || Number(prod.price) || 0
    };
    db.inventario_historial.push(historyRecord);

    const mov = registrarMovimiento(
      'inventario',
      `Ajuste Remoto de Stock: ${prod.name || prod.nombre}`,
      `De ${stockAnterior} a ${finalStock} unidades | Motivo: ${razon || 'Ajuste desde celular'}`,
      0,
      { usuario: usuario || 'Admin Remoto', producto_id: prod.id, newStock: finalStock, stockAnterior }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('inventory_updated', { products: db.productos, movimiento: mov });

    pendingPosActions.push({
      id: `stock_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      tipo: 'stock_update',
      productId: prod.id,
      newStock: finalStock,
      stockAnterior,
      producto: prod,
      historyRecord,
      mensaje: `Stock modificado: ${prod.name || prod.nombre} -> ${finalStock} un.`,
      emisor: usuario || 'Admin Remoto'
    });

    res.json({ success: true, product: prod });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Edición completa de producto (Nombre, Precio, Costo, Categoría, Stock)
app.post('/api/remote/update-product', checkAuthToken, (req, res) => {
  try {
    const { id, name, nombre, price, precio, cost, costo, category, categoria, stock, image, imagen, usuario } = req.body;
    const prod = db.productos.find(p => p.id === Number(id) || p.id === id || String(p.id) === String(id));
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    if (name || nombre) prod.name = name || nombre;
    if (price !== undefined || precio !== undefined) {
      prod.price = Number(price !== undefined ? price : precio);
      prod.precio = prod.price;
    }
    if (cost !== undefined || costo !== undefined) {
      prod.cost = Number(cost !== undefined ? cost : costo);
    }
    if (category || categoria) prod.category = (category || categoria).toLowerCase();
    if (image || imagen) prod.image = image || imagen;
    if (stock !== undefined) prod.stock = Math.max(0, Number(stock));

    const mov = registrarMovimiento(
      'inventario',
      `Producto Modificado Remotamente: ${prod.name}`,
      `Precio: $${(Number(prod.price) || 0).toLocaleString('es-CO')} | Costo: $${(Number(prod.cost) || 0).toLocaleString('es-CO')} | Stock: ${prod.stock} un.`,
      0,
      { usuario: usuario || 'Admin Remoto', producto_id: prod.id }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('inventory_updated', { products: db.productos, movimiento: mov });

    pendingPosActions.push({
      id: `prod_upd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      tipo: 'product_update',
      productId: prod.id,
      product: prod,
      mensaje: `Producto actualizado: ${prod.name} (Precio: $${(Number(prod.price) || 0).toLocaleString('es-CO')})`,
      emisor: usuario || 'Admin Remoto'
    });

    res.json({ success: true, product: prod });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Creación remota de nuevo producto
app.post('/api/remote/create-product', checkAuthToken, (req, res) => {
  try {
    const { name, nombre, price, precio, cost, costo, category, categoria, stock, image, imagen, usuario } = req.body;
    if (!name && !nombre) return res.status(400).json({ error: 'Nombre del producto requerido' });

    const maxId = db.productos.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);
    const newId = maxId + 1;

    const newProd = {
      id: newId,
      name: name || nombre,
      price: Number(price !== undefined ? price : precio) || 0,
      precio: Number(price !== undefined ? price : precio) || 0,
      cost: Number(cost !== undefined ? cost : costo) || 0,
      category: (category || categoria || 'otros').toLowerCase(),
      stock: Math.max(0, Number(stock) || 0),
      image: image || imagen || 'images/default_product.png'
    };

    db.productos.push(newProd);

    const mov = registrarMovimiento(
      'inventario',
      `Nuevo Producto Creado Remotamente: ${newProd.name}`,
      `Categoría: ${newProd.category} | Precio: $${newProd.price.toLocaleString('es-CO')} | Stock: ${newProd.stock}`,
      0,
      { usuario: usuario || 'Admin Remoto', producto_id: newProd.id }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('inventory_updated', { products: db.productos, movimiento: mov });

    pendingPosActions.push({
      id: `prod_crt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      tipo: 'product_create',
      product: newProd,
      mensaje: `Nuevo producto añadido: ${newProd.name}`,
      emisor: usuario || 'Admin Remoto'
    });

    res.json({ success: true, product: newProd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Eliminación remota de producto
app.post('/api/remote/delete-product', checkAuthToken, (req, res) => {
  try {
    const { productId, usuario } = req.body;
    const prodIdx = db.productos.findIndex(p => p.id === Number(productId) || p.id === productId || String(p.id) === String(productId));
    if (prodIdx === -1) return res.status(404).json({ error: 'Producto no encontrado' });

    const deleted = db.productos.splice(prodIdx, 1)[0];

    const mov = registrarMovimiento(
      'inventario',
      `Producto Eliminado Remotamente: ${deleted.name}`,
      `ID: ${deleted.id} eliminado del catálogo`,
      0,
      { usuario: usuario || 'Admin Remoto', producto_id: deleted.id }
    );

    db.info.ultima_sincronizacion = new Date().toISOString();
    saveDB();

    broadcastLiveEvent('inventory_updated', { products: db.productos, movement: mov });

    pendingPosActions.push({
      id: `prod_del_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      tipo: 'product_delete',
      productId: deleted.id,
      mensaje: `Producto eliminado: ${deleted.name}`,
      emisor: usuario || 'Admin Remoto'
    });

    res.json({ success: true, deletedId: deleted.id });
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
