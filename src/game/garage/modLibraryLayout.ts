export interface ModLibraryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModLibraryLayout {
  compact: boolean;
  safe: number;
  toolbarY: number;
  toolbarHeight: number;
  toolbarButtonWidth: number;
  toolbarButtonHeight: number;
  grid: ModLibraryRect;
  viewer: ModLibraryRect;
  gridContentTop: number;
  paginationY: number;
  rows: 3;
  columns: number;
  cardWidth: number;
  cardHeight: number;
  cardGapX: number;
  cardGapY: number;
  perPage: number;
}

export interface ModDatabaseTypography {
  dossierTitle: number;
  status: number;
  identityLabel: number;
  identityName: number;
  identityRowLabel: number;
  identityRowValue: number;
  sectionHeading: number;
  body: number;
  secondary: number;
  dataLabel: number;
  dataValue: number;
  table: number;
  lineSpacing: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/**
 * Pure responsive geometry for the System Database. The vertical capacity is
 * deliberately fixed at three rows; wider viewports gain columns, not a fourth
 * row, and spare height is invested back into readable card dimensions.
 */
export const calculateModLibraryLayout = (width: number, height: number): ModLibraryLayout => {
  const compact = width < 1500 || height < 850;
  const safe = clamp(Math.min(width, height) * 0.015, 10, 22);
  const toolbarY = compact ? 88 : 92;
  const toolbarHeight = compact ? 38 : 44;
  const contentTop = toolbarY + toolbarHeight / 2 + (compact ? 14 : 18);
  const contentBottom = height - safe;
  const viewerWidth = clamp(width * 0.365, 430, 620);
  const sectionGap = compact ? 10 : 16;
  const viewer: ModLibraryRect = {
    x: width - safe - viewerWidth,
    y: contentTop,
    width: viewerWidth,
    height: contentBottom - contentTop
  };
  const grid: ModLibraryRect = {
    x: safe,
    y: contentTop,
    width: viewer.x - sectionGap - safe,
    height: contentBottom - contentTop
  };
  const gridPadding = compact ? 10 : 14;
  const gridHeaderHeight = compact ? 27 : 32;
  const paginationHeight = compact ? 43 : 50;
  const cardGapX = compact ? 8 : 11;
  const cardGapY = compact ? 8 : 11;
  const cardAreaHeight = Math.max(300, grid.height - gridHeaderHeight - paginationHeight - gridPadding * 2);
  const heightLimitedCardWidth = (cardAreaHeight - cardGapY * 2) / 3 / 1.4;
  const preferredCardWidth = clamp(width * 0.098, compact ? 122 : 145, 190);
  const cardWidthTarget = Math.min(heightLimitedCardWidth, preferredCardWidth);
  const columns = Math.max(2, Math.floor((grid.width - gridPadding * 2 + cardGapX) / (cardWidthTarget + cardGapX)));
  const cardWidth = Math.min(
    cardWidthTarget,
    (grid.width - gridPadding * 2 - cardGapX * (columns - 1)) / columns
  );
  const cardHeight = cardWidth * 1.4;
  const gridContentTop = grid.y + gridHeaderHeight + gridPadding;
  const paginationY = grid.y + grid.height - paginationHeight / 2;
  return {
    compact,
    safe,
    toolbarY,
    toolbarHeight,
    toolbarButtonWidth: clamp((grid.width - (compact ? 30 : 46)) / 4, 112, 190),
    toolbarButtonHeight: compact ? 34 : 40,
    grid,
    viewer,
    gridContentTop,
    paginationY,
    rows: 3,
    columns,
    cardWidth,
    cardHeight,
    cardGapX,
    cardGapY,
    perPage: columns * 3
  };
};

/** Typography is width-aware but deliberately independent of viewport height.
 * A shorter dossier shows fewer lines and scrolls; it never shrinks its facts. */
export const calculateModDatabaseTypography = (viewerWidth: number): ModDatabaseTypography => {
  const narrow = viewerWidth < 540;
  return {
    dossierTitle: narrow ? 14 : 16,
    status: narrow ? 14 : 16,
    identityLabel: narrow ? 14 : 16,
    identityName: narrow ? 20 : 23,
    identityRowLabel: narrow ? 13 : 15,
    identityRowValue: narrow ? 15 : 17,
    sectionHeading: narrow ? 16 : 18,
    body: narrow ? 16 : 18,
    secondary: narrow ? 14 : 16,
    dataLabel: narrow ? 14 : 15,
    dataValue: narrow ? 16 : 18,
    table: narrow ? 14 : 15,
    lineSpacing: narrow ? 4 : 5
  };
};

export const getModLibraryPageCount = (itemCount: number, perPage: number): number =>
  Math.max(1, Math.ceil(Math.max(0, itemCount) / Math.max(1, perPage)));

export const clampModLibraryPage = (page: number, itemCount: number, perPage: number): number =>
  clamp(Math.floor(page), 0, getModLibraryPageCount(itemCount, perPage) - 1);

export interface ModLibraryPageSlice<T> {
  page: number;
  pageCount: number;
  entries: T[];
  selectedId: string;
}

export const resolveModLibraryPage = <T>(
  entries: readonly T[],
  requestedPage: number,
  perPage: number,
  selectedId: string,
  getId: (entry: T) => string
): ModLibraryPageSlice<T> => {
  const page = clampModLibraryPage(requestedPage, entries.length, perPage);
  const pageCount = getModLibraryPageCount(entries.length, perPage);
  const pageEntries = entries.slice(page * perPage, (page + 1) * perPage);
  return {
    page,
    pageCount,
    entries: pageEntries,
    selectedId: pageEntries.some((entry) => getId(entry) === selectedId) ? selectedId : pageEntries[0] ? getId(pageEntries[0]) : ''
  };
};
