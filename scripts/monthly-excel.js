const { fetchAppState } = require('../lib/firestore');
const { buildExportWorkbook } = require('../lib/xlsxExport');
const { sendWithAttachment } = require('../lib/email');

// ... isTargetMoment() stays exactly as-is, unchanged ...

(async () => {
  const force = process.env.FORCE_SEND === 'true';
  if(!force && !isTargetMoment()){
    console.log('Not the target moment (23:59 Israel time on the last day of the month) - skipping.');
    return;
  }
  if(force){
    console.log('Manual run (workflow_dispatch) - bypassing the month-end check.');
  }

  const state = await fetchAppState();
  const buffer = await buildExportWorkbook(state);

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);

  await sendWithAttachment({
    subject: `Budget Blend monthly Excel export - ${stamp}`,
    text: 'Attached: your monthly Excel export.',
    filename: `budget-export-${stamp}.xlsx`,
    content: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  console.log('Monthly Excel export email sent.');
})().catch(err => {
  console.error('Monthly Excel export failed:', err);
  process.exit(1);
});
