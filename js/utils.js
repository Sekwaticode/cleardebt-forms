/* ==========================================================
   utils.js — DOM helpers, modals, toasts, formatters.
   ========================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

/** Generate a client-side reference id — replaced by backend once persisted. */
export function generateReference(prefix = "CD") {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/** Format an ISO date for display. */
export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "2-digit" });
}

/* ---------- Modals ---------- */

export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("open");
  document.body.style.overflow = "";
}

/** Attach standard modal close behaviours (backdrop click + [data-close]) */
export function initModals() {
  $$(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("open");
    });
    $$("[data-close]", backdrop).forEach((btn) =>
      btn.addEventListener("click", () => backdrop.classList.remove("open"))
    );
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
      document.body.style.overflow = "";
    }
  });
}

/* ---------- Toasts ---------- */

function ensureToastWrap() {
  let wrap = $(".toast-wrap");
  if (!wrap) {
    wrap = el("div", { class: "toast-wrap" });
    document.body.appendChild(wrap);
  }
  return wrap;
}

export function toast(message, variant = "success", ms = 2600) {
  const wrap = ensureToastWrap();
  const node = el("div", { class: `toast ${variant}` }, message);
  wrap.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .2s";
    setTimeout(() => node.remove(), 200);
  }, ms);
}
