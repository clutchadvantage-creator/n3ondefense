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
  diagnostics: ModArchiveRect | null;
  lowerConsole: ModArchiveRect;
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
 * Builds one persistent wall-mounted workstation around two rows of readable
 * cards. The physical terminal fills the available archive workspace while
 * decoration yields first on short windows so card readability remains the
 * final thing that scales down.
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
  const bayTopPadding = 4;
  const bayBottomPadding = 4;
  const cardGapX = compact ? 10 : 14;
  const cardGapY = compact ? 7 : 12;
  const paginationGap = 5;
  const minimumPaginationHeight = compact ? 44 : 56;
  const frameBottomPadding = compact ? 5 : 7;

  // This is the same horizontal card-size rule the collection used before the
  // terminal refactor. At normal desktop resolutions it remains at 148px.
  const legacyGridLeft = 34;
  const legacyGridRight = viewportWidth - detailWidth - 46;
  const horizontalCardWidth = clamp((legacyGridRight - legacyGridLeft - 48) / 4, 112, 148);
  const fixedVertical = headerHeight + bayTopPadding + cardGapY + bayBottomPadding
    + paginationGap + minimumPaginationHeight + frameBottomPadding;
  const verticalCardWidth = (availableHeight - fixedVertical) / (2 * 1.4);
  const cardWidth = clamp(Math.min(horizontalCardWidth, verticalCardWidth), 112, 148);
  const cardHeight = cardWidth * 1.4;
  const columns = Math.max(2, Math.floor(
    (availableWidth - sidePadding * 2 + cardGapX) / (cardWidth + cardGapX)
  ));
  const gridWidth = columns * cardWidth + (columns - 1) * cardGapX;
  const gridHeight = cardHeight * 2 + cardGapY;
  const frameWidth = availableWidth;
  const frameHeight = availableHeight;
  const frame: ModArchiveRect = { x: archiveAreaLeft, y: contentTop, width: frameWidth, height: frameHeight };
  const cardGridLeft = frame.x + sidePadding;
  const cardGridTop = frame.y + headerHeight + bayTopPadding;
  const bay: ModArchiveRect = {
    x: frame.x + 7,
    y: frame.y + headerHeight,
    width: frame.width - 14,
    height: bayTopPadding + gridHeight + bayBottomPadding
  };
  const remainingAfterBay = Math.max(0, frame.height - headerHeight - bay.height - paginationGap - frameBottomPadding);
  const preferredPaginationHeight = availableHeight >= 760 ? 82 : availableHeight >= 630 ? 72 : minimumPaginationHeight;
  const preferredLowerHeight = availableHeight >= 760 ? 170 : availableHeight >= 630 ? 68 : 0;
  const paginationHeight = clamp(
    remainingAfterBay - preferredLowerHeight,
    minimumPaginationHeight,
    preferredPaginationHeight
  );
  const pagination: ModArchiveRect = {
    x: frame.x + 7,
    y: bay.y + bay.height + paginationGap,
    width: frame.width - 14,
    height: paginationHeight
  };
  const lowerTop = pagination.y + pagination.height + (remainingAfterBay > paginationHeight + 12 ? 7 : 0);
  const lowerConsole: ModArchiveRect = {
    x: frame.x + 7,
    y: lowerTop,
    width: frame.width - 14,
    height: Math.max(0, frame.y + frame.height - frameBottomPadding - lowerTop)
  };
  const diagnosticLeft = cardGridLeft + gridWidth + Math.max(8, cardGapX * 0.7);
  const diagnosticRight = frame.x + frame.width - sidePadding;
  // Do not fill leftover space with unreadable 7-8px diagnostic text. The
  // optional bay appears only when it has enough width for useful telemetry.
  const diagnostics = diagnosticRight - diagnosticLeft >= 88 ? {
    x: diagnosticLeft,
    y: cardGridTop,
    width: diagnosticRight - diagnosticLeft,
    height: gridHeight
  } : null;
  const pageButtonWidth = clamp(frame.width * 0.14, compact ? 92 : 112, 160);
  const pageButtonHeight = compact ? 38 : 46;
  const pageInset = compact ? 14 : 22;
  const pageReadoutWidth = clamp(frame.width * 0.3, 210, 350);

  return {
    frame,
    bay,
    pagination,
    diagnostics,
    lowerConsole,
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
