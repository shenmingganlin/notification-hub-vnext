import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listStudioAgents,
  listStudioSampleAgents,
  readAgentIdentity,
  resolveAgentId,
  resolveAgentsDir,
  resolveYuanAssetsDir,
  stageAgentAvatar
} from '../../plugin/domain/agent-identity.js';

function makeAgentsDir() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-'));
  const agentDir = path.join(root, 'hanako');
  mkdirSync(path.join(agentDir, 'avatars'), { recursive: true });
  writeFileSync(path.join(agentDir, 'config.yaml'), 'agent:\n  name: 花子\n  yuan: hanako\n');
  writeFileSync(path.join(agentDir, 'avatars', 'avatar.jpg'), 'not-the-face');
  writeFileSync(path.join(agentDir, 'avatars', 'agent.png'), 'png-bytes');
  return root;
}

test('name comes from yaml and representative image is agent.png not avatar.jpg', () => {
  const agentsDir = makeAgentsDir();
  const identity = readAgentIdentity(agentsDir, 'hanako');
  assert.equal(identity.id, 'hanako');
  assert.equal(identity.name, '花子');
  assert.equal(identity.avatarPath, path.join(agentsDir, 'hanako', 'avatars', 'agent.png'));
});

test('missing avatar file yields null avatarPath', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-'));
  mkdirSync(path.join(root, 'ming'), { recursive: true });
  writeFileSync(path.join(root, 'ming', 'config.yaml'), 'agent:\n  name: 明微\n');
  const identity = readAgentIdentity(root, 'ming', { yuanAssetsDir: false });
  assert.equal(identity.name, '明微');
  assert.equal(identity.avatarPath, null);
});

test('session path extracts agent id', () => {
  assert.equal(
    resolveAgentId({ sessionPath: 'C:\\\\Users\\\\a\\\\.hanako\\\\agents\\\\butter\\\\sessions\\\\one.jsonl' }),
    'butter'
  );
  assert.equal(
    resolveAgentId({ sessionPath: '/home/user/.hanako/agents/wright/sessions/two.jsonl' }),
    'wright'
  );
});

test('event.agent.id and ctx.agentId are recognized after record.agent', () => {
  assert.equal(resolveAgentId({
    event: { agent: { id: 'from-event-agent' }, agentId: 'nested-id' }
  }), 'from-event-agent');
  assert.equal(resolveAgentId({
    ctx: { agentId: 'from-ctx' }
  }), 'from-ctx');
});

test('listStudioAgents requires identity.md and flags avatars', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-list-'));
  mkdirSync(path.join(root, 'sage', 'avatars'), { recursive: true });
  writeFileSync(path.join(root, 'sage', 'config.yaml'), 'agent:\n  name: 明微\n');
  writeFileSync(path.join(root, 'sage', 'identity.md'), '# sage\n');
  writeFileSync(path.join(root, 'sage', 'avatars', 'agent.png'), 'png');
  mkdirSync(path.join(root, 'ghost'), { recursive: true });
  writeFileSync(path.join(root, 'ghost', 'config.yaml'), 'agent:\n  name: 残影\n');
  mkdirSync(path.join(root, 'hanako'), { recursive: true });
  writeFileSync(path.join(root, 'hanako', 'config.yaml'), 'agent:\n  name: 花子\n');
  writeFileSync(path.join(root, 'hanako', 'identity.md'), '# hanako\n');
  const listed = listStudioAgents({ agentsDir: root, yuanAssetsDir: false });
  assert.deepEqual(listed.map((item) => item.id), ['sage', 'hanako']);
  assert.equal(listed[0].hasAvatar, true);
  assert.equal(listed[1].hasAvatar, false);
});

test('listStudioSampleAgents keeps only hanako butter rational in that order', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-sample-'));
  for (const id of ['kong', 'rational', 'hanako', 'butter', 'codekid']) {
    mkdirSync(path.join(root, id), { recursive: true });
    writeFileSync(path.join(root, id, 'config.yaml'), 'agent:\n  name: ' + id + '\n');
    writeFileSync(path.join(root, id, 'identity.md'), '# ' + id + '\n');
  }
  const sample = listStudioSampleAgents({ agentsDir: root, yuanAssetsDir: false });
  assert.deepEqual(sample.map((item) => item.id), ['hanako', 'butter', 'rational']);
});

test('record.agent.id wins over event.agentId and session path', () => {
  assert.equal(resolveAgentId({
    record: { agent: { id: 'from-record' } },
    event: { agentId: 'from-event' },
    sessionPath: '/agents/from-session/sessions/a.jsonl'
  }), 'from-record');
  assert.equal(resolveAgentId({
    event: { agentId: 'from-event' },
    sessionPath: '/agents/from-session/sessions/a.jsonl'
  }), 'from-event');
  assert.equal(resolveAgentId({
    event: { sender: 'channel-sender' }
  }), 'channel-sender');
  assert.equal(resolveAgentId({ event: {}, record: {} }), null);
});

test('resolveAgentsDir picks the first existing candidate', () => {
  const first = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-a-'));
  const second = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-b-'));
  assert.equal(resolveAgentsDir({ agentsDir: first, userDataDir: second }), first);
  assert.equal(resolveAgentsDir({ agentsDir: path.join(first, 'missing'), userDataDir: second }), path.join(second, 'agents') === path.join(second, 'agents')
    ? (resolveAgentsDir({ userDataDir: second }) ?? resolveAgentsDir({ hanaDir: second }))
    : first);
});

test('stageAgentAvatar copies to cache and skips recopy when hash matches', () => {
  const agentsDir = makeAgentsDir();
  const identity = readAgentIdentity(agentsDir, 'hanako');
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'nh-data-'));
  const first = stageAgentAvatar(dataDir, identity);
  assert.ok(first.relativePath.startsWith('hanako-'));
  assert.equal(first.format, 'png');
  assert.equal(first.assetId, 'agent.hanako');
  const second = stageAgentAvatar(dataDir, identity);
  assert.equal(second.relativePath, first.relativePath);
  assert.equal(second.sha256, first.sha256);
});

function makeYuanAssetsDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nh-yuan-assets-'));
  writeFileSync(path.join(dir, 'Hanako.png'), 'hanako-yuan');
  writeFileSync(path.join(dir, 'Butter.png'), 'butter-yuan');
  writeFileSync(path.join(dir, 'Ming.png'), 'ming-yuan');
  writeFileSync(path.join(dir, 'Kong.png'), 'kong-yuan');
  return dir;
}

test('empty avatars fall back to yuan default portraits', () => {
  const agentsDir = mkdtempSync(path.join(os.tmpdir(), 'nh-agents-yuan-'));
  const yuanAssetsDir = makeYuanAssetsDir();
  mkdirSync(path.join(agentsDir, 'hanako', 'avatars'), { recursive: true });
  writeFileSync(path.join(agentsDir, 'hanako', 'config.yaml'), 'agent:\n  name: Hanako\n  yuan: hanako\n');
  mkdirSync(path.join(agentsDir, 'butter', 'avatars'), { recursive: true });
  writeFileSync(path.join(agentsDir, 'butter', 'config.yaml'), 'agent:\n  name: butter\n  yuan: butter\n');
  mkdirSync(path.join(agentsDir, 'rational', 'avatars'), { recursive: true });
  writeFileSync(path.join(agentsDir, 'rational', 'config.yaml'), 'agent:\n  name: ming\n  yuan: ming\n');
  const ctx = { yuanAssetsDir };
  assert.equal(readAgentIdentity(agentsDir, 'hanako', ctx).avatarPath, path.join(yuanAssetsDir, 'Hanako.png'));
  assert.equal(readAgentIdentity(agentsDir, 'butter', ctx).avatarPath, path.join(yuanAssetsDir, 'Butter.png'));
  assert.equal(readAgentIdentity(agentsDir, 'rational', ctx).avatarPath, path.join(yuanAssetsDir, 'Ming.png'));
});

test('custom agent.png still wins over yuan default', () => {
  const agentsDir = makeAgentsDir();
  const yuanAssetsDir = makeYuanAssetsDir();
  const identity = readAgentIdentity(agentsDir, 'hanako', { yuanAssetsDir });
  assert.equal(identity.avatarPath, path.join(agentsDir, 'hanako', 'avatars', 'agent.png'));
});

test('resolveYuanAssetsDir uses plugin-bundled yuan portraits first', () => {
  const dir = resolveYuanAssetsDir({});
  assert.equal(path.basename(dir), 'yuan');
  assert.ok(dir.replaceAll('\\', '/').endsWith('/plugin/assets/yuan'));
});

test('resolveYuanAssetsDir prefers HANA_ROOT when plugin bundle is skipped', () => {
  const hanaRoot = mkdtempSync(path.join(os.tmpdir(), 'nh-hana-root-'));
  const assets = path.join(hanaRoot, 'desktop', 'src', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, 'Hanako.png'), 'from-root');
  assert.equal(resolveYuanAssetsDir({
    hanaRoot,
    pluginYuanAssetsDir: false,
    yuanAssetsDir: path.join(hanaRoot, 'missing')
  }), assets);
});
