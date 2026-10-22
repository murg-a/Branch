export const $ = (id) => document.getElementById(id);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function button(text, cls, fn, title) {
  const b = el("button", cls, text === "↗" ? "" : text);
  if (text === "↗") b.append(outwardIcon());
  b.type = "button";
  b.onclick = fn;
  if (title) b.title = title;
  return b;
}

export function outwardIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "outward-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 12L12 4M4 4h8v8");
  svg.append(path);
  return svg;
}

export function mapPreview(text) {
  const words = text.match(/\S+/gu) || [],
    preview = el("span", "map-preview");
  preview.append(el("span", "map-preview-words", words.slice(0, 10).join(" ")));
  if (words.length > 10) {
    const tail = el("span", "map-preview-tail");
    tail.setAttribute("aria-hidden", "true");
    preview.append(tail);
    const lines = el("span", "map-preview-lines");
    lines.setAttribute("aria-hidden", "true");
    lines.append(el("span"), el("span"));
    preview.append(lines);
  }
  return preview;
}
