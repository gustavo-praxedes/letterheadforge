/**
 * Keeps objects on the page when the paper changes size (spec R75 allows free
 * placement afterwards; this only prevents an object from being stranded
 * outside a page that just became smaller).
 *
 * Positions follow the page proportionally and sizes are capped to the page.
 * Pure: no DOM, no store.
 */
export function fitObjectsToPage(objects, from, to) {
  if (!Array.isArray(objects) || objects.length === 0) return [];
  if (!isSize(from) || !isSize(to)) return [];
  if (from.w === to.w && from.h === to.h) return objects;

  const scaleX = to.w / from.w;
  const scaleY = to.h / from.h;

  return objects.map((object) => {
    const w = tenth(Math.min(Number(object.w) || 0, to.w));
    const h = tenth(Math.min(Number(object.h) || 0, to.h));
    const x = tenth(clamp((Number(object.x) || 0) * scaleX, to.w - w));
    const y = tenth(clamp((Number(object.y) || 0) * scaleY, to.h - h));
    return { ...object, x, y, w, h };
  });
}

/** Objects that ended up entirely outside the page (spec R75: the list flags them). */
export function objectsOffPage(objects, page) {
  if (!Array.isArray(objects) || !isSize(page)) return [];
  return objects.filter((object) => {
    const right = (Number(object.x) || 0) + (Number(object.w) || 0);
    const bottom = (Number(object.y) || 0) + (Number(object.h) || 0);
    return right <= 0 || bottom <= 0 || (Number(object.x) || 0) >= page.w || (Number(object.y) || 0) >= page.h;
  });
}

function isSize(value) {
  return Boolean(value) && Number(value.w) > 0 && Number(value.h) > 0;
}

function clamp(value, max) {
  return Math.min(Math.max(value, 0), Math.max(0, max));
}

function tenth(value) {
  return Math.round(value * 10) / 10;
}
