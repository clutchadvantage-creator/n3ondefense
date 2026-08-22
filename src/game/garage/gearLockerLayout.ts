export interface GearLockerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GearLockerLayout {
  compact: boolean;
  safe: number;
  titleY: number;
  categoryY: number;
  categoryHeight: number;
  categoryLeft: number;
  categoryRight: number;
  categoryArrowWidth: number;
  visibleCategoryCount: number;
  inventory: GearLockerRect;
  preview: GearLockerRect;
  footerY: number;
  footerHeight: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const calculateGearLockerLayout = (
  width: number,
  height: number,
  categoryCount: number
): GearLockerLayout => {
  const compact = width < 1120 || height < 760;
  const safe = compact ? 12 : clamp(width * 0.012, 16, 24);
  const titleY = compact ? 48 : 62;
  const categoryY = compact ? 118 : 142;
  const categoryHeight = compact ? 46 : 58;
  const categoryArrowWidth = compact ? 46 : 56;
  const categoryLeft = safe + 28;
  const categoryRight = width - safe - 28;
  const tabSpace = categoryRight - categoryLeft - categoryArrowWidth * 2 - (compact ? 18 : 28);
  const minimumTabWidth = compact ? 118 : 146;
  const visibleCategoryCount = clamp(Math.floor(tabSpace / minimumTabWidth), 3, categoryCount);
  const contentTop = categoryY + categoryHeight / 2 + (compact ? 36 : 48);
  const footerHeight = compact ? 50 : 62;
  const footerY = height - safe - footerHeight / 2;
  const contentBottom = footerY - footerHeight / 2 - (compact ? 10 : 14);
  const previewWidth = clamp(width * 0.265, compact ? 270 : 340, compact ? 360 : 470);
  const contentGap = compact ? 12 : 20;
  const contentLeft = safe + (compact ? 10 : 18);
  const contentRight = width - safe - (compact ? 10 : 18);
  const inventoryWidth = contentRight - contentLeft - previewWidth - contentGap;

  return {
    compact,
    safe,
    titleY,
    categoryY,
    categoryHeight,
    categoryLeft,
    categoryRight,
    categoryArrowWidth,
    visibleCategoryCount,
    inventory: {
      x: contentLeft,
      y: contentTop,
      width: inventoryWidth,
      height: Math.max(280, contentBottom - contentTop)
    },
    preview: {
      x: contentLeft + inventoryWidth + contentGap,
      y: contentTop,
      width: previewWidth,
      height: Math.max(280, contentBottom - contentTop)
    },
    footerY,
    footerHeight
  };
};

