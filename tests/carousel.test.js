import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet } from "@codemirror/state";
import * as M from "../src/model.js";
const fixture = () => {
  const blocks = M.fromMarkdown("Centro\n\nAltro paragrafo");
  Object.assign(blocks[0], {
    mainVersionId: "center",
    mainLabel: "Principale",
    L: [{ id: "left", text: "Sinistra", label: "Prima" }],
    R: [
      { id: "right", text: "Destra", label: "Seconda" },
      { id: "far", text: "Più a destra" },
    ],
    notes: [{ id: "note", text: "Una nota" }],
  });
  return blocks;
};
test("right navigation moves the center left and preserves the horizontal sequence", () => {
  const blocks = fixture(),
    result = M.slideVersion(blocks, blocks[0].id, "R");
  const b = result.blocks[0];
  assert.equal(b.text, "Destra");
  assert.equal(b.mainLabel, "Seconda");
  assert.equal(b.mainVersionId, "right");
  assert.deepEqual(
    b.L.map((v) => v.text),
    ["Centro", "Sinistra"],
  );
  assert.deepEqual(
    b.R.map((v) => v.text),
    ["Più a destra"],
  );
  assert.deepEqual(b.notes, blocks[0].notes);
  assert.equal(result.blocks[1].text, "Altro paragrafo");
  const back = M.slideVersion(result.blocks, b.id, "L");
  assert.deepEqual(back.blocks, blocks);
  assert.equal(blocks[0].text, "Centro");
});
test("left navigation is symmetric and can be reversed without losing titles", () => {
  const blocks = fixture(),
    left = M.slideVersion(blocks, blocks[0].id, "L");
  assert.equal(left.blocks[0].text, "Sinistra");
  assert.deepEqual(
    left.blocks[0].R.map((v) => v.text),
    ["Centro", "Destra", "Più a destra"],
  );
  assert.deepEqual(
    M.slideVersion(left.blocks, blocks[0].id, "R").blocks,
    blocks,
  );
});
test("an empty outer slot is editable and repeated navigation cannot accumulate blanks", () => {
  let result = { blocks: fixture() };
  const id = result.blocks[0].id;
  for (let i = 0; i < 3; i++) result = M.slideVersion(result.blocks, id, "R");
  assert.equal(result.blocks[0].text, "");
  assert.deepEqual(
    result.blocks[0].L.map((v) => v.text),
    ["Più a destra", "Destra", "Centro", "Sinistra"],
  );
  assert.equal(M.slideVersion(result.blocks, id, "R"), null);
  result = M.slideVersion(result.blocks, id, "L");
  assert.equal(result.blocks[0].text, "Più a destra");
  assert.equal(result.blocks[0].R.length, 0);
});
test("blank slots retain the block identity, attachments, and a new text edit", () => {
  const blocks = fixture(),
    id = blocks[0].id;
  let result = M.slideVersion(blocks, id, "L");
  result = M.slideVersion(result.blocks, id, "L");
  const cs = ChangeSet.of(
    { from: 0, insert: "Nuova alternativa" },
    result.text.length,
  );
  const edited = M.reconcile(
    result.blocks,
    "Nuova alternativa" + result.text,
    (p, a) => cs.mapPos(p, a),
  );
  assert.equal(edited[0].id, id);
  assert.equal(edited[0].text, "Nuova alternativa");
  assert.deepEqual(edited[0].notes, blocks[0].notes);
  assert.ok(edited[0].R.some((v) => v.text === "Centro"));
});
test("pinning disables navigation, including direct branch activation", () => {
  const blocks = fixture(),
    id = blocks[0].id;
  blocks[0].locked = true;
  assert.equal(M.slideVersion(blocks, id, "R"), null);
  assert.equal(M.slideVersion(blocks, id, "L"), null);
  assert.equal(M.focusVersion(blocks, id, "R", "right"), null);
  const repinned = M.focusVersion(blocks, id, "R", "far", true);
  assert.equal(repinned.blocks[0].text, "Più a destra");
  assert.equal(repinned.blocks[0].locked, true);
  assert.deepEqual(
    repinned.blocks[0].L.map((v) => v.text),
    ["Destra", "Centro", "Sinistra"],
  );
});
test("ordinary typing preserves title, lock, and current version identity", () => {
  const blocks = fixture(),
    text = M.serialize(blocks).text;
  blocks[0].locked = true;
  const cs = ChangeSet.of({ from: 3, insert: " nuovo" }, text.length);
  const updated = text.slice(0, 3) + " nuovo" + text.slice(3);
  const next = M.reconcile(blocks, updated, (p, a) => cs.mapPos(p, a));
  assert.equal(next[0].mainLabel, "Principale");
  assert.equal(next[0].mainVersionId, "center");
  assert.equal(next[0].locked, true);
  assert.equal(next[0].text, "Cen nuovotro");
});
test("deleting a side version preserves the center and the other alternatives", () => {
  const blocks = fixture(),
    result = M.removeVersion(blocks, blocks[0].id, "R", "right");
  assert.equal(result.blocks[0].text, "Centro");
  assert.deepEqual(
    result.blocks[0].R.map((v) => v.id),
    ["far"],
  );
  assert.deepEqual(result.blocks[0].L, blocks[0].L);
  assert.equal(blocks[0].R.length, 2);
});
test("deleting the center selects the nearest right version, keeps notes and releases the lock", () => {
  const blocks = fixture();
  blocks[0].locked = true;
  const result = M.removeVersion(blocks, blocks[0].id),
    b = result.blocks[0];
  assert.equal(b.text, "Destra");
  assert.equal(b.mainLabel, "Seconda");
  assert.equal(b.locked, false);
  assert.equal(b.mainVersionId, "right");
  assert.deepEqual(b.notes, blocks[0].notes);
  assert.ok(![...b.L, ...b.R].some((v) => v.text === "Centro"));
});
test("deleting the last version leaves an editable slot and keeps its notes", () => {
  const blocks = fixture();
  blocks[0].L = [];
  blocks[0].R = [];
  const result = M.removeVersion(blocks, blocks[0].id);
  assert.equal(result.blocks[0].text, "");
  assert.deepEqual(result.blocks[0].notes, blocks[0].notes);
  assert.equal(result.blocks[1].text, "Altro paragrafo");
});
test("old backups load, and new title, lock and ordering metadata round-trip", () => {
  const blocks = fixture();
  blocks[0].locked = true;
  const doc = { title: "Prova", ...M.serialize(blocks) };
  assert.deepEqual(M.importBackup(M.backup(doc)).blocks, blocks);
  const old = {
    title: "Vecchio",
    text: "Testo",
    blocks: M.fromMarkdown("Testo"),
  };
  const loaded = M.importBackup(M.backup(old));
  assert.equal(
    M.slideVersion(loaded.blocks, loaded.blocks[0].id, "R").blocks[0].text,
    "",
  );
});

test("a pinned main version cannot be dragged into a side branch", () => {
  const blocks = fixture();
  blocks[0].locked = true;
  assert.equal(
    M.move(blocks, { id: blocks[0].id, zone: "T" }, blocks[1].id, "R"),
    null,
  );
  const placed = M.move(
    blocks,
    { id: blocks[0].id, zone: "R", variantId: "right" },
    blocks[1].id,
    "before",
  );
  assert.equal(placed.blocks[0].locked, true);
  assert.equal(placed.blocks[0].text, "Centro");
});
