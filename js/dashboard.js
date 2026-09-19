/* ==========================================================
   dashboard.js — Stats, filtering, table rendering & actions.
   Backed by Supabase; requires an authenticated (admin) session.
   ========================================================== */

import { $, $$, el, formatDate, openModal, closeModal, initModals, toast } from "./utils.js";
import { FORM_TYPE_LABELS, FIELD_LABELS, STATUSES } from "./mock-data.js";
import {
  listSubmissions,
  getSubmission,
  deleteSubmission,
  generatePdf,
  getPdfUrl,
  getSignatureUrl,
  getSession,
  onAuthChange,
  signIn,
  signOut,
} from "./api.js";

const FORM_TYPE_PATHS = {
  client_contract: "/pages/client-contract.html",
  counsellor_transfer: "/pages/transfer-form.html",
  power_of_attorney: "/pages/power-of-attorney.html",
};

let submissions = [];
let pendingDeleteId = null;

/* ----------------- Rendering ----------------- */

function renderStats(list) {
  const counts = {
    total: list.length,
    draft: 0, submitted: 0, approved: 0, rejected: 0,
  };
  list.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
  $("[data-stat='total']").textContent = counts.total;
  $("[data-stat='draft']").textContent = counts.draft;
  $("[data-stat='submitted']").textContent = counts.submitted;
  $("[data-stat='approved']").textContent = counts.approved;
  $("[data-stat='rejected']").textContent = counts.rejected;
}

function renderTable(list) {
  const tbody = $("#submissions-tbody");
  const empty = $("#empty-state");
  tbody.innerHTML = "";
  if (list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.forEach((s) => {
    const tr = el("tr", {}, [
      el("td", { class: "ref" }, s.reference),
      el("td", {}, [
        el("div", {}, s.client_name || "—"),
        el("div", { class: "ref" }, s.email || ""),
      ]),
      el("td", {}, FORM_TYPE_LABELS[s.form_type] || s.form_type),
      el("td", {}, [el("span", { class: `badge ${s.status}` }, s.status)]),
      el("td", {}, formatDate(s.created_at)),
      el("td", { class: "actions-cell" }, [
        actionBtn("View", "outline", () => onView(s.id)),
        actionBtn("Edit", "outline", () => onEdit(s)),
        actionBtn("PDF", "outline", () => onDownload(s.id)),
        actionBtn("Delete", "danger", () => onDeleteRequest(s.id)),
      ]),
    ]);
    tbody.appendChild(tr);
  });
}

function actionBtn(label, variant, handler) {
  return el("button", { class: `btn btn-sm btn-${variant}`, type: "button", onclick: handler }, label);
}

/* ----------------- Filtering ----------------- */

function applyFilters() {
  const q = $("#filter-search").value.trim().toLowerCase();
  const status = $("#filter-status").value;
  const type = $("#filter-type").value;
  const date = $("#filter-date").value; // YYYY-MM-DD

  const filtered = submissions.filter((s) => {
    if (status && s.status !== status) return false;
    if (type && FORM_TYPE_LABELS[s.form_type] !== type) return false;
    if (date) {
      const created = new Date(s.created_at).toISOString().slice(0, 10);
      if (created !== date) return false;
    }
    if (q) {
      const hay = [s.client_name, s.email, s.phone, s.reference, s.id_number]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderStats(filtered);
  renderTable(filtered);
}

async function loadSubmissions() {
  try {
    submissions = await listSubmissions();
    applyFilters();
  } catch (err) {
    console.error(err);
    toast("Couldn't load submissions from the database.", "error");
  }
}

/* ----------------- Action handlers ----------------- */

async function onView(id) {
  let s;
  try {
    s = await getSubmission(id);
  } catch (err) {
    console.error(err);
    toast("Couldn't load that submission.", "error");
    return;
  }
  if (!s) return;

  const body = $("#view-body");
  body.innerHTML = "";
  const dl = el("dl", { class: "detail-grid" });
  const labels = FIELD_LABELS[s.form_type] || {};

  const topRows = [
    ["Reference", s.reference],
    ["Form Type", FORM_TYPE_LABELS[s.form_type] || s.form_type],
    ["Status", s.status],
    ["Created", formatDate(s.created_at)],
  ];
  const fieldRows = Object.entries(s.fields || {}).map(([key, value]) => [
    labels[key] || key,
    Array.isArray(value) ? (value.join(", ") || "—") : String(value ?? "—"),
  ]);

  [...topRows, ...fieldRows].forEach(([k, v]) => {
    dl.appendChild(el("div", { class: "detail" }, [
      el("dt", {}, k),
      el("dd", {}, v),
    ]));
  });
  body.appendChild(dl);

  // Signature thumbnails, if any.
  const sigNames = Object.keys(s.signatures || {});
  if (sigNames.length) {
    const sigWrap = el("div", { class: "detail-grid" });
    for (const name of sigNames) {
      try {
        const url = await getSignatureUrl(s.signatures[name]);
        if (!url) continue;
        sigWrap.appendChild(el("div", { class: "detail" }, [
          el("dt", {}, name),
          el("dd", {}, [el("img", { src: url, style: "max-width:200px;border:1px solid var(--color-border-strong);border-radius:4px;" })]),
        ]));
      } catch (err) {
        console.error(`Couldn't load signature "${name}":`, err);
      }
    }
    body.appendChild(sigWrap);
  }

  openModal("modal-view");
}

function onEdit(s) {
  const path = FORM_TYPE_PATHS[s.form_type];
  if (!path) {
    toast("Unknown form type — can't open editor.", "error");
    return;
  }
  location.href = `${path}?id=${encodeURIComponent(s.id)}`;
}

async function onDownload(id) {
  try {
    toast("Preparing PDF…");
    let s = await getSubmission(id);
    if (!s) return;

    if (!s.pdf_path) {
      const result = await generatePdf(id);
      s = result.submission || (await getSubmission(id));
    }
    if (!s.pdf_path) {
      toast("PDF generation didn't return a file — try again.", "error");
      return;
    }

    const url = await getPdfUrl(s.pdf_path);
    $("#pdf-preview-frame").src = url;
    $("#pdf-download-link").href = url;
    $("#pdf-download-link").download = `${s.reference}.pdf`;
    openModal("modal-preview");
  } catch (err) {
    console.error(err);
    toast("Couldn't generate or fetch the PDF.", "error");
  }
}

function onDeleteRequest(id) {
  pendingDeleteId = id;
  const s = submissions.find((row) => row.id === id);
  $("#delete-target").textContent = s ? `${s.reference} — ${s.client_name}` : id;
  openModal("modal-delete");
}

async function onDeleteConfirm() {
  if (!pendingDeleteId) return;
  try {
    await deleteSubmission(pendingDeleteId);
    toast("Submission deleted.", "success");
  } catch (err) {
    console.error(err);
    toast("Couldn't delete that submission.", "error");
  }
  pendingDeleteId = null;
  closeModal("modal-delete");
  await loadSubmissions();
}

/* ----------------- Auth gate ----------------- */

function showDashboard() {
  $("#auth-gate").style.display = "none";
  $("#dashboard-content").style.display = "";
  const signoutBtn = $("#signout-btn");
  if (signoutBtn) signoutBtn.style.display = "";
}

function showAuthGate() {
  $("#auth-gate").style.display = "";
  $("#dashboard-content").style.display = "none";
  const signoutBtn = $("#signout-btn");
  if (signoutBtn) signoutBtn.style.display = "none";
}

function wireAuthGate() {
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const errEl = $("#login-error");
    errEl.textContent = "";
    try {
      await signIn(email, password);
      // onAuthChange listener below picks up the new session and loads data.
    } catch (err) {
      errEl.textContent = "Invalid email or password.";
    }
  });

  $("#signout-btn")?.addEventListener("click", async () => {
    await signOut();
  });
}

/* ----------------- Init ----------------- */

export async function initDashboard() {
  initModals();
  wireAuthGate();

  ["filter-search", "filter-status", "filter-type", "filter-date"].forEach((id) => {
    $("#" + id).addEventListener("input", applyFilters);
  });

  $("#filter-reset").addEventListener("click", () => {
    $("#filter-search").value = "";
    $("#filter-status").value = "";
    $("#filter-type").value = "";
    $("#filter-date").value = "";
    applyFilters();
  });

  $("#delete-confirm").addEventListener("click", onDeleteConfirm);

  // Populate status filter options
  const statusSel = $("#filter-status");
  STATUSES.forEach((s) => {
    const opt = el("option", { value: s }, s.charAt(0).toUpperCase() + s.slice(1));
    statusSel.appendChild(opt);
  });

  onAuthChange((session) => {
    if (session) {
      showDashboard();
      loadSubmissions();
    } else {
      showAuthGate();
    }
  });

  const session = await getSession();
  if (session) {
    showDashboard();
    await loadSubmissions();
  } else {
    showAuthGate();
  }
}
