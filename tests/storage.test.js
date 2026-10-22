import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/storage.js";
import { fromMarkdown } from "../src/model.js";

function fixture(overrides = {}) {
  let current = {
    id: "document",
    title: "Test",
    text: "Originale",
    blocks: fromMarkdown("Originale"),
    updated: 1,
  };
  const writes = [],
    statuses = [],
    errors = [];
  const records = [structuredClone(current)];
  let scheduled = null;
  const db = {
    getAll: async () => records,
    put: async (store, doc) => {
      writes.push(structuredClone(doc));
    },
    delete: async () => {},
    transaction: () => ({
      store: { put: (doc) => writes.push(structuredClone(doc)) },
      done: Promise.resolve(),
    }),
    ...overrides,
  };
  const selections = new Map([["tasto-current", current.id]]);
  const storage = createStorage({
    getCurrent: () => current,
    onStatus: (s) => statuses.push(s),
    onSaved: () => {},
    onError: (e) => errors.push(e),
    openDatabase: async (name, version) => {
      assert.equal(name, "tasto-web");
      assert.equal(version, 1);
      return db;
    },
    selectionStorage: {
      getItem: (key) => selections.get(key),
      setItem: (key, value) => selections.set(key, value),
    },
    schedule: (callback) => {
      scheduled = callback;
      return callback;
    },
    cancel: (timer) => {
      if (timer === scheduled) scheduled = null;
    },
  });
  return {
    storage,
    writes,
    statuses,
    errors,
    records,
    selections,
    get current() {
      return current;
    },
    set current(value) {
      current = value;
    },
    fire: () => scheduled?.(),
  };
}

test("storage preserves the database/selection identity and exact document on load", async () => {
  const f = fixture();
  const loaded = await f.storage.load();
  assert.equal(loaded.current.id, "document");
  assert.equal(loaded.current.text, "Originale");
  assert.equal(f.storage.available, true);
  assert.equal(f.writes.length, 0);
  f.storage.select("next");
  assert.equal(f.selections.get("tasto-current"), "next");
});
test("autosave coalesces edits and marks the latest revision saved", async () => {
  const f = fixture();
  await f.storage.load();
  f.storage.markDirty();
  f.current.text = "Due modifiche";
  f.storage.markDirty();
  assert(f.storage.hasUnsavedChanges());
  await f.fire();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].text, "Due modifiche");
  assert.equal(f.storage.hasUnsavedChanges(), false);
  assert.equal(f.statuses.at(-1), "Salvato sul dispositivo");
});
test("queued saves capture immutable snapshots and an older write cannot mark a newer edit saved", async () => {
  const releases = [];
  const f = fixture({
    put: (store, doc) =>
      new Promise((resolve) => releases.push({ text: doc.text, resolve })),
  });
  await f.storage.load();
  f.storage.markDirty();
  const first = f.storage.persist();
  await Promise.resolve();
  f.current.text = "Nuova versione";
  f.storage.markDirty();
  const second = f.storage.persist();
  assert.equal(releases.length, 1);
  assert.equal(releases[0].text, "Originale");
  releases[0].resolve();
  await first;
  assert(f.storage.hasUnsavedChanges());
  assert.equal(releases[1].text, "Nuova versione");
  releases[1].resolve();
  await second;
  assert.equal(f.storage.hasUnsavedChanges(), false);
});
test("failed writes keep the document dirty and do not prevent a later retry", async () => {
  let fail = true;
  const f = fixture({
    put: async () => {
      if (fail) throw Error("QuotaExceededError");
    },
  });
  await f.storage.load();
  f.storage.markDirty();
  assert.equal(await f.storage.persist(), false);
  assert(f.storage.hasUnsavedChanges());
  assert.equal(f.statuses.at(-1), "Salvataggio non riuscito");
  assert.equal(f.errors.length, 1);
  fail = false;
  assert.equal(await f.storage.persist(), true);
  assert.equal(f.storage.hasUnsavedChanges(), false);
});
test("an unavailable database returns an exportable temporary document", async () => {
  const errors = [];
  let current;
  const storage = createStorage({
    getCurrent: () => current,
    onStatus: () => {},
    onSaved: () => {},
    onError: (e) => errors.push(e),
    openDatabase: async () => {
      throw Error("Unavailable");
    },
    selectionStorage: null,
  });
  const loaded = await storage.load();
  current = loaded.current;
  assert.equal(storage.available, false);
  assert.equal(current.title, "Documento temporaneo");
  assert.equal(current.blocks.length, 1);
  assert.equal(await storage.persist(), false);
  assert.equal(errors.length, 1);
});
test("legacy migration retains source text and does not rewrite it through serialization", async () => {
  const f = fixture();
  f.records.splice(0, 1, {
    id: "legacy",
    title: "Vecchio documento",
    text: "# Titolo\n\n\nTesto  \n",
    updated: 1,
  });
  const loaded = await f.storage.load();
  assert.equal(loaded.documents[0].text, "# Titolo\n\n\nTesto  \n");
  assert(loaded.documents[0].blocks.length);
  await f.storage.migrate(loaded.documents);
  assert.equal(f.writes[1].text, "# Titolo\n\n\nTesto  \n");
});
test("a completed write for another document does not change the active save status", async () => {
  let finish;
  const f = fixture({
    put: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await f.storage.load();
  f.storage.markDirty();
  const pending = f.storage.persist();
  await Promise.resolve();
  f.current = { ...f.current, id: "other" };
  f.storage.resetRevision();
  const count = f.statuses.length;
  finish();
  await pending;
  assert.equal(f.statuses.length, count);
  assert.equal(f.storage.hasUnsavedChanges(), false);
});
test("storage lifecycle flushes on hide and warns only while edits are unsaved", async () => {
  const f = fixture();
  await f.storage.load();
  const window = new EventTarget(),
    document = new EventTarget();
  document.hidden = true;
  const dispose = f.storage.bindLifecycle(window, document);
  f.storage.markDirty();
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  assert.equal(dirty.defaultPrevented, true);
  document.dispatchEvent(new Event("visibilitychange"));
  await f.storage.persist();
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  assert.equal(clean.defaultPrevented, false);
  dispose();
});
