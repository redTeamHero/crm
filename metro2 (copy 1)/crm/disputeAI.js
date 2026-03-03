import { fetchFn } from "./fetchUtil.js";
import { JSDOM } from "jsdom";

const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/responses";
const OPENAI_SCAN_MODEL = process.env.OPENAI_SCAN_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key.trim()) {
    throw new Error("OPENAI_API_KEY is required for AI response scanning.");
  }
  return key.trim();
}

const RESPONSE_SCAN_SCHEMA = {
  type: "object",
  properties: {
    outcome: {
      type: "string",
      enum: ["verified", "removed", "deleted", "stalled", "no_response", "partial", "updated", "unknown"],
      description: "The outcome of the dispute as stated in the response letter."
    },
    bureau: {
      type: ["string", "null"],
      description: "The credit bureau that sent the response (TransUnion, Experian, Equifax), or null if not identifiable."
    },
    creditor: {
      type: ["string", "null"],
      description: "The creditor or furnisher referenced in the response, or null if not identifiable."
    },
    account_number: {
      type: ["string", "null"],
      description: "The account number referenced, masked or partial, or null if not present."
    },
    method_of_verification: {
      type: ["string", "null"],
      description: "The method of verification used by the bureau/creditor, or null if not stated."
    },
    key_details: {
      type: "string",
      description: "A brief summary of the key findings or actions described in the letter."
    },
    notable_quotes: {
      type: "array",
      items: { type: "string" },
      description: "Notable direct quotes from the letter that are relevant to the dispute outcome."
    },
    response_date: {
      type: ["string", "null"],
      description: "The date of the response letter if present, in YYYY-MM-DD format, or null."
    },
    next_steps_hint: {
      type: ["string", "null"],
      description: "Any next steps or deadlines mentioned in the letter, or null."
    }
  },
  required: ["outcome", "bureau", "creditor", "account_number", "method_of_verification", "key_details", "notable_quotes", "response_date", "next_steps_hint"],
  additionalProperties: false
};

const SCAN_SYSTEM_PROMPT = [
  "You are a credit dispute response letter analyzer.",
  "Extract structured information from bureau or creditor response letters.",
  "Output must conform to the provided JSON schema exactly.",
  "Use null when a field is not present or cannot be determined; never guess.",
  "For outcome: use 'verified' if the item was investigated and confirmed accurate,",
  "'removed' or 'deleted' if the item was removed from the report,",
  "'stalled' if the response is vague or non-committal,",
  "'partial' if some corrections were made but the item remains,",
  "'updated' if information was corrected/updated,",
  "'no_response' if the letter indicates no investigation was done,",
  "'unknown' if the outcome cannot be determined.",
].join(" ");

const SCAN_DEVELOPER_PROMPT = [
  "Bureau names should be normalized to: TransUnion, Experian, or Equifax.",
  "If the letter is from a creditor or debt collector rather than a bureau, set bureau to null and capture the creditor name.",
  "method_of_verification should capture exactly how the bureau says they verified (e.g., 'contacted furnisher', 'reviewed records').",
  "notable_quotes should be short, relevant excerpts — not the entire letter.",
  "Limit notable_quotes to at most 5 entries.",
  "response_date should be extracted from the letter date, not inferred.",
].join(" ");

function extractTextFromHtml(html) {
  try {
    const dom = new JSDOM(html);
    return (dom.window.document.body?.textContent || "").replace(/\s+\n/g, "\n").trim();
  } catch {
    return html;
  }
}

function extractTextFromBuffer(fileBuffer, mimeType) {
  const mime = (mimeType || "").toLowerCase();
  const bufferStr = fileBuffer.toString("utf-8");

  if (mime.includes("html") || bufferStr.trimStart().startsWith("<")) {
    return extractTextFromHtml(bufferStr);
  }

  return bufferStr.replace(/\s+\n/g, "\n").trim();
}

function redactSensitive(text = "") {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b\d{9}\b/g, "[REDACTED_SSN]");
}

export async function scanResponseLetter(fileBuffer, mimeType) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error("fileBuffer must be a Buffer.");
  }

  const rawText = extractTextFromBuffer(fileBuffer, mimeType);
  if (!rawText || rawText.length < 20) {
    throw new Error("Could not extract sufficient text from the response letter.");
  }

  const sanitizedText = redactSensitive(rawText).slice(0, 15000);
  const apiKey = getOpenAiKey();

  const body = {
    model: OPENAI_SCAN_MODEL,
    input: [
      { role: "system", content: SCAN_SYSTEM_PROMPT },
      { role: "developer", content: SCAN_DEVELOPER_PROMPT },
      { role: "user", content: `Analyze the following credit dispute response letter and extract the structured data:\n\n${sanitizedText}` },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "dispute_response_scan",
        schema: RESPONSE_SCAN_SCHEMA,
        strict: true,
      },
    },
    temperature: 0,
    store: false,
  };

  const response = await fetchFn(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${JSON.stringify(payload)}`);
  }

  const outputText = payload.output_text
    || payload.output?.map(item => item.content?.map(c => c.text || c.output_text).join("") || "").join("");
  if (outputText) {
    return JSON.parse(outputText);
  }

  const jsonContent = payload.output?.[0]?.content?.find(c => c.type === "output_json");
  if (jsonContent?.json) return jsonContent.json;

  throw new Error("OpenAI response missing structured output.");
}

export default scanResponseLetter;
