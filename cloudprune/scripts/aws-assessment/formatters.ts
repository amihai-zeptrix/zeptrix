/**
 * @typedef {{ min: number, max: number, sum?: number }} MetricRange
 */

/**
 * @param {unknown} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const precision = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(precision).replace(/\.0$/, "")} ${units[unitIndex]}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "n/a";
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}%`;
}

/**
 * @param {unknown} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`;
  const minutes = value / 60;
  if (minutes < 60) return `${minutes.toFixed(minutes % 1 === 0 ? 0 : 1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

/**
 * @param {MetricRange | null | undefined} range
 * @param {string} [suffix]
 * @returns {string}
 */
function formatMetricRange(range, suffix = "%") {
  if (!range) return "not available";
  if (Math.abs(range.min - range.max) < 0.05) return `${range.max.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  return `${range.min.toFixed(1).replace(/\.0$/, "")}-${range.max.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

module.exports = {
  formatBytes,
  formatDuration,
  formatMetricRange,
  formatPercent,
};
