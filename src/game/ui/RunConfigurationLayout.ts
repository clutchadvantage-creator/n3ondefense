export type RunConfigurationDensity = 'compressed' | 'compact' | 'standard';

export interface RunConfigurationTypography {
  runFee: number;
  introduction: number;
  selection: number;
  selectionDescription: number;
  selectionMarker: number;
  walletValue: number;
  monitorTitle: number;
  diagnosticLabel: number;
  diagnosticValue: number;
  summary: number;
  summaryStatus: number;
  channel: number;
}

export interface RunConfigurationConsoleLayout {
  density: RunConfigurationDensity;
  compact: boolean;
  leftX: number;
  rightX: number;
  columnWidth: number;
  outerMargin: number;
  columnGap: number;
  statusY: number;
  statusHeight: number;
  panelTop: number;
  panelBottom: number;
  selectionStartY: number;
  selectionBottomY: number;
  signalGap: number;
  contractGap: number;
  monitorTop: number;
  monitorHeight: number;
  bottomSummaryY: number;
  summaryHeight: number;
  typography: RunConfigurationTypography;
}

const TYPOGRAPHY: Record<RunConfigurationDensity, RunConfigurationTypography> = {
  compressed: {
    runFee: 14,
    introduction: 14,
    selection: 13,
    selectionDescription: 15,
    selectionMarker: 12,
    walletValue: 13,
    monitorTitle: 11,
    diagnosticLabel: 12,
    diagnosticValue: 16,
    summary: 14,
    summaryStatus: 13,
    channel: 10
  },
  compact: {
    runFee: 16,
    introduction: 16,
    selection: 14,
    selectionDescription: 18,
    selectionMarker: 13,
    walletValue: 14,
    monitorTitle: 12,
    diagnosticLabel: 14,
    diagnosticValue: 18,
    summary: 16,
    summaryStatus: 15,
    channel: 11
  },
  standard: {
    runFee: 18,
    introduction: 18,
    selection: 18,
    selectionDescription: 21,
    selectionMarker: 15,
    walletValue: 18,
    monitorTitle: 15,
    diagnosticLabel: 16,
    diagnosticValue: 22,
    summary: 18,
    summaryStatus: 17,
    channel: 13
  }
};

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

/**
 * Divides the setup console into fixed-purpose vertical regions. Important text
 * keeps a readable floor; row and chart regions absorb viewport pressure.
 */
export const calculateRunConfigurationLayout = (
  width: number,
  height: number,
  signalRows = 6,
  contractRows = 4
): RunConfigurationConsoleLayout => {
  const density: RunConfigurationDensity = width < 1100 || height < 700
    ? 'compressed'
    : width < 1500 || height < 850
      ? 'compact'
      : 'standard';
  const compact = density !== 'standard';
  const outerMargin = density === 'compressed' ? 12 : compact ? 18 : 28;
  const columnGap = density === 'compressed' ? 10 : compact ? 18 : 24;
  const columnWidth = (width - outerMargin * 2 - columnGap) * 0.5;
  const leftX = outerMargin + columnWidth * 0.5;
  const rightX = width - outerMargin - columnWidth * 0.5;

  const statusY = density === 'compressed' ? 103 : compact ? 124 : 126;
  const statusHeight = density === 'compressed' ? 58 : compact ? 68 : 76;
  const panelTop = Math.round(statusY + statusHeight * 0.5 + (density === 'compressed' ? 8 : compact ? 12 : 16));
  const summaryHeight = density === 'compressed' ? 64 : compact ? 76 : 88;
  const bottomMargin = density === 'compressed' ? 8 : compact ? 10 : 12;
  const bottomSummaryY = height - bottomMargin - summaryHeight * 0.5;
  const summaryTop = bottomSummaryY - summaryHeight * 0.5;
  const monitorHeight = density === 'compressed'
    ? clamp(height * 0.14, 86, 96)
    : compact
      ? clamp(height * 0.151, 108, 124)
      : clamp(height * 0.16, 140, 172);
  const monitorGap = density === 'compressed' ? 10 : compact ? 12 : 16;
  const monitorTop = summaryTop - monitorGap - monitorHeight;
  const panelBottom = summaryTop - (density === 'compressed' ? 6 : 10);
  const selectionStartY = panelTop + (density === 'compressed' ? 96 : compact ? 110 : 130);
  const selectionBottomY = monitorTop - (density === 'compressed' ? 8 : 12);
  const selectionHeight = Math.max(1, selectionBottomY - selectionStartY);
  const signalGap = clamp(selectionHeight / Math.max(1, signalRows), density === 'compressed' ? 38 : compact ? 44 : 54, compact ? 66 : 82);
  const contractGap = clamp(selectionHeight / Math.max(1, contractRows), density === 'compressed' ? 58 : compact ? 70 : 82, compact ? 88 : 114);

  return {
    density,
    compact,
    leftX,
    rightX,
    columnWidth,
    outerMargin,
    columnGap,
    statusY,
    statusHeight,
    panelTop,
    panelBottom,
    selectionStartY,
    selectionBottomY,
    signalGap,
    contractGap,
    monitorTop,
    monitorHeight,
    bottomSummaryY,
    summaryHeight,
    typography: TYPOGRAPHY[density]
  };
};
