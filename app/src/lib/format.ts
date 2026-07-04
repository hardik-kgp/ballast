export const formatMW = (mw: number) =>
  `${mw.toLocaleString("en-IN", { maximumFractionDigits: 0 })} MW`;

export const formatPercent = (value: number, digits = 1) =>
  `${value.toFixed(digits)}%`;

export const formatCrore = (crore: number) =>
  `\u20B9${crore.toLocaleString("en-IN", { maximumFractionDigits: crore < 10 ? 2 : 1 })} Cr`;

export const formatHour = (hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
};

export const timeAgo = (minutes: number) => {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
