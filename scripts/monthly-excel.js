const { fetchAppState } = require('../lib/firestore');
const { buildExportWorkbook } = require('../lib/xlsxExport');
const { sendWithAttachment } = require('../lib/email');

// Israel switches between IST (UTC+2) and IDT (UTC+3) with daylight saving,
// so "23:59 Israel time" lands on a different UTC hour depending on the
// season. Rather than hardcode a UTC offset that would drift twice a year,
// the workflow runs this script TWICE a day (see the .github/workflows
// file), once at each UTC hour that 23:59 Israel time could fall on. This
// function checks the actual current time in Asia/Jerusalem and only sends
// when it's really the target moment - so exactly one of the two daily runs
// actually fires, whichever matches the current season.
function isTargetMoment(){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric'
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type).value;

  const hour = parseInt(get('hour'), 10);
  const day = parseInt(get('day'), 10);
  const month = parseInt(get('month'), 10);
  const year = parseInt(get('year'), 10);

  // Runs are scheduled for the 23:xx UTC-hour window; only fire in hour 23.
  if(hour !== 23) return false;

  // Last day of month: the day after today rolls over to day 1.
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return tomorrow.getUTCDate() === 1;
}

(async () => {
  if(!isTargetMoment()){
    console.log('Not the target moment (23:59 Israel time on the last day of the month) - skipping.');
    return;
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
