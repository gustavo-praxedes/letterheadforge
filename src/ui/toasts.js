import { strings } from "../strings.pt-BR.js";

/**
 * Transient messages (spec 10.4): one live region, newest first, auto-dismiss.
 * Tones mirror the warning catalogue: info, success, warning, error.
 */

const DEFAULT_TIMEOUT_MS = 5000;

export function createToasts(host, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!host) throw new TypeError("createToasts requires a host element");

  const region = document.createElement("div");
  region.className = "toasts";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  host.append(region);

  const timers = new Map();

  function dismiss(node) {
    const timer = timers.get(node);
    if (timer) clearTimeout(timer);
    timers.delete(node);
    node.remove();
  }

  function show(message, { tone = "info", timeout = timeoutMs } = {}) {
    if (!message) return null;
    const node = document.createElement("p");
    node.className = `toast toast--${tone}`;
    // warnings and errors are alerts, not polite status (spec 10.3)
    if (tone === "error" || tone === "warning") node.setAttribute("role", "alert");
    node.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast__close";
    close.textContent = strings.toasts.dismiss;
    close.addEventListener("click", () => dismiss(node));
    node.append(" ", close);

    region.append(node);
    if (timeout > 0) {
      timers.set(node, setTimeout(() => dismiss(node), timeout));
    }
    return node;
  }

  return {
    node: region,
    show,
    info: (message) => show(message, { tone: "info" }),
    success: (message) => show(message, { tone: "success" }),
    warning: (message) => show(message, { tone: "warning" }),
    error: (message) => show(message, { tone: "error" }),
    clear: () => {
      for (const node of [...region.children]) dismiss(node);
    },
    destroy: () => {
      for (const node of [...region.children]) dismiss(node);
      region.remove();
    },
  };
}
