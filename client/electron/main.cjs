const { app, BrowserWindow, shell, session } = require('electron');

const productionUrl = 'https://alasly-production.up.railway.app';

const isProductionOrigin = (value) => {
  try {
    return new URL(value).origin === productionUrl;
  } catch {
    return false;
  }
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    icon: `${__dirname}/../assets/icon.png`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isProductionOrigin(url)) event.preventDefault();
  });

  void window.loadURL(productionUrl);
};

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, origin) =>
    permission === 'media' && isProductionOrigin(origin),
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    callback(permission === 'media' && isProductionOrigin(requestingUrl));
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
