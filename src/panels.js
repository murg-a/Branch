import * as M from "./model.js";
import { $, el, button } from "./dom.js";
export function createPanels({
  openVariant,
  getDocument,
  getDocuments,
  getActiveBlock,
  getActiveId,
  setActiveId,
  commit,
  jump,
  switchDocument,
  deleteDocument,
  createDocument,
  variantCard,
  replaceAll,
  toast,
}) {
  const clone = (value) => structuredClone(value);
  let editing = null;
  const liveBlocks = () =>
    getDocument()?.blocks.filter((block) => !block.detached) || [];
  const commitMetadata = (blocks) =>
    commit({ text: getDocument().text, blocks }, getActiveId());
  function openEditor(type, blockId, side = null, itemId = null) {
    if (type === "variant") {
      if ($("branches-dialog").open) $("branches-dialog").close();
      openVariant(blockId, side, itemId);
      return;
    }
    const current = getDocument();
    const block = current.blocks.find((b) => b.id === blockId);
    if (!block) return;
    if (type === "variant" && !itemId && !M.canCreateBranches(block)) return;
    setActiveId(block.id);
    editing = { type, blockId, side, itemId, documentId: current.id };
    const value =
      type === "trunk"
        ? block.text
        : type === "note"
          ? block.notes.find((n) => n.id === itemId)?.text || ""
          : block[side].find((v) => v.id === itemId)?.text || "";
    $("edit-title").textContent =
      type === "note"
        ? "Modifica nota"
        : type === "trunk"
          ? "Modifica paragrafo"
          : "Modifica variante";
    $("edit-text").dataset.kind = type;
    $("edit-text").value = value;
    $("edit-delete").hidden = !itemId;
    if (!$("edit-dialog").open) $("edit-dialog").showModal();
    $("edit-text").focus();
  }

  function finishEditor(remove = false) {
    const current = getDocument();
    if (!editing || editing.documentId !== current.id) return;
    const { type, blockId, side, itemId } = editing,
      blocks = clone(current.blocks),
      block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    if (type === "variant" && !itemId && !M.canCreateBranches(block)) return;
    const value = $("edit-text").value;
    if (type === "trunk") {
      block.text = value;
      commit(M.serialize(blocks), block.id);
    } else {
      const list = type === "note" ? block.notes : block[side],
        at = list.findIndex((v) => v.id === itemId);
      if (remove) {
        if (at >= 0) list.splice(at, 1);
      } else if (at >= 0) list[at].text = value;
      else {
        if (!value.trim()) {
          toast("Scrivi un testo prima di salvare.");
          return;
        }
        list.push({ id: M.uid(), text: value });
      }
      commitMetadata(blocks);
    }
    $("edit-dialog").close();
    editing = null;
    if ($("branches-dialog").open) renderMobileVariants();
  }

  function renderOutline() {
    const current = getDocument();
    const container = $("outline-list");
    container.replaceChildren();
    for (const b of liveBlocks()) {
      const lv = M.level(b);
      if (!lv) continue;
      const item = button(M.label(b), "outline-item", () => {
        jump(b.id);
        closePanels();
      });
      item.style.paddingLeft = 8 + (lv - 1) * 12 + "px";
      container.append(item);
    }
    if (!container.children.length)
      container.append(
        el(
          "p",
          "empty-message",
          "Inizia un paragrafo con # per creare un titolo.",
        ),
      );
    renderFinder();
  }

  function renderFinder() {
    const current = getDocument();
    if (!current) return;
    const q = $("find").value.toLocaleLowerCase("it"),
      box = $("find-results");
    box.replaceChildren();
    if (!q) return;
    let count = 0;
    for (const b of liveBlocks()) {
      const at = b.text.toLocaleLowerCase("it").indexOf(q);
      if (at < 0) continue;
      count += b.text.toLocaleLowerCase("it").split(q).length - 1;
      box.append(
        button(
          (at > 30 ? "…" : "") +
            b.text.slice(Math.max(0, at - 30), at + q.length + 50),
          "find-result",
          () => jump(b.id),
        ),
      );
    }
    box.prepend(el("p", "empty-message", count + " risultati"));
  }

  function renderNotes() {
    const current = getDocument();
    if (!current) return;
    const box = $("notes-list");
    box.replaceChildren();
    for (const b of current.blocks) {
      for (const note of b.notes) {
        const card = el("div", "note-card");
        const anchor = button(
          (b.detached ? "FUORI DAL TESTO · " : "") + M.label(b),
          "note-anchor",
          () => {
            if (!b.detached) {
              jump(b.id);
              closePanels();
            }
          },
        );
        const content = button(
          note.text || "Nota vuota",
          "note-text" + (!note.text ? " empty" : ""),
          () => openEditor("note", b.id, null, note.id),
          "Modifica o elimina nota",
        );
        card.append(anchor, content);
        box.append(card);
      }
    }
    if (!box.children.length)
      box.append(
        el(
          "p",
          "empty-message",
          "Un’idea da ricordare? Aggiungi una nota al paragrafo in cui stai scrivendo.",
        ),
      );
    const archive = $("archive-list");
    archive.replaceChildren();
    const detached = current.blocks.filter((b) => b.detached);
    if (detached.length) {
      archive.append(
        el("h2", "", "FUORI DAL TESTO"),
        el(
          "p",
          "empty-message",
          "Questi paragrafi sono stati rimossi dal testo. Qui conservi le loro varianti e note.",
        ),
      );
      for (const b of detached) {
        const card = el("div", "archive-card");
        card.append(
          el("div", "", M.label(b).slice(0, 90)),
          el(
            "small",
            "",
            b.L.length + b.R.length + " varianti · " + b.notes.length + " note",
          ),
          button("Ripristina nel documento ↗", "", () => {
            const blocks = clone(current.blocks),
              item = blocks.find((v) => v.id === b.id);
            delete item.detached;
            const at = blocks.indexOf(item);
            blocks.splice(at, 1);
            const firstDetached = blocks.findIndex((v) => v.detached);
            blocks.splice(
              firstDetached < 0 ? blocks.length : firstDetached,
              0,
              item,
            );
            commit(M.serialize(blocks), item.id);
            jump(item.id);
            closePanels();
          }),
        );
        archive.append(card);
      }
    }
  }

  function renderMobileVariants() {
    const block = getActiveBlock();
    if (!block) return;
    $("mobile-paragraph").textContent =
      block.text ||
      "Il tronco è vuoto: scegli una variante o scrivi una nuova versione.";
    const box = $("mobile-variants");
    box.replaceChildren();
    for (const side of ["L", "R"]) {
      if (!M.canCreateBranches(block) && !block[side].length) continue;
      const group = el("div", "mobile-variant-group");
      group.append(el("h3", "", side === "L" ? "A SINISTRA" : "A DESTRA"));
      block[side].forEach((variant, index) =>
        group.append(variantCard(block, side, variant, index, "mobile")),
      );
      if (!block[side].length)
        group.append(el("p", "empty-message", "Nessuna variante, per ora."));
      if (M.canCreateBranches(block))
        group.append(
          button("＋ Crea variante", "", () =>
            openEditor("variant", block.id, side),
          ),
        );
      box.append(group);
    }
  }

  function renderDocuments() {
    const current = getDocument();
    const nav = $("documents");
    nav.replaceChildren();
    for (const doc of [...getDocuments()].sort(
      (a, b) => b.updated - a.updated,
    )) {
      const row = el(
        "div",
        "document-row" + (doc.id === current?.id ? " current" : ""),
      );
      const open = button("", "document-open", () => switchDocument(doc.id));
      if (doc.id === current?.id) open.setAttribute("aria-current", "page");
      open.append(
        el("span", "document-name", doc.title || "Senza titolo"),
        el(
          "span",
          "document-date",
          new Intl.DateTimeFormat("it-IT", {
            day: "numeric",
            month: "short",
          }).format(doc.updated) +
            " · " +
            (doc.blocks?.reduce((n, b) => n + b.L.length + b.R.length, 0) ||
              0) +
            " varianti",
        ),
      );
      const remove = button(
        "×",
        "delete-document",
        () => deleteDocument(doc.id),
        "Elimina documento",
      );
      remove.setAttribute(
        "aria-label",
        "Elimina " + (doc.title || "Senza titolo"),
      );
      row.append(open, remove);
      nav.append(row);
    }
  }

  function closePanels() {
    $("left-panel").hidden = true;
    $("notes-panel").hidden = true;
    $("drawer-shade").hidden = true;
    for (const id of ["library-toggle", "index-toggle", "notes-toggle"])
      $(id).setAttribute("aria-expanded", "false");
  }

  function showLeft(tab) {
    const wasOpen = !$("left-panel").hidden;
    const wasTab =
      $("library-tab").getAttribute("aria-pressed") === "true"
        ? "library"
        : "index";
    closePanels();
    if (wasOpen && wasTab === tab) return;
    $("left-panel").hidden = false;
    $("drawer-shade").hidden = false;
    for (const name of ["library", "index"]) {
      $(name + "-content").hidden = name !== tab;
      $(name + "-tab").setAttribute("aria-pressed", name === tab);
    }
    $(tab === "library" ? "library-toggle" : "index-toggle").setAttribute(
      "aria-expanded",
      "true",
    );
  }

  function showNotes() {
    const was = !$("notes-panel").hidden;
    closePanels();
    if (was) return;
    $("notes-panel").hidden = false;
    $("drawer-shade").hidden = false;
    $("notes-toggle").setAttribute("aria-expanded", "true");
  }
  function bind() {
    $("library-toggle").onclick = () => showLeft("library");
    $("index-toggle").onclick = () => showLeft("index");
    $("library-tab").onclick = () => {
      closePanels();
      showLeft("library");
    };
    $("index-tab").onclick = () => {
      closePanels();
      showLeft("index");
    };
    $("notes-toggle").onclick = showNotes;
    $("left-close").onclick = closePanels;
    $("notes-close").onclick = closePanels;
    $("drawer-shade").onclick = closePanels;
    $("edit-form").onsubmit = (event) => {
      event.preventDefault();
      finishEditor();
    };
    $("edit-delete").onclick = () => finishEditor(true);
    for (const b of document.querySelectorAll("[data-close]"))
      b.onclick = () => b.closest("dialog").close();
    for (const dialog of document.querySelectorAll("dialog")) {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          const r = dialog.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            dialog.close();
        }
      });
    }
    $("edit-dialog").addEventListener("close", () => (editing = null));
    $("mobile-branches").onclick = () => {
      renderMobileVariants();
      $("branches-dialog").showModal();
    };
    $("help-open").onclick = () => $("help-dialog").showModal();
    $("panel-add-note").onclick = () => {
      const block = getActiveBlock();
      if (block) openEditor("note", block.id);
    };
    $("new-document").onclick = () => createDocument();
    $("import-open").onclick = () => $("file-input").click();
    $("find").oninput = renderFinder;
    $("replace-all").onclick = () =>
      replaceAll($("find").value, $("replace").value);
  }
  return {
    bind,
    openEditor,
    renderOutline,
    renderFinder,
    renderNotes,
    renderMobileVariants,
    renderDocuments,
    closePanels,
    showLeft,
    showNotes,
  };
}
