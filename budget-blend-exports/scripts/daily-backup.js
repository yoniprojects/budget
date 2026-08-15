const { fetchAppState } = require('../lib/firestore');
const { sendWithAttachment } = require('../lib/email');

// Mirrors buildBackupPayload() in the app. Note: `hiddenCategories` and
// `theme` are NOT included here, because those two prefs live only in the
// browser's localStorage, not in Firestore - there is nothing for a
// server-side job to read them from. Everything that holds real budget data
// (period, categories, sources, budgets, transactions, yearly archive) IS
// included, since all of that lives in the Firestore doc.
function buildBackupPayload(state){
  return {
    kind: 'budget-blend-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    appState: {
      period: state.period,
      expenseCategories: state.expenseCategories,
      incomeSources: state.incomeSources,
      budgets: state.budgets,
      txExpenses: state.txExpenses,
      txIncome: state.txIncome,
      sheetData: state.sheetData
    }
  };
}

(async () => {
  const state = await fetchAppState();
  const payload = buildBackupPayload(state);
  const json = JSON.stringify(payload, null, 2);

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);

  await sendWithAttachment({
    subject: `Budget Blend backup - ${stamp}`,
    text: 'Attached: your daily automated backup export.',
    filename: `budget-backup-${stamp}.json`,
    content: json,
    contentType: 'application/json'
  });

  console.log('Daily backup email sent.');
})().catch(err => {
  console.error('Daily backup failed:', err);
  process.exit(1);
});
