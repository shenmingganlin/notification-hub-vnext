import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AVATAR_FILES = Object.freeze(['agent.png', 'agent.jpg', 'agent.jpeg', 'agent.webp']);
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const YUAN_AVATAR_FILES = Object.freeze({
  hanako: 'Hanako.png',
  butter: 'Butter.png',
  ming: 'Ming.png',
  kong: 'Kong.png'
});

function firstExistingDir(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0 && existsSync(candidate)) return candidate;
  }
  return null;
}

function cleanYamlScalar(value) {
  return String(value || '')
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function readAgentConfig(agentsDir, agentId) {
  const configPath = path.join(agentsDir, agentId, 'config.yaml');
  let name = agentId;
  let yuan = null;
  try {
    const raw = readFileSync(configPath, 'utf8');
    const lines = raw.split('\n');
    let inAgentBlock = false;
    let agentIndent = -1;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = (line.match(/^[ \t]*/) || [''])[0].length;
      if (/^agent:\s*(?:#.*)?$/.test(trimmed)) {
        inAgentBlock = true;
        agentIndent = indent;
        continue;
      }
      if (inAgentBlock && indent <= agentIndent) inAgentBlock = false;
      if (!inAgentBlock) continue;
      const nameMatch = trimmed.match(/^name:\s*(.+)$/);
      if (nameMatch) {
        const parsed = cleanYamlScalar(nameMatch[1]);
        if (parsed) name = parsed;
      }
      const yuanMatch = trimmed.match(/^yuan:\s*(.+)$/);
      if (yuanMatch) {
        const parsed = cleanYamlScalar(yuanMatch[1]).toLowerCase();
        if (parsed) yuan = parsed;
      }
    }
  } catch {
    // Missing or unreadable yaml: fall back to id.
  }
  return { name, yuan };
}

function latestYuanAssetsDir(parent, relParts) {
  if (!parent || !existsSync(parent)) return null;
  let best = null;
  let entries = [];
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(parent, entry.name, ...relParts);
    if (!existsSync(path.join(dir, YUAN_AVATAR_FILES.hanako))) continue;
    if (!best || entry.name > best.name) best = { name: entry.name, dir };
  }
  return best?.dir || null;
}

function bundledYuanAssetsDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'yuan');
}

function dirIfHanako(dir) {
  return dir && existsSync(path.join(dir, YUAN_AVATAR_FILES.hanako)) ? dir : null;
}

export function resolveYuanAssetsDir(ctx = {}) {
  if (ctx.yuanAssetsDir === false) return null;
  if (typeof ctx.yuanAssetsDir === 'string' && ctx.yuanAssetsDir) {
    const explicit = dirIfHanako(ctx.yuanAssetsDir);
    if (explicit) return explicit;
  }
  if (ctx.pluginYuanAssetsDir !== false) {
    const bundled = typeof ctx.pluginYuanAssetsDir === 'string' && ctx.pluginYuanAssetsDir
      ? ctx.pluginYuanAssetsDir
      : bundledYuanAssetsDir();
    const found = dirIfHanako(bundled);
    if (found) return found;
  }
  const roots = [ctx.hanaRoot, process.env.HANA_ROOT].filter((value) => typeof value === 'string' && value);
  for (const root of roots) {
    const found = dirIfHanako(path.join(root, 'desktop', 'src', 'assets'));
    if (found) return found;
  }
  const home = os.homedir();
  return latestYuanAssetsDir(path.join(home, '.hanako', 'artifacts', 'server'), ['desktop', 'src', 'assets'])
    || latestYuanAssetsDir(path.join(home, '.hanako', 'artifacts', 'renderer'), ['assets']);
}

function readYuanAvatarPath(yuan, ctx = {}) {
  const key = typeof yuan === 'string' ? yuan.trim().toLowerCase() : '';
  const file = YUAN_AVATAR_FILES[key];
  if (!file) return null;
  const dir = resolveYuanAssetsDir(ctx);
  if (!dir) return null;
  const candidate = path.join(dir, file);
  return existsSync(candidate) ? candidate : null;
}

function readAvatarPath(agentsDir, agentId, ctx = {}, yuan = null) {
  const avatarDir = path.join(agentsDir, agentId, 'avatars');
  for (const file of AVATAR_FILES) {
    const candidate = path.join(avatarDir, file);
    if (existsSync(candidate)) return candidate;
  }
  return readYuanAvatarPath(yuan, ctx);
}

export function resolveAgentsDir(ctx = {}) {
  return firstExistingDir([
    ctx.agentsDir,
    ctx.userDataDir ? path.join(ctx.userDataDir, 'agents') : null,
    ctx.hanaDir ? path.join(ctx.hanaDir, 'agents') : null,
    path.join(os.homedir(), '.hanako', 'agents')
  ]);
}

export function readAgentIdentity(agentsDir, agentId, ctx = {}) {
  const id = typeof agentId === 'string' ? agentId.trim() : '';
  if (!id) return null;
  if (!agentsDir || !existsSync(path.join(agentsDir, id))) {
    return { id, name: id, avatarPath: null };
  }
  const config = readAgentConfig(agentsDir, id);
  return {
    id,
    name: config.name,
    avatarPath: readAvatarPath(agentsDir, id, ctx, config.yuan || id)
  };
}

function coerceSessionPath(sessionPath) {
  if (typeof sessionPath === 'string') return sessionPath;
  if (!sessionPath || typeof sessionPath !== 'object' || Array.isArray(sessionPath)) return '';
  if (typeof sessionPath.path === 'string') return sessionPath.path;
  if (typeof sessionPath.sessionPath === 'string') return sessionPath.sessionPath;
  return '';
}

function sessionAgentId(sessionPath) {
  const raw = coerceSessionPath(sessionPath);
  if (!raw) return null;
  const normalized = raw.replaceAll('\\', '/').replace(/\/+/g, '/');
  const match = normalized.match(/(?:^|\/)agents\/([^/]+)\//);
  return match?.[1] || null;
}

function nestedAgentId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.agentId === 'string' && value.agentId.trim()) return value.agentId.trim();
  if (typeof value.sender === 'string' && value.sender.trim()) return value.sender.trim();
  return null;
}

export function resolveAgentId({ event, sessionPath, record, ctx } = {}) {
  const recordId = record?.agent && typeof record.agent === 'object' && typeof record.agent.id === 'string'
    ? record.agent.id.trim()
    : '';
  if (recordId) return recordId;
  const eventAgent = event?.agent && typeof event.agent === 'object' && typeof event.agent.id === 'string'
    ? event.agent.id.trim()
    : '';
  if (eventAgent) return eventAgent;
  const eventId = nestedAgentId(event)
    || nestedAgentId(event?.metadata)
    || nestedAgentId(event?.payload)
    || nestedAgentId(event?.message);
  if (eventId) return eventId;
  const sender = typeof record?.metadata?.sender === 'string' ? record.metadata.sender.trim() : '';
  if (sender) return sender;
  const fromSession = sessionAgentId(sessionPath)
    || sessionAgentId(record?.session);
  if (fromSession) return fromSession;
  const ctxId = typeof ctx?.agentId === 'string' ? ctx.agentId.trim() : '';
  return ctxId || null;
}

export function resolveIdentity({ event, sessionPath, record, ctx } = {}) {
  const agentId = resolveAgentId({ event, sessionPath, record, ctx });
  if (!agentId) return null;
  const agentsDir = resolveAgentsDir(ctx ?? {});
  return readAgentIdentity(agentsDir, agentId, ctx ?? {});
}

export function agentAvatarAssetId(agentId) {
  const id = typeof agentId === 'string' ? agentId.trim() : '';
  if (!AGENT_ID.test(id)) return null;
  return `agent.${id}`;
}

export function isAsciiPath(value) {
  return typeof value === 'string' && value.length > 0 && /^[\x00-\x7F]+$/.test(value);
}

export function resolveAgentAvatarCacheDir(dataDir) {
  const preferred = path.join(dataDir || '', 'agent-avatar-cache');
  if (isAsciiPath(preferred)) return preferred;
  return path.join(os.tmpdir(), 'nh-agent-avatar-cache');
}

export function stageAgentAvatar(dataDir, identity) {
  if (!identity?.id || !identity.avatarPath || !existsSync(identity.avatarPath)) return null;
  const assetId = agentAvatarAssetId(identity.id);
  if (!assetId) return null;
  const buffer = readFileSync(identity.avatarPath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(identity.avatarPath).toLowerCase() || '.png';
  const format = ext === '.jpeg' ? 'jpeg' : ext === '.jpg' ? 'jpg' : ext === '.webp' ? 'webp' : 'png';
  const fileName = `${identity.id}-${sha256}${ext === '.jpeg' ? '.jpeg' : ext === '.jpg' ? '.jpg' : ext === '.webp' ? '.webp' : '.png'}`;
  const cacheDir = resolveAgentAvatarCacheDir(dataDir);
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, fileName);
  if (!existsSync(cachePath)) copyFileSync(identity.avatarPath, cachePath);
  return {
    assetId,
    relativePath: fileName,
    sha256,
    format,
    cacheDir,
    cachePath
  };
}

export const STUDIO_SAMPLE_AGENT_IDS = Object.freeze(['hanako', 'butter', 'rational']);

export function listStudioSampleAgents(ctx = {}) {
  const listed = listStudioAgents(ctx);
  const byId = new Map(listed.map((item) => [item.id, item]));
  return STUDIO_SAMPLE_AGENT_IDS.map((id) => byId.get(id)).filter(Boolean);
}

export function listStudioAgents(ctx = {}) {
  const agentsDir = resolveAgentsDir(ctx);
  if (!agentsDir) return [];
  let entries = [];
  try {
    entries = readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const withAvatar = [];
  const withoutAvatar = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(path.join(agentsDir, entry.name, 'config.yaml'))) continue;
    if (!existsSync(path.join(agentsDir, entry.name, 'identity.md'))) continue;
    const identity = readAgentIdentity(agentsDir, entry.name, ctx);
    if (!identity) continue;
    const item = { id: identity.id, name: identity.name, hasAvatar: Boolean(identity.avatarPath) };
    if (item.hasAvatar) withAvatar.push(item);
    else withoutAvatar.push(item);
  }
  return [...withAvatar, ...withoutAvatar];
}
