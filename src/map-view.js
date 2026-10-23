import * as M from "./model.js";
import { $, el, button, mapPreview } from "./dom.js";
import {
  captureMapPositions,
  animateMapReorder,
  cancelMapReorder,
} from "./motion.js";
export function createMapView({
  getDocument,
  getMode,
  openInText,
  slideVersion,
  commit,
  openEditor,
  variantCard,
  toast,
}) {
  const collapsed = new Set();
  let drag = null;
  const liveBlocks = () =>
    getDocument()?.blocks.filter((block) => !block.detached) || [];
  function clearDrag() {
    drag = null;
    document
      .querySelectorAll(".drop-over,.drop-before,.drop-after")
      .forEach((e) =>
        e.classList.remove("drop-over", "drop-before", "drop-after"),
      );
  }

  function makeDropTarget(node, id, side) {
    const current = getDocument();
    node.ondragover = (event) => {
      if (!drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (side) node.classList.add("drop-over");
      else {
        const after =
          event.clientY >
          node.getBoundingClientRect().top + node.offsetHeight / 2;
        node.classList.toggle("drop-after", after);
        node.classList.toggle("drop-before", !after);
      }
    };
    node.ondragleave = (event) => {
      if (!node.contains(event.relatedTarget))
        node.classList.remove("drop-over", "drop-before", "drop-after");
    };
    node.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (drag) {
        const source = drag;
        const after =
          event.clientY >
          node.getBoundingClientRect().top + node.offsetHeight / 2;
        const result = M.move(
          current.blocks,
          source,
          id,
          side || (after ? "after" : "before"),
        );
        if (result) commit(result, source.zone === "T" ? source.id : id);
        else
          toast(
            "Sposta una sezione sopra o sotto un altro paragrafo, oppure sposta una singola variante.",
          );
      }
      clearDrag();
    };
  }

  function moveByButton(id, direction) {
    const current = getDocument();
    const live = liveBlocks(),
      ids = M.sectionIds(current.blocks, id),
      at = live.findIndex((b) => b.id === id);
    const target =
      direction < 0
        ? live[at - 1]
        : live[live.findIndex((b) => b.id === ids.at(-1)) + 1];
    if (!target) return;
    const previous = captureMapPositions($("map-rows"));
    const result = M.move(
      current.blocks,
      { id, zone: "T" },
      target.id,
      direction < 0 ? "before" : "after",
    );
    if (!commit(result, id) || getMode() !== "map") return;
    // Keep moved content visible even when it enters a collapsed section.
    const item = M.mapHierarchy(current.blocks).find(
      (item) => item.block.id === id,
    );
    let expanded = false;
    for (const ancestor of item?.ancestors || [])
      if (collapsed.delete(ancestor.id)) expanded = true;
    if (expanded) renderMap();
    const row = [...$("map-rows").children].find(
      (row) => row.dataset.id === id,
    );
    if (!row) return;
    const control = row.querySelector('[data-move="' + direction + '"]');
    (control && !control.disabled
      ? control
      : row.querySelector(".map-text")
    )?.focus({ preventScroll: true });
    const rect = row.querySelector(".map-center").getBoundingClientRect();
    const top = $("app-header").getBoundingClientRect().bottom;
    animateMapReorder(
      $("map-rows"),
      previous,
      window.scrollY +
        rect.top +
        rect.height / 2 -
        (top + (innerHeight - top) / 2),
    );
  }

  function renderMap() {
    const current = getDocument();
    cancelMapReorder();
    const container = $("map-rows");
    container.replaceChildren();
    const live = liveBlocks();
    const onlyBranches = $("map-filter").checked;
    const visible = new Set();
    if (onlyBranches)
      for (const item of M.mapHierarchy(current.blocks)) {
        if (item.block.L.length + item.block.R.length) {
          visible.add(item.block.id);
          item.ancestors.forEach((a) => visible.add(a.id));
        }
      }
    for (const item of M.mapHierarchy(current.blocks)) {
      if (onlyBranches && !visible.has(item.block.id)) continue;
      if (item.ancestors.some((ancestor) => collapsed.has(ancestor.id)))
        continue;
      const { block, level: lv, ancestors } = item;
      const row = el(
        "div",
        "map-row" + (lv ? " heading-row" : " paragraph-row"),
      );
      row.dataset.id = block.id;
      row.dataset.level = String(lv);
      row.dataset.depth = String(ancestors.length);
      const width = lv ? 100 - (lv - 1) * 9 : 50;
      row.style.setProperty("--node-width", width + "%");
      const cell = el("div", "map-node-cell");
      for (const ancestor of ancestors) {
        const guide = el("span", "map-guide");
        guide.setAttribute("aria-hidden", "true");
        guide.style.left = (ancestor.level - 1) * 4.5 + "%";
        cell.append(guide);
      }
      if (ancestors.length) {
        const connector = el("span", "map-connector");
        connector.setAttribute("aria-hidden", "true");
        const inset = (ancestors.at(-1).level - 1) * 4.5;
        connector.style.left = inset + "%";
        connector.style.width = Math.max(0, (100 - width) / 2 - inset) + "%";
        cell.append(connector);
      }
      const center = el(
        "div",
        "map-center" +
          (lv ? " is-heading" : "") +
          (!block.text.trim() ? " is-empty" : ""),
      );
      makeDropTarget(center, block.id);
      const text = button(
        lv ? M.label(block) : block.text || "＋ Scrivi qui",
        "map-text",
        () => openInText(block.id),
        "Apri nel testo",
      );
      if (!lv && block.text.trim())
        text.replaceChildren(mapPreview(block.text));
      text.setAttribute(
        "aria-label",
        "Apri nel testo: " +
          (lv ? "titolo H" + lv + ": " : "paragrafo: ") +
          M.label(block),
      );
      text.draggable = !!block.text;
      text.ondragstart = (event) => {
        drag = { id: block.id, zone: "T" };
        event.dataTransfer.setData("text/plain", block.text);
        event.dataTransfer.effectAllowed = "move";
      };
      text.ondragend = clearDrag;
      if (lv) center.append(el("span", "heading-level", "H" + lv));
      center.append(text);
      if (M.canCreateBranches(block))
        for (const side of ["L", "R"]) {
          const direction = side === "L" ? "sinistra" : "destra";
          const description = "Scorri verso " + direction;
          const arrow = button(
            side === "L" ? "←" : "→",
            "map-branch-arrow " + (side === "L" ? "left" : "right"),
            () => slideVersion(block.id, side),
            description,
          );
          arrow.dataset.side = side;
          arrow.setAttribute("aria-label", description);
          arrow.disabled =
            !!block.locked ||
            (!block[side].length && !block.text.trim() && !block.mainLabel);

          center.append(arrow);
        }
      const tools = el("div", "map-block-tools");
      const up = button(
        "↑",
        "",
        () => moveByButton(block.id, -1),
        "Sposta in alto" + (lv ? " tutta la sezione" : ""),
      );
      up.dataset.move = "-1";
      up.setAttribute("aria-label", up.title);
      up.disabled = live[0].id === block.id;
      const down = button(
        "↓",
        "",
        () => moveByButton(block.id, 1),
        "Sposta in basso" + (lv ? " tutta la sezione" : ""),
      );
      down.dataset.move = "1";
      down.setAttribute("aria-label", down.title);
      down.disabled = M.sectionIds(current.blocks, block.id).includes(
        live.at(-1).id,
      );
      const note = button(
        "＋",
        "",
        () => openEditor("note", block.id),
        "Aggiungi nota",
      );
      note.setAttribute("aria-label", note.title);
      tools.append(up, down, note);
      if (lv) {
        const fold = button(
          collapsed.has(block.id) ? "▸" : "▾",
          "",
          () => {
            collapsed.has(block.id)
              ? collapsed.delete(block.id)
              : collapsed.add(block.id);
            renderMap();
          },
          "Comprimi o espandi sezione",
        );
        fold.setAttribute("aria-label", fold.title);
        fold.setAttribute("aria-expanded", String(!collapsed.has(block.id)));
        tools.append(fold);
      }
      center.append(tools);
      cell.append(center);
      const sides = {};
      for (const side of ["L", "R"]) {
        const node = el("div", "map-side " + (side === "L" ? "left" : "right"));
        if (M.canCreateBranches(block)) makeDropTarget(node, block.id, side);
        const add = button(
          "+",
          "rail-add",
          () => openEditor("variant", block.id, side),
          "Nuova variante " + (side === "L" ? "a sinistra" : "a destra"),
        );
        add.setAttribute(
          "aria-label",
          add.title + " per " + M.label(block).slice(0, 50),
        );
        add.disabled = !!block.locked;
        if (M.canCreateBranches(block)) node.append(add);
        block[side].forEach((variant, index) =>
          node.append(variantCard(block, side, variant, index, "map")),
        );
        sides[side] = node;
      }
      row.append(sides.L, cell, sides.R);
      container.append(row);
    }
    if (!container.children.length)
      container.append(
        el(
          "p",
          "map-empty",
          "Nessun ramo ancora. Crea una variante nella vista Testo.",
        ),
      );
  }
  $("map-filter").onchange = renderMap;
  function jump(id) {
    const row = [...$("map-rows").children].find(
      (row) => row.dataset.id === id,
    );
    if (row)
      row.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "instant"
          : "smooth",
      });
    else {
      collapsed.clear();
      $("map-filter").checked = false;
      renderMap();
      const restored = [...$("map-rows").children].find(
        (row) => row.dataset.id === id,
      );
      if (restored) jump(id);
    }
  }
  return {
    render: renderMap,
    jump,
    reset: () => collapsed.clear(),
    clearDrag,
    startDrag(event, source, text) {
      drag = source;
      event.dataTransfer.setData("text/plain", text);
      event.dataTransfer.effectAllowed = "move";
    },
  };
}
