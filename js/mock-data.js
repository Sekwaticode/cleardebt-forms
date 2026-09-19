/* ==========================================================
   mock-data.js — Shared constants. Submission data itself now
   lives in Supabase (see js/api.js) — mockSubmissions removed.
   ========================================================== */

export const FORM_TYPES = {
  CONTRACT: "Client Contract",
  TRANSFER: "Debt Counsellor Transfer",
  POA: "Power of Attorney",
};

// Maps the DB's form_type id to its display name (used by the dashboard table).
export const FORM_TYPE_LABELS = {
  client_contract: FORM_TYPES.CONTRACT,
  counsellor_transfer: FORM_TYPES.TRANSFER,
  power_of_attorney: FORM_TYPES.POA,
};

export const STATUSES = ["draft", "submitted", "approved", "rejected"];

// Human-readable labels for each form's field names — used when
// rendering the "View" modal and when generating the PDF, so the
// output reads as prose instead of raw camelCase keys.
export const FIELD_LABELS = {
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
