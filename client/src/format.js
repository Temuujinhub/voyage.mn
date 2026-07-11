const UB_TZ = 'Asia/Ulaanbaatar';

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { timeZone: UB_TZ, hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { timeZone: UB_TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(ts) {
  if (!ts) return '—';
  return `${fmtDate(ts)}, ${fmtTime(ts)}`;
}
export function addMinutes(ts, minutes) {
  return new Date(new Date(ts).getTime() + minutes * 60000);
}

export const FLIGHT_STATUS = {
  SCHEDULED: { mn: 'Товлогдсон', color: 'gray' },
  CHECKIN_OPEN: { mn: 'Check-in нээлттэй', color: 'blue' },
  BOARDING: { mn: 'Boarding', color: 'green' },
  DEPARTED: { mn: 'Хөөрсөн', color: 'navy' },
  CANCELLED: { mn: 'Цуцлагдсан', color: 'red' },
};

export const PAX_STATUS = {
  PENDING: { mn: 'Хүлээгдэж буй', color: 'amber' },
  CHECKED_IN: { mn: 'Бүртгүүлсэн', color: 'blue' },
  SECURITY_PASSED: { mn: 'Шалгалт OK', color: 'teal' },
  BOARDED: { mn: 'Онгоцонд', color: 'green' },
  OFFLOADED: { mn: 'Offloaded', color: 'red' },
};

export const ROLE_MN = {
  admin: 'Админ',
  manager: 'Менежер',
  agent: 'Бүртгэлийн ажилтан',
  ot_staff: 'ОТ аяллын ажилтан',
};
