/** Brand orange — keep in sync with `--brand-orange` in `app/globals.css`. */
export const BRAND = {
  orange: '#f97316',
  orangeHover: '#fb923c',
  orangeSelected: '#ea580c',
  orangeSoft: '#ffedd5',
  orangeDeep: '#c2410c',
  clusterSmall: '#fdba74',
  clusterMedium: '#c2410c',
  clusterLarge: '#7c2d12',
  clusterStroke: '#ffffff',
  clusterText: '#ffffff',
  clusterTextOnSmall: '#431407',
} as const;

export type BrandColor = (typeof BRAND)[keyof typeof BRAND];
