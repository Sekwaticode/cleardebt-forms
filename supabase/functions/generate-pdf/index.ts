// ==========================================================
// supabase/functions/generate-pdf/index.ts
//
// Deploy with:
//   supabase functions deploy generate-pdf
//
// Invoked from the browser via:
//   supabase.functions.invoke("generate-pdf", { body: { submissionId } })
// ==========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ==========================================================
// FIELD LABELS
// ==========================================================

const FIELD_LABELS: Record<string, Record<string, string>> = {
  client_contract: {
    fullName: "Full Name",
    idNumber: "ID Number",
    phone: "Phone",
    address: "Residential Address",
    email: "Email",
    services: "Services Selected",
    serviceFee: "Service Fee (R)",
    paymentDue: "Payment Due",
    paymentMethod: "Payment Method",
    paymentMethodOther: "Other Payment Details",
    acceptTerms: "Accepted Terms",
    signedAt: "Signed At (Place)",
    signedDate: "Date Signed",
    clearDebtRep: "Clear Debt Representative",
  },

  power_of_attorney: {
    principalFullName: "Principal Full Name",
    principalIdNumber: "Principal ID Number",
    principalPhone: "Principal Contact Number",
    principalAddress: "Principal Residential Address",
    agentFullName: "Agent Full Name",
    agentIdNumber: "Agent ID Number",
    agentCompany: "Agent Company / Firm",
    additionalPowers: "Additional Powers / Scope",
    ratifyActs: "Ratifies Agent's Acts",
    signedAtPlace: "Signed At (Place)",
    signedDate: "Date of Signing",
    witness1Name: "Witness 1 Full Name",
    witness2Name: "Witness 2 Full Name",
  },

  counsellor_transfer: {
    consumerFullName: "Consumer Full Name",
    consumerIdNumber: "Consumer ID Number",
    consumerPhone: "Consumer Contact Number",
    consumerEmail: "Consumer Email",
    consumerAddress: "Consumer Residential Address",

    currentCounsellorName: "Current Debt Counsellor",
    currentCounsellorNcr: "Current Counsellor NCR Number",
    currentCounsellorCompany: "Current Counsellor Company",
    currentCounsellorPhone: "Current Counsellor Phone",
    currentCounsellorEmail: "Current Counsellor Email",

    newCounsellorName: "New Debt Counsellor",
    newCounsellorNcr: "New Counsellor NCR Number",
    newCounsellorCompany: "New Counsellor Company",
    newCounsellorPhone: "New Counsellor Phone",
    newCounsellorEmail: "New Counsellor Email",

    confirmTransfer: "Confirmed & Authorized Transfer",
    consumerSignDate: "Consumer Signature Date",
    counsellorSignDate: "New Counsellor Signature Date",
  },
};

// ==========================================================
// FORM TITLES
// ==========================================================

const FORM_TITLES: Record<string, string> = {
  client_contract: "Debt Assistance Agreement",
  power_of_attorney: "Power of Attorney",
  counsellor_transfer: "Debt Counsellor Transfer Form",
};

// ==========================================================
// COLOUR PALETTE
// ==========================================================

const COLORS = {
  text: rgb(0.06, 0.09, 0.16),
  muted: rgb(0.40, 0.45, 0.50),
  lightMuted: rgb(0.55, 0.58, 0.62),
  line: rgb(0.85, 0.87, 0.90),
  lightBackground: rgb(0.97, 0.98, 0.99),
};

// ==========================================================
// MAIN FUNCTION
// ==========================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { submissionId } = await req.json();

    if (!submissionId) {
      return json({ error: "submissionId is required" }, 400);
    }

    // ------------------------------------------------------
    // Service-role client
    // ------------------------------------------------------

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ------------------------------------------------------
    // Fetch submission
    // ------------------------------------------------------

    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (fetchError || !submission) {
      return json(
        {
          error: fetchError?.message || "Submission not found",
        },
        404,
      );
    }

    // ------------------------------------------------------
    // Generate PDF
    // ------------------------------------------------------

    const pdfBytes = await renderPdf(supabase, submission);

    // ------------------------------------------------------
    // Upload PDF
    // ------------------------------------------------------

    const pdfPath = `${submission.reference}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return json({ error: uploadError.message }, 500);
    }

    // ------------------------------------------------------
    // Save PDF path
    // ------------------------------------------------------

    const { data: updated, error: updateError } = await supabase
      .from("submissions")
      .update({
        pdf_path: pdfPath,
      })
      .eq("id", submissionId)
      .select()
      .single();

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    return json({
      pdfPath,
      submission: updated,
    });
  } catch (err) {
    console.error(err);

    return json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unknown error",
      },
      500,
    );
  }
});

// ==========================================================
// JSON RESPONSE
// ==========================================================

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// ==========================================================
// PDF RENDERER
// ==========================================================

async function renderPdf(
  supabase: ReturnType<typeof createClient>,
  submission: any,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // --------------------------------------------------------
  // A4
  // --------------------------------------------------------

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;

  const MARGIN = 42;

  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  // Gap between the two columns
  const COLUMN_GAP = 20;

  // Width of each column
  const COLUMN_WIDTH =
    (CONTENT_WIDTH - COLUMN_GAP) / 2;

  // --------------------------------------------------------
  // Page state
  // --------------------------------------------------------

  let page = doc.addPage([
    PAGE_WIDTH,
    PAGE_HEIGHT,
  ]);

  let y = PAGE_HEIGHT - MARGIN;

  // --------------------------------------------------------
  // Page helpers
  // --------------------------------------------------------

  const newPage = () => {
    page = doc.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) {
      newPage();
    }
  };

  // --------------------------------------------------------
  // Text wrapping helper
  // --------------------------------------------------------

  const wrapText = (
    text: string,
    f: any,
    size: number,
    maxWidth: number,
  ): string[] => {
    const cleanText = String(text ?? "—").trim();

    if (!cleanText) {
      return ["—"];
    }

    const words = cleanText.split(/\s+/);

    const lines: string[] = [];

    let line = "";

    for (const word of words) {
      const trial = line
        ? `${line} ${word}`
        : word;

      if (
        f.widthOfTextAtSize(trial, size) <=
        maxWidth
      ) {
        line = trial;
      } else {
        if (line) {
          lines.push(line);
        }

        // Deal with a single word that is wider than
        // the available area.
        if (
          f.widthOfTextAtSize(word, size) >
          maxWidth
        ) {
          let current = "";

          for (const char of word) {
            const trialChar = current + char;

            if (
              f.widthOfTextAtSize(
                trialChar,
                size,
              ) <= maxWidth
            ) {
              current = trialChar;
            } else {
              if (current) {
                lines.push(current);
              }

              current = char;
            }
          }

          line = current;
        } else {
          line = word;
        }
      }
    }

    if (line) {
      lines.push(line);
    }

    return lines.length ? lines : ["—"];
  };

  // --------------------------------------------------------
  // Draw wrapped text
  // --------------------------------------------------------

  const drawWrappedText = (
    text: string,
    x: number,
    startY: number,
    width: number,
    options: {
      size?: number;
      f?: any;
      color?: any;
      lineGap?: number;
    } = {},
  ): number => {
    const size = options.size ?? 10;
    const f = options.f ?? font;
    const color = options.color ?? COLORS.text;
    const lineGap = options.lineGap ?? 3;

    const lines = wrapText(
      text,
      f,
      size,
      width,
    );

    let currentY = startY;

    for (const line of lines) {
      page.drawText(line, {
        x,
        y: currentY,
        size,
        font: f,
        color,
      });

      currentY -= size + lineGap;
    }

    return currentY;
  };

  // --------------------------------------------------------
  // Calculate text height
  // --------------------------------------------------------

  const getTextHeight = (
    text: string,
    width: number,
    size = 10,
    f = font,
    lineGap = 3,
  ) => {
    const lines = wrapText(
      text,
      f,
      size,
      width,
    );

    return (
      lines.length * (size + lineGap)
    );
  };

  // ========================================================
  // HEADER
  // ========================================================

  page.drawText("Clear Debt (Pty) Ltd", {
    x: MARGIN,
    y,
    size: 17,
    font: bold,
    color: COLORS.text,
  });

  y -= 19;

  page.drawText(
    "Registration 2025/687143/07",
    {
      x: MARGIN,
      y,
      size: 8.5,
      font,
      color: COLORS.muted,
    },
  );

  y -= 17;

  page.drawText(
    FORM_TITLES[submission.form_type] ||
      submission.form_type,
    {
      x: MARGIN,
      y,
      size: 14,
      font: bold,
      color: COLORS.text,
    },
  );

  y -= 17;

  page.drawText(
    `Reference: ${submission.reference}`,
    {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: COLORS.muted,
    },
  );

  // Status on the right
  const statusText =
    `Status: ${submission.status}`;

  const statusWidth =
    font.widthOfTextAtSize(
      statusText,
      9,
    );

  page.drawText(statusText, {
    x:
      PAGE_WIDTH -
      MARGIN -
      statusWidth,
    y,
    size: 9,
    font,
    color: COLORS.muted,
  });

  y -= 16;

  const generatedText =
    `Generated: ${new Date().toLocaleString(
      "en-ZA",
    )}`;

  page.drawText(generatedText, {
    x:
      PAGE_WIDTH -
      MARGIN -
      font.widthOfTextAtSize(
        generatedText,
        8,
      ),
    y,
    size: 8,
    font,
    color: COLORS.lightMuted,
  });

  y -= 12;

  // Divider
  page.drawLine({
    start: {
      x: MARGIN,
      y,
    },
    end: {
      x: PAGE_WIDTH - MARGIN,
      y,
    },
    thickness: 1,
    color: COLORS.line,
  });

  y -= 18;

  // ========================================================
  // FIELD HELPERS
  // ========================================================

  const labels =
    FIELD_LABELS[submission.form_type] || {};

  const fields =
    submission.fields || {};

  const entries = Object.entries(fields);

  // --------------------------------------------------------
  // Fields that should ALWAYS occupy the full width
  // --------------------------------------------------------

  const fullWidthKeys = new Set([
    "address",
    "principalAddress",
    "consumerAddress",
    "services",
    "additionalPowers",
    "paymentMethodOther",
  ]);

  // --------------------------------------------------------
  // Fields with potentially long values
  // --------------------------------------------------------

  const isLongField = (
    key: string,
    value: any,
  ) => {
    if (fullWidthKeys.has(key)) {
      return true;
    }

    const stringValue = Array.isArray(value)
      ? value.join(", ")
      : String(value ?? "");

    return stringValue.length > 65;
  };

  // --------------------------------------------------------
  // Normalize value
  // --------------------------------------------------------

  const displayValue = (value: any) => {
    if (Array.isArray(value)) {
      return value.length
        ? value.join(", ")
        : "—";
    }

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    return String(value);
  };

  // ========================================================
  // DRAW ONE FIELD
  // ========================================================

  const drawField = (
    key: string,
    value: any,
    x: number,
    fieldY: number,
    width: number,
  ) => {
    const label =
      labels[key] || key;

    const display =
      displayValue(value);

    const labelSize = 7.5;
    const valueSize = 10;

    const labelGap = 3;
    const valueLineGap = 2;

    page.drawText(label, {
      x,
      y: fieldY,
      size: labelSize,
      font: bold,
      color: COLORS.muted,
    });

    const valueY =
      fieldY -
      labelSize -
      labelGap;

    const endY = drawWrappedText(
      display,
      x,
      valueY,
      width,
      {
        size: valueSize,
        f: font,
        color: COLORS.text,
        lineGap: valueLineGap,
      },
    );

    return endY;
  };

  // ========================================================
  // CALCULATE FIELD HEIGHT
  // ========================================================

  const getFieldHeight = (
    key: string,
    value: any,
    width: number,
  ) => {
    const display =
      displayValue(value);

    const labelSize = 7.5;
    const valueSize = 10;

    const labelGap = 3;
    const valueLineGap = 2;

    const valueHeight =
      getTextHeight(
        display,
        width,
        valueSize,
        font,
        valueLineGap,
      );

    return (
      labelSize +
      labelGap +
      valueHeight +
      10
    );
  };

  // ========================================================
  // RENDER FIELDS
  // ========================================================

  let i = 0;

  while (i < entries.length) {
    const [key, value] =
      entries[i];

    // ------------------------------------------------------
    // FULL WIDTH FIELD
    // ------------------------------------------------------

    if (
      isLongField(
        key,
        value,
      )
    ) {
      const height =
        getFieldHeight(
          key,
          value,
          CONTENT_WIDTH,
        );

      ensureSpace(height);

      drawField(
        key,
        value,
        MARGIN,
        y,
        CONTENT_WIDTH,
      );

      y -= height;

      i++;
      continue;
    }

    // ------------------------------------------------------
    // Try to pair this field with the next field
    // ------------------------------------------------------

    if (i + 1 < entries.length) {
      const [nextKey, nextValue] =
        entries[i + 1];

      // If next field needs full width,
      // render current field alone.
      if (
        isLongField(
          nextKey,
          nextValue,
        )
      ) {
        const height =
          getFieldHeight(
            key,
            value,
            COLUMN_WIDTH,
          );

        ensureSpace(height);

        drawField(
          key,
          value,
          MARGIN,
          y,
          COLUMN_WIDTH,
        );

        y -= height;

        i++;
        continue;
      }

      // Both fields fit in two columns.
      const leftHeight =
        getFieldHeight(
          key,
          value,
          COLUMN_WIDTH,
        );

      const rightHeight =
        getFieldHeight(
          nextKey,
          nextValue,
          COLUMN_WIDTH,
        );

      const rowHeight =
        Math.max(
          leftHeight,
          rightHeight,
        );

      ensureSpace(rowHeight);

      // Left
      drawField(
        key,
        value,
        MARGIN,
        y,
        COLUMN_WIDTH,
      );

      // Right
      drawField(
        nextKey,
        nextValue,
        MARGIN +
          COLUMN_WIDTH +
          COLUMN_GAP,
        y,
        COLUMN_WIDTH,
      );

      y -= rowHeight;

      i += 2;
      continue;
    }

    // ------------------------------------------------------
    // Last single field
    // ------------------------------------------------------

    const height =
      getFieldHeight(
        key,
        value,
        COLUMN_WIDTH,
      );

    ensureSpace(height);

    drawField(
      key,
      value,
      MARGIN,
      y,
      COLUMN_WIDTH,
    );

    y -= height;

    i++;
  }

  // ========================================================
  // SIGNATURES
  // ========================================================

  const signatures =
    submission.signatures || {};

  const sigEntries =
    Object.entries(signatures)
      .filter(([, path]) => path);

  if (sigEntries.length) {
    // Section spacing
    ensureSpace(35);

    y -= 5;

    page.drawLine({
      start: {
        x: MARGIN,
        y,
      },
      end: {
        x: PAGE_WIDTH - MARGIN,
        y,
      },
      thickness: 1,
      color: COLORS.line,
    });

    y -= 18;

    page.drawText("Signatures", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: COLORS.text,
    });

    y -= 24;

    // ------------------------------------------------------
    // Download and embed signatures first
    // ------------------------------------------------------

    const embeddedSignatures: Array<{
      name: string;
      img: any;
      width: number;
      height: number;
    }> = [];

    for (const [
      name,
      path,
    ] of sigEntries) {
      try {
        const {
          data,
          error,
        } = await supabase.storage
          .from("signatures")
          .download(
            path as string,
          );

        if (
          error ||
          !data
        ) {
          continue;
        }

        const bytes =
          new Uint8Array(
            await data.arrayBuffer(),
          );

        const img =
          await doc.embedPng(
            bytes,
          );

        // Keep signatures compact
        const maxWidth = 190;
        const maxHeight = 65;

        let width =
          maxWidth;

        let height =
          (img.height /
            img.width) *
          width;

        if (
          height >
          maxHeight
        ) {
          height =
            maxHeight;

          width =
            (img.width /
              img.height) *
            height;
        }

        embeddedSignatures.push({
          name,
          img,
          width,
          height,
        });
      } catch (err) {
        console.error(
          `Failed to embed signature "${name}":`,
          err,
        );
      }
    }

    // ------------------------------------------------------
    // Render signatures two per row
    // ------------------------------------------------------

    for (
      let s = 0;
      s <
      embeddedSignatures.length;
      s += 2
    ) {
      const left =
        embeddedSignatures[s];

      const right =
        embeddedSignatures[s + 1];

      const leftHeight =
        left
          ? left.height + 35
          : 0;

      const rightHeight =
        right
          ? right.height + 35
          : 0;

      const rowHeight =
        Math.max(
          leftHeight,
          rightHeight,
        );

      ensureSpace(
        rowHeight + 5,
      );

      // ----------------------------------------------
      // Left signature
      // ----------------------------------------------

      if (left) {
        page.drawText(
          left.name,
          {
            x: MARGIN,
            y,
            size: 8,
            font: bold,
            color: COLORS.muted,
          },
        );

        page.drawImage(
          left.img,
          {
            x: MARGIN,
            y:
              y -
              8 -
              left.height,
            width:
              left.width,
            height:
              left.height,
          },
        );
      }

      // ----------------------------------------------
      // Right signature
      // ----------------------------------------------

      if (right) {
        const rightX =
          MARGIN +
          COLUMN_WIDTH +
          COLUMN_GAP;

        page.drawText(
          right.name,
          {
            x: rightX,
            y,
            size: 8,
            font: bold,
            color: COLORS.muted,
          },
        );

        page.drawImage(
          right.img,
          {
            x: rightX,
            y:
              y -
              8 -
              right.height,
            width:
              right.width,
            height:
              right.height,
          },
        );
      }

      y -= rowHeight;
    }
  }

  // ========================================================
  // FOOTER ON EVERY PAGE
  // ========================================================

  // We need to add the footer after all pages exist.
  const pages = doc.getPages();

  pages.forEach((currentPage, index) => {
    const footerY = 22;

    currentPage.drawLine({
      start: {
        x: MARGIN,
        y: footerY + 10,
      },
      end: {
        x: PAGE_WIDTH - MARGIN,
        y: footerY + 10,
      },
      thickness: 0.5,
      color: COLORS.line,
    });

    const footerLeft =
      `Clear Debt (Pty) Ltd · ${submission.reference}`;

    currentPage.drawText(
      footerLeft,
      {
        x: MARGIN,
        y: footerY,
        size: 7,
        font,
        color: COLORS.lightMuted,
      },
    );

    const footerRight =
      `Page ${index + 1} of ${pages.length}`;

    currentPage.drawText(
      footerRight,
      {
        x:
          PAGE_WIDTH -
          MARGIN -
          font.widthOfTextAtSize(
            footerRight,
            7,
          ),
        y: footerY,
        size: 7,
        font,
        color: COLORS.lightMuted,
      },
    );
  });

  // ========================================================
  // SAVE
  // ========================================================

  return doc.save();
}