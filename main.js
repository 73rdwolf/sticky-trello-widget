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
        // Handle legacy 'url' key if it exists
        if (current.url && !current.trelloUrl) {
            current.trelloUrl = current.url;
            delete current.url;
        }
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
public class User32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@

function Get-DesktopWorker {
    $progman = [User32]::FindWindow("Progman", $null)
    $res = [IntPtr]::Zero
    [User32]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [out]$res) | Out-Null
    
    $workerW = [IntPtr]::Zero
    $shellView = [IntPtr]::Zero
    
    # We need to find the WorkerW window that is behind the desktop icons
    # It is usually created after sending the 0x052C message
    $workerW = [User32]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "WorkerW", $null)
    while ($workerW -ne [IntPtr]::Zero) {
        $shellView = [User32]::FindWindowEx($workerW, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
        if ($shellView -ne [IntPtr]::Zero) {
            # This is the icons worker. The one *immediately after* is the background worker.
            $backgroundWorker = [User32]::FindWindowEx([IntPtr]::Zero, $workerW, "WorkerW", $null)
            if ($backgroundWorker -ne [IntPtr]::Zero) { return $backgroundWorker }
        }
        $workerW = [User32]::FindWindowEx([IntPtr]::Zero, $workerW, "WorkerW", $null)
    }
    return $progman
}

if ($args[0] -eq "anchor") {
    $myHwnd = [User32]::FindWindow($null, "Sticky Trello Widget")
    if ($myHwnd -ne [IntPtr]::Zero) {
        $desktop = Get-DesktopWorker
        [User32]::SetParent($myHwnd, $desktop)
    }
    exit
}

while ($true) {
    try {
        $hwnd = [User32]::GetForegroundWindow()
        $sb = New-Object System.Text.StringBuilder 256
        [User32]::GetClassName($hwnd, $sb, 256) | Out-Null
        $cls = $sb.ToString()
        if ($cls -eq "WorkerW" -or $cls -eq "Progman" -or $cls -eq "SysListView32") {
            Write-Output "DESKTOP"
        }
    } catch {}
    Start-Sleep -Milliseconds 1000
}
`;
    const scriptPath = path.join(app.getPath('userData'), 'desktop_monitor.ps1');
    fs.writeFileSync(scriptPath, psScript);

    // Initial anchor call
    spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, 'anchor'], { shell: true });

    desktopMonitor = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });

    desktopMonitor.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output === 'DESKTOP' && mainWindow) {
            // Re-anchor if in widget mode
            if (!loadSettings().alwaysOnTop) {
                // Re-trigger anchoring via PS
                spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, 'anchor'], { shell: true });

                // Forcibly restore and show without stealing focus
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.showInactive();

                // Ensure it's at the bottom of the stack
                setTimeout(() => {
                    if (mainWindow) mainWindow.blur();
                }, 100);
            }
        }
    });
}

function createWindow() {
    try {
        const settings = loadSettings();
        // Fallback for legacy 'url' key
        const trelloUrl = settings.trelloUrl || settings.url || null;
        const bounds = settings.bounds || { width: 1200, height: 600, x: 50, y: 100 };
        const alwaysOnTop = settings.alwaysOnTop !== undefined ? settings.alwaysOnTop : false;

        mainWindow = new BrowserWindow({
            title: 'Sticky Trello Widget',
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            frame: false,
            transparent: true,
            type: alwaysOnTop ? 'normal' : 'toolbar',
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
            if (!alwaysOnTop) {
                startDesktopMonitor();
            }
        });

        mainWindow.on('resize', () => {
            saveSettings({ bounds: mainWindow.getBounds() });
        });

        mainWindow.on('move', () => {
            saveSettings({ bounds: mainWindow.getBounds() });
        });

        // Prevent minimization in Widget Mode (Win+D handling)
        mainWindow.on('minimize', (event) => {
            const settings = loadSettings();
            if (!settings.alwaysOnTop) {
                event.preventDefault();
                mainWindow.restore();
                mainWindow.showInactive();
            }
        });

        mainWindow.on('closed', () => {
            if (desktopMonitor) {
                desktopMonitor.kill();
                desktopMonitor = null;
            }
        });

    } catch (e) {
        console.error('Error creating window:', e);
    }
}

function recreateWindow() {
    if (mainWindow) {
        mainWindow.close();
    }
    createWindow();
}

function createTray() {
    try {
        let iconPath = path.join(__dirname, 'assets', 'icon.png');
        if (!fs.existsSync(iconPath)) {
            iconPath = path.join(__dirname, 'assets', 'icon-256.png');
        }

        const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
        tray = new Tray(icon.resize({ width: 16, height: 16 }));

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Stick to Wallpaper (Widget Mode)',
                type: 'radio',
                checked: !loadSettings().alwaysOnTop,
                click: () => {
                    const current = loadSettings().alwaysOnTop;
                    if (current !== false) {
                        saveSettings({ alwaysOnTop: false });
                        recreateWindow();
                    }
                }
            },
            {
                label: 'Float Above (Overlay Mode)',
                type: 'radio',
                checked: loadSettings().alwaysOnTop || false,
                click: () => {
                    const current = loadSettings().alwaysOnTop;
                    if (current !== true) {
                        saveSettings({ alwaysOnTop: true });
                        recreateWindow();
                    }
                }
            },
            {
                label: 'Reset Workspace',
                click: () => {
                    saveSettings({ trelloUrl: null });
                    if (mainWindow) {
                        mainWindow.loadFile('index.html');
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit', click: () => {
                    if (desktopMonitor) desktopMonitor.kill();
                    app.quit();
                }
            }
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
        trelloUrl: settings.trelloUrl || settings.url || null,
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
