const lisbonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** e.g. "21 Nov 2026, 15:32:08" in Europe/Lisbon time. */
export const formatLisbonDateTime = (epochMs: number) => lisbonFormatter.format(epochMs);

const lisbonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const lisbonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "15:32:08" in Europe/Lisbon time. */
export const formatLisbonTime = (epochMs: number) => lisbonTime.format(epochMs);
/** "21 Nov 2026" in Europe/Lisbon time. */
export const formatLisbonDay = (epochMs: number) => lisbonDay.format(epochMs);

/** "123456789" -> "123 456 789" for readability. */
export const groupNif = (nif: string) => nif.replace(/(\d{3})(?=\d)/g, "$1 ");
