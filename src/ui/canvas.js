import { cursorFor, dragObject, handleAt, objectAt, resizeObject, rotateObject } from "../core/hit-test.js";
import { snapTargets } from "../core/snap.js";
import { layoutSheet } from "../core/layout.js";
import { buildScene } from "../core/scene.js";
import { mountScene } from "../render/render-svg.js";
import { strings } from "../strings.pt-BR.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Interactive preview (task 04.01.10).
 *
 * The scene itself comes from render-svg; this module stacks a second SVG on top
 * for selection, handles and snap guides. All geometry comes from core/hit-test,
 * so the maths stays testable and this file only routes pointer events.
 */

function clientToMm(svg, event) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY);
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

export function mountCanvas(host, { store, measure = null, onSelect = () => {} } = {}) {
  if (!host) throw new TypeError("mountCanvas requires a host element");
  if (!store) throw new TypeError("mountCanvas requires a store");

  host.replaceChildren();
  host.classList.add("canvas");

  const sceneLayer = document.createElement("div");
  sceneLayer.className = "canvas__scene";
  const overlay = document.createElementNS(SVG_NS, "svg");
  overlay.classList.add("canvas__overlay");
  overlay.setAttribute("aria-hidden", "true");
  host.append(sceneLayer, overlay);

  let scene = null;
  let layout = null;
  let guides = [];
  let drag = null;

  function currentLayout() {
    const preset = store.getPreset();
    const next = layoutSheet(preset.page.size, preset.page.orientation);
    return next.ok ? next : null;
  }

  function drawOverlay() {
    if (!scene) return;
    overlay.setAttribute("viewBox", `0 0 ${scene.widthMm} ${scene.heightMm}`);
    const selected = store.getSelection();
    const object = store.getPreset().objects?.find((item) => item.id === selected);
    const nodes = [];

    for (const guide of guides) {
      const line = document.createElementNS(SVG_NS, "line");
      if (guide.axis === "x") {
        line.setAttribute("x1", String(guide.position));
        line.setAttribute("x2", String(guide.position));
        line.setAttribute("y1", "0");
        line.setAttribute("y2", String(scene.heightMm));
      } else {
        line.setAttribute("y1", String(guide.position));
        line.setAttribute("y2", String(guide.position));
        line.setAttribute("x1", "0");
        line.setAttribute("x2", String(scene.widthMm));
      }
      line.setAttribute("class", "canvas__guide");
      nodes.push(line);
    }

    if (object && object.visible !== false) {
      const box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("x", String(object.x));
      box.setAttribute("y", String(object.y));
      box.setAttribute("width", String(object.w));
      box.setAttribute("height", String(object.h));
      box.setAttribute("class", "canvas__selection");
      if (object.rotation) {
        const cx = object.x + object.w / 2;
        const cy = object.y + object.h / 2;
        box.setAttribute("transform", `rotate(${object.rotation} ${cx} ${cy})`);
      }
      nodes.push(box);

      // handles keep a constant size on screen so they stay hittable at any zoom
      const sceneSvg = sceneLayer.querySelector("svg");
      const pxPerMm = sceneSvg ? sceneSvg.getBoundingClientRect().width / scene.widthMm : 2;
      const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
      const radiusPx = coarse ? 11 : 7;
      const radiusMm = pxPerMm > 0 ? radiusPx / pxPerMm : 1.4;

      for (const [handle, position] of Object.entries(handlePositions(object))) {
        const dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", String(position.x));
        dot.setAttribute("cy", String(position.y));
        dot.setAttribute("r", String(radiusMm));
        dot.setAttribute("class", "canvas__handle");
        dot.dataset.handle = handle;
        nodes.push(dot);
      }
    }

    overlay.replaceChildren(...nodes);
  }

  function handlePositions(object) {
    const { x, y, w, h } = object;
    return {
      nw: { x, y },
      n: { x: x + w / 2, y },
      ne: { x: x + w, y },
      e: { x: x + w, y: y + h / 2 },
      se: { x: x + w, y: y + h },
      s: { x: x + w / 2, y: y + h },
      sw: { x, y: y + h },
      w: { x, y: y + h / 2 },
      rotate: { x: x + w / 2, y: y - 6 },
    };
  }

  function render() {
    const preset = store.getPreset();
    layout = currentLayout();
    if (!layout) {
      sceneLayer.replaceChildren();
      overlay.replaceChildren();
      return;
    }
    scene = buildScene({ preset, layout, mode: "page", ...(measure ? { measure } : {}) });
    const svg = mountScene(sceneLayer, scene, { label: strings.preview.ariaLabel });
    // An SVG without width/height attributes gets a 0x0 viewport unless CSS gives
    // it a ratio: the box would paint its background while the content vanished.
    svg.style.aspectRatio = `${scene.widthMm} / ${scene.heightMm}`;
    svg.addEventListener("pointerdown", onPointerDown);
    drawOverlay();
  }

  function targetsFor(object) {
    return snapTargets({ preset: store.getPreset(), cell: layout?.cells?.[0] ?? null, excludeId: object?.id ?? null });
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const svg = sceneLayer.querySelector("svg");
    if (!svg) return;
    const point = clientToMm(svg, event);
    const objects = store.getPreset().objects ?? [];
    const selected = objects.find((object) => object.id === store.getSelection());

    let handle = selected ? handleAt(selected, point) : null;
    const target = handle ? selected : objectAt(objects, point);

    if (!target) {
      store.select(null);
      drawOverlay();
      drawGuides([]);
      onSelect(null);
      return;
    }

    store.select(target.id);
    onSelect(target.id);
    handle = handleAt(target, point);
    if (target.locked) {
      drawOverlay();
      return;
    }

    drag = {
      id: target.id,
      handle: handle ?? "move",
      start: point,
      object: { ...target },
      moved: false,
    };
    svg.setPointerCapture?.(event.pointerId);
    event.preventDefault();

    const move = (moveEvent) => onPointerMove(moveEvent, svg);
    const up = (upEvent) => onPointerUp(upEvent, svg, move, up);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up, { once: true });
    svg.addEventListener("pointercancel", up, { once: true });
  }

  function onPointerMove(event, svg) {
    if (!drag) return;
    const point = clientToMm(svg, event);
    const snap = event.altKey !== true;
    const aspect = event.shiftKey === true && drag.handle !== "move";
    const targets = targetsFor(drag.object);
    const tag = `drag:${drag.id}`;

    let next;
    if (drag.handle === "rotate") {
      next = rotateObject(drag.object, point, { snap: event.shiftKey === true });
      guides = [];
    } else if (drag.handle === "move") {
      next = dragObject(drag.object, drag.start, point, { targets, snap });
      guides = next.guides ?? [];
    } else {
      next = resizeObject(drag.object, drag.handle, drag.start, point, { targets, snap, aspect });
      guides = next.guides ?? [];
    }

    if (!drag.moved) {
      drag.moved = true;
      svg.style.cursor = drag.handle === "rotate" ? "grabbing" : cursorFor(drag.handle);
    }

    store.update((draft) => {
      const object = draft.objects?.find((item) => item.id === drag.id);
      if (!object) return;
      object.x = next.x ?? object.x;
      object.y = next.y ?? object.y;
      if (typeof next.w === "number") object.w = next.w;
      if (typeof next.h === "number") object.h = next.h;
      if (typeof next.rotation === "number") object.rotation = next.rotation;
    }, { tag, label: strings.preview.drag });

    render();
  }

  function onPointerUp(_event, svg, move, up) {
    svg.removeEventListener("pointermove", move);
    svg.removeEventListener("pointerup", up);
    svg.removeEventListener("pointercancel", up);
    drag = null;
    guides = [];
    svg.style.cursor = "";
    drawOverlay();
  }

  function drawGuides(lines) {
    guides = lines;
    drawOverlay();
  }

  render();

  const unsubscribe = store.subscribe((event) => {
    if (event.type === "change" || event.type === "selection") render();
  });

  return {
    node: host,
    refresh: render,
    unsubscribe,
    getGuides: () => guides,
  };
}
