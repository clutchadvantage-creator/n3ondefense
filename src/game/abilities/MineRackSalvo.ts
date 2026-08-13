export interface MineRackOffset {
  x: number;
  y: number;
}

/**
 * Produces a compact, centered deployment formation for any rack capacity.
 * Five mines use the familiar five-pip pattern; larger racks keep a center
 * charge and distribute the remaining mines evenly around it.
 */
export const getMineRackPatternOffsets = (
  count: number,
  spacing: number,
  rotation = 0
): MineRackOffset[] => {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return [];
  if (safeCount === 1) return [{ x: 0, y: 0 }];

  const rotate = (x: number, y: number): MineRackOffset => ({
    x: x * Math.cos(rotation) - y * Math.sin(rotation),
    y: x * Math.sin(rotation) + y * Math.cos(rotation)
  });

  if (safeCount === 2) return [rotate(-spacing * 0.5, 0), rotate(spacing * 0.5, 0)];
  if (safeCount === 3) {
    return Array.from({ length: 3 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
      return rotate(Math.cos(angle) * spacing * 0.72, Math.sin(angle) * spacing * 0.72);
    });
  }
  if (safeCount === 4) {
    const half = spacing * 0.52;
    return [rotate(-half, -half), rotate(half, -half), rotate(-half, half), rotate(half, half)];
  }
  if (safeCount === 5) {
    const half = spacing * 0.58;
    return [
      { x: 0, y: 0 },
      rotate(-half, -half), rotate(half, -half),
      rotate(-half, half), rotate(half, half)
    ];
  }

  const offsets: MineRackOffset[] = [{ x: 0, y: 0 }];
  const ringCount = safeCount - 1;
  const ringRadius = spacing * Math.max(0.82, ringCount / 6);
  for (let index = 0; index < ringCount; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / ringCount;
    offsets.push(rotate(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius));
  }
  return offsets;
};

export const getMineRackEnergyCost = (
  perMineEnergyCost: number,
  mineCount: number,
  energyCostMultiplier: number
): number => Math.max(0, perMineEnergyCost) * Math.max(0, Math.floor(mineCount)) * Math.max(0, energyCostMultiplier);
