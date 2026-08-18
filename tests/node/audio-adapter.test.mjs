import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createWindowsAudioBackend,
  playNotificationSound,
  resolveSoundPlaybackKey,
  resolveWindowsSystemSoundCue,
  WINDOWS_SYSTEM_SOUND_CUES
} from '../../plugin/domain/audio-adapter.js';
import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';

function fakeBackend(calls) {
  return {
    playCue(input) {
      calls.push({ method: 'playCue', input });
      return { played: true };
    },
    playFile(input) {
      calls.push({ method: 'playFile', input });
      return { played: true };
    }
  };
}

test('legacy Windows built-in cue mapping resolves media candidates and system aliases', () => {
  assert.deepEqual(resolveWindowsSystemSoundCue('default'), WINDOWS_SYSTEM_SOUND_CUES.default);
  assert.deepEqual(resolveWindowsSystemSoundCue('chat-incoming'), {
    files: ['chimes.wav', 'Windows Chimes.wav'],
    alias: 'SystemAsterisk'
  });
  assert.deepEqual(resolveWindowsSystemSoundCue('channel-incoming'), {
    files: ['notify.wav', 'Windows Notify.wav'],
    alias: 'SystemAsterisk'
  });
  assert.deepEqual(resolveWindowsSystemSoundCue('warning'), {
    files: ['Windows Exclamation.wav'],
    alias: 'SystemExclamation'
  });
  assert.deepEqual(resolveWindowsSystemSoundCue('critical-error'), {
    files: ['Windows Critical Stop.wav'],
    alias: 'SystemHand'
  });
  assert.equal(resolveWindowsSystemSoundCue('unknown'), null);
});

test('sound playback key follows the actual built-in Windows resource', () => {
  assert.equal(resolveSoundPlaybackKey({ cue: 'tool-failed', volume: 1 }), 'windows-media:windows exclamation.wav');
  assert.equal(resolveSoundPlaybackKey({ cue: 'warning', volume: 1 }), 'windows-media:windows exclamation.wav');
  assert.equal(resolveSoundPlaybackKey({ cue: 'channel-incoming', volume: 1 }), 'windows-media:notify.wav');
  assert.equal(resolveSoundPlaybackKey({ cue: 'plugin-notice', volume: 1 }), 'windows-media:notify.wav');
  assert.equal(resolveSoundPlaybackKey({ cue: 'tool-failed', volume: 0.5 }), 'generated-tone:tool-failed');
  assert.equal(resolveSoundPlaybackKey({ soundId: 'custom.notice', volume: 1 }), 'sound-id:custom.notice');
});

test('policy denial does not call the audio backend', async () => {
  const calls = [];

  const result = await playNotificationSound({
    decision: {
      play: false,
      cue: 'default',
      volume: 1,
      reason: 'policy-disabled'
    },
    backend: fakeBackend(calls)
  });

  assert.deepEqual(result, {
    attempted: false,
    played: false,
    source: 'none',
    cue: 'default',
    path: '',
    volume: 1,
    reason: 'policy-denied',
    diagnostic: null
  });
  assert.deepEqual(calls, []);
});

test('allowed notification plays its built-in cue through the backend', async () => {
  const calls = [];

  const result = await playNotificationSound({
    decision: {
      play: true,
      cue: 'success',
      volume: 0.4,
      reason: 'allowed'
    },
    backend: fakeBackend(calls)
  });

  assert.deepEqual(result, {
    attempted: true,
    played: true,
    source: 'cue',
    cue: 'success',
    path: '',
    volume: 0.4,
    reason: 'played',
    diagnostic: null
  });
  assert.deepEqual(calls, [{
    method: 'playCue',
    input: { cue: 'success', volume: 0.4 }
  }]);
});

test('all product sound cues are accepted and forwarded exactly once', async () => {
  const calls = [];
  const cues = [
    'chat-incoming', 'channel-incoming', 'tool-complete', 'tool-failed',
    'plugin-notice', 'warning', 'critical-error'
  ];

  for (const cue of cues) {
    const result = await playNotificationSound({
      decision: { play: true, cue, volume: 0.6 },
      backend: fakeBackend(calls)
    });
    assert.equal(result.played, true);
    assert.equal(result.cue, cue);
  }

  assert.deepEqual(calls.map(({ method, input }) => ({ method, input })), cues.map((cue) => ({
    method: 'playCue',
    input: { cue, volume: 0.6 }
  })));
});

test('unknown built-in cue is rejected before backend playback', async () => {
  const calls = [];

  await assert.rejects(
    () => playNotificationSound({
      decision: { play: true, cue: 'unknown', volume: 1 },
      backend: fakeBackend(calls),
      options: { fallbackCue: 'default' }
    }),
    (error) => error.code === 'AUDIO_ADAPTER_CUE_INVALID'
  );
  assert.deepEqual(calls, []);
});

test('custom soundId resolves through the asset registry and plays a relative asset path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nh-custom-sound-'));
  const soundPath = path.join(directory, 'sounds', 'custom.wav');
  const calls = [];
  try {
    await mkdir(path.dirname(soundPath), { recursive: true });
    await writeFile(soundPath, 'fake wav payload');
    const registry = createSoundAssetRegistry({ assets: [{
      soundId: 'custom.tool.failed', name: 'Custom tool failed', kind: 'custom', format: 'wav',
      relativePath: 'sounds/custom.wav', durationMs: 180, fileSizeBytes: 16,
      sha256: 'a'.repeat(64), enabled: true
    }] });
    const result = await playNotificationSound({
      decision: { play: true, soundId: 'custom.tool.failed', volume: 0.7 },
      backend: fakeBackend(calls),
      options: { assetRegistry: registry, soundAssetRoot: directory }
    });
    assert.equal(result.played, true);
    assert.equal(result.source, 'file');
    assert.equal(result.soundId, 'custom.tool.failed');
    assert.equal(result.path, soundPath);
    assert.deepEqual(calls, [{ method: 'playFile', input: { path: soundPath, soundId: 'custom.tool.failed', volume: 0.7 } }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('valid custom WAV path is played through the file backend', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nh-audio-adapter-'));
  const soundPath = path.join(directory, 'custom.wav');
  const calls = [];

  try {
    await writeFile(soundPath, 'fake wav payload');
    const result = await playNotificationSound({
      decision: { play: true, cue: 'default', volume: 0.7 },
      backend: fakeBackend(calls),
      options: { customPath: soundPath }
    });

    assert.deepEqual(result, {
      attempted: true,
      played: true,
      source: 'file',
      cue: 'default',
      path: soundPath,
      volume: 0.7,
      reason: 'played',
      diagnostic: null
    });
    assert.deepEqual(calls, [{
      method: 'playFile',
      input: { path: soundPath, soundId: null, volume: 0.7 }
    }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('custom audio outside the controlled asset root is rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-audio-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'nh-audio-outside-'));
  const soundPath = path.join(outside, 'outside.wav');
  const calls = [];
  try {
    await writeFile(soundPath, 'fake wav payload');
    const result = await playNotificationSound({
      decision: { play: true, cue: 'default', volume: 0.7 },
      backend: fakeBackend(calls),
      options: { customPath: soundPath, soundAssetRoot: root, fallbackCue: null }
    });
    assert.equal(result.played, false);
    assert.equal(result.reason, 'sound-path-invalid');
    assert.deepEqual(calls, []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('custom WAV volume zero returns muted without calling the file backend', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nh-audio-adapter-muted-'));
  const soundPath = path.join(directory, 'muted.wav');
  const calls = [];
  try {
    await writeFile(soundPath, 'fake wav payload');
    const result = await playNotificationSound({
      decision: { play: true, cue: 'default', volume: 0 },
      backend: fakeBackend(calls),
      options: { customPath: soundPath }
    });
    assert.deepEqual(result, {
      attempted: true,
      played: true,
      source: 'file',
      cue: 'default',
      path: soundPath,
      volume: 0,
      reason: 'muted',
      diagnostic: null,
      muted: true
    });
    assert.deepEqual(calls, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing custom WAV falls back to a built-in cue', async () => {
  const calls = [];
  const missingPath = path.join(os.tmpdir(), 'nh-audio-adapter-missing.wav');

  const result = await playNotificationSound({
    decision: { play: true, cue: 'error', volume: 0.8 },
    backend: fakeBackend(calls),
    options: { customPath: missingPath, fallbackCue: 'default' }
  });

  assert.deepEqual(result, {
    attempted: true,
    played: true,
    source: 'cue',
    cue: 'default',
    path: '',
    volume: 0.8,
    reason: 'fallback-played',
    diagnostic: 'SOUND_PATH_INVALID'
  });
  assert.deepEqual(calls, [{
    method: 'playCue',
    input: { cue: 'default', volume: 0.8 }
  }]);
});

test('custom format outside the legacy Windows set is reported without calling the file backend', async () => {
  const calls = [];
  const result = await playNotificationSound({
    decision: { play: true, cue: 'default', volume: 0.5 },
    backend: fakeBackend(calls),
    options: { customPath: path.join(os.tmpdir(), 'custom.ogg'), fallbackCue: null }
  });

  assert.deepEqual(result, {
    attempted: true,
    played: false,
    source: 'none',
    cue: 'default',
    path: path.join(os.tmpdir(), 'custom.ogg'),
    volume: 0.5,
    reason: 'sound-format-unsupported',
    diagnostic: 'SOUND_PATH_INVALID'
  });
  assert.deepEqual(calls, []);
});

test('cue backend failure becomes a structured playback result', async () => {
  const calls = [];
  const backend = fakeBackend(calls);
  backend.playCue = async (input) => {
    calls.push({ method: 'playCue', input });
    throw new Error('audio process failed');
  };

  const result = await playNotificationSound({
    decision: { play: true, cue: 'error', volume: 1 },
    backend
  });

  assert.deepEqual(result, {
    attempted: true,
    played: false,
    source: 'cue',
    cue: 'error',
    path: '',
    volume: 1,
    reason: 'playback-failed',
    diagnostic: 'SOUND_PLAYBACK_FAILED'
  });
  assert.deepEqual(calls, [{
    method: 'playCue',
    input: { cue: 'error', volume: 1 }
  }]);
});

test('backend can report unavailable audio device without throwing', async () => {
  const calls = [];
  const backend = fakeBackend(calls);
  backend.playCue = async (input) => {
    calls.push({ method: 'playCue', input });
    return { played: false, deviceAvailable: false };
  };

  const result = await playNotificationSound({
    decision: { play: true, cue: 'critical', volume: 1 },
    backend
  });

  assert.equal(result.played, false);
  assert.equal(result.reason, 'audio-device-unavailable');
  assert.equal(result.diagnostic, 'AUDIO_DEVICE_UNAVAILABLE');
  assert.equal(calls.length, 1);
});

test('invalid adapter inputs use stable error codes', async () => {
  const backend = fakeBackend([]);

  await assert.rejects(
    () => playNotificationSound({ decision: { cue: 'default' }, backend }),
    (error) => error.code === 'AUDIO_ADAPTER_DECISION_INVALID'
  );
  await assert.rejects(
    () => playNotificationSound({ decision: { play: true, cue: 'default', volume: 1 }, backend: {} }),
    (error) => error.code === 'AUDIO_ADAPTER_BACKEND_INVALID'
  );
  await assert.rejects(
    () => playNotificationSound({ decision: { play: true, cue: 'default', volume: 1.1 }, backend }),
    (error) => error.code === 'AUDIO_ADAPTER_VOLUME_INVALID'
  );
});

test('non-Windows audio backend reports unavailable device', async () => {
  const backend = createWindowsAudioBackend({ platform: 'linux' });

  assert.deepEqual(await backend.playCue({ cue: 'default', volume: 1 }), {
    played: false,
    deviceAvailable: false
  });
  assert.deepEqual(await backend.playFile({ path: '/tmp/alert.wav', volume: 1 }), {
    played: false,
    deviceAvailable: false
  });
});

test('Windows audio backend encodes the requested volume into the generated waveform', async () => {
  const calls = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args) {
      calls.push({ command, args });
      return { once(event, callback) { if (event === 'close') queueMicrotask(() => callback(0)); return this; } };
    }
  });
  await backend.playCue({ cue: 'success', volume: 0.35 });
  assert.equal(calls.length, 1);
  const encoded = calls[0].args.at(-1);
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.match(script, /\$amplitude = 0\.350000/);
  assert.doesNotMatch(script, /PlaySound/);
  assert.doesNotMatch(script, /SND_FILENAME|0x00020002/);
  assert.match(script, /\$useSystemCue = 0\.350000 -ge 0\.999999/);
  assert.match(script, /SoundPlayer/);
  assert.match(script, /PlaySync/);
  assert.match(script, /ding\.wav/);
  assert.match(script, /\r?\n\$duration/);
  assert.doesNotMatch(script, /`n/);
});

test('Windows audio backend applies requested volume to WAV playback without SoundPlayer fallback bypass', async () => {
  const calls = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args) {
      calls.push({ command, args });
      return { once(event, callback) { if (event === 'close') queueMicrotask(() => callback(0)); return this; } };
    }
  });
  await backend.playFile({ path: 'C:\\\\sounds\\\\alert.wav', volume: 0.35 });
  const script = Buffer.from(calls[0].args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /type waveaudio/);
  assert.match(script, /setaudio/);
  assert.match(script, /volume to/);
  assert.doesNotMatch(script, /SoundPlayer.*PlaySync/);
  assert.match(script, /volume.*0\.350000|0\.350000.*volume/);
});

test('Windows audio backend emits a media playback script for legacy custom formats', async () => {
  const calls = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args) {
      calls.push({ command, args });
      return { once(event, callback) { if (event === 'close') queueMicrotask(() => callback(0)); return this; } };
    }
  });
  await backend.playFile({ path: 'C:\\\\sounds\\\\alert.mp3', volume: 0.6 });
  const script = Buffer.from(calls[0].args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /mciSendString/);
  assert.match(script, /type mpegvideo/);
  assert.match(script, /setaudio/);
  assert.match(script, /volume to " \+ \$volume/);
});

test('Windows audio backend starts distinct cue requests independently', async () => {
  const calls = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return { once(event, callback) { if (event === 'close') setTimeout(() => callback(0), 5); return this; } };
    }
  });
  const first = backend.playCue({ cue: 'success', volume: 0.5 });
  const second = backend.playCue({ cue: 'warning', volume: 0.5 });
  assert.equal(calls.length, 2);
  await Promise.all([first, second]);
  assert.equal(calls.length, 2);
});

test('persistent Windows audio backend reuses one PowerShell process for cue previews', async () => {
  const calls = [];
  let stdoutListener = null;
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    persistent: true,
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return {
        stdin: { write() { queueMicrotask(() => stdoutListener?.('{"played":true}\n')); } },
        stdout: { on(event, callback) { if (event === 'data') stdoutListener = callback; return this; } },
        once() { return this; },
        kill() {}
      };
    }
  });

  assert.deepEqual(await backend.playCue({ cue: 'success', volume: 0.5 }), { played: true });
  assert.deepEqual(await backend.playCue({ cue: 'default', volume: 0.5 }), { played: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.stdio, ['pipe', 'pipe', 'pipe']);
  backend.dispose();
});

test('disposing non-persistent Windows backend kills active PowerShell children', async () => {
  const children = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl() {
      const listeners = new Map();
      const child = {
        killed: false,
        once(event, callback) { listeners.set(event, callback); return this; },
        kill() { this.killed = true; listeners.get('close')?.(-1); }
      };
      children.push(child);
      return child;
    }
  });
  const playback = backend.playCue({ cue: 'success', volume: 0.5 });
  await new Promise((resolve) => setImmediate(resolve));
  backend.dispose();
  assert.equal(children.length, 1);
  assert.equal(children[0].killed, true);
  assert.equal((await playback).played, false);
});

test('persistent backend ignores a timed-out generation closing after a new process starts', async () => {
  const children = [];
  let stdoutListener = null;
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    persistent: true,
    timeoutMs: 5,
    powershellPath: 'test-powershell.exe',
    spawnImpl() {
      const listeners = new Map();
      const child = {
        stdin: {
          write() {
            if (children.length > 1) queueMicrotask(() => stdoutListener?.('{"played":true}\n'));
          }
        },
        stdout: { on(event, callback) { if (event === 'data') stdoutListener = callback; return this; } },
        once(event, callback) { listeners.set(event, callback); return this; },
        kill() { setImmediate(() => listeners.get('close')?.(-1)); }
      };
      children.push(child);
      return child;
    }
  });

  const first = backend.playCue({ cue: 'success', volume: 0.5 });
  assert.equal((await first).played, false);
  const second = backend.playCue({ cue: 'default', volume: 0.5 });
  const secondResult = await second;
  assert.equal(secondResult.played, true);
  assert.equal(children.length, 2);
  backend.dispose();
});

test('Windows audio backend launches encoded PowerShell for a cue', async () => {
  const calls = [];
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'test-powershell.exe',
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return {
        once(event, callback) {
          if (event === 'close') queueMicrotask(() => callback(0));
          return this;
        }
      };
    }
  });

  const result = await backend.playCue({ cue: 'success', volume: 0.5 });

  assert.deepEqual(result, { played: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'test-powershell.exe');
  assert.deepEqual(calls[0].args.slice(0, 5), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand'
  ]);
  assert.equal(calls[0].options.windowsHide, true);
});
