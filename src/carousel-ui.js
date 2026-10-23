import { $ } from "./dom.js";
import * as M from "./model.js";

export function createVersionMenu({
  getDocument,
  commit,
  refresh,
  undo,
  toast,
}) {
  let target = null;
  let opener = null;
  let anchor = null;
  const menu = $("paragraph-menu");
  function close() {
    menu.hidden = true;
    opener?.setAttribute("aria-expanded", "false");
    target = null;
  }
  function open(event, blockId, side = null, variantId = null) {
    event.stopPropagation();
    const block = getDocument()?.blocks.find(
      (b) => b.id === blockId && !b.detached,
    );
    const version = side
      ? block?.[side].find((v) => v.id === variantId)
      : block;
    if (!version) return;
    close();
    opener = event.currentTarget;
    target = { documentId: getDocument().id, blockId, side, variantId };
    $("paragraph-version-title").value =
      (side ? version.label : block.mainLabel) || "";
    $("paragraph-pin").textContent =
      !side && block.locked ? "Sblocca scorrimento" : "Blocca al centro";
    menu.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    anchor = opener.getBoundingClientRect();
    position();
    $("paragraph-version-title").focus({ preventScroll: true });
  }
  function position() {
    if (menu.hidden || !anchor) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const left = viewport?.offsetLeft || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    menu.style.left =
      Math.max(
        left + 8,
        Math.min(
          left + width - menu.offsetWidth - 8,
          anchor.right - menu.offsetWidth,
        ),
      ) + "px";
    menu.style.top =
      Math.max(
        top + 8,
        Math.min(top + height - menu.offsetHeight - 8, anchor.bottom + 6),
      ) + "px";
  }
  function currentTarget() {
    return target?.documentId === getDocument()?.id ? target : null;
  }
  $("paragraph-title-form").onsubmit = (e) => {
    e.preventDefault();
    const t = currentTarget();
    if (!t) return close();
    const blocks = structuredClone(getDocument().blocks);
    const block = blocks.find((b) => b.id === t.blockId && !b.detached);
    const version = t.side
      ? block?.[t.side].find((v) => v.id === t.variantId)
      : block;
    if (!version) return close();
    const key = t.side ? "label" : "mainLabel";
    const value = $("paragraph-version-title").value.trim();
    if (value) version[key] = value;
    else delete version[key];
    close();
    commit({ text: getDocument().text, blocks }, t.blockId);
    refresh();
  };
  $("paragraph-pin").onclick = () => {
    const t = currentTarget();
    if (!t) return close();
    let result;
    if (t.side)
      result = M.focusVersion(
        getDocument().blocks,
        t.blockId,
        t.side,
        t.variantId,
        true,
      );
    else {
      const blocks = structuredClone(getDocument().blocks);
      const block = blocks.find((b) => b.id === t.blockId && !b.detached);
      if (!block) return close();
      block.locked = !block.locked;
      result = { text: getDocument().text, blocks };
    }
    close();
    if (result) {
      commit(result, t.blockId);
      refresh();
    }
  };
  $("paragraph-delete").onclick = () => {
    const t = currentTarget();
    if (!t) return close();
    const result = M.removeVersion(
      getDocument().blocks,
      t.blockId,
      t.side,
      t.variantId,
    );
    close();
    if (result) {
      commit(result, t.blockId);
      refresh();
      toast("Versione eliminata.", undo);
    }
  };
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !e.target.closest("#paragraph-menu")) close();
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const source = opener;
      close();
      source?.focus({ preventScroll: true });
    }
  });
  window.addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", position);
  window.visualViewport?.addEventListener("scroll", position);
  window.addEventListener("scroll", close, { passive: true });
  return { open, close };
}

// Horizontal gestures switch one paragraph; vertical movement remains native.
export function bindCarouselGestures({ element, blockAt, canSlide, slide }) {
  let gesture = null;
  element.addEventListener(
    "touchstart",
    (event) => {
      gesture = null;
      if (event.touches.length !== 1 || !getSelection()?.isCollapsed) return;
      const touch = event.touches[0],
        id = blockAt(touch.clientX, touch.clientY);
      if (id && canSlide(id))
        gesture = {
          id,
          x: touch.clientX,
          y: touch.clientY,
          at: performance.now(),
          horizontal: false,
        };
    },
    { passive: true },
  );
  element.addEventListener(
    "touchmove",
    (event) => {
      if (
        !gesture ||
        event.touches.length !== 1 ||
        !getSelection()?.isCollapsed
      ) {
        gesture = null;
        return;
      }
      const touch = event.touches[0],
        dx = touch.clientX - gesture.x,
        dy = touch.clientY - gesture.y;
      if (
        !gesture.horizontal &&
        Math.abs(dy) > 12 &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4)
        gesture.horizontal = true;
      if (gesture.horizontal && event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  element.addEventListener(
    "touchend",
    (event) => {
      const start = gesture;
      gesture = null;
      if (!start || !event.changedTouches.length) return;
      const touch = event.changedTouches[0],
        dx = touch.clientX - start.x,
        dy = touch.clientY - start.y;
      if (
        start.horizontal &&
        Math.abs(dx) >= 48 &&
        Math.abs(dx) > Math.abs(dy) * 1.4 &&
        performance.now() - start.at < 1200
      )
        slide(start.id, dx < 0 ? "R" : "L");
    },
    { passive: true },
  );
  element.addEventListener(
    "touchcancel",
    () => {
      gesture = null;
    },
    { passive: true },
  );
  let wheel = { id: null, total: 0, at: 0, cooldown: 0 };
  element.addEventListener(
    "wheel",
    (event) => {
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.5 ||
        !event.deltaX
      )
        return;
      const id = blockAt(event.clientX, event.clientY);
      if (!id || !canSlide(id)) return;
      event.preventDefault();
      const now = performance.now();
      if (now < wheel.cooldown) return;
      const delta =
        event.deltaX *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerWidth : 1);
      if (
        id !== wheel.id ||
        now - wheel.at > 200 ||
        Math.sign(delta) !== Math.sign(wheel.total)
      )
        wheel.total = 0;
      wheel.id = id;
      wheel.at = now;
      wheel.total += delta;
      if (Math.abs(wheel.total) >= 70) {
        slide(id, wheel.total > 0 ? "R" : "L");
        wheel.total = 0;
        wheel.cooldown = now + 450;
      }
    },
    { passive: false },
  );
}
