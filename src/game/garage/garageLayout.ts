export interface GaragePoint { x: number; y: number }
export interface GarageRect { x: number; y: number; width: number; height: number }
export interface GarageLayout {
  safe: number;
  compact: boolean;
  uiScale: number;
  cardWidth: number;
  cardHeight: number;
  workbenchTopPadding: number;
  dockActionHeight: number;
  dockActionGap: number;
  dockCenters: GaragePoint[];
  stationCenters: GaragePoint[];
  stationWidth: number;
  stationHeight: number;
  configTerminal: GarageRect;
  walletTerminal: GarageRect;
  operatorPreview: GarageRect;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export const calculateGarageLayout = (width: number, height: number): GarageLayout => {
  const safe = Math.round(clamp(Math.min(width, height) * 0.022, 10, 22));
  const compact = width < 1050 || height < 700;
  const uiScale = compact
    ? clamp(Math.min(width / 900, height / 620), 0.72, 1)
    : clamp(Math.min(width / 1920, height / 1080), 0.72, 1.22);
  const dockGap = compact ? clamp(width * 0.009, 6, 13) : clamp(15 * uiScale, 10, 19);
  const compactCardMaximum = height < 540 ? 98 : 118;
  const availableCardWidth = (width - safe * 2 - dockGap * 4) / 5;
  const desiredDesktopCardWidth = Math.min(width * 0.107, height * 0.19);
  const cardWidth = Math.floor(compact
    ? clamp(availableCardWidth, 84, compactCardMaximum)
    : Math.min(availableCardWidth, clamp(desiredDesktopCardWidth, 132, 240)));
  const cardHeight = Math.round(cardWidth * 1.4);
  const workbenchTopPadding = compact
    ? height < 540 ? 18 : 31
    : clamp(cardWidth * 0.34, 48, 76);
  const dockActionHeight = compact ? 40 : Math.round(clamp(48 * uiScale, 42, 58));
  const dockActionGap = compact ? 11 : Math.round(clamp(14 * uiScale, 11, 17));
  const totalDockWidth = cardWidth * 5 + dockGap * 4;
  const dockStartX = (width - totalDockWidth) / 2 + cardWidth / 2;
  const preferredDockY = clamp(height * (compact ? 0.56 : 0.565), 224, height - 128);
  const stationGap = clamp(width * 0.01, 6, 14);
  const stationWidth = Math.floor(clamp(
    (width - safe * 2 - stationGap * 4) / 5,
    96,
    compact ? 190 : clamp(250 * uiScale, 190, 290)
  ));
  const stationHeight = compact ? 40 : Math.round(clamp(54 * uiScale, 46, 64));
  const totalStationWidth = stationWidth * 5 + stationGap * 4;
  const stationStartX = (width - totalStationWidth) / 2 + stationWidth / 2;
  const terminalWidth = Math.floor(compact
    ? clamp(width * 0.27, 138, 224)
    : clamp(width * 0.275, 320, 550));
  const terminalHeight = compact
    ? Math.round(clamp(height * 0.21, 116, 132))
    : Math.round(clamp(height * 0.285, 200, 320));
  const terminalY = Math.round(compact
    ? clamp(height * 0.17, 82, 96)
    : clamp(height * 0.115, 96, 160));
  const terminalInset = safe + Math.round(compact ? 6 : clamp(width * 0.032, 28, 62));
  const stationY = height - safe - stationHeight / 2;
  const stationHousingTop = stationY - (stationHeight + 14) / 2;
  const terminalMountOverflow = 8;
  const workbenchTerminalGap = compact ? 4 : 12;
  const minimumDockY = terminalY + terminalHeight + terminalMountOverflow + workbenchTerminalGap + cardHeight / 2 + workbenchTopPadding;
  const maximumDockY = stationHousingTop - (compact ? 6 : 16) - cardHeight / 2 - dockActionGap - dockActionHeight;
  const dockY = clamp(Math.max(
    preferredDockY,
    minimumDockY
  ), 224, Math.max(224, maximumDockY));
  const previewWidth = Math.floor(clamp(width * (compact ? 0.22 : 0.27), 150, compact ? 270 : 510));
  const previewHeight = compact ? 96 : Math.round(clamp(height * 0.26, 140, 285));
  return {
    safe,
    compact,
    uiScale,
    cardWidth,
    cardHeight,
    workbenchTopPadding,
    dockActionHeight,
    dockActionGap,
    dockCenters: Array.from({ length: 5 }, (_, index) => ({ x: dockStartX + index * (cardWidth + dockGap), y: dockY })),
    stationCenters: Array.from({ length: 5 }, (_, index) => ({ x: stationStartX + index * (stationWidth + stationGap), y: stationY })),
    stationWidth,
    stationHeight,
    configTerminal: { x: terminalInset, y: terminalY, width: terminalWidth, height: terminalHeight },
    walletTerminal: { x: width - terminalInset - terminalWidth, y: terminalY, width: terminalWidth, height: terminalHeight },
    operatorPreview: { x: width / 2 - previewWidth / 2, y: compact ? 76 : Math.max(88, terminalY - 10), width: previewWidth, height: previewHeight }
  };
};
