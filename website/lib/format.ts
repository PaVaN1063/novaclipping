// All times on the site are shown in IST.
const TZ = 'Asia/Kolkata';
const IST_OFFSET = 5.5 * 3600 * 1000;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function fmtWhen(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(iso));
}

// "2026-11-23" for the IST calendar day of a moment.
export function istDayKey(t: string | number | Date) {
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  return new Date(ms + IST_OFFSET).toISOString().slice(0, 10);
}

// The 7 days (Mon–Sun, IST) of the week `offset` weeks from this one.
export function weekDays(offset: number) {
  const nowIst = new Date(Date.now() + IST_OFFSET);
  const dow = (nowIst.getUTCDay() + 6) % 7;
  const monday = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() - dow + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday + i * 86400000);
    return {
      key: d.toISOString().slice(0, 10),
      dow: DOW[i],
      num: d.getUTCDate(),
      label: d.toLocaleString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  });
}

export function mb(bytes: number) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
