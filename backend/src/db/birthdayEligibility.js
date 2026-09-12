export function isBirthdayToday(birthdate, now = new Date()) {
  if (!birthdate) return false;
  const d = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
