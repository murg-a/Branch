import { markdownLanguage } from '@codemirror/lang-markdown';
import { TreeFragment } from '@lezer/common';

export function parseMarkdown(text, previous = null, changes = []) {
  const fragments = previous ? TreeFragment.applyChanges(previous.fragments, changes) : [];
  const tree = markdownLanguage.parser.parse(text, fragments);
  return { tree, fragments: TreeFragment.addTree(tree, fragments) };
}

function sourceLines(text) {
  const lines = []; let from = 0;
  for (const value of text.split('\n')) { lines.push({ from, to: from + value.length, text: value }); from += value.length + 1; }
  return lines;
}
function columns(text) { let width = 0; for (const char of text) width += char === '\t' ? 4 - width % 4 : 1; return width; }
function children(node) { const nodes = []; for (let child = node.firstChild; child; child = child.nextSibling) nodes.push(child); return nodes; }
const leaf = /^(?:Paragraph|Task|ATXHeading[1-6]|SetextHeading[12]|FencedCode|CodeBlock|HTMLBlock|HorizontalRule|Table)$/;

// Source coordinates only; DOM presentation is built separately by live-preview.js.
export function previewPlan(text, tree, selections = [{ from: 0, to: 0 }]) {
  const lines = sourceLines(text), nodes = [], units = [], items = [], protectedRanges = [];
  const lineAt = position => {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines[mid].from <= position) lo = mid; else hi = mid - 1; }
    return lines[lo];
  };
  tree.iterate({ enter(ref) {
    const node = ref.node; nodes.push(node);
    if (leaf.test(node.name)) units.push({ from: lineAt(node.from).from, to: node.to, name: node.name });
    if (node.name === 'ListItem') items.push(node);
    if (/^(?:InlineCode|FencedCode|CodeBlock)$/.test(node.name)) protectedRanges.push({ from: node.from, to: node.to });
  }});
  const active = [];
  for (const selection of selections) {
    if (selection.from === selection.to) {
      const match = units.filter(unit => unit.from <= selection.to && unit.to >= selection.to).sort((a, b) => a.to - a.from - (b.to - b.from))[0];
      active.push(match || { from: lineAt(selection.to).from, to: lineAt(selection.to).to });
    } else {
      for (const unit of units) if (unit.from < selection.to && unit.to > selection.from) active.push(unit);
      active.push({ from: selection.from, to: selection.to });
    }
  }
  const isActive = (from, to) => active.some(range => range.from <= to && range.to >= from);
  const linePlan = new Map(), hidden = [], replacements = [], marks = [];
  const entry = position => {
    const line = lineAt(position);
    if (!linePlan.has(line.from)) linePlan.set(line.from, { from: line.from, classes: [], list: null });
    return linePlan.get(line.from);
  };
  const hide = (from, to, kind = 'syntax') => { if (to > from) hidden.push({ from, to, kind }); };
  const replace = (from, to, kind, value, width = null) => { if (to > from) replacements.push({ from, to, kind, text: value, width }); };

  // The innermost item determines the hanging indent of each physical source line.
  for (const item of items) {
    const marker = children(item).find(node => node.name === 'ListMark'); if (!marker) continue;
    const first = lineAt(marker.from); let contentStart = marker.to;
    while (contentStart < first.to && /[ \t]/.test(text[contentStart])) contentStart++;
    const indent = columns(text.slice(first.from, contentStart));
    for (const line of lines) {
      if (line.from < first.from || line.from > item.to) continue;
      const info = entry(line.from);
      const initial = line.from === first.from;
      const prefixEnd = initial ? contentStart : line.from + (/^[ \t]*(?:>[ \t]*)*/.exec(line.text)?.[0].length || 0);
      const prefixWidth = columns(text.slice(line.from, prefixEnd));
      info.classes = [...new Set([...info.classes, 'md-list-line'])];
      info.list = { indent, prefixWidth, prefixFrom: line.from, prefixTo: prefixEnd, initial, marker: text.slice(marker.from, marker.to), active: isActive(line.from, initial ? Math.min(item.to, first.to) : line.to) };
    }
  }

  for (const node of nodes) {
    const parent = node.parent, inactive = !isActive(node.from, node.to);
    const heading = /^(?:ATXHeading|SetextHeading)([1-6])$/.exec(node.name);
    if (heading) entry(node.from).classes.push('md-heading-' + heading[1]);
    if (node.name === 'HeaderMark' && inactive) {
      const first = lineAt(parent.from);
      if (node.from === parent.from && parent.name.startsWith('ATX')) { let to = node.to; while (to < first.to && /[ \t]/.test(text[to])) to++; hide(node.from, to, 'heading'); }
      else { let from = node.from; while (from > first.from && /[ \t]/.test(text[from - 1])) from--; hide(from, node.to, 'heading'); }
    }
    if ((node.name === 'EmphasisMark' || node.name === 'StrikethroughMark') && inactive) hide(node.from, node.to, 'emphasis');
    if (node.name === 'CodeMark' && inactive) hide(node.from, node.to, 'code');
    if (node.name === 'CodeInfo' && inactive) hide(node.from, node.to, 'code-info');
    if (node.name === 'Escape' && inactive) hide(node.from, node.from + 1, 'escape');
    if (node.name === 'QuoteMark') {
      entry(node.from).classes.push('md-quote-line');
      if (inactive) { let to = node.to; if (text[to] === ' ') to++; hide(node.from, to, 'quote'); }
    }
    if (node.name === 'TaskMarker' && inactive) replace(node.from, node.to, 'task', /x/i.test(text.slice(node.from, node.to)) ? '☑' : '☐');
    if (node.name === 'HorizontalRule' && inactive) replace(node.from, node.to, 'rule', '');
    if ((node.name === 'Link' || node.name === 'Image') && inactive) {
      const parts = children(node), first = parts[0];
      const close = parts.find(part => part.name === 'LinkMark' && text.slice(part.from, part.to) === ']');
      if (first?.name === 'LinkMark' && close) {
        if (node.name === 'Image') replace(first.from, first.to, 'image', '▧ '); else hide(first.from, first.to, 'link');
        hide(close.from, node.to, 'link-target');
      }
    }
    if (node.name === 'Autolink' && inactive) for (const child of children(node)) if (child.name === 'LinkMark') hide(child.from, child.to, 'link');
  }

  // Paired inline HTML used by the formatting controls is styled without evaluating HTML.
  const html = new Map();
  for (const node of nodes.filter(node => node.name === 'HTMLTag')) {
    const match = /^<(\/?)(u|b|strong|i|em|s|del|code)\s*>$/i.exec(text.slice(node.from, node.to));
    if (!match) continue;
    const tag = match[2].toLowerCase();
    if (!match[1]) { if (!html.has(tag)) html.set(tag, []); html.get(tag).push(node); }
    else {
      const opening = html.get(tag)?.pop(); if (!opening || opening.to >= node.from) continue;
      marks.push({ from: opening.to, to: node.from, className: 'md-inline-' + tag });
      if (!isActive(opening.from, node.to)) { hide(opening.from, opening.to, 'html'); hide(node.from, node.to, 'html'); }
    }
  }

  for (const info of linePlan.values()) if (info.list) {
    const list = info.list;
    // This prefix also covers any quote markers, preventing overlapping replacements.
    for (let index = hidden.length - 1; index >= 0; index--) if (hidden[index].from >= list.prefixFrom && hidden[index].to <= list.prefixTo) hidden.splice(index, 1);
    if (list.prefixTo > list.prefixFrom) {
      if (list.initial && !list.active) replace(list.prefixFrom, list.prefixTo, 'list', /^\d/.test(list.marker) ? list.marker : '•', list.prefixWidth);
      else marks.push({ from: list.prefixFrom, to: list.prefixTo, className: 'md-list-source', width: list.prefixWidth });
    }
  }
  // Coalesce hidden ranges (e.g. nested formatting in a link destination).
  const merged = [];
  for (const range of hidden.sort((a, b) => a.from - b.from || b.to - a.to)) {
    if (replacements.some(item => range.from >= item.from && range.to <= item.to)) continue;
    const last = merged.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return { active, hidden: merged, replacements, marks, lines: [...linePlan.values()].map(info => ({ ...info, classes: [...new Set(info.classes)] })), protectedRanges };
}

export function headingEdit(text, position, level) {
  if (!Number.isInteger(level) || level < 0 || level > 5) return null;
  const start = position > 0 ? text.lastIndexOf('\n', position - 1) + 1 : 0;
  let end = text.indexOf('\n', position); if (end < 0) end = text.length;
  const line = text.slice(start, end);
  if (/^(?: {4}|\t)/.test(line)) return null;
  const match = /^( {0,3})(?:#{1,6}[ \t]+)?(.*)$/.exec(line);
  const oldPrefix = line.length - match[2].length, prefix = match[1] + (level ? '#'.repeat(level) + ' ' : '');
  return { from: start, to: start + oldPrefix, insert: prefix, anchor: Math.max(start + prefix.length, position + prefix.length - oldPrefix) };
}
