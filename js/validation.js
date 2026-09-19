/* ==========================================================
   validation.js — Reusable form validation helpers.
   ========================================================== */

import { $, $$ } from "./utils.js";

const VALIDATORS = {
  required: (v) => (v && String(v).trim().length > 0) || "This field is required.",
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address.",
  tel: (v) => !v || /^[+0-9()\-\s]{7,20}$/.test(v) || "Enter a valid phone number.",
  saId: (v) => !v || /^\d{13}$/.test(v) || "SA ID number must be 13 digits.",
};

/**
 * Validate a single field element.
 * The field wrapper (`.field`) receives .has-error and its .error-msg shows.
 */
export function validateField(input) {
  const wrapper = input.closest(".field");
  if (!wrapper) return true;
  const rules = (input.dataset.rules || "").split(",").map((s) => s.trim()).filter(Boolean);
  const value = input.type === "checkbox" ? input.checked : input.value;

  let errorMsg = "";
  for (const rule of rules) {
    const fn = VALIDATORS[rule];
    if (!fn) continue;
    const res = fn(value);
    if (res !== true) { errorMsg = res; break; }
  }

  const errEl = wrapper.querySelector(".error-msg");
  if (errorMsg) {
    wrapper.classList.add("has-error");
    if (errEl) errEl.textContent = errorMsg;
    return false;
  }
  wrapper.classList.remove("has-error");
  return true;
}

/** Validate an entire form. Returns { ok, firstInvalid }. */
export function validateForm(form) {
  const inputs = $$("[data-rules]", form);
  let ok = true;
  let firstInvalid = null;
  inputs.forEach((input) => {
    const valid = validateField(input);
    if (!valid && !firstInvalid) firstInvalid = input;
    if (!valid) ok = false;
  });
  return { ok, firstInvalid };
}

/** Wire live validation on blur + input for each rule-bearing field. */
export function attachLiveValidation(form) {
  $$("[data-rules]", form).forEach((input) => {
    input.addEventListener("blur", () => validateField(input));
    input.addEventListener("input", () => {
      const wrapper = input.closest(".field");
      if (wrapper?.classList.contains("has-error")) validateField(input);
    });
  });
}
