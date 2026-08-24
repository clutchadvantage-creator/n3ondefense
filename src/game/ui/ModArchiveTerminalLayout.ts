export interface ModArchiveRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModArchiveTerminalLayout {
  frame: ModArchiveRect;
  bay: ModArchiveRect;
  pagination: ModArchiveRect;
  cardWidth: number;
  cardHeight: number;
  cardGapX: number;
  cardGapY: number;
  cardGridLeft: number;
  cardGridTop: number;
  columns: number;
  rows: 2;
  perPage: number;
  previousButtonX: number;
  nextButtonX: number;
  pageButtonWidth: number;
  pageButtonHeight: number;
  pageReadoutX: number;
  pageReadoutWidth: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/**
 * Sizes the archive around two rows of the existing readable cards instead of
 * stretching a panel to the bottom of the viewport. Vertical clamping only
 * engages on short desktop windows where two full 148px cards cannot fit.
 */
export const calculateModArchiveTerminalLayout = (
  viewportWidth: number,
  viewportHeight: number,
  contentTop: number,
  detailWidth: number
): ModArchiveTerminalLayout => {
  const compact = viewportWidth < 920 || viewportHeight < 690;
  const archiveAreaLeft = 20;
  const archiveAreaRight = viewportWidth - detailWidth - 50;
  const availableWidth = Math.max(360, archiveAreaRight - archiveAreaLeft);
  const availableHeight = Math.max(360, viewportHeight - contentTop - 16);
  const headerHeight = compact ? 34 : 38;
  const sidePadding = compact ? 12 : 16;
  const bayTopPadding = compact ? 4 : 7;
  const bayBottomPadding = compact ? 5 : 8;
  const cardGapX = compact ? 10 : 14;
  const cardGapY = compact ? 7 : 12;
  const paginationGap = compact ? 5 : 7;
  const paginationHeight = compact ? 40 : 50;
  const frameBottomPadding = compact ? 5 : 7;

  // This is the same horizontal card-size rule the collection used before the
  // terminal refactor. At normal desktop resolutions it remains at 148px.
  const legacyGridLeft = 34;
  const legacyGridRight = viewportWidth - detailWidth - 46;
  const horizontalCardWidth = clamp((legacyGridRight - legacyGridLeft - 48) / 4, 112, 148);
  const fixedVertical = headerHeight + bayTopPadding + cardGapY + bayBottomPadding
    + paginationGap + paginationHeight + frameBottomPadding;
  const verticalCardWidth = (availableHeight - fixedVertical) / (2 * 1.4);
  const cardWidth = clamp(Math.min(horizontalCardWidth, verticalCardWidth), 112, 148);
  const cardHeight = cardWidth * 1.4;
  const columns = Math.max(2, Math.floor(
    (availableWidth - sidePadding * 2 + cardGapX) / (cardWidth + cardGapX)
  ));
  const gridWidth = columns * cardWidth + (columns - 1) * cardGapX;
  const gridHeight = cardHeight * 2 + cardGapY;
  const frameWidth = sidePadding * 2 + gridWidth;
  const frameHeight = headerHeight + bayTopPadding + gridHeight + bayBottomPadding
    + paginationGap + paginationHeight + frameBottomPadding;
  const frame: ModArchiveRect = { x: archiveAreaLeft, y: contentTop, width: frameWidth, height: frameHeight };
  const cardGridLeft = frame.x + sidePadding;
  const cardGridTop = frame.y + headerHeight + bayTopPadding;
  const bay: ModArchiveRect = {
    x: frame.x + 7,
    y: frame.y + headerHeight,
    width: frame.width - 14,
    height: bayTopPadding + gridHeight + bayBottomPadding
  };
  const pagination: ModArchiveRect = {
    x: frame.x + 7,
    y: bay.y + bay.height + paginationGap,
    width: frame.width - 14,
    height: paginationHeight
  };
  const pageButtonWidth = clamp(frame.width * 0.14, compact ? 84 : 104, 138);
  const pageButtonHeight = compact ? 34 : 42;
  const pageInset = compact ? 12 : 18;
  const pageReadoutWidth = clamp(frame.width * 0.32, 190, 320);

  return {
    frame,
    bay,
    pagination,
    cardWidth,
    cardHeight,
    cardGapX,
    cardGapY,
    cardGridLeft,
    cardGridTop,
    columns,
    rows: 2,
    perPage: columns * 2,
    previousButtonX: pagination.x + pageInset + pageButtonWidth / 2,
    nextButtonX: pagination.x + pagination.width - pageInset - pageButtonWidth / 2,
    pageButtonWidth,
    pageButtonHeight,
    pageReadoutX: pagination.x + pagination.width / 2,
    pageReadoutWidth
  };
};

export const getModArchivePageCount = (itemCount: number, perPage: number): number =>
  Math.max(1, Math.ceil(Math.max(0, itemCount) / Math.max(1, perPage)));
