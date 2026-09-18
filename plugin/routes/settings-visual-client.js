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
function setPressed(id, on) {
  var el = $(id);
  if (!el || !el.setAttribute) return;
  el.setAttribute("aria-pressed", on ? "true" : "false");
  if (el.classList) el.classList.toggle("is-on", !!on);
}
function tickerClickThroughOn() {
  var btn = $("ticker-click-through");
  return !(btn && btn.getAttribute && btn.getAttribute("aria-pressed") === "false");
}
function lockTickerHoverChip(id, locked) {
  var el = $(id);
  if (!el) return;
  if (el.classList) el.classList.toggle("is-locked", locked);
  el.setAttribute("aria-disabled", locked ? "true" : "false");
  if (locked) {
    el.setAttribute("title", "不挡点击开着时，弹幕吃不到鼠标。");
    el.setAttribute("aria-describedby", "ticker-hover-why");
    setPressed(id, false);
  } else {
    el.removeAttribute("title");
    el.removeAttribute("aria-describedby");
  }
}
function syncTickerHoverLock() {
  var why = $("ticker-hover-why");
  var locked = tickerClickThroughOn();
  lockTickerHoverChip("ticker-hover-highlight", locked);
  lockTickerHoverChip("ticker-hover-pause", locked);
  if (why) {
    if (locked) why.removeAttribute("hidden");
    else why.setAttribute("hidden", "");
  }
}
function dismissAnywhereOn() {
  return pressed("prop-dismiss-anywhere");
}
function holdDragIntentOn(btn) {
  if (!btn || !btn.getAttribute) return true;
  var intent = btn.getAttribute("data-intent");
  if (intent === "off") return false;
  if (intent === "on") return true;
  return btn.getAttribute("aria-pressed") !== "false";
}
function syncHoldDragLock() {
  var btn = $("prop-hold-drag");
  var why = $("hold-drag-why");
  if (!btn) return;
  var locked = dismissAnywhereOn();
  if (btn.classList) btn.classList.toggle("is-locked", locked);
  btn.setAttribute("aria-disabled", locked ? "true" : "false");
  if (locked) {
    btn.setAttribute("title", "任意点击关卡时，按住会当成点击，没法拖。");
    btn.setAttribute("aria-describedby", "hold-drag-why");
    setPressed("prop-hold-drag", false);
  } else {
    btn.removeAttribute("title");
    btn.removeAttribute("aria-describedby");
    setPressed("prop-hold-drag", holdDragIntentOn(btn));
  }
  if (why) {
    if (locked) why.removeAttribute("hidden");
    else why.setAttribute("hidden", "");
  }
}
function studioErrorText(error) {
  var code = error && error.code;
  if (code === "LAYOUT_BEHAVIOR_CHANNEL_OUT_OF_BOUNDS" || code === "LAYOUT_CARD_OUT_OF_BOUNDS") {
    return error.message || "堆叠已经满了，这张卡放不下。";
  }
  return (code ? code + " · " : "") + (error && error.message || "");
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
var PART_PAINT_DEFAULTS = { title: { fill: "#f2fff9", stroke: "#62d0a8" }, body: { fill: "#c5d8d0", stroke: "#62d0a8" }, close: { fill: "#1d2b27", stroke: "#62d0a8" }, icon: { fill: "#1d2b27", stroke: "#62d0a8" }, assistantName: { fill: "#62d0a8", stroke: "#62d0a8" } };
function isTextPart(id) { return id === "title" || id === "body" || id === "assistantName"; }
function isContentSourcePart(id) { return id === "title" || id === "body"; }
function isFitWidthPart(id) { return id === "title" || id === "assistantName"; }
function isShowablePart(id) { return id === "title" || id === "body" || id === "icon" || id === "assistantName"; }
function isSelectablePart(id) { return id === "root" || id === "title" || id === "body" || id === "close" || id === "icon" || id === "assistantName"; }
function selectedPart() {
  var on = document.querySelector("#part-chip-row [data-part].is-on");
  return (on && on.getAttribute("data-part")) || "root";
}
function rememberedSelectedPart() {
  var id = window.__notificationHubSelectedPart;
  if (!isSelectablePart(id)) {
    try { id = sessionStorage.getItem("nh-visual-selected-part"); } catch (error) { id = ""; }
  }
  if (isSelectablePart(id)) return id;
  return "";
}
function rememberSelectedPart(id) {
  if (!isSelectablePart(id)) return;
  window.__notificationHubSelectedPart = id;
  try { sessionStorage.setItem("nh-visual-selected-part", id); } catch (error) {}
}
function setPartHidden(id, paint) {
  paint = paint || {};
  setControl("part-" + id + "-fill", paint.fill || "");
  setControl("part-" + id + "-background", paint.background || "");
  setControl("part-" + id + "-opacity", typeof paint.opacity === "number" ? paint.opacity : "");
  setControl("part-" + id + "-stroke", paint.stroke || "");
  setControl("part-" + id + "-stroke-width", paint.strokeWidth == null ? 0 : paint.strokeWidth);
  setControl("part-" + id + "-stroke-paint", paint.strokePaint === "gradient" ? "gradient" : "");
  if (id === "close") {
    setControl("part-close-icon", paint.closeIcon || "");
    setControl("part-close-icon-color", paint.closeIconColor || "");
  }
  setControl("part-" + id + "-x", Number.isInteger(paint.x) ? paint.x : "");
  setControl("part-" + id + "-y", Number.isInteger(paint.y) ? paint.y : "");
  setControl("part-" + id + "-w", Number.isInteger(paint.w) && paint.w > 0 ? paint.w : "");
  setControl("part-" + id + "-h", Number.isInteger(paint.h) && paint.h > 0 ? paint.h : "");
  setControl("part-" + id + "-radius", Number.isInteger(paint.radius) ? paint.radius : "");
  if (id === "title" || id === "body") {
    setControl("part-" + id + "-show", paint.show === false ? "false" : "");
    setControl("part-" + id + "-content-source", paint.contentSource === "custom" ? "custom" : "");
    setControl("part-" + id + "-custom-text", typeof paint.customText === "string" ? paint.customText : "");
  }
  if (id === "icon" || id === "assistantName") {
    setControl("part-" + id + "-show", paint.show === true ? "true" : "false");
  }
  if (id === "icon") {
    setControl("part-icon-source", paint.source === "custom" ? "custom" : "assistant");
    setControl("part-icon-asset-id", paint.assetId || "");
    setControl("part-icon-bg-scale", Number.isFinite(Number(paint.backgroundScale)) ? paint.backgroundScale : 1);
    setControl("part-icon-bg-x", Number.isFinite(Number(paint.backgroundX)) ? paint.backgroundX : 0.5);
    setControl("part-icon-bg-y", Number.isFinite(Number(paint.backgroundY)) ? paint.backgroundY : 0.5);
  }
  if (id !== "icon") {
    setControl("part-" + id + "-bg-asset", paint.backgroundAssetId || "");
    setControl("part-" + id + "-bg-scale", Number.isFinite(Number(paint.backgroundScale)) ? paint.backgroundScale : 1);
    setControl("part-" + id + "-bg-x", Number.isFinite(Number(paint.backgroundX)) ? paint.backgroundX : 0.5);
    setControl("part-" + id + "-bg-y", Number.isFinite(Number(paint.backgroundY)) ? paint.backgroundY : 0.5);
  }
  if (isFitWidthPart(id)) {
    setControl("part-" + id + "-fit-width", paint.fitWidth === true ? "true" : "");
    setControl("part-" + id + "-fit-compensate", paint.fitCompensate === true ? "true" : "");
  }
  if (isTextPart(id)) {
    setControl("part-" + id + "-font-size", Number.isInteger(paint.fontSize) ? paint.fontSize : "");
    setControl("part-" + id + "-font-family", paint.fontAssetId ? ("font:" + paint.fontAssetId) : (paint.fontFamily || ""));
    setControl("part-" + id + "-text-paint", paint.textPaint === "rainbow" ? "rainbow" : "");
    setControl("part-" + id + "-font-bold", paint.fontBold === true ? "true" : (paint.fontBold === false ? "false" : ""));
    setControl("part-" + id + "-font-italic", paint.fontItalic === true ? "true" : "");
    setControl("part-" + id + "-font-underline", paint.fontUnderline === true ? "true" : "");
    setControl("part-" + id + "-font-strike", paint.fontStrike === true ? "true" : "");
    setControl("part-" + id + "-text-stroke", paint.textStroke === true ? "true" : "");
    setControl("part-" + id + "-text-stroke-color", paint.textStrokeColor || "");
    setControl("part-" + id + "-text-stroke-width", Number.isInteger(paint.textStrokeWidth) ? paint.textStrokeWidth : "");
    setControl("part-" + id + "-text-stroke-paint", paint.textStrokePaint === "rainbow" ? "rainbow" : "");
  }
}
function readGlossary() {
  var el = $("glossary-json");
  if (!el || !el.value) return {};
  try {
    var parsed = JSON.parse(el.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) { return {}; }
}
function writeGlossary(map) {
  var next = {};
  Object.keys(map || {}).forEach(function (name) {
    var n = String(name || "").trim();
    var hex = map[name];
    if (!n || n.charAt(0) === "#" || n.length > 12) return;
    if (typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex)) next[n] = hex;
  });
  var keys = Object.keys(next);
  if (keys.length > 8) keys.slice(8).forEach(function (name) { delete next[name]; });
  setControl("glossary-json", JSON.stringify(next));
  var empty = $("glossary-empty");
  if (empty) empty.hidden = Object.keys(next).length > 0;
  var add = $("glossary-add");
  if (add) {
    var full = Object.keys(next).length >= 8;
    add.setAttribute("aria-disabled", full ? "true" : "false");
    add.classList.toggle("is-locked", full);
  }
  return next;
}
function resolvePaintColor(value) {
  if (!value) return "";
  if (value.charAt(0) === "#") return value;
  return readGlossary()[value] || "";
}
function attrEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function renderNameChips() {
  var names = Object.keys(readGlossary());
  var id = selectedPart();
  ["fill", "stroke", "textStroke"].forEach(function (kind) {
    var target = paintNameTarget(kind);
    var row = $(target.row);
    if (!row) return;
    if (kind === "textStroke" && !isTextPart(id)) {
      row.hidden = true;
      row.innerHTML = "";
      return;
    }
    row.hidden = names.length === 0;
    var stored = id && id !== "root" ? ($("part-" + id + "-" + target.hidden) && $("part-" + id + "-" + target.hidden).value) : "";
    var ownOn = !stored || stored.charAt(0) === "#";
    row.innerHTML = '<button type="button" class="chip' + (ownOn ? " is-on" : "") + '" data-paint-name="" data-paint-kind="' + kind + '">自己的色</button>'
      + names.map(function (name) {
        return '<button type="button" class="chip' + (stored === name ? " is-on" : "") + '" data-paint-name="' + attrEscape(name) + '" data-paint-kind="' + kind + '">' + attrEscape(name) + '</button>';
      }).join("");
  });
}
function renderGlossaryRows() {
  var rows = $("glossary-rows");
  if (!rows) return;
  var map = writeGlossary(readGlossary());
  var names = Object.keys(map);
  rows.innerHTML = names.map(function (name) {
    return '<div class="glossary-row" data-name="' + attrEscape(name) + '">'
      + '<input class="glossary-name" type="text" maxlength="12" value="' + attrEscape(name) + '" aria-label="名字">'
      + '<input class="glossary-color" type="color" value="' + map[name] + '" aria-label="' + attrEscape(name) + '的颜色">'
      + '<button type="button" class="chip glossary-del" data-glossary-del="' + attrEscape(name) + '">删</button>'
      + '</div>';
  }).join("");
  var empty = $("glossary-empty");
  if (empty) empty.hidden = names.length > 0;
  renderNameChips();
}
function remapPartPaintNames(renamed, map) {
  ["title", "body", "close", "icon", "assistantName"].forEach(function (id) {
    ["fill", "stroke", "text-stroke-color"].forEach(function (kind) {
      var el = $("part-" + id + "-" + kind);
      if (!el || !el.value) return;
      if (renamed[el.value]) el.value = renamed[el.value];
      else if (el.value.charAt(0) !== "#" && !(el.value in map)) el.value = "";
    });
  });
}
function syncGlossaryFromRows() {
  var rows = document.querySelectorAll(".glossary-row");
  var map = {};
  var renamed = {};
  rows.forEach(function (row) {
    var nameEl = row.querySelector(".glossary-name");
    var colorEl = row.querySelector(".glossary-color");
    var prev = row.getAttribute("data-name") || "";
    var name = nameEl && nameEl.value ? nameEl.value.trim() : "";
    var color = colorEl && colorEl.value ? colorEl.value : "";
    if (!name || name.charAt(0) === "#" || name.length > 12) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    if (!(name in map)) map[name] = color;
    if (prev && name && prev !== name) renamed[prev] = name;
    row.setAttribute("data-name", name);
    var del = row.querySelector("[data-glossary-del]");
    if (del) del.setAttribute("data-glossary-del", name);
  });
  remapPartPaintNames(renamed, map);
  writeGlossary(map);
  renderNameChips();
}
function nextGlossaryName(map) {
  var i = 1;
  while (map["色" + i]) i += 1;
  return "色" + i;
}
function addGlossaryName() {
  var map = readGlossary();
  if (Object.keys(map).length >= 8) return;
  map[nextGlossaryName(map)] = "#62d0a8";
  writeGlossary(map);
  renderGlossaryRows();
}
function deleteGlossaryName(name) {
  var map = readGlossary();
  delete map[name];
  remapPartPaintNames({}, map);
  writeGlossary(map);
  renderGlossaryRows();
  if (selectedPart() !== "root") selectPart(selectedPart());
}
function paintNameTarget(kind) {
  if (kind === "textStroke") return { hidden: "text-stroke-color", picker: "part-paint-text-stroke-color", row: "part-text-stroke-names" };
  return { hidden: kind, picker: "part-paint-" + kind, row: "part-" + kind + "-names" };
}
function selectedPaintName(kind) {
  var target = paintNameTarget(kind);
  var on = document.querySelector("#" + target.row + " [data-paint-name].is-on");
  return on ? (on.getAttribute("data-paint-name") || "") : "";
}
function bindPaintName(kind, name) {
  var id = selectedPart();
  if (!id || id === "root") return;
  var target = paintNameTarget(kind);
  if (name) {
    setControl("part-" + id + "-" + target.hidden, name);
    var hex = readGlossary()[name];
    if (hex) setControl(target.picker, hex);
  } else {
    var picker = $(target.picker);
    setControl("part-" + id + "-" + target.hidden, picker && picker.value ? picker.value : "");
  }
  renderNameChips();
}
function writeSelectedPartPaint() {
  var id = selectedPart();
  if (!id || id === "root") return;
  var fill = isTextPart(id) ? $("part-paint-fill") : $("part-paint-fill-box");
  var stroke = $("part-paint-stroke");
  var width = $("part-paint-stroke-width");
  var glossary = readGlossary();
  var fillName = isTextPart(id) ? selectedPaintName("fill") : "";
  var strokeName = selectedPaintName("stroke");
  if (fillName) {
    if (fill && fill.value) glossary[fillName] = fill.value;
    setControl("part-" + id + "-fill", fillName);
  } else {
    setControl("part-" + id + "-fill", fill && fill.value ? fill.value : "");
  }
  if (strokeName) {
    if (stroke && stroke.value) glossary[strokeName] = stroke.value;
    setControl("part-" + id + "-stroke", strokeName);
  } else {
    setControl("part-" + id + "-stroke", stroke && stroke.value ? stroke.value : "");
  }
  setControl("part-" + id + "-stroke-width", width && width.value ? width.value : 0);
  if (isTextPart(id)) {
    var bgOn = typeof pressed === "function" && pressed("part-paint-background-on");
    var bgEl = $("part-paint-background");
    setControl("part-" + id + "-background", bgOn && bgEl && bgEl.value ? bgEl.value : "");
  }
  var opacityEl = $("part-paint-opacity");
  if (opacityEl && opacityEl.value !== "") {
    var opacity = Number(opacityEl.value);
    if (Number.isFinite(opacity)) setControl("part-" + id + "-opacity", Math.max(0, Math.min(1, opacity)));
  }
  if (id !== "icon") {
    var bgAssetEl = $("part-paint-bg-asset");
    if (bgAssetEl) setControl("part-" + id + "-bg-asset", bgAssetEl.value || "");
  }
  if (isTextPart(id) && typeof pressed === "function") {
    setControl("part-" + id + "-text-stroke", pressed("part-paint-text-stroke") ? "true" : "");
    var textStrokeColorEl = $("part-paint-text-stroke-color");
    var textStrokeName = selectedPaintName("textStroke");
    if (pressed("part-paint-text-stroke")) {
      if (textStrokeName) {
        if (textStrokeColorEl && textStrokeColorEl.value) glossary[textStrokeName] = textStrokeColorEl.value;
        setControl("part-" + id + "-text-stroke-color", textStrokeName);
      } else if (textStrokeColorEl && textStrokeColorEl.value) {
        setControl("part-" + id + "-text-stroke-color", textStrokeColorEl.value);
      }
    }
    var textStrokeWidthEl = $("part-paint-text-stroke-width");
    if (pressed("part-paint-text-stroke") && textStrokeWidthEl && textStrokeWidthEl.value !== "") {
      setControl("part-" + id + "-text-stroke-width", textStrokeWidthEl.value);
    }
    setControl("part-" + id + "-text-stroke-paint", pressed("part-paint-text-stroke") && pressed("part-paint-text-stroke-rainbow") ? "rainbow" : "");
  }
  if (typeof pressed === "function") {
    setControl("part-" + id + "-stroke-paint", pressed("part-paint-stroke-paint") ? "gradient" : "");
  }
  if (id === "close") {
    var closeColorEl = $("part-paint-close-icon-color");
    if (closeColorEl && /^#[0-9a-fA-F]{6}$/.test(closeColorEl.value)) setControl("part-close-icon-color", closeColorEl.value);
  }
  writeGlossary(glossary);
  document.querySelectorAll(".glossary-row").forEach(function (row) {
    var name = row.getAttribute("data-name");
    var colorEl = row.querySelector(".glossary-color");
    if (colorEl && glossary[name]) colorEl.value = glossary[name];
  });
}
function writeSelectedPartAxis(axis) {
  var id = selectedPart();
  if (!id || id === "root") return;
  var bounds = { x: [0, 1920], y: [0, 1080], w: [1, 1920], h: [1, 1080], radius: [0, 240] };
  var range = bounds[axis];
  var el = $("part-paint-" + axis);
  if (!range || !el) return;
  if (el.value === "") {
    setControl("part-" + id + "-" + axis, "");
    return;
  }
  var n = Math.round(Number(el.value));
  if (!Number.isFinite(n)) return;
  setControl("part-" + id + "-" + axis, Math.max(range[0], Math.min(range[1], n)));
}
function closePartEnabled() {
  var behavior = ($("pipeline-behavior") && $("pipeline-behavior").value) || "stack";
  if (behavior === "ticker") return false;
  var closeChip = $("prop-dismiss-close");
  if (closeChip && closeChip.getAttribute) return closeChip.getAttribute("aria-pressed") === "true";
  var mode = $("prop-dismiss-mode") && $("prop-dismiss-mode").value;
  return !mode || mode === "closeButton" || mode === "buttonOnly";
}
function setDismissChips(mode, autoOn) {
  var clickMode = mode === "anywhere" ? "anywhere" : "closeButton";
  setControl("prop-dismiss-mode", clickMode);
  setPressed("prop-dismiss-close", clickMode === "closeButton");
  setPressed("prop-dismiss-anywhere", clickMode === "anywhere");
  if (autoOn !== undefined) setPressed("prop-dismiss-auto", !!autoOn);
  syncClosePartVisibility();
  syncHoldDragLock();
}
function syncClosePartVisibility() {
  var on = closePartEnabled();
  var studio = document.querySelector(".studio");
  if (studio) studio.setAttribute("data-close", on ? "on" : "off");
  var chip = document.querySelector("#part-chip-row [data-part=close]");
  if (chip) {
    if (on) chip.removeAttribute("hidden");
    else chip.setAttribute("hidden", "");
  }
  if (!on && selectedPart() === "close") selectPart("root");
}
function partShown(id) {
  if (id === "icon" || id === "assistantName") {
    var extra = $("part-" + id + "-show");
    return !!(extra && extra.value === "true");
  }
  if (id !== "title" && id !== "body") return true;
  var titleEl = $("part-title-show");
  var bodyEl = $("part-body-show");
  var titleOn = !(titleEl && titleEl.value === "false");
  var bodyOn = !(bodyEl && bodyEl.value === "false");
  if (!titleOn && !bodyOn) titleOn = true;
  return id === "title" ? titleOn : bodyOn;
}
function syncPartChipOffState() {
  document.querySelectorAll("#part-chip-row [data-part]").forEach(function (chip) {
    var partId = chip.getAttribute("data-part");
    if (isShowablePart(partId)) chip.classList.toggle("is-off", !partShown(partId));
  });
}
function fontFamilyCss(id) {
  if (id && String(id).indexOf("font:") === 0) return '"nh-font-' + String(id).slice(5) + '"';
  if (id === "heiti") return "SimHei,sans-serif";
  if (id === "songti") return "SimSun,serif";
  if (id === "segoe") return "'Segoe UI',sans-serif";
  return "'Microsoft YaHei','Segoe UI',sans-serif";
}
var fontFaceCache = {};
function ensureStudioFont(assetId) {
  if (!assetId || Object.prototype.hasOwnProperty.call(fontFaceCache, assetId)) return;
  fontFaceCache[assetId] = true;
  json("font-assets/" + encodeURIComponent(assetId) + "/file").then(function (data) {
    if (!data || !data.dataUrl) return;
    var style = document.createElement("style");
    style.textContent = '@font-face{font-family:"nh-font-' + assetId + '";src:url("' + data.dataUrl + '");}';
    document.head.appendChild(style);
  }).catch(function () {});
}
function appendFontOption(asset) {
  var sel = $("part-paint-font-family");
  if (!sel || !asset || !asset.assetId) return;
  var value = "font:" + asset.assetId;
  if ([].some.call(sel.options, function (opt) { return opt.value === value; })) return;
  var opt = document.createElement("option");
  opt.value = value;
  opt.textContent = asset.name || asset.assetId;
  sel.appendChild(opt);
}
function importFontAsset() {
  json("font-assets/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (result) {
    if (!result || result.cancelled || !result.asset) return;
    appendFontOption(result.asset);
    var id = selectedPart();
    if (isTextPart(id)) {
      setControl("part-paint-font-family", "font:" + result.asset.assetId);
      setControl("part-" + id + "-font-family", "font:" + result.asset.assetId);
    }
    markVisualDirty();
    syncPreview();
  }).catch(function (error) {
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
  });
}
function hashText(value) {
  var h = 2166136261;
  var s = String(value || "");
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function hueCss(seed, index) {
  var hue = ((seed / 4294967296) + index * 0.61803398875) % 1;
  if (hue < 0) hue += 1;
  var sector = hue * 6;
  var bucket = Math.floor(sector);
  var f = sector - bucket;
  var q = 1 - f;
  var r = 1, g = 1, b = 1;
  switch (bucket % 6) {
    case 0: r = 1; g = f; b = 0; break;
    case 1: r = q; g = 1; b = 0; break;
    case 2: r = 0; g = 1; b = f; break;
    case 3: r = 0; g = q; b = 1; break;
    case 4: r = f; g = 0; b = 1; break;
    default: r = 1; g = 0; b = q; break;
  }
  return "rgb(" + Math.round(r * 255) + "," + Math.round(g * 255) + "," + Math.round(b * 255) + ")";
}
function syncTextPaintUi(id) {
  var text = isTextPart(id);
  var row = $("part-text-fields");
  if (row) {
    if (text) row.removeAttribute("hidden");
    else row.setAttribute("hidden", "");
  }
  var rainbow = text && ($("part-" + id + "-text-paint") && $("part-" + id + "-text-paint").value === "rainbow");
  setPressed("part-paint-rainbow", rainbow);
  var fill = $("part-paint-fill");
  if (fill) fill.disabled = !!rainbow;
  if (!text) return;
  var boldEl = $("part-" + id + "-font-bold");
  var italicEl = $("part-" + id + "-font-italic");
  var underlineEl = $("part-" + id + "-font-underline");
  var strikeEl = $("part-" + id + "-font-strike");
  setPressed("part-paint-font-bold", id === "title" ? !(boldEl && boldEl.value === "false") : !!(boldEl && boldEl.value === "true"));
  setPressed("part-paint-font-italic", !!(italicEl && italicEl.value === "true"));
  setPressed("part-paint-font-underline", !!(underlineEl && underlineEl.value === "true"));
  setPressed("part-paint-font-strike", !!(strikeEl && strikeEl.value === "true"));
  if (typeof syncTextStrokeUi === "function") syncTextStrokeUi(id);
}
function syncTextStrokeUi(id) {
  var text = isTextPart(id);
  var hid = $("part-" + id + "-text-stroke");
  var on = !!(text && hid && hid.value === "true");
  var rainbowHid = $("part-" + id + "-text-stroke-paint");
  var rainbow = !!(on && rainbowHid && rainbowHid.value === "rainbow");
  setPressed("part-paint-text-stroke", on);
  setPressed("part-paint-text-stroke-rainbow", rainbow);
  setElHidden($("part-paint-text-stroke-rainbow"), !on);
  setElHidden($("part-text-stroke-color-field"), !(on && !rainbow));
  setElHidden($("part-text-stroke-width-field"), !on);
  if (!on) return;
  var colorHid = $("part-" + id + "-text-stroke-color");
  var hex = colorHid && /^#[0-9a-fA-F]{6}$/.test(colorHid.value) ? colorHid.value : "#0a0d0d";
  setControl("part-paint-text-stroke-color", hex);
  var widthHid = $("part-" + id + "-text-stroke-width");
  var width = widthHid && widthHid.value !== "" ? Math.round(Number(widthHid.value)) : 2;
  if (!Number.isFinite(width) || width < 1) width = 2;
  if (width > 16) width = 16;
  setControl("part-paint-text-stroke-width", width);
}
function toggleSelectedTextStroke() {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  var hidden = $("part-" + id + "-text-stroke");
  if (!hidden) return;
  var on = hidden.value === "true";
  hidden.value = on ? "" : "true";
  if (!on) {
    var colorHidden = $("part-" + id + "-text-stroke-color");
    var colorEl = $("part-paint-text-stroke-color");
    var hex = colorHidden && /^#[0-9a-fA-F]{6}$/.test(colorHidden.value)
      ? colorHidden.value
      : (colorEl && /^#[0-9a-fA-F]{6}$/.test(colorEl.value) ? colorEl.value : "#0a0d0d");
    if (colorHidden) colorHidden.value = hex;
    if (colorEl) colorEl.value = hex;
    var widthHidden = $("part-" + id + "-text-stroke-width");
    var widthEl = $("part-paint-text-stroke-width");
    if (widthHidden && (!widthHidden.value || widthHidden.value === "")) widthHidden.value = "2";
    if (widthEl && (!widthEl.value || widthEl.value === "")) widthEl.value = "2";
  } else {
    setControl("part-" + id + "-text-stroke-paint", "");
  }
  syncTextStrokeUi(id);
}
function toggleSelectedTextStrokePaint() {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  var strokeHid = $("part-" + id + "-text-stroke");
  if (!strokeHid || strokeHid.value !== "true") return;
  var hidden = $("part-" + id + "-text-stroke-paint");
  if (!hidden) return;
  hidden.value = hidden.value === "rainbow" ? "" : "rainbow";
  syncTextStrokeUi(id);
}
function syncStrokePaintUi(id) {
  if (id === "root") {
    setPressed("prop-border-paint", pressed("prop-border-paint"));
    return;
  }
  var hid = $("part-" + id + "-stroke-paint");
  setPressed("part-paint-stroke-paint", !!(hid && hid.value === "gradient"));
}
function toggleSelectedStrokePaint() {
  var id = selectedPart();
  if (!id || id === "root") return;
  var hidden = $("part-" + id + "-stroke-paint");
  if (!hidden) return;
  hidden.value = hidden.value === "gradient" ? "" : "gradient";
  syncStrokePaintUi(id);
}
function toggleRootBorderPaint() {
  var chip = $("prop-border-paint");
  if (!chip) return;
  setPressed("prop-border-paint", !pressed("prop-border-paint"));
}
function syncCloseIconUi() {
  var group = $("part-close-icon-group");
  var on = selectedPart() === "close";
  setElHidden(group, !on);
  if (!on) return;
  var hid = $("part-close-icon");
  var current = hid && hid.value ? hid.value : "x";
  document.querySelectorAll("[data-close-icon]").forEach(function (chip) {
    var match = chip.getAttribute("data-close-icon") === current;
    chip.classList.toggle("is-on", match);
    chip.setAttribute("aria-pressed", match ? "true" : "false");
  });
  var colorHid = $("part-close-icon-color");
  var hex = colorHid && /^#[0-9a-fA-F]{6}$/.test(colorHid.value) ? colorHid.value : "#d1e0e0";
  setControl("part-paint-close-icon-color", hex);
}
function setCloseIcon(kind) {
  var allowed = { none: true, x: true, circle: true, minus: true, star: true, plus: true, disc: true };
  if (!allowed[kind]) return;
  setControl("part-close-icon", kind === "x" ? "" : kind);
  syncCloseIconUi();
}
function syncFitWidthUi(id) {
  var canFit = isFitWidthPart(id);
  var field = $("part-fit-width-field");
  if (field) {
    if (canFit) field.removeAttribute("hidden");
    else field.setAttribute("hidden", "");
  }
  var on = canFit && $("part-" + id + "-fit-width") && $("part-" + id + "-fit-width").value === "true";
  setPressed("part-paint-fit-width", on);
  var compensateOn = canFit && $("part-" + id + "-fit-compensate") && $("part-" + id + "-fit-compensate").value === "true";
  setPressed("part-paint-fit-compensate", compensateOn);
  var compensateChip = $("part-paint-fit-compensate");
  if (compensateChip) {
    compensateChip.classList.toggle("is-locked", !on);
    if (on) compensateChip.removeAttribute("aria-disabled");
    else compensateChip.setAttribute("aria-disabled", "true");
  }
  var widthEl = $("part-paint-w");
  if (widthEl) widthEl.disabled = !!on;
}
function toggleSelectedFitWidth() {
  var id = selectedPart();
  if (!isFitWidthPart(id)) return;
  var hidden = $("part-" + id + "-fit-width");
  if (!hidden) return;
  hidden.value = hidden.value === "true" ? "" : "true";
  syncFitWidthUi(id);
}
function toggleSelectedFitCompensate() {
  var id = selectedPart();
  if (!isFitWidthPart(id)) return;
  var fit = $("part-" + id + "-fit-width");
  if (!fit || fit.value !== "true") return;
  var hidden = $("part-" + id + "-fit-compensate");
  if (!hidden) return;
  hidden.value = hidden.value === "true" ? "" : "true";
  syncFitWidthUi(id);
}
function toggleSelectedTextPaint() {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  var hidden = $("part-" + id + "-text-paint");
  if (!hidden) return;
  hidden.value = hidden.value === "rainbow" ? "" : "rainbow";
  syncTextPaintUi(id);
}
function toggleSelectedTextStyle(kind) {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  if (kind !== "bold" && kind !== "italic" && kind !== "underline" && kind !== "strike") return;
  var hidden = $("part-" + id + "-font-" + kind);
  if (!hidden) return;
  var on = kind === "bold"
    ? (id === "title" ? hidden.value !== "false" : hidden.value === "true")
    : hidden.value === "true";
  hidden.value = on ? "false" : "true";
  if (kind !== "bold" && hidden.value === "false") hidden.value = "";
  syncTextPaintUi(id);
}
function writeSelectedPartFont() {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  var sizeEl = $("part-paint-font-size");
  var familyEl = $("part-paint-font-family");
  if (sizeEl && sizeEl.value !== "") {
    var n = Math.round(Number(sizeEl.value));
    if (Number.isFinite(n)) setControl("part-" + id + "-font-size", Math.max(8, Math.min(72, n)));
  }
  if (familyEl && familyEl.value) setControl("part-" + id + "-font-family", familyEl.value);
}
function syncPartShowChip(id) {
  var row = $("part-show-row");
  var chip = $("part-show");
  var showable = isShowablePart(id);
  if (row) {
    if (showable) row.removeAttribute("hidden");
    else row.setAttribute("hidden", "");
  }
  if (!chip || !showable) return;
  var on = partShown(id);
  var other = id === "title" ? "body" : (id === "body" ? "title" : "");
  var lastOn = (id === "title" || id === "body") && on && other && !partShown(other);
  chip.setAttribute("aria-pressed", on ? "true" : "false");
  chip.classList.toggle("is-on", on);
  chip.classList.toggle("is-locked", lastOn);
  if (lastOn) chip.setAttribute("aria-disabled", "true");
  else chip.removeAttribute("aria-disabled");
}
function toggleSelectedPartShow() {
  var id = selectedPart();
  if (!isShowablePart(id)) return;
  var hidden = $("part-" + id + "-show");
  if (!hidden) return;
  var on = partShown(id);
  if (id === "title" || id === "body") {
    var other = id === "title" ? "body" : "title";
    if (on && !partShown(other)) return;
    hidden.value = on ? "false" : "";
  } else {
    hidden.value = on ? "false" : "true";
  }
  syncPartChipOffState();
  syncPartShowChip(id);
}
function defaultPartRect(id) {
  var width = Math.trunc(Number($("prop-width") && $("prop-width").value));
  var height = Math.trunc(Number($("prop-height") && $("prop-height").value));
  if (!Number.isFinite(width)) width = 420;
  if (!Number.isFinite(height)) height = 220;
  var behavior = ($("pipeline-behavior") && $("pipeline-behavior").value) || "stack";
  var ticker = behavior === "ticker";
  var popup = behavior === "popup";
  var showClose = closePartEnabled();
  var titleShowEl = $("part-title-show");
  var bodyShowEl = $("part-body-show");
  var iconShowEl = $("part-icon-show");
  var nameShowEl = $("part-assistantName-show");
  var showBody = !(bodyShowEl && bodyShowEl.value === "false");
  var showTitle = !(titleShowEl && titleShowEl.value === "false") || !showBody;
  var showIcon = !!(iconShowEl && iconShowEl.value === "true");
  var showAssistantName = !!(nameShowEl && nameShowEl.value === "true");
  var rects = {};
  if (ticker) {
    var textLeft = showIcon ? 38 : 14;
    var textWidth = Math.max(1, width - textLeft - 14);
    var fillY = height < 48 ? 4 : 8;
    var fillH = Math.max(1, height - fillY * 2);
    if (showIcon) rects.icon = { x: 8, y: Math.max(0, Math.trunc((height - 24) / 2)), w: 24, h: 24, radius: 12 };
    if (showAssistantName) rects.assistantName = { x: textLeft, y: 2, w: textWidth, h: 14 };
    if (height < 70 || !showTitle || !showBody) {
      var fillId = showTitle ? "title" : "body";
      var y = showAssistantName ? fillY + 12 : fillY;
      var h = showAssistantName ? Math.max(1, fillH - 12) : fillH;
      rects[fillId] = { x: textLeft, y: y, w: textWidth, h: h };
    } else {
      rects.title = { x: textLeft, y: showAssistantName ? 16 : 6, w: textWidth, h: 28 };
      rects.body = { x: textLeft, y: showAssistantName ? 44 : 34, w: textWidth, h: Math.max(1, height - (showAssistantName ? 44 : 34) - 6) };
    }
  } else {
    var insetLeft = showIcon ? 66 : (popup ? 36 : 30);
    var textTop = showAssistantName ? 36 : 24;
    var bodyTop = showAssistantName ? 74 : 62;
    var splitBodyHeight = Math.max(1, height - 22 - bodyTop);
    var fillHeight = Math.max(1, height - 22 - textTop);
    var size = 28;
    var pad = 12;
    var closeX = width - pad - size;
    var closeY = pad;
    var titleWidth = showClose ? Math.max(1, closeX - 8 - insetLeft) : Math.max(1, width - 24 - insetLeft);
    var bodyWidth = Math.max(1, width - 24 - insetLeft);
    if (showIcon) rects.icon = { x: 16, y: 22, w: 40, h: 40, radius: 20 };
    if (showAssistantName) rects.assistantName = { x: showIcon ? 66 : 30, y: 16, w: titleWidth, h: 18 };
    if (!showTitle || !showBody) {
      var onlyId = showTitle ? "title" : "body";
      rects[onlyId] = { x: insetLeft, y: textTop, w: onlyId === "title" ? titleWidth : bodyWidth, h: fillHeight };
    } else {
      rects.title = { x: insetLeft, y: textTop, w: titleWidth, h: 34 };
      rects.body = { x: insetLeft, y: bodyTop, w: bodyWidth, h: splitBodyHeight };
    }
    if (showClose) rects.close = { x: closeX, y: closeY, w: size, h: size, radius: Math.trunc(size / 2) };
  }
  return rects[id] || { x: 0, y: 0, w: 1, h: 1 };
}
function hiddenAxis(el, fallback) {
  return el && el.value !== "" ? el.value : fallback;
}
function flushSelectedPartEditor() {
  var selected = $("part-selected");
  var id = selected && selected.value;
  if (!isSelectablePart(id) && typeof selectedPart === "function") id = selectedPart();
  if (id === "root" || !isSelectablePart(id)) return;
  var fill = isTextPart(id) ? $("part-paint-fill") : $("part-paint-fill-box");
  var stroke = $("part-paint-stroke");
  var width = $("part-paint-stroke-width");
  var hidFill = $("part-" + id + "-fill");
  var hidStroke = $("part-" + id + "-stroke");
  var hidWidth = $("part-" + id + "-stroke-width");
  if (hidFill) {
    var currentFill = hidFill.value || "";
    if (!currentFill || currentFill.charAt(0) === "#") hidFill.value = fill && fill.value ? fill.value : "";
  }
  if (hidStroke) {
    var currentStroke = hidStroke.value || "";
    if (!currentStroke || currentStroke.charAt(0) === "#") hidStroke.value = stroke && stroke.value ? stroke.value : "";
  }
  if (hidWidth) hidWidth.value = width && width.value !== undefined && width.value !== "" ? String(width.value) : "0";
  if (isTextPart(id)) {
    var sizeEl = $("part-paint-font-size");
    var familyEl = $("part-paint-font-family");
    var hidSize = $("part-" + id + "-font-size");
    var hidFamily = $("part-" + id + "-font-family");
    var hidPaint = $("part-" + id + "-text-paint");
    if (hidSize && sizeEl && sizeEl.value !== "") hidSize.value = sizeEl.value;
    if (hidFamily && familyEl && familyEl.value) hidFamily.value = familyEl.value;
    if (hidPaint && typeof pressed === "function") hidPaint.value = pressed("part-paint-rainbow") ? "rainbow" : "";
    if (typeof pressed === "function") {
      setControl("part-" + id + "-font-bold", pressed("part-paint-font-bold") ? "true" : "false");
      setControl("part-" + id + "-font-italic", pressed("part-paint-font-italic") ? "true" : "");
      setControl("part-" + id + "-font-underline", pressed("part-paint-font-underline") ? "true" : "");
      setControl("part-" + id + "-font-strike", pressed("part-paint-font-strike") ? "true" : "");
      setControl("part-" + id + "-text-stroke", pressed("part-paint-text-stroke") ? "true" : "");
      var hidTextStrokeColor = $("part-" + id + "-text-stroke-color");
      var textStrokeColorEl = $("part-paint-text-stroke-color");
      if (pressed("part-paint-text-stroke") && hidTextStrokeColor) {
        var currentTextStroke = hidTextStrokeColor.value || "";
        if (!currentTextStroke || currentTextStroke.charAt(0) === "#") {
          if (textStrokeColorEl && textStrokeColorEl.value) hidTextStrokeColor.value = textStrokeColorEl.value;
        }
      }
      var textStrokeWidthEl = $("part-paint-text-stroke-width");
      if (pressed("part-paint-text-stroke") && textStrokeWidthEl && textStrokeWidthEl.value !== "") {
        setControl("part-" + id + "-text-stroke-width", textStrokeWidthEl.value);
      }
      setControl("part-" + id + "-text-stroke-paint", pressed("part-paint-text-stroke") && pressed("part-paint-text-stroke-rainbow") ? "rainbow" : "");
    }
  }
  if (typeof pressed === "function") {
    setControl("part-" + id + "-stroke-paint", pressed("part-paint-stroke-paint") ? "gradient" : "");
  }
  if (id === "close") {
    var closeColorEl = $("part-paint-close-icon-color");
    if (closeColorEl && /^#[0-9a-fA-F]{6}$/.test(closeColorEl.value)) setControl("part-close-icon-color", closeColorEl.value);
  }
  ["x", "y", "w", "h", "radius"].forEach(function (axis) {
    var hidden = $("part-" + id + "-" + axis);
    var visible = $("part-paint-" + axis);
    if (!hidden || !visible || visible.value === "") return;
    hidden.value = visible.value;
  });
  if (id === "icon") {
    var sourceEl = $("part-icon-source");
    var assetEl = $("part-icon-asset");
    if (sourceEl && !sourceEl.value) sourceEl.value = "assistant";
    if (assetEl) setControl("part-icon-asset-id", assetEl.value || "");
  }
  if (isContentSourcePart(id)) {
    var customTextEl = $("part-custom-text");
    var hidCustom = $("part-" + id + "-custom-text");
    if (hidCustom && customTextEl) hidCustom.value = customTextEl.value || "";
  }
  var hidBg = $("part-" + id + "-background");
  if (hidBg && isTextPart(id)) {
    var bgEl = $("part-paint-background");
    if (typeof pressed === "function") hidBg.value = pressed("part-paint-background-on") && bgEl && bgEl.value ? bgEl.value : "";
    else if (bgEl && bgEl.value) hidBg.value = bgEl.value;
  }
  var hidOp = $("part-" + id + "-opacity");
  var opEl = $("part-paint-opacity");
  if (hidOp && opEl && opEl.value !== "") hidOp.value = opEl.value;
  if (id !== "icon") {
    var hidAsset = $("part-" + id + "-bg-asset");
    var assetPaint = $("part-paint-bg-asset");
    if (hidAsset && assetPaint) hidAsset.value = assetPaint.value || "";
  }
  if (isFitWidthPart(id) && typeof pressed === "function") {
    setControl("part-" + id + "-fit-width", pressed("part-paint-fit-width") ? "true" : "");
    setControl("part-" + id + "-fit-compensate", pressed("part-paint-fit-compensate") ? "true" : "");
  }
}
function setElHidden(el, hidden) {
  if (!el) return;
  if (hidden) el.setAttribute("hidden", "");
  else el.removeAttribute("hidden");
}
function syncPartBackgroundUi(id) {
  var text = isTextPart(id);
  var hid = $("part-" + id + "-background");
  var on = !!(text && hid && hid.value);
  setPressed("part-paint-background-on", on);
  setElHidden($("part-background-on-row"), !text);
  setElHidden($("part-background-color-field"), !(text && on));
  setElHidden($("part-fill-as-bg-field"), text);
  setElHidden($("part-text-group"), !text);
  setElHidden($("part-bg-asset-field"), id === "icon" || id === "root");
  var note = $("part-bg-note");
  if (note) note.textContent = text ? "垫在字下面，让字能看清。没有就不画。" : "这块零件的底。关闭和图标默认用自己的底色。";
}
function toggleSelectedPartBackground() {
  var id = selectedPart();
  if (!isTextPart(id)) return;
  var hid = $("part-" + id + "-background");
  if (!hid) return;
  if (hid.value) hid.value = "";
  else {
    var bg = $("part-paint-background");
    hid.value = (bg && bg.value) || "#1d2b27";
  }
  syncPartBackgroundUi(id);
}
function selectPart(id, skipFlush) {
  if (!skipFlush && typeof flushSelectedPartEditor === "function") flushSelectedPartEditor();
  var behavior = ($("pipeline-behavior") && $("pipeline-behavior").value) || "stack";
  if (id === "close" && (behavior === "ticker" || !closePartEnabled())) id = "root";
  if (!id) id = "root";
  rememberSelectedPart(id);
  setControl("part-selected", id);
  document.querySelectorAll("#part-chip-row [data-part]").forEach(function (chip) {
    var on = chip.getAttribute("data-part") === id;
    chip.classList.toggle("is-on", on);
    chip.classList.toggle("is-selected", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
  var root = $("root-fields");
  var part = $("part-fields");
  if (root) {
    if (id === "root") root.removeAttribute("hidden");
    else root.setAttribute("hidden", "");
  }
  if (part) {
    if (id === "root") part.setAttribute("hidden", "");
    else part.removeAttribute("hidden");
  }
  var iconFieldsRoot = $("part-icon-fields");
  if (iconFieldsRoot) {
    if (id === "icon") iconFieldsRoot.removeAttribute("hidden");
    else iconFieldsRoot.setAttribute("hidden", "");
  }
  var copy = $("part-fields-copy");
  if (copy) copy.textContent = id === "title" ? "正在编标题" : id === "body" ? "正在编正文" : id === "icon" ? "正在编图标" : id === "assistantName" ? "正在编助手名" : "正在编关闭";
  var fillLabel = document.querySelector('label[for="part-paint-fill"]');
  if (fillLabel) fillLabel.textContent = "文字";
  if (typeof syncPartShowChip === "function") syncPartShowChip(id);
  if (typeof syncPartChipOffState === "function") syncPartChipOffState();
  if (typeof syncTextPaintUi === "function") syncTextPaintUi(id);
  if (typeof syncTextStrokeUi === "function") syncTextStrokeUi(id);
  if (typeof syncStrokePaintUi === "function") syncStrokePaintUi(id);
  if (typeof syncCloseIconUi === "function") syncCloseIconUi();
  if (typeof syncPartBackgroundUi === "function") syncPartBackgroundUi(id);
  if (typeof syncFitWidthUi === "function") syncFitWidthUi(id);
  if (id !== "root") {
    var storedFill = $("part-" + id + "-fill");
    var storedStroke = $("part-" + id + "-stroke");
    var storedWidth = $("part-" + id + "-stroke-width");
    var defaults = PART_PAINT_DEFAULTS[id] || PART_PAINT_DEFAULTS.title;
    var resolvedFill = resolvePaintColor(storedFill && storedFill.value) || defaults.fill;
    if (isTextPart(id)) setControl("part-paint-fill", resolvedFill);
    else setControl("part-paint-fill-box", resolvedFill);
    setControl("part-paint-stroke", resolvePaintColor(storedStroke && storedStroke.value) || defaults.stroke);
    setControl("part-paint-stroke-width", (storedWidth && storedWidth.value) || 0);
    var storedBg = $("part-" + id + "-background");
    setControl("part-paint-background", resolvePaintColor(storedBg && storedBg.value) || "#1d2b27");
    var storedOp = $("part-" + id + "-opacity");
    setControl("part-paint-opacity", (storedOp && storedOp.value !== "") ? storedOp.value : 1);
    if (id !== "icon") setControl("part-paint-bg-asset", ($("part-" + id + "-bg-asset") && $("part-" + id + "-bg-asset").value) || "");
    var rect = defaultPartRect(id);
    setControl("part-paint-x", hiddenAxis($("part-" + id + "-x"), rect.x));
    setControl("part-paint-y", hiddenAxis($("part-" + id + "-y"), rect.y));
    setControl("part-paint-w", hiddenAxis($("part-" + id + "-w"), rect.w));
    setControl("part-paint-h", hiddenAxis($("part-" + id + "-h"), rect.h));
    setControl("part-paint-radius", hiddenAxis($("part-" + id + "-radius"), rect.radius != null ? rect.radius : 0));
    if (isTextPart(id)) {
      setControl("part-paint-font-size", hiddenAxis($("part-" + id + "-font-size"), id === "assistantName" ? 12 : (id === "body" ? 13 : 20)));
      setControl("part-paint-font-family", hiddenAxis($("part-" + id + "-font-family"), "yahei"));
    }
    var iconFields = $("part-icon-fields");
    if (iconFields) {
      if (id === "icon") iconFields.removeAttribute("hidden");
      else iconFields.setAttribute("hidden", "");
    }
    if (id === "icon") syncIconSourceUi();
    if (typeof syncContentSourceUi === "function") syncContentSourceUi(id);
    if (typeof syncStudioSampleUi === "function") syncStudioSampleUi();
  }
  if (id === "root") renderGlossaryRows();
  else renderNameChips();
}
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
    refreshDockMargins();
    refreshGrowPad();
    refreshWrapPad();
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
function applyModeEditor(value, restorePart) {
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
  setControl("prop-grow", space.grow || ((space.anchor || behavior.anchor || meta.anchor || "bottom-right").slice(0, 3) === "top" ? "down" : "up"));
  setControl("prop-wrap", space.wrap === "off" || space.wrap === "snake" || space.wrap === "coil" ? space.wrap : "parallel");
  if (space.wrap === "snake" || space.wrap === "parallel" || space.wrap === "coil") lastWrapPath = space.wrap;
  setControl("prop-settle", space.settle === "snap" ? "snap" : "follow");
  refreshSettlePad();
  setControl("prop-newest", space.newest === "next" ? "next" : "dock");
  refreshNewestPad();
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
  setControl("prop-border-width", shape.borderWidth === undefined ? (appearance.borderWidth === undefined ? (decoration.borderWidth === undefined ? 0 : decoration.borderWidth) : appearance.borderWidth) : shape.borderWidth);
  setControl("prop-border-color", shape.borderColor || appearance.borderColor || decoration.borderColor || "#62d0a8");
  setPressed("prop-border-paint", appearance.borderPaint === "gradient");
  setControl("prop-paint-overflow", appearance.paintOverflow === undefined ? 0 : appearance.paintOverflow);
  refreshDockMargins();
  refreshGrowPad();
  refreshWrapPad();
  refreshNewestPad();
  refreshSettlePad();
  var savedParts = config.parts || {};
  setPartHidden("title", savedParts.title);
  setPartHidden("body", savedParts.body);
  setPartHidden("close", savedParts.close);
  setPartHidden("icon", savedParts.icon);
  setPartHidden("assistantName", savedParts.assistantName);
  setControl("skin-bg-asset", background.assetId || appearance.backgroundAssetId || "");
  setControl("skin-bg-fit", background.fit || appearance.backgroundFit || "fill");
  setControl("skin-bg-padding", background.padding == null ? (appearance.backgroundPadding == null ? 0 : appearance.backgroundPadding) : background.padding);
  setControl("skin-bg-scale", appearance.backgroundScale == null ? 1 : appearance.backgroundScale);
  setControl("skin-bg-x", appearance.backgroundX == null ? 0.5 : appearance.backgroundX);
  setControl("skin-bg-y", appearance.backgroundY == null ? 0.5 : appearance.backgroundY);
  setControl("glossary-json", JSON.stringify(config.glossary || {}));
  renderGlossaryRows();
  var part = restorePart ? (rememberedSelectedPart() || ($("part-selected") && $("part-selected").value) || "root") : "root";
  selectPart(part, true);
  setControl("prop-duration", lifecycle.durationMs === undefined ? meta.duration : lifecycle.durationMs);
  var holdMs = lifecycle.holdDurationMs === undefined ? (interaction.timeoutMs === undefined ? meta.hold : interaction.timeoutMs) : lifecycle.holdDurationMs;
  setControl("prop-hold-duration", holdMs);
  setControl("hold-seconds", Math.max(1, Math.round(Number(holdMs) / 1000) || 30));
  var storedDismiss = interaction.dismissMode || "closeButton";
  var autoOn = interaction.autoDismiss === "on" || interaction.autoDismiss === true || storedDismiss === "timeout";
  setDismissChips(storedDismiss, autoOn);
  var hoverOn = interaction.hoverHighlight === "on" || interaction.hoverHighlight === true;
  setPressed("prop-hover-highlight", hoverOn);
  setPressed("ticker-hover-highlight", hoverOn);
  setPressed("ticker-hover-pause", !!(state.profile && state.profile.ticker && state.profile.ticker.hoverPause));
  syncTickerHoverLock();
  var holdDragOn = interaction.holdDrag !== "off" && interaction.holdDrag !== false;
  var holdBtn = $("prop-hold-drag");
  if (holdBtn && holdBtn.setAttribute) holdBtn.setAttribute("data-intent", holdDragOn ? "on" : "off");
  setPressed("prop-hold-drag", holdDragOn);
  syncHoldDragLock();
  var width = $("prop-width");
  var height = $("prop-height");
  if (width) width.disabled = false;
  if (height) height.disabled = false;
  var editor = document.querySelector(".studio");
  if (editor) {
    editor.setAttribute("data-editor-mode", value);
    editor.setAttribute("data-mode", ($("pipeline-behavior") && $("pipeline-behavior").value) || "stack");
  }
}
function setFoldVisibility(id, visible) {
  var el = $(id);
  if (!el) return;
  if (visible) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
  if ("open" in el) el.open = !!visible;
}
function applyTickerDirection(dir) {
  dir = dir === "right" ? "right" : "left";
  setControl("ticker-direction", dir);
  document.querySelectorAll("[data-ticker-direction]").forEach(function (chip) {
    var on = chip.getAttribute("data-ticker-direction") === dir;
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
  var summary = $("ticker-direction-copy");
  if (summary) summary.textContent = dir === "right" ? "从左往右，看过即走" : "从右往左，看过即走";
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
  syncClosePartVisibility();
  syncTickerHoverLock();
  markVisualDirty();
  syncPreview();
}
var bgAdjust = { open: false, invert: false, drag: null, scale: 1, x: 0.5, y: 0.5, imgW: 0, imgH: 0, fit: 1, drawW: 0, drawH: 0, target: "root" };
function wallpaperCss(paint) {
  paint = paint || {};
  var scale = Number(paint.backgroundScale);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  var x = Number(paint.backgroundX);
  var y = Number(paint.backgroundY);
  if (!Number.isFinite(x)) x = 0.5;
  if (!Number.isFinite(y)) y = 0.5;
  return "object-fit:cover;object-position:" + (x * 100) + "% " + (y * 100) + "%;transform:scale(" + scale + ");transform-origin:" + (x * 100) + "% " + (y * 100) + "%;border-radius:inherit";
}
function refreshDockMargins() {
  var anchor = ($("prop-anchor") && $("prop-anchor").value) || "bottom-right";
  var leftOn = /-left$/.test(anchor);
  var rightOn = /-right$/.test(anchor);
  var topOn = /^top-/.test(anchor);
  var bottomOn = /^bottom-/.test(anchor);
  function setSide(id, on) {
    var el = $(id);
    if (!el) return;
    el.disabled = false;
    el.removeAttribute("disabled");
    var field = el.closest ? el.closest(".field") : el.parentElement;
    if (field && field.classList) field.classList.toggle("is-accent", !!on);
  }
  setSide("prop-margin-left", leftOn);
  setSide("prop-margin-right", rightOn);
  setSide("prop-margin-top", topOn);
  setSide("prop-margin-bottom", bottomOn);
}
var lastWrapPath = "parallel";
function wrapFromControls() {
  var wrap = ($("prop-wrap") && $("prop-wrap").value) || "parallel";
  if (wrap === "off" || wrap === "snake" || wrap === "parallel" || wrap === "coil") return wrap;
  return "parallel";
}
function refreshNewestPad() {
  var newest = ($("prop-newest") && $("prop-newest").value) || "dock";
  if (newest !== "next") newest = "dock";
  document.querySelectorAll("[data-newest]").forEach(function (chip) {
    var on = chip.getAttribute("data-newest") === newest;
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function refreshSettlePad() {
  var settle = ($("prop-settle") && $("prop-settle").value) || "follow";
  if (settle !== "snap") settle = "follow";
  document.querySelectorAll("[data-settle]").forEach(function (chip) {
    var on = chip.getAttribute("data-settle") === settle;
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function refreshWrapPad() {
  var grow = ($("prop-grow") && $("prop-grow").value) || "up";
  var wrap = wrapFromControls();
  var open = wrap !== "off";
  var path = wrap === "snake" || wrap === "coil" ? wrap : "parallel";
  if (wrap === "snake" || wrap === "parallel" || wrap === "coil") lastWrapPath = wrap;
  var label = $("prop-wrap-open-label");
  if (label) label.textContent = (grow === "left" || grow === "right") ? "开新行" : "开新列";
  var note = $("prop-wrap-note");
  if (note) note.textContent = wrap === "off" ? "满了掀最旧" : wrap === "snake" ? "折返，二维满了掀最旧。" : wrap === "coil" ? "越绕越小，满了掀最旧。" : "满了沿另一边开列";
  document.querySelectorAll("[data-wrap-open]").forEach(function (chip) {
    var on = (chip.getAttribute("data-wrap-open") === "off") ? !open : open;
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.querySelectorAll("[data-wrap-path]").forEach(function (chip) {
    var id = chip.getAttribute("data-wrap-path");
    var on = open && id === path;
    chip.classList.toggle("is-on", on);
    chip.classList.toggle("is-off", !open);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.setAttribute("aria-disabled", open ? "false" : "true");
  });
}
function refreshGrowPad() {
  var anchor = ($("prop-anchor") && $("prop-anchor").value) || "bottom-right";
  var allowed = { up: anchor.slice(0, 3) !== "top", down: anchor.slice(0, 6) !== "bottom", left: anchor.slice(-4) !== "left", right: anchor.slice(-5) !== "right" };
  var current = ($("prop-grow") && $("prop-grow").value) || "";
  if (!allowed[current]) {
    current = anchor.slice(0, 3) === "top" ? "down" : "up";
    setControl("prop-grow", current);
  }
  document.querySelectorAll(".grow-cell").forEach(function (cell) {
    var dir = cell.getAttribute("data-grow");
    var can = !!allowed[dir];
    var on = can && dir === current;
    cell.classList.toggle("is-off", !can);
    cell.classList.toggle("is-on", on);
    cell.setAttribute("aria-disabled", can ? "false" : "true");
    cell.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function ctrlNumber(id, fallback, min, max) {
  var el = $(id);
  var parsed = Number(el && el.value !== undefined && el.value !== "" ? el.value : fallback);
  if (!Number.isFinite(parsed)) parsed = Number(fallback);
  if (min != null && parsed < min) parsed = min;
  if (max != null && parsed > max) parsed = max;
  return parsed;
}
function writeBgTransform(scale, x, y) {
  if (bgAdjust.target === "icon") {
    setControl("part-icon-bg-scale", scale);
    setControl("part-icon-bg-x", x);
    setControl("part-icon-bg-y", y);
    return;
  }
  if (bgAdjust.target && bgAdjust.target !== "root") {
    setControl("part-" + bgAdjust.target + "-bg-scale", scale);
    setControl("part-" + bgAdjust.target + "-bg-x", x);
    setControl("part-" + bgAdjust.target + "-bg-y", y);
    return;
  }
  setControl("skin-bg-scale", scale);
  setControl("skin-bg-x", x);
  setControl("skin-bg-y", y);
}
function syncBgAdjustNumbers() {
  setControl("bg-adjust-scale", Math.round(bgAdjust.scale * 100));
  setControl("bg-adjust-x", Math.round(bgAdjust.x * 100));
  setControl("bg-adjust-y", Math.round(bgAdjust.y * 100));
}
function closeBgAdjust(save) {
  var overlay = $("bg-adjust");
  if (!overlay) return;
  overlay.setAttribute("hidden", "");
  bgAdjust.open = false;
  bgAdjust.drag = null;
  if (save) {
    writeBgTransform(bgAdjust.scale, bgAdjust.x, bgAdjust.y);
    markVisualDirty();
    if (typeof saveVisualSettings === "function") saveVisualSettings();
    if (typeof syncPreview === "function") syncPreview();
  }
}
function layoutBgAdjust() {
  var stage = $("bg-adjust-stage");
  var clip = $("bg-adjust-clip");
  var img = $("bg-adjust-image");
  var draw = $("bg-adjust-draw");
  var hit = $("bg-adjust-hit");
  var extracted = $("bg-adjust-extracted");
  if (!stage || !draw || !hit) return;
  var partOn = bgAdjust.target !== "root";
  var iconOn = bgAdjust.target === "icon";
  var width = Math.round(partOn ? ctrlNumber("part-paint-w", ctrlNumber("part-icon-w", 40, 1, 1920), 1, 1920) : ctrlNumber("prop-width", 420, 1, 1920));
  var height = Math.round(partOn ? ctrlNumber("part-paint-h", ctrlNumber("part-icon-h", 40, 1, 1080), 1, 1080) : ctrlNumber("prop-height", 220, 1, 1080));
  var radius = Math.round(partOn ? ctrlNumber("part-paint-radius", ctrlNumber("part-icon-radius", 20, 0, 240), 0, 240) : ctrlNumber("prop-border-radius", 16, 0, 480));
  var overflow = partOn ? 0 : Math.round(ctrlNumber("prop-paint-overflow", 0, 0, 240));
  if (extracted) extracted.textContent = "宽 " + width + " · 高 " + height + " · 圆角 " + radius + " · 绘制溢出 " + overflow + (iconOn ? " · 提取自图标" : (partOn ? " · 提取自零件" : " · 提取自设置页面"));
  var drawW = width + overflow * 2;
  var drawH = height + overflow * 2;
  var stageW = stage.clientWidth || 720;
  var stageH = stage.clientHeight || 360;
  var fit = Math.min(1, (stageW - 48) / Math.max(1, drawW), (stageH - 48) / Math.max(1, drawH));
  if (!Number.isFinite(fit) || fit <= 0) fit = 1;
  var shownDrawW = drawW * fit;
  var shownDrawH = drawH * fit;
  var drawLeft = (stageW - shownDrawW) / 2;
  var drawTop = (stageH - shownDrawH) / 2;
  draw.style.left = drawLeft + "px";
  draw.style.top = drawTop + "px";
  draw.style.width = shownDrawW + "px";
  draw.style.height = shownDrawH + "px";
  draw.style.borderRadius = ((radius + overflow * 0.35) * fit) + "px";
  hit.style.left = (drawLeft + overflow * fit) + "px";
  hit.style.top = (drawTop + overflow * fit) + "px";
  hit.style.width = (width * fit) + "px";
  hit.style.height = (height * fit) + "px";
  hit.style.borderRadius = (radius * fit) + "px";
  if (clip) {
    clip.style.left = drawLeft + "px";
    clip.style.top = drawTop + "px";
    clip.style.width = shownDrawW + "px";
    clip.style.height = shownDrawH + "px";
    clip.style.borderRadius = ((radius + overflow * 0.35) * fit) + "px";
  }
  bgAdjust.fit = fit;
  bgAdjust.drawW = shownDrawW;
  bgAdjust.drawH = shownDrawH;
  bgAdjust.hitW = width * fit;
  bgAdjust.hitH = height * fit;
  if (!img || !bgAdjust.imgW || !bgAdjust.imgH) {
    if (img) img.style.display = "none";
    return;
  }
  img.style.display = "block";
  var hitW = width * fit;
  var hitH = height * fit;
  var cover = Math.max(hitW / bgAdjust.imgW, hitH / bgAdjust.imgH);
  var used = cover * bgAdjust.scale;
  var outW = bgAdjust.imgW * used;
  var outH = bgAdjust.imgH * used;
  img.style.width = outW + "px";
  img.style.height = outH + "px";
  img.style.left = (overflow * fit + (hitW - outW) * bgAdjust.x) + "px";
  img.style.top = (overflow * fit + (hitH - outH) * bgAdjust.y) + "px";
}
function openBgAdjust(target) {
  var overlay = $("bg-adjust");
  if (!overlay) return;
  overlay.removeAttribute("hidden");
  bgAdjust.open = true;
  bgAdjust.target = target === "icon" ? "icon" : (target && target !== "root" ? target : "root");
  if (bgAdjust.target === "icon") {
    bgAdjust.scale = ctrlNumber("part-icon-bg-scale", 1, 0.2, 8);
    bgAdjust.x = ctrlNumber("part-icon-bg-x", 0.5, 0, 1);
    bgAdjust.y = ctrlNumber("part-icon-bg-y", 0.5, 0, 1);
  } else if (bgAdjust.target !== "root") {
    bgAdjust.scale = ctrlNumber("part-" + bgAdjust.target + "-bg-scale", 1, 0.2, 8);
    bgAdjust.x = ctrlNumber("part-" + bgAdjust.target + "-bg-x", 0.5, 0, 1);
    bgAdjust.y = ctrlNumber("part-" + bgAdjust.target + "-bg-y", 0.5, 0, 1);
  } else {
    bgAdjust.scale = ctrlNumber("skin-bg-scale", 1, 0.2, 8);
    bgAdjust.x = ctrlNumber("skin-bg-x", 0.5, 0, 1);
    bgAdjust.y = ctrlNumber("skin-bg-y", 0.5, 0, 1);
  }
  try { bgAdjust.invert = localStorage.getItem("nh-bg-wheel-invert") === "1"; } catch (error) { bgAdjust.invert = false; }
  var invert = $("bg-adjust-invert");
  if (invert) {
    invert.setAttribute("aria-pressed", bgAdjust.invert ? "true" : "false");
    if (invert.classList) invert.classList.toggle("is-on", bgAdjust.invert);
  }
  if (bgAdjust.target === "icon") {
    var sourceEl = $("part-icon-source");
    var source = sourceEl && sourceEl.value === "custom" ? "custom" : "assistant";
    if (source === "custom") {
      var assetId = ($("part-icon-asset-id") && $("part-icon-asset-id").value) || ($("part-icon-asset") && $("part-icon-asset").value) || "";
      loadBgAdjustImage(assetId);
    } else {
      loadBgAdjustAgent((sampleAgentIdentity() || {}).id);
    }
  } else if (bgAdjust.target !== "root") {
    var partAssetId = ($("part-paint-bg-asset") && $("part-paint-bg-asset").value) || ($("part-" + bgAdjust.target + "-bg-asset") && $("part-" + bgAdjust.target + "-bg-asset").value) || "";
    loadBgAdjustImage(partAssetId);
  } else {
    var assetId = ($("skin-bg-asset") && $("skin-bg-asset").value) || "";
    loadBgAdjustImage(assetId);
  }
  syncBgAdjustNumbers();
  layoutBgAdjust();
}
function applyBgAdjustImage(img, src) {
  img.onload = function () {
    bgAdjust.imgW = img.naturalWidth || 0;
    bgAdjust.imgH = img.naturalHeight || 0;
    layoutBgAdjust();
  };
  img.onerror = function () {
    bgAdjust.imgW = 0;
    bgAdjust.imgH = 0;
    img.style.display = "none";
    feedback("visual-settings-feedback", "底图读不出来。", "error");
    layoutBgAdjust();
  };
  img.src = src;
  if (img.complete && img.naturalWidth) {
    bgAdjust.imgW = img.naturalWidth;
    bgAdjust.imgH = img.naturalHeight;
    layoutBgAdjust();
  }
}
function loadBgAdjustAgent(agentId) {
  var img = $("bg-adjust-image");
  var clip = $("bg-adjust-clip");
  if (clip) clip.style.background = ($("part-icon-fill") && $("part-icon-fill").value) || "#1d2b27";
  bgAdjust.imgW = 0;
  bgAdjust.imgH = 0;
  if (!img) return;
  if (!agentId) {
    img.removeAttribute("src");
    img.style.display = "none";
    return;
  }
  json("agent-avatars/" + encodeURIComponent(agentId) + "/file").then(function (data) {
    if (!bgAdjust.open || bgAdjust.target !== "icon") return;
    if (!data || !data.dataUrl) throw new Error("助手头像没有图数据");
    applyBgAdjustImage(img, data.dataUrl);
  }).catch(function (error) {
    img.removeAttribute("src");
    img.style.display = "none";
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + (error.message || "助手头像读不出来。"), "error");
    layoutBgAdjust();
  });
}
function loadBgAdjustImage(assetId) {
  var img = $("bg-adjust-image");
  var clip = $("bg-adjust-clip");
  if (clip) clip.style.background = ($("skin-bg-color") && $("skin-bg-color").value) || "#0e1916";
  bgAdjust.imgW = 0;
  bgAdjust.imgH = 0;
  if (!img) return;
  if (!assetId) {
    img.removeAttribute("src");
    img.style.display = "none";
    return;
  }
  json("visual-assets/" + encodeURIComponent(assetId) + "/file").then(function (data) {
    if (!bgAdjust.open) return;
    if (!data || !data.dataUrl) throw new Error("底图没有图数据");
    applyBgAdjustImage(img, data.dataUrl);
  }).catch(function (error) {
    img.removeAttribute("src");
    img.style.display = "none";
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + (error.message || "底图读不出来。"), "error");
    layoutBgAdjust();
  });
}
function syncStudioSampleUi() {
  var field = $("studio-sample-field");
  if (!field) return;
  var part = typeof selectedPart === "function" ? selectedPart() : "";
  var sourceEl = $("part-icon-source");
  var source = sourceEl && sourceEl.value === "custom" ? "custom" : "assistant";
  var show = part === "assistantName" || (part === "icon" && source === "assistant");
  if (show) field.removeAttribute("hidden");
  else field.setAttribute("hidden", "");
}
function partCustomTextMax(id) {
  var field = $("part-custom-text-field");
  var raw = field && field.getAttribute(id === "body" ? "data-body-max" : "data-title-max");
  var n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : (id === "body" ? 4000 : 2000);
}
function syncCustomTextCount() {
  var text = $("part-custom-text");
  var count = $("part-custom-text-count");
  if (!text || !count) return;
  var max = text.maxLength > 0 ? text.maxLength : 0;
  count.textContent = (text.value || "").length + " / " + max;
}
function syncContentSourceUi(id) {
  id = id || selectedPart();
  var row = $("part-content-source-row");
  var field = $("part-custom-text-field");
  var text = $("part-custom-text");
  var allowed = isContentSourcePart(id);
  if (row) {
    if (allowed) row.removeAttribute("hidden");
    else row.setAttribute("hidden", "");
  }
  var sourceEl = allowed ? $("part-" + id + "-content-source") : null;
  var custom = allowed && sourceEl && sourceEl.value === "custom";
  setPressed("part-content-source-event", allowed && !custom);
  setPressed("part-content-source-custom", !!custom);
  if (text) {
    text.maxLength = partCustomTextMax(id);
    text.rows = id === "body" ? 6 : 3;
    text.value = allowed ? (($("part-" + id + "-custom-text") && $("part-" + id + "-custom-text").value) || "") : "";
  }
  if (field) {
    if (custom) field.removeAttribute("hidden");
    else field.setAttribute("hidden", "");
  }
  syncCustomTextCount();
}
function setContentSource(source) {
  var id = selectedPart();
  if (!isContentSourcePart(id)) return;
  var next = source === "custom" ? "custom" : "";
  setControl("part-" + id + "-content-source", next);
  if (next === "custom") {
    var hid = $("part-" + id + "-custom-text");
    if (hid && !hid.value) {
      hid.value = id === "title" ? "自定义标题" : "";
    }
  }
  syncContentSourceUi(id);
}
function syncIconSourceUi() {
  var sourceEl = $("part-icon-source");
  var source = sourceEl && sourceEl.value === "custom" ? "custom" : "assistant";
  setPressed("part-icon-source-assistant", source === "assistant");
  setPressed("part-icon-source-custom", source === "custom");
  var custom = $("part-icon-custom-field");
  if (custom) {
    if (source === "custom") custom.removeAttribute("hidden");
    else custom.setAttribute("hidden", "");
  }
  var assetSel = $("part-icon-asset");
  var assetId = $("part-icon-asset-id");
  if (assetSel && assetId) assetSel.value = assetId.value || "";
  syncStudioSampleUi();
}
function setIconSource(source) {
  setControl("part-icon-source", source === "custom" ? "custom" : "assistant");
  if (source !== "custom") setControl("part-icon-asset-id", "");
  syncIconSourceUi();
}
function importIconAsset() {
  json("visual-assets/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "decoration" }) }).then(function (result) {
    if (!result || result.cancelled || !result.asset) return;
    var sel = $("part-icon-asset");
    if (sel) {
      var opt = document.createElement("option");
      opt.value = result.asset.assetId;
      opt.textContent = (result.asset.name || result.asset.assetId) + " · " + String(result.asset.format || "").toUpperCase();
      sel.appendChild(opt);
      sel.value = result.asset.assetId;
    }
    setControl("part-icon-asset-id", result.asset.assetId);
    setControl("part-icon-source", "custom");
    syncIconSourceUi();
    markVisualDirty();
    syncPreview();
  }).catch(function (error) {
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
  });
}
var agentAvatarCache = {};
function ensureStudioAgentAvatar(agentId) {
  if (!agentId || Object.prototype.hasOwnProperty.call(agentAvatarCache, agentId)) return agentAvatarCache[agentId] || "";
  agentAvatarCache[agentId] = "";
  json("agent-avatars/" + encodeURIComponent(agentId) + "/file").then(function (data) {
    if (!data || !data.dataUrl) return;
    agentAvatarCache[agentId] = data.dataUrl;
  }).catch(function () {});
  return "";
}
function sampleAgentIdentity() {
  var sel = $("studio-sample-agent");
  var id = sel && sel.value ? sel.value : "";
  var name = "";
  if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) name = sel.options[sel.selectedIndex].textContent || id;
  if (!id && sel && sel.options && sel.options.length > 1) {
    id = sel.options[1].value;
    name = sel.options[1].textContent || id;
  }
  return { id: id, name: name || id };
}
function importBgAsset() {
  json("visual-assets/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "background" }) }).then(function (result) {
    if (!result || result.cancelled || !result.asset) return;
    var sel = $("skin-bg-asset");
    if (!sel) return;
    var opt = document.createElement("option");
    opt.value = result.asset.assetId;
    opt.textContent = (result.asset.name || result.asset.assetId) + " · " + String(result.asset.format || "").toUpperCase();
    sel.appendChild(opt);
    sel.value = result.asset.assetId;
    writeBgTransform(1, 0.5, 0.5);
    markVisualDirty();
    syncPreview();
  }).catch(function (error) {
    feedback("visual-settings-feedback", (error.code ? error.code + " · " : "") + error.message, "error");
  });
}
function bindBgAdjust() {
  var stage = $("bg-adjust-stage");
  if (!stage || stage.__bgBound) return;
  stage.__bgBound = true;
  stage.addEventListener("pointerdown", function (event) {
    if (!bgAdjust.open) return;
    event.preventDefault();
    bgAdjust.drag = { x: event.clientX, y: event.clientY, originX: bgAdjust.x, originY: bgAdjust.y };
    if (stage.classList) stage.classList.add("is-dragging");
    if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", function (event) {
    if (!bgAdjust.drag) return;
    var hitW = bgAdjust.hitW || bgAdjust.drawW;
    var hitH = bgAdjust.hitH || bgAdjust.drawH;
    var extraW = hitW - (bgAdjust.imgW * Math.max(hitW / Math.max(bgAdjust.imgW, 1), hitH / Math.max(bgAdjust.imgH, 1)) * bgAdjust.scale);
    var extraH = hitH - (bgAdjust.imgH * Math.max(hitW / Math.max(bgAdjust.imgW, 1), hitH / Math.max(bgAdjust.imgH, 1)) * bgAdjust.scale);
    if (bgAdjust.imgW && extraW !== 0) bgAdjust.x = Math.max(0, Math.min(1, bgAdjust.drag.originX + (event.clientX - bgAdjust.drag.x) / extraW));
    if (bgAdjust.imgH && extraH !== 0) bgAdjust.y = Math.max(0, Math.min(1, bgAdjust.drag.originY + (event.clientY - bgAdjust.drag.y) / extraH));
    syncBgAdjustNumbers();
    layoutBgAdjust();
  });
  function endDrag(event) {
    if (!bgAdjust.drag) return;
    bgAdjust.drag = null;
    if (stage.classList) stage.classList.remove("is-dragging");
    if (event && stage.releasePointerCapture && event.pointerId != null) {
      try { stage.releasePointerCapture(event.pointerId); } catch (error) {}
    }
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("wheel", function (event) {
    if (!bgAdjust.open) return;
    event.preventDefault();
    var delta = event.deltaY;
    if (bgAdjust.invert) delta = -delta;
    bgAdjust.scale = Math.max(0.2, Math.min(8, bgAdjust.scale * (delta > 0 ? 0.92 : 1.08)));
    syncBgAdjustNumbers();
    layoutBgAdjust();
  }, { passive: false });
  ["bg-adjust-scale", "bg-adjust-x", "bg-adjust-y"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", function () {
      if (!bgAdjust.open) return;
      if (id === "bg-adjust-scale") bgAdjust.scale = Math.max(0.2, Math.min(8, ctrlNumber(id, 100, 20, 800) / 100));
      if (id === "bg-adjust-x") bgAdjust.x = Math.max(0, Math.min(1, ctrlNumber(id, 50, 0, 100) / 100));
      if (id === "bg-adjust-y") bgAdjust.y = Math.max(0, Math.min(1, ctrlNumber(id, 50, 0, 100) / 100));
      layoutBgAdjust();
    });
  });
}
function studioClickHandler(event) {
  var bgOpen = event.target && event.target.closest ? event.target.closest("#bg-adjust-open") : null;
  if (bgOpen) {
    event.preventDefault();
    openBgAdjust("root");
    return;
  }
  var iconAdjust = event.target && event.target.closest ? event.target.closest("#icon-adjust-open") : null;
  if (iconAdjust) {
    event.preventDefault();
    openBgAdjust("icon");
    return;
  }
  var partBgAdjust = event.target && event.target.closest ? event.target.closest("#part-bg-adjust-open") : null;
  if (partBgAdjust) {
    event.preventDefault();
    var partId = selectedPart();
    if (partId && partId !== "root" && partId !== "icon") openBgAdjust(partId);
    return;
  }
  var bgClose = event.target && event.target.closest ? event.target.closest("#bg-adjust-close") : null;
  if (bgClose) {
    event.preventDefault();
    closeBgAdjust(false);
    return;
  }
  var bgSave = event.target && event.target.closest ? event.target.closest("#bg-adjust-save") : null;
  if (bgSave) {
    event.preventDefault();
    closeBgAdjust(true);
    return;
  }
  var bgInvert = event.target && event.target.closest ? event.target.closest("#bg-adjust-invert") : null;
  if (bgInvert) {
    event.preventDefault();
    bgAdjust.invert = !bgAdjust.invert;
    bgInvert.setAttribute("aria-pressed", bgAdjust.invert ? "true" : "false");
    if (bgInvert.classList) bgInvert.classList.toggle("is-on", bgAdjust.invert);
    try { localStorage.setItem("nh-bg-wheel-invert", bgAdjust.invert ? "1" : "0"); } catch (error) {}
    return;
  }
  var contentSourceChip = event.target && event.target.closest ? event.target.closest("#part-content-source-event, #part-content-source-custom") : null;
  if (contentSourceChip) {
    event.preventDefault();
    setContentSource(contentSourceChip.id === "part-content-source-custom" ? "custom" : "event");
    markVisualDirty();
    syncPreview();
    return;
  }
  var iconSourceChip = event.target && event.target.closest ? event.target.closest("#part-icon-source-assistant, #part-icon-source-custom") : null;
  if (iconSourceChip) {
    event.preventDefault();
    setIconSource(iconSourceChip.id === "part-icon-source-custom" ? "custom" : "assistant");
    markVisualDirty();
    syncPreview();
    return;
  }
  var iconImport = event.target && event.target.closest ? event.target.closest("#icon-asset-import") : null;
  if (iconImport) {
    event.preventDefault();
    importIconAsset();
    return;
  }
  var iconLibrary = event.target && event.target.closest ? event.target.closest("#icon-asset-library") : null;
  if (iconLibrary) {
    event.preventDefault();
    if (window.NotificationHubPageRouter) window.NotificationHubPageRouter.load("visual-assets-page");
    return;
  }
  var fontImport = event.target && event.target.closest ? event.target.closest("#font-asset-import") : null;
  if (fontImport) {
    event.preventDefault();
    importFontAsset();
    return;
  }
  var fontLibrary = event.target && event.target.closest ? event.target.closest("#font-asset-library") : null;
  if (fontLibrary) {
    event.preventDefault();
    if (window.NotificationHubPageRouter) window.NotificationHubPageRouter.load("font-assets-page");
    return;
  }
  var addName = event.target && event.target.closest ? event.target.closest("#glossary-add") : null;
  if (addName) {
    event.preventDefault();
    if (addName.classList.contains("is-locked") || addName.getAttribute("aria-disabled") === "true") return;
    addGlossaryName();
    markVisualDirty();
    syncPreview();
    return;
  }
  var delName = event.target && event.target.closest ? event.target.closest("[data-glossary-del]") : null;
  if (delName) {
    event.preventDefault();
    deleteGlossaryName(delName.getAttribute("data-glossary-del") || "");
    markVisualDirty();
    syncPreview();
    return;
  }
  var paintName = event.target && event.target.closest ? event.target.closest("[data-paint-name]") : null;
  if (paintName) {
    event.preventDefault();
    bindPaintName(paintName.getAttribute("data-paint-kind") || "fill", paintName.getAttribute("data-paint-name") || "");
    markVisualDirty();
    syncPreview();
    return;
  }
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
  var fitWidthChip = event.target && event.target.closest ? event.target.closest("#part-paint-fit-width") : null;
  if (fitWidthChip) {
    event.preventDefault();
    toggleSelectedFitWidth();
    markVisualDirty();
    syncPreview();
    return;
  }
  var fitCompensateChip = event.target && event.target.closest ? event.target.closest("#part-paint-fit-compensate") : null;
  if (fitCompensateChip) {
    event.preventDefault();
    toggleSelectedFitCompensate();
    markVisualDirty();
    syncPreview();
    return;
  }
  var bgOnChip = event.target && event.target.closest ? event.target.closest("#part-paint-background-on") : null;
  if (bgOnChip) {
    event.preventDefault();
    toggleSelectedPartBackground();
    markVisualDirty();
    syncPreview();
    return;
  }
  var rainbowChip = event.target && event.target.closest ? event.target.closest("#part-paint-rainbow") : null;
  if (rainbowChip) {
    event.preventDefault();
    toggleSelectedTextPaint();
    markVisualDirty();
    syncPreview();
    return;
  }
  var textStrokeChip = event.target && event.target.closest ? event.target.closest("#part-paint-text-stroke") : null;
  if (textStrokeChip) {
    event.preventDefault();
    toggleSelectedTextStroke();
    markVisualDirty();
    syncPreview();
    return;
  }
  var textStrokeRainbowChip = event.target && event.target.closest ? event.target.closest("#part-paint-text-stroke-rainbow") : null;
  if (textStrokeRainbowChip) {
    event.preventDefault();
    toggleSelectedTextStrokePaint();
    markVisualDirty();
    syncPreview();
    return;
  }
  var partStrokePaintChip = event.target && event.target.closest ? event.target.closest("#part-paint-stroke-paint") : null;
  if (partStrokePaintChip) {
    event.preventDefault();
    toggleSelectedStrokePaint();
    markVisualDirty();
    syncPreview();
    return;
  }
  var rootBorderPaintChip = event.target && event.target.closest ? event.target.closest("#prop-border-paint") : null;
  if (rootBorderPaintChip) {
    event.preventDefault();
    toggleRootBorderPaint();
    markVisualDirty();
    syncPreview();
    return;
  }
  var closeIconChip = event.target && event.target.closest ? event.target.closest("[data-close-icon]") : null;
  if (closeIconChip) {
    event.preventDefault();
    setCloseIcon(closeIconChip.getAttribute("data-close-icon") || "x");
    markVisualDirty();
    syncPreview();
    return;
  }
  var styleChip = event.target && event.target.closest ? event.target.closest("#part-paint-font-bold, #part-paint-font-italic, #part-paint-font-underline, #part-paint-font-strike") : null;
  if (styleChip) {
    event.preventDefault();
    var styleId = styleChip.id || "";
    var kind = styleId === "part-paint-font-bold" ? "bold" : styleId === "part-paint-font-italic" ? "italic" : styleId === "part-paint-font-underline" ? "underline" : styleId === "part-paint-font-strike" ? "strike" : "";
    if (kind) toggleSelectedTextStyle(kind);
    markVisualDirty();
    syncPreview();
    return;
  }
  var showChip = event.target && event.target.closest ? event.target.closest("#part-show") : null;
  if (showChip) {
    event.preventDefault();
    if (showChip.getAttribute("aria-disabled") === "true" || showChip.classList.contains("is-locked")) return;
    toggleSelectedPartShow();
    markVisualDirty();
    syncPreview();
    return;
  }
  var partChip = event.target && event.target.closest ? event.target.closest("#part-chip-row [data-part]") : null;
  if (partChip) {
    event.preventDefault();
    if (partChip.hasAttribute("hidden")) return;
    selectPart(partChip.getAttribute("data-part"));
    return;
  }
  var dock = event.target && event.target.closest ? event.target.closest(".dock-cell") : null;
  if (dock) {
    var anchor = dock.getAttribute("data-anchor");
    setControl("prop-anchor", anchor);
    document.querySelectorAll(".dock-cell").forEach(function (c) { c.classList.toggle("is-on", c === dock); });
    refreshDockMargins();
    refreshGrowPad();
    refreshWrapPad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var growCell = event.target && event.target.closest ? event.target.closest(".grow-cell") : null;
  if (growCell && growCell.getAttribute("aria-disabled") !== "true" && !growCell.disabled) {
    var grow = growCell.getAttribute("data-grow");
    setControl("prop-grow", grow);
    document.querySelectorAll(".grow-cell").forEach(function (c) {
      var on = c === growCell && c.getAttribute("aria-disabled") !== "true";
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    refreshWrapPad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var wrapOpen = event.target && event.target.closest ? event.target.closest("[data-wrap-open]") : null;
  if (wrapOpen) {
    var wantOpen = wrapOpen.getAttribute("data-wrap-open") !== "off";
    setControl("prop-wrap", wantOpen ? lastWrapPath : "off");
    refreshWrapPad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var wrapPath = event.target && event.target.closest ? event.target.closest("[data-wrap-path]") : null;
  if (wrapPath && wrapPath.getAttribute("aria-disabled") !== "true") {
    var nextWrap = wrapPath.getAttribute("data-wrap-path");
    if (nextWrap === "snake" || nextWrap === "parallel" || nextWrap === "coil") lastWrapPath = nextWrap;
    setControl("prop-wrap", nextWrap);
    refreshWrapPad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var newestChip = event.target && event.target.closest ? event.target.closest("[data-newest]") : null;
  if (newestChip) {
    var nextNewest = newestChip.getAttribute("data-newest") === "next" ? "next" : "dock";
    setControl("prop-newest", nextNewest);
    refreshNewestPad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var settleChip = event.target && event.target.closest ? event.target.closest("[data-settle]") : null;
  if (settleChip) {
    var nextSettle = settleChip.getAttribute("data-settle") === "snap" ? "snap" : "follow";
    setControl("prop-settle", nextSettle);
    refreshSettlePad();
    markVisualDirty();
    syncPreview();
    return;
  }
  var directionChip = event.target && event.target.closest ? event.target.closest("[data-ticker-direction]") : null;
  if (directionChip) {
    applyTickerDirection(directionChip.getAttribute("data-ticker-direction"));
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
    markVisualDirty();
    syncPreview();
    return;
  }
  var passBtn = event.target && event.target.closest ? event.target.closest("#ticker-click-through") : null;
  if (passBtn) {
    var passNext = passBtn.getAttribute("aria-pressed") !== "true";
    passBtn.setAttribute("aria-pressed", passNext ? "true" : "false");
    passBtn.classList.toggle("is-on", passNext);
    syncTickerHoverLock();
    markVisualDirty();
    syncPreview();
    return;
  }
  var dismissChip = event.target && event.target.closest ? event.target.closest("#prop-dismiss-close, #prop-dismiss-anywhere, #prop-dismiss-auto") : null;
  if (dismissChip) {
    if (dismissChip.id === "prop-dismiss-auto") {
      var autoNext = dismissChip.getAttribute("aria-pressed") !== "true";
      setPressed("prop-dismiss-auto", autoNext);
    } else {
      setDismissChips(dismissChip.getAttribute("data-dismiss") || "closeButton");
    }
    markVisualDirty();
    syncPreview();
    return;
  }
  var hoverBtn = event.target && event.target.closest ? event.target.closest("#prop-hover-highlight, #ticker-hover-highlight") : null;
  if (hoverBtn) {
    if (hoverBtn.classList && hoverBtn.classList.contains("is-locked") || hoverBtn.getAttribute("aria-disabled") === "true") {
      var toast = $("visual-preview-toast");
      if (toast) { toast.textContent = "不挡点击开着时，弹幕吃不到鼠标。"; toast.className = "toast"; }
      return;
    }
    var hoverNext = hoverBtn.getAttribute("aria-pressed") !== "true";
    setPressed("prop-hover-highlight", hoverNext);
    setPressed("ticker-hover-highlight", hoverNext);
    markVisualDirty();
    syncPreview();
    return;
  }
  var pauseBtn = event.target && event.target.closest ? event.target.closest("#ticker-hover-pause") : null;
  if (pauseBtn) {
    if (pauseBtn.classList && pauseBtn.classList.contains("is-locked") || pauseBtn.getAttribute("aria-disabled") === "true") {
      var pauseToast = $("visual-preview-toast");
      if (pauseToast) { pauseToast.textContent = "不挡点击开着时，弹幕吃不到鼠标。"; pauseToast.className = "toast"; }
      return;
    }
    setPressed("ticker-hover-pause", pauseBtn.getAttribute("aria-pressed") !== "true");
    markVisualDirty();
    syncPreview();
    return;
  }
  var holdDragBtn = event.target && event.target.closest ? event.target.closest("#prop-hold-drag") : null;
  if (holdDragBtn) {
    if (holdDragBtn.classList && holdDragBtn.classList.contains("is-locked") || holdDragBtn.getAttribute("aria-disabled") === "true") {
      var dragToast = $("visual-preview-toast");
      if (dragToast) { dragToast.textContent = "任意点击关卡时，按住会当成点击，没法拖。"; dragToast.className = "toast"; }
      return;
    }
    var holdNext = holdDragBtn.getAttribute("data-intent") !== "on";
    holdDragBtn.setAttribute("data-intent", holdNext ? "on" : "off");
    setPressed("prop-hold-drag", holdNext);
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
  requestOptions.cache = options.cache || "no-store";
  requestOptions.headers = Object.assign({ "Accept": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" }, options.headers || {});
  var formBody = typeof FormData === "function" && options.body instanceof FormData;
  if (options.body !== undefined && !formBody && !requestOptions.headers["Content-Type"] && !requestOptions.headers["content-type"]) requestOptions.headers["Content-Type"] = "application/json";
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
function readPackageAsBase64(file) {
  return new Promise(function (resolve, reject) {
    if (!file) {
      reject(Object.assign(new Error("视觉配置包文件不能为空"), { code: "VISUAL_PACKAGE_FILE_INVALID" }));
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var result = String(reader.result || "");
      var comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = function () {
      reject(Object.assign(new Error("无法读取配置包文件"), { code: "VISUAL_PACKAGE_FILE_INVALID" }));
    };
    reader.readAsDataURL(file);
  });
}
function json(path, options) {
  return Promise.resolve(request(path, options)).then(readJsonPayload).then(function (parsed) {
    var data = parsed.data || {};
    if (parsed.ok === false || data.ok === false) {
      var e = new Error((data.error && data.error.message) || "请求失败");
      e.code = (data.error && data.error.code) || "VISUAL_PREVIEW_REQUEST_FAILED";
      e.details = (data.error && data.error.details) || {};
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
function studioNativeBody() {
  return { draft: collect(), sampleAgent: sampleAgentIdentity() };
}
function collect() {
  if (typeof flushSelectedPartEditor === "function") flushSelectedPartEditor();
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
      width: integer("prop-width", 420, 1, 1920),
      height: integer("prop-height", 220, 1, 1080),
      backgroundColor: value("skin-bg-color", "#0e1916"),
      backgroundAssetId: value("skin-bg-asset", "") || null,
      backgroundFit: value("skin-bg-fit", "fill"),
      backgroundPadding: number("skin-bg-padding", 0),
      borderRadius: integer("prop-border-radius", 16, 0, 480),
      opacity: Math.max(0, Math.min(1, number("prop-opacity", 0.96))),
      borderWidth: integer("prop-border-width", 0, 0, 32),
      borderColor: value("prop-border-color", "#62d0a8"),
      paintOverflow: integer("prop-paint-overflow", 0, 0, 240)
    }
  };
  var borderPaintOn = typeof pressed === "function" && pressed("prop-border-paint");
  if (!borderPaintOn) {
    var borderPaintChip = $("prop-border-paint");
    borderPaintOn = !!(borderPaintChip && borderPaintChip.getAttribute && borderPaintChip.getAttribute("aria-pressed") === "true");
  }
  if (borderPaintOn) draft.appearance.borderPaint = "gradient";
  if (draft.appearance.backgroundAssetId) {
    var bgScale = number("skin-bg-scale", 1);
    var bgX = number("skin-bg-x", 0.5);
    var bgY = number("skin-bg-y", 0.5);
    if (bgScale !== 1 || bgX !== 0.5 || bgY !== 0.5) {
      draft.appearance.backgroundScale = Math.max(0.2, Math.min(8, bgScale));
      draft.appearance.backgroundX = Math.max(0, Math.min(1, bgX));
      draft.appearance.backgroundY = Math.max(0, Math.min(1, bgY));
    }
  }
  draft = Object.assign(draft, {
    properties: {
      space: {
        size: value("prop-size", "medium"),
        anchor: value("prop-anchor", "bottom-right"),
        grow: (function () {
          var anchor = value("prop-anchor", "bottom-right");
          var grow = value("prop-grow", "");
          var allowed = { up: anchor.slice(0, 3) !== "top", down: anchor.slice(0, 6) !== "bottom", left: anchor.slice(-4) !== "left", right: anchor.slice(-5) !== "right" };
          if (allowed[grow]) return grow;
          return anchor.slice(0, 3) === "top" ? "down" : "up";
        })(),
        wrap: (function () {
          var wrap = value("prop-wrap", "parallel");
          if (wrap === "off" || wrap === "snake" || wrap === "parallel" || wrap === "coil") return wrap;
          return "parallel";
        })(),
        settle: value("prop-settle", "follow") === "snap" ? "snap" : "follow",
        newest: value("prop-newest", "dock") === "next" ? "next" : "dock",
        gap: integer("prop-gap", 8, 0),
        marginLeft: integer("prop-margin-left", 18, 0),
        marginRight: integer("prop-margin-right", 18, 0),
        marginTop: integer("prop-margin-top", 18, 0),
        marginBottom: integer("prop-margin-bottom", 18, 0),
        layout: value("prop-layout", "simple")
      },
      shape: { borderRadius: integer("prop-border-radius", 16, 0, 480), opacity: Math.max(0, Math.min(1, number("prop-opacity", 0.96))), blur: 0, shadow: "none", borderWidth: integer("prop-border-width", 0, 0, 32), borderColor: value("prop-border-color", "#62d0a8") },
      typography: { titleLines: 1, bodyLines: 4, fontScale: 1, lineHeight: 1.55, textOverflow: "ellipsis" },
      lifecycle: { durationMs: number("prop-duration", 30000), enterDurationMs: 260, holdDurationMs: number("prop-hold-duration", 30000), exitDurationMs: 200 },
      interaction: { dismissMode: (function () {
        var mode = value("prop-dismiss-mode", "closeButton");
        return mode === "anywhere" ? "anywhere" : "closeButton";
      })(), closeButtonPosition: "top-right", timeoutMs: number("prop-hold-duration", 30000), autoDismiss: (function () {
        var autoBtn = $("prop-dismiss-auto");
        return autoBtn && autoBtn.getAttribute && autoBtn.getAttribute("aria-pressed") === "true" ? "on" : "off";
      })(), hoverPause: "off", hoverHighlight: (function () {
        var behavior = ($("pipeline-behavior") && $("pipeline-behavior").value) || (state.profile && state.profile.behaviorId) || "stack";
        var passOn = !($("ticker-click-through") && $("ticker-click-through").getAttribute && $("ticker-click-through").getAttribute("aria-pressed") === "false");
        if (behavior === "ticker" && passOn) return "off";
        var stack = $("prop-hover-highlight");
        var tick = $("ticker-hover-highlight");
        var on = (stack && stack.getAttribute && stack.getAttribute("aria-pressed") === "true") || (tick && tick.getAttribute && tick.getAttribute("aria-pressed") === "true");
        return on ? "on" : "off";
      })(), holdDrag: (function () {
        var btn = $("prop-hold-drag");
        if (!btn || typeof btn.getAttribute !== "function") return "on";
        var intent = btn.getAttribute("data-intent");
        if (intent === "on" || intent === "off") return intent;
        return btn.getAttribute("aria-pressed") === "false" ? "off" : "on";
      })(), expandable: "off", clickable: "off" },
      resource: { maxVisible: 0, maxActive: 0, maxParticles: 0, overflow: "allow" }
    },
    skin: {
      skinId: "skin.default",
      semanticColors: { title: "#F2FFF9", body: "#C5D8D0", assistantName: "#62D0A8", metadata: "#8EA69C", status: "#F1C77A" },
      background: { color: value("skin-bg-color", "#0e1916"), assetId: value("skin-bg-asset", "") || null, fit: value("skin-bg-fit", "fill"), padding: number("skin-bg-padding", 0) },
      decoration: { borderRadius: integer("prop-border-radius", 16, 0, 480), opacity: Math.max(0, Math.min(1, number("prop-opacity", 0.96))), shadow: "none", borderWidth: integer("prop-border-width", 0, 0, 32), borderColor: value("prop-border-color", "#62d0a8"), blur: 0, density: "standard" }
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
  });
  var parts = {};
  ["title", "body", "close", "icon", "assistantName"].forEach(function (id) {
    var fillEl = $("part-" + id + "-fill");
    var strokeEl = $("part-" + id + "-stroke");
    var widthEl = $("part-" + id + "-stroke-width");
    var paint = {};
    if (fillEl && fillEl.value) paint.fill = fillEl.value;
    var bgEl = $("part-" + id + "-background");
    if (bgEl && bgEl.value) paint.background = bgEl.value;
    var opEl = $("part-" + id + "-opacity");
    if (opEl && opEl.value !== "") {
      var opacity = Number(opEl.value);
      if (Number.isFinite(opacity) && opacity !== 1) paint.opacity = Math.max(0, Math.min(1, opacity));
    }
    if (id !== "icon") {
      var partAssetEl = $("part-" + id + "-bg-asset");
      if (partAssetEl && partAssetEl.value) {
        paint.backgroundAssetId = partAssetEl.value;
        var partScale = number("part-" + id + "-bg-scale", 1);
        var partX = number("part-" + id + "-bg-x", 0.5);
        var partY = number("part-" + id + "-bg-y", 0.5);
        if (partScale !== 1 || partX !== 0.5 || partY !== 0.5) {
          paint.backgroundScale = Math.max(0.2, Math.min(8, partScale));
          paint.backgroundX = Math.max(0, Math.min(1, partX));
          paint.backgroundY = Math.max(0, Math.min(1, partY));
        }
      }
    }
    if (strokeEl && strokeEl.value) paint.stroke = strokeEl.value;
    var strokePaintEl = $("part-" + id + "-stroke-paint");
    if (strokePaintEl && strokePaintEl.value === "gradient") paint.strokePaint = "gradient";
    if (widthEl && widthEl.value !== undefined && widthEl.value !== "") {
      var width = Math.round(Number(widthEl.value));
      if (Number.isFinite(width)) {
        width = Math.max(0, Math.min(32, width));
        if (width > 0 || Object.keys(paint).length > 0) paint.strokeWidth = width;
      }
    }
    var xEl = $("part-" + id + "-x");
    var yEl = $("part-" + id + "-y");
    var wEl = $("part-" + id + "-w");
    var hEl = $("part-" + id + "-h");
    if (xEl && xEl.value !== "") {
      var x = Math.round(Number(xEl.value));
      if (Number.isFinite(x)) paint.x = Math.max(0, Math.min(1920, x));
    }
    if (yEl && yEl.value !== "") {
      var y = Math.round(Number(yEl.value));
      if (Number.isFinite(y)) paint.y = Math.max(0, Math.min(1080, y));
    }
    if (wEl && wEl.value !== "") {
      var partW = Math.round(Number(wEl.value));
      if (Number.isFinite(partW) && partW > 0) paint.w = Math.max(1, Math.min(1920, partW));
    }
    if (hEl && hEl.value !== "") {
      var partH = Math.round(Number(hEl.value));
      if (Number.isFinite(partH) && partH > 0) paint.h = Math.max(1, Math.min(1080, partH));
    }
    var radiusEl = $("part-" + id + "-radius");
    if (radiusEl && radiusEl.value !== "") {
      var radius = Math.round(Number(radiusEl.value));
      if (Number.isFinite(radius)) paint.radius = Math.max(0, Math.min(240, radius));
    }
    if (id === "icon") {
      var iconShowEl = $("part-icon-show");
      paint.show = !!(iconShowEl && iconShowEl.value === "true");
      var sourceEl = $("part-icon-source");
      paint.source = sourceEl && sourceEl.value === "custom" ? "custom" : "assistant";
      var assetEl = $("part-icon-asset-id");
      paint.assetId = paint.source === "custom" && assetEl && assetEl.value ? assetEl.value : null;
      var iconScale = number("part-icon-bg-scale", 1);
      var iconX = number("part-icon-bg-x", 0.5);
      var iconY = number("part-icon-bg-y", 0.5);
      if (iconScale !== 1 || iconX !== 0.5 || iconY !== 0.5) {
        paint.backgroundScale = Math.max(0.2, Math.min(8, iconScale));
        paint.backgroundX = Math.max(0, Math.min(1, iconX));
        paint.backgroundY = Math.max(0, Math.min(1, iconY));
      }
    }
    if (id === "assistantName") {
      var nameShowEl = $("part-assistantName-show");
      paint.show = !!(nameShowEl && nameShowEl.value === "true");
    }
    if (id === "title" || id === "assistantName") {
      var fitEl = $("part-" + id + "-fit-width");
      if (fitEl && fitEl.value === "true") paint.fitWidth = true;
      var compensateEl = $("part-" + id + "-fit-compensate");
      if (compensateEl && compensateEl.value === "true") paint.fitCompensate = true;
    }
    if (id === "title" || id === "body" || id === "assistantName") {
      if (id === "title" || id === "body") {
        var showEl = $("part-" + id + "-show");
        paint.show = !(showEl && showEl.value === "false");
        var contentSourceEl = $("part-" + id + "-content-source");
        if (contentSourceEl && contentSourceEl.value === "custom") paint.contentSource = "custom";
        var customTextEl = $("part-" + id + "-custom-text");
        if (customTextEl && customTextEl.value) paint.customText = customTextEl.value;
      }
      var sizeEl = $("part-" + id + "-font-size");
      if (sizeEl && sizeEl.value !== "") {
        var fontSize = Math.round(Number(sizeEl.value));
        if (Number.isFinite(fontSize)) paint.fontSize = Math.max(8, Math.min(72, fontSize));
      }
      var familyEl = $("part-" + id + "-font-family");
      if (familyEl && familyEl.value) {
        if (familyEl.value.indexOf("font:") === 0) paint.fontAssetId = familyEl.value.slice(5);
        else if (familyEl.value === "yahei" || familyEl.value === "heiti" || familyEl.value === "songti" || familyEl.value === "segoe") {
          paint.fontFamily = familyEl.value;
          paint.fontAssetId = null;
        }
      }
      var paintEl = $("part-" + id + "-text-paint");
      paint.textPaint = paintEl && paintEl.value === "rainbow" ? "rainbow" : "solid";
      var boldEl = $("part-" + id + "-font-bold");
      if (boldEl && (boldEl.value === "true" || boldEl.value === "false")) paint.fontBold = boldEl.value === "true";
      else if (id === "title") paint.fontBold = true;
      var italicEl = $("part-" + id + "-font-italic");
      paint.fontItalic = !!(italicEl && italicEl.value === "true");
      var underlineEl = $("part-" + id + "-font-underline");
      paint.fontUnderline = !!(underlineEl && underlineEl.value === "true");
      var strikeEl = $("part-" + id + "-font-strike");
      paint.fontStrike = !!(strikeEl && strikeEl.value === "true");
      var textStrokeEl = $("part-" + id + "-text-stroke");
      if (textStrokeEl && textStrokeEl.value === "true") {
        paint.textStroke = true;
        var textStrokeColorEl = $("part-" + id + "-text-stroke-color");
        if (textStrokeColorEl && textStrokeColorEl.value) {
          if (/^#[0-9a-fA-F]{6}$/.test(textStrokeColorEl.value) || (textStrokeColorEl.value.charAt(0) !== "#" && textStrokeColorEl.value.length <= 12)) {
            paint.textStrokeColor = textStrokeColorEl.value;
          }
        }
        var textStrokeWidthEl = $("part-" + id + "-text-stroke-width");
        if (textStrokeWidthEl && textStrokeWidthEl.value !== "") {
          var textStrokeWidth = Math.round(Number(textStrokeWidthEl.value));
          if (Number.isFinite(textStrokeWidth)) paint.textStrokeWidth = Math.max(1, Math.min(16, textStrokeWidth));
        }
        var textStrokePaintEl = $("part-" + id + "-text-stroke-paint");
        if (textStrokePaintEl && textStrokePaintEl.value === "rainbow") paint.textStrokePaint = "rainbow";
      }
    }
    if (id === "close") {
      var closeIconEl = $("part-close-icon");
      if (closeIconEl && closeIconEl.value && closeIconEl.value !== "x") paint.closeIcon = closeIconEl.value;
      var closeIconColorEl = $("part-close-icon-color");
      if (closeIconColorEl && /^#[0-9a-fA-F]{6}$/.test(closeIconColorEl.value)) paint.closeIconColor = closeIconColorEl.value;
    }
    if (Object.keys(paint).length) parts[id] = paint;
  });
  if (Object.keys(parts).length) draft.parts = parts;
  var glossary = {};
  try {
    var raw = value("glossary-json", "{}");
    if (raw) glossary = JSON.parse(raw) || {};
  } catch (error) { glossary = {}; }
  if (glossary && typeof glossary === "object" && !Array.isArray(glossary) && Object.keys(glossary).length) draft.glossary = glossary;
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
      hoverPause: (function () {
        if (!($("ticker-click-through") && $("ticker-click-through").getAttribute && $("ticker-click-through").getAttribute("aria-pressed") === "false")) return false;
        var pause = $("ticker-hover-pause");
        return !!(pause && pause.getAttribute && pause.getAttribute("aria-pressed") === "true");
      })(),
      overflow: (p.ticker && p.ticker.overflow) || "avoid",
      direction: value("ticker-direction", "left")
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
    flight: behaviorId,
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
  Promise.resolve(json("visual-preview/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studioNativeBody()) })).then(function (result) {
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
  if ($("visual-try-one")) $("visual-try-one").disabled = !enabled;
  if ($("open-visual-preview")) $("open-visual-preview").disabled = !enabled && !previewOpen;
}
function markVisualDirty() {
  var status = $("visual-page-status");
  if (status) status.textContent = "未保存";
}
function hydrateVisualFromServer() {
  return Promise.resolve(json("visual-settings-status", { method: "POST", cache: "no-store", headers: { "Cache-Control": "no-store", Pragma: "no-cache" } })).then(function (result) {
    if (!result || !result.profile) return result;
    state = result;
    var type = (result.profile.card && result.profile.card.activeType) || ($("pipeline-type") && $("pipeline-type").value) || "minimal";
    if ($("pipeline-type")) $("pipeline-type").value = type;
    if ($("pipeline-behavior") && result.profile.behaviorId) $("pipeline-behavior").value = result.profile.behaviorId;
    if ($("global-visual-enabled") && result.profile.global) $("global-visual-enabled").checked = result.profile.global.enabled !== false;
    if (typeof applyModeEditor === "function") applyModeEditor(type, true);
    var pageStatus = $("visual-page-status");
    if (pageStatus) pageStatus.textContent = "已保存";
    return result;
  }).catch(function () { return null; });
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
var syncIds = ["global-visual-enabled", "global-visual-default-mode", "prop-size", "prop-anchor", "prop-grow", "prop-wrap", "prop-newest", "prop-settle", "prop-margin-left", "prop-margin-right", "prop-margin-top", "prop-margin-bottom", "prop-gap", "prop-layout", "prop-width", "prop-height", "prop-border-radius", "prop-opacity", "prop-border-width", "prop-border-color", "prop-paint-overflow", "part-paint-fill", "part-paint-fill-box", "part-paint-background", "part-paint-opacity", "part-paint-bg-asset", "part-paint-stroke", "part-paint-stroke-width", "part-paint-x", "part-paint-y", "part-paint-w", "part-paint-h", "part-paint-radius", "part-paint-font-size", "part-paint-font-family", "part-paint-text-stroke-color", "part-paint-text-stroke-width", "part-paint-close-icon-color", "part-icon-asset", "part-custom-text", "studio-sample-agent", "prop-duration", "prop-hold-duration", "prop-dismiss-mode", "skin-bg-color", "skin-bg-asset", "skin-bg-fit", "skin-bg-padding", "skin-bg-scale", "skin-bg-x", "skin-bg-y", "pipeline-behavior", "pipeline-type", "ticker-speed", "ticker-band", "ticker-band-ratio", "ticker-track-count", "ticker-track-gap", "ticker-min-gap", "ticker-direction"];
var syncIdSet = {};
syncIds.forEach(function (id) { syncIdSet[id] = true; });
function clampNumberInput(el, hard) {
  if (!el || el.type !== "number" || el.disabled) return;
  var raw = String(el.value || "");
  if (raw === "") return;
  if (!hard && (raw === "-" || raw === "." || raw === "-." || /\.$/.test(raw))) return;
  var n = Number(raw);
  if (!Number.isFinite(n)) return;
  var min = el.min !== "" ? Number(el.min) : NaN;
  var max = el.max !== "" ? Number(el.max) : NaN;
  if (Number.isFinite(max) && n > max) {
    el.value = String(max);
    n = max;
  }
  if (hard && Number.isFinite(min) && n < min) el.value = String(min);
}
if (window.__notificationHubVisualDispose) window.__notificationHubVisualDispose();
function visualInputHandler(event) {
  var target = event && event.target;
  if (!target) return;
  if (target.type === "number") clampNumberInput(target, event.type !== "input");
  if (target.classList && (target.classList.contains("glossary-name") || target.classList.contains("glossary-color"))) {
    syncGlossaryFromRows();
    markVisualDirty();
    syncPreview();
    return;
  }
  if (target.id === "hold-seconds") {
    if (typeof syncStudioReadouts === "function") syncStudioReadouts(target);
    markVisualDirty();
    syncPreview();
    return;
  }
  if (!syncIdSet[target.id]) return;
  if (target.id === "part-paint-fill" || target.id === "part-paint-fill-box" || target.id === "part-paint-background" || target.id === "part-paint-opacity" || target.id === "part-paint-bg-asset" || target.id === "part-paint-stroke" || target.id === "part-paint-stroke-width" || target.id === "part-paint-text-stroke-color" || target.id === "part-paint-text-stroke-width" || target.id === "part-paint-close-icon-color") writeSelectedPartPaint();
  if (target.id === "part-paint-x" || target.id === "part-paint-y" || target.id === "part-paint-w" || target.id === "part-paint-h" || target.id === "part-paint-radius") writeSelectedPartAxis(target.id.slice("part-paint-".length));
  if (target.id === "part-icon-asset") setControl("part-icon-asset-id", target.value || "");
  if (target.id === "part-custom-text") {
    var contentPart = selectedPart();
    if (isContentSourcePart(contentPart)) setControl("part-" + contentPart + "-custom-text", target.value || "");
    syncCustomTextCount();
  }
  if (target.id === "part-paint-bg-asset") {
    var partId = selectedPart();
    if (partId && partId !== "root" && partId !== "icon") {
      setControl("part-" + partId + "-bg-asset", target.value || "");
      setControl("part-" + partId + "-bg-scale", 1);
      setControl("part-" + partId + "-bg-x", 0.5);
      setControl("part-" + partId + "-bg-y", 0.5);
    }
  }
  if (target.id === "part-paint-font-size" || target.id === "part-paint-font-family") writeSelectedPartFont();
  if (target.id === "skin-bg-asset") writeBgTransform(1, 0.5, 0.5);
  if (event.type === "change" && target.id === "pipeline-type" && typeof applyModeEditor === "function") applyModeEditor(target.value);
  if (target.id === "global-visual-enabled" && typeof applyGlobalVisualState === "function") applyGlobalVisualState();
  markVisualDirty();
  if (typeof syncStudioReadouts === "function") syncStudioReadouts(target);
  if ((target.id === "prop-width" || target.id === "prop-height" || target.id === "prop-size") && typeof selectedPart === "function" && selectedPart() !== "root") selectPart(selectedPart());
  syncPreview();
}
window.__notificationHubVisualInputHandler = visualInputHandler;
window.__notificationHubVisualChangeHandler = visualInputHandler;
function visualNumberBlurHandler(event) {
  var t = event && event.target;
  if (t && t.type === "number") clampNumberInput(t, true);
}
document.addEventListener("input", visualInputHandler);
document.addEventListener("change", visualInputHandler);
document.addEventListener("blur", visualNumberBlurHandler, true);
function ignoreControlWheel(event) {
  var target = event.target;
  if (!target || !target.closest) return;
  if (target.closest("input, select, textarea")) event.preventDefault();
}
document.addEventListener("wheel", ignoreControlWheel, { capture: true, passive: false });
var previewButton = $("open-visual-preview");
if (typeof bindBgAdjust === "function") bindBgAdjust();
if (typeof applyGlobalVisualState === "function") applyGlobalVisualState();
if (typeof applyModeEditor === "function") applyModeEditor(($("pipeline-type") && $("pipeline-type").value) || "minimal", true);
if (typeof selectPart === "function") selectPart(rememberedSelectedPart() || ($("part-selected") && $("part-selected").value) || "root", true);
if (typeof hydrateVisualFromServer === "function") hydrateVisualFromServer();
if (typeof renderGlossaryRows === "function") renderGlossaryRows();
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
  Promise.resolve(json("visual-preview/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studioNativeBody()) })).then(function (result) {
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
var openAssetsBtn = $("open-visual-assets");
if (openAssetsBtn) openAssetsBtn.addEventListener("click", function () {
  if (window.NotificationHubPageRouter) window.NotificationHubPageRouter.load("visual-assets-page");
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
  Promise.resolve(json("visual-try-one", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studioNativeBody()) })).then(function (result) {
    var text = "已试一条" + (result.behaviorId === "ticker" ? "弹幕" : "堆叠");
    if (result.overflowHint) text += "，" + result.overflowHint;
    feedback("visual-settings-feedback", text, "success");
    loadVisualDiagnostics().catch(function () {});
  }).catch(function (error) {
    feedback("visual-settings-feedback", studioErrorText(error), "error");
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
  document.removeEventListener("blur", visualNumberBlurHandler, true);
  document.removeEventListener("wheel", ignoreControlWheel, true);
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
    var action = '<button type="button" class="secondary profile-rename" data-profile-id="' + esc(p.profileId) + '" data-profile-name="' + esc(p.name) + '">重命名</button><button type="button" class="secondary profile-export" data-profile-id="' + esc(p.profileId) + '" data-profile-name="' + esc(p.name) + '">导出</button>' + (canDelete ? '<button type="button" class="secondary profile-delete" data-profile-id="' + esc(p.profileId) + '" data-profile-name="' + esc(p.name) + '">删除</button>' : "");
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
function exportAllProfiles(button) {
  var ids = (state.profiles || []).map(function (p) { return p.profileId; }).filter(function (id) { return id && id !== "visual.default"; });
  if (!ids.length) {
    profileFeedback.textContent = "没有可导出的自定义配置包";
    profileFeedback.className = "feedback error";
    return;
  }
  if (button) button.disabled = true;
  profileFeedback.textContent = "正在导出全部配置包…";
  Promise.resolve(json("visual-package-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileIds: ids, meta: { packageName: "视觉配置" } }) })).then(function (data) {
    profileFeedback.textContent = data.cancelled ? "已取消导出" : "已导出 " + ids.length + " 份配置包：" + (data.savedFilename || "已完成");
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
var exportAllBtn = $("visual-profile-export-all");
var importBtn = $("visual-profile-import");
var packageFile = $("visual-package-file");
var missingDialog = $("visual-missing-asset-dialog");
var missingList = $("visual-missing-asset-list");
var missingClear = $("visual-missing-clear");
var missingCancel = $("visual-missing-cancel");
var importDialog = $("visual-import-dialog");
var importName = $("visual-import-name");
var importConflict = $("visual-import-conflict");
var importDefaultGuard = $("visual-import-default-guard");
var importSync = $("visual-import-sync-events");
var importOverwrite = $("visual-import-overwrite");
var importKeep = $("visual-import-keep");
var importCommit = $("visual-import-commit");
var importCancel = $("visual-import-cancel");
var renameDialog = $("visual-rename-dialog");
var renameInput = $("visual-rename-input");
var renameConfirm = $("visual-rename-confirm");
var renameCancel = $("visual-rename-cancel");
var pendingPackageFile = null;
var pendingImportPreview = null;
var pendingClearMissing = false;
var pendingMissingMode = null;
var pendingRenameId = null;
function closeMissingDialog() {
  if (missingDialog) missingDialog.style.display = "none";
}
function closeImportDialog() {
  pendingPackageFile = null;
  pendingImportPreview = null;
  pendingClearMissing = false;
  if (importDialog) importDialog.style.display = "none";
  if (packageFile) packageFile.value = "";
}
function closeRenameDialog() {
  pendingRenameId = null;
  if (renameDialog) renameDialog.style.display = "none";
}
function openRenameDialog(profile) {
  pendingRenameId = profile.profileId;
  if (renameInput) renameInput.value = profile.name || profile.profileId;
  if (renameDialog) renameDialog.style.display = "flex";
  if (renameInput) renameInput.focus();
}
function confirmRenameProfile() {
  if (!pendingRenameId || !renameInput) return;
  var name = renameInput.value.trim();
  if (!name) {
    profileFeedback.textContent = "请输入配置包名称";
    profileFeedback.className = "feedback error";
    return;
  }
  var id = pendingRenameId;
  Promise.resolve(json("visual-profiles/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: id, name: name }) })).then(function (result) {
    if (result.profile) upsertProfileState(result.profile);
    refreshProfiles();
    profileFeedback.textContent = "已重命名：" + name;
    profileFeedback.className = "feedback success";
    closeRenameDialog();
  }).catch(function (error) {
    profileFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    profileFeedback.className = "feedback error";
  });
}
function applyImportedLook(report) {
  var registered = report && report.profiles && report.profiles.registered && report.profiles.registered[0];
  if (!registered || !registered.profile) return Promise.resolve();
  return Promise.resolve(json("visual-settings-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: registered.profile }) })).then(function () {
    return hydrateVisualFromServer();
  }).catch(function () { return null; });
}
function commitVisualPackageImport(strategy) {
  if (!pendingPackageFile) return;
  var file = pendingPackageFile;
  profileFeedback.textContent = "正在导入配置包…";
  profileFeedback.className = "feedback";
  Promise.resolve(readPackageAsBase64(file)).then(function (base64) {
    return json("visual-package-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64: base64, strategy: strategy, applyBindings: !(importSync && importSync.checked === false), clearMissingAssets: !!pendingClearMissing, clearMissingFonts: !!pendingClearMissing }) });
  }).then(function (result) {
    var report = result.report || {};
    if (report.failed) {
      profileFeedback.textContent = "导入失败，已回滚：" + (report.failedStage || "unknown") + (report.error && report.error.message ? " · " + report.error.message : "");
      profileFeedback.className = "feedback error";
      closeImportDialog();
      return;
    }
    return Promise.resolve(json("visual-profiles", { method: "GET" })).then(function (data) {
      state.profiles = Array.isArray(data.profiles) ? data.profiles : state.profiles;
      refreshProfiles();
      loadBoundEvents().catch(function () {});
      return applyImportedLook(report);
    }).then(function () {
      var count = report.profiles && report.profiles.registered ? report.profiles.registered.length : 0;
      var skipped = report.profiles && report.profiles.skipped ? report.profiles.skipped.length : 0;
      profileFeedback.textContent = count ? "配置包已导入" : (skipped ? "已保留本地配置包" : "配置包未改动");
      profileFeedback.className = "feedback success";
      closeImportDialog();
    });
  }).catch(function (error) {
    profileFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    profileFeedback.className = "feedback error";
  });
}
function openImportDialog(preview) {
  pendingImportPreview = preview || {};
  var conflict = Number(pendingImportPreview.conflictProfiles || 0) > 0;
  var protectedConflict = Array.isArray(pendingImportPreview.profiles) && pendingImportPreview.profiles.some(function (item) { return item && item.protected; });
  if (importName) importName.textContent = pendingImportPreview.packageName || pendingImportPreview.packageId || pendingPackageFile && pendingPackageFile.name || "未命名";
  if (importConflict) importConflict.hidden = !conflict;
  if (importDefaultGuard) importDefaultGuard.hidden = !protectedConflict;
  if (importSync) importSync.checked = true;
  if (importOverwrite) {
    importOverwrite.style.display = conflict && !protectedConflict ? "" : "none";
    importOverwrite.disabled = !!protectedConflict;
  }
  if (importKeep) importKeep.style.display = conflict ? "" : "none";
  if (importCommit) importCommit.style.display = conflict ? "none" : "";
  if (importDialog) importDialog.style.display = "flex";
}
function openMissingDialog(preview, mode) {
  preview = preview || {};
  pendingMissingMode = mode || "import";
  var missingAssets = Array.isArray(preview.missingAssets) ? preview.missingAssets : [];
  var missingFonts = Array.isArray(preview.missingFonts) ? preview.missingFonts : [];
  var copyEl = $("visual-missing-copy");
  if (copyEl) {
    if (missingAssets.length && missingFonts.length) copyEl.textContent = "配置包用到的底图或字体在库里找不到。缺的是：";
    else if (missingFonts.length) copyEl.textContent = "配置包用到的字体在字体库里找不到。缺的是：";
    else copyEl.textContent = "配置包用到的底图在素材库里找不到。缺的是：";
  }
  if (missingClear) {
    if (missingAssets.length && missingFonts.length) missingClear.textContent = "去掉缺失项并导入";
    else if (missingFonts.length) missingClear.textContent = "回雅黑导入";
    else missingClear.textContent = "无底图导入";
  }
  if (missingList) {
    var items = []
      .concat(missingAssets.map(function (item) { return "<li>底图 · " + esc(item.name || item.assetId) + "</li>"; }))
      .concat(missingFonts.map(function (item) { return "<li>字体 · " + esc(item.name || item.assetId) + "</li>"; }));
    missingList.innerHTML = items.length ? items.join("") : "<li>未提供缺失标识</li>";
  }
  if (missingDialog) missingDialog.style.display = "flex";
}
function beginPackagePreview(file) {
  pendingPackageFile = file;
  pendingClearMissing = false;
  pendingMissingMode = "import";
  profileFeedback.textContent = "正在检查配置包…";
  profileFeedback.className = "feedback";
  Promise.resolve(readPackageAsBase64(file)).then(function (base64) {
    return json("visual-package-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64: base64 }) });
  }).then(function (data) {
    var preview = data.preview || {};
    if (preview.missingAssetCount || (preview.missingAssets && preview.missingAssets.length) || preview.missingFontCount || (preview.missingFonts && preview.missingFonts.length)) {
      pendingImportPreview = preview;
      openMissingDialog(preview, "import");
      return;
    }
    openImportDialog(preview);
  }).catch(function (error) {
    profileFeedback.textContent = (error.code ? error.code + " · " : "") + error.message;
    profileFeedback.className = "feedback error";
    closeImportDialog();
  });
}
function visualProfileClickHandler(event) {
  var renameButton = event.target && event.target.closest ? event.target.closest(".profile-rename") : null;
  if (renameButton) {
    var renameId = renameButton.getAttribute("data-profile-id");
    var renameProfile = (state.profiles || []).find(function (p) { return p.profileId === renameId; }) || { profileId: renameId, name: renameButton.getAttribute("data-profile-name") || renameId };
    openRenameDialog(renameProfile);
    return;
  }
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
if (exportAllBtn) exportAllBtn.addEventListener("click", function () { exportAllProfiles(exportAllBtn); });
if (importBtn && packageFile) importBtn.addEventListener("click", function () { packageFile.click(); });
if (packageFile) packageFile.addEventListener("change", function () {
  var file = this.files && this.files[0];
  if (!file) return;
  beginPackagePreview(file);
});
if (missingClear) missingClear.addEventListener("click", function () {
  pendingClearMissing = true;
  closeMissingDialog();
  openImportDialog(pendingImportPreview || {});
});
if (missingCancel) missingCancel.addEventListener("click", function () {
  pendingMissingMode = null;
  closeMissingDialog();
  closeImportDialog();
  profileFeedback.textContent = "已取消导入";
  profileFeedback.className = "feedback";
});
if (importOverwrite) importOverwrite.addEventListener("click", function () { commitVisualPackageImport("overwrite"); });
if (importKeep) importKeep.addEventListener("click", function () { commitVisualPackageImport("skip"); });
if (importCommit) importCommit.addEventListener("click", function () { commitVisualPackageImport("copy"); });
if (importCancel) importCancel.addEventListener("click", function () {
  closeImportDialog();
  profileFeedback.textContent = "已取消导入";
  profileFeedback.className = "feedback";
});
if (renameConfirm) renameConfirm.addEventListener("click", confirmRenameProfile);
if (renameCancel) renameCancel.addEventListener("click", closeRenameDialog);
if (renameInput) renameInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") confirmRenameProfile();
  if (event.key === "Escape") closeRenameDialog();
});
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
    return Promise.resolve(json("visual-profiles")).then(function (listed) {
      state.profiles = Array.isArray(listed.profiles) ? listed.profiles : [];
      refreshProfiles();
      return loadBoundEvents();
    }).catch(function () {
      return loadBoundEvents();
    });
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
