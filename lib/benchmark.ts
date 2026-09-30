// Category × Measure × Tier benchmark targets, from Joyce's Lark sheet
// (LFEhs5Wf2hqDY9trLrilSLgAgAh, "Full Metrics"). Values stored ascending T1→T5.
// Tier rule (confirmed): this month's benchmark tier = the tier band LAST calendar month's
// GMV (L30D-equivalent monthly GMV) fell into, PLUS ONE (capped at T5). All measures for a
// brand are then benchmarked against that single tier column for the brand's category.

export type Category = 'Health' | 'Beauty' | 'Personal Care' | 'Fashion';
export type Tier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
export const TIERS: Tier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

// Each measure → [T1, T2, T3, T4, T5]  (ascending; sheet listed them T5…T1, reversed here).
type Row = Record<string, [number, number, number, number, number]>;
export const BENCHMARK: Record<Category, Row> = {
  Health: {
    'GMV (L30D)': [2618, 29711, 106797, 313899, 835373],
    'Hero Products': [0, 0, 1, 3, 6],
    'Free Shipping GMV%': [0.8331, 0.8992, 0.8039, 0.8963, 0.8616],
    '% 3BD Fulfill Pkg': [0.6, 0.6664, 0.645, 0.781, 0.6879],
    '% 3BD Fulfill Pkg - FBT': [0.8729, 0.877, 0.892, 0.9019, 0.8958],
    '% FBT Usage (Sub Order)': [0.6593, 0.7586, 0.6558, 0.7624, 0.5169],
    '% SNS GMV': [0.113, 0.2345, 0.2353, 0.3214, 0.3284],
    'CCR': [0.0122, 0.01, 0.0096, 0.0112, 0.0106],
    'Shop SPS (L30D Avg)': [4.2, 4.4, 4.5, 4.6, 4.6],
    'Seller Contents': [184, 279, 384, 454, 617],
    'Affiliate GMV%': [0.4261, 0.5076, 0.4779, 0.5134, 0.5772],
    'Creator Contents': [144, 783, 1226, 4355, 8722],
    'L3+ Creator Contents': [6, 47, 112, 350, 914],
    'Product CTR': [0.033, 0.031, 0.028, 0.03, 0.025],
    'C_O (SKU Order)': [0.017, 0.024, 0.03, 0.024, 0.025],
    'Free Samples Delivered': [82, 352, 485, 1116, 2366],
    'L3+ Free Sample Delivered': [2, 13, 26, 41, 109],
    'Ads Investment': [2860, 15992, 47874, 125123, 279567],
    'Ads % GMV': [0.7313, 0.5229, 0.4416, 0.3986, 0.3347],
  },
  Beauty: {
    'GMV (L30D)': [2728, 32598, 104572, 310876, 862531],
    'Hero Products': [0, 0, 1, 3, 7],
    'Free Shipping GMV%': [0.7524, 0.7595, 0.7334, 0.7375, 0.7591],
    '% 3BD Fulfill Pkg': [0.5378, 0.5635, 0.5591, 0.5697, 0.6255],
    '% 3BD Fulfill Pkg - FBT': [0.8629, 0.8556, 0.8785, 0.8814, 0.8855],
    '% FBT Usage (Sub Order)': [0.6962, 0.693, 0.5734, 0.5339, 0.5643],
    '% SNS GMV': [0.0206, 0.0704, 0.068, 0.0694, 0.1009],
    'CCR': [0.0134, 0.0118, 0.0121, 0.0124, 0.0137],
    'Shop SPS (L30D Avg)': [4, 4.2, 4.3, 4.4, 4.4],
    'Seller Contents': [156, 182, 229, 291, 232],
    'Affiliate GMV%': [0.4467, 0.523, 0.4866, 0.5372, 0.5483],
    'Creator Contents': [185, 812, 1585, 4201, 12305],
    'L3+ Creator Contents': [11, 68, 141, 474, 1111],
    'Product CTR': [0.028, 0.029, 0.028, 0.029, 0.03],
    'C_O (SKU Order)': [0.014, 0.021, 0.026, 0.027, 0.032],
    'Free Samples Delivered': [101, 338, 682, 1505, 5472],
    'L3+ Free Sample Delivered': [7, 31, 62, 191, 330],
    'Ads Investment': [2693, 14040, 33482, 98813, 275046],
    'Ads % GMV': [0.6404, 0.4161, 0.3042, 0.3148, 0.3189],
  },
  'Personal Care': {
    'GMV (L30D)': [2363, 30029, 107446, 318715, 926413],
    'Hero Products': [0, 0, 1, 3, 9],
    'Free Shipping GMV%': [0.773, 0.7946, 0.837, 0.8004, 0.787],
    '% 3BD Fulfill Pkg': [0.5966, 0.6102, 0.6189, 0.5789, 0.6212],
    '% 3BD Fulfill Pkg - FBT': [0.8632, 0.879, 0.8842, 0.8772, 0.9072],
    '% FBT Usage (Sub Order)': [0.6753, 0.6941, 0.6808, 0.6244, 0.7418],
    '% SNS GMV': [0.0351, 0.0568, 0.0754, 0.0482, 0.1046],
    'CCR': [0.0163, 0.0108, 0.0104, 0.0116, 0.0124],
    'Shop SPS (L30D Avg)': [4.1, 4.2, 4.4, 4.4, 4.4],
    'Seller Contents': [117, 182, 242, 298, 371],
    'Affiliate GMV%': [0.4572, 0.5632, 0.5707, 0.5251, 0.5983],
    'Creator Contents': [135, 795, 1507, 3253, 9670],
    'L3+ Creator Contents': [8, 70, 158, 397, 1209],
    'Product CTR': [0.027, 0.026, 0.026, 0.029, 0.027],
    'C_O (SKU Order)': [0.013, 0.021, 0.025, 0.028, 0.027],
    'Free Samples Delivered': [83, 336, 533, 1155, 3605],
    'L3+ Free Sample Delivered': [5, 35, 58, 117, 369],
    'Ads Investment': [2028, 13434, 34831, 98072, 296516],
    'Ads % GMV': [0.5482, 0.4299, 0.3164, 0.2992, 0.3114],
  },
  Fashion: {
    'GMV (L30D)': [2197, 31925, 106139, 310754, 871628],
    'Hero Products': [0, 0, 0, 1, 5],
    'Free Shipping GMV%': [0.5857, 0.5695, 0.6071, 0.5906, 0.7584],
    '% 3BD Fulfill Pkg': [0.4394, 0.4854, 0.446, 0.4914, 0.5421],
    '% 3BD Fulfill Pkg - FBT': [0.8014, 0.8589, 0.8224, 0.8399, 0.8681],
    '% FBT Usage (Sub Order)': [0.3785, 0.4283, 0.3812, 0.3646, 0.6012],
    '% SNS GMV': [0.0003, 0.0031, 0.0002, 0.0006, 0.0003],
    'CCR': [0.0129, 0.012, 0.0132, 0.0129, 0.0139],
    'Shop SPS (L30D Avg)': [4, 4.2, 4.2, 4.3, 4.3],
    'Seller Contents': [116, 180, 249, 238, 398],
    'Affiliate GMV%': [0.1875, 0.2752, 0.2833, 0.3623, 0.4795],
    'Creator Contents': [30, 345, 460, 1235, 3085],
    'L3+ Creator Contents': [3, 32, 84, 257, 837],
    'Product CTR': [0.028, 0.03, 0.033, 0.036, 0.033],
    'C_O (SKU Order)': [0.013, 0.021, 0.027, 0.027, 0.019],
    'Free Samples Delivered': [29, 118, 191, 536, 1015],
    'L3+ Free Sample Delivered': [4, 19, 44, 126, 324],
    'Ads Investment': [951, 4888, 13585, 41493, 114517],
    'Ads % GMV': [0.1602, 0.1144, 0.1083, 0.1238, 0.1314],
  },
};

// Benchmark tier from last month's GMV: highest band it reached, +1 (capped T5).
export function benchmarkTier(category: Category, lastMonthGmv: number): Tier {
  const bands = BENCHMARK[category]['GMV (L30D)']; // [T1..T5] ascending thresholds
  let achieved = 0; // 0 = below T1
  for (let i = 0; i < bands.length; i++) if (lastMonthGmv >= bands[i]) achieved = i + 1;
  const idx = Math.min(achieved + 1, 5); // +1 tier, cap at T5 (idx 1..5)
  return TIERS[idx - 1];
}

export function benchmarkValue(category: Category, measure: string, tier: Tier): number | null {
  const row = BENCHMARK[category][measure];
  if (!row) return null;
  return row[TIERS.indexOf(tier)];
}
