const { app, BrowserWindow, net, protocol, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const productionUrl = 'https://alasly-production.up.railway.app';
const appOrigin = 'autocare://app';
const appDirectory = path.resolve(__dirname, '../dist');
const appFile = path.join(appDirectory, 'index.html');

protocol.registerSchemesAsPrivileged([{
  scheme: 'autocare',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    allowServiceWorkers: true,
  },
}]);

const isProductionOrigin = (value) => {
  try {
    return new URL(value).origin === productionUrl;
  } catch {
    return false;
  }
};

const isBundledAppUrl = (value) => {
  try {
    const url = new URL(value);
    return url.origin === appOrigin;
  } catch {
    return false;
  }
};

const serveBundledApp = (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  if (url.origin !== appOrigin) return new Response('Not found', { status: 404 });

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const requestedFile = path.resolve(appDirectory, `.${pathname}`);
  const relativePath = path.relative(appDirectory, requestedFile);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return new Response('Forbidden', { status: 403 });
  }

  const fileExists = fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile();
  if (!fileExists && path.extname(requestedFile)) return new Response('Not found', { status: 404 });

  return net.fetch(pathToFileURL(fileExists ? requestedFile : appFile).href);
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
    if (!isBundledAppUrl(url)) event.preventDefault();
  });

  void window.loadURL(`${appOrigin}/`);
};

app.whenReady().then(() => {
  protocol.handle('autocare', serveBundledApp);
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, origin) =>
    permission === 'media' && (isProductionOrigin(origin) || isBundledAppUrl(origin)),
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    callback(permission === 'media' && (isProductionOrigin(requestingUrl) || isBundledAppUrl(requestingUrl)));
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
