// ══════════════════════════════════════════════════════════════
// Meeting-schedule cadence helpers (pure, unit-tested).
//
// Used to project a small number of FORWARD meeting stubs for boards whose
// regular meeting lands on a fixed nth-weekday-of-month (verified from the
// board's own history / posted schedule — never guessed):
//   • Hospital District board  → 4th Thursday
//   • Ophir General Assembly    → 3rd Tuesday
//   • Ridgway Town Council      → 2nd Wednesday ("second Wednesday of the month")
//
// These placeholders fill the gap between meetings (when no agenda is posted
// yet) so the section shows an upcoming date. Real scraped agendas always win
// on reconcile, and we project only a couple ahead, so a cadence that ever
// drifts is corrected as soon as the next real agenda posts — and the
// source-health "0 upcoming" alarm still backstops a total miss.
// ══════════════════════════════════════════════════════════════

const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];

// nth: 1..4 for "1st..4th", or -1 for "last". weekday: 0=Sun..6=Sat. month0: 0-based.
function nthWeekday(year, month0, nth, weekday) {
  if (nth === -1) {
    const lastDay = new Date(year, month0 + 1, 0).getDate();
    const lastDow = new Date(year, month0, lastDay).getDay();
    const back = (lastDow - weekday + 7) % 7;
    return new Date(year, month0, lastDay - back);
  }
  const firstDow = new Date(year, month0, 1).getDay();
  const offset = (weekday - firstDow + 7) % 7;
  return new Date(year, month0, 1 + offset + (nth - 1) * 7);
}

function fmtDate(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Next `count` occurrences of a cadence at or after `from` (a Date), skipping
// any month index in skipMonths (0-based, e.g. [6,7] to skip Jul+Aug recess).
// Returns [{ date: 'Month D, YYYY', jsDate: Date }].
function nextOccurrences(cadence, from, count, skipMonths = []) {
  const skip = new Set(skipMonths);
  const fromMid = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const out = [];
  let y = from.getFullYear(), m = from.getMonth();
  for (let guard = 0; guard < 36 && out.length < count; guard++) {
    if (!skip.has(m)) {
      const d = nthWeekday(y, m, cadence.nth, cadence.weekday);
      if (d >= fromMid) out.push({ date: fmtDate(d), jsDate: d });
    }
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

// Federal holiday falling on Date `d` (local), or null. Used to flag projected
// meeting stubs that land on a holiday: towns often move those meetings, but
// to WHICH day varies by town, so the stub keeps its date and carries a note
// rather than guessing (2026-10-04: Norwood and Ridgway 2nd-Wednesday stubs on
// Veterans Day, Nov 11). Fixed-date holidays use the actual date, not the
// observed weekday.
function federalHoliday(d) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const same = (x) => x.getMonth() === m && x.getDate() === day;
  const fixed = { '0-1': "New Year's Day", '5-19': 'Juneteenth', '6-4': 'Independence Day',
                  '10-11': 'Veterans Day', '11-25': 'Christmas Day' };
  if (fixed[m + '-' + day]) return fixed[m + '-' + day];
  const rules = [
    [0, 3, 1, 'Martin Luther King Jr. Day'], [1, 3, 1, "Presidents' Day"],
    [4, -1, 1, 'Memorial Day'], [8, 1, 1, 'Labor Day'], [9, 2, 1, 'Columbus Day'],
    [10, 4, 4, 'Thanksgiving'],
  ];
  for (const [mo, nth, wd, name] of rules) {
    if (mo === m && same(nthWeekday(y, mo, nth, wd))) return name;
  }
  return null;
}

module.exports = { nthWeekday, nextOccurrences, fmtDate, federalHoliday, MONTHS };
