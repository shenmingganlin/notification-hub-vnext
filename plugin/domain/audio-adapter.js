import { readFile, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CUE = 'default';
const DEFAULT_VOLUME = 1;
const DEFAULT_FORMATS = Object.freeze(['.wav', '.mp3', '.m4a', '.aac', '.wma']);
const BUILT_IN_CUES = new Set([
  'default', 'success', 'error', 'critical',
  'chat-incoming', 'channel-incoming', 'tool-complete', 'tool-failed',
  'plugin-notice', 'warning', 'critical-error'
]);
const WINDOWS_CUE_TONES = Object.freeze({
  default: 660,
  success: 880,
  error: 220,
  critical: 330,
  'chat-incoming': 660,
  'channel-incoming': 740,
  'tool-complete': 880,
  'tool-failed': 220,
  'plugin-notice': 560,
  warning: 440,
  'critical-error': 180
});

export const WINDOWS_SYSTEM_SOUND_CUES = Object.freeze({
  default: Object.freeze({ files: Object.freeze(['ding.wav', 'Windows Ding.wav']), alias: 'SystemDefault' }),
  success: Object.freeze({ files: Object.freeze(['ding.wav', 'Windows Ding.wav']), alias: 'SystemDefault' }),
  error: Object.freeze({ files: Object.freeze(['Windows Exclamation.wav']), alias: 'SystemExclamation' }),
  critical: Object.freeze({ files: Object.freeze(['Windows Critical Stop.wav']), alias: 'SystemHand' }),
  'chat-incoming': Object.freeze({ files: Object.freeze(['chimes.wav', 'Windows Chimes.wav']), alias: 'SystemAsterisk' }),
  'channel-incoming': Object.freeze({ files: Object.freeze(['notify.wav', 'Windows Notify.wav']), alias: 'SystemAsterisk' }),
  'tool-complete': Object.freeze({ files: Object.freeze(['ding.wav', 'Windows Ding.wav']), alias: 'SystemDefault' }),
  'tool-failed': Object.freeze({ files: Object.freeze(['Windows Exclamation.wav']), alias: 'SystemExclamation' }),
  'plugin-notice': Object.freeze({ files: Object.freeze(['notify.wav', 'Windows Notify.wav']), alias: 'SystemAsterisk' }),
  warning: Object.freeze({ files: Object.freeze(['Windows Exclamation.wav']), alias: 'SystemExclamation' }),
  'critical-error': Object.freeze({ files: Object.freeze(['Windows Critical Stop.wav']), alias: 'SystemHand' })
});

export function resolveWindowsSystemSoundCue(cue) {
  const normalized = typeof cue === 'string' ? cue.trim() : '';
  return WINDOWS_SYSTEM_SOUND_CUES[normalized] ?? null;
}

// Scheduler suppression must use the resource that will actually be played,
// not only the domain cue. Several domain cues intentionally map to the same
// Windows media file (for example warning/tool-failed/error). At full volume
// the Windows media file is used; at lower volume the adapter generates a tone,
// so the domain cue remains the stable playback identity.
export function resolveSoundPlaybackKey(decision = {}) {
  const rawSoundId = typeof decision.soundId === 'string' ? decision.soundId.trim() : '';
  const rawCue = typeof decision.cue === 'string' ? decision.cue.trim() : '';
  const builtinCue = rawSoundId.startsWith('builtin.') ? rawSoundId.slice('builtin.'.length) : '';
  const cue = builtinCue || rawCue;
  if (!cue && rawSoundId) return `sound-id:${rawSoundId}`;

  const systemCue = resolveWindowsSystemSoundCue(cue);
  const volume = Number(decision.volume);
  if (systemCue && volume >= 0.999999) {
    return `windows-media:${systemCue.files[0].toLowerCase()}`;
  }
  if (cue) return `generated-tone:${cue}`;
  return rawSoundId ? `sound-id:${rawSoundId}` : null;
}

function audioAdapterError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateDecision(decision) {
  if (!decision || typeof decision !== 'object' || typeof decision.play !== 'boolean') {
    throw audioAdapterError('AUDIO_ADAPTER_DECISION_INVALID', 'audio decision must include a boolean play field');
  }
  return decision;
}

function validateBackend(backend) {
  if (!backend || typeof backend !== 'object'
    || typeof backend.playCue !== 'function'
    || typeof backend.playFile !== 'function') {
    throw audioAdapterError('AUDIO_ADAPTER_BACKEND_INVALID', 'audio backend must provide playCue and playFile methods');
  }
  return backend;
}

function validateVolume(volume) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw audioAdapterError('AUDIO_ADAPTER_VOLUME_INVALID', 'audio volume must be a finite number from 0 to 1');
  }
  return volume;
}

function freezeResult(result) {
  return Object.freeze({ ...result });
}

async function isExistingFile(customPath) {
  try {
    return (await stat(customPath)).isFile();
  } catch {
    return false;
  }
}

async function isPathInsideRealRoot(root, target) {
  if (typeof root !== 'string' || !root.trim()) return true;
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    const relative = path.relative(realRoot, realTarget);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function playbackResult({ played, source, cue, soundId, path: soundPath, volume, reason, diagnostic, voiceId = null, muted = false }) {
  return freezeResult({
    attempted: true,
    played,
    source,
    cue,
    ...(soundId ? { soundId } : {}),
    path: soundPath,
    volume,
    reason,
    diagnostic,
    ...(voiceId ? { voiceId } : {}),
    ...(muted ? { muted: true } : {})
  });
}

function resolveSoundAsset(decision, options) {
  if (typeof decision.soundId !== 'string' || !decision.soundId.trim()) {
    return { soundId: null, cue: typeof decision.cue === 'string' && decision.cue.trim() ? decision.cue.trim() : DEFAULT_CUE, customPath: '' };
  }
  const soundId = decision.soundId.trim();
  const registry = options.assetRegistry;
  if (!registry || typeof registry.resolvePlayback !== 'function') {
    return { soundId, cue: '', customPath: '', diagnostic: 'SOUND_ASSET_REGISTRY_UNAVAILABLE' };
  }
  const asset = registry.resolvePlayback(soundId);
  if (!asset || asset.kind === 'missing' || asset.kind === 'disabled') {
    return { soundId, cue: '', customPath: '', diagnostic: asset?.diagnostic ?? 'SOUND_ASSET_NOT_FOUND' };
  }
  if (asset.kind === 'builtin') return { soundId, cue: asset.builtinCue, customPath: '' };
  const root = typeof options.soundAssetRoot === 'string' ? options.soundAssetRoot.trim() : '';
  if (!root || !asset.relativePath) return { soundId, cue: '', customPath: '', diagnostic: 'SOUND_ASSET_ROOT_INVALID' };
  const customPath = path.resolve(root, ...asset.relativePath.split('/'));
  const rootPath = path.resolve(root);
  const relative = path.relative(rootPath, customPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { soundId, cue: '', customPath: '', diagnostic: 'SOUND_ASSET_PATH_INVALID' };
  return { soundId, cue: '', customPath };
}

async function playCue(backend, cue, volume, reason = 'played', diagnostic = null) {
  try {
    const playback = await backend.playCue({ cue, volume });
    const played = playback === true || playback?.played === true;
    const deviceUnavailable = playback?.deviceAvailable === false;
    return playbackResult({
      played: played && !deviceUnavailable,
      source: 'cue',
      cue,
      path: '',
      volume,
      reason: deviceUnavailable ? 'audio-device-unavailable' : played ? reason : 'playback-failed',
      diagnostic: deviceUnavailable ? 'AUDIO_DEVICE_UNAVAILABLE' : played ? diagnostic : (playback?.diagnostic ?? 'SOUND_PLAYBACK_FAILED'),
      voiceId: playback?.voiceId ?? null,
      muted: playback?.muted === true
    });
  } catch (error) {
    return playbackResult({
      played: false,
      source: 'cue',
      cue,
      path: '',
      volume,
      reason: 'playback-failed',
      diagnostic: error?.code ? `${error.code}: ${error.message ?? String(error)}` : 'SOUND_PLAYBACK_FAILED',
      error: error?.message ?? String(error)
    });
  }
}

function resourceFailure({ cue, soundId, customPath, volume, reason, diagnostic = 'SOUND_PATH_INVALID' }) {
  return playbackResult({
    played: false,
    source: 'none',
    cue,
    soundId,
    path: customPath,
    volume,
    reason,
    diagnostic
  });
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runPowerShell({ script, spawnImpl, powershellPath, timeoutMs = 15000, activeChildren = null }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(powershellPath, [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodePowerShell(script)
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      resolve({ played: false, diagnostic: 'AUDIO_PROCESS_START_FAILED' });
      return;
    }

    activeChildren?.add(child);
    let stderr = '';
    child.stderr?.on?.('data', (chunk) => { stderr += chunk.toString('utf8'); });
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      activeChildren?.delete(child);
      resolve(result);
    };
    child.once('error', () => finish({ played: false, diagnostic: 'AUDIO_PROCESS_FAILED' }));
    child.once('close', (code) => finish(code === 0
      ? { played: true }
      : { played: false, diagnostic: stderr.trim().slice(0, 240) || 'AUDIO_PROCESS_EXITED' }));
    timer = setTimeout(() => {
      child.kill?.();
      finish({ played: false, timedOut: true, diagnostic: 'AUDIO_PLAYBACK_TIMEOUT' });
    }, timeoutMs);
  });
}

function persistentPowerShellScript() {
  return [
    '$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
    '$ErrorActionPreference = \'Stop\'',
    'while (($line = [Console]::In.ReadLine()) -ne $null) {',
    '  try {',
    '    $script = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($line))',
    '    & ([scriptblock]::Create($script)) | Out-Null',
    '    [Console]::Out.WriteLine(\'{"played":true}\')',
    '  } catch {',
    '    $message = $_.Exception.Message.Replace(\'\\\', \'\\\\\').Replace(\'"\', \'\\"\').Replace([Environment]::NewLine, \' \')',
    '    [Console]::Out.WriteLine((ConvertTo-Json @{ played = $false; diagnostic = $message.Substring(0, [Math]::Min(240, $message.Length)) } -Compress))',
    '  }',
    '}'
  ].join('\n');
}

function createPersistentPowerShellRunner({ spawnImpl, powershellPath, timeoutMs = 15000 }) {
  let child = null;
  let stdoutBuffer = '';
  let active = null;
  let queue = [];
  let disposed = false;

  function ensureChild() {
    if (child) return child;
    if (disposed) return null;
    try {
      child = spawnImpl(powershellPath, [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodePowerShell(persistentPowerShellScript())
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      child = null;
      return null;
    }
    child.stdout?.on?.('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line || !active) continue;
        try {
          active.finish(JSON.parse(line));
        } catch {
          active.finish({ played: false, diagnostic: 'AUDIO_PROCESS_RESPONSE_INVALID' });
        }
      }
    });
    const process = child;
    const onProcessExit = (diagnostic) => {
      // A timed-out process may emit close after the next generation has
      // already been spawned. Old generations must never settle new work.
      if (child !== process) return;
      child = null;
      stdoutBuffer = '';
      active?.finish({ played: false, diagnostic });
    };
    process.once('error', () => onProcessExit('AUDIO_PROCESS_FAILED'));
    process.once('close', () => onProcessExit('AUDIO_PROCESS_EXITED'));
    return child;
  }

  function startNext() {
    if (active || disposed || queue.length === 0) return;
    const item = queue.shift();
    const process = ensureChild();
    if (!process?.stdin?.write) {
      item.finish({ played: false, diagnostic: 'AUDIO_PROCESS_START_FAILED' });
      startNext();
      return;
    }
    active = item;
    item.timer = setTimeout(() => {
      if (active !== item) return;
      active = null;
      child?.kill?.();
      child = null;
      item.finish({ played: false, timedOut: true, diagnostic: 'AUDIO_PLAYBACK_TIMEOUT' });
      startNext();
    }, timeoutMs);
    try {
      process.stdin.write(`${encodePowerShell(item.script)}\n`, 'utf8');
    } catch {
      active = null;
      clearTimeout(item.timer);
      item.finish({ played: false, diagnostic: 'AUDIO_PROCESS_WRITE_FAILED' });
      startNext();
    }
  }

  function play(script) {
    return new Promise((resolve) => {
      if (disposed) { resolve({ played: false, diagnostic: 'AUDIO_PROCESS_DISPOSED' }); return; }
      const item = {
        script,
        timer: null,
        finish(result) {
          if (item.settled) return;
          item.settled = true;
          if (item.timer) clearTimeout(item.timer);
          if (active === item) active = null;
          resolve(result);
          startNext();
        }
      };
      queue.push(item);
      startNext();
    });
  }

  return Object.freeze({
    play,
    async warmup() {
      if (disposed) return false;
      const result = await play('$null');
      return result?.played === true;
    },
    dispose() {
      disposed = true;
      const process = child;
      child = null;
      active?.finish({ played: false, diagnostic: 'AUDIO_PROCESS_DISPOSED' });
      active = null;
      for (const item of queue.splice(0)) item.finish({ played: false, diagnostic: 'AUDIO_PROCESS_DISPOSED' });
      process?.kill?.();
    }
  });
}

export function createWindowsAudioBackend({
  platform = os.platform(),
  spawnImpl = spawn,
  powershellPath = 'powershell.exe',
  persistent = false,
  timeoutMs = 15000
} = {}) {
  if (typeof platform !== 'string' || typeof spawnImpl !== 'function') {
    throw audioAdapterError('AUDIO_ADAPTER_BACKEND_INVALID', 'Windows audio backend options are invalid');
  }

  if (platform !== 'win32') {
    return Object.freeze({
      async playCue() {
        return { played: false, deviceAvailable: false };
      },
      async playFile() {
        return { played: false, deviceAvailable: false };
      },
      async warmup() { return false; },
      dispose() {}
    });
  }

  const activeChildren = new Set();
  const persistentRunner = persistent
    ? createPersistentPowerShellRunner({ spawnImpl, powershellPath, timeoutMs })
    : null;
  const runScript = (script) => persistentRunner
    ? persistentRunner.play(script)
    : runPowerShell({ spawnImpl, powershellPath, script, activeChildren });

  return Object.freeze({
    async playCue({ cue, volume }) {
      const frequency = WINDOWS_CUE_TONES[cue];
      const systemCue = resolveWindowsSystemSoundCue(cue);
      if (!frequency || !systemCue || !Number.isFinite(volume)) return { played: false };
      const safeVolume = Math.max(0, Math.min(1, volume));
      if (safeVolume === 0) return { played: true, muted: true };
      // Do not use WinMM PlaySound with SND_ASYNC here. PlaySound is a
      // process-global single stream: a later call can replace an earlier
      // sound even when the Node scheduler has already started both calls.
      // Each notification owns an independent PowerShell process, so a
      // blocking SoundPlayer.PlaySync gives real overlap across requests.
      const fileNames = systemCue.files.map((file) => `'${file.replaceAll("'", "''")}'`).join(', ');
      return runScript([
        "$ErrorActionPreference = 'Stop'",
        "$mediaDir = Join-Path ([Environment]::GetFolderPath('Windows')) 'Media'",
        `$files = @(${fileNames})`,
        '$played = $false',
        `$useSystemCue = ${safeVolume.toFixed(6)} -ge 0.999999`,
        'if ($useSystemCue) {',
        '  foreach ($name in $files) {',
        '    $candidate = Join-Path $mediaDir $name',
        '    if (Test-Path -LiteralPath $candidate -PathType Leaf) {',
        '      try {',
        '        $player = [System.Media.SoundPlayer]::new($candidate)',
        '        try { $player.Load(); $player.PlaySync(); $played = $true; break } finally { $player.Dispose() }',
        '      } catch {}',
        '    }',
        '  }',
        '}',
        'if (-not $played) {',
        '$sampleRate = 44100',
        '$duration = 0.16',
        `$frequency = ${frequency}`,
        `$amplitude = ${safeVolume.toFixed(6)}`,
        '$sampleCount = [int]($sampleRate * $duration)',
        '$data = New-Object byte[] ($sampleCount * 2)',
        'for ($i = 0; $i -lt $sampleCount; $i++) {',
        '  $envelope = 1.0',
        '  if ($i -lt ($sampleRate * 0.012)) { $envelope = $i / ($sampleRate * 0.012) }',
        '  if ($i -gt ($sampleCount - ($sampleRate * 0.035))) { $envelope = ($sampleCount - $i) / ($sampleRate * 0.035) }',
        '  $sample = [int16]([math]::Sin(2 * [math]::PI * $frequency * $i / $sampleRate) * 32767 * $amplitude * [math]::Max(0, [math]::Min(1, $envelope)))',
        '  $bytes = [BitConverter]::GetBytes($sample)',
        '  $data[$i * 2] = $bytes[0]; $data[$i * 2 + 1] = $bytes[1]',
        '}',
        '$stream = [IO.MemoryStream]::new()',
        '$writer = [IO.BinaryWriter]::new($stream)',
        '$writer.Write([Text.Encoding]::ASCII.GetBytes("RIFF"))',
        '$writer.Write([int32](36 + $data.Length))',
        '$writer.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt "))',
        '$writer.Write([int32]16); $writer.Write([int16]1); $writer.Write([int16]1)',
        '$writer.Write([int32]$sampleRate); $writer.Write([int32]($sampleRate * 2))',
        '$writer.Write([int16]2); $writer.Write([int16]16)',
        '$writer.Write([Text.Encoding]::ASCII.GetBytes("data")); $writer.Write([int32]$data.Length); $writer.Write($data)',
        '$writer.Flush(); $stream.Position = 0',
        '$player = [System.Media.SoundPlayer]::new($stream); try { $player.PlaySync(); $played = $true } finally { $player.Dispose(); $writer.Dispose(); $stream.Dispose() }',
        '}',
        'if (-not $played) { throw "Windows sound playback failed" }'
      ].join("\n"));
    },
    async playFile({ path: soundPath, volume }) {
      if (typeof soundPath !== 'string' || !soundPath || !Number.isFinite(volume) || soundPath.includes('"')) {
        return { played: false };
      }
      const extension = path.extname(soundPath).toLowerCase();
      if (!DEFAULT_FORMATS.includes(extension)) return { played: false };
      let contentType = extension;
      try {
        const header = await readFile(soundPath, { encoding: null, flag: 'r' });
        if (header.length >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WAVE') contentType = '.wav';
        else if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) contentType = '.mp3';
        else if (header.length >= 3 && header.subarray(0, 3).toString('ascii') === 'ID3') contentType = '.mp3';
      } catch {
        // Let the media backend return its normal open error.
      }
      const escapedPath = soundPath.replace(/'/g, "''");
      const safeVolume = Math.max(0, Math.min(1, volume));
      const mediaType = contentType === '.wav' ? 'waveaudio' : 'mpegvideo';
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "if (-not ([System.Management.Automation.PSTypeName]'NhMci').Type) {",
        'Add-Type @"',
        'using System;',
        'using System.Text;',
        'using System.Runtime.InteropServices;',
        'public static class NhMci { [DllImport("winmm.dll", CharSet = CharSet.Unicode)] public static extern int mciSendString(string command, StringBuilder buffer, int bufferSize, IntPtr callback); }',
        '"@',
        '}',
        `$alias = 'nhSound' + [Guid]::NewGuid().ToString('N')`,
        `$file = '${escapedPath}'`,
        `$open = [NhMci]::mciSendString(('open "' + $file + '" type ${mediaType} alias ' + $alias), $null, 0, [IntPtr]::Zero)`,
        `if ($open -ne 0 -and '${contentType}' -eq '.wav') { $open = [NhMci]::mciSendString(('open "' + $file + '" alias ' + $alias), $null, 0, [IntPtr]::Zero) }`,
        `if ($open -ne 0 -and '${contentType}' -ne '.wav') { throw "MCI open failed: $open" }`,
        `$volume = [int](${safeVolume.toFixed(6)} * 1000)`,
        '$played = $false',
        'if ($open -eq 0) {',
        '  try {',
        '    $set = [NhMci]::mciSendString(("setaudio " + $alias + " volume to " + $volume), $null, 0, [IntPtr]::Zero)',
        '    if ($set -eq 0) {',
        `      $play = [NhMci]::mciSendString(('play ' + $alias + ' wait'), $null, 0, [IntPtr]::Zero)`,
        '      if ($play -eq 0) { $played = $true }',
        '    }',
        '  } finally { [NhMci]::mciSendString(("close " + $alias), $null, 0, [IntPtr]::Zero) | Out-Null }',
        '}',
        `if (-not $played -and '${contentType}' -eq '.wav') {`,
        '  Add-Type -AssemblyName PresentationCore',
        '  Add-Type -AssemblyName WindowsBase',
        '  $player = [System.Windows.Media.MediaPlayer]::new()',
        '  try {',
        `    $player.Volume = ${safeVolume.toFixed(6)}`,
        '    $player.Open([Uri]$file)',
        '    $ready = $false',
        '    for ($i = 0; $i -lt 80 -and -not $ready; $i++) { Start-Sleep -Milliseconds 25; $ready = $player.NaturalDuration.HasTimeSpan }',
        '    if (-not $ready) { throw "WAV media open failed" }',
        '    $player.Play()',
        '    Start-Sleep -Milliseconds ([int]([Math]::Max(1, $player.NaturalDuration.TimeSpan.TotalMilliseconds)))',
        '    $played = $true',
        '  } finally { $player.Close() }',
        '}',
        `if (-not $played -and '${contentType}' -ne '.wav') { throw "MCI playback failed: $open" }`,
        'if (-not $played) { throw "WAV playback failed" }'
      ].join("\n");
      return runScript(script);
    },
    async warmup() {
      return persistentRunner ? persistentRunner.warmup() : false;
    },
    dispose() {
      persistentRunner?.dispose();
      for (const child of activeChildren) child.kill?.();
      activeChildren.clear();
    }
  });
}

export async function playNotificationSound({ decision, backend, options = {} } = {}) {
  validateDecision(decision);
  validateBackend(backend);
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw audioAdapterError('AUDIO_ADAPTER_OPTIONS_INVALID', 'audio adapter options must be an object');
  }

  const resolved = resolveSoundAsset(decision, options);
  const soundId = resolved.soundId;
  const cue = resolved.cue || '';
  const volume = validateVolume(decision.volume ?? DEFAULT_VOLUME);

  if (!decision.play) {
    return freezeResult({
      attempted: false,
      played: false,
      source: 'none',
      cue: cue || null,
      ...(soundId ? { soundId } : {}),
      path: '',
      volume,
      reason: 'policy-denied',
      diagnostic: null
    });
  }

  if (resolved.diagnostic) {
    return resourceFailure({
      cue: cue || null,
      soundId,
      customPath: '',
      volume,
      reason: 'sound-asset-unavailable',
      diagnostic: resolved.diagnostic
    });
  }
  if (!BUILT_IN_CUES.has(cue) && !resolved.customPath) {
    throw audioAdapterError('AUDIO_ADAPTER_CUE_INVALID', `unsupported built-in cue: ${cue}`);
  }

  const customPath = resolved.customPath || (typeof options.customPath === 'string' ? options.customPath.trim() : '');
  const allowFormats = options.allowFormats ?? DEFAULT_FORMATS;
  if (!Array.isArray(allowFormats) || allowFormats.some((format) => typeof format !== 'string')) {
    throw audioAdapterError('AUDIO_ADAPTER_OPTIONS_INVALID', 'allowFormats must be an array of strings');
  }

  if (customPath) {
    const extension = path.extname(customPath).toLowerCase();
    const formats = allowFormats.map((format) => format.toLowerCase());
    const resourceReason = !formats.includes(extension)
      ? 'sound-format-unsupported'
      : !path.isAbsolute(customPath) || !(await isExistingFile(customPath))
        ? 'sound-path-invalid'
        : !(await isPathInsideRealRoot(options.soundAssetRoot, customPath))
          ? 'sound-path-invalid'
          : null;

    if (!resourceReason) {
      if (volume === 0) {
        return playbackResult({
          played: true,
          source: 'file',
          cue,
          soundId,
          path: customPath,
          volume,
          reason: 'muted',
          diagnostic: null,
          muted: true
        });
      }
      try {
        const playback = await backend.playFile({ path: customPath, soundId, volume });
        const played = playback === true || playback?.played === true;
        const deviceUnavailable = playback?.deviceAvailable === false;
        return playbackResult({
          played: played && !deviceUnavailable,
          source: 'file',
          cue,
          soundId,
          path: customPath,
          volume,
          reason: deviceUnavailable ? 'audio-device-unavailable' : played ? 'played' : 'playback-failed',
          diagnostic: deviceUnavailable ? 'AUDIO_DEVICE_UNAVAILABLE' : played ? null : (playback?.diagnostic ?? 'SOUND_PLAYBACK_FAILED'),
          voiceId: playback?.voiceId ?? null
        });
      } catch (error) {
        return playbackResult({
          played: false,
          source: 'file',
          cue,
          soundId,
          path: customPath,
          volume,
          reason: 'playback-failed',
          diagnostic: error?.code ? `${error.code}: ${error.message ?? String(error)}` : 'SOUND_PLAYBACK_FAILED',
          error: error?.message ?? String(error)
        });
      }
    }

    if (options.fallbackCue === null) {
      return resourceFailure({ cue, soundId, customPath, volume, reason: resourceReason });
    }
    const fallbackCue = options.fallbackCue ?? DEFAULT_CUE;
    if (typeof fallbackCue !== 'string' || !BUILT_IN_CUES.has(fallbackCue.trim())) {
      throw audioAdapterError('AUDIO_ADAPTER_CUE_INVALID', `unsupported fallback cue: ${fallbackCue}`);
    }
    return playCue(backend, fallbackCue.trim(), volume, 'fallback-played', 'SOUND_PATH_INVALID');
  }

  return playCue(backend, cue, volume);
}
