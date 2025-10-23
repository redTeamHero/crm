import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateRuleDebugTradelines } from '../ruleDebugGenerator.js';
import { prepareNegativeItems } from '../negativeItems.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'report.json');

function loadExistingReport() {
  if (!fs.existsSync(DATA_PATH)) {
    return { personal_info: {}, tradelines: [], inquiries: [] };
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { personal_info: {}, tradelines: [], inquiries: [] };
    }
    parsed.tradelines = Array.isArray(parsed.tradelines) ? parsed.tradelines : [];
    return parsed;
  } catch (err) {
    console.warn(`Failed to read existing report: ${err.message}`);
    return { personal_info: {}, tradelines: [], inquiries: [] };
  }
}

function buildSummary(report) {
  const summary = {
    tradelines: Array.isArray(report.tradelines) ? report.tradelines.length : 0,
    negative_items: Array.isArray(report.negative_items) ? report.negative_items.length : 0,
    personalInfoMismatches: report.personalInfoMismatches || report.personal_info_mismatches || {},
  };
  if (!summary.negative_items && summary.negative_items !== 0) {
    delete summary.negative_items;
  }
  return summary;
}

function main() {
  const report = loadExistingReport();
  const preserved = report.tradelines.filter((tl) => !tl?.meta?.tags?.includes('rule-debug-auto'));

  const generated = generateRuleDebugTradelines({ startIndex: preserved.length });
  report.tradelines = [...preserved, ...generated];
  report.generated_at = new Date().toISOString();
  if (!report.personal_info) report.personal_info = {};
  if (!report.inquiries) report.inquiries = [];

  try {
    const extras = {
      inquiries: report.inquiries,
      inquirySummary: report.inquiry_summary,
      personalInfo: report.personal_info || report.personalInfo || report.personal_information,
      personalInfoMismatches: report.personalInfoMismatches || report.personal_info_mismatches,
    };
    const { items } = prepareNegativeItems(report.tradelines, extras);
    report.negative_items = items;
  } catch (err) {
    console.warn(`Failed to rebuild negative items: ${err.message}`);
  }

  report.summary = buildSummary(report);

  fs.writeFileSync(DATA_PATH, JSON.stringify(report, null, 2));
  console.log(
    `Generated ${generated.length} rule tradelines. Report now has ${report.tradelines.length} tradelines.\nSaved to ${DATA_PATH}.`
  );
}

main();
