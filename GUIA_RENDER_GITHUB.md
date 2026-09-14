# 🌐 GUÍA DE DESPLIEGUE EN GITHUB Y RENDER (100% GRATIS)
## Servidor de Control Remoto & Dashboard Web - LEVEL Gastrobar

Esta guía te explica cómo subir tu servidor a **GitHub** y desplegarlo en **Render.com** en 3 minutos para que puedas monitorear tu negocio en tiempo real desde cualquier celular, tablet o computadora en el mundo.

---

### 🚀 PASO 1: Subir el Servidor a GitHub

1. Abre tu navegador y entra en [https://github.com/new](https://github.com/new).
2. Ponle un nombre a tu repositorio, por ejemplo: `pos-control-remoto` o `level-pos-remote`.
3. Selecciona **Public** (o **Private** si prefieres) y haz clic en **Create repository**.
4. Copia la URL de tu repositorio (ejemplo: `https://github.com/TU_USUARIO/pos-control-remoto.git`).
5. Abre la carpeta `c:\PROYECTOS\sistema pos\server` en tu terminal o ejecuta el archivo `deploy-github.bat` que creamos para ti:

```bash
# O manualmente desde la carpeta server:
cd "c:\PROYECTOS\sistema pos\server"
git init
git add .
git commit -m "Deploy inicial Servidor Control Remoto LEVEL Gastrobar"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/pos-control-remoto.git
git push -u origin main
```

---

### ☁️ PASO 2: Desplegar en Render.com (Gratis)

1. Entra en [https://render.com](https://render.com) y crea tu cuenta gratuita (puedes iniciar sesión directamente con tu cuenta de GitHub).
2. En el panel principal de Render, haz clic en el botón **New +** y selecciona **Web Service**.
3. Conecta tu repositorio de GitHub `pos-control-remoto` que acabas de subir.
4. Render detectará automáticamente la configuración gracias a nuestro archivo `render.yaml`, o puedes configurarlo manualmente:
   - **Name**: `level-pos-remote` (o el nombre que quieras)
   - **Region**: Selecciona la más cercana (ej: *Ohio (US East)* o *Oregon*)
   - **Branch**: `main`
   - **Root Directory**: Dejar en blanco (o `.` si subiste solo la carpeta server)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. En la sección **Environment Variables** (Variables de entorno), puedes definir:
   - `ADMIN_PIN`: `1234` (o tu PIN secreto)
   - `API_TOKEN`: `level-secret-token-2026`
6. Haz clic en **Create Web Service**.

En 1-2 minutos Render compilará tu servidor y te dará una URL pública HTTPS gratuita, por ejemplo:
👉 **`https://level-pos-remote.onrender.com`**

---

### 📱 PASO 3: Vincular con tu Sistema POS

1. Abre tu Sistema POS en la computadora física de la caja.
2. Haz clic en el botón **`CONTROL REMOTO`** (o en el menú lateral: *Nube / Control Remoto*).
3. Pega la URL que te dio Render (ej: `https://level-pos-remote.onrender.com`).
4. Haz clic en **"SINCRONIZAR TODO"**.
5. ¡Listo! A partir de ese instante:
   - Cada venta se envía en vivo a la nube.
   - Cada apertura y cierre de caja queda registrado con arqueo.
   - Puedes abrir la URL en el navegador de tu celular con tu PIN (1234) y ver en vivo las mesas, ventas, dinero en efectivo, gastos y movimientos.
