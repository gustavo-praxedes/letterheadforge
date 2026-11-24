/**
 * Real-browser checks for the editor itself (spec §5.4 e §5.5).
 *
 *   npm run verify:ui            # localhost:8080
 *   BASE_URL=... npm run verify:ui
 *
 * Covers what only a browser can prove: pointer drag, handle resize, objects
 * surviving a page-size change and the font list offered by the panels.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:8080/";
const TOLERANCE_MM = 1.2; // one pointer step + snapping
const report = [];

/** Flat-colour PNG, enough for the importer and for pdf-lib. */
function solidPng(width, height) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let value = 0xffffffff;
    for (const byte of buffer) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const band = Math.floor((y / height) * 3);
      row[1 + x * 3] = band === 0 ? 200 : 30;
      row[2 + x * 3] = band === 1 ? 180 : 30;
      row[3 + x * 3] = band === 2 ? 200 : 30;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(BASE, { waitUntil: "load" });
await page.waitForSelector("main");
await page.waitForFunction(() => document.querySelector('#preview-stage svg[role="img"]'), null, { timeout: 20000 });
await page.waitForTimeout(600);

const preset = () =>
  page.evaluate(async () => {
    const mod = await import("./src/main.js");
    const current = mod.store.getPreset();
    return {
      size: current.page.size,
      orientation: current.page.orientation,
      objects: (current.objects ?? []).map((object) => ({
        id: object.id,
        x: object.x,
        y: object.y,
        w: object.w,
        h: object.h,
      })),
    };
  });

/** Millimetres → viewport pixels, using the sheet's own viewBox. */
async function toPx(xMm, yMm) {
  const box = await page.locator('#preview-stage svg[role="img"]').boundingBox();
  const viewBox = await page.evaluate(() =>
    document.querySelector('#preview-stage svg[role="img"]').getAttribute("viewBox").split(" ").map(Number),
  );
  return {
    x: box.x + ((xMm - viewBox[0]) / viewBox[2]) * box.width,
    y: box.y + ((yMm - viewBox[1]) / viewBox[3]) * box.height,
  };
}

/**
 * Alt disables snapping (the editor snaps to guides and to the half millimetre),
 * so the gesture lands exactly where the test asked — otherwise a guide can pull
 * the box a millimetre or two and the check would be measuring the guide.
 */
async function drag(fromMm, toMm) {
  const from = await toPx(fromMm.x, fromMm.y);
  const to = await toPx(toMm.x, toMm.y);
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.waitForTimeout(400);
}

/* ---------- objeto de texto ---------- */
await page.click('[data-section="objects"] .panel__summary');
await page.waitForTimeout(250);
await page.click("#panel-field-objects-addText");
await page.waitForTimeout(400);
await page.fill('[data-field="objects.text.content"] textarea', "CAIXA DE TESTE");
await page.waitForTimeout(700);

const start = (await preset()).objects[0];

/* ---------- 1. arrastar com o mouse ---------- */
const centre = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
await drag(centre, { x: centre.x - 30, y: centre.y - 40 });
const dragged = (await preset()).objects[0];
const dragDx = Math.abs(dragged.x - (start.x - 30));
const dragDy = Math.abs(dragged.y - (start.y - 40));
report.push({
  prova: "arrastar move o objeto",
  de: { x: start.x, y: start.y },
  para: { x: dragged.x, y: dragged.y },
  desvioMm: { x: Number(dragDx.toFixed(2)), y: Number(dragDy.toFixed(2)) },
  passou: dragDx <= TOLERANCE_MM && dragDy <= TOLERANCE_MM,
});

/* ---------- 2. alças redimensionam ---------- */
const corner = { x: dragged.x + dragged.w, y: dragged.y + dragged.h };
await drag(corner, { x: corner.x + 25, y: corner.y + 15 });
const resized = (await preset()).objects[0];
const grewW = Math.abs(resized.w - (dragged.w + 25));
const grewH = Math.abs(resized.h - (dragged.h + 15));
report.push({
  prova: "alça de canto redimensiona",
  antes: { w: dragged.w, h: dragged.h },
  depois: { w: resized.w, h: resized.h },
  desvioMm: { w: Number(grewW.toFixed(2)), h: Number(grewH.toFixed(2)) },
  passou: grewW <= TOLERANCE_MM && grewH <= TOLERANCE_MM,
});

/* ---------- 3. alças visíveis ---------- */
const handles = await page.evaluate(
  () => document.querySelectorAll(".canvas__overlay .canvas__handle").length,
);
report.push({ prova: "alças de seleção desenhadas", alças: handles, passou: handles === 9 });

/* ---------- 3a. digitar um número entrega o número digitado ---------- */
{
  const id = "#panel-field-objects-text-sizePt";
  const ler = async () => ({
    campo: await page.evaluate((sel) => document.querySelector(sel)?.value ?? null, id),
    modelo: await page.evaluate(async () => {
      const mod = await import("./src/main.js");
      return mod.store.getPreset().objects[0]?.sizePt ?? null;
    }),
  });
  await page.click(id, { clickCount: 3 });
  for (const tecla of ["2", "4"]) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(300);
  const typed = await ler();

  // below the minimum: the draft stays on screen and only blur clamps it
  await page.click(id, { clickCount: 3 });
  await page.keyboard.press("2");
  await page.waitForTimeout(250);
  const draft = await ler();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(350);
  const afterBlur = await ler();

  report.push({
    prova: "campo numérico aceita o número digitado",
    digitou24: typed,
    rascunhoForaDaFaixa: draft,
    depoisDoBlur: afterBlur,
    passou: typed.campo === "24" && typed.modelo === 24 && draft.campo === "2" && afterBlur.campo === "4" && afterBlur.modelo === 4,
  });
}

/* ---------- 3b. imagem: importar, arrastar e redimensionar ---------- */
{
  const png = join("temp", "verify-ui-image.png");
  writeFileSync(png, solidPng(1600, 1000));
  page.once("filechooser", (chooser) => chooser.setFiles(png));
  await page.click("#panel-field-objects-addImage");
  await page.waitForTimeout(2000);

  const imageFields = await page.evaluate(() =>
    [...document.querySelectorAll('[data-field^="objects.image."]')].map((node) => node.dataset.field),
  );

  // the width field must deliver what was typed, and the aspect lock follows it
  const largura = "#panel-field-objects-image-w";
  await page.click(largura, { clickCount: 3 });
  for (const tecla of ["6", "0"]) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(350);
  const typedWidth = await page.evaluate(async () => {
    const mod = await import("./src/main.js");
    const preset = mod.store.getPreset();
    const last = preset.objects[preset.objects.length - 1];
    return { campo: document.querySelector("#panel-field-objects-image-w").value, w: last.w, h: last.h };
  });

  const withImage = await preset();
  const image = withImage.objects.find((object) => object.id !== dragged.id);
  const inPreview = await page.evaluate(
    () => document.querySelectorAll('#preview-stage svg[role="img"] image').length,
  );
  if (image) {
    const imageCentre = { x: image.x + image.w / 2, y: image.y + image.h / 2 };
    await drag(imageCentre, { x: imageCentre.x - 20, y: imageCentre.y - 10 });
    const moved = (await preset()).objects.find((object) => object.id === image.id);
    const dx = Math.abs(moved.x - (image.x - 20));
    const dy = Math.abs(moved.y - (image.y - 10));

    const handle = { x: moved.x + moved.w, y: moved.y + moved.h };
    await drag(handle, { x: handle.x - 15, y: handle.y - 10 });
    const smaller = (await preset()).objects.find((object) => object.id === image.id);
    const dw = Math.abs(smaller.w - (moved.w - 15));
    const dh = Math.abs(smaller.h - (moved.h - 10));

    report.push({
      prova: "imagem: arrastar e redimensionar",
      camposDeGeometria: imageFields,
      larguraDigitada: typedWidth,
      importada: inPreview,
      de: { x: image.x, y: image.y },
      para: { x: moved.x, y: moved.y },
      tamanhoFinal: { w: smaller.w, h: smaller.h },
      desvioMm: { x: Number(dx.toFixed(2)), y: Number(dy.toFixed(2)), w: Number(dw.toFixed(2)), h: Number(dh.toFixed(2)) },
      passou:
        inPreview === 1 &&
        imageFields.includes("objects.image.w") &&
        typedWidth.campo === "60" &&
        typedWidth.w === 60 &&
        dx <= TOLERANCE_MM &&
        dy <= TOLERANCE_MM &&
        dw <= TOLERANCE_MM &&
        dh <= TOLERANCE_MM,
    });
  } else {
    report.push({ prova: "imagem: arrastar e redimensionar", importada: inPreview, passou: false, motivo: "objeto não criado" });
  }
}

/* ---------- 4. A4 → A5 mantém o objeto na página ---------- */
await page.selectOption("#panel-field-page-size", "A5");
await page.waitForTimeout(900);
const a5 = await preset();
const inside = a5.objects.every(
  (object) => object.x >= 0 && object.y >= 0 && object.x + object.w <= 148.5 && object.y + object.h <= 210.5,
);
const pageView = await page.evaluate(() =>
  document.querySelector('#preview-stage svg[role="img"]').getAttribute("viewBox"),
);
await page.click('#preview-mode [data-mode="sheet"]');
await page.waitForTimeout(900);
const sheet = await page.evaluate(() => {
  const svg = document.querySelector('#preview-stage svg[role="img"]');
  return {
    viewBox: svg.getAttribute("viewBox"),
    textos: [...svg.querySelectorAll("text")].map((node) => node.textContent).join("|"),
  };
});
await page.click('#preview-mode [data-mode="page"]');
await page.waitForTimeout(600);
report.push({
  prova: "objeto sobrevive à troca A4 → A5",
  paginaA5: pageView,
  objeto: a5.objects[0],
  dentroDaPagina: inside,
  montagem: sheet,
  passou:
    inside &&
    pageView === "0 0 148 210" &&
    sheet.viewBox === "0 0 297 210" &&
    sheet.textos.split("|").filter((text) => text.includes("CAIXA")).length === 2,
});

/* ---------- 5. fontes na marca d'água ---------- */
const weights = await page.evaluate(async () => {
  const section = document.querySelector('[data-section="watermark"]');
  if (section) section.open = true;
  await new Promise((resolve) => setTimeout(resolve, 400));
  const select = document.querySelector("#panel-field-watermark-fontId");
  return select ? [...select.options].map((option) => option.value) : [];
});
report.push({
  prova: "marca d'água oferece o catálogo de fontes",
  fontes: weights,
  passou: weights.length >= 5 && weights.includes("inter") && weights.includes("lora"),
});

report.push({ prova: "sem erro de script", erros: errors.slice(0, 3), passou: errors.length === 0 });

await page.screenshot({ path: "temp/shots/verify-ui.png" });
await browser.close();

const failed = report.filter((item) => !item.passou);
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  console.error(`\n${failed.length} verificação(ões) falharam: ${failed.map((item) => item.prova).join(", ")}`);
  process.exitCode = 1;
}
