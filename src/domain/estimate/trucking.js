// src/domain/estimate/trucking.js
// Delivering the wall panels to the job: every value is the company's own
// (trucks differ, and so do rates), typed on the Wall panels page.
//   trucks  = panels ÷ panels per truck, rounded up
//   one trip = base fee + rate per mile × miles (one way, or there and back)
//   total   = trucks × one trip
// A delivery charge: no error buffer and no material markup on it.

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param inputs { panelsPerTruck, perMile, baseFee, miles, milesBasis: 'round' | 'one', panels (typed, optional) }
 * @param autoPanels the panels the estimate counts
 */
export function computeTrucking(inputs = {}, autoPanels = 0) {
  const typed = inputs.panels !== undefined && inputs.panels !== null && inputs.panels !== '';
  const panels = typed ? Math.max(0, Math.round(n(inputs.panels))) : Math.max(0, Math.round(n(autoPanels)));
  const perTruck = Math.max(0, Math.round(n(inputs.panelsPerTruck)));
  const round = inputs.milesBasis !== 'one';
  const milesCharged = r2(n(inputs.miles) * (round ? 2 : 1));
  const trucks = perTruck && panels ? Math.ceil(panels / perTruck) : 0;
  const perTrip = r2(n(inputs.baseFee) + n(inputs.perMile) * milesCharged);
  const total = r2(trucks * perTrip);
  const missing = [];
  if (panels && !perTruck) missing.push('panels per truck');
  if (panels && !n(inputs.miles)) missing.push('miles');
  if (panels && !n(inputs.perMile) && !n(inputs.baseFee)) missing.push('rates');
  return { panels, panelsTyped: typed, autoPanels: Math.round(n(autoPanels)), perTruck, round, milesCharged, trucks, perTrip, total, missing };
}
