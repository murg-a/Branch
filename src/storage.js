import { openDB } from "idb";
import * as M from "./model.js";

// Database identity and selection key are retained for existing Branch/Tasto documents.
const DATABASE = "tasto-web";
const SELECTION_KEY = "tasto-current";
export function createStorage({
  getCurrent,
  onStatus,
  onSaved,
  onError,
  openDatabase = openDB,
  selectionStorage,
  schedule = setTimeout,
  cancel = clearTimeout,
  saveDelay = 450,
}) {
  let db = null,
    timer,
    revision = 0,
    persistedRevision = 0,
    queue = Promise.resolve();

  async function load() {
    try {
      db = await openDatabase(DATABASE, 1, {
        upgrade(database) {
          database.createObjectStore("documents", { keyPath: "id" });
        },
      });
      const saved = await db.getAll("documents");
      const documents = saved.map(M.normalizeDocument);
      let selected;
      try {
        selected = (selectionStorage ?? globalThis.localStorage)?.getItem(
          SELECTION_KEY,
        );
      } catch {}
      if (!documents.length) {
        const first = M.seedDocument();
        await db.put("documents", first);
        documents.push(first);
        selected = first.id;
      } else if (saved.every((doc) => !doc.blocks)) {
        const example = M.seedDocument();
        await db.put("documents", example);
        documents.push(example);
        if (
          documents.every((doc) =>
            ["Uno spazio per le tue parole", "La città come testo"].includes(
              doc.title,
            ),
          )
        )
          selected = example.id;
      }
      return {
        documents,
        current: documents.find((doc) => doc.id === selected) || documents[0],
      };
    } catch {
      db = null;
      const current = {
        id: M.uid(),
        title: "Documento temporaneo",
        text: "",
        blocks: M.fromMarkdown(""),
        updated: Date.now(),
      };
      onError(
        "Il browser non consente il salvataggio. Esporta il file Branch prima di chiudere.",
      );
      return { documents: [current], current };
    }
  }

  function markDirty() {
    const current = getCurrent();
    current.updated = Date.now();
    revision++;
    onStatus("Salvataggio…");
    cancel(timer);
    timer = schedule(() => persist(), saveDelay);
  }

  async function persist() {
    cancel(timer);
    const current = getCurrent();
    if (!db || !current) return false;
    const snapshot = structuredClone(current),
      version = revision;
    const task = queue.then(async () => {
      try {
        await db.put("documents", snapshot);
        if (getCurrent()?.id === snapshot.id && revision === version) {
          persistedRevision = version;
          onStatus("Salvato sul dispositivo");
        }
        onSaved();
        return true;
      } catch {
        if (getCurrent()?.id === snapshot.id)
          onStatus("Salvataggio non riuscito");
        onError(
          "Archivio non disponibile o pieno. Esporta il file Branch per conservare il lavoro.",
        );
        return false;
      }
    });
    queue = task.then(() => {});
    return task;
  }

  async function migrate(documents) {
    const tx = db.transaction("documents", "readwrite");
    for (const doc of documents) tx.store.put(doc);
    try {
      await tx.done;
    } catch {
      onError(
        "Impossibile salvare la migrazione. Esporta una copia del documento.",
      );
    }
  }

  function hasUnsavedChanges() {
    return !!getCurrent() && revision !== persistedRevision;
  }
  function bindLifecycle(window, document) {
    const hide = () => persist();
    const visibility = () => {
      if (document.hidden) persist();
    };
    const unload = (event) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("beforeunload", unload);
    };
  }

  return {
    load,
    markDirty,
    persist,
    migrate,
    hasUnsavedChanges,
    bindLifecycle,
    get available() {
      return db !== null;
    },
    resetRevision() {
      revision = 0;
      persistedRevision = 0;
    },
    write: (doc) => db.put("documents", doc),
    remove: (id) => db.delete("documents", id),
    select(id) {
      try {
        (selectionStorage ?? globalThis.localStorage)?.setItem(
          SELECTION_KEY,
          id,
        );
      } catch {}
    },
  };
}
