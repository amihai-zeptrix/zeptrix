/**
 * @typedef {{ Amount?: string | number, Unit?: string }} CostMetric
 * @typedef {{ Keys?: string[], Metrics?: { UnblendedCost?: CostMetric } }} CostGroup
 * @typedef {{ Groups?: CostGroup[] }} CostPeriod
 * @typedef {{ ResultsByTime?: CostPeriod[], SavingsPlansPurchaseRecommendation?: { EstimatedMonthlySavingsAmount?: string | number, SavingsPlansPurchaseRecommendationDetails?: Array<{ EstimatedMonthlySavingsAmount?: string | number }> } }} CostExplorerData
 * @typedef {{ ok?: boolean, data?: CostExplorerData }} CostExplorerCheck
 * @typedef {{ service: string, amount: number, unit: string }} ServiceCost
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
function dollars(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * @param {CostExplorerCheck | null | undefined} check
 * @returns {ServiceCost[]}
 */
function costByService(check) {
  if (!check?.ok) return [];
  const groups = check.data?.ResultsByTime?.flatMap((period) => period.Groups || []) || [];
  /** @type {Map<string, ServiceCost>} */
  const byService = new Map();
  for (const group of groups) {
    const service = group.Keys?.[0] || "Unknown";
    const unit = group.Metrics?.UnblendedCost?.Unit || "USD";
    const key = `${service}\0${unit}`;
    const current = byService.get(key) || { service, amount: 0, unit };
    current.amount += dollars(group.Metrics?.UnblendedCost?.Amount);
    byService.set(key, current);
  }
  return Array.from(byService.values())
    .map((item) => ({ ...item, amount: dollars(item.amount) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * @param {CostExplorerCheck | null | undefined} check
 * @returns {number | null}
 */
function estimatedSavingsFromSavingsPlans(check) {
  if (!check?.ok) return null;
  const detail = check.data?.SavingsPlansPurchaseRecommendation?.SavingsPlansPurchaseRecommendationDetails?.[0];
  const amount = dollars(detail?.EstimatedMonthlySavingsAmount || check.data?.SavingsPlansPurchaseRecommendation?.EstimatedMonthlySavingsAmount || 0);
  return amount > 0 ? amount : null;
}

module.exports = {
  costByService,
  dollars,
  estimatedSavingsFromSavingsPlans,
};
