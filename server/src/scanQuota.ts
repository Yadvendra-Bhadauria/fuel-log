export const FREE_MEAL_SCANS_PER_DAY = 3;

export function getFreeScanStatus(used: number, configured: boolean) {
  const remaining = configured ? Math.max(0, FREE_MEAL_SCANS_PER_DAY - used) : 0;
  return {
    configured,
    limit: FREE_MEAL_SCANS_PER_DAY,
    used,
    remaining,
    enabled: configured && remaining > 0,
  };
}