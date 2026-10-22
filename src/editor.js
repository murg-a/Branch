import { EditorState, StateField, StateEffect } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Decoration,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
} from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  history,
  historyKeymap,
  defaultKeymap,
  invertedEffects,
} from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import * as M from "./model.js";
import { livePreview } from "./live-preview.js";
const clone = (value) => structuredClone(value);
export const setBlocks = StateEffect.define();
export const blocksField = StateField.define({
  create: (state) => M.fromMarkdown(state.doc.toString()),
  update: (value, tr) => {
    const effect = tr.effects.find((e) => e.is(setBlocks));
    if (effect) return effect.value;
    if (tr.docChanged)
      return M.reconcile(value, tr.newDoc.toString(), (pos, assoc) =>
        tr.changes.mapPos(
          Math.max(0, Math.min(pos, tr.startState.doc.length)),
          assoc,
        ),
      );
    return value;
  },
});
const spaceField = StateField.define({
  create: (state) => spacing(state),
  update: (value, tr) =>
    tr.docChanged || tr.effects.some((e) => e.is(setBlocks))
      ? spacing(tr.state)
      : value,
  provide: (field) => EditorView.decorations.from(field),
});
function spacing(state) {
  const positions = new Map();
  for (const b of state.field(blocksField)) {
    if (b.detached || b.text) continue;
    const pos = state.doc.lineAt(Math.min(b.start, state.doc.length)).from;
    positions.set(
      pos,
      Decoration.line({ class: "cm-paragraph-empty" }).range(pos),
    );
  }
  return Decoration.set([...positions.values()], true);
}
export const transferEffect = StateEffect.define();
export const transferField = StateField.define({
  create: () => null,
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(transferEffect));
    if (effect) return effect.value;
    if (tr.docChanged || tr.effects.some((e) => e.is(setBlocks))) return null;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field, blocksField], (state) => {
      const id = state.field(field),
        block = state
          .field(blocksField)
          .find((b) => b.id === id && !b.detached);
      if (!block) return Decoration.none;
      const first = state.doc.lineAt(
          Math.min(block.start, state.doc.length),
        ).number,
        last = state.doc.lineAt(Math.min(block.end, state.doc.length)).number,
        ranges = [];
      for (let n = first; n <= last; n++)
        ranges.push(
          Decoration.line({ class: "transfer-target-line" }).range(
            state.doc.line(n).from,
          ),
        );
      return Decoration.set(ranges, true);
    }),
});
const syntax = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.monospace,
    fontFamily: "'Courier New',monospace",
    fontSize: ".88em",
  },
  { tag: tags.link, color: "var(--acc)" },
  { tag: tags.quote, color: "var(--mute)" },
  { tag: tags.processingInstruction, color: "var(--mute)" },
]);
export function createEditorState(doc, hooks) {
  return EditorState.create({
    doc: doc.text,
    extensions: [
      blocksField.init(() => clone(doc.blocks)),
      spaceField,
      transferField,
      EditorView.scrollMargins.of(() => ({
        top: hooks.headerHeight() + 20,
        bottom: 24,
      })),
      history(),
      invertedEffects.of((tr) =>
        tr.docChanged || tr.effects.some((e) => e.is(setBlocks))
          ? [setBlocks.of(clone(tr.startState.field(blocksField)))]
          : [],
      ),
      drawSelection(),
      highlightSpecialChars(),
      highlightActiveLine(),
      indentOnInput(),
      bracketMatching(),
      markdown({ base: markdownLanguage }),
      livePreview,
      syntaxHighlighting(syntax),
      search({ top: true }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Testo principale",
        spellcheck: "true",
        lang: "it",
      }),
      keymap.of([
        { key: "Alt-ArrowLeft", run: () => hooks.transfer("L") },
        { key: "Alt-ArrowRight", run: () => hooks.transfer("R") },
        { key: "Mod-b", run: () => hooks.format("bold") },
        { key: "Mod-i", run: () => hooks.format("italic") },
        { key: "Mod-u", run: () => hooks.format("underline") },
        ...historyKeymap,
        ...searchKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        const structural =
          update.docChanged ||
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(setBlocks)),
          );
        if (structural)
          hooks.documentChanged(
            update.state.doc.toString(),
            clone(update.state.field(blocksField)),
          );
        if (update.selectionSet || update.docChanged) hooks.selectionChanged();
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          structural
        )
          hooks.geometryChanged();
        hooks.historyChanged();
      }),
    ],
  });
}
