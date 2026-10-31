// Brochure areas. These are typical-plan references, not live inventory.
export const FLATS = {
 A: [['A-101',4,1373.03,2529.25,264.91],['A-102',3,1002.57,1689.90,107.86],['A-103',3,1032.97,1746.33,107.70],['A-104',4,1316.29,2321.08,203.14],['A-105',4,1468.28,2494.10,139.55],['A-106',3,1007.55,1832.81,196.90],['A-107',3,1007.55,1832.81,196.90],['A-108',4,1538.68,2718.26,250.06]],
 B: [['B-101',4,1532.42,2713.71,237.15],['B-102',3,1095.90,1958.08,198.82],['B-103',3,1145.96,1978.68,131.59],['B-104',3,1002.79,1797.36,181.41],['B-105',3,1009.65,1693.02,83.92],['B-106',3,1009.06,1750.83,140.58],['B-107',3,1035.01,1881.46,161.07],['B-108',3,1095.43,1953.08,197.98]]
};
export const FRAMES = {rise:656,tour:483,shell:151,orbit:121};
export const findFlat = id => Object.values(FLATS).flat().find(f => f[0] === id);
export function selection(input = {}) {
 const plan = findFlat(input.plan) ? input.plan : 'A-103';
 const floor = Math.max(1, Math.min(14, Math.round(Number(input.floor) || 1)));
 return {plan, floor, block:plan[0]};
}
export const selectionLabel = s => `Block ${s.block} · Floor ${s.floor} · Plan ${s.plan}`;
export function normalizeMobile(value) {
 const digits = String(value).replace(/[\s()+-]/g,'');
 const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
 return /^[6-9]\d{9}$/.test(local) ? '+91' + local : null;
}
export function visitDates(now = new Date()) {
 const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const [y,m,d] = today.split('-').map(Number);
 return Array.from({length:10},(_,i) => {
  const date = new Date(Date.UTC(y,m-1,d+i+1,6));
  return {value:date.toISOString().slice(0,10),label:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(date)};
 });
}
// Marker positions read from the brochure's red unit references. Not surveyed boundaries.
export const MARKERS = {
 A:[[52,70.5],[51.5,67.5],[50.7,30.2],[48.2,24.1],[67,24.1],[76.8,45.4],[76.5,51.3],[66.7,73.1]],
 B:[[33.3,62.3],[32.2,34.3],[32.8,29.5],[41.8,27.2],[69,27.2],[56.6,34.2],[62.3,65.2],[44.9,65.2]]
};
