import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { parseMarkdown, previewPlan } from './markdown-plan.js';

class MarkdownWidget extends WidgetType {
  constructor(kind, text, width) { super(); this.kind = kind; this.text = text; this.width = width; }
  eq(other) { return this.kind === other.kind && this.text === other.text && this.width === other.width; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'md-widget md-widget-' + this.kind;
    span.textContent = this.text;
    span.setAttribute('aria-hidden', 'true');
    if (this.width != null) span.style.width = this.width + 'ch';
    return span;
  }
  ignoreEvent() { return false; }
}
function build(state, parsed) {
  const plan = previewPlan(state.doc.toString(), parsed.tree, state.selection.ranges.map(range => ({ from: range.from, to: range.to })));
  const ranges = [], atomic = [];
  for (const line of plan.lines) {
    const style = line.list ? '--list-indent:' + line.list.indent + 'ch;--list-outdent:-' + line.list.prefixWidth + 'ch' : '';
    ranges.push(Decoration.line({ class: line.classes.join(' '), attributes: style ? { style } : {} }).range(line.from));
  }
  for (const hidden of plan.hidden) {
    const range = Decoration.replace({ inclusive: false }).range(hidden.from, hidden.to);
    ranges.push(range); atomic.push(range);
  }
  for (const replacement of plan.replacements) {
    const range = Decoration.replace({ widget: new MarkdownWidget(replacement.kind, replacement.text, replacement.width), inclusive: false }).range(replacement.from, replacement.to);
    ranges.push(range); atomic.push(range);
  }
  for (const mark of plan.marks) if (mark.to > mark.from) ranges.push(Decoration.mark({ class: mark.className, attributes: mark.width == null ? {} : { style: 'width:' + mark.width + 'ch' } }).range(mark.from, mark.to));
  return { ...parsed, plan, decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) };
}
export const livePreview = StateField.define({
  create: state => build(state, parseMarkdown(state.doc.toString())),
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection) return value;
    let parsed = value;
    if (transaction.docChanged) {
      const changes = [];
      transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => changes.push({ fromA, toA, fromB, toB }));
      parsed = parseMarkdown(transaction.newDoc.toString(), value, changes);
    }
    return build(transaction.state, parsed);
  },
  provide: field => [EditorView.decorations.from(field, value => value.decorations), EditorView.atomicRanges.of(view => view.state.field(field).atomic)],
});
