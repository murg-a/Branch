import test from "node:test";
import assert from "node:assert/strict";
import { Transaction } from "@codemirror/state";
import { undo, redo, isolateHistory } from "@codemirror/commands";
import { createEditorState, blocksField, setBlocks } from "../src/editor.js";
import * as M from "../src/model.js";
const hooks = {
  headerHeight: () => 100,
  transfer: () => true,
  format: () => true,
  documentChanged: () => {},
  selectionChanged: () => {},
  geometryChanged: () => {},
  historyChanged: () => {},
};
function document() {
  const text = "Primo paragrafo\n\nSecondo paragrafo";
  const blocks = M.fromMarkdown(text);
  blocks[0].notes = [{ id: "note", text: "Da conservare" }];
  blocks[0].R = [{ id: "variant", text: "Alternativa" }];
  return { text, blocks };
}
test("editor states clone document attachments instead of sharing mutable input", () => {
  const doc = document(),
    state = createEditorState(doc, hooks);
  doc.blocks[0].notes[0].text = "Modificata fuori editor";
  assert.equal(state.field(blocksField)[0].notes[0].text, "Da conservare");
});
test("typing reconciles block identity, notes and branches through the extracted editor field", () => {
  const doc = document();
  let state = createEditorState(doc, hooks);
  state = state.update({ changes: { from: 0, insert: "Nuovo " } }).state;
  const first = state.field(blocksField)[0];
  assert.equal(first.id, doc.blocks[0].id);
  assert.deepEqual(first.notes, doc.blocks[0].notes);
  assert.deepEqual(first.R, doc.blocks[0].R);
});
test("structural branch operations keep text and metadata in a single undo/redo transaction", () => {
  const doc = document();
  let state = createEditorState(doc, hooks);
  const parked = M.park(doc.blocks, doc.blocks[0].id, "L");
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: parked.text },
    effects: setBlocks.of(parked.blocks),
    annotations: [
      Transaction.userEvent.of("input.branch"),
      isolateHistory.of("full"),
    ],
  }).state;
  const target = {
    get state() {
      return state;
    },
    dispatch: (transaction) => {
      state = transaction.state;
    },
  };
  assert(undo(target));
  assert.equal(state.doc.toString(), doc.text);
  assert.deepEqual(state.field(blocksField), doc.blocks);
  assert(redo(target));
  assert.deepEqual(state.field(blocksField), parked.blocks);
});
