import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const DRYRUN_CSV = path.join(LOG_DIR, 'dryrun.csv');

// Ensure log directory and header
const ensureCsv = () => {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(DRYRUN_CSV)) {
    const header = 'timestamp,token,inputAmount,estimatedFeeSol,priceImpactPct,priceImpactLossSol,costPercent,expectedUpside,decision,notes\n';
    fs.writeFileSync(DRYRUN_CSV, header, { encoding: 'utf8' });
  }
};

export const appendDryRunRecord = async (record: {
  timestamp: string;
  token: string;
  inputAmount: string;
  estimatedFeeSol: number;
  priceImpactPct: number;
  priceImpactLossSol: number;
  costPercent: number;
  expectedUpside: number;
  decision: 'skip' | 'consider' | 'trade';
  notes?: string;
}) => {
  try {
    ensureCsv();
    const line = `${record.timestamp},${record.token},${record.inputAmount},${record.estimatedFeeSol},${record.priceImpactPct},${record.priceImpactLossSol},${record.costPercent},${record.expectedUpside},${record.decision},"${(record.notes || '').replace(/"/g, '""')}"\n`;
    await fs.promises.appendFile(DRYRUN_CSV, line, { encoding: 'utf8' });
  } catch (e) {
    console.error('Failed to append dry-run CSV record:', e);
  }
};

export default { appendDryRunRecord };
