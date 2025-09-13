import fs from 'fs';
import path from 'path';
import { normalizeReport } from './creditAuditTool.js';
import { generateLetters } from './letterEngine.js';

async function main() {
  const reportPath = path.join('data', 'report.json');
  const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // 1. Normalize report into tradeline "cards" for client portal
  const normalized = normalizeReport(raw);
  const cardsPath = path.join('data', 'tradelineCards.json');
  fs.writeFileSync(cardsPath, JSON.stringify(normalized.accounts, null, 2));
  console.log(`Saved ${normalized.accounts.length} tradeline cards to ${cardsPath}`);

  // 2. Generate a sample letter for the first tradeline and violation
  if (raw.tradelines && raw.tradelines.length) {
    const letters = generateLetters({
      report: raw,
      selections: [
        { tradelineIndex: 0, bureaus: ['Experian'], violationIdxs: [0] }
      ],
      consumer: { name: 'Jane Doe', address: '123 Main St' },
      requestType: 'investigation'
    });

    if (letters.length) {
      fs.writeFileSync('letter.html', letters[0].html);
      console.log('Letter saved to letter.html');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
