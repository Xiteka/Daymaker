const { app, BrowserWindow, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Keep development and packaged builds on the same saved Daymaker profile.
const profile = process.argv.find(argument => argument.startsWith('--user-data-dir='));
const profilePath = profile
  ? path.resolve(profile.slice('--user-data-dir='.length))
  : path.join(app.getPath('appData'), 'daymark');
fs.mkdirSync(profilePath, { recursive: true });
app.setPath('userData', profilePath);
app.setName('Daymaker');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 820,
    minWidth: 360,
    minHeight: 620,
    backgroundColor: '#e6e5e0',
    title: 'Daymaker',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'src/index.html')).catch(error => {
    dialog.showErrorBox('Daymaker could not open', error.message);
    app.quit();
  });
}

// Reopening the app focuses the existing game instead of creating two copies
// that could overwrite one another's saved coupons.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      if (app.isReady()) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
