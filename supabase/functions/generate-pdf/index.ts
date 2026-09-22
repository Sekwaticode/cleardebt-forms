// ==========================================================
// supabase/functions/generate-pdf/index.ts
//
// Deploy with:  supabase functions deploy generate-pdf
// Invoked from the browser via: supabase.functions.invoke("generate-pdf", { body: { submissionId } })
// ==========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Human-readable field labels, mirrored from js/mock-data.js so the PDF
// reads as prose instead of raw camelCase keys.
const FIELD_LABELS: Record<string, Record<string, string>> = {
  client_contract: {
    fullName: "Full Name", idNumber: "ID Number", phone: "Phone",
    address: "Residential Address", email: "Email", services: "Services Selected",
    serviceFee: "Service Fee (R)", paymentDue: "Payment Due", paymentMethod: "Payment Method",
    paymentMethodOther: "Other Payment Details", acceptTerms: "Accepted Terms",
    signedAt: "Signed At (Place)", signedDate: "Date Signed", clearDebtRep: "Clear Debt Representative",
  },
  power_of_attorney: {
    principalFullName: "Principal Full Name", principalIdNumber: "Principal ID Number",
    principalPhone: "Principal Contact Number", principalAddress: "Principal Residential Address",
    agentFullName: "Agent Full Name", agentIdNumber: "Agent ID Number", agentCompany: "Agent Company / Firm",
    additionalPowers: "Additional Powers / Scope", ratifyActs: "Ratifies Agent's Acts",
    signedAtPlace: "Signed At (Place)", signedDate: "Date of Signing",
    witness1Name: "Witness 1 Full Name", witness2Name: "Witness 2 Full Name",
  },
  counsellor_transfer: {
    consumerFullName: "Consumer Full Name", consumerIdNumber: "Consumer ID Number",
    consumerPhone: "Consumer Contact Number", consumerEmail: "Consumer Email",
    consumerAddress: "Consumer Residential Address", currentCounsellorName: "Current Debt Counsellor",
    currentCounsellorNcr: "Current Counsellor NCR Number", currentCounsellorCompany: "Current Counsellor Company",
    currentCounsellorPhone: "Current Counsellor Phone", currentCounsellorEmail: "Current Counsellor Email",
    newCounsellorName: "New Debt Counsellor", newCounsellorNcr: "New Counsellor NCR Number",
    newCounsellorCompany: "New Counsellor Company", newCounsellorPhone: "New Counsellor Phone",
    newCounsellorEmail: "New Counsellor Email", confirmTransfer: "Confirmed & Authorized Transfer",
    consumerSignDate: "Consumer Signature Date", counsellorSignDate: "New Counsellor Signature Date",
  },
};

const FORM_TITLES: Record<string, string> = {
  client_contract: "Debt Assistance Agreement",
  power_of_attorney: "Power of Attorney",
  counsellor_transfer: "Debt Counsellor Transfer Form",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { submissionId } = await req.json();
    if (!submissionId) {
      return json({ error: "submissionId is required" }, 400);
    }

    // Service-role client — bypasses RLS, only ever runs server-side.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .single();
    if (fetchError || !submission) {
      return json({ error: fetchError?.message || "Submission not found" }, 404);
    }

    const pdfBytes = await renderPdf(supabase, submission);

    const pdfPath = `${submission.reference}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) return json({ error: uploadError.message }, 500);

    const { data: updated, error: updateError } = await supabase
      .from("submissions")
      .update({ pdf_path: pdfPath })
      .eq("id", submissionId)
      .select()
      .single();
    if (updateError) return json({ error: updateError.message }, 500);

    return json({ pdfPath, submission: updated });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function renderPdf(supabase: ReturnType<typeof createClient>, submission: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };
  const drawText = (text: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 11;
    const f = opts.f ?? font;
    const color = opts.color ?? rgb(0.06, 0.09, 0.16);
    const maxWidth = pageWidth - margin * 2;
    const words = String(text).split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(trial, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      ensureSpace(size + 4);
      page.drawText(l, { x: margin, y, size, font: f, color });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  // ---- Header ----
  drawText("Clear Debt (Pty) Ltd", { size: 16, f: bold });
  drawText("NCRDC4086", { size: 9, color: rgb(0.4, 0.45, 0.5), gap: 10 });
  drawText(FORM_TITLES[submission.form_type] || submission.form_type, { size: 14, f: bold, gap: 4 });
  drawText(`Reference: ${submission.reference}`, { size: 10, color: rgb(0.4, 0.45, 0.5) });
  drawText(`Status: ${submission.status}   ·   Generated: ${new Date().toLocaleString("en-ZA")}`, {
    size: 10, color: rgb(0.4, 0.45, 0.5), gap: 14,
  });

  // ---- Divider ----
  ensureSpace(20);
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
  y -= 20;

  // ---- Fields ----
  const labels = FIELD_LABELS[submission.form_type] || {};
  const fields = submission.fields || {};
  for (const [key, value] of Object.entries(fields)) {
    const label = labels[key] || key;
    const display = Array.isArray(value) ? (value.length ? value.join(", ") : "—") : String(value ?? "—");
    ensureSpace(28);
    drawText(label, { size: 9, f: bold, color: rgb(0.4, 0.45, 0.5), gap: 1 });
    drawText(display, { size: 11, gap: 8 });
  }

  // ---- Signatures ----
  const signatures = submission.signatures || {};
  const sigEntries = Object.entries(signatures).filter(([, path]) => path);
  if (sigEntries.length) {
    ensureSpace(30);
    drawText("Signatures", { size: 13, f: bold, gap: 8 });

    for (const [name, path] of sigEntries) {
      try {
        const { data, error } = await supabase.storage.from("signatures").download(path as string);
        if (error || !data) continue;
        const bytes = new Uint8Array(await data.arrayBuffer());
        const img = await doc.embedPng(bytes);
        const displayWidth = 200;
        const displayHeight = (img.height / img.width) * displayWidth;

        ensureSpace(displayHeight + 24);
        drawText(name, { size: 9, f: bold, color: rgb(0.4, 0.45, 0.5), gap: 4 });
        page.drawImage(img, { x: margin, y: y - displayHeight, width: displayWidth, height: displayHeight });
        y -= displayHeight + 16;
      } catch (err) {
        console.error(`Failed to embed signature "${name}":`, err);
      }
    }
  }

  return doc.save();
}
