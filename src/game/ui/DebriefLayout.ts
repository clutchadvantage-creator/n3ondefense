export interface DebriefRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DebriefLayout {
  viewportWidth: number;
  viewportHeight: number;
  compact: boolean;
  panel: DebriefRect;
  header: DebriefRect;
  primary: DebriefRect;
  actions: DebriefRect;
}

export interface DebriefPrimarySections {
  rewards: DebriefRect;
  operation: DebriefRect;
  highlight: DebriefRect;
}

export const calculateDebriefLayout = (viewportWidth: number, viewportHeight: number): DebriefLayout => {
  const safeWidth = Math.max(480, viewportWidth);
  const safeHeight = Math.max(520, viewportHeight);
  const compact = viewportHeight < 760 || viewportWidth < 980;
  const outerMargin = compact ? 12 : 22;
  const panelWidth = Math.min(1240, safeWidth - outerMargin * 2);
  const panelHeight = Math.min(920, safeHeight - outerMargin * 2);
  const panelX = (viewportWidth - panelWidth) / 2;
  const panelY = (viewportHeight - panelHeight) / 2;
  const inset = compact ? 18 : 28;
  const headerHeight = compact ? 94 : 124;
  const columnGap = compact ? 15 : 24;
  const actionWidth = Math.min(compact ? 260 : 330, Math.max(180, panelWidth * (compact ? 0.31 : 0.29)));
  const contentTop = panelY + headerHeight;
  const contentHeight = panelHeight - headerHeight - inset;
  const primaryWidth = panelWidth - inset * 2 - columnGap - actionWidth;

  return {
    viewportWidth,
    viewportHeight,
    compact,
    panel: { x: panelX, y: panelY, width: panelWidth, height: panelHeight },
    header: { x: panelX + inset, y: panelY + 10, width: panelWidth - inset * 2, height: headerHeight - 16 },
    primary: { x: panelX + inset, y: contentTop, width: primaryWidth, height: contentHeight },
    actions: { x: panelX + inset + primaryWidth + columnGap, y: contentTop, width: actionWidth, height: contentHeight }
  };
};

export const splitDebriefPrimary = (rect: DebriefRect, compact: boolean): DebriefPrimarySections => {
  const gap = compact ? 10 : 14;
  const rewardHeight = Math.max(compact ? 130 : 180, Math.min(compact ? 176 : 220, rect.height * 0.29));
  const highlightHeight = compact ? 112 : 126;
  const operationHeight = rect.height - rewardHeight - highlightHeight - gap * 2;
  return {
    rewards: { x: rect.x, y: rect.y, width: rect.width, height: rewardHeight },
    operation: { x: rect.x, y: rect.y + rewardHeight + gap, width: rect.width, height: operationHeight },
    highlight: { x: rect.x, y: rect.y + rewardHeight + gap + operationHeight + gap, width: rect.width, height: highlightHeight }
  };
};
