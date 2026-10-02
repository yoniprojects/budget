const { fetchAppState } = require('../lib/firestore');
const { buildExportWorkbook } = require('../lib/xlsxExport');
const { sendWithAttachment } = require('../lib/email');

// True only at ~23:xx Israel time on the last day of the month. The workflow
// fires at both 20:59 and 21:59 UTC so that exactly one of the two lands in
// the 23:00 hour in Israel regardless of daylight saving time.
function isTargetMoment(){
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false
  }).formatToParts(new Date());
  const get = type => parseInt(parts.find(p => p.type === type).value, 10);
  const year = get('year'), month = get('month'), day = get('day');
  const hour = get('hour') % 24;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay && hour === 23;
}

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
    subject: `Yoni's Budget Monthly Excel - ${stamp}`,
    text: "Attached: Yoni's monthly Excel export.",
    filename: `yoni-budget-export-${stamp}.xlsx`,
    content: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  console.log('Monthly Excel export email sent.');
})().catch(err => {
  console.error('Monthly Excel export failed:', err);
  process.exit(1);
});
