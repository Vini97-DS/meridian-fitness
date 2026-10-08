// Datas relativas a "hoje" no fuso do app (America/Sao_Paulo), em ISO 0=Seg…6=Dom como o app usa.
import { config } from "./guard.mjs";
const TZ = config.timezone;
export function localParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t).value;
  const wd = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[g("weekday")];
  return { date: `${g("year")}-${g("month")}-${g("day")}`, weekday: wd };
}
export function daysAgo(n, d = new Date()) { return localParts(new Date(d.getTime() - n * 86400000)); }
export const isoWeekdayOffset = (offset, d = new Date()) => (((localParts(d).weekday + offset) % 7) + 7) % 7;
// instante às 10:00 locais de N dias atrás (UTC-3 fixo é suficiente p/ dado de teste)
export function tsDaysAgo(n, hour = 10) { const { date } = daysAgo(n); return `${date}T${String(hour + 3).padStart(2, "0")}:00:00Z`; }
