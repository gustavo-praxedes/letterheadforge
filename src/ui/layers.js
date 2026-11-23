import { layerRows, moveLayer, removeLayer, renameLayer, toggleLayer, duplicateLayer } from "../store/layers.js";
import { strings } from "../strings.pt-BR.js";

/**
 * Layers panel (task 04.01.09). Reads the list from store/layers.js and writes
 * every change through the store, so undo/redo and the preview follow.
 *
 * Rows are built with createElement; nothing here computes geometry.
 */
export function renderLayers(host, { store, getLayout = () => null, onSelect = () => {}, onChanged = () => {} } = {}) {
  if (!host) throw new TypeError("renderLayers requires a host element");
  if (!store) throw new TypeError("renderLayers requires a store");

  const panel = document.createElement("details");
  panel.className = "panel";
  panel.dataset.section = "layers";
  panel.open = true;

  const summary = document.createElement("summary");
  summary.className = "panel__summary";
  const title = document.createElement("span");
  title.textContent = strings.panels.sections.layers;
  const chevron = document.createElement("span");
  chevron.className = "panel__chevron";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(title, chevron);

  const body = document.createElement("div");
  body.className = "panel__body panel__body--fields";
  panel.append(summary, body);
  host.append(panel);

  const act = (mutator, { label = null } = {}) => {
    store.update((draft) => {
      const result = mutator(draft.objects ?? []);
      if (!result.ok) return;
      draft.objects = result.objects;
    }, { tag: null, label });
    render();
    onChanged();
  };

  function actionButton(label, onClick, { disabled = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layers__action";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function rowNode(row, layout) {
    const wrapper = document.createElement("div");
    wrapper.className = "layers__row";
    wrapper.dataset.layer = row.id;
    if (store.getSelection() === row.id) wrapper.dataset.selected = "true";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "layers__name";
    open.textContent = row.name;
    open.addEventListener("click", () => {
      store.select(row.id);
      render();
      onSelect(row.id);
    });

    const type = document.createElement("span");
    type.className = "layers__type";
    type.textContent = strings.layers.types[row.type] ?? row.type;

    const actions = document.createElement("div");
    actions.className = "layers__actions";
    actions.append(
      actionButton(strings.layers.actions.up, () => act((objects) => moveLayer(objects, row.id, "up"), {
        label: strings.layers.actions.up,
      }), { disabled: !row.canMoveUp }),
      actionButton(strings.layers.actions.down, () => act((objects) => moveLayer(objects, row.id, "down"), {
        label: strings.layers.actions.down,
      }), { disabled: !row.canMoveDown }),
      actionButton(row.visible ? strings.layers.actions.hide : strings.layers.actions.show, () =>
        act((objects) => toggleLayer(objects, row.id, "visible"), {
          label: row.visible ? strings.layers.actions.hide : strings.layers.actions.show,
        }),
      ),
      actionButton(row.locked ? strings.layers.actions.unlock : strings.layers.actions.lock, () =>
        act((objects) => toggleLayer(objects, row.id, "locked"), {
          label: row.locked ? strings.layers.actions.unlock : strings.layers.actions.lock,
        }),
      ),
      actionButton(strings.layers.actions.duplicate, () =>
        act((objects) => duplicateLayer(objects, row.id), { label: strings.layers.actions.duplicate }),
      ),
      actionButton(strings.layers.actions.remove, () => {
        act((objects) => removeLayer(objects, row.id), { label: strings.layers.actions.remove });
        if (store.getSelection() === row.id) store.select(null);
      }),
    );

    wrapper.append(open, type, actions);

    if (row.outOfPage) {
      const warning = document.createElement("p");
      warning.className = "field__warning";
      warning.setAttribute("role", "alert");
      warning.textContent = strings.warnings.catalog["object.outOfPage"];
      wrapper.append(warning);
    }

    if (row.locked) wrapper.dataset.locked = "true";
    if (!row.visible) wrapper.dataset.hiddenLayer = "true";
    void layout;
    return wrapper;
  }

  function startRename(node, row) {
    const nameButton = node.querySelector(".layers__name");
    if (!nameButton) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "layers__rename";
    input.value = row.name;
    input.setAttribute("aria-label", strings.layers.promptRename);
    const finish = (commit) => {
      if (commit) act((objects) => renameLayer(objects, row.id, input.value), { label: strings.layers.actions.rename });
      else render();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    nameButton.replaceWith(input);
    input.focus();
    input.select();
  }

  function render() {
    const preset = store.getPreset();
    const layout = getLayout();
    const rows = layerRows(preset, layout);

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "field__help";
      empty.textContent = strings.layers.empty;
      body.replaceChildren(empty);
      return;
    }
    body.replaceChildren(
      ...rows.map((row) => {
        const node = rowNode(row, layout);
        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "layers__action";
        rename.textContent = strings.layers.actions.rename;
        rename.addEventListener("click", () => startRename(node, row));
        node.querySelector(".layers__actions").append(rename);
        return node;
      }),
    );
  }

  const unsubscribe = store.subscribe((event) => {
    if (event.type === "change" || event.type === "selection") render();
  });

  render();

  return { node: panel, refresh: render, unsubscribe };
}
