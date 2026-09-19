/* ==========================================================
   forms.js — Shared form controller for all three forms.
   Persists to Supabase: field data + signatures + PDF generation.
   ========================================================== */

import { $, $$, generateReference, toast, openModal, closeModal, initModals } from "./utils.js";
import { validateForm, attachLiveValidation } from "./validation.js";
import { mountSignatures } from "./signature.js";
import {
  createSubmission,
  updateSubmission,
  getSubmission,
  uploadSignatures,
  getSignatureUrl,
  generatePdf,
} from "./api.js";

/**
 * Collect all named fields from the form as a plain object.
 * Groups checkboxes with the same name into arrays.
 */
function collectFields(form) {
  const data = {};
  const grouped = {};

  $$("input, select, textarea", form).forEach((el) => {
    const name = el.name;
    if (!name) return;

    if (el.type === "checkbox") {
      grouped[name] = grouped[name] || [];
      if (el.checked) grouped[name].push(el.value || true);
    } else if (el.type === "radio") {
      if (el.checked) data[name] = el.value;
    } else {
      data[name] = el.value;
    }
  });

  Object.assign(data, grouped);
  return data;
}

/** Fill form inputs from a previously-saved `fields` object (edit mode). */
function prefillForm(form, fields = {}) {
  Object.entries(fields).forEach(([name, value]) => {
    const nodes = $$(`[name="${CSS.escape(name)}"]`, form);
    if (!nodes.length) return;

    if (Array.isArray(value)) {
      // checkbox group
      nodes.forEach((n) => { n.checked = value.includes(n.value); });
    } else if (nodes[0].type === "radio") {
      nodes.forEach((n) => { n.checked = n.value === value; });
    } else if (nodes[0].type === "checkbox") {
      nodes[0].checked = Boolean(value);
    } else {
      nodes[0].value = value ?? "";
    }
  });
}

/** Load previously-saved signature images (as signed URLs) onto their pads. */
async function prefillSignatures(pads, signaturePaths = {}) {
  await Promise.all(
    Object.entries(signaturePaths).map(async ([name, path]) => {
      const pad = pads[name];
      if (!pad || !path) return;
      try {
        const url = await getSignatureUrl(path);
        if (url) await pad.loadSignature(url);
      } catch (err) {
        console.error(`[prefillSignatures] failed to load "${name}":`, err);
      }
    })
  );
}

/**
 * Bootstraps a form page. Called by each individual form HTML file.
 * If the URL contains `?id=<submissionId>`, the form loads and edits
 * that existing submission instead of starting a new one.
 */
export async function bootstrapForm({ formType }) {
  const form = $("#form");
  if (!form) return;

  attachLiveValidation(form);
  const pads = mountSignatures(form);
  initModals();

  // ---- Edit-mode state ----
  const params = new URLSearchParams(location.search);
  const editId = params.get("id");
  let submissionId = null;
  let reference = null;
  let existingSignatures = {};

  if (editId) {
    try {
      const existing = await getSubmission(editId);
      if (existing) {
        submissionId = existing.id;
        reference = existing.reference;
        existingSignatures = existing.signatures || {};
        prefillForm(form, existing.fields || {});
        await prefillSignatures(pads, existingSignatures);
        updateStatusBar(existing);
        toast("Loaded existing draft for editing.");
      } else {
        toast("Couldn't find that submission — starting a new form.", "error");
      }
    } catch (err) {
      console.error(err);
      toast("Failed to load existing submission.", "error");
    }
  }

  async function persist(status) {
    const fields = collectFields(form);
    reference = reference || generateReference(formType.prefix);
    const signatures = await uploadSignatures(pads, reference, existingSignatures);
    existingSignatures = signatures;

    const payload = {
      reference,
      form_type: formType.id,
      status,
      client_name: fields.fullName || fields.principalFullName || fields.consumerFullName || "",
      id_number: fields.idNumber || fields.principalIdNumber || fields.consumerIdNumber || "",
      phone: fields.phone || fields.principalPhone || fields.consumerPhone || "",
      email: fields.email || fields.consumerEmail || "",
      fields,
      signatures,
    };

    const row = submissionId
      ? await updateSubmission(submissionId, payload)
      : await createSubmission(payload);
    submissionId = row.id;
    reference = row.reference;
    return row;
  }

  // Save Draft
  $("[data-action='save-draft']")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const row = await persist("draft");
      toast("Draft saved.", "success");
      updateStatusBar(row);
    } catch (err) {
      console.error(err);
      toast("Couldn't save draft — check your connection.", "error");
    }
  });

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { ok, firstInvalid } = validateForm(form);

    // Signature required check
    let sigOk = true;
    Object.entries(pads).forEach(([name, pad]) => {
      const block = form.querySelector(`.signature-block[data-name='${name}']`);
      if (block?.dataset.required === "true" && pad.isEmpty()) {
        block.style.outline = `2px solid var(--color-danger)`;
        sigOk = false;
      } else if (block) {
        block.style.outline = "";
      }
    });

    if (!ok || !sigOk) {
      toast("Please fix the highlighted fields.", "error");
      firstInvalid?.focus();
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn?.setAttribute("disabled", "true");

    try {
      const row = await persist("submitted");
      updateStatusBar(row);
      openSuccessModal(row);

      // Server-side PDF generation — don't block the success modal on it.
      generatePdf(row.id).catch((err) => {
        console.error("[generatePdf] failed:", err);
        toast("Submitted, but PDF generation failed — it can be retried from the dashboard.", "error");
      });
    } catch (err) {
      console.error(err);
      toast("Couldn't submit — check your connection and try again.", "error");
    } finally {
      submitBtn?.removeAttribute("disabled");
    }
  });

  // Reset
  $("[data-action='reset']")?.addEventListener("click", () => {
    if (!confirm("Clear all fields and signatures?")) return;
    form.reset();
    Object.values(pads).forEach((p) => p.clearSignature());
    $$(".field.has-error", form).forEach((f) => f.classList.remove("has-error"));
    toast("Form cleared.");
  });
}

function updateStatusBar(row) {
  const bar = $(".form-status");
  if (!bar) return;
  const savedAt = row.updated_at || row.created_at;
  bar.textContent = `Reference: ${row.reference} · Status: ${row.status} · Last saved ${new Date(savedAt).toLocaleTimeString()}`;
}

function openSuccessModal(row) {
  const modal = document.getElementById("modal-success");
  if (!modal) return;
  const refEl = modal.querySelector("[data-slot='reference']");
  if (refEl) refEl.textContent = row.reference;
  openModal("modal-success");
}

// Re-export modal helpers for convenience
export { openModal, closeModal };
