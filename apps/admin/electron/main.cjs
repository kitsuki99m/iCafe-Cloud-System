const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");

const isDev = !app.isPackaged;
const DEV_URL = process.env.AEZAKMI_ADMIN_DEV_URL || "http://localhost:5174";

let adminWindow = null;
let adminLocked = false;
let appIsQuitting = false;
let backendProcess = null;
let tray = null;
let adminAuthenticated = false;
let quitAckTimer = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function serverConfigPath() {
  return path.join(app.getPath('userData'), 'server-config.json')
}

function normalizeServerConfig(value) {
  const host = String(value?.host || '').trim()
  const port = Number(value?.port)
  if (!host || /^https?:\/\//i.test(host) || /[\/\\\s]/.test(host)) {
    const error = new Error('Enter only the server IP or hostname, without http:// or a path.')
    error.code = 'INVALID_SERVER_HOST'
    throw error
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Port must be a whole number from 1 to 65535.')
    error.code = 'INVALID_SERVER_PORT'
    throw error
  }
  const origin = `http://${host}:${port}`
  return { host, port, origin, apiBase: `${origin}/api`, configured: true, source: 'saved' }
}

function readServerConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(serverConfigPath(), 'utf8'))
    return normalizeServerConfig(parsed)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'INVALID_SERVER_HOST' && error?.code !== 'INVALID_SERVER_PORT' && !(error instanceof SyntaxError)) {
      console.warn('Unable to read server config:', error?.message || error)
    }
  }
  return {
    host: '127.0.0.1',
    port: 3000,
    origin: 'http://127.0.0.1:3000',
    apiBase: 'http://127.0.0.1:3000/api',
    configured: false,
    source: 'local-default',
  }
}

function writeServerConfig(value) {
  const normalized = normalizeServerConfig(value)
  const file = serverConfigPath()
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({ host: normalized.host, port: normalized.port }, null, 2), { mode: 0o600 })
  fs.renameSync(temp, file)
  return normalized
}

function installedCafeName() {
  if (process.platform !== "win32") {
    return "iCafe Management System";
  }

  try {
    const output = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\iCafe Management System", "/v", "CafeName"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    const match = output.match(/CafeName\s+REG_SZ\s+(.+)/i);

    return match?.[1]?.trim() || "iCafe Management System";
  } catch {
    return "iCafe Management System";
  }
}

/**
 * Wait until the backend TCP port is accepting connections.
 *
 * This prevents the Admin renderer from trying to call
 * localhost:3000 before the bundled backend has finished starting.
 */
function waitForBackend(port = 3000, host = "127.0.0.1", timeout = 4000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      const socket = net.createConnection({
        host,
        port,
      });

      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - startedAt >= timeout) {
          reject(
            new Error(
              `Backend did not become ready on ${host}:${port} within ${timeout}ms`,
            ),
          );
          return;
        }

        setTimeout(check, 250);
      });

      socket.setTimeout(1000, () => {
        socket.destroy();

        if (Date.now() - startedAt >= timeout) {
          reject(
            new Error(
              `Backend did not become ready on ${host}:${port} within ${timeout}ms`,
            ),
          );
          return;
        }

        setTimeout(check, 250);
      });
    }

    check();
  });
}

function startBundledBackend() {
  if (isDev || backendProcess) {
    return;
  }

  const backendEntry = path.join(
    process.resourcesPath,
    "backend",
    "src",
    "server.js",
  );

  const backendCwd = path.join(process.resourcesPath, "backend");

  // Keep the installed backend database in a single, predictable Windows
  // location. Do not use Electron userData for the operational database: an
  // old userData database can survive reinstall/uninstall and make it look
  // like deleted data has returned.
  const programData = process.env.ProgramData || "C:\\ProgramData";
  const dataDir = path.join(programData, "iCafe Management System", "data");

  fs.mkdirSync(dataDir, {
    recursive: true,
  });

  const secretPath = path.join(app.getPath("userData"), "backend-jwt-secret");

  let jwtSecret = "";

  try {
    jwtSecret = fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    // Secret doesn't exist yet.
  }

  if (jwtSecret.length < 32) {
    jwtSecret = crypto.randomBytes(48).toString("hex");

    try {
      fs.writeFileSync(secretPath, jwtSecret, {
        mode: 0o600,
      });
    } catch (error) {
      console.error("Unable to save backend JWT secret:", error);
    }
  }

  console.log("Starting bundled backend...");
  console.log("Backend entry:", backendEntry);
  console.log("Backend working directory:", backendCwd);
  console.log("Database:", path.join(dataDir, "aezakmi.sqlite"));

  const logPath = path.join(app.getPath("userData"), "backend.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n--- backend start ${new Date().toISOString()} ---\n`);

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: backendCwd,

    env: {
      ...process.env,

      // Tell Electron's executable to behave as Node.
      ELECTRON_RUN_AS_NODE: "1",

      NODE_ENV: "production",

      AEZAKMI_DESKTOP_BACKEND: "1",

      DATABASE_PATH: path.join(dataDir, "aezakmi.sqlite"),

      JWT_SECRET: jwtSecret,

      CORS_ORIGIN: "http://localhost:5174,http://localhost:5173,null",
    },

    stdio: ["ignore", "pipe", "pipe"],

    windowsHide: true,
  });

  backendProcess.stdout?.on("data", (data) => {
    console.log(`[backend] ${String(data).trim()}`);
    logStream.write(`[stdout] ${data}`);
  });

  backendProcess.stderr?.on("data", (data) => {
    console.error(`[backend] ${String(data).trim()}`);
    logStream.write(`[stderr] ${data}`);
  });

  backendProcess.once("exit", (code, signal) => {
    console.log(`Bundled backend exited. code=${code}, signal=${signal}`);
    logStream.write(`[exit] code=${code} signal=${signal}\n`);

    backendProcess = null;
  });

  backendProcess.once("error", (error) => {
    console.error("Unable to start bundled backend:", error);
    logStream.write(`[spawn-error] ${error?.stack || error}\n`);

    backendProcess = null;
  });
}

function stopBundledBackend() {
  if (!backendProcess) {
    return;
  }

  console.log("Stopping bundled backend...");

  try {
    backendProcess.kill();
  } catch (error) {
    console.error("Unable to stop bundled backend:", error);
  }

  backendProcess = null;
}

function loadTrayIcon() {
  const pngPath = path.join(__dirname, 'tray-icon-32.png')
  if (fs.existsSync(pngPath)) {
    const icon = nativeImage.createFromPath(pngPath)
    if (!icon.isEmpty()) return icon
  }
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.svg'))
  return icon
}

function isTrustedRenderer(event) {
  return Boolean(adminWindow && !adminWindow.isDestroyed() && event.sender === adminWindow?.webContents);
}

function showAdminWindow() {
  if (!adminWindow || adminWindow.isDestroyed()) { createWindow(); return }
  if (adminWindow.isMinimized()) adminWindow.restore()
  adminWindow.show()
  adminWindow.focus()
}

function requestAdminQuit() {
  if (!adminAuthenticated || !adminWindow || adminWindow.isDestroyed()) {
    appIsQuitting = true
    app.quit()
    return
  }
  adminWindow.webContents.send('admin:request-quit')
  if (quitAckTimer) clearTimeout(quitAckTimer)
  quitAckTimer = setTimeout(() => {
    quitAckTimer = null
    appIsQuitting = true
    app.quit()
  }, 3000)
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray
  tray = new Tray(loadTrayIcon())
  tray.setToolTip(installedCafeName() + ' — Admin Console')
  tray.on('click', showAdminWindow)
  const menu = Menu.buildFromTemplate([
    { label: 'Open Admin Console', click: showAdminWindow },
    { type: 'separator' },
    { label: 'Quit', click: requestAdminQuit },
  ])
  tray.setContextMenu(menu)
  return tray
}

function applyAdminLock(locked) {
  adminLocked = Boolean(locked);

  if (!adminWindow || adminWindow.isDestroyed()) {
    return;
  }

  adminWindow.setClosable(!adminLocked);
  adminWindow.setMinimizable(!adminLocked);
  adminWindow.setMaximizable(!adminLocked);
  adminWindow.setResizable(!adminLocked);

  adminWindow.setAlwaysOnTop(
    adminLocked,
    adminLocked ? "screen-saver" : "normal",
  );

  if (adminLocked) {
    adminWindow.focus();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,

    minWidth: 1024,
    minHeight: 700,

    title: installedCafeName(),

    icon: path.join(__dirname, "app-icon.ico"),

    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: true,
    },
  });

  adminWindow = win;

  win.webContents.on("before-input-event", (event, input) => {
    if (!adminLocked || input.type !== "keyDown") {
      return;
    }

    const key = String(input.key || "").toLowerCase();

    // Keep only the local unlock shortcut
    // available while the console is locked.
    if (input.alt && input.shift && key === "u") {
      return;
    }

    if (input.control || input.alt || input.meta || /^f\d{1,2}$/i.test(key)) {
      event.preventDefault();
    }
  });

  win.on("close", (event) => {
    if (adminLocked && !appIsQuitting) {
      event.preventDefault();
      win.focus();
      return;
    }
    if (adminAuthenticated && !appIsQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("minimize", (event) => {
    if (adminAuthenticated && !appIsQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.on("will-navigate", (event) => event.preventDefault());

  win.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("Admin renderer failed to load:", code, description, url);
  });

  win.on("closed", () => {
    adminWindow = null;
  });
}

ipcMain.on('admin:server-config:get', (event) => {
  if (!isTrustedRenderer(event)) { event.returnValue = null; return }
  event.returnValue = readServerConfig()
})

ipcMain.handle('admin:server-config:set', (event, value) => {
  if (!isTrustedRenderer(event)) {
    const error = new Error('IPC request rejected: untrusted renderer.')
    error.code = 'UNTRUSTED_IPC_SENDER'
    throw error
  }
  return writeServerConfig(value)
})

ipcMain.on('admin:set-authenticated', (event, authenticated) => {
  if (isTrustedRenderer(event)) adminAuthenticated = Boolean(authenticated)
});

ipcMain.on('admin:quit-ack', (event) => {
  if (!isTrustedRenderer(event)) return
  if (quitAckTimer) { clearTimeout(quitAckTimer); quitAckTimer = null }
  appIsQuitting = true
  app.quit()
});

ipcMain.on("admin:set-locked", (event, locked) => {
  if (isTrustedRenderer(event)) {
    applyAdminLock(locked);
  }
});

app.on('second-instance', () => {
  if (!hasSingleInstanceLock) return;
  showAdminWindow();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  app.setAppUserModelId('com.iCafe.Management.System.admin');
  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
  }

  /*
   * Development:
   * Do not start the bundled backend.
   *
   * Production:
   * Start the backend packaged with Admin.
   */
  if (!isDev) {
    startBundledBackend();

    try {
      console.log("Waiting for backend on localhost:3000...");

      await waitForBackend(3000, "127.0.0.1", 4000);

      console.log("Backend is ready on localhost:3000");
    } catch (error) {
      console.error("Backend startup failed:", error);

      const logPath = path.join(app.getPath("userData"), "backend.log");

      dialog.showErrorBox(
        "Backend failed to start",
        `${String(error?.message || error)}\n\nCheck the log for details:\n${logPath}`,
      );

      /*
       * We still open the Admin window so the
       * user can see the application/error UI.
       *
       * If you prefer, we can instead show a
       * dedicated "Backend unavailable" window.
       */
    }
  }

  createTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  appIsQuitting = true;
  if (quitAckTimer) { clearTimeout(quitAckTimer); quitAckTimer = null }

  stopBundledBackend();
  try { tray?.destroy(); } catch {}
});

app.on("window-all-closed", () => {
  // Keep the admin process alive while it is minimized to the tray.
});
