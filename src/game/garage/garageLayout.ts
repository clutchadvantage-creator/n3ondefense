export interface GaragePoint { x: number; y: number }
export interface GarageRect { x: number; y: number; width: number; height: number }
export interface GarageLayout {
  safe: number;
  compact: boolean;
  cardWidth: number;
  cardHeight: number;
  dockCenters: GaragePoint[];
  stationCenters: GaragePoint[];
  stationWidth: number;
  configTerminal: GarageRect;
  walletTerminal: GarageRect;
  operatorPreview: GarageRect;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export const calculateGarageLayout = (width: number, height: number): GarageLayout => {
  const safe = Math.round(clamp(Math.min(width, height) * 0.022, 10, 22));
  const compact = width < 900 || height < 620;
  const spacious = width >= 1200 && height >= 720;
  const dockGap = clamp(width * 0.009, 6, 13);
  const cardWidth = Math.floor(clamp((width - safe * 2 - dockGap * 4) / 5, 84, compact ? 118 : 132));
  const cardHeight = Math.round(cardWidth * 1.4);
  const totalDockWidth = cardWidth * 5 + dockGap * 4;
  const dockStartX = (width - totalDockWidth) / 2 + cardWidth / 2;
  const preferredDockY = clamp(height * (compact ? 0.56 : 0.52), 224, height - 128);
  const stationGap = clamp(width * 0.01, 6, 14);
  const stationWidth = Math.floor(clamp((width - safe * 2 - stationGap * 4) / 5, 96, 190));
  const totalStationWidth = stationWidth * 5 + stationGap * 4;
  const stationStartX = (width - totalStationWidth) / 2 + stationWidth / 2;
  const terminalWidth = Math.floor(compact
    ? clamp(width * 0.27, 138, 224)
    : clamp(width * 0.255, 280, spacious ? 400 : 320));
  const terminalHeight = compact ? Math.round(clamp(height * 0.21, 116, 132)) : Math.round(spacious ? clamp(height * 0.225, 210, 244) : 190);
  const terminalY = Math.round(compact ? clamp(height * 0.17, 82, 96) : spacious ? clamp(height * 0.11, 106, 124) : clamp(height * 0.14, 90, 104));
  const terminalInset = safe + Math.round(compact ? 6 : clamp(width * 0.025, 20, 48));
  const dockY = clamp(Math.max(
    preferredDockY,
    terminalY + terminalHeight + cardHeight / 2 + (compact ? 24 : 28)
  ), 224, height - 128);
  const previewWidth = Math.floor(clamp(width * (spacious ? 0.25 : 0.22), 150, spacious ? 340 : 270));
  const previewHeight = compact ? 96 : Math.round(spacious ? clamp(height * 0.205, 174, 200) : 138);
  return {
    safe,
    compact,
    cardWidth,
    cardHeight,
    dockCenters: Array.from({ length: 5 }, (_, index) => ({ x: dockStartX + index * (cardWidth + dockGap), y: dockY })),
    stationCenters: Array.from({ length: 5 }, (_, index) => ({ x: stationStartX + index * (stationWidth + stationGap), y: height - safe - 20 })),
    stationWidth,
    configTerminal: { x: terminalInset, y: terminalY, width: terminalWidth, height: terminalHeight },
    walletTerminal: { x: width - terminalInset - terminalWidth, y: terminalY, width: terminalWidth, height: terminalHeight },
    operatorPreview: { x: width / 2 - previewWidth / 2, y: spacious ? 88 : 76, width: previewWidth, height: previewHeight }
  };
};
