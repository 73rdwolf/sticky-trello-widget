const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;
let tray;
let SETTINGS_FILE;
let desktopMonitor;

function getSettingsPath() {
    if (!SETTINGS_FILE) {
        SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
    }
    return SETTINGS_FILE;
}

function loadSettings() {
    try {
        const filePath = getSettingsPath();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
    return {};
}

function saveSettings(settings) {
    try {
        const filePath = getSettingsPath();
        const current = loadSettings();
        const updated = { ...current, ...settings };
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

/**
 * Desktop Monitor: Detect when "Show Desktop" is triggered or desktop is clicked,
 * then immediately show the widget.
 */
function startDesktopMonitor() {
    // Check every 500ms if the foreground window is the desktop
    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FG {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
}
"@
while($true) {
    $fg = [FG]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 256
    [FG]::GetClassName($fg, $sb, 256)
    $cls = $sb.ToString()
    if ($cls -eq "WorkerW" -or $cls -eq "Progman" -or $cls -eq "SysListView32") {
        Write-Output "DESKTOP"
    }
    Start-Sleep -Milliseconds 300
}
`;
    const scriptPath = path.join(app.getPath('temp'), 'desktop_monitor.ps1');
    fs.writeFileSync(scriptPath, psScript);

    desktopMonitor = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: ['ignore', 'pipe', 'ignore'] });

    desktopMonitor.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output === 'DESKTOP' && mainWindow) {
            if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
                mainWindow.restore();
                mainWindow.show();
                // Removed moveTop() to prevent window from overlaying other apps
                // We want it to stay stuck behind other windows.
                if (!mainWindow.isAlwaysOnTop()) {
                    setTimeout(() => mainWindow.blur(), 50);
                }
            }
        }
    });
}

function createWindow() {
    try {
        const settings = loadSettings();
        const bounds = settings.bounds || { width: 1200, height: 600, x: 50, y: 100 };
        const alwaysOnTop = settings.alwaysOnTop !== undefined ? settings.alwaysOnTop : false;

        mainWindow = new BrowserWindow({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            frame: false,
            transparent: true,
            type: 'desktop', // This helps stick it to the wallpaper on Windows
            alwaysOnTop: alwaysOnTop,
            skipTaskbar: true,
            backgroundColor: '#00000000',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: true
            }
        });

        mainWindow.loadFile('index.html');

        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
            startDesktopMonitor();
        });

        mainWindow.on('resize', () => {
            saveSettings({ bounds: mainWindow.getBounds() });
        });

        mainWindow.on('move', () => {
            saveSettings({ bounds: mainWindow.getBounds() });
        });

        mainWindow.on('closed', () => {
            if (desktopMonitor) desktopMonitor.kill();
        });

    } catch (e) {
        console.error('Error creating window:', e);
    }
}

function createTray() {
    try {
        const icon = nativeImage.createEmpty();
        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Stick to Wallpaper (Widget Mode)',
                type: 'radio',
                checked: !loadSettings().alwaysOnTop,
                click: () => {
                    saveSettings({ alwaysOnTop: false });
                    if (mainWindow) {
                        mainWindow.setAlwaysOnTop(false);
                        mainWindow.blur();
                    }
                }
            },
            {
                label: 'Float Above (Overlay Mode)',
                type: 'radio',
                checked: loadSettings().alwaysOnTop || false,
                click: () => {
                    saveSettings({ alwaysOnTop: true });
                    if (mainWindow) {
                        mainWindow.setAlwaysOnTop(true);
                    }
                }
            },
            {
                label: 'Reset Workspace',
                click: () => {
                    saveSettings({ trelloUrl: null });
                    mainWindow.loadFile('index.html');
                }
            },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        ]);

        tray.setToolTip('Sticky Trello Widget');
        tray.setContextMenu(contextMenu);
    } catch (e) {
        console.error('Error creating tray:', e);
    }
}

// IPC Handlers
ipcMain.on('save-url', (event, url) => {
    saveSettings({ trelloUrl: url });
    if (mainWindow) mainWindow.webContents.send('load-url', url);
});

ipcMain.handle('get-config', () => {
    const settings = loadSettings();
    return {
        trelloUrl: settings.trelloUrl,
        alwaysOnTop: settings.alwaysOnTop || false
    };
});

ipcMain.on('close-app', () => {
    if (desktopMonitor) desktopMonitor.kill();
    app.quit();
});

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (desktopMonitor) desktopMonitor.kill();
    if (process.platform !== 'darwin') app.quit();
});
