import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  VNEXT_RUNTIME_DEFAULTS,
  createIsolatedPipeName,
  resolveRuntimeHostOptions
} from '../../plugin/runtime/host-config.js';

test('vNext runtime defaults resolve below the isolated plugin directory', () => {
  const options = resolveRuntimeHostOptions({
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    dataDir: 'C:\\Hana\\data\\notification-hub-vnext',
    config: {}
  }, { randomBytes: () => Buffer.from('abcdef', 'hex') });

  assert.equal(
    options.runtimePath,
    path.resolve('C:\\Hana\\plugins\\notification-hub-vnext', VNEXT_RUNTIME_DEFAULTS.runtimeRelativePath)
  );
  assert.match(options.pipeName, /^\\\\\.\\pipe\\notification-hub-vnext-\d+-abcdef$/);
  assert.equal(options.runtimeOptions.autoRestart, true);
});

test('vNext accepts explicit runtime path and pipe without rewriting them', () => {
  const options = resolveRuntimeHostOptions({
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    config: {}
  }, {
    runtimePath: 'D:\\Runtime\\notification-hub-vnext.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-vnext-test'
  });

  assert.equal(options.runtimePath, 'D:\\Runtime\\notification-hub-vnext.exe');
  assert.equal(options.pipeName, '\\\\.\\pipe\\notification-hub-vnext-test');
});

test('isolated pipe names are independently generated and use the vNext namespace', () => {
  const pipeName = createIsolatedPipeName({
    processId: 1234,
    randomBytes: () => Buffer.from('010203040506', 'hex')
  });
  assert.equal(pipeName, '\\\\.\\pipe\\notification-hub-vnext-1234-010203040506');
  assert.notEqual(pipeName, '\\\\.\\pipe\\notification-hub');
});

test('runtime host requires pluginDir to prevent loading another plugin runtime', () => {
  assert.throws(
    () => resolveRuntimeHostOptions({ dataDir: 'C:\\Hana\\data', config: {} }),
    (error) => error.code === 'RUNTIME_HOST_PLUGIN_DIR_INVALID'
  );
});
