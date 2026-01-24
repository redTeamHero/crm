export const CANONICAL_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reportMeta", "identity", "tradelines"],
  properties: {
    reportMeta: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "reportDate"],
      properties: {
        provider: { type: "string" },
        reportDate: { type: ["string", "null"] },
      },
    },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["TUC", "EXP", "EQF"],
      properties: {
        TUC: { $ref: "#/$defs/identityBlock" },
        EXP: { $ref: "#/$defs/identityBlock" },
        EQF: { $ref: "#/$defs/identityBlock" },
      },
    },
    tradelines: {
      type: "array",
      items: { $ref: "#/$defs/tradelineGroup" },
    },
  },
  $defs: {
    identityBlock: {
      type: "object",
      additionalProperties: false,
      required: ["name", "dob", "addresses"],
      properties: {
        name: { type: ["string", "null"] },
        dob: { type: ["string", "null"] },
        addresses: { type: "array", items: { type: "string" } },
      },
    },
    tradelineGroup: {
      type: "object",
      additionalProperties: false,
      required: ["furnisherName", "byBureau"],
      properties: {
        furnisherName: { type: "string" },
        byBureau: {
          type: "object",
          additionalProperties: false,
          required: ["TUC", "EXP", "EQF"],
          properties: {
            TUC: { $ref: "#/$defs/tradeline" },
            EXP: { $ref: "#/$defs/tradeline" },
            EQF: { $ref: "#/$defs/tradeline" },
          },
        },
      },
    },
    tradeline: {
      type: "object",
      additionalProperties: false,
      required: [
        "present",
        "accountNumberMasked",
        "accountStatus",
        "paymentStatus",
        "balance",
        "pastDue",
        "creditLimit",
        "highCredit",
        "dateOpened",
        "dateClosed",
        "lastReported",
        "dateLastPayment",
        "comments",
      ],
      properties: {
        present: { type: "boolean" },
        accountNumberMasked: { type: ["string", "null"] },
        accountStatus: { type: ["string", "null"] },
        paymentStatus: { type: ["string", "null"] },
        balance: { type: ["number", "null"] },
        pastDue: { type: ["number", "null"] },
        creditLimit: { type: ["number", "null"] },
        highCredit: { type: ["number", "null"] },
        dateOpened: { type: ["string", "null"] },
        dateClosed: { type: ["string", "null"] },
        lastReported: { type: ["string", "null"] },
        dateLastPayment: { type: ["string", "null"] },
        comments: { type: ["string", "null"] },
      },
    },
  },
};

export const VIOLATION_LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["violations"],
  properties: {
    violations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ruleId",
          "category",
          "severity",
          "bureau",
          "furnisherName",
          "accountNumberMasked",
          "tradelineKey",
          "evidencePaths",
          "explanation",
          "disputeTargets",
        ],
        properties: {
          ruleId: { type: "string" },
          category: {
            type: "string",
            enum: ["metro2_integrity", "fcra_mapping", "fdcpa_mapping", "grouping_warning"],
          },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          bureau: { type: "string", enum: ["TUC", "EXP", "EQF", "CROSS_BUREAU"] },
          furnisherName: { type: "string" },
          accountNumberMasked: { type: ["string", "null"] },
          tradelineKey: { type: "string" },
          evidencePaths: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          disputeTargets: {
            type: "array",
            items: { type: "string", enum: ["CRA", "FURNISHER", "COLLECTOR"] },
          },
        },
      },
    },
  },
};
