/* ==========================================================
   app.js — Landing/global bootstrapping.
   ========================================================== */

import { $ } from "./utils.js";

const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
