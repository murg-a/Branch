import "@fontsource-variable/inter/wght.css";
import "./style.css";
import { Transaction } from "@codemirror/state";
import {
  createEditorState,
  setBlocks,
  transferEffect,
  transferField,
  blocksField,
} from "./editor.js";
import { createMapView } from "./map-view.js";
import { createVersionMenu, bindCarouselGestures } from "./carousel-ui.js";
import { createPanels } from "./panels.js";
import { createStorage } from "./storage.js";
import { EditorView } from "@codemirror/view";

import {
  undo,
  redo,
  undoDepth,
  redoDepth,
  isolateHistory,
} from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";

import * as M from "./model.js";
import { ghost, fly, cancelMapReorder } from "./motion.js";
import { livePreview } from "./live-preview.js";
import { headingEdit } from "./markdown-plan.js";
import { $, el, button, outwardIcon, mapPreview } from "./dom.js";
const clone = (value) => structuredClone(value);
const themes = {
  carta: {
    label: "Carta",
    bg: "#f2f3f0",
    ink: "#1c2321",
    mute: "#66716c",
    line: "#cdd3ce",
    card: "#e7eae5",
    acc: "#2b6b5c",
    accbg: "#d8e8e2",
  },
  seppia: {
    label: "Seppia",
    bg: "#f3ead8",
    ink: "#3a2e22",
    mute: "#7f6e58",
    line: "#d9ccb2",
    card: "#eadfc6",
    acc: "#7a5230",
    accbg: "#e6d6b4",
  },
  ghiaccio: {
    label: "Ghiaccio",
    bg: "#eef2f6",
    ink: "#17202b",
    mute: "#5a6b7d",
    line: "#cbd5df",
    card: "#e1e8ef",
    acc: "#2f5f8f",
    accbg: "#d3e1ee",
  },
  bosco: {
    label: "Bosco",
    bg: "#161b19",
    ink: "#e3e8e5",
    mute: "#8d9993",
    line: "#2f3835",
    card: "#212926",
    acc: "#6cc2ae",
    accbg: "#27403a",
  },
  antracite: {
    label: "Antracite",
    bg: "#1f2124",
    ink: "#e6e6e3",
    mute: "#9a9b98",
    line: "#34363a",
    card: "#2a2d31",
    acc: "#d2a95b",
    accbg: "#3a3427",
  },
  notte: {
    label: "Notte",
    bg: "#0f1420",
    ink: "#dfe5f0",
    mute: "#8592a8",
    line: "#252d40",
    card: "#182032",
    acc: "#7aa2f7",
    accbg: "#1f2d4d",
  },
};
const fonts = {
  serif: "Georgia,'Times New Roman',serif",
  sans: "Arial,Helvetica,sans-serif",
  mono: "'Courier New',monospace",
};
let cfg = {
  theme: matchMedia("(prefers-color-scheme:dark)").matches ? "bosco" : "carta",
  font: "serif",
  size: 18,
  width: 56,
  showBranches: true,
};
try {
  const prior = JSON.parse(localStorage.getItem("branch-settings") || "null");
  if (prior) cfg = { ...cfg, ...prior };
  else {
    const legacy = JSON.parse(localStorage.getItem("tasto-settings") || "null");
    if (legacy)
      cfg = {
        theme:
          {
            chiaro: "carta",
            antracite: "antracite",
            dracula: "notte",
            terminale: "bosco",
            sole: "seppia",
          }[legacy.theme] || legacy.theme,
        font: ["serif", "mono", "sans"][legacy.font] || "serif",
        size: legacy.size || 18,
      };
  }
} catch {}
if (!themes[cfg.theme]) cfg.theme = "carta";
if (!fonts[cfg.font]) cfg.font = "serif";
cfg.size = Math.min(30, Math.max(14, Number(cfg.size) || 18));
cfg.width = Math.min(68, Math.max(42, Number(cfg.width) || 56));
cfg.showBranches = cfg.showBranches !== false;
let editor,
  current,
  documents = [],
  mode = "text",
  activeId = null,
  railFrame = null;
const states = new Map();
let activeTransfer = null,
  applyingTransfer = false;
function toast(message, undoAction = null) {
  $("toast").replaceChildren(document.createTextNode(message));
  const undoState = editor?.state;
  if (undoAction)
    $("toast").append(
      button("Annulla", "toast-undo", () => {
        if (
          editor.state.doc !== undoState.doc ||
          editor.state.field(blocksField) !== undoState.field(blocksField)
        ) {
          toast(
            "Il documento è cambiato: usa Annulla nella barra per risalire nella cronologia.",
          );
          return;
        }
        undoAction();
        $("toast").hidden = true;
      }),
    );
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 5000);
}

function configure(save = false) {
  cancelMapReorder();
  if (activeTransfer) cancelTransfer();
  const t = themes[cfg.theme];
  for (const [key, value] of Object.entries(t))
    if (key !== "label")
      document.documentElement.style.setProperty("--" + key, value);
  document.documentElement.style.setProperty("--tf", fonts[cfg.font]);
  document.documentElement.style.setProperty("--ts", cfg.size + "px");
  document.documentElement.style.setProperty(
    "--text-scale",
    cfg.font === "mono" ? "0.82" : "1",
  );
  document.documentElement.style.colorScheme = [
    "bosco",
    "antracite",
    "notte",
  ].includes(cfg.theme)
    ? "dark"
    : "light";
  document.querySelector('meta[name="theme-color"]').content = t.bg;
  $("size").value = cfg.size;
  $("size-value").textContent = cfg.size + " px";
  document.documentElement.style.setProperty("--trunk-width", cfg.width + "%");
  document.documentElement.style.setProperty(
    "--rail-ratio",
    String((100 - cfg.width) / 200),
  );
  $("trunk-width").value = cfg.width;
  $("trunk-width-value").textContent = cfg.width + "%";
  for (const b of document.querySelectorAll("[data-font]"))
    b.setAttribute("aria-pressed", b.dataset.font === cfg.font);
  for (const b of document.querySelectorAll("[data-theme]"))
    b.setAttribute("aria-pressed", b.dataset.theme === cfg.theme);
  updateBranchVisibility();
  if (save)
    try {
      localStorage.setItem("branch-settings", JSON.stringify(cfg));
    } catch {
      toast("Impossibile salvare le preferenze.");
    }
  editor?.requestMeasure();
  scheduleRails();
}
function createState(doc) {
  return createEditorState(doc, {
    headerHeight: () => $("app-header")?.offsetHeight || 0,
    transfer: parkActive,
    format: formatText,
    documentChanged(text, blocks) {
      current.text = text;
      current.blocks = blocks;
      dirty();
      versionMenu.close();
      renderStats();
      renderOutline();
      renderNotes();
      if (mode === "map") renderMap();
      if (mode === "markdown")
        $("markdown").value = M.markdownWithNotes(current);
    },
    selectionChanged: updateActive,
    geometryChanged: scheduleRails,
    historyChanged: updateHistory,
  });
}
function updateHistory() {
  if (!editor) return;
  $("undo").disabled = !undoDepth(editor.state);
  $("redo").disabled = !redoDepth(editor.state);
}

function liveBlocks() {
  return current?.blocks.filter((b) => !b.detached) || [];
}
function activeBlock() {
  return (
    current?.blocks.find((b) => b.id === activeId && !b.detached) ||
    liveBlocks()[0]
  );
}
function updateActive() {
  if (!current || !editor) return;
  const pos = editor.state.selection.main.head,
    live = liveBlocks();
  activeId = (
    live.find((b) => b.start === pos) ||
    live.find((b) => pos > b.start && pos <= b.end) ||
    [...live].reverse().find((b) => b.start <= pos) ||
    live[0]
  )?.id;
  const b = activeBlock();
  updateFormatToolbar();
  updateBranchVisibility();
  scheduleRails();
}
function commit(result, focusId, extraEffects = []) {
  if (!result || !current) return false;
  const changed = result.text !== editor.state.doc.toString();
  const focus = result.blocks.find((b) => b.id === focusId && !b.detached);
  editor.dispatch({
    ...(changed
      ? {
          changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: result.text,
          },
        }
      : {}),
    effects: [setBlocks.of(result.blocks), ...extraEffects],
    ...(focus ? { selection: { anchor: focus.start } } : {}),
    annotations: [
      Transaction.userEvent.of("input.branch"),
      isolateHistory.of("full"),
    ],
    scrollIntoView: false,
  });
  if (focusId) activeId = focusId;
  return true;
}

function parkActive(side) {
  if (!cfg.showBranches) return true;
  const block = activeBlock();
  if (block) void transferBlock(block.id, side);
  return true;
}
function formatText(command) {
  if (mode !== "text" || !editor) return false;
  const { from, to } = editor.state.selection.main,
    edit = M.formatSelection(editor.state.doc.toString(), from, to, command);
  if (!edit) return false;
  editor.dispatch({
    changes: M.formatChanges(editor.state.doc.toString(), edit),
    selection: { anchor: edit.anchor, head: edit.head },
    annotations: [
      Transaction.userEvent.of("input.format"),
      isolateHistory.of("full"),
    ],
  });
  editor.focus();
  return true;
}
function updateFormatToolbar() {
  if (!editor) return;
  const { from, to } = editor.state.selection.main,
    text = editor.state.doc.toString(),
    selected = text.slice(from, to),
    line = editor.state.doc.lineAt(from).text;
  const currentHeading = /^ {0,3}(#{1,6})[ \t]+/.exec(line);
  $("heading-level").value = String(
    Math.min(5, currentHeading?.[1].length || 0),
  );
  let node = editor.state.field(livePreview).tree.resolveInner(from, 1),
    inCode = false;
  for (; node; node = node.parent)
    if (node.name === "FencedCode" || node.name === "CodeBlock") inCode = true;
  $("heading-level").disabled = mode !== "text" || inCode;
  const wrappers = {
    bold: ["**", "**"],
    italic: ["_", "_"],
    underline: ["<u>", "</u>"],
  };
  for (const node of document.querySelectorAll("[data-format]")) {
    let pressed = false;
    if (wrappers[node.dataset.format]) {
      const [left, right] = wrappers[node.dataset.format];
      pressed =
        (selected.startsWith(left) &&
          selected.endsWith(right) &&
          selected.length >= left.length + right.length) ||
        (text.slice(from - left.length, from) === left &&
          text.slice(to, to + right.length) === right);
    } else
      pressed = (
        node.dataset.format === "bullet"
          ? /^[ \t]*[-+*][ \t]+/
          : /^[ \t]*\d+[.)][ \t]+/
      ).test(line);
    node.setAttribute("aria-pressed", String(pressed));
    node.disabled = mode !== "text";
  }
}
function renderStats() {
  if (!current) return;
  const live = liveBlocks(),
    variants = current.blocks.reduce((n, b) => n + b.L.length + b.R.length, 0),
    notes = current.blocks.reduce((n, b) => n + b.notes.length, 0),
    words = current.text.trim() ? current.text.trim().split(/\s+/u).length : 0;
  $("word-count").textContent = words.toLocaleString("it-IT");
  $("block-count").textContent = live.length;
  $("variant-count").textContent = variants;
  $("note-count").textContent = notes;
}

function menuButton(blockId, side = null, variantId = null) {
  const control = button(
    "⋯",
    "paragraph-menu-toggle",
    (event) => versionMenu.open(event, blockId, side, variantId),
    "Impostazioni del paragrafo",
  );
  control.setAttribute("aria-label", "Impostazioni del paragrafo");
  control.setAttribute("aria-expanded", "false");
  control.setAttribute("aria-haspopup", "dialog");
  control.onpointerdown = (event) => event.preventDefault();
  return control;
}
function variantCard(block, side, variant, index, context) {
  const card = el("div", "variant-card");
  Object.assign(card.dataset, {
    blockId: block.id,
    side,
    variantId: variant.id,
  });
  if (
    context === "text" &&
    activeTransfer?.id === block.id &&
    activeTransfer.side === side &&
    activeTransfer.outgoingVariantId === variant.id
  )
    card.classList.add("transfer-target-card");
  const choose = button(
    "",
    "variant-use",
    () => {
      if (mode !== "text") setMode("text");
      void transferBlock(block.id, side, variant.id);
    },
    "Porta questo ramo al centro",
  );
  choose.disabled = !!block.locked;
  choose.setAttribute(
    "aria-label",
    "Porta al centro: " +
      (variant.label || variant.text.slice(0, 80) || "Spazio vuoto"),
  );
  const excerpt = el("span", "variant-excerpt");
  excerpt.append(
    context === "map" && variant.text.trim()
      ? mapPreview(variant.text)
      : document.createTextNode(variant.text || "Spazio vuoto"),
  );
  choose.append(excerpt);
  card.append(
    el("span", "variant-label", variant.label || "Ramo"),
    menuButton(block.id, side, variant.id),
    choose,
  );
  if (context === "map") {
    card.draggable = true;
    card.ondragstart = (event) =>
      mapView.startDrag(
        event,
        { id: block.id, zone: side, variantId: variant.id },
        variant.text,
      );
    card.ondragend = mapView.clearDrag;
  }
  return card;
}
function scheduleRails() {
  if (railFrame) return;
  railFrame = requestAnimationFrame(() => {
    railFrame = null;
    drawRails();
  });
}
function paragraphGeometry(view, block) {
  const first = view.lineBlockAt(Math.min(block.start, view.state.doc.length));
  const last = view.lineBlockAt(Math.min(block.end, view.state.doc.length));
  const content = view.contentDOM.getBoundingClientRect();
  return {
    left: content.left,
    top: view.documentTop + first.top,
    width: content.width,
    height: Math.max(1, last.bottom - first.top),
  };
}
function drawRails() {
  if (!editor || !current || mode !== "text") return;
  if (!cfg.showBranches) {
    $("rail-left").replaceChildren();
    $("rail-right").replaceChildren();
    $("trunk-controls").replaceChildren();
    return;
  }
  const wide = matchMedia("(min-width:851px)").matches;
  editor.requestMeasure({
    key: "branch-rails",
    read: (view) => {
      const sheet = $("text-sheet").getBoundingClientRect(),
        trunk = document.querySelector(".trunk").getBoundingClientRect();
      return {
        sheet,
        trunk,
        items: liveBlocks()
          .filter((b) =>
            view.visibleRanges.some(
              (range) => b.start >= range.from && b.start <= range.to,
            ),
          )
          .map((block) => ({ block, rect: paragraphGeometry(view, block) })),
      };
    },
    write: ({ sheet, trunk, items }) => {
      if (!cfg.showBranches || mode !== "text") return;
      for (const side of ["L", "R"]) {
        const container = $(side === "L" ? "rail-left" : "rail-right");
        container.replaceChildren();
        if (!wide) continue;
        for (const { block, rect } of items) {
          if (!M.canCreateBranches(block) && !block[side].length) continue;
          const slot = el(
            "div",
            "rail-slot" + (block.id === activeId ? " active" : ""),
          );
          Object.assign(slot.dataset, { blockId: block.id, side });
          slot.style.top = rect.top - sheet.top + "px";
          slot.style.setProperty("--paragraph-height", rect.height + "px");
          const lineHeight =
            cfg.size * 0.84 * (cfg.font === "mono" ? 0.82 : 1) * 1.6;
          slot.style.setProperty(
            "--preview-lines",
            String(
              Math.max(
                1,
                Math.floor(
                  (Math.min(200, Math.max(64, rect.height)) - 26) / lineHeight,
                ),
              ),
            ),
          );
          if (block[side][0])
            slot.append(variantCard(block, side, block[side][0], 0, "text"));
          container.append(slot);
        }
      }
      const controls = $("trunk-controls");
      controls.replaceChildren();
      for (const { block, rect } of items) {
        if (
          !M.canCreateBranches(block) &&
          !block.L.length &&
          !block.R.length &&
          !block.locked &&
          !block.mainLabel
        )
          continue;
        const row = el(
          "div",
          "trunk-paragraph-actions" + (block.id === activeId ? " active" : ""),
        );
        row.dataset.blockId = block.id;
        Object.assign(row.style, {
          top: rect.top - sheet.top + "px",
          left: trunk.left - sheet.left + "px",
          width: trunk.width + "px",
          height: rect.height + "px",
        });
        for (const side of ["L", "R"]) {
          const action = button(
            side === "L" ? "←" : "→",
            "trunk-arrow " + (side === "L" ? "left" : "right"),
            () => void transferBlock(block.id, side),
          );
          action.dataset.blockId = block.id;
          action.dataset.side = side;
          action.setAttribute(
            "aria-label",
            "Scorri verso il ramo " +
              (side === "L" ? "sinistro" : "destro") +
              ": " +
              M.label(block).slice(0, 70),
          );
          action.title = action.getAttribute("aria-label");
          action.disabled =
            !!block.locked ||
            (!block[side].length && !block.text.trim() && !block.mainLabel) ||
            (!M.canCreateBranches(block) && !block[side].length);
          action.onpointerdown = (event) => event.preventDefault();
          row.append(action);
        }
        if (block.mainLabel)
          row.append(el("span", "trunk-version-title", block.mainLabel));
        if (
          block.L.length ||
          block.R.length ||
          block.locked ||
          block.mainLabel
        ) {
          row.append(menuButton(block.id));
          if (block.locked) row.append(el("span", "trunk-pin", "Bloccato"));
        }
        controls.append(row);
      }
    },
  });
}
function branchRectangle(id, side, variantId, trunk) {
  const container = $(side === "L" ? "rail-left" : "rail-right");
  const card = [...container.querySelectorAll(".variant-card")].find(
    (node) =>
      node.dataset.blockId === id && node.dataset.variantId === variantId,
  );
  if (card) return card.getBoundingClientRect();
  const rect = container.getBoundingClientRect(),
    width = rect.width || Math.max(120, trunk.width * 0.6);
  return {
    left: rect.width ? rect.left : side === "L" ? -width - 24 : innerWidth + 24,
    top: trunk.top,
    width,
    height: trunk.height,
  };
}
function typography(node) {
  const style = getComputedStyle(node);
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    fontWeight: style.fontWeight,
  };
}
function cancelTransfer() {
  const transfer = activeTransfer;
  if (!transfer) return;
  activeTransfer = null;
  for (const animation of transfer.animations) animation.cancel();
  for (const node of transfer.ghosts) node.remove();
  document.body.classList.remove("is-transferring");
  document
    .querySelectorAll(".transfer-target-card")
    .forEach((node) => node.classList.remove("transfer-target-card"));
  queueMicrotask(() => {
    if (!activeTransfer && editor?.state.field(transferField))
      editor.dispatch({
        effects: transferEffect.of(null),
        annotations: Transaction.addToHistory.of(false),
      });
  });
  scheduleRails();
}
async function transferBlock(id, side, variantId = null) {
  if (!current || (mode === "text" && !cfg.showBranches)) return;
  if (activeTransfer) cancelTransfer();
  versionMenu.close();
  const block = current.blocks.find((item) => item.id === id && !item.detached);
  if (!block || block.locked) return;
  const incoming = variantId
    ? block[side]?.find((item) => item.id === variantId)
    : block[side]?.[0];
  const result = variantId
    ? M.focusVersion(current.blocks, id, side, variantId)
    : M.slideVersion(current.blocks, id, side);
  if (!result) return;
  const outgoingSide = side === "R" ? "L" : "R";
  const canAnimate =
    mode === "text" &&
    !document.querySelector("dialog[open]") &&
    !matchMedia("(prefers-reduced-motion:reduce)").matches &&
    typeof Element.prototype.animate === "function";
  if (!canAnimate) {
    commit(result, id);
    return;
  }
  const fromTrunk = paragraphGeometry(editor, block),
    fromBranch = branchRectangle(id, side, incoming?.id, fromTrunk);
  const source = editor.domAtPos(
    Math.min(block.start, editor.state.doc.length),
  ).node;
  const trunkType = typography(
    source.nodeType === 3 ? source.parentElement : source,
  );
  const oldCard = [
    ...$(side === "L" ? "rail-left" : "rail-right").querySelectorAll(
      ".variant-card",
    ),
  ].find(
    (node) =>
      node.dataset.blockId === id && node.dataset.variantId === incoming?.id,
  );
  const branchType = oldCard
    ? typography(oldCard.querySelector(".variant-use"))
    : {
        fontFamily: fonts[cfg.font],
        fontSize: cfg.size * 0.84 * (cfg.font === "mono" ? 0.82 : 1) + "px",
        lineHeight:
          cfg.size * 0.84 * (cfg.font === "mono" ? 0.82 : 1) * 1.6 + "px",
        fontWeight: "400",
      };
  const targetBlock = result.blocks.find((item) => item.id === id),
    outgoingVariant =
      targetBlock[outgoingSide].find(
        (item) => item.id === block.mainVersionId,
      ) || targetBlock[outgoingSide][0];
  const transfer = {
    id,
    side: outgoingSide,
    outgoingVariantId: outgoingVariant?.id,
    ghosts: [],
    animations: [],
  };
  activeTransfer = transfer;
  const outgoing = block.text.trim()
    ? ghost(block.text, fromTrunk, trunkType)
    : null;
  const arriving = incoming
    ? ghost(incoming.text, fromBranch, branchType, true)
    : null;
  if (outgoing) transfer.ghosts.push(outgoing);
  if (arriving) transfer.ghosts.push(arriving);
  document.body.classList.add("is-transferring");
  applyingTransfer = true;
  try {
    commit(result, id, [transferEffect.of(id)]);
  } catch (error) {
    cancelTransfer();
    throw error;
  } finally {
    applyingTransfer = false;
  }
  try {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    if (activeTransfer !== transfer) return;
    const updated = current.blocks.find((item) => item.id === id),
      toTrunk = paragraphGeometry(editor, updated),
      toBranch = branchRectangle(
        id,
        outgoingSide,
        outgoingVariant?.id,
        toTrunk,
      );
    if (outgoing)
      transfer.animations.push(fly(outgoing, toBranch, branchType, true));
    if (arriving) {
      const at = editor.domAtPos(
        Math.min(updated.start, editor.state.doc.length),
      ).node;
      transfer.animations.push(
        fly(
          arriving,
          toTrunk,
          typography(at.nodeType === 3 ? at.parentElement : at),
          false,
        ),
      );
    }
    await Promise.allSettled(
      transfer.animations.map((animation) => animation.finished),
    );
  } finally {
    if (activeTransfer === transfer) cancelTransfer();
  }
}

function updateBranchVisibility() {
  $("branch-hint").hidden = !!cfg.branchHintDismissed || !cfg.showBranches;
  document.body.classList.toggle("text-branches-hidden", !cfg.showBranches);
  $("branches-toggle").hidden = mode !== "text";
  $("branches-toggle").setAttribute("aria-checked", String(cfg.showBranches));
  $("branches-toggle").title = cfg.showBranches
    ? "Nascondi rami"
    : "Mostra rami";
}
function setMode(value) {
  versionMenu.close();
  cancelMapReorder();
  if (activeTransfer) cancelTransfer();
  mode = value;
  for (const b of document.querySelectorAll("[data-mode]"))
    b.setAttribute("aria-pressed", b.dataset.mode === value);
  for (const v of ["text", "map", "markdown"])
    $(v + "-view").hidden = v !== value;
  updateBranchVisibility();
  document.querySelector(".format-toolbar").hidden = value !== "text";
  updateFormatToolbar();
  if (!editor) return;
  if (value === "map") renderMap();
  if (value === "markdown") $("markdown").value = M.markdownWithNotes(current);
  if (value === "text") {
    editor.requestMeasure();
    scheduleRails();
  }
  renderStats();
  return true;
}

async function switchDocument(id) {
  versionMenu.close();
  if (activeTransfer) cancelTransfer();
  if (current?.id === id) {
    closePanels();
    return;
  }
  await persist();
  if (current) states.set(current.id, editor.state);
  const doc = documents.find((d) => d.id === id);
  if (!doc) return;
  current = doc;
  storage.resetRevision();
  mapView.reset();
  activeId = liveBlocks()[0]?.id;
  editor.setState(states.get(id) || createState(current));
  $("title").value = current.title;
  $("save-status").textContent = storage.available
    ? "Salvato sul dispositivo"
    : "Archivio non disponibile";
  storage.select(id);
  renderAll();
  setMode(mode);
  updateActive();
  updateHistory();
  closePanels();
  window.scrollTo({ top: 0 });
}
function renderAll() {
  renderDocuments();
  renderStats();
  renderOutline();
  renderNotes();
  scheduleRails();
}
async function createDocument(document) {
  versionMenu.close();
  if (!storage.available) {
    toast("Archivio non disponibile. Esporta il documento prima di chiudere.");
    return;
  }
  await persist();
  const doc = document || {
    id: M.uid(),
    title: "Senza titolo",
    text: "",
    blocks: M.fromMarkdown(""),
    updated: Date.now(),
  };
  try {
    await storage.write(doc);
  } catch {
    toast(
      "Impossibile creare il documento. Esporta il lavoro prima di continuare.",
    );
    return;
  }
  documents.push(doc);
  await switchDocument(doc.id);
  setMode("text");
  editor.focus();
}
async function deleteDocument(id) {
  versionMenu.close();
  const doc = documents.find((d) => d.id === id);
  if (
    !confirm(
      "Eliminare “" +
        (doc.title || "Senza titolo") +
        "” da questo dispositivo? Esporta prima il file Branch per conservarne una copia.",
    )
  )
    return;
  await persist();
  try {
    await storage.remove(id);
  } catch {
    toast("Impossibile eliminare il documento.");
    return;
  }
  documents = documents.filter((d) => d.id !== id);
  states.delete(id);
  if (current?.id === id) {
    current = null;
    if (documents.length) await switchDocument(documents[0].id);
    else await createDocument();
  }
  renderDocuments();
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = el("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function baseFilename() {
  return (
    current.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() ||
    "Senza titolo"
  ).replace(/\.(md|markdown|branch\.json)$/i, "");
}
function exportFull() {
  if (!current) return;
  download(
    baseFilename() + ".branch.json",
    M.backup(current),
    "application/json;charset=utf-8",
  );
  $("export-dialog").close();
  toast("Documento completo esportato: testo, varianti e note.");
}
function exportMd() {
  if (!current) return;
  download(
    baseFilename() + ".md",
    M.markdownWithNotes(current),
    "text/markdown;charset=utf-8",
  );
  $("export-dialog").close();
  toast(
    "Esportati testo principale e note. Le varianti restano nel file Branch.",
  );
}
const mapView = createMapView({
  getDocument: () => current,
  getMode: () => mode,
  commit,
  openEditor: (...args) => panels.openEditor(...args),
  slideVersion: (id, side) => void transferBlock(id, side),
  openInText: (id) => {
    if (setMode("text") !== false) jump(id);
  },
  variantCard,
  toast,
});
const renderMap = () => mapView.render();
const versionMenu = createVersionMenu({
  getDocument: () => current,
  commit,
  toast,
  undo: () => undo(editor),
  refresh: () => {
    if (mode === "map") renderMap();
    scheduleRails();
  },
});
function activateVariant(id, side, itemId = null) {
  const block = current.blocks.find((b) => b.id === id && !b.detached);
  if (!block || block.locked) {
    toast("Sblocca il paragrafo per scorrere tra i rami.");
    return;
  }
  setMode("text");
  if (itemId) {
    void transferBlock(id, side, itemId);
    jump(id);
    return;
  }
  // The outer empty position is a new alternative, edited directly in the flow.
  let result = { blocks: current.blocks };
  const steps = block[side].length + 1;
  for (let i = 0; i < steps; i++) {
    const next = M.slideVersion(result.blocks, id, side);
    if (!next) break;
    result = next;
  }
  if (result.text !== undefined) commit(result, id);
  jump(id);
}
const panels = createPanels({
  openVariant: activateVariant,
  getDocument: () => current,
  getDocuments: () => documents,
  getActiveBlock: activeBlock,
  getActiveId: () => activeId,
  setActiveId: (id) => {
    activeId = id;
  },
  commit,
  jump,
  switchDocument,
  deleteDocument,
  createDocument,
  variantCard,
  replaceAll: replaceAllText,
  toast,
});
const {
  openEditor,
  renderOutline,
  renderFinder,
  renderNotes,
  renderDocuments,
  closePanels,
  showLeft,
} = panels;
const storage = createStorage({
  getCurrent: () => current,
  onStatus: (status) => {
    $("save-status").textContent = status;
  },
  onSaved: renderDocuments,
  onError: toast,
});
const persist = () => storage.persist();
function dirty() {
  if (activeTransfer && !applyingTransfer) cancelTransfer();
  storage.markDirty();
}
panels.bind();
async function init() {
  const loaded = await storage.load();
  documents = loaded.documents;
  current = loaded.current;
  editor = new EditorView({ state: createState(current), parent: $("editor") });
  $("title").value = current.title;
  $("save-status").textContent = storage.available
    ? "Salvato sul dispositivo"
    : "Archivio non disponibile";
  bindCarouselGestures({
    element: editor.contentDOM,
    blockAt: (x, y) => {
      if (mode !== "text") return null;
      const pos = editor.posAtCoords({ x, y });
      if (pos == null) return null;
      const blocks = liveBlocks();
      const block =
        blocks.find((b) => b.start === pos) ||
        blocks.find((b) => pos > b.start && pos <= b.end);
      if (!block) return null;
      const rect = paragraphGeometry(editor, block);
      if (
        y < rect.top ||
        y > rect.top + Math.max(rect.height, block.text ? 0 : 48)
      )
        return null;
      return block?.id;
    },
    canSlide: (id) => {
      const b = current?.blocks.find((b) => b.id === id);
      return (
        mode === "text" &&
        cfg.showBranches &&
        b &&
        !b.locked &&
        (M.canCreateBranches(b) || b.L.length || b.R.length)
      );
    },
    slide: (id, side) => void transferBlock(id, side),
  });
  configure();
  renderAll();
  updateActive();
  updateHistory();
  setMode("text");
  if (storage.available) await storage.migrate(documents);
}

for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => setMode(b.dataset.mode);
$("title").oninput = () => {
  if (current) {
    current.title = $("title").value;
    current.updated = Date.now();
    dirty();
  }
};
$("undo").onclick = () => {
  undo(editor);
  if (mode === "text") editor.focus();
};
$("redo").onclick = () => {
  redo(editor);
  if (mode === "text") editor.focus();
};

$("heading-level").onchange = () => {
  if (mode !== "text" || !editor) return;
  const edit = headingEdit(
    editor.state.doc.toString(),
    editor.state.selection.main.head,
    Number($("heading-level").value),
  );
  if (edit) {
    editor.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.anchor },
      annotations: [
        Transaction.userEvent.of("input.format"),
        isolateHistory.of("full"),
      ],
    });
    editor.focus();
  }
};
for (const node of document.querySelectorAll("[data-format]")) {
  node.onpointerdown = (event) => event.preventDefault();
  node.onclick = () => formatText(node.dataset.format);
}

$("file-input").onchange = async (event) => {
  for (const file of event.target.files) {
    if (file.size > 5 * 1024 * 1024) {
      toast("Il file " + file.name + " supera il limite di 5 MB.");
      continue;
    }
    try {
      const raw = await file.text();
      const doc = /\.json$/i.test(file.name)
        ? M.importBackup(raw)
        : {
            id: M.uid(),
            title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
            text: raw,
            blocks: M.fromMarkdown(raw),
            updated: Date.now(),
          };
      await createDocument(doc);
    } catch (error) {
      toast("Impossibile aprire " + file.name + ": formato non valido.");
    }
  }
  event.target.value = "";
};
$("view-markdown").onclick = () => {
  if (setMode("markdown") === false) return;
  $("export-dialog").close();
};
$("export-open").onclick = () => $("export-dialog").showModal();
$("export-full").onclick = exportFull;
$("export-md").onclick = exportMd;
$("copy-markdown").onclick = async () => {
  try {
    await navigator.clipboard.writeText(M.markdownWithNotes(current));
    toast("Markdown copiato.");
  } catch {
    $("markdown").focus();
    $("markdown").select();
    toast("Testo selezionato: usa Ctrl/⌘ C per copiarlo.");
  }
};
function replaceAllText(query, replacement) {
  if (!query) return;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    regex = new RegExp(escaped, "giu"),
    changes = [];
  for (const match of current.text.matchAll(regex))
    changes.push({
      from: match.index,
      to: match.index + match[0].length,
      insert: replacement,
    });
  if (changes.length) {
    editor.dispatch({
      changes,
      annotations: [
        Transaction.userEvent.of("input.replace"),
        isolateHistory.of("full"),
      ],
    });
    toast(changes.length + " sostituzioni nel testo principale.");
  }
}
$("map-add").onclick = () => {
  const blocks = clone(current.blocks),
    block = M.newBlock();
  const index = blocks.findIndex((b) => b.detached);
  blocks.splice(index < 0 ? blocks.length : index, 0, block);
  commit(M.serialize(blocks), block.id);
  openEditor("trunk", block.id);
};

$("branch-hint-dismiss").onclick = () => {
  cfg.branchHintDismissed = true;
  configure(true);
};

$("branches-toggle").onpointerdown = (event) => event.preventDefault();
$("branches-toggle").onclick = () => {
  cfg.showBranches = !cfg.showBranches;
  configure(true);
};

for (const [key, t] of Object.entries(themes)) {
  const b = button(t.label, "theme-choice", () => {
    cfg.theme = key;
    configure(true);
  });
  b.dataset.theme = key;
  b.style.background = t.bg;
  b.style.color = t.ink;
  $("themes").append(b);
}
for (const b of document.querySelectorAll("[data-font]"))
  b.onclick = () => {
    cfg.font = b.dataset.font;
    configure(true);
  };
$("size").oninput = () => {
  cfg.size = Number($("size").value);
  configure(true);
};
$("trunk-width").oninput = () => {
  cfg.width = Number($("trunk-width").value);
  configure(true);
};
$("settings-toggle").onclick = () => {
  const hidden = !$("settings").hidden;
  $("settings").hidden = hidden;
  $("settings-toggle").setAttribute("aria-expanded", !hidden);
};
$("settings-close").onclick = () => {
  $("settings").hidden = true;
  $("settings-toggle").setAttribute("aria-expanded", "false");
};
document.addEventListener("pointerdown", (event) => {
  if (
    !$("settings").hidden &&
    !event.target.closest("#settings,#settings-toggle")
  )
    $("settings-close").click();
});
document.addEventListener("keydown", (event) => {
  if (!editor) return;
  const mod = event.ctrlKey || event.metaKey,
    dialog = event.target.closest("dialog");
  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    exportFull();
  }
  if (mod && event.key.toLowerCase() === "f" && !dialog) {
    event.preventDefault();
    if (mode === "text") {
      openSearchPanel(editor);
    } else {
      closePanels();
      showLeft("index");
      $("find").focus();
    }
  }
  if (
    mod &&
    event.key.toLowerCase() === "z" &&
    !dialog &&
    !event.target.closest("#editor") &&
    !["INPUT", "TEXTAREA"].includes(event.target.tagName)
  ) {
    event.preventDefault();
    event.shiftKey ? redo(editor) : undo(editor);
  }
  if (event.key === "Escape" && !dialog) {
    closePanels();
    $("settings-close").click();
  }
});
window.addEventListener("resize", () => {
  cancelMapReorder();
  if (activeTransfer) cancelTransfer();
  scheduleRails();
});
window.addEventListener(
  "scroll",
  () => {
    if (activeTransfer) cancelTransfer();
    scheduleRails();
  },
  { passive: true },
);
const chromeObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--chrome-height",
    $("app-header").offsetHeight + "px",
  );
  editor?.requestMeasure();
  scheduleRails();
});
chromeObserver.observe($("app-header"));
storage.bindLifecycle(window, document);

$("export-open").lastElementChild.replaceChildren(outwardIcon());
configure();
init();

window.addEventListener("wheel", cancelMapReorder, { passive: true });
window.addEventListener("touchstart", cancelMapReorder, { passive: true });
window.addEventListener("keydown", (event) => {
  if (
    [
      "PageUp",
      "PageDown",
      "Home",
      "End",
      "ArrowUp",
      "ArrowDown",
      "Escape",
    ].includes(event.key)
  )
    cancelMapReorder();
});

function jump(id) {
  const block = current.blocks.find(
    (block) => block.id === id && !block.detached,
  );
  if (!block) return;
  activeId = id;
  if (mode === "markdown" && setMode("text") === false) return;
  if (mode === "text") {
    editor.dispatch({
      selection: { anchor: block.start },
      effects: EditorView.scrollIntoView(block.start, { y: "center" }),
    });
    editor.focus();
  } else mapView.jump(id);
}
