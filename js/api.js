/* ==========================================================
   api.js — Single point of contact with Supabase.
   Every "TODO(backend)" in the old codebase is implemented here.

   SETUP: fill in SUPABASE_URL and SUPABASE_ANON_KEY below.
   See /SETUP.md for full instructions.
   ========================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from "./config.js";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


/* ----------------------------------------------------------
   Auth (dashboard access only — form submission stays public)
   ---------------------------------------------------------- */

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ----------------------------------------------------------
   Submissions CRUD
   ---------------------------------------------------------- */

/** GET all submissions (dashboard listing). */
export async function listSubmissions() {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** GET /api/forms/:id */
export async function getSubmission(id) {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** POST /api/forms — create a new submission row. */
export async function createSubmission(payload) {
  const { data, error } = await supabase
    .from("submissions")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** PATCH /api/forms/:id */
export async function updateSubmission(id, patch) {
  const { data, error } = await supabase
    .from("submissions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** DELETE /api/forms/:id — also removes associated storage files. */
export async function deleteSubmission(id) {
  const existing = await getSubmission(id);
  if (existing) {
    const sigPaths = Object.values(existing.signatures || {}).filter(Boolean);
    if (sigPaths.length) {
      await supabase.storage.from("signatures").remove(sigPaths);
    }
    if (existing.pdf_path) {
      await supabase.storage.from("pdfs").remove([existing.pdf_path]);
    }
  }
  const { error } = await supabase.from("submissions").delete().eq("id", id);
  if (error) throw error;
}

/* ----------------------------------------------------------
   Signatures — stored as PNGs in the `signatures` bucket.
   The DB only stores the storage path, never raw base64.
   ---------------------------------------------------------- */

/**
 * Uploads every non-empty signature pad for a submission.
 * Returns a map of { padName: storagePath }. Pads left untouched
 * during an edit keep their previous path (pass `existingSignatures`).
 */
export async function uploadSignatures(pads, reference, existingSignatures = {}) {
  const out = { ...existingSignatures };
  for (const [name, pad] of Object.entries(pads)) {
    if (pad.isEmpty()) continue;
    const blob = await pad.getSignatureBlob();
    if (!blob) continue;
    const path = `${reference}/${name}.png`;
    const { error } = await supabase.storage
      .from("signatures")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (error) throw error;
    out[name] = path;
  }
  return out;
}

/** Signed URL for viewing/loading a stored signature (bucket is private). */
export async function getSignatureUrl(path, expiresIn = 300) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("signatures")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/* ----------------------------------------------------------
   PDF generation — delegates to the `generate-pdf` Edge Function,
   which renders the PDF server-side from the stored submission data.
   ---------------------------------------------------------- */

/** Triggers server-side PDF generation. Returns the updated submission row. */
export async function generatePdf(submissionId) {
  const { data, error } = await supabase.functions.invoke("generate-pdf", {
    body: { submissionId },
  });
  if (error) throw error;
  return data; // { pdfPath, submission }
}

/** Signed URL for downloading a submission's generated PDF. */
export async function getPdfUrl(pdfPath, expiresIn = 300) {
  if (!pdfPath) return null;
  const { data, error } = await supabase.storage
    .from("pdfs")
    .createSignedUrl(pdfPath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
