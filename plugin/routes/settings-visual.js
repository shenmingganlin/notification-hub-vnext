import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';
import { createVisualProfile } from '../domain/visual-settings.js';

const ROUTE_ERRORS = Object.freeze({
  VISUAL_SETTINGS_API_UNAVAILABLE: '视觉设置暂不可用。',
  VISUAL_PROFILE_API_UNAVAILABLE: '视觉方案 API 暂不可用。',
  VISUAL_TEST_API_UNAVAILABLE: '视觉测试功能暂不可用。'
});
const CARD_TYPES = Object.freeze({ minimal: '极简卡片' });
const CARD_SIZES = Object.freeze({ small: '小', medium: '中', large: '大' });
const CARD_DISMISS_MODES = Object.freeze({ closeButton: '关闭按钮', anywhere: '任意点击', timeout: '超时' });
// 出现方式＝行为轴。本轮只有 stack 已实现；ticker（弹幕）/popup（突脸）明确标未实现。
const BEHAVIOR_AXIS_OPTIONS = Object.freeze([
  { value: 'stack', name: '堆叠', implemented: true },
  { value: 'ticker', name: '弹幕', implemented: false, why: '弹幕还在开发中，暂时不能选择。' },
  { value: 'popup', name: '突脸', implemented: false, why: '突脸还在开发中，暂时不能选择。' }
]);
// 卡片种类＝内容结构轴。本轮只有 minimal 已实现。
const CARD_TYPE_AXIS_OPTIONS = Object.freeze([
  { value: 'minimal', name: '极简', implemented: true }
]);
const TYPE_OPTIONS = Object.freeze([
  { value: 'minimal', label: 'minimal · 极简卡片', coming: false }
]);
const LAYOUT_OPTIONS = Object.freeze({ simple: '简单排列' });
// 起步预设：一次性套用「出现方式 × 外观」，不保留「已选中」伪状态。
const VISUAL_PRESET_OPTIONS = Object.freeze([
  { id: 'minimal-stack', label: '极简堆叠', mark: 'M', color: '#9bb1a9', hint: 'minimal × stack · 低打扰，右下堆叠', behaviorId: 'stack', implemented: true },
  { id: 'ticker-flow', label: '弹幕流动', mark: '弹', color: '#56c8d8', hint: 'ticker × minimal · 顶部轨道流动', behaviorId: 'ticker', implemented: false, why: '套用后会出现弹幕轨迹，行为尚未实现。' },
  { id: 'popup-emphasis', label: '突脸强调', mark: '突', color: '#f1c77a', hint: 'popup × minimal · 右下焦点强调', behaviorId: 'popup', implemented: false, why: '套用后会出现焦点强调，行为尚未实现。' }
]);
const NOTIFICATION_TEST_LABELS = Object.freeze({ chat_message: '聊天新消息', channel_message: '频道新消息', tool_completed: '工具执行完成', tool_error: '工具执行失败', timeout: '操作超时', system_warning: '系统警告' });

function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function readJsonBody(c) { return c.req.json().catch(() => ({})); }
function errorPayload(error) { return { code: error?.code ?? 'VISUAL_SETTINGS_ROUTE_FAILED', message: ROUTE_ERRORS[error?.code] ?? error?.message ?? String(error), details: error?.details ?? {} }; }
function visualPreviewResponse(result = {}) { return { created: result.created === true, receivedDraft: result.receivedDraft === true, updated: result.updated === true, recreated: result.recreated === true, cardId: typeof result.cardId === 'string' ? result.cardId : null, draftFingerprint: typeof result.draftFingerprint === 'string' ? result.draftFingerprint : null, nativeVisualFingerprint: typeof result.nativeVisualFingerprint === 'string' ? result.nativeVisualFingerprint : null }; }
function normalizeBootProfile(value) {
  // 页面始终渲染迁移/归一化后的 v2 视图；旧数据不会以旧形态呈现。失败时退回原值，不让页面崩。
  try { return createVisualProfile(value ?? {}); } catch { return value ?? {}; }
}
function initialModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { profile: {}, profiles: [], assets: [], status: 'loading' };
  return {
    profile: normalizeBootProfile(value.profile ?? value.settings?.profile ?? {}),
    profiles: Array.isArray(value.profiles) ? value.profiles : [],
    assets: Array.isArray(value.assets) ? value.assets : [],
    events: Array.isArray(value.events) ? value.events : [],
    status: value.status ?? 'saved',
    revision: value.revision ?? null,
    visualDiagnostics: Array.isArray(value.visualDiagnostics) ? value.visualDiagnostics : []
  };
}
function optionList(values, selected) {
  return Object.entries(values).map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}
function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt.value)}"${opt.value === selected ? ' selected' : ''}${opt.coming ? ' disabled' : ''}>${escapeHtml(opt.label)}</option>`).join('');
}
function typeSelect(selected) { return selectOptions(TYPE_OPTIONS, selected); }

// 双格轴条：左「出现方式」（行为轴，未实现项标未实现但保留可见），右「卡片种类」（内容结构轴）。
function axisChipButton(option, selected) {
  if (option.implemented) {
    return '<div class="axis-option"><button type="button" class="axis-chip' + (selected ? ' is-selected' : '') + '" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span class="axis-chip-name">' + escapeHtml(option.name) + '</span><span class="axis-chip-code">' + escapeHtml(option.value) + '</span></button></div>';
  }
  return '<div class="axis-option"><button type="button" class="axis-chip is-locked" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-disabled="true" aria-pressed="false" tabindex="0" aria-describedby="axis-why-' + escapeHtml(option.value) + '"><span class="axis-chip-name">' + escapeHtml(option.name) + '</span><span class="axis-chip-code">' + escapeHtml(option.value) + '</span><span class="axis-chip-badge">未实现</span></button><p class="axis-why" id="axis-why-' + escapeHtml(option.value) + '">' + escapeHtml(option.why) + '</p></div>';
}
function axisBar(behaviorId) {
  const behaviorChips = BEHAVIOR_AXIS_OPTIONS.map((option) => axisChipButton(option, option.value === behaviorId)).join('');
  const cardChips = CARD_TYPE_AXIS_OPTIONS.map((option) => '<button type="button" class="axis-seg is-selected" data-axis="cardType" data-value="' + escapeHtml(option.value) + '" aria-pressed="true"><span class="axis-chip-name">' + escapeHtml(option.name) + '</span><span class="axis-chip-code">' + escapeHtml(option.value) + '</span></button>').join('');
  return '<section class="axis-bar" aria-label="视觉双轴">'
    + '<div class="axis-cell"><div class="axis-head"><span class="axis-name">出现方式</span><span class="axis-sub">决定卡片怎么进入视野</span></div><div class="axis-options" role="group" aria-label="出现方式">' + behaviorChips + '</div></div>'
    + '<div class="axis-divider" aria-hidden="true"></div>'
    + '<div class="axis-cell"><div class="axis-head"><span class="axis-name">卡片种类</span><span class="axis-sub">决定卡片展示什么</span></div><div class="axis-options"><div class="axis-segmented" role="group" aria-label="卡片种类">' + cardChips + '</div></div></div>'
    + '</section>';
}

// 起步预设卡：已实现的给「套用」提示，未实现的标未实现且不可点。
function presetItem(preset) {
  if (preset.implemented) {
    return '<div class="visual-mode-item"><button class="visual-mode-card" type="button" data-preset="' + escapeHtml(preset.id) + '" data-behavior="' + escapeHtml(preset.behaviorId) + '" style="--mode-color:' + escapeHtml(preset.color) + '"><span class="mode-card-mark" aria-hidden="true">' + escapeHtml(preset.mark) + '</span><span class="mode-card-copy"><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.hint) + '</small></span><span class="mode-card-apply" aria-hidden="true">套用</span></button></div>';
  }
  return '<div class="visual-mode-item"><button class="visual-mode-card is-locked" type="button" data-preset="' + escapeHtml(preset.id) + '" style="--mode-color:' + escapeHtml(preset.color) + '" aria-disabled="true" aria-describedby="preset-why-' + escapeHtml(preset.id) + '"><span class="mode-card-mark" aria-hidden="true">' + escapeHtml(preset.mark) + '</span><span class="mode-card-copy"><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.hint) + '</small></span><span class="mode-card-badge">未实现</span></button><p class="axis-why" id="preset-why-' + escapeHtml(preset.id) + '">' + escapeHtml(preset.why) + '</p></div>';
}
const VISUAL_MODE_META = Object.freeze({
  minimal: { label: '极简', code: 'minimal', hint: '低打扰 · 右下堆叠', color: '#9bb1a9', behavior: 'stack', description: '只编辑位置、尺寸、颜色和停留时间。' }
});
function renderPhaseOneEditor(activeType, config, assetOptions, behaviorId = 'stack') {
  const appearance = config.appearance ?? {};
  const properties = config.properties ?? {};
  const skin = config.skin ?? {};
  const props = {
    ...properties.space,
    ...properties.shape,
    ...properties.typography,
    ...properties.lifecycle,
    ...properties.interaction,
    ...properties.resource
  };
  const behaviorOptions = BEHAVIOR_AXIS_OPTIONS.map((option) => '<option value="' + escapeHtml(option.value) + '"' + (option.value === behaviorId ? ' selected' : '') + (option.implemented ? '' : ' disabled') + '>' + escapeHtml(option.value) + '</option>').join('');
  return '<section class="mode-editor" data-editor-mode="' + escapeHtml(activeType) + '" style="--editor-mode-color:#9bb1a9">'
    + '<div class="mode-editor-header"><div><h3>卡片外观编辑器</h3><p>先定出现方式与卡片种类，再分别调两条轴的细节。</p></div></div>'
    + axisBar(behaviorId)
    + '<select id="pipeline-behavior" class="mode-contract-select" aria-label="出现方式" tabindex="-1" aria-hidden="true">' + behaviorOptions + '</select>'
    + '<select id="pipeline-type" class="mode-contract-select" aria-label="卡片种类" tabindex="-1" aria-hidden="true">' + typeSelect(activeType) + '</select>'
    + '<details class="editor-accordion" open><summary><strong>出现方式设置</strong><span>位置、节奏与交互 · 行为轴</span></summary>' + behaviorSection(props) + '</details>'
    + '<details class="editor-accordion"><summary><strong>卡片外观设置</strong><span>尺寸、外形与皮肤 · 种类轴</span></summary>' + appearanceSection(props, appearance, skin, assetOptions) + '</details>'
    + '</section>';
}

function renderBody(currentUrl, initialData) {
  const boot = initialModel(initialData);
  const profile = boot.profile ?? {};
  const card = profile.card ?? {};
  const activeType = card.activeType ?? 'minimal';
  const activeConfig = card.types?.[activeType] ?? card.types?.minimal ?? {};
  const behaviorId = profile.behaviorId ?? 'stack';
  const appearance = activeConfig.appearance ?? {};
  const global = profile.global ?? {};
  const globalEnabled = global.enabled !== false;
  const globalDefaultMode = global.defaultMode || 'off';
  const initial = JSON.stringify(boot).replaceAll('<', '\\u003c');
  const backgroundAssetId = activeConfig.skin?.background?.assetId ?? appearance.backgroundAssetId;
  const assetOptions = boot.assets.map((asset) => `<option value="${escapeHtml(asset.assetId)}"${backgroundAssetId === asset.assetId ? ' selected' : ''}>${escapeHtml(asset.name)} · ${escapeHtml(String(asset.format).toUpperCase())}</option>`).join('');

  return '<div class="visual-workbench" data-settings-view-root="visual">'
    + '<section class="visual-hero"><div><span class="eyebrow">VISUAL WORKBENCH / 01</span><h1>通知视觉</h1>'
    + '<p>把通知的出现方式、卡片外观和事件范围放在同一张工作台里管理。</p></div>'
    + '<div class="visual-hero-meta"><span class="visual-context-label">当前工作区</span><div id="visual-page-status" class="state-pill">' + escapeHtml(boot.status === 'applied' ? '已应用' : '已读取') + '</div></div></section>'
    + '<section class="visual-global-section section-card" id="visual-global-switch">'
    + '<div class="visual-global-row"' + (globalEnabled ? '' : ' id="visual-global-off"') + '>'
    + '<label class="visual-global-toggle"><input type="checkbox" id="global-visual-enabled"' + (globalEnabled ? ' checked' : '') + '><span>开启全局视觉</span></label>'
    + '<label class="visual-global-default">默认视觉效果<select id="global-visual-default-mode"><option value="off"' + (globalDefaultMode === 'off' ? ' selected' : '') + '>视觉关闭</option><option value="minimal"' + (globalDefaultMode === 'minimal' ? ' selected' : '') + '>极简</option></select></label>'
    + '<span class="visual-global-spacer"></span><button id="visual-settings-save" class="primary" type="button">保存视觉设置</button>'
    + '</div>'
    + (globalEnabled ? '' : '<p class="visual-global-hint">关闭全局视觉后，编辑器和预览不会发送新的视觉卡片。</p>')
    + '<div id="visual-settings-feedback" class="feedback" role="status" aria-live="polite"></div></section>'
    + '<div class="visual-workbench-grid">'
    + '<aside class="visual-mode-sidebar" aria-label="视觉工作区导航">'
    + '<div class="mode-sidebar-heading"><span class="section-kicker">配置对象</span><strong>起步预设</strong><span>选一个起点，再调细节。</span></div>'
    + '<div class="visual-mode-list">'
    + VISUAL_PRESET_OPTIONS.map(presetItem).join('')
    + '</div>'
    + '<nav class="workbench-anchor-nav"><a href="#visual-editor">编辑器</a><a href="#visual-profiles-anchor">配置包</a><a href="#visual-events-anchor">事件应用</a><a href="#visual-tests-anchor">实验台</a><a href="#visual-diagnostics">诊断</a></nav>'
    + '<div class="workbench-channel-note"><span class="channel-note-dot"></span><div><strong>三个通道独立运行</strong><p>stack.main · ticker.main · popup.main</p></div></div>'
    + '</aside>'
    + '<section class="visual-editor-column" id="visual-editor">'
    + '<div class="editor-column-heading"><div><span class="section-kicker">编辑器</span><h2>卡片外观编辑器</h2><p>当前修改只影响实时预览；保存后才会写入视觉设置。</p></div><span class="editor-scope">草稿 · 不写通知历史</span></div>'
    + '<section class="pipeline-section"' + (globalEnabled ? '' : ' style="opacity:0.4;pointer-events:none"') + '>'
    + renderPhaseOneEditor(activeType, activeConfig, assetOptions, behaviorId)
    + '</section>'
    + '<div id="visual-profiles-anchor">' + saveProfileSection(boot.profiles) + '</div>'
    + '<div id="visual-events-anchor">' + applyToEventsSection(boot.profiles, boot.events) + '</div>'
    + '<div id="visual-tests-anchor">' + visualExperimentSection() + '</div>'
    + diagnosticsSection(boot)
    + '</section>'
     + '<aside class="visual-preview-column" aria-label="实时预览与通道状态">'
      + '<div id="visual-preview-floating" class="preview-sticky-panel preview-floating-panel">'
      + '<div class="preview-panel-heading"><div><span class="section-kicker">Native preview</span><h2>实时预览</h2><small class="preview-drag-hint">编辑器修改会同步到这里</small></div><span class="preview-live-dot">实时</span></div>'
    + '<div id="visual-preview-stage" class="preview-stage"><div class="stage-grid"></div><div class="stage-card stage-minimal" data-preview-card="minimal" tabindex="0"><span>M</span><strong>后台动作已记录</strong><small>stack.main · 已实现</small></div><div class="stage-card stage-ticker" data-preview-card="ticker" tabindex="0"><span>D</span><strong>一条新消息划过</strong><small>ticker.main · 未实现</small></div><div class="stage-card stage-popup" data-preview-card="popup" tabindex="0"><span>P</span><strong>重要事件需要确认</strong><small>popup.main · 未实现</small></div></div>'
    + '<div class="preview-runtime-status"><div><span id="visual-preview-state" class="state-pill">等待更新</span><span class="preview-status-copy">桌面显示当前编辑草稿</span></div><span class="preview-status-lock">不写历史 · 不播放声音</span></div>'
    + '<div id="visual-preview-confirmation" class="visual-preview-confirmation" role="status" aria-live="polite">尚未收到后端确认。</div>'
    + '<button id="open-visual-preview" class="secondary preview-action" type="button">打开实时预览</button>'
     + '<div class="preview-channel-list"><div><span class="channel-color minimal-color"></span><b>stack</b><small>右下堆叠 · stack.main</small></div><div><span class="channel-color ticker-color"></span><b>ticker</b><small>顶部轨道 · ticker.main（未实现）</small></div><div><span class="channel-color popup-color"></span><b>popup</b><small>右下焦点 · popup.main（未实现）</small></div></div>'
    + '</div></aside></div>'
    + '<script>(function(){'
    + 'var initial=' + initial + ';'
    + 'var state=initial;'
    + 'var $=function(id){return document.getElementById(id)};'
    + 'function setControl(id,value){var el=$(id);if(!el||value===undefined||value===null)return;el.value=String(value)}'
    + 'function modeConfig(value){var profile=state.profile||{};var card=profile.card||{};return card.types&&card.types[value]||{}}'
    + 'function updateStageCard(value){var stage=$("visual-preview-stage");if(!stage)return;var card=stage.querySelector("[data-preview-card=\\""+value+"\\"]");if(!card)return;var config=modeConfig(value);var behavior=config.behavior||{};var space=config.properties&&config.properties.space||{};var legacy=behavior.margin===undefined?(space.margin===undefined?18:space.margin):behavior.margin;var readNumber=function(id,fallback){var el=$(id);var parsed=Number(el&&el.value);return Number.isFinite(parsed)?parsed:fallback};var left=readNumber("prop-margin-left",behavior.marginLeft===undefined?(space.marginLeft===undefined?legacy:space.marginLeft):behavior.marginLeft);var right=readNumber("prop-margin-right",behavior.marginRight===undefined?(space.marginRight===undefined?legacy:space.marginRight):behavior.marginRight);var top=readNumber("prop-margin-top",behavior.marginTop===undefined?(space.marginTop===undefined?legacy:space.marginTop):behavior.marginTop);var bottom=readNumber("prop-margin-bottom",behavior.marginBottom===undefined?(space.marginBottom===undefined?legacy:space.marginBottom):behavior.marginBottom);var anchor=$("prop-anchor")&&$("prop-anchor").value||behavior.anchor||space.anchor||"bottom-right";card.style.left="auto";card.style.right="auto";card.style.top="auto";card.style.bottom="auto";card.style.removeProperty("transform");if(anchor.indexOf("right")>=0)card.style.right=right+"px";else card.style.left=left+"px";if(anchor.indexOf("bottom")>=0)card.style.bottom=bottom+"px";else card.style.top=top+"px";stage.querySelectorAll("[data-preview-card]").forEach(function(item){item.classList.toggle("is-mode-active",item===card)})}'
    + 'function bindStageDrag(){var stage=$("visual-preview-stage");if(!stage||!window.PointerEvent)return;var drag=null;function clamp(value,min,max){return Math.min(Math.max(value,min),Math.max(min,max))}function finish(){if(!drag)return;var card=drag.card;var rect=stage.getBoundingClientRect();var cardRect=card.getBoundingClientRect();var left=Math.round(cardRect.left-rect.left);var top=Math.round(cardRect.top-rect.top);var right=Math.max(0,Math.round(rect.width-cardRect.width-left));var bottom=Math.max(0,Math.round(rect.height-cardRect.height-top));var horizontal=left<=right?"left":"right";var vertical=top<=bottom?"top":"bottom";setControl("prop-anchor",vertical+"-"+horizontal);setControl("prop-margin-left",left);setControl("prop-margin-right",right);setControl("prop-margin-top",top);setControl("prop-margin-bottom",bottom);card.classList.remove("is-dragging");drag=null;markVisualDirty();syncPreview()}stage.addEventListener("pointerdown",function(event){var card=event.target&&event.target.closest?event.target.closest("[data-preview-card]"):null;if(!card||card.getAttribute("data-preview-card")!==$("pipeline-type").value)return;var rect=stage.getBoundingClientRect();var cardRect=card.getBoundingClientRect();drag={card:card,x:event.clientX,y:event.clientY,left:cardRect.left-rect.left,top:cardRect.top-rect.top};card.style.left=drag.left+"px";card.style.top=drag.top+"px";card.style.right="auto";card.style.bottom="auto";card.style.removeProperty("transform");card.setPointerCapture&&card.setPointerCapture(event.pointerId);card.classList.add("is-dragging");event.preventDefault()});stage.addEventListener("pointermove",function(event){if(!drag)return;var rect=stage.getBoundingClientRect();var cardRect=drag.card.getBoundingClientRect();var left=clamp(drag.left+event.clientX-drag.x,0,rect.width-cardRect.width);var top=clamp(drag.top+event.clientY-drag.y,0,rect.height-cardRect.height);drag.card.style.left=left+"px";drag.card.style.top=top+"px"});stage.addEventListener("pointerup",finish);stage.addEventListener("pointercancel",finish);window.__notificationHubStageDragDispose=function(){stage.replaceWith(stage.cloneNode(true));window.__notificationHubStageDragDispose=null}}'
    + 'function applyModeEditor(value){var config=modeConfig(value);var meta={minimal:{behavior:"stack",anchor:"bottom-right",size:"medium",aspectRatio:"default",gap:8,margin:18,color:"#0e1916",radius:16,opacity:.96,duration:30000,hold:30000,width:420,height:220}}[value]||{};var behavior=config.behavior||{};var appearance=config.appearance||{};var properties=config.properties||{};var space=properties.space||{};var shape=properties.shape||{};var lifecycle=properties.lifecycle||{};var interaction=properties.interaction||{};var skin=config.skin||{};var background=skin.background||{};var decoration=skin.decoration||{};setControl("pipeline-behavior",meta.behavior);setControl("prop-anchor",space.anchor||behavior.anchor||meta.anchor);setControl("prop-size",space.size||appearance.size||meta.size);setControl("prop-gap",space.gap===undefined?meta.gap:space.gap);var legacyMargin=space.margin===undefined?(behavior.margin===undefined?meta.margin:behavior.margin):space.margin;setControl("prop-margin-left",space.marginLeft===undefined?(behavior.marginLeft===undefined?legacyMargin:behavior.marginLeft):space.marginLeft);setControl("prop-margin-right",space.marginRight===undefined?(behavior.marginRight===undefined?legacyMargin:behavior.marginRight):space.marginRight);setControl("prop-margin-top",space.marginTop===undefined?(behavior.marginTop===undefined?legacyMargin:behavior.marginTop):space.marginTop);setControl("prop-margin-bottom",space.marginBottom===undefined?(behavior.marginBottom===undefined?legacyMargin:behavior.marginBottom):space.marginBottom);setControl("prop-width",appearance.width===undefined?meta.width:appearance.width);setControl("prop-height",appearance.height===undefined?meta.height:appearance.height);setControl("skin-bg-color",background.color||appearance.backgroundColor||meta.color);setControl("prop-border-radius",shape.borderRadius===undefined?(decoration.borderRadius===undefined?meta.radius:decoration.borderRadius):shape.borderRadius);setControl("prop-opacity",shape.opacity===undefined?(decoration.opacity===undefined?meta.opacity:decoration.opacity):shape.opacity);setControl("prop-duration",lifecycle.durationMs===undefined?meta.duration:lifecycle.durationMs);setControl("prop-hold-duration",lifecycle.holdDurationMs===undefined?meta.hold:lifecycle.holdDurationMs);setControl("prop-dismiss-mode",interaction.dismissMode||"closeButton");var width=$("prop-width");var height=$("prop-height");if(width)width.disabled=false;if(height)height.disabled=false;var editor=document.querySelector(".mode-editor");var modeMeta={minimal:{label:"极简",description:"只编辑位置、尺寸、颜色和停留时间。",color:"#9bb1a9"}}[value]||{};if(editor){editor.setAttribute("data-editor-mode",value);editor.style.setProperty("--editor-mode-color",modeMeta.color||"");var heading=editor.querySelector(".mode-editor-header h3");var description=editor.querySelector(".mode-editor-header p");if(heading)heading.textContent=(modeMeta.label||value)+"卡片外观编辑器";if(description)description.textContent=modeMeta.description||""}updateStageCard(value)}'
    + 'function selectBehavior(value){var sel=$("pipeline-behavior");if(!sel||!value)return;var found=Array.prototype.slice.call(sel.options).some(function(o){return o.value===value&&!o.disabled});if(!found)return;sel.value=value;document.querySelectorAll("[data-axis=\\"behavior\\"]").forEach(function(btn){var locked=btn.classList.contains("is-locked");var active=btn.getAttribute("data-value")===value&&!locked;btn.classList.toggle("is-selected",active);if(!locked)btn.setAttribute("aria-pressed",active?"true":"false")});markVisualDirty();syncPreview()}'
    + 'document.addEventListener("click",function(event){var node=event.target&&event.target.closest?event.target.closest("[data-axis=\\"behavior\\"],[data-preset]"):null;if(!node)return;if(node.classList.contains("is-locked")){var host=node.closest(".axis-option")||node.closest(".visual-mode-item");if(host)host.classList.toggle("is-open");return}event.preventDefault();var behavior=node.getAttribute("data-behavior")||node.getAttribute("data-value");if(behavior)selectBehavior(behavior)});'
    + 'function request(path,options){options=options||{};var requestOptions=Object.assign({},options);requestOptions.headers=Object.assign({"Accept":"application/json"},options.headers||{});if(options.body!==undefined&&!requestOptions.headers["Content-Type"]&&!requestOptions.headers["content-type"])requestOptions.headers["Content-Type"]="application/json";var api=window.hana&&window.hana.api&&typeof window.hana.api.fetch==="function"?window.hana.api:null;try{if(api)return Promise.resolve(api.fetch(path,requestOptions));var current=new URL(window.location.href),match=/^(.*\\/api\\/plugins\\/[^/]+)(?:\\/[^/]*)?$/.exec(current.pathname||"");if(!match)throw Object.assign(new Error("视觉页面缺少插件 API 路径"),{code:"VISUAL_PREVIEW_API_PATH_INVALID"});var url=new URL(match[1]+"/"+path,current.origin);["pluginSurfaceSession","token"].forEach(function(key){var value=current.searchParams.get(key);if(value)url.searchParams.set(key,value)});return Promise.resolve(fetch(url.toString(),requestOptions))}catch(error){return Promise.reject(error)}}'
    + 'function json(path,options){return request(path,options).then(function(r){return Promise.resolve(r.json()).catch(function(){throw Object.assign(new Error("视觉预览响应不是有效 JSON"),{code:"VISUAL_PREVIEW_RESPONSE_INVALID"})}).then(function(data){if(!r.ok||data.ok===false){var e=new Error(data.error&&data.error.message||"请求失败");e.code=data.error&&data.error.code||"VISUAL_PREVIEW_REQUEST_FAILED";throw e}return data})})}'
    + 'function feedback(id,text,kind){var el=$(id);if(!el)return;el.textContent=text||"";el.className="feedback"+(kind?" "+kind:"")}'
    + functionCollectJS()
    + 'var previewOpen=false;var previewTimer=null;var previewBusy=false;var previewPending=false;var previewGeneration=0;function setPreviewState(text,kind){var state=$("visual-preview-state");if(state){state.textContent=text;state.className="state-pill"+(kind?" "+kind:"")}}function renderPreviewConfirmation(result){var el=$("visual-preview-confirmation");if(!el)return;var when=new Date().toLocaleTimeString();var action=result&&result.recreated?"已重建":result&&result.updated?"已更新":"已收到";el.textContent="后端已确认 · "+action+" · 卡片 "+(result&&result.cardId||"未知")+" · 指纹 "+(result&&result.draftFingerprint||"未知")+" · "+when;el.className="visual-preview-confirmation success"}function previewError(error){var code=error&&error.code||"VISUAL_PREVIEW_UPDATE_FAILED";var message=code+" · "+(error&&error.message||"预览更新失败");setPreviewState("失败 · "+code,"error");feedback("visual-settings-feedback",message,"error");var confirmation=$("visual-preview-confirmation");if(confirmation){confirmation.textContent="后端未确认 · "+code;confirmation.className="visual-preview-confirmation error"}}function schedulePreviewUpdate(){if(previewTimer)clearTimeout(previewTimer);previewTimer=setTimeout(runPreviewUpdate,0)}function runPreviewUpdate(){if(!previewOpen||previewBusy)return;previewBusy=true;previewPending=false;var generation=previewGeneration;setPreviewState("正在发送/更新");Promise.resolve().then(function(){return json("visual-preview/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draft:collect()})})}).then(function(result){if(generation!==previewGeneration)return;renderPreviewConfirmation(result);setPreviewState(result.recreated?"已重建":"已更新 · "+new Date().toLocaleTimeString(),"success");loadVisualDiagnostics().catch(function(){})}).catch(function(error){if(generation!==previewGeneration)return;previewError(error)}).finally(function(){previewBusy=false;if(previewPending&&previewOpen)schedulePreviewUpdate()})}function syncPreview(){var pageStatus=$("visual-page-status");if(pageStatus)pageStatus.textContent="未保存";previewPending=true;if(previewOpen){setPreviewState("等待更新");schedulePreviewUpdate()}else setPreviewState("等待更新")}'
    + 'function applyGlobalVisualState(){var enabled=$("global-visual-enabled").checked;var pipeline=document.querySelector(".pipeline-section");if(pipeline){pipeline.style.opacity=enabled?"":"0.4";pipeline.style.pointerEvents=enabled?"":"none"}var row=$("visual-global-switch");if(row)row.classList.toggle("is-disabled",!enabled)}'
    + 'function markVisualDirty(){var status=$("visual-page-status");if(status)status.textContent="未保存"}'
    + 'function saveVisualSettings(){var save=$("visual-settings-save");var output=$("visual-settings-feedback");if(save)save.disabled=true;if(output)output.textContent="正在保存视觉设置…";return json("visual-settings-update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile:collect()})}).then(function(result){state=result;var status=$("visual-page-status");if(status)status.textContent="已保存";if(output){output.textContent="视觉设置已保存";output.className="feedback success"}applyGlobalVisualState();return result}).catch(function(error){if(output){output.textContent=(error.code?error.code+" · ":"")+error.message;output.className="feedback error"}throw error}).finally(function(){if(save)save.disabled=false})}'
    + 'var syncIds=' + JSON.stringify(SYNC_ELEMENT_IDS) + ';var syncIdSet={};syncIds.forEach(function(id){syncIdSet[id]=true});'
    + 'if(window.__notificationHubVisualDispose)window.__notificationHubVisualDispose();'
    + 'function visualInputHandler(event){var target=event&&event.target;if(!target||!syncIdSet[target.id])return;if(event.type==="change"&&target.id==="pipeline-type")applyModeEditor(target.value);markVisualDirty();if(target.id!=="pipeline-type"&&typeof updateStageCard==="function")updateStageCard($("pipeline-type")&&$("pipeline-type").value||"minimal");syncPreview();if(event.type==="change"&&target.id==="global-visual-enabled")applyGlobalVisualState()}window.__notificationHubVisualInputHandler=visualInputHandler;window.__notificationHubVisualChangeHandler=visualInputHandler;document.addEventListener("input",visualInputHandler);document.addEventListener("change",visualInputHandler);'
    + 'if($("visual-settings-save"))$("visual-settings-save").addEventListener("click",function(){saveVisualSettings()});'
    + 'applyGlobalVisualState();bindStageDrag();updateStageCard($("pipeline-type")&&$("pipeline-type").value||"minimal");'
    + 'window.NotificationHubVisualWorkbench={collect:collect,syncPreview:syncPreview};'
    + 'var previewButton=$("open-visual-preview");if(previewButton)previewButton.addEventListener("click",function(){var state=$("visual-preview-state");if(previewOpen){previewGeneration++;previewPending=false;previewOpen=false;if(previewTimer)clearTimeout(previewTimer);previewButton.disabled=true;if(state)state.textContent="正在关闭";json("visual-preview/close",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).then(function(){if(state)state.textContent="已关闭";previewButton.textContent="打开实时预览"}).catch(function(error){if(state)state.textContent="不可用";feedback("visual-settings-feedback",(error.code?error.code+" · ":"")+error.message,"error")}).finally(function(){previewButton.disabled=false});return}var generation=previewGeneration;previewButton.disabled=true;setPreviewState("正在连接");Promise.resolve().then(function(){return json("visual-preview/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draft:collect()})})}).then(function(){if(generation!==previewGeneration)return;previewOpen=true;setPreviewState("已连接","success");previewButton.textContent="关闭实时预览";loadVisualDiagnostics().catch(function(){});if(previewPending)schedulePreviewUpdate()}).catch(function(error){if(generation!==previewGeneration)return;previewError(error)}).finally(function(){previewButton.disabled=false})});'
    + 'var back=document.getElementById("back-settings");if(back)back.addEventListener("click",function(){if(window.NotificationHubPageRouter)window.NotificationHubPageRouter.load("settings")});'
    + 'var assetOpen=$("visual-assets-open");if(assetOpen)assetOpen.addEventListener("click",function(){if(window.NotificationHubPageRouter)window.NotificationHubPageRouter.load("visual-assets-page");else window.location.href="visual-assets-page"});'
    + 'function visualViewBeforeUnload(){previewGeneration++;previewPending=false;previewOpen=false;if(previewTimer)clearTimeout(previewTimer);request("visual-preview/close",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).catch(function(){})}window.addEventListener("notification-hub-view-before-unload",visualViewBeforeUnload);window.__notificationHubVisualDispose=function(){if(window.__notificationHubStageDragDispose)window.__notificationHubStageDragDispose();document.removeEventListener("input",visualInputHandler);document.removeEventListener("change",visualInputHandler);window.removeEventListener("notification-hub-view-before-unload",visualViewBeforeUnload);document.removeEventListener("click",visualProfileClickHandler);};'
    // 保存配置包逻辑
    + 'var saveBtn=$("visual-profile-save");var nameInput=$("visual-profile-name");var conflictDialog=$("visual-conflict-dialog");'
    + 'var conflictName=$("visual-conflict-name");var conflictOverwrite=$("visual-conflict-overwrite");var conflictCopy=$("visual-conflict-copy");var conflictKeep=$("visual-conflict-keep");var profileFeedback=$("visual-feedback");'
    + 'var pendingSaveName=null;var pendingSaveId=null;'
    + 'function slugify(text){var value=String(text||"").trim().toLowerCase();var encoded=Array.from(value).map(function(char){return /[a-z0-9._-]/.test(char)?char:"u"+char.codePointAt(0).toString(16)}).join("-").replace(/^-+|-+$/g,"");return (encoded||"unnamed").slice(0,80)}'
    + 'function refreshProfiles(){if(window.NotificationHubSettingsShell&&typeof window.NotificationHubSettingsShell.loadView==="function"){window.NotificationHubSettingsShell.loadView("visual");return}if(window.NotificationHubPageRouter)window.NotificationHubPageRouter.load("settings");}function saveProfile(name,profileId){return json("visual-profiles/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileId:profileId,name:name,profile:collect()})}).then(function(result){profileFeedback.textContent="已保存："+name;profileFeedback.className="feedback success";state.profiles=state.profiles||[];var existing=state.profiles.findIndex(function(p){return p.profileId===profileId});if(existing>=0)state.profiles[existing]=result.profile;else state.profiles.push(result.profile);refreshProfiles();conflictDialog.style.display="none";return result})}'
    + 'function exportSavedProfile(profileId,profileName,button){if(!profileId){profileFeedback.textContent="请选择已保存的配置包后再导出";profileFeedback.className="feedback error";return}if(button)button.disabled=true;profileFeedback.textContent="正在导出配置包…";json("visual-package-export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileIds:[profileId],meta:{packageName:profileName||profileId}})}).then(function(data){profileFeedback.textContent=data.cancelled?"已取消导出":"配置包已导出："+(data.savedFilename||"已完成");profileFeedback.className=data.cancelled?"feedback":"feedback success"}).catch(function(error){profileFeedback.textContent=(error.code?error.code+" · ":"")+error.message;profileFeedback.className="feedback error"}).finally(function(){if(button)button.disabled=false})}'
    + 'function visualProfileClickHandler(event){var exportButton=event.target&&event.target.closest?event.target.closest(".profile-export"):null;if(exportButton){exportSavedProfile(exportButton.getAttribute("data-profile-id"),exportButton.getAttribute("data-profile-name"),exportButton);return}var button=event.target&&event.target.closest?event.target.closest(".profile-delete"):null;if(!button)return;var id=button.getAttribute("data-profile-id");if(!id)return;if(button.dataset.confirmed!=="true"){button.dataset.confirmed="true";button.textContent="再次点击确认";return}button.disabled=true;json("visual-profiles/"+encodeURIComponent(id),{method:"DELETE"}).then(function(){refreshProfiles()}).catch(function(error){button.disabled=false;button.dataset.confirmed="false";button.textContent="删除";feedback.textContent=(error.code?error.code+" · ":"")+error.message;feedback.className="feedback error"})}document.addEventListener("click",visualProfileClickHandler);'
    + 'if(saveBtn)saveBtn.addEventListener("click",function(){var name=nameInput.value.trim();if(!name){profileFeedback.textContent="请输入配置包名称";profileFeedback.className="feedback error";return}'
    + 'var profileId=slugify(name);'
    + 'json("visual-profiles",{method:"GET"}).then(function(data){var profiles=Array.isArray(data.profiles)?data.profiles:[];'
    + 'var existing=profiles.find(function(p){return p.profileId===profileId});'
    + 'if(existing){pendingSaveName=name;pendingSaveId=profileId;conflictName.textContent=name;conflictDialog.style.display="flex";profileFeedback.textContent="";profileFeedback.className="feedback"}'
    + 'else{saveProfile(name,profileId)}}).catch(function(err){profileFeedback.textContent="获取配置包列表失败："+err.message;profileFeedback.className="feedback error"})});'
    + 'if(conflictOverwrite)conflictOverwrite.addEventListener("click",function(){if(pendingSaveName&&pendingSaveId)saveProfile(pendingSaveName,pendingSaveId).catch(function(err){profileFeedback.textContent="保存失败："+err.message;profileFeedback.className="feedback error"})});'
    + 'if(conflictCopy)conflictCopy.addEventListener("click",function(){var name=pendingSaveName;var id=pendingSaveId;if(!name||!id)return;var copyName=name+" 副本";var copyId=id+"-copy";saveProfile(copyName,copyId).catch(function(err){profileFeedback.textContent="保存失败："+err.message;profileFeedback.className="feedback error"})});'
    + 'if(conflictKeep)conflictKeep.addEventListener("click",function(){conflictDialog.style.display="none";pendingSaveName=null;pendingSaveId=null;profileFeedback.textContent="已取消保存";profileFeedback.className="feedback"});'
    + 'var testBtn=$("visual-test-send");var parallelBtn=$("visual-test-parallel");var testEvent=$("visual-test-event");var testCount=$("visual-test-count");var testInterval=$("visual-test-interval");var testFeedback=$("visual-test-feedback");'
    + 'if(testBtn)testBtn.addEventListener("click",function(){var eventId=testEvent?testEvent.value:"";var count=Math.max(1,Math.min(50,Number(testCount.value)||1));var interval=Math.max(0,Math.min(5000,Number(testInterval.value)||0));if(!eventId){testFeedback.textContent="请选择已绑定事件";testFeedback.className="feedback error";return}testBtn.disabled=true;testBtn.textContent="运行中…";json("visual-test-event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:eventId,count:count,intervalMs:interval})}).then(function(result){testFeedback.textContent="已按绑定配置包生成 "+(result.generated||0)+" 张真实卡片";testFeedback.className="feedback success";loadVisualDiagnostics().catch(function(){})}).catch(function(err){testFeedback.textContent="测试失败："+(err.code?err.code+" · ":"")+err.message;testFeedback.className="feedback error"}).finally(function(){testBtn.disabled=false;testBtn.textContent="运行视觉实验"})});'
    + 'if(parallelBtn)parallelBtn.addEventListener("click",function(){var count=Math.max(1,Math.min(10,Number(testCount&&testCount.value)||1));parallelBtn.disabled=true;parallelBtn.textContent="并行创建中…";json("visual-test-parallel-cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({count:count,createCards:true})}).then(function(result){testFeedback.textContent="已并行创建 "+(result.generated||0)+" 张卡片："+Object.keys(result.channels||{}).join("、");testFeedback.className="feedback success"}).catch(function(err){testFeedback.textContent="并行测试失败："+(err.code?err.code+" · ":"")+err.message;testFeedback.className="feedback error"}).finally(function(){parallelBtn.disabled=false;parallelBtn.textContent="并行测试三种行为"})});'
    + 'var applyProfile=$("apply-visual-profile");var applyEvent=$("apply-event-select");var applyPreview=$("apply-visual-preview");var applyBtn=$("apply-visual-btn");var applyFeedback=$("apply-visual-feedback");var applyBoundList=$("apply-bound-list");'
    + 'function applyVisual(previewOnly){var profileId=applyProfile?applyProfile.value:"";var eventId=applyEvent?applyEvent.value:"";if(!profileId||!eventId){applyFeedback.textContent="请选择配置包和事件";applyFeedback.className="feedback error";return}'
    + 'var target=previewOnly?"visual-profiles/preview-apply":"visual-profiles/apply";'
    + 'applyFeedback.textContent=previewOnly?"正在计算影响…":"正在应用到事件…";applyFeedback.className="feedback";'
    + 'json(target,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileId:profileId,eventIds:[eventId]})}).then(function(data){var value=previewOnly?data.preview:data.result;'
    + 'applyFeedback.textContent=previewOnly?"预览将影响 1 个事件：新增 "+value.added+" 个，替换 "+value.overwritten+" 个，保持 "+value.unchanged+" 个。":"已应用到事件："+eventId;'
    + 'applyFeedback.className="feedback success";if(!previewOnly){loadBoundEvents().catch(function(){})}}).catch(function(err){applyFeedback.textContent=(err.code?err.code+" · ":"")+(err.message||"应用失败");applyFeedback.className="feedback error"})}'
    + 'function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\\"","&quot;")}'
    + 'function loadBoundEvents(){json("custom-visual-events").then(function(data){var events=Array.isArray(data.events)?data.events:[];var testEvent=$("visual-test-event");if(testEvent)testEvent.innerHTML=events.length?events.map(function(e){return "<option value=\\""+esc(e.eventId)+"\\">"+esc(e.eventId)+" · "+esc(e.visualProfileId||"")+"</option>";}).join(""):"<option value=\\"\\">暂无已绑定事件</option>";if(applyBoundList){applyBoundList.style.display=events.length?"grid":"none";var items=applyBoundList.querySelector(".apply-bound-items");if(items)items.innerHTML=events.length?events.map(function(e){return "<div class=\\"apply-bound-item\\"><span class=\\"bound-event\\">"+esc(e.eventId)+"</span><span class=\\"bound-profile\\">"+esc(e.visualProfileId||"")+"</span></div>";}).join(""):"暂无已绑定事件"}}).catch(function(error){var message=(error.code?error.code+" · ":"")+error.message;var testEvent=$("visual-test-event");if(testEvent)testEvent.innerHTML="<option value=\\"\\">读取绑定事件失败</option>";if(applyBoundList){applyBoundList.style.display="grid";var items=applyBoundList.querySelector(".apply-bound-items");if(items)items.textContent=message}feedback("visual-test-feedback",message,"error");throw error})}'
    + 'if(applyPreview)applyPreview.addEventListener("click",function(){applyVisual(true)});'
    + 'if(applyBtn)applyBtn.addEventListener("click",function(){applyVisual(false)});'
    + 'function renderVisualDiagnostics(data){var root=$("visual-diagnostics-list");if(!root)return;var list=Array.isArray(data.visualDiagnostics)?data.visualDiagnostics:[];root.innerHTML=list.length?list.slice(0,12).map(function(entry){return `<div class="visual-diagnostic-row"><div><strong>${esc(entry.code||"VISUAL_OPERATION")}</strong><span>${esc(entry.stage||"visual")} · ${esc(entry.message||"")}</span></div><time>${esc(entry.timestamp||"")}</time></div>`}).join(""):`<div class="empty-state">还没有视觉诊断记录。</div>`}'
    + 'function loadVisualDiagnostics(){return json("visual-diagnostics").then(function(data){renderVisualDiagnostics(data)}).catch(function(error){var el=$("visual-diagnostics-feedback");if(el){el.textContent=(error.code?error.code+" · ":"")+error.message;el.className="feedback error"}throw error})}'
    + 'var diagnosticFeedback=$("visual-diagnostics-feedback");var showDiagnosticError=function(error){if(diagnosticFeedback){diagnosticFeedback.textContent=(error.code?error.code+" · ":"")+error.message;diagnosticFeedback.className="feedback error"}};var refreshDiagnostics=$("refresh-visual-diagnostics");if(refreshDiagnostics)refreshDiagnostics.addEventListener("click",function(){loadVisualDiagnostics().then(function(){if(diagnosticFeedback){diagnosticFeedback.textContent="视觉诊断已刷新";diagnosticFeedback.className="feedback success"}}).catch(showDiagnosticError)});var clearDiagnostics=$("clear-visual-diagnostics");if(clearDiagnostics)clearDiagnostics.addEventListener("click",function(){json("visual-diagnostics-clear",{method:"POST"}).then(function(data){renderVisualDiagnostics(data);if(diagnosticFeedback){diagnosticFeedback.textContent="视觉诊断已清空";diagnosticFeedback.className="feedback success"}}).catch(showDiagnosticError)});var exportDiagnostics=$("export-visual-diagnostics");if(exportDiagnostics)exportDiagnostics.addEventListener("click",function(){json("visual-diagnostics-export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).then(function(data){if(diagnosticFeedback){diagnosticFeedback.textContent=data.cancelled?"已取消导出":"视觉诊断已导出";diagnosticFeedback.className=data.cancelled?"feedback":"feedback success"}}).catch(showDiagnosticError)});'
    + 'loadBoundEvents().catch(function(){});loadVisualDiagnostics().catch(function(){});'
    + '})();</script>';
}

const SYNC_ELEMENT_IDS = Object.freeze([
  'global-visual-enabled', 'global-visual-default-mode',
  'prop-size', 'prop-anchor', 'prop-margin-left', 'prop-margin-right', 'prop-margin-top', 'prop-margin-bottom', 'prop-gap', 'prop-layout', 'prop-width', 'prop-height',
  'prop-border-radius', 'prop-opacity',
  'prop-duration', 'prop-hold-duration',
  'prop-dismiss-mode',
  'skin-bg-color', 'skin-bg-asset', 'skin-bg-fit', 'skin-bg-padding',
  'pipeline-behavior', 'pipeline-type'
]);

function functionCollectJS() {
  return 'function collect(){'
    + 'var p=state.profile||{};var categories=p.categories||{};var activeType=$("pipeline-type").value||"minimal";'
    + 'var value=function(id,fallback){var el=$(id);return el&&el.value!==undefined&&el.value!==""?el.value:fallback};'
    + 'var number=function(id,fallback){var parsed=Number(value(id,fallback));return Number.isFinite(parsed)?parsed:Number(fallback)};'
    + 'var draft={'
    + 'appearance:{size:value("prop-size","medium"),width:number("prop-width",420),height:number("prop-height",220),backgroundColor:value("skin-bg-color","#0e1916"),backgroundAssetId:value("skin-bg-asset","")||null,backgroundFit:value("skin-bg-fit","fill"),backgroundPadding:number("skin-bg-padding",0),borderRadius:number("prop-border-radius",16),opacity:number("prop-opacity",0.96)},'
    + 'properties:{space:{size:value("prop-size","medium"),anchor:value("prop-anchor","bottom-right"),gap:number("prop-gap",8),marginLeft:number("prop-margin-left",18),marginRight:number("prop-margin-right",18),marginTop:number("prop-margin-top",18),marginBottom:number("prop-margin-bottom",18),layout:value("prop-layout","simple")}, shape:{borderRadius:number("prop-border-radius",16),opacity:number("prop-opacity",0.96),blur:0,shadow:"none",borderWidth:0,borderColor:"#0e1916"},typography:{titleLines:1,bodyLines:4,fontScale:1,lineHeight:1.55,textOverflow:"ellipsis"},lifecycle:{durationMs:number("prop-duration",30000),enterDurationMs:260,holdDurationMs:number("prop-hold-duration",30000),exitDurationMs:200},interaction:{dismissMode:value("prop-dismiss-mode","closeButton"),closeButtonPosition:"top-right",timeoutMs:number("prop-hold-duration",30000),hoverPause:"off",expandable:"off",clickable:"off"},resource:{maxVisible:0,maxActive:0,maxParticles:0,overflow:"allow"}},'
    + 'skin:{skinId:"skin.default",semanticColors:{title:"#F2FFF9",body:"#C5D8D0",assistantName:"#62D0A8",metadata:"#8EA69C",status:"#F1C77A"},background:{color:value("skin-bg-color","#0e1916"),assetId:value("skin-bg-asset","")||null,fit:value("skin-bg-fit","fill"),padding:number("skin-bg-padding",0)},decoration:{borderRadius:number("prop-border-radius",16),opacity:number("prop-opacity",0.96),shadow:"none",borderWidth:0,borderColor:"#0e1916",blur:0,density:"standard"}},'
    + 'effects:{effectConfigId:"effect.visual",slots:{enter:{enabled:true,effectId:"fade",durationMs:260,maxParticles:0,assetId:null},idle:{enabled:false,effectId:"none",durationMs:0,maxParticles:0,assetId:null},exit:{enabled:true,effectId:"fade",durationMs:200,maxParticles:0,assetId:null},enterParticles:{enabled:true,effectId:"star",durationMs:0,maxParticles:18,assetId:null},idleParticles:{enabled:false,effectId:"none",durationMs:0,maxParticles:0,assetId:null},exitParticles:{enabled:true,effectId:"star",durationMs:0,maxParticles:18,assetId:null}}}};'
    + 'var types=Object.assign({},p.card&&p.card.types||{});types[activeType]=draft;'
    + 'var behaviorId=($("pipeline-behavior")&&$("pipeline-behavior").value)||p.behaviorId||"stack";'
    + 'return {version:2,global:{enabled:$("global-visual-enabled").checked,preset:p.global?.preset||"minimal",intensity:p.global?.intensity||"balanced",defaultMode:$("global-visual-default-mode").value||p.global?.defaultMode||"off"},behaviorId:behaviorId,categories:categories,card:{activeType:activeType,types:types}};'
    + '}';
}

function subgroup(label, grid) {
  return '<div class="pipeline-subgroup"><div class="pipeline-subgroup-label">' + escapeHtml(label) + '</div>'
    + '<div class="pipeline-grid-3">' + grid + '</div></div>';
}

// 出现方式轴：位置、节奏与交互（“多久、从哪来、怎么消失”）。
function behaviorSection(props) {
  return '<div class="pipeline-subsection">'
    + subgroup('位置与轨道',
      anchorSelect(props.anchor ?? 'top-right')
      + labelNumber('距屏幕左侧', 'prop-margin-left', props.marginLeft ?? props.margin ?? 18, 0, 96)
      + labelNumber('距屏幕右侧', 'prop-margin-right', props.marginRight ?? props.margin ?? 18, 0, 96)
      + labelNumber('距屏幕顶部', 'prop-margin-top', props.marginTop ?? props.margin ?? 18, 0, 96)
      + labelNumber('距屏幕底部', 'prop-margin-bottom', props.marginBottom ?? props.margin ?? 18, 0, 96)
      + labelNumber('卡片间距', 'prop-gap', props.gap ?? 8, 0, 48)
      + labelSelect('排列方式', 'prop-layout', LAYOUT_OPTIONS, props.layout ?? 'simple'))
    + subgroup('节奏',
      labelNumber('持续时间 (ms)', 'prop-duration', props.durationMs ?? 30000, 1000, 60000, 1000)
      + labelNumber('停留时长 (ms)', 'prop-hold-duration', props.holdDurationMs ?? 30000, 1000, 60000, 1000))
    + subgroup('交互',
      labelSelect('关闭方式', 'prop-dismiss-mode', CARD_DISMISS_MODES, props.dismissMode ?? 'closeButton'))
    + '</div>';
}

// 卡片种类轴：尺寸、外形与皮肤（“多大、什么色、什么底”）。
function appearanceSection(props, appearance, skin, assetOptions) {
  return '<div class="pipeline-subsection">'
    + subgroup('外形',
      labelSelect('卡片大小', 'prop-size', CARD_SIZES, props.size ?? appearance.size ?? 'medium')
      + labelNumber('宽度', 'prop-width', appearance.width ?? 420, 240, 720)
      + labelNumber('高度', 'prop-height', appearance.height ?? 220, 64, 360)
      + labelNumber('圆角', 'prop-border-radius', props.borderRadius ?? appearance.borderRadius ?? 16, 0, 48)
      + labelNumber('透明度', 'prop-opacity', props.opacity ?? appearance.opacity ?? 0.96, 0, 1, 0.01))
    + '</div>'
    + skinSection(skin, appearance, assetOptions);
}

function skinSection(skin, appearance, assetOptions) {
  return '<div class="pipeline-subsection">'
    + subgroup('背景',
      labelColor('背景色', 'skin-bg-color', skin.backgroundColor ?? appearance.backgroundColor ?? '#0e1916')
      + '<label>背景素材<select id="skin-bg-asset"><option value="">不使用素材</option>' + assetOptions + '</select></label>'
      + '<label>裁剪方式<select id="skin-bg-fit"><option value="fill"' + (appearance.backgroundFit === 'fill' || !appearance.backgroundFit ? ' selected' : '') + '>拉伸填满</option><option value="contain"' + (appearance.backgroundFit === 'contain' ? ' selected' : '') + '>完整显示</option><option value="cover"' + (appearance.backgroundFit === 'cover' ? ' selected' : '') + '>裁剪填满</option></select></label>'
      + labelNumber('图片内边距', 'skin-bg-padding', skin.backgroundPadding ?? appearance.backgroundPadding ?? 0, 0, 40))
    + '<div class="pipeline-subgroup"><div class="pipeline-subgroup-label">素材库</div>'
    + '<div><button id="visual-assets-open" class="secondary pipeline-action-button" type="button">管理视觉素材</button></div></div>'
    + '</div>';
}

function saveProfileSection(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const listHtml = list.length
    ? '<div class="profile-list">' + list.map(function(p) {
        var refs = p.references && p.references.length ? '<span class="profile-refs">' + escapeHtml(p.references.length + ' 个事件') + '</span>' : '<span class="profile-refs muted">未使用</span>';
        var canDelete = p.profileId !== 'visual.default' && !(p.references && p.references.length);
        var action = '<button type="button" class="secondary profile-export" data-profile-id="' + escapeHtml(p.profileId) + '" data-profile-name="' + escapeHtml(p.name) + '">导出</button>' + (canDelete ? '<button type="button" class="secondary profile-delete" data-profile-id="' + escapeHtml(p.profileId) + '">删除</button>' : '');
        return '<div class="profile-list-item" data-profile-id="' + escapeHtml(p.profileId) + '"><span class="profile-list-name">' + escapeHtml(p.name) + '</span><span class="profile-list-meta">' + refs + '<span class="profile-source">' + escapeHtml(p.source === 'local' ? '本地' : p.source === 'import' ? '导入' : '内置') + '</span>' + action + '</span></div>';
      }).join('') + '</div>'
    : '<div class="profile-list-empty">暂无已保存的配置包</div>';
  return '<section class="profile-section section-card">'
    + '<h2 class="profile-section-title">保存为配置包</h2>'
    + '<div class="profile-save-row">'
    + '<input id="visual-profile-name" class="profile-name-input" type="text" placeholder="输入配置包名称…" value="stack·minimal" maxlength="80">'
    + '<button id="visual-profile-save" class="secondary" type="button">保存</button>'
    + '</div>'
    + '<div id="visual-feedback" class="feedback"></div>'
    // 冲突对话框
    + '<div id="visual-conflict-dialog" class="conflict-dialog" style="display:none">'
    + '<div class="conflict-dialog-body">'
    + '<p>配置包 <strong id="visual-conflict-name"></strong> 已存在。请选择操作：</p>'
    + '<div class="conflict-actions">'
    + '<button id="visual-conflict-overwrite" class="danger" type="button">覆盖</button>'
    + '<button id="visual-conflict-copy" class="secondary" type="button">创建副本</button>'
    + '<button id="visual-conflict-keep" class="secondary" type="button">保留 · 放弃</button>'
    + '</div></div></div>'
    // 已自定义配置包列表
    + '<h2 class="profile-section-title" style="margin-top:18px">已自定义配置包</h2>'
    + '<div id="visual-profile-list" class="profile-list-wrapper">' + listHtml + '</div>'
    + '</section>';
}

function visualExperimentSection() {
  const eventOptions = '<option value="">读取已绑定事件…</option>';
  return '<section class="test-section section-card">'
    + '<div class="section-card-header"><div><h2 class="profile-section-title">视觉实验台</h2><p class="section-card-intro">测试事件当前已绑定的配置包，走正式视觉解析；不读取草稿、不修改绑定、不写通知历史、不播放声音。</p></div></div>'
    + '<div class="test-row">'
    + '<label class="test-count-label">事件<select id="visual-test-event" class="apply-select">' + eventOptions + '</select></label>'
    + '<label class="test-count-label">次数<input id="visual-test-count" class="test-count-input" type="number" min="1" max="50" step="1" value="1"></label>'
    + '<label class="test-count-label">间隔 (ms)<input id="visual-test-interval" class="test-count-input" type="number" min="0" max="5000" step="50" value="120"></label>'
    + '<button id="visual-test-send" class="secondary" type="button">运行视觉实验</button>'
    + '<button id="visual-test-parallel" class="secondary" type="button">并行测试三种行为</button>'
    + '</div><div id="visual-test-feedback" class="feedback"></div>'
    + '</section>';
}

function applyToEventsSection(profiles, events) {
  const profileList = Array.isArray(profiles) ? profiles : [];
  const eventList = Array.isArray(events) ? events : [];
  const profileOptions = profileList.length
    ? profileList.map(function(p) {
        return '<option value="' + escapeHtml(p.profileId) + '">' + escapeHtml(p.name) + '</option>';
      }).join('')
    : '<option value="">暂无可用的配置包</option>';
  const eventOptions = eventList.length
    ? eventList.map(function(e) {
        return '<option value="' + escapeHtml(e.eventId) + '">' + escapeHtml(e.label || e.eventId) + '</option>';
      }).join('')
    : '<option value="">暂无可用的测试事件</option>';
  return '<section class="apply-section section-card">'
    + '<h2 class="profile-section-title">应用于事件</h2>'
    + '<p class="apply-intro">选择配置包和事件，预览影响后应用到选定事件。</p>'
    + '<div class="apply-row">'
    + '<label class="apply-label">配置包<select id="apply-visual-profile" class="apply-select">' + profileOptions + '</select></label>'
    + '<label class="apply-label">事件<select id="apply-event-select" class="apply-select">' + eventOptions + '</select></label>'
    + '<button id="apply-visual-preview" class="secondary" type="button">预览影响</button>'
    + '<button id="apply-visual-btn" class="secondary" type="button">应用</button>'
    + '</div>'
    + '<div id="apply-visual-feedback" class="feedback"></div>'
    + '<div id="apply-bound-list" class="apply-bound-list" style="display:none"><h3 class="apply-bound-title">已绑定事件</h3><div class="apply-bound-items"></div></div>'
    + '</section>';
}

function diagnosticsSection(boot) {
  const status = boot.status || 'saved';
  const revision = boot.revision;
  const statusLabel = status === 'applied' ? '已应用' : status === 'saved' ? '已保存' : status === 'loading' ? '加载中' : status;
  const diagnostics = Array.isArray(boot.visualDiagnostics) ? boot.visualDiagnostics : [];
  const rows = diagnostics.length
    ? diagnostics.slice(0, 12).map((entry) => '<div class="visual-diagnostic-row"><div><strong>' + escapeHtml(entry.code || 'VISUAL_OPERATION') + '</strong><span>' + escapeHtml(entry.stage || 'visual') + ' · ' + escapeHtml(entry.message || '') + '</span></div><time>' + escapeHtml(entry.timestamp || '') + '</time></div>').join('')
    : '<div class="empty-state">还没有视觉诊断记录。保存设置、运行测试或打开实验台后，这里会显示结果。</div>';
  return '<section class="diagnostics-section section-card" id="visual-diagnostics">'
    + '<div class="section-card-header"><div><h2 class="profile-section-title">视觉诊断</h2><p class="section-card-intro">只记录视觉设置、配置包和真实卡片操作，不展示通知正文。</p></div><div class="section-card-actions"><button id="refresh-visual-diagnostics" class="secondary" type="button">刷新</button><button id="clear-visual-diagnostics" class="secondary" type="button">清空</button><button id="export-visual-diagnostics" class="secondary" type="button">导出</button></div></div>'
    + '<div class="diagnostics-grid">'
    + '<div class="diagnostics-card"><span class="diagnostics-label">设置状态</span><span class="diagnostics-value">' + escapeHtml(statusLabel) + '</span></div>'
    + '<div class="diagnostics-card"><span class="diagnostics-label">修订版本</span><span class="diagnostics-value">' + (revision != null ? revision : '—') + '</span></div>'
    + '<div class="diagnostics-card"><span class="diagnostics-label">最近记录</span><span class="diagnostics-value">' + diagnostics.length + '</span></div>'
    + '</div><div id="visual-diagnostics-list" class="visual-diagnostics-list">' + rows + '</div><div id="visual-diagnostics-feedback" class="feedback" role="status" aria-live="polite"></div>'
    + '</section>';
}

function labelSelect(label, id, options, selected) {
  return '<label>' + escapeHtml(label) + '<select id="' + id + '">'
    + optionList(options, selected) + '</select></label>';
}
function labelNumber(label, id, value, min, max, step = 1, disabled = false) {
  return '<label>' + escapeHtml(label) + '<input id="' + id + '" type="number" min="' + min + '" max="' + max
    + '" step="' + step + '" value="' + value + '"' + (disabled ? ' disabled' : '') + '></label>';
}
function labelColor(label, id, value, disabled = false) {
  return '<label>' + escapeHtml(label) + '<input id="' + id + '" type="color" value="' + escapeHtml(value) + '"'
    + (disabled ? ' disabled' : '') + '></label>';
}
function anchorSelect(selected) {
  return '<label>停靠角<select id="prop-anchor">'
    + '<option value="top-left"' + (selected === 'top-left' ? ' selected' : '') + '>左上</option>'
    + '<option value="top-right"' + (selected === 'top-right' || !selected ? ' selected' : '') + '>右上</option>'
    + '<option value="bottom-left"' + (selected === 'bottom-left' ? ' selected' : '') + '>左下</option>'
    + '<option value="bottom-right"' + (selected === 'bottom-right' ? ' selected' : '') + '>右下</option>'
    + '</select></label>';
}

export function renderVisualSettingsPage(currentUrl = '', initialData = null) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification Hub 通知视觉</title><style>'
    + PAGE_NAVIGATION_STYLE
    + CSS_STYLES
    + '</style></head><body><main class="shell">'
    + renderPageNavigation({ active: 'settings', currentUrl })
    + '<div class="settings-toolbar" style="display:flex;justify-content:space-between;gap:12px;margin:18px 0 10px">'
    + '<button id="back-settings" class="secondary" type="button">← 返回设置中心</button>'
    + '<span style="color:var(--muted);font-size:12px">设置 / 通知视觉</span></div>'
    + renderBody(currentUrl, initialData)
    + '</main>' + PAGE_NAVIGATION_SCRIPT + '</body></html>';
}

const CSS_STYLES = ':root{color-scheme:dark;--bg:#0e1513;--surface:#17221f;--raised:#1d2b27;--soft:#213630;--text:#e7f2ee;--muted:#9bb1a9;--line:#304740;--accent:#62d0a8;--strong:#38b88d;--ink:#092118;--danger:#f18c8c;--success:#72d49e}'
  + '*{box-sizing:border-box}body{margin:0;min-width:300px;background:var(--bg);color:var(--text);font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif}'
  + 'button,input,select{font:inherit}'
  + 'button{min-height:36px;border:1px solid var(--strong);border-radius:7px;padding:7px 14px;background:var(--strong);color:var(--ink);font-weight:700;cursor:pointer}'
  + 'button:hover{background:var(--accent)}'
  + 'button.secondary,.secondary{background:transparent;border-color:var(--line);color:var(--text)}'
  + 'button.secondary:hover,.secondary:hover{background:var(--raised)}'
  + 'button:disabled{opacity:.48;cursor:not-allowed}'
  + 'button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
  + '.shell{max-width:1280px;margin:0 auto;padding:36px 40px 72px}'
  + '.visual-workbench{display:grid;gap:20px}'
  + '.visual-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:12px 0 8px}'
  + '.eyebrow{color:var(--accent);font:11px ui-monospace,Consolas,monospace;letter-spacing:1px}'
  + '.visual-hero h1{margin:5px 0 4px;font-size:30px;letter-spacing:0}'
  + '.visual-hero p{margin:0;color:var(--muted);font-size:14px}'
  + '.state-pill{padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);white-space:nowrap}'
  + '.pipeline-section{display:grid;gap:2px;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:4px}'
  + '.pipeline-level{display:grid;gap:10px;padding:14px 18px;border-radius:8px;margin:2px 0}'
  + '.pipeline-level:hover{background:var(--raised)}'
  + '.pipeline-level-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
  + '.pipeline-level-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:0 0 8px}'
  + '.pipeline-level-label{font-size:14px;font-weight:700;color:var(--text)}'
  + '.pipeline-level-hint{font-size:11px;color:var(--muted);margin-left:auto}'
  + '.pipeline-level-body{margin-left:16px;width:100%}'
  + '.pipeline-nested{margin-left:20px;border-left:2px solid var(--line);border-radius:0 8px 8px 0}'
  + '.pipeline-nested-2{margin-left:40px;border-left:2px solid var(--line);border-radius:0 8px 8px 0}'
  + '.pipeline-nested-3{margin-left:60px;border-left:2px solid var(--line);border-radius:0 8px 8px 0}'
  + '.pipeline-nested-4{margin-left:80px;border-left:2px solid var(--line);border-radius:0 8px 8px 0}'
  + '.pipeline-select{width:100%;max-width:360px;min-height:36px;border:1px solid var(--line);border-radius:6px;padding:7px 9px;background:var(--raised);color:var(--text)}'
  + '.pipeline-link{color:var(--accent);text-decoration:none;font-size:13px;font-weight:600}'
  + '.pipeline-link:hover{text-decoration:underline;color:var(--strong)}'
  + '.pipeline-subsection{display:grid;gap:16px}'
  + '.pipeline-subgroup{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}'
  + '.pipeline-subgroup-label{font-size:12px;font-weight:600;color:var(--accent)}'
  + '.pipeline-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;position:relative}'
  + '.pipeline-grid-3 label{display:grid;gap:3px;color:var(--muted);font-size:11px;position:relative}'
  + '.pipeline-grid-3 input,.pipeline-grid-3 select{width:100%;min-height:32px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;background:var(--raised);color:var(--text);font-size:13px}'
  + '.pipeline-grid-3 input[type=color]{padding:2px;height:32px;cursor:pointer}'
  + '.pipeline-grid-3 input:disabled,.pipeline-grid-3 select:disabled{opacity:.4;cursor:not-allowed}'
  + '.pipeline-preview{margin:6px 14px 14px;padding-top:14px;border-top:1px solid var(--line)}'
  + '.pipeline-preview-label{display:flex;justify-content:space-between;margin-bottom:8px;color:var(--muted);font-size:12px}'
  + '.pipeline-preview-label span{font-size:11px}'
  + '.visual-preview-entry{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--raised);color:var(--muted);font-size:12px}'
  + '.visual-preview-entry .state-pill{margin-right:2px}'
  + '.feedback{min-height:22px;color:var(--muted);font-size:12px}'
  + '.feedback.success{color:var(--success)}'
  + '.feedback.error{color:var(--danger)}'
  + '@media(max-width:900px){.pipeline-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}.pipeline-nested-2{margin-left:20px}}'
  + '@media(max-width:680px){.shell{padding:20px 16px 40px}.visual-hero{align-items:flex-start;flex-direction:column}.pipeline-grid-3{grid-template-columns:1fr}.pipeline-nested,.pipeline-nested-2{margin-left:12px}.pipeline-level{padding:12px 14px}}'
  + '.profile-section{display:grid;gap:12px;padding:12px 0;margin-top:8px}'
  + '.profile-section-title{font-size:16px;font-weight:700;margin:0;color:var(--text)}'
  + '.profile-save-row{display:flex;gap:10px;align-items:center}'
  + '.profile-name-input{flex:1;min-width:0;min-height:36px;border:1px solid var(--line);border-radius:6px;padding:7px 9px;background:var(--raised);color:var(--text);font-size:14px}'
  + '.profile-name-input:focus{outline:2px solid var(--accent);outline-offset:2px;border-color:var(--accent)}'
  + '.profile-list-wrapper{display:grid;gap:6px}'
  + '.profile-list-empty{padding:16px 12px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);text-align:center;font-size:13px}'
  + '.profile-list-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);flex-wrap:wrap}'
  + '.profile-list-name{font-weight:600;font-size:14px;color:var(--text)}'
  + '.profile-list-meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted)}'
  + '.profile-refs{color:var(--accent)}'
  + '.profile-refs.muted{color:var(--muted)}'
  + '.profile-source{padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:11px;color:var(--muted)}'
  + '.conflict-dialog{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:1000}'
  + '.conflict-dialog-body{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;max-width:420px;width:90%;display:grid;gap:16px}'
  + '.conflict-dialog-body p{margin:0;font-size:14px;color:var(--text);line-height:1.5}'
  + '.conflict-actions{display:flex;gap:8px;flex-wrap:wrap}'
  + '.conflict-actions button{flex:1;min-width:90px}'
  + 'button.danger{background:var(--danger);color:var(--ink);border-color:var(--danger)}'
  + 'button.danger:hover{background:#f3a0a0}'
  + '.test-section{display:grid;gap:12px;padding:12px 0;margin-top:8px}'
  + '.test-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}'
  + '.test-count-label{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}'
  + '.test-count-input{width:70px;min-height:36px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;background:var(--raised);color:var(--text);font-size:14px;text-align:center}'
  + '.test-count-input:focus{outline:2px solid var(--accent);outline-offset:2px;border-color:var(--accent)}'
  + '.apply-section{display:grid;gap:12px;padding:12px 0;margin-top:8px}'
  + '.apply-intro{color:var(--muted);font-size:13px;margin:0}'
  + '.apply-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}'
  + '.apply-label{display:grid;gap:3px;color:var(--muted);font-size:12px;min-width:160px}'
  + '.apply-select{width:100%;min-width:140px;min-height:36px;border:1px solid var(--line);border-radius:6px;padding:7px 9px;background:var(--raised);color:var(--text);font-size:13px}'
  + '.apply-select:focus{outline:2px solid var(--accent);outline-offset:2px;border-color:var(--accent)}'
  + '.apply-bound-list{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}'
  + '.apply-bound-title{font-size:13px;font-weight:600;margin:0;color:var(--text)}'
  + '.apply-bound-items{display:grid;gap:6px}'
  + '.apply-bound-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);font-size:12px}'
  + '.apply-bound-item .bound-event{color:var(--text)}'
  + '.apply-bound-item .bound-profile{color:var(--accent)}'
  + '.diagnostics-section{display:grid;gap:12px;padding:12px 0;margin-top:8px}'
  + '.diagnostics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}'
  + '.diagnostics-card{display:grid;gap:4px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}'
  + '.diagnostics-label{font-size:11px;color:var(--muted);text-transform:uppercase}'
  + '.diagnostics-value{font-size:14px;font-weight:600;color:var(--text)}'
  + '.pipeline-level{overflow:hidden}'
  + '.pipeline-level>summary{list-style:none;cursor:pointer}'
  + '.pipeline-level>summary::-webkit-details-marker{display:none}'
  + '.pipeline-level-chevron{margin-left:8px;color:var(--muted);transition:transform .15s}'
  + '.pipeline-level[open]>summary .pipeline-level-chevron{transform:rotate(180deg)}'
  + '.section-card{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:18px}'
  + '.section-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}'
  + '.section-card-intro{margin:4px 0 0;color:var(--muted);font-size:12px}'
  + '.section-card-actions{display:flex;gap:8px;flex-wrap:wrap}'

  + '.visual-diagnostics-list{display:grid;gap:6px}'
  + '.visual-diagnostic-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}'
  + '.visual-diagnostic-row div{display:grid;gap:2px;min-width:0}'
  + '.visual-diagnostic-row strong{font-size:12px;color:var(--text)}'
  + '.visual-diagnostic-row span,.visual-diagnostic-row time{font-size:11px;color:var(--muted);overflow-wrap:anywhere}'
  + '.visual-diagnostic-row time{white-space:nowrap}'
  + '.empty-state{padding:16px;color:var(--muted);text-align:center}'
  + '.visual-global-section{display:grid;gap:8px;padding:14px 18px}'
  + '.visual-global-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}'
  + '.visual-global-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;font-weight:600;color:var(--text);user-select:none}'
  + '.visual-global-toggle input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent);cursor:pointer}'
  + '.visual-global-default{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}'
  + '.visual-global-default select{min-height:32px;border:1px solid var(--line);border-radius:6px;padding:4px 7px;background:var(--raised);color:var(--text);font-size:13px}'
  + '.visual-global-hint{font-size:12px;color:var(--muted);margin:0}'
  + '.visual-hero-meta{display:grid;justify-items:end;gap:5px}.visual-context-label,.section-kicker{font:10px ui-monospace,Consolas,monospace;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}'
  + '.visual-workbench-grid{display:grid;grid-template-columns:190px minmax(0,1fr);align-items:start;gap:18px}.visual-mode-sidebar,.visual-preview-column{min-width:0}.visual-preview-column{display:contents}.visual-mode-sidebar{position:sticky;top:18px;display:grid;gap:16px}.mode-sidebar-heading{display:grid;gap:4px;padding:3px 4px}.mode-sidebar-heading strong{font-size:15px}.mode-sidebar-heading>span:last-child{font-size:11px;color:var(--muted)}.visual-mode-list{display:grid;gap:7px}.visual-mode-card{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-height:62px;padding:9px 8px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--text);text-align:left;font-weight:600}.visual-mode-card:hover{background:var(--raised);border-color:var(--mode-color)}.visual-mode-card.is-active{background:transparent;border-color:var(--mode-color);box-shadow:inset 3px 0 0 var(--mode-color)}.mode-card-mark{display:grid;place-items:center;width:25px;height:25px;border:1px solid var(--mode-color);border-radius:6px;color:var(--mode-color);font:700 12px ui-monospace,Consolas,monospace}.mode-card-copy{display:grid;gap:2px;min-width:0}.mode-card-copy strong{font-size:13px}.mode-card-copy small{overflow:hidden;color:var(--muted);font-size:10px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}.mode-card-arrow{color:var(--muted);font-size:15px}.workbench-anchor-nav{display:grid;gap:2px;padding:8px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.workbench-anchor-nav a{padding:6px 8px;border-radius:5px;color:var(--muted);font-size:12px;text-decoration:none}.workbench-anchor-nav a:hover{background:var(--raised);color:var(--text)}.workbench-channel-note{display:flex;gap:8px;align-items:flex-start;padding:10px 8px;border:1px solid var(--line);border-radius:8px;background:rgba(29,43,39,.55)}.channel-note-dot{width:7px;height:7px;margin-top:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(98,208,168,.12)}.workbench-channel-note div{display:grid;gap:3px;min-width:0}.workbench-channel-note strong{font-size:11px}.workbench-channel-note p{margin:0;overflow-wrap:anywhere;color:var(--muted);font:10px ui-monospace,Consolas,monospace;line-height:1.4}.visual-editor-column{display:grid;gap:14px;min-width:0}.editor-column-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}.editor-column-heading h2,.preview-panel-heading h2{margin:3px 0 2px;font-size:18px}.editor-column-heading p{margin:0;color:var(--muted);font-size:12px}.editor-scope{padding:4px 7px;border:1px solid var(--line);border-radius:5px;color:var(--muted);font-size:10px;white-space:nowrap}.preview-sticky-panel{position:fixed;top:86px;right:24px;z-index:40;display:grid;gap:12px;width:300px;max-height:calc(100vh - 102px);overflow:auto;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 18px 42px rgba(0,0,0,.3)}.preview-panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;cursor:grab;user-select:none}.preview-panel-heading.is-dragging{cursor:grabbing}.preview-panel-heading h2{font-size:16px}.preview-drag-hint{display:block;color:var(--muted);font-size:10px}.preview-live-dot{display:inline-flex;align-items:center;gap:5px;color:var(--success);font-size:10px}.preview-live-dot:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--success)}.preview-stage{position:relative;isolation:isolate;min-height:248px;overflow:hidden;border:1px solid var(--line);border-radius:9px;background:#0a100f}.stage-grid{position:absolute;inset:0;opacity:.35;background-image:linear-gradient(rgba(98,208,168,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(98,208,168,.08) 1px,transparent 1px);background-size:20px 20px}.stage-card{position:absolute;display:grid;gap:2px;padding:8px 9px;border:1px solid;box-shadow:0 8px 16px rgba(0,0,0,.24);font-size:10px;cursor:grab;opacity:.42;transition:opacity .15s,box-shadow .15s}.stage-card.is-mode-active{opacity:1;box-shadow:0 10px 22px rgba(0,0,0,.34),0 0 0 1px rgba(255,255,255,.14)}.stage-card.is-dragging{cursor:grabbing;transition:none}.stage-card span{font:700 9px ui-monospace,Consolas,monospace}.stage-card strong{font-size:10px}.stage-card small{color:var(--muted);font:9px ui-monospace,Consolas,monospace}.stage-minimal{right:10px;bottom:10px;width:132px;border-color:#6d817a;border-radius:7px;background:#14201c}.stage-minimal span{color:#9bb1a9}.stage-ticker{top:22px;left:16px;width:175px;border-color:#56c8d8;border-radius:5px;background:#10262a}.stage-ticker span{color:#56c8d8}.stage-popup{top:84px;left:50%;width:156px;transform:translateX(-50%);border-color:#f1c77a;border-radius:10px;background:#2a2418}.stage-popup span{color:#f1c77a}.preview-runtime-status{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.preview-runtime-status>div{display:flex;align-items:center;gap:6px;min-width:0}.preview-status-copy,.preview-status-lock{color:var(--muted);font-size:10px}.preview-status-lock{font:9px ui-monospace,Consolas,monospace}.preview-action{width:100%}.preview-channel-list{display:grid;gap:6px;padding-top:4px;border-top:1px solid var(--line)}.preview-channel-list>div{display:grid;grid-template-columns:7px auto minmax(0,1fr);align-items:center;gap:6px;font-size:11px}.preview-channel-list small{overflow:hidden;color:var(--muted);font:9px ui-monospace,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.channel-color{width:7px;height:20px;border-radius:2px}.minimal-color{background:#9bb1a9}.ticker-color{background:#56c8d8}.popup-color{background:#f1c77a}.visual-global-spacer{flex:1}.mode-editor{display:grid;gap:16px;padding:18px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.mode-editor-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.mode-editor-header h3{margin:4px 0 2px;font-size:20px}.mode-editor-header p{margin:0;color:var(--muted);font-size:12px}.mode-editor-badge{padding:4px 7px;border:1px solid var(--editor-mode-color);border-radius:5px;color:var(--editor-mode-color);font-size:10px;white-space:nowrap}.phase-one-grid{display:grid;gap:10px}.phase-one-group{display:grid;gap:8px;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}.phase-one-label{color:var(--editor-mode-color);font-size:12px;font-weight:700}.phase-one-hint{margin:0;color:var(--muted);font-size:11px;line-height:1.45}.phase-one-group>select:not(.mode-contract-select),.phase-one-fields input,.phase-one-fields select{min-height:34px;border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--raised);color:var(--text)}.phase-one-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.phase-one-fields label{display:grid;gap:3px;color:var(--muted);font-size:11px}.phase-one-fields input[type=color]{padding:2px;cursor:pointer}.mode-contract-select{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.editor-deferred{border-top:1px solid var(--line);padding-top:10px;color:var(--muted);font-size:12px}.editor-deferred summary{cursor:pointer;color:var(--muted)}.editor-deferred p{margin:8px 0 0;line-height:1.5}.visual-workbench-grid .section-card{background:var(--surface)}.visual-workbench-grid .profile-section,.visual-workbench-grid .apply-section,.visual-workbench-grid .test-section,.visual-workbench-grid .diagnostics-section{margin-top:0;padding:16px}.visual-workbench-grid .profile-section-title{font-size:15px}.visual-workbench-grid .pipeline-section{border-radius:10px;background:var(--bg)}'
  + '.axis-bar{display:grid;grid-template-columns:minmax(0,1.6fr) 1px minmax(0,1fr);gap:16px;align-items:stretch;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}.axis-cell{display:grid;gap:10px;min-width:0}.axis-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.axis-name{font-size:13px;font-weight:700;color:var(--text)}.axis-sub{font-size:11px;color:var(--muted)}.axis-divider{width:1px;align-self:stretch;background:var(--line)}.axis-options{display:flex;gap:8px;flex-wrap:wrap;min-width:0}.axis-option,.visual-mode-item{display:grid;gap:5px;min-width:0}.axis-why{display:none;margin:0;color:var(--muted);font-size:11px;line-height:1.4}.axis-option:focus-within .axis-why,.axis-option.is-open .axis-why,.visual-mode-item:focus-within .axis-why,.visual-mode-item.is-open .axis-why{display:block}.axis-chip{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:7px 11px;border:1px solid var(--line);border-radius:7px;background:var(--raised);color:var(--text);font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s,transform .1s}.axis-chip-code{font:10px ui-monospace,Consolas,monospace;color:var(--muted)}.axis-chip:hover{border-color:var(--accent)}.axis-chip:active{transform:translateY(1px)}.axis-chip.is-selected{border-color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}.axis-chip.is-selected .axis-chip-code{color:var(--accent)}.axis-chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.axis-chip.is-locked{border-style:dashed;background:transparent;color:var(--muted);cursor:default}.axis-chip.is-locked:hover{background:var(--raised);border-color:var(--line)}.axis-chip.is-locked:active{transform:none}.axis-chip-badge,.mode-card-badge{padding:1px 6px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font:10px/1.5 ui-monospace,Consolas,monospace;white-space:nowrap}.axis-segmented{display:inline-flex;gap:0;padding:3px;border:1px solid var(--line);border-radius:7px;background:var(--raised)}.axis-seg{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 14px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--text);font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,transform .1s}.axis-seg:hover{border-color:var(--line)}.axis-seg:active{transform:translateY(1px)}.axis-seg.is-selected{border-color:var(--line);background:var(--surface);box-shadow:inset 0 -2px 0 var(--accent)}.axis-seg:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.mode-card-apply{color:var(--muted);font-size:11px;white-space:nowrap}.visual-mode-card:hover .mode-card-apply{color:var(--accent)}.visual-mode-card:active{transform:translateY(1px)}.visual-mode-card.is-locked{border-style:dashed;cursor:default}.visual-mode-card.is-locked:hover{background:transparent;border-color:var(--line)}.visual-mode-card.is-locked:active{transform:none}.visual-mode-card.is-locked .mode-card-mark{color:var(--muted);border-color:var(--line)}.visual-mode-card.is-locked .mode-card-copy strong{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.visual-mode-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
  + '@media(max-width:1080px){.shell{padding-inline:24px}.visual-workbench-grid{grid-template-columns:168px minmax(0,1fr);gap:12px}.preview-sticky-panel{right:16px;width:280px;padding:12px}.preview-stage{min-height:220px}.stage-card{transform:scale(.9);transform-origin:center}.stage-popup{transform:translateX(-50%) scale(.9)}}'
  + '@media(max-width:820px){.visual-workbench-grid{grid-template-columns:1fr}.visual-mode-sidebar{position:static;grid-template-columns:1fr 1fr;align-items:start}.mode-sidebar-heading{grid-column:1/-1}.visual-mode-list{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr))}.axis-bar{grid-template-columns:minmax(0,1fr)}.axis-divider{width:auto;height:1px;align-self:auto}.workbench-anchor-nav{grid-column:1/-1;grid-template-columns:repeat(5,minmax(0,1fr));border-bottom:0}.workbench-anchor-nav a{text-align:center}.workbench-channel-note{grid-column:1/-1}.preview-sticky-panel{top:72px;right:12px;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 84px)}.preview-stage{min-height:230px}.visual-editor-column{order:1}.phase-one-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}'
  + '@media(max-width:560px){.shell{padding:18px 12px 40px}.visual-hero{padding-top:4px}.visual-hero h1{font-size:25px}.visual-hero-meta{justify-items:start}.visual-global-section{padding:13px}.visual-mode-sidebar{grid-template-columns:1fr}.visual-mode-list{grid-template-columns:1fr}.workbench-anchor-nav{grid-template-columns:repeat(3,minmax(0,1fr))}.workbench-anchor-nav a:nth-child(n+4){display:none}.editor-column-heading{align-items:flex-start;flex-direction:column}.editor-scope{white-space:normal}.preview-stage{min-height:214px}.stage-card{transform:scale(.82);transform-origin:center}.stage-popup{transform:translateX(-50%) scale(.82)}.phase-one-fields{grid-template-columns:1fr}.profile-save-row,.apply-row,.test-row{align-items:stretch;flex-direction:column}.profile-save-row button,.apply-row button,.test-row button{width:100%}.profile-name-input,.apply-label{width:100%;min-width:0}.visual-global-row{align-items:stretch;flex-direction:column;gap:10px}.visual-global-spacer{display:none}.visual-global-row button{width:100%}}'
  + '.visual-workbench-grid{grid-template-columns:190px minmax(0,1fr) minmax(260px,300px);grid-template-areas:"sidebar editor preview"}'
  + '.visual-mode-sidebar{grid-area:sidebar}.visual-editor-column{grid-area:editor}.visual-preview-column{display:block;grid-area:preview;position:sticky;top:18px;align-self:start}.preview-sticky-panel{position:static;top:auto;right:auto;width:auto;max-height:calc(100vh - 36px);z-index:auto}.preview-panel-heading{cursor:default;user-select:text}.preview-panel-heading.is-dragging{cursor:default}.stage-popup{top:auto;right:10px;bottom:10px;left:auto;transform:none}'
  + '@media(max-width:1080px){.visual-workbench-grid{grid-template-columns:168px minmax(0,1fr) minmax(248px,280px);grid-template-areas:"sidebar editor preview";gap:12px}.visual-preview-column{top:12px}.preview-sticky-panel{width:auto;padding:12px}}'
  + '@media(max-width:820px){.visual-workbench-grid{grid-template-columns:1fr;grid-template-areas:"preview" "sidebar" "editor"}.visual-preview-column{position:static}.preview-sticky-panel{width:100%;max-height:none}.visual-editor-column{order:initial}}'
  + '@media(max-width:560px){.stage-popup{transform:none}}';

export function renderVisualSettingsFragment(currentUrl = '', initialData = null) {
  return '<style data-settings-view-style>' + CSS_STYLES + '</style>'
    + renderBody(currentUrl, initialData);
}

export default function registerVisualSettingsRoute(app, ctx) {
  const getPlugin = () => ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin;
  app.get('/settings-visual', (c) => { const plugin = getPlugin(); return c.html(renderVisualSettingsPage(c?.req?.url ?? '', typeof plugin?.getVisualSettingsStatus === 'function' ? plugin.getVisualSettingsStatus() : null)); });
  app.get('/visual-settings-status', (c) => { try { const plugin = getPlugin(); if (!plugin?.getVisualSettingsStatus) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.getVisualSettingsStatus() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.get('/visual-diagnostics', (c) => { try { const plugin = getPlugin(); if (!plugin?.getVisualSettingsStatus) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, visualDiagnostics: plugin.getVisualSettingsStatus().visualDiagnostics ?? [] }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/visual-diagnostics-clear', (c) => { try { const plugin = getPlugin(); if (!plugin?.clearVisualDiagnostics) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.clearVisualDiagnostics() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-diagnostics-export', async (c) => { try { const plugin = getPlugin(); if (!plugin?.exportVisualDiagnostics) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.exportVisualDiagnostics(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-settings-update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualSettings) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...await plugin.updateVisualSettings(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-settings-preview', async (c) => { try { const plugin = getPlugin(); if (!plugin?.previewVisualSettings) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.previewVisualSettings(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-workbench/open', async (c) => { try { const plugin = getPlugin(); if (!plugin?.openVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.openVisualWorkbenchCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-workbench/update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.updateVisualWorkbenchCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-workbench/close', async (c) => { try { const plugin = getPlugin(); if (!plugin?.closeVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.closeVisualWorkbenchCard()) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/open', async (c) => { try { const plugin = getPlugin(); if (!plugin?.openVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...visualPreviewResponse(await plugin.openVisualPreviewCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...visualPreviewResponse(await plugin.updateVisualPreviewCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/close', async (c) => { try { const plugin = getPlugin(); if (!plugin?.closeVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.closeVisualPreviewCard()) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-test-event', async (c) => { try { const plugin = getPlugin(); if (!plugin?.runVisualEventExperiment) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.runVisualEventExperiment(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-test-parallel-cards', async (c) => { try { const plugin = getPlugin(); if (!plugin?.runParallelCardSample) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.runParallelCardSample(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  // Visual profile endpoints (forwarded to settings.js API)
  app.get('/visual-profiles', (c) => { try { const plugin = getPlugin(); if (!plugin?.listVisualProfiles) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profiles: plugin.listVisualProfiles() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/visual-profiles/save', async (c) => { try { const plugin = getPlugin(); if (!plugin?.saveVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profile: plugin.saveVisualProfile(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.delete('/visual-profiles/:profileId', (c) => { try { const plugin = getPlugin(); if (!plugin?.removeVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, ...plugin.removeVisualProfile(c.req.param('profileId')) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'VISUAL_PROFILE_REGISTRY_IN_USE' ? 409 : error?.code === 'VISUAL_PROFILE_REGISTRY_NOT_FOUND' ? 404 : 400); } });
  app.post('/visual-profiles/preview-apply', async (c) => { try { const plugin = getPlugin(); if (!plugin?.previewApplyVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, preview: plugin.previewApplyVisualProfile(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-profiles/apply', async (c) => { try { const plugin = getPlugin(); if (!plugin?.applyVisualProfileToEvents) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, result: plugin.applyVisualProfileToEvents(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.get('/custom-visual-events', (c) => { try { const plugin = getPlugin(); if (!plugin?.listCustomVisualEvents) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); return c.json({ ok: true, events: plugin.listCustomVisualEvents() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/custom-visual-events/restore-default', async (c) => { try { const plugin = getPlugin(); if (!plugin?.restoreVisualEventDefault) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); const body = await readJsonBody(c); return c.json({ ok: true, ...plugin.restoreVisualEventDefault(body.eventId) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
}
