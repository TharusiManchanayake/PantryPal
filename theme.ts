export const colors = {
  bg: '#F7FAF3',
  surface: '#FFFFFF',
  ink: '#1E2A1F',
  inkSoft: '#5C6B5C',
  primary: '#2F6B4F',
  primaryDark: '#234F3A',
  primarySoft: '#E4F0E7',
  amber: '#E2903F',
  amberSoft: '#FBEADA',
  red: '#D95C4A',
  redSoft: '#FBE2DD',
  line: '#E1E8DD',
  white: '#FFFFFF',
};

export const radius = { sm: 11, md: 14, lg: 16, xl: 20, pill: 999 };

export const categoryDefaults: Record<string, { emoji: string; days: number }> = {
  Dairy: { emoji: '🥛', days: 7 },
  Produce: { emoji: '🥦', days: 5 },
  Meat: { emoji: '🍖', days: 3 },
  Canned: { emoji: '🥫', days: 365 },
  Bakery: { emoji: '🍞', days: 4 },
  Frozen: { emoji: '❄️', days: 90 },
};

export function freshnessColor(daysLeft: number) {
  if (daysLeft <= 1) return colors.red;
  if (daysLeft <= 4) return colors.amber;
  return colors.primary;
}

export function freshnessColorSoft(daysLeft: number) {
  if (daysLeft <= 1) return colors.redSoft;
  if (daysLeft <= 4) return colors.amberSoft;
  return colors.primarySoft;
}