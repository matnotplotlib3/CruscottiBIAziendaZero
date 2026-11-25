export function formatDisplayDate(value) {
  if (typeof value !== 'string') return value ?? '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year}${hour ? ` ${hour}:${minute}` : ''}`;
}
