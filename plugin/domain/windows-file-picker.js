import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function pickerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function safeFilename(value, fallback = 'notification-hub-sounds', extension = 'nhsound') {
  const safeExtension = String(extension || 'nhsound').replace(/[^a-z0-9]+/giu, '').toLowerCase() || 'nhsound';
  let normalized = String(value ?? fallback)
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/gu, '_')
    .replace(/\.+$/u, '')
    .trim();
  const extensionSuffix = `.${safeExtension}`;
  if (normalized.toLowerCase().endsWith(extensionSuffix)) normalized = normalized.slice(0, -extensionSuffix.length);
  normalized = normalized.replace(/\.+$/u, '').trim().slice(0, 80);
  if (!normalized || normalized === '.' || normalized === '..') normalized = fallback;
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(normalized)) normalized = `_${normalized}`;
  return `${normalized}${extensionSuffix}`;
}

export function createWindowsSaveFilePicker({
  platform = os.platform(),
  spawnImpl = spawn,
  powershellPath = 'powershell.exe',
  tempDirectory = os.tmpdir(),
  timeoutMs = 180000
} = {}) {
  if (platform !== 'win32') {
    return Object.freeze({
      async save() {
        throw pickerError('SOUND_PACKAGE_FILE_PICKER_UNAVAILABLE', 'Windows 保存对话框只在 Windows 上可用');
      }
    });
  }

  return Object.freeze({
    async save({
      suggestedName = 'notification-hub-sounds.nhsound',
      content = '',
      extension = 'nhsound',
      title = 'Export Notification Hub sound package',
      filter = 'Notification Hub sound package (*.nhsound)|*.nhsound|All files (*.*)|*.*'
    } = {}) {
      const filename = safeFilename(suggestedName, 'notification-hub-sounds', extension);
      await mkdir(tempDirectory, { recursive: true });
      const temporaryPath = path.join(tempDirectory, `notification-hub-save-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${String(extension).replace(/[^a-z0-9]+/giu, '').toLowerCase() || 'nhsound'}`);
      await writeFile(temporaryPath, String(content), { encoding: 'utf8', flag: 'wx' });
      const scriptPath = path.join(tempDirectory, `notification-hub-save-sound-package-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
      // Windows PowerShell 5.1 requires a BOM to reliably detect UTF-8 scripts.
      // Without it, Chinese literals are decoded with the system code page and can cause ParserError.
      const scriptBytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(SAVE_DIALOG_SCRIPT, 'utf8')]);
      await writeFile(scriptPath, scriptBytes, { flag: 'wx' });
      try {
        const selectedPath = await runSaveDialog({ spawnImpl, powershellPath, filename, temporaryPath, scriptPath, timeoutMs, title, filter });
        return selectedPath ? { cancelled: false, path: selectedPath } : { cancelled: true };
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(scriptPath, { force: true }).catch(() => {});
      }
    }
  });
}

function runSaveDialog({ spawnImpl, powershellPath, filename, temporaryPath, scriptPath, timeoutMs, title, filter }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(powershellPath, [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', scriptPath,
        '-Filename', filename, '-TemporaryPath', temporaryPath, '-Title', title, '-Filter', filter
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (cause) {
      reject(pickerError('SOUND_PACKAGE_FILE_PICKER_FAILED', '无法打开 Windows 保存对话框', { cause: cause.message }));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      handler();
    };
    child.stdout?.on?.('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on?.('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once?.('error', (cause) => finish(() => reject(pickerError('SOUND_PACKAGE_FILE_PICKER_FAILED', '无法打开 Windows 保存对话框', { cause: cause.message }))));
    child.once?.('close', (code) => finish(() => {
      const output = stdout.trim();
      if (output.startsWith('SELECTED:')) {
        resolve(output.slice('SELECTED:'.length).trim());
        return;
      }
      if (output.includes('CANCELLED')) {
        resolve('');
        return;
      }
      reject(pickerError('SOUND_PACKAGE_FILE_PICKER_FAILED', stderr.trim() || output || `保存对话框退出码 ${code}`));
    }));
    timer = setTimeout(() => finish(() => {
      child.kill?.();
      reject(pickerError('SOUND_PACKAGE_FILE_PICKER_TIMEOUT', 'Windows 保存对话框超时'));
    }), timeoutMs);
  });
}

const SAVE_DIALOG_SCRIPT = String.raw`
param(
  [string]$Filename = 'notification-hub-sounds.nhsound',
  [string]$TemporaryPath = '',
  [string]$Title = 'Export Notification Hub sound package',
  [string]$Filter = 'Notification Hub sound package (*.nhsound)|*.nhsound|All files (*.*)|*.*'
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
# Make the child WinForms process render crisply on mixed/high-DPI displays.
# The call is intentionally best-effort because Windows may already have set the process DPI context.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NhDpi {
  [DllImport("user32.dll")]
  private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("shcore.dll")]
  private static extern int SetProcessDpiAwareness(int value);
  public static void Enable() {
    if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDpiAwareness(2);
  }
}
"@
[NhDpi]::Enable()
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = $Title
$dialog.Filter = $Filter
$dialog.FileName = $Filename
$dialog.DefaultExt = 'nhsound'
$dialog.AddExtension = $true
$dialog.OverwritePrompt = $true
$result = $dialog.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Output 'CANCELLED'
  exit 0
}
if (-not $TemporaryPath -or -not (Test-Path -LiteralPath $TemporaryPath)) {
  Write-Error 'temporary export file is missing'
  exit 2
}
[IO.File]::Copy($TemporaryPath, $dialog.FileName, $true)
Write-Output ('SELECTED:' + $dialog.FileName)
`;

export { safeFilename };
