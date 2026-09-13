const TEST_EVENT_ALIASES = Object.freeze({
  chat_message: 'chat.assistant_reply.completed',
  channel_message: 'channel.message.received',
  tool_completed: 'tool.execution.succeeded',
  tool_error: 'tool.execution.failed',
  timeout: 'tool.execution.timed_out',
  system_warning: 'session.health.degraded'
});

export const STUDIO_CLIENT = `
function setControl(id, value) {
  var el = $(id);
  if (!el || value === undefined || value === null) return;
  el.value = String(value);
}
function modeConfig(value) {
  var profile = state.profile || {};
  var card = profile.card || {};
  return card.types && card.types[value] || {};
}
function pressed(id) {
  var el = $(id);
  return !!(el && el.getAttribute && el.getAttribute("aria-pressed") === "true");
}
function renderStudioPreview() {
  var stage = $("visual-preview-stage");
  if (!stage) return;
  var draft = collect();
  var behavior = draft.behaviorId || "stack";
  var type = (draft.card && draft.card.types && draft.card.types[draft.card.activeType]) || {};
  var appearance = type.appearance || {};
  var space = (type.properties && type.properties.space) || {};
  var anchor = space.anchor || "bottom-right";
  var radius = Number(appearance.borderRadius);
  if (!Number.isFinite(radius)) radius = 16;
  var bg = appearance.backgroundColor || "#0e1916";
  var opacity = Number(appearance.opacity);
  if (!Number.isFinite(opacity)) opacity = 0.96;
  stage.setAttribute("data-anchor", anchor);
  stage.innerHTML = "";
  if (behavior !== "ticker") {
    stage.insertAdjacentHTML("beforeend", '<div class="stage-label">屏幕角落</div>');
    var titles = ["工具执行完成", "频道新消息"];
    for (var i = 0; i < titles.length; i += 1) {
      stage.insertAdjacentHTML("beforeend", '<article class="stack-card" data-preview-card="minimal" tabindex="0" style="z-index:' + (10 - i) + ';border-radius:' + radius + 'px;background:' + bg + ';opacity:' + opacity + '"><span class="x">×</span><strong>' + titles[i] + '</strong><small>叠在这里，等你看完。</small></article>');
    }
    return;
  }
  var ticker = draft.ticker || {};
  var tracksInput = Number(ticker.trackCount);
  var storedRatio = Math.round((Number(ticker.bandRatio) || 0.28) * 100);
  var auto = Math.max(1, Math.floor((Math.max(stage.clientHeight, 220) * (storedRatio / 100) + 8) / 40));
  var tracks = (!tracksInput || tracksInput < 1) ? auto : Math.round(tracksInput);
  var ratio = (!tracksInput || tracksInput < 1) ? storedRatio : Math.max(15, Math.min(100, Math.round(tracks * 84 / 1080 * 100)));
  var band = ticker.band || "top";
  var randomOn = ticker.speedRandom === true;
  var speed = Number(ticker.speedPxPerSec) || 400;
  var previewWidth = Math.max(stage.clientWidth, 320);
  var dur = Math.max(1.2, (previewWidth + 260) / speed).toFixed(2) + "s";
  var bandEl = document.createElement("div");
  bandEl.className = "ticker-band-preview";
  bandEl.style.height = ratio + "%";
  if (band === "top") bandEl.style.top = "0"; else bandEl.style.bottom = "0";
  var samples = ["工具完成", "新消息", "系统警告"];
  for (var t = 0; t < tracks; t += 1) {
    var lane = document.createElement("div");
    lane.className = "ticker-lane";
    var card = document.createElement("div");
    card.className = "ticker-card";
    var flow = randomOn ? Math.max(1.2, (previewWidth + 260) / (220 + t * 170)).toFixed(2) + "s" : dur;
    card.style.setProperty("--flow", flow);
    card.style.animationDelay = (t * -1.1) + "s";
    card.style.borderRadius = Math.min(radius, 12) + "px";
    card.style.background = bg;
    card.style.opacity = String(opacity);
    card.innerHTML = "<strong>" + samples[t % samples.length] + "</strong><small>从右往左</small>";
    lane.appendChild(card);
    bandEl.appendChild(lane);
  }
  stage.appendChild(bandEl);
  var label = document.createElement("div");
  label.className = "stage-label";
  label.textContent = "弹幕带 · " + (band === "top" ? "顶部" : "底部") + " · " + tracks + " 轨";
  stage.appendChild(label);
}
function updateStageCard() { renderStudioPreview(); }
function syncStudioReadouts(target) {
  if (!target) return;
  if (target.id === "ticker-track-count") {
    var tracks = Math.max(0, Math.round(Number(target.value) || 0));
    var fill = $("ticker-band-fill");
    var hidden = $("ticker-band-ratio");
    var pct = tracks < 1 ? (Number(hidden && hidden.value) || 28) : Math.max(15, Math.min(100, Math.round(tracks * 84 / 1080 * 100)));
    if (fill) fill.style.height = pct + "%";
    if (hidden && tracks >= 1) hidden.value = String(pct);
  }
  if (target.id === "ticker-speed") {
    var speedVal = $("ticker-speed-val");
    if (speedVal) {
      speedVal.textContent = target.value;
      speedVal.classList.toggle("is-muted", pressed("ticker-speed-random"));
    }
  }
  if (target.id === "ticker-min-gap") {
    var gapVal = $("ticker-min-gap-val");
    if (gapVal) gapVal.textContent = target.value;
  }
  if (target.id === "ticker-track-gap") {
    var trackGapVal = $("ticker-track-gap-val");
    if (trackGapVal) trackGapVal.textContent = target.value;
  }
  if (target.id === "prop-size") {
    var SIZE_PRESETS = { small: { width: 360, height: 180 }, medium: { width: 420, height: 220 }, large: { width: 500, height: 260 } };
    var preset = SIZE_PRESETS[target.value];
    if (preset) {
      setControl("prop-width", preset.width);
      setControl("prop-height", preset.height);
    }
  }
  if (target.id === "prop-anchor") {
    document.querySelectorAll(".dock-cell").forEach(function (c) { c.classList.toggle("is-on", c.getAttribute("data-anchor") === target.value); });
  }
  if (target.id === "ticker-band") {
    var bandEl = $("ticker-band-control");
    if (bandEl) bandEl.setAttribute("data-side", target.value);
  }
  if (target.id === "hold-seconds") {
    var ms = Math.max(1000, Math.round((Number(target.value) || 30) * 1000));
    setControl("prop-duration", ms);
    setControl("prop-hold-duration", ms);
  }
}
function bindStageDrag() {
  var stage = $("visual-preview-stage");
  if (!stage || !window.PointerEvent) return;
  var drag = null;
  function clamp(value, min, max) { return Math.min(Math.max(value, min), Math.max(min, max)); }
  function finish() {
    if (!drag) return;
    var card = drag.card;
    var rect = stage.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var left = Math.round(cardRect.left - rect.left);
    var top = Math.round(cardRect.top - rect.top);
    var right = Math.max(0, Math.round(rect.width - cardRect.width - left));
    var bottom = Math.max(0, Math.round(rect.height - cardRect.height - top));
    var horizontal = left <= right ? "left" : "right";
    var vertical = top <= bottom ? "top" : "bottom";
    setControl("prop-anchor", vertical + "-" + horizontal);
    setControl("prop-margin-left", left);
    setControl("prop-margin-right", right);
    setControl("prop-margin-top", top);
    setControl("prop-margin-bottom", bottom);
    card.classList.remove("is-dragging");
    drag = null;
    markVisualDirty();
    syncPreview();
  }
  stage.addEventListener("pointerdown", function (event) {
    var card = event.target && event.target.closest ? event.target.closest("[data-preview-card]") : null;
    if (!card || card.getAttribute("data-preview-card") !== $("pipeline-type").value) return;
    var rect = stage.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    drag = { card: card, x: event.clientX, y: event.clientY, left: cardRect.left - rect.left, top: cardRect.top - rect.top };
    card.style.left = drag.left + "px";
    card.style.top = drag.top + "px";
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.removeProperty("transform");
    if (card.setPointerCapture) card.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
    event.preventDefault();
  });
  stage.addEventListener("pointermove", function (event) {
    if (!drag) return;
    var rect = stage.getBoundingClientRect();
    var cardRect = drag.card.getBoundingClientRect();
    var left = clamp(drag.left + event.clientX - drag.x, 0, rect.width - cardRect.width);
    var top = clamp(drag.top + event.clientY - drag.y, 0, rect.height - cardRect.height);
    drag.card.style.left = left + "px";
    drag.card.style.top = top + "px";
  });
  stage.addEventListener("pointerup", finish);
  stage.addEventListener("pointercancel", finish);
  window.__notificationHubStageDragDispose = function () {
    stage.replaceWith(stage.cloneNode(true));
    window.__notificationHubStageDragDispose = null;
  };
}
function applyModeEditor(value) {
  var config = modeConfig(value);
  var meta = { minimal: { behavior: "stack", anchor: "bottom-right", size: "medium", aspectRatio: "default", gap: 8, margin: 18, color: "#0e1916", radius: 16, opacity: .96, duration: 30000, hold: 30000, width: 420, height: 220 } }[value] || {};
  var behavior = config.behavior || {};
  var appearance = config.appearance || {};
  var properties = config.properties || {};
  var space = properties.space || {};
  var shape = properties.shape || {};
  var lifecycle = properties.lifecycle || {};
  var interaction = properties.interaction || {};
  var skin = config.skin || {};
  var background = skin.background || {};
  var decoration = skin.decoration || {};
  setControl("prop-anchor", space.anchor || behavior.anchor || meta.anchor);
  setControl("prop-size", space.size || appearance.size || meta.size);
  setControl("prop-gap", space.gap === undefined ? meta.gap : space.gap);
  var legacyMargin = space.margin === undefined ? (behavior.margin === undefined ? meta.margin : behavior.margin) : space.margin;
  setControl("prop-margin-left", space.marginLeft === undefined ? (behavior.marginLeft === undefined ? legacyMargin : behavior.marginLeft) : space.marginLeft);
  setControl("prop-margin-right", space.marginRight === undefined ? (behavior.marginRight === undefined ? legacyMargin : behavior.marginRight) : space.marginRight);
  setControl("prop-margin-top", space.marginTop === undefined ? (behavior.marginTop === undefined ? legacyMargin : behavior.marginTop) : space.marginTop);
  setControl("prop-margin-bottom", space.marginBottom === undefined ? (behavior.marginBottom === undefined ? legacyMargin : behavior.marginBottom) : space.marginBottom);
  setControl("prop-width", appearance.width === undefined ? meta.width : appearance.width);
  setControl("prop-height", appearance.height === undefined ? meta.height : appearance.height);
  setControl("skin-bg-color", background.color || appearance.backgroundColor || meta.color);
  setControl("prop-border-radius", shape.borderRadius === undefined ? (decoration.borderRadius === undefined ? meta.radius : decoration.borderRadius) : shape.borderRadius);
  setControl("prop-opacity", shape.opacity === undefined ? (decoration.opacity === undefined ? meta.opacity : decoration.opacity) : shape.opacity);
  setControl("prop-duration", lifecycle.durationMs === undefined ? meta.duration : lifecycle.durationMs);
  setControl("prop-hold-duration", lifecycle.holdDurationMs === undefined ? meta.hold : lifecycle.holdDurationMs);
  setControl("prop-dismiss-mode", interaction.dismissMode || "closeButton");
  var width = $("prop-width");
  var height = $("prop-height");
  if (width) width.disabled = false;
  if (height) height.disabled = false;
  var editor = document.querySelector(".studio");
  if (editor) {
    editor.setAttribute("data-editor-mode", value);
    editor.setAttribute("data-mode", ($("pipeline-behavior") && $("pipeline-behavior").value) || "stack");
  }
  updateStageCard(value);
}
function setFoldVisibility(id, visible) {
  var el = $(id);
  if (!el) return;
  if (visible) {
    el.removeAttribute("hidden");
    el.open = true;
  } else {
    el.setAttribute("hidden", "");
    el.open = false;
  }
}
function selectBehavior(value) {
  var sel = $("pipeline-behavior");
  if (!sel || !value) return;
  var found = Array.prototype.slice.call(sel.options).some(function (o) { return o.value === value && !o.disabled; });
  if (!found) return;
  sel.value = value;
  document.querySelectorAll('[data-axis="behavior"]').forEach(function (btn) {
    var locked = btn.classList.contains("is-locked");
    var active = btn.getAttribute("data-value") === value && !locked;
    btn.classList.toggle("is-on", active);
    btn.classList.toggle("is-selected", active);
    if (!locked) btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  setFoldVisibility("ticker-section", value === "ticker");
  setFoldVisibility("stack-section", value !== "ticker");
  var studio = document.querySelector(".studio");
  if (studio) studio.setAttribute("data-mode", value);
  var copy = $("preview-copy");
  if (copy) copy.textContent = value === "ticker" ? "只演弹幕：从右往左流过这条带。" : "只演堆叠：从选定的角叠上来。";
  renderStudioPreview();
  markVisualDirty();
  syncPreview();
}
function studioClickHandler(event) {
  var chip = event.target && event.target.closest ? event.target.closest('[data-axis="behavior"]') : null;
  if (chip) {
    if (chip.classList.contains("is-locked") || chip.getAttribute("aria-disabled") === "true") {
      var toast = $("visual-preview-toast");
      if (toast) { toast.textContent = "突脸还不能用。请选堆叠或弹幕。"; toast.className = "toast"; }
      return;
    }
    event.preventDefault();
    selectBehavior(chip.getAttribute("data-value"));
    return;
  }
  var dock = event.target && event.target.closest ? event.target.closest(".dock-cell") : null;
  if (dock) {
    var anchor = dock.getAttribute("data-anchor");
    setControl("prop-anchor", anchor);
    document.querySelectorAll(".dock-cell").forEach(function (c) { c.classList.toggle("is-on", c === dock); });
    renderStudioPreview();
    markVisualDirty();
    syncPreview();
    return;
  }
  var hit = event.target && event.target.closest ? event.target.closest(".band-hit") : null;
  if (hit) {
    var band = hit.getAttribute("data-band");
    setControl("ticker-band", band);
    var bandEl = $("ticker-band-control");
    if (bandEl) bandEl.setAttribute("data-side", band);
    renderStudioPreview();
    markVisualDirty();
    syncPreview();
    return;
  }
  var randomBtn = event.target && event.target.closest ? event.target.closest("#ticker-speed-random") : null;
  if (randomBtn) {
    event.preventDefault();
    var next = randomBtn.getAttribute("aria-pressed") !== "true";
    randomBtn.setAttribute("aria-pressed", next ? "true" : "false");
    randomBtn.classList.toggle("is-on", next);
    var speed = $("ticker-speed");
    if (speed) speed.disabled = next;
    var speedVal = $("ticker-speed-val");
    if (speedVal) {
      speedVal.textContent = (speed && speed.value) || "400";
      speedVal.classList.toggle("is-muted", next);
    }
    renderStudioPreview();
    markVisualDirty();
    syncPreview();
    return;
  }
  var passBtn = event.target && event.target.closest ? event.target.closest("#ticker-click-through") : null;
  if (passBtn) {
    var passNext = passBtn.getAttribute("aria-pressed") !== "true";
    passBtn.setAttribute("aria-pressed", passNext ? "true" : "false");
    passBtn.classList.toggle("is-on", passNext);
    renderStudioPreview();
    markVisualDirty();
    syncPreview();
  }
}
if (window.__notificationHubStudioClick) document.removeEventListener("click", window.__notificationHubStudioClick);
window.__notificationHubStudioClick = studioClickHandler;
document.addEventListener("click", studioClickHandler);
function request(path, options) {
  options = options || {};
  var requestOptions = Object.assign({}, options);
  requestOptions.headers = Object.assign({ "Accept": "application/json" }, options.headers || {});
  if (options.body !== undefined && !requestOptions.headers["Content-Type"] && !requestOptions.headers["content-type"]) requestOptions.headers["Content-Type"] = "application/json";
  var api = window.hana && window.hana.api && typeof window.hana.api.fetch === "function" ? window.hana.api : null;
  try {
    if (api) return Promise.resolve(api.fetch(path, requestOptions));
    var current = new URL(window.location.href);
    var match = /^(.*\\/api\\/plugins\\/[^/]+)(?:\\/[^/]*)?$/.exec(current.pathname || "");
    if (!match) throw Object.assign(new Error("视觉页面缺少插件 API 路径"), { code: "VISUAL_PREVIEW_API_PATH_INVALID" });
    var url = new URL(match[1] + "/" + path, current.origin);
    ["pluginSurfaceSession", "token"].forEach(function (key) { var value = current.searchParams.get(key); if (value) url.searchParams.set(key, value); });
    return Promise.resolve(fetch(url.toString(), requestOptions));
  } catch (error) {
    return Promise.reject(error);
  }
}
function readJsonPayload(value) {
  if (value == null) return Promise.resolve({ ok: true, data: {} });
  if (typeof value === "string") {
    try { return Promise.resolve({ ok: true, data: JSON.parse(value) }); }
    catch (error) { return Promise.reject(Object.assign(new Error("视觉预览响应不是有效 JSON"), { code: "VISUAL_PREVIEW_RESPONSE_INVALID" })); }
  }
  if (typeof value.json === "function") {
    return Promise.resolve().then(function () { return value.json(); }).then(function (data) {
      return { ok: typeof value.ok === "boolean" ? value.ok : true, data: data };
    });
  }
  if (typeof value === "object") return Promise.resolve({ ok: value.ok !== false, data: value });
  return Promise.reject(Object.assign(new Error("视觉预览响应不是有效 JSON"), { code: "VISUAL_PREVIEW_RESPONSE_INVALID" }));
}
function json(path, options) {
  return Promise.resolve(request(path, options)).then(readJsonPayload).then(function (parsed) {
    var data = parsed.data || {};
    if (parsed.ok === false || data.ok === false) {
      var e = new Error((data.error && data.error.message) || "请求失败");
      e.code = (data.error && data.error.code) || "VISUAL_PREVIEW_REQUEST_FAILED";
      throw e;
    }
    return data;
  });
}
function feedback(id, text, kind) {
  var el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = "feedback" + (kind ? " " + kind : "");
}
function collect() {
  var p = state.profile || {};
  var categories = p.categories || {};
  var activeType = $("pipeline-type").value || "minimal";
  var value = function (id, fallback) {
    var el = $(id);
    return el && el.value !== undefined && el.value !== "" ? el.value : fallback;
  };
  var number = function (id, fallback) {
    var parsed = Number(value(id, fallback));
    return Number.isFinite(parsed) ? parsed : Number(fallback);
  };
  var integer = function (id, fallback, min, max) {
    var parsed = Math.round(number(id, fallback));
    if (!Number.isFinite(parsed)) parsed = Math.round(Number(fallback));
    if (min != null && parsed < min) parsed = min;
    if (max != null && parsed > max) parsed = max;
    return parsed;
  };
  var draft = {
    appearance: {
      size: value("prop-size", "medium"),
      width: integer("prop-width", 420, 240, 720),
      height: integer("prop-height", 220, 64, 360),
      backgroundColor: value("skin-bg-color", "#0e1916"),
      backgroundAssetId: value("skin-bg-asset", "") || null,
      backgroundFit: value("skin-bg-fit", "fill"),
      backgroundPadding: number("skin-bg-padding", 0),
      borderRadius: integer("prop-border-radius", 16, 0, 48),
      opacity: number("prop-opacity", 0.96)
    },
    properties: {
      space: {
        size: value("prop-size", "medium"),
        anchor: value("prop-anchor", "bottom-right"),
        gap: integer("prop-gap", 8, 0, 48),
        marginLeft: integer("prop-margin-left", 18, 0, 96),
        marginRight: integer("prop-margin-right", 18, 0, 96),
        marginTop: integer("prop-margin-top", 18, 0, 96),
        marginBottom: integer("prop-margin-bottom", 18, 0, 96),
        layout: value("prop-layout", "simple")
      },
      shape: { borderRadius: integer("prop-border-radius", 16, 0, 48), opacity: number("prop-opacity", 0.96), blur: 0, shadow: "none", borderWidth: 0, borderColor: "#0e1916" },
      typography: { titleLines: 1, bodyLines: 4, fontScale: 1, lineHeight: 1.55, textOverflow: "ellipsis" },
      lifecycle: { durationMs: number("prop-duration", 30000), enterDurationMs: 260, holdDurationMs: number("prop-hold-duration", 30000), exitDurationMs: 200 },
      interaction: { dismissMode: value("prop-dismiss-mode", "closeButton"), closeButtonPosition: "top-right", timeoutMs: number("prop-hold-duration", 30000), hoverPause: "off", expandable: "off", clickable: "off" },
      resource: { maxVisible: 0, maxActive: 0, maxParticles: 0, overflow: "allow" }
    },
    skin: {
      skinId: "skin.default",
      semanticColors: { title: "#F2FFF9", body: "#C5D8D0", assistantName: "#62D0A8", metadata: "#8EA69C", status: "#F1C77A" },
      background: { color: value("skin-bg-color", "#0e1916"), assetId: value("skin-bg-asset", "") || null, fit: value("skin-bg-fit", "fill"), padding: number("skin-bg-padding", 0) },
      decoration: { borderRadius: integer("prop-border-radius", 16, 0, 48), opacity: number("prop-opacity", 0.96), shadow: "none", borderWidth: 0, borderColor: "#0e1916", blur: 0, density: "standard" }
    },
    effects: {
      effectConfigId: "effect.visual",
      slots: {
        enter: { enabled: true, effectId: "fade", durationMs: 260, maxParticles: 0, assetId: null },
        idle: { enabled: false, effectId: "none", durationMs: 0, maxParticles: 0, assetId: null },
        exit: { enabled: true, effectId: "fade", durationMs: 200, maxParticles: 0, assetId: null },
        enterParticles: { enabled: true, effectId: "star", durationMs: 0, maxParticles: 18, assetId: null },
        idleParticles: { enabled: false, effectId: "none", durationMs: 0, maxParticles: 0, assetId: null },
        exitParticles: { enabled: true, effectId: "star", durationMs: 0, maxParticles: 18, assetId: null }
      }
    }
  };
  var types = Object.assign({}, p.card && p.card.types || {});
  types[activeType] = draft;
  var behaviorId = ($("pipeline-behavior") && $("pipeline-behavior").value) || p.behaviorId || "stack";
  var ticker = null;
  if (behaviorId === "ticker") {
    ticker = {
      speedPxPerSec: integer("ticker-speed", 400, 150, 800),
      band: value("ticker-band", "top"),
      trackCount: Math.max(0, integer("ticker-track-count", 3, 0)),
      bandRatio: Math.max(0.15, Math.min(1, (function () {
        var tracks = Math.max(0, Math.round(number("ticker-track-count", 3)));
        return tracks < 1 ? number("ticker-band-ratio", 28) / 100 : Math.round(tracks * 84 / 1080 * 100) / 100;
      })())),
      minGapPx: integer("ticker-min-gap", 64, 24, 160),
      trackGapPx: integer("ticker-track-gap", 8, 0, 48),
      speedRandom: !!($("ticker-speed-random") && $("ticker-speed-random").getAttribute && $("ticker-speed-random").getAttribute("aria-pressed") === "true"),
      clickThrough: !($("ticker-click-through") && $("ticker-click-through").getAttribute && $("ticker-click-through").getAttribute("aria-pressed") === "false"),
      hoverPause: (p.ticker && p.ticker.hoverPause) === true,
      overflow: (p.ticker && p.ticker.overflow) || "avoid"
    };
  }
  var defaultMode = value("global-visual-default-mode", (p.global && p.global.defaultMode) || "off");
  if (defaultMode === "minimal") defaultMode = "stack";
  var profile = {
    version: 2,
    global: {
      enabled: $("global-visual-enabled").checked,
      preset: (p.global && p.global.preset) || "minimal",
      intensity: (p.global && p.global.intensity) || "balanced",
      defaultMode: defaultMode
    },
    behaviorId: behaviorId,
    categories: categories,
    card: { activeType: activeType, types: types }
  };
  if (ticker) profile.ticker = ticker;
  return profile;
}
var previewOpen = false;
var previewTimer = null;
var previewBusy = false;
var previewPending = false;
var previewGeneration = 0;
function setPreviewState(text, kind) {
  var el = $("visual-preview-state");
  if (el) { el.textContent = text; el.className = "state-pill" + (kind ? " " + kind : ""); }
}
function renderPreviewConfirmation(result) {
  var el = $("visual-preview-confirmation");
  if (!el) return;
  var when = new Date().toLocaleTimeString();
  var action = result && result.recreated ? "已重建" : result && result.updated ? "已更新" : "已收到";
  el.textContent = "后端已确认 · " + action + " · 卡片 " + (result && result.cardId || "未知") + " · 指纹 " + (result && result.draftFingerprint || "未知") + " · " + when;
  el.className = "visual-preview-confirmation success";
}
function previewError(error) {
  var code = error && error.code || "VISUAL_PREVIEW_UPDATE_FAILED";
  var message = code + " · " + (error && error.message || "预览更新失败");
  setPreviewState("失败 · " + code, "error");
  feedback("visual-settings-feedback", message, "error");
  var confirmation = $("visual-preview-confirmation");
  if (confirmation) {
    confirmation.textContent = "后端未确认 · " + code;
    confirmation.className = "visual-preview-confirmation error";
  }
}
function schedulePreviewUpdate() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreviewUpdate, 0);
}
function runPreviewUpdate() {
  if (!previewOpen || previewBusy) return;
  previewBusy = true;
  previewPending = false;
  var generation = previewGeneration;
  setPreviewState("正在发送/更新");
  Promise.resolve(json("visual-preview/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: collect() }) })).then(function (result) {
    if (generation !== previewGeneration) return;
    renderPreviewConfirmation(result);
    setPreviewState(result.recreated ? "已重建" : "已更新 · " + new Date().toLocaleTimeString(), "success");
    loadVisualDiagnostics().catch(function () {});
  }).catch(function (error) {
    if (generation !== previewGeneration) return;
    previewError(error);
  }).finally(function () {
    previewBusy = false;
    if (previewPending && previewOpen) schedulePreviewUpdate();
  });
}
function syncPreview() {
  var pageStatus = $("visual-page-status");
  if (pageStatus) pageStatus.textContent = "未保存";
  previewPending = true;
  if (previewOpen) { setPreviewState("等待更新"); schedulePreviewUpdate(); }
  else setPreviewState("等待更新");
}
function applyGlobalVisualState() {
  var enabled = $("global-visual-enabled").checked;
  var label = document.querySelector(".visual-global-toggle span");
  if (label) label.textContent = enabled ? "开启全局视觉" : "关闭全局视觉";
}
function markVisualDirty() {
  var status = $("visual-page-status");
  if (status) status.textContent = "未保存";
}
function saveVisualSettings() {
  var save = $("visual-settings-save");
  var output = $("visual-settings-feedback");
  if (save) save.disabled = true;
  if (output) output.textContent = "正在保存视觉设置…";
  return Promise.resolve(json("visual-settings-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: collect() }) })).then(function (result) {
    state = result;
    var status = $("visual-page-status");
    if (status) status.textContent = "已保存";
    if (save) {
      save.textContent = "已保存";
      save.classList.add("is-saved");
      setTimeout(function () { save.textContent = "保存"; save.classList.remove("is-saved"); }, 1400);
    }
    if (output) { output.textContent = "视觉设置已保存"; output.className = "feedback success"; }
    applyGlobalVisualState();
    return result;
  }).catch(function (error) {
    if (output) { output.textContent = (error.code ? error.code + " · " : "") + error.message; output.className = "feedback error"; }
    throw error;
  }).finally(function () { if (save) save.disabled = false; });
}
var syncIds = ["global-visual-enabled", "global-visual-default-mode", "prop-size", "prop-anchor", "prop-margin-left", "prop-margin-right", "prop-margin-top", "prop-margin-bottom", "prop-gap", "prop-layout", "prop-width", "prop-height", "prop-border-radius", "prop-opacity", "prop-duration", "prop-hold-duration", "prop-dismiss-mode", "skin-bg-color", "skin-bg-asset", "skin-bg-fit", "skin-bg-padding", "pipeline-behavior", "pipeline-type", "ticker-speed", "ticker-band", "ticker-band-ratio", "ticker-track-count", "ticker-track-gap", "ticker-min-gap"];
var syncIdSet = {};
syncIds.forEach(function (id) { syncIdSet[id] = true; });
if (window.__notificationHubVisualDispose) window.__notificationHubVisualDispose();
function visualInputHandler(event) {
  var target = event && event.target;
  if (!target) return;
  if (target.id === "hold-seconds") {
    if (typeof syncStudioReadouts === "function") syncStudioReadouts(target);
    markVisualDirty();
    if (typeof renderStudioPreview === "function") renderStudioPreview();
    syncPreview();
    return;
  }
  if (!syncIdSet[target.id]) return;
  if (event.type === "change" && target.id === "pipeline-type" && typeof applyModeEditor === "function") applyModeEditor(target.value);
  if (target.id === "global-visual-enabled" && typeof applyGlobalVisualState === "function") applyGlobalVisualState();
  markVisualDirty();
  if (typeof syncStudioReadouts === "function") syncStudioReadouts(target);
  if (target.id !== "pipeline-type" && typeof updateStageCard === "function") updateStageCard();
  if (typeof renderStudioPreview === "function") renderStudioPreview();
  syncPreview();
}
window.__notificationHubVisualInputHandler = visualInputHandler;
window.__notificationHubVisualChangeHandler = visualInputHandler;
document.addEventListener("input", visualInputHandler);
document.addEventListener("change", visualInputHandler);
var previewButton = $("open-visual-preview");
if (typeof bindStageDrag === "function") bindStageDrag();
if (typeof applyGlobalVisualState === "function") applyGlobalVisualState();
if (typeof renderStudioPreview === "function") renderStudioPreview();
if (previewButton) previewButton.addEventListener("click", function () {
  var stateEl = $("visual-preview-state");
  if (previewOpen) {
    previewGeneration++;
    previewPending = false;
    previewOpen = false;
    if (previewTimer) clearTimeout(previewTimer);
    previewButton.disabled = true;
    if (stateEl) stateEl.textContent = "正在关闭";
    Promise.resolve(json("visual-preview/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })).then(function () {
      if (stateEl) stateEl.textContent = "已关闭";
      previewButton.textContent = "打开实时预览";
    }).catch(function (error) {
      if (stateEl) stateEl.textContent = "不可用";
      feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
    }).finally(function () { previewButton.disabled = false; });
    return;
  }
  var generation = previewGeneration;
  previewButton.disabled = true;
  setPreviewState("正在连接");
  Promise.resolve(json("visual-preview/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: collect() }) })).then(function (result) {
    if (generation !== previewGeneration) return;
    previewOpen = true;
    renderPreviewConfirmation(result);
    setPreviewState("已连接", "success");
    previewButton.textContent = "关闭实时预览";
    loadVisualDiagnostics().catch(function () {});
    if (previewPending) schedulePreviewUpdate();
  }).catch(function (error) {
    if (generation !== previewGeneration) return;
    previewError(error);
  }).finally(function () { previewButton.disabled = false; });
});
var clearCards = $("visual-clear-cards");
if (clearCards) clearCards.addEventListener("click", function () {
  clearCards.disabled = true;
  Promise.resolve(json("visual-clear-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })).then(function (result) {
    feedback("visual-settings-feedback", "已清除 " + (result.count || 0) + " 张视觉卡", "success");
    previewOpen = false;
    if (previewButton) previewButton.textContent = "打开实时预览";
    loadVisualDiagnostics().catch(function () {});
  }).catch(function (error) {
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
  }).finally(function () { clearCards.disabled = false; });
});
var tryOne = $("visual-try-one");
if (tryOne) tryOne.addEventListener("click", function () {
  tryOne.disabled = true;
  Promise.resolve(json("visual-try-one", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: collect() }) })).then(function (result) {
    feedback("visual-settings-feedback", "已试一条" + (result.behaviorId === "ticker" ? "弹幕" : "堆叠"), "success");
    loadVisualDiagnostics().catch(function () {});
  }).catch(function (error) {
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
  }).finally(function () { tryOne.disabled = false; });
});
var saveSettings = $("visual-settings-save");
if (saveSettings) saveSettings.addEventListener("click", function () { saveVisualSettings().catch(function () {}); });
var back = document.getElementById("back-settings");
if (back) back.addEventListener("click", function () {
  if (window.NotificationHubPageRouter) window.NotificationHubPageRouter.load("settings");
});
function visualViewBeforeUnload() {
  previewGeneration++;
  previewPending = false;
  previewOpen = false;
  if (previewTimer) clearTimeout(previewTimer);
  Promise.resolve(request("visual-preview/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })).catch(function () {});
}
window.addEventListener("notification-hub-view-before-unload", visualViewBeforeUnload);
window.__notificationHubVisualDispose = function () {
  if (window.__notificationHubStageDragDispose) window.__notificationHubStageDragDispose();
  document.removeEventListener("input", visualInputHandler);
  document.removeEventListener("change", visualInputHandler);
  window.removeEventListener("notification-hub-view-before-unload", visualViewBeforeUnload);
  document.removeEventListener("click", visualProfileClickHandler);
  document.removeEventListener("click", studioClickHandler);
  if (window.__notificationHubStudioClick === studioClickHandler) window.__notificationHubStudioClick = null;
};
var saveBtn = $("visual-profile-save");
var nameInput = $("visual-profile-name");
var conflictDialog = $("visual-conflict-dialog");
var conflictName = $("visual-conflict-name");
var conflictOverwrite = $("visual-conflict-overwrite");
var conflictCopy = $("visual-conflict-copy");
var conflictKeep = $("visual-conflict-keep");
var profileFeedback = $("visual-feedback");
var deleteDialog = $("visual-delete-dialog");
var deleteName = $("visual-delete-name");
var deleteEvents = $("visual-delete-events");
var deleteConfirm = $("visual-delete-confirm");
var deleteCancel = $("visual-delete-cancel");
var pendingSaveName = null;
var pendingSaveId = null;
var pendingDeleteId = null;
function slugify(text) {
  var value = String(text || "").trim().toLowerCase();
  var encoded = Array.from(value).map(function (char) { return /[a-z0-9._-]/.test(char) ? char : "u" + char.codePointAt(0).toString(16); }).join("-").replace(/^-+|-+$/g, "");
  return (encoded || "unnamed").slice(0, 80);
}
function sourceLabel(source) {
  return source === "local" ? "本地" : source === "import" ? "导入" : "内置";
}
function eventLabel(eventId) {
  var aliases = ${JSON.stringify(TEST_EVENT_ALIASES)};
  var id = aliases[eventId] || eventId;
  var fromState = (state.events || []).find(function (e) { return e.eventId === id || e.eventId === eventId; });
  if (fromState && fromState.label) return fromState.label;
  return id;
}
function renderProfileList(profiles) {
  var root = $("visual-profile-list");
  if (!root) return;
  var list = Array.isArray(profiles) ? profiles : [];
  if (!list.length) {
    root.innerHTML = '<div class="profile-list-empty">暂无已保存的配置包</div>';
    return;
  }
  root.innerHTML = '<div class="profile-list">' + list.map(function (p) {
    var refs = p.references && p.references.length ? '<span class="profile-refs">' + esc(p.references.length + " 个事件") + "</span>" : '<span class="profile-refs muted">未使用</span>';
    var canDelete = p.profileId !== "visual.default";
    var action = '<button type="button" class="secondary profile-export" data-profile-id="' + esc(p.profileId) + '" data-profile-name="' + esc(p.name) + '">导出</button>' + (canDelete ? '<button type="button" class="secondary profile-delete" data-profile-id="' + esc(p.profileId) + '" data-profile-name="' + esc(p.name) + '">删除</button>' : "");
    return '<div class="profile-list-item" data-profile-id="' + esc(p.profileId) + '"><span class="profile-list-name">' + esc(p.name) + '</span><span class="profile-list-meta">' + refs + '<span class="profile-source">' + esc(sourceLabel(p.source)) + "</span>" + action + "</span></div>";
  }).join("") + "</div>";
}
function renderApplyProfileOptions(profiles) {
  var sel = $("apply-visual-profile");
  if (!sel) return;
  var current = sel.value;
  var list = Array.isArray(profiles) ? profiles : [];
  sel.innerHTML = list.length
    ? list.map(function (p) { return '<option value="' + esc(p.profileId) + '">' + esc(p.name) + "</option>"; }).join("")
    : '<option value="">暂无可用的配置包</option>';
  if (current) sel.value = current;
}
function upsertProfileState(profile) {
  if (!profile || !profile.profileId) return;
  state.profiles = Array.isArray(state.profiles) ? state.profiles.slice() : [];
  var i = state.profiles.findIndex(function (p) { return p.profileId === profile.profileId; });
  if (i >= 0) state.profiles[i] = Object.assign({}, state.profiles[i], profile);
  else state.profiles.push(profile);
}
function refreshProfiles() {
  renderProfileList(state.profiles);
  renderApplyProfileOptions(state.profiles);
}
function saveProfile(name, profileId) {
  return Promise.resolve(json("visual-profiles/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profileId, name: name, profile: collect() }) })).then(function (result) {
    profileFeedback.textContent = "已保存：" + name;
    profileFeedback.className = "feedback success";
    if (result.profile) upsertProfileState(result.profile);
    else upsertProfileState({ profileId: profileId, name: name, source: "local", references: [] });
    refreshProfiles();
    if (conflictDialog) conflictDialog.style.display = "none";
    return result;
  }).catch(function (err) {
    profileFeedback.textContent = "保存失败：" + (err.code ? err.code + " · " : "") + err.message;
    profileFeedback.className = "feedback error";
    throw err;
  });
}
function exportSavedProfile(profileId, profileName, button) {
  if (!profileId) {
    profileFeedback.textContent = "请选择已保存的配置包后再导出";
    profileFeedback.className = "feedback error";
    return;
  }
  if (button) button.disabled = true;
  profileFeedback.textContent = "正在导出配置包…";
  Promise.resolve(json("visual-package-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileIds: [profileId], meta: { packageName: profileName || profileId } }) })).then(function (data) {
    profileFeedback.textContent = data.cancelled ? "已取消导出" : "配置包已导出：" + (data.savedFilename || "已完成");
    profileFeedback.className = data.cancelled ? "feedback" : "feedback success";
  }).catch(function (error) {
    profileFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    profileFeedback.className = "feedback error";
  }).finally(function () { if (button) button.disabled = false; });
}
function closeDeleteDialog() {
  pendingDeleteId = null;
  if (deleteDialog) deleteDialog.style.display = "none";
}
function openDeleteDialog(profile) {
  pendingDeleteId = profile.profileId;
  if (deleteName) deleteName.textContent = profile.name || profile.profileId;
  var refs = Array.isArray(profile.references) ? profile.references : [];
  if (deleteEvents) {
    deleteEvents.innerHTML = refs.length
      ? refs.map(function (eventId) { return "<li>" + esc(eventLabel(eventId)) + "</li>"; }).join("")
      : "<li>没有已绑定事件</li>";
  }
  if (deleteDialog) deleteDialog.style.display = "flex";
}
function confirmDeleteProfile() {
  if (!pendingDeleteId) return;
  var id = pendingDeleteId;
  Promise.resolve(json("visual-profiles/" + encodeURIComponent(id), { method: "DELETE" })).then(function () {
    state.profiles = (state.profiles || []).filter(function (p) { return p.profileId !== id; });
    refreshProfiles();
    loadBoundEvents().catch(function () {});
    profileFeedback.textContent = "配置包已删除";
    profileFeedback.className = "feedback success";
    closeDeleteDialog();
  }).catch(function (error) {
    profileFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    profileFeedback.className = "feedback error";
  });
}
function visualProfileClickHandler(event) {
  var exportButton = event.target && event.target.closest ? event.target.closest(".profile-export") : null;
  if (exportButton) {
    exportSavedProfile(exportButton.getAttribute("data-profile-id"), exportButton.getAttribute("data-profile-name"), exportButton);
    return;
  }
  var button = event.target && event.target.closest ? event.target.closest(".profile-delete") : null;
  if (!button) return;
  var id = button.getAttribute("data-profile-id");
  if (!id) return;
  var profile = (state.profiles || []).find(function (p) { return p.profileId === id; }) || { profileId: id, name: button.getAttribute("data-profile-name") || id, references: [] };
  openDeleteDialog(profile);
}
document.addEventListener("click", visualProfileClickHandler);
if (saveBtn) saveBtn.addEventListener("click", function () {
  var name = nameInput.value.trim();
  if (!name) {
    profileFeedback.textContent = "请输入配置包名称";
    profileFeedback.className = "feedback error";
    return;
  }
  var profileId = slugify(name);
  Promise.resolve(json("visual-profiles", { method: "GET" })).then(function (data) {
    var profiles = Array.isArray(data.profiles) ? data.profiles : [];
    var existing = profiles.find(function (p) { return p.profileId === profileId; });
    if (existing) {
      pendingSaveName = name;
      pendingSaveId = profileId;
      if (conflictName) conflictName.textContent = name;
      if (conflictDialog) conflictDialog.style.display = "flex";
      profileFeedback.textContent = "";
      profileFeedback.className = "feedback";
    } else {
      saveProfile(name, profileId);
    }
  }).catch(function (err) {
    profileFeedback.textContent = "获取配置包列表失败：" + err.message;
    profileFeedback.className = "feedback error";
  });
});
if (conflictOverwrite) conflictOverwrite.addEventListener("click", function () {
  if (pendingSaveName && pendingSaveId) saveProfile(pendingSaveName, pendingSaveId).catch(function () {});
});
if (conflictCopy) conflictCopy.addEventListener("click", function () {
  var name = pendingSaveName;
  var id = pendingSaveId;
  if (!name || !id) return;
  saveProfile(name + " 副本", id + "-copy").catch(function () {});
});
if (conflictKeep) conflictKeep.addEventListener("click", function () {
  if (conflictDialog) conflictDialog.style.display = "none";
  pendingSaveName = null;
  pendingSaveId = null;
  profileFeedback.textContent = "已取消保存";
  profileFeedback.className = "feedback";
});
if (deleteConfirm) deleteConfirm.addEventListener("click", confirmDeleteProfile);
if (deleteCancel) deleteCancel.addEventListener("click", closeDeleteDialog);
var testBtn = $("visual-test-send");
var testEvent = $("visual-test-event");
var testCount = $("visual-test-count");
var testInterval = $("visual-test-interval");
var testFeedback = $("visual-test-feedback");
if (testBtn) testBtn.addEventListener("click", function () {
  var eventId = testEvent ? testEvent.value : "";
  var count = Math.max(1, Math.min(50, Number(testCount.value) || 1));
  var interval = Math.max(0, Math.min(5000, Number(testInterval.value) || 0));
  if (!eventId) {
    testFeedback.textContent = "请选择已绑定事件。没绑定就先绑定。";
    testFeedback.className = "feedback error";
    return;
  }
  testBtn.disabled = true;
  testBtn.textContent = "运行中…";
  Promise.resolve(json("visual-test-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: eventId, count: count, intervalMs: interval }) })).then(function (result) {
    testFeedback.textContent = "已按绑定配置包生成 " + (result.generated || 0) + " 张真实卡片";
    testFeedback.className = "feedback success";
    loadVisualDiagnostics().catch(function () {});
  }).catch(function (err) {
    testFeedback.textContent = "测试失败：" + (err.code ? err.code + " · " : "") + err.message;
    testFeedback.className = "feedback error";
  }).finally(function () {
    testBtn.disabled = false;
    testBtn.textContent = "运行视觉实验";
  });
});
var applyProfile = $("apply-visual-profile");
var applyEvent = $("apply-event-select");
var applyBtn = $("apply-visual-btn");
var applyFeedback = $("apply-visual-feedback");
var applyBoundList = $("apply-bound-list");
function applyVisual() {
  var profileId = applyProfile ? applyProfile.value : "";
  var eventId = applyEvent ? applyEvent.value : "";
  if (!profileId || !eventId) {
    applyFeedback.textContent = "请选择配置包和事件";
    applyFeedback.className = "feedback error";
    return;
  }
  applyFeedback.textContent = "正在应用到事件…";
  applyFeedback.className = "feedback";
  return Promise.resolve(json("visual-profiles/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profileId, eventIds: [eventId] }) })).then(function (data) {
    applyFeedback.textContent = "已应用到事件：" + eventLabel(eventId);
    applyFeedback.className = "feedback success";
    loadBoundEvents().catch(function () {});
  }).catch(function (err) {
    applyFeedback.textContent = (err.code ? err.code + " · " : "") + (err.message || "应用失败");
    applyFeedback.className = "feedback error";
  });
}
function esc(s) {
  return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;");
}
function loadBoundEvents() {
  return Promise.resolve(json("custom-visual-events")).then(function (data) {
    var events = Array.isArray(data.events) ? data.events : [];
    var testSelect = $("visual-test-event");
    if (testSelect) {
      testSelect.innerHTML = events.length
        ? events.map(function (e) { return '<option value="' + esc(e.eventId) + '">' + esc(e.label || eventLabel(e.eventId)) + "</option>"; }).join("")
        : '<option value="">暂无已绑定事件，请先绑定</option>';
    }
    if (applyBoundList) {
      applyBoundList.style.display = events.length ? "grid" : "none";
      var items = applyBoundList.querySelector(".apply-bound-items");
      if (items) {
        items.innerHTML = events.length
          ? events.map(function (e) { return '<div class="apply-bound-item"><span class="bound-event">' + esc(e.label || eventLabel(e.eventId)) + '</span><span class="bound-profile">' + esc(e.visualProfileId || "") + "</span></div>"; }).join("")
          : "暂无已绑定事件";
      }
    }
  }).catch(function (error) {
    var message = (error.code ? error.code + " · " : "") + error.message;
    var testSelect = $("visual-test-event");
    if (testSelect) testSelect.innerHTML = '<option value="">读取绑定事件失败</option>';
    if (applyBoundList) {
      applyBoundList.style.display = "grid";
      var items = applyBoundList.querySelector(".apply-bound-items");
      if (items) items.textContent = message;
    }
    feedback("visual-test-feedback", message, "error");
    throw error;
  });
}
if (applyBtn) applyBtn.addEventListener("click", function () { applyVisual(); });
function diagnosticLevel(entry) {
  if (entry && (entry.level === "error" || entry.level === "warn" || entry.level === "ok")) return entry.level;
  return "ok";
}
function diagnosticDetails(entry) {
  var details = entry && entry.details && typeof entry.details === "object" ? entry.details : {};
  return ["eventId", "profileId", "cardId"].map(function (key) { return details[key] ? key + " " + details[key] : ""; }).filter(Boolean).join(" · ");
}
function renderVisualDiagnostics(data) {
  var root = $("visual-diagnostics-list");
  if (!root) return;
  var list = Array.isArray(data.visualDiagnostics) ? data.visualDiagnostics : [];
  var problems = list.filter(function (entry) { return diagnosticLevel(entry) !== "ok"; }).length;
  var summary = $("visual-diagnostics-summary");
  if (summary) summary.textContent = problems ? (problems + " 个问题") : "最近一次视觉操作";
  root.innerHTML = list.length
    ? list.slice(0, 12).map(function (entry) {
      var level = diagnosticLevel(entry);
      var extra = diagnosticDetails(entry);
      return '<div class="visual-diagnostic-row is-' + level + '"><div><strong>' + esc(entry.code || "VISUAL_OPERATION") + "</strong><span>" + esc(entry.stage || "visual") + " · " + esc(entry.message || "") + "</span>" + (extra ? '<span class="diag-details">' + esc(extra) + "</span>" : "") + "</div><time>" + esc(entry.timestamp || "") + "</time></div>";
    }).join("")
    : '<div class="empty-state">还没有视觉诊断记录。</div>';
}
function loadVisualDiagnostics() {
  return Promise.resolve(json("visual-diagnostics")).then(function (data) {
    renderVisualDiagnostics(data);
  }).catch(function (error) {
    var el = $("visual-diagnostics-feedback");
    if (el) { el.textContent = (error.code ? error.code + " · " : "") + error.message; el.className = "feedback error"; }
    throw error;
  });
}
var diagnosticFeedback = $("visual-diagnostics-feedback");
var showDiagnosticError = function (error) {
  if (diagnosticFeedback) {
    diagnosticFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    diagnosticFeedback.className = "feedback error";
  }
};
var refreshDiagnostics = $("refresh-visual-diagnostics");
if (refreshDiagnostics) refreshDiagnostics.addEventListener("click", function () {
  loadVisualDiagnostics().then(function () {
    if (diagnosticFeedback) { diagnosticFeedback.textContent = "视觉诊断已刷新"; diagnosticFeedback.className = "feedback success"; }
  }).catch(showDiagnosticError);
});
var clearDiagnostics = $("clear-visual-diagnostics");
if (clearDiagnostics) clearDiagnostics.addEventListener("click", function () {
  Promise.resolve(json("visual-diagnostics-clear", { method: "POST" })).then(function (data) {
    renderVisualDiagnostics(data);
    if (diagnosticFeedback) { diagnosticFeedback.textContent = "视觉诊断已清空"; diagnosticFeedback.className = "feedback success"; }
  }).catch(showDiagnosticError);
});
var exportDiagnostics = $("export-visual-diagnostics");
if (exportDiagnostics) exportDiagnostics.addEventListener("click", function () {
  Promise.resolve(json("visual-diagnostics-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })).then(function (data) {
    if (diagnosticFeedback) {
      diagnosticFeedback.textContent = data.cancelled ? "已取消导出" : "视觉诊断已导出";
      diagnosticFeedback.className = data.cancelled ? "feedback" : "feedback success";
    }
  }).catch(showDiagnosticError);
});
loadBoundEvents().catch(function () {});
loadVisualDiagnostics().catch(function () {});
`;
