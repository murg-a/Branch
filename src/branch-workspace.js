import { $ } from "./dom.js";
import * as M from "./model.js";

// A nonmodal workspace: the document remains visible and editable above it.
export function createBranchWorkspace({
  getDocument,
  commit,
  toast,
  onChange,
  onSelect,
  returnToText,
  useVariant,
  undo,
}) {
  let session = null;
  let returnFocus = null;
  const block = () =>
    getDocument()?.id === session?.documentId
      ? getDocument().blocks.find(
          (b) => b.id === session.blockId && !b.detached,
        )
      : null;
  const variant = () =>
    block()?.[session.side].find((v) => v.id === session.itemId);
  const changed = () =>
    session &&
    ($("branch-draft").value !== session.text ||
      $("branch-label").value !== session.label);

  function allowLeave() {
    return (
      !changed() || confirm("La variante ha modifiche non salvate. Scartarle?")
    );
  }
  function close(force = false) {
    if (!force && !allowLeave()) return false;
    const wasOpen = !!session;
    session = null;
    $("branch-workspace").hidden = true;
    document.body.classList.remove("comparing");
    if (wasOpen) {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else returnToText();
    }
    return true;
  }
  function sync() {
    if (!session) return;
    const b = block();
    if (!b) {
      $("branch-original").textContent =
        "Questo paragrafo è stato rimosso. Copia la bozza prima di chiudere.";
      for (const id of [
        "branch-save",
        "branch-use",
        "branch-park",
        "branch-delete",
        "branch-prev",
        "branch-next",
        "branch-new",
      ])
        $(id).disabled = true;
      return;
    }
    for (const id of [
      "branch-use",
      "branch-park",
      "branch-delete",
      "branch-new",
    ])
      $(id).disabled = false;
    const stored = variant();
    if (
      stored &&
      !changed() &&
      (stored.text !== session.text || (stored.label || "") !== session.label)
    ) {
      session.text = stored.text;
      session.label = stored.label || "";
      $("branch-draft").value = session.text;
      $("branch-label").value = session.label;
    }
    $("branch-original-label").textContent = b.mainLabel
      ? `Testo principale · ${b.mainLabel}`
      : "Testo principale";
    $("branch-original").textContent = b.text || "Il testo principale è vuoto.";
    $("branch-position").textContent =
      session.side === "L" ? "A sinistra" : "A destra";
    const list = b[session.side],
      index = list.findIndex((v) => v.id === session.itemId);
    $("branch-pagination").textContent =
      index < 0 ? "Nuova variante" : `${index + 1} di ${list.length}`;
    $("branch-prev").disabled = index <= 0;
    $("branch-next").disabled = index < 0 || index >= list.length - 1;
    $("branch-delete").hidden = !variant();
    $("branch-park").hidden = !M.canCreateBranches(b) || !b.text.trim();
    $("branch-new").hidden = !M.canCreateBranches(b);
    $("branch-save").textContent =
      changed() || !variant() ? "Salva variante" : "Salvata";
    $("branch-save").disabled = !changed() && !!variant();
  }
  function open(blockId, side = "R", itemId = null) {
    if (!allowLeave()) return;
    const doc = getDocument(),
      b = doc?.blocks.find((b) => b.id === blockId && !b.detached);
    if (
      !b ||
      !["L", "R"].includes(side) ||
      (!itemId && !M.canCreateBranches(b))
    )
      return;
    const v = b[side].find((v) => v.id === itemId);
    if (itemId && !v) return;
    if (!session) returnFocus = document.activeElement;
    onSelect(blockId);
    session = {
      documentId: doc.id,
      blockId,
      side,
      itemId,
      text: v?.text ?? b.text,
      label: v?.label || "",
    };
    $("branch-draft").value = session.text;
    $("branch-label").value = session.label;
    $("branch-workspace").hidden = false;
    document.body.classList.add("comparing");
    sync();
    $("branch-draft").focus({ preventScroll: true });
  }
  function save() {
    const b = block();
    if (!b) return false;
    if (!session.itemId && !M.canCreateBranches(b)) {
      toast(
        "Non puoi aggiungere rami a un titolo. Copia la bozza in un paragrafo.",
      );
      return false;
    }
    if (!$("branch-draft").value.trim()) {
      toast("Scrivi un testo per la variante.");
      return false;
    }
    // Do not silently recreate a variant removed through undo or another action.
    if (session.itemId && !variant()) {
      toast("Questa variante non esiste più. Riapri il confronto.");
      return false;
    }
    if (variant() && !changed()) return true;
    if (
      variant() &&
      (variant().text !== session.text ||
        (variant().label || "") !== session.label)
    ) {
      toast(
        "La variante è cambiata durante il confronto. Copia la bozza e riapri la variante prima di salvare.",
      );
      return false;
    }
    const blocks = structuredClone(getDocument().blocks);
    const target = blocks.find((b) => b.id === session.blockId);
    const id = session.itemId || M.uid();
    const value = {
      id,
      text: $("branch-draft").value,
      label: $("branch-label").value.trim().slice(0, 80),
    };
    const index = target[session.side].findIndex((v) => v.id === id);
    if (index < 0) target[session.side].push(value);
    else
      target[session.side][index] = {
        ...target[session.side][index],
        ...value,
      };
    session.itemId = id;
    session.text = value.text;
    session.label = value.label;
    $("branch-label").value = value.label;
    commit({ text: getDocument().text, blocks }, b.id);
    onChange();
    sync();
    return true;
  }
  $("branch-close").onclick = () => close();
  $("branch-save").onclick = () => {
    if (save()) toast("Variante salvata. Il testo principale è invariato.");
  };
  $("branch-use").onclick = async () => {
    if (!session) return;
    if (!save()) return;
    const { blockId, side, itemId } = session;
    close(true);
    await useVariant(blockId, side, itemId);
    onChange();
    toast("Variante inserita. La versione precedente resta nel ramo.", undo);
  };
  $("branch-park").onclick = () => {
    if (!allowLeave()) return;
    const { blockId, side } = session;
    const result = M.park(getDocument().blocks, blockId, side);
    if (!result) return;
    close(true);
    commit(result, blockId);
    onChange();
    toast("Paragrafo messo da parte. Il testo principale ora è vuoto.", undo);
  };
  $("branch-delete").onclick = () => {
    if (!allowLeave() || !variant()) return;
    const { blockId, side, itemId } = session;
    const blocks = structuredClone(getDocument().blocks);
    const b = blocks.find((b) => b.id === blockId);
    b[side] = b[side].filter((v) => v.id !== itemId);
    close(true);
    commit({ text: getDocument().text, blocks }, blockId);
    onChange();
    toast("Variante eliminata.", undo);
  };
  for (const [id, delta] of [
    ["branch-prev", -1],
    ["branch-next", 1],
  ])
    $(id).onclick = () => {
      const list = block()?.[session.side] || [],
        index = list.findIndex((v) => v.id === session.itemId);
      if (list[index + delta])
        open(session.blockId, session.side, list[index + delta].id);
    };
  $("branch-new").onclick = () => open(session.blockId, session.side);
  for (const id of ["branch-draft", "branch-label"]) $(id).oninput = sync;
  $("branch-workspace").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      e.stopPropagation();
      save();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (changed()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  return { open, close, sync };
}
