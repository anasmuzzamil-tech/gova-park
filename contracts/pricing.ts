export type PriceInput = {
  startAt: Date;
  endAt: Date;
  hourlyCents: number;
  dailyCents: number;
  weeklyCents: number;
  commissionBps?: number;
};

export function calculatePrice(input: PriceInput) {
  const durationMs = input.endAt.getTime() - input.startAt.getTime();
  if (durationMs <= 0) throw new Error("Le départ doit être postérieur à l’arrivée.");
  const startedHours = Math.max(1, Math.ceil(durationMs / 3_600_000));
  const hourlyTotal = startedHours * input.hourlyCents;
  const dailyCap = Math.ceil(startedHours / 24) * input.dailyCents;
  const weeklyCap = Math.ceil(startedHours / (24 * 7)) * input.weeklyCents;
  const baseCents = Math.min(hourlyTotal, dailyCap, weeklyCap);
  const feeCents = Math.round(baseCents * 0.08);
  const commissionCents = Math.round(baseCents * ((input.commissionBps ?? 1200) / 10000));
  return {
    startedHours,
    baseCents,
    feeCents,
    totalCents: baseCents + feeCents,
    commissionCents,
    netCents: baseCents - commissionCents,
  };
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
