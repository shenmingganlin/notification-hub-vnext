import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function pickerError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
const OPEN_DIALOG_SCRIPT = String.raw`
param([string]$Title = 'Import visual asset')
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if (-not ('NotificationHubDpi' -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NotificationHubDpi {
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
}
"@
}
[NotificationHubDpi]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $Title
$dialog.Filter = 'Visual assets (*.png;*.webp;*.jpg;*.jpeg)|*.png;*.webp;*.jpg;*.jpeg|All files (*.*)|*.*'
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Output 'CANCELLED'; exit 0 }
Write-Output ('SELECTED:' + $dialog.FileName)
`;
export function createWindowsVisualFilePicker({ platform = os.platform(), spawnImpl = spawn, powershellPath = 'powershell.exe', timeoutMs = 180000 } = {}) {
  if (platform !== 'win32') return Object.freeze({ async open() { throw pickerError('VISUAL_ASSET_FILE_PICKER_UNAVAILABLE', 'Windows 文件选择器只在 Windows 上可用'); } });
  return Object.freeze({ async open({ title = '导入视觉素材' } = {}) { return new Promise((resolve, reject) => { let child; try { child = spawnImpl(powershellPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-Command', OPEN_DIALOG_SCRIPT, '-Title', title], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (cause) { reject(pickerError('VISUAL_ASSET_FILE_PICKER_FAILED', '无法打开视觉素材文件选择器', { cause: cause.message })); return; } let stdout = ''; let stderr = ''; let timer; let settled = false; const finish = (fn) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); fn(); }; child.stdout?.on?.('data', (chunk) => { stdout += chunk.toString('utf8'); }); child.stderr?.on?.('data', (chunk) => { stderr += chunk.toString('utf8'); }); child.once?.('error', (cause) => finish(() => reject(pickerError('VISUAL_ASSET_FILE_PICKER_FAILED', '无法打开视觉素材文件选择器', { cause: cause.message })))); child.once?.('close', (code) => finish(() => { const output = stdout.trim(); if (output.startsWith('SELECTED:')) return resolve({ cancelled: false, path: output.slice(9).trim() }); if (output.includes('CANCELLED')) return resolve({ cancelled: true }); reject(pickerError('VISUAL_ASSET_FILE_PICKER_FAILED', stderr.trim() || output || `文件选择器退出码 ${code}`)); })); timer = setTimeout(() => finish(() => { child.kill?.(); reject(pickerError('VISUAL_ASSET_FILE_PICKER_TIMEOUT', '视觉素材文件选择器超时')); }), timeoutMs); }); } });
}
export { OPEN_DIALOG_SCRIPT };
