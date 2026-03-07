// Design tokens for the Geist Pixel shell.
// Dark only. One accent. No shadows, no gradients.

export const colors = {
  bg: "#0b0c10",
  panel: "#13141a",
  line: "#26272f",
  text: "#e6e7eb",
  muted: "#9a9ba3",
  accent: "#7c5cff",
  accentPressed: "#6a4be0",
  accentInk: "#0b0c10",
  danger: "#ff6b6b",
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = 8;
export const border = 1;
export const hitSize = 40;
export const controlHeight = 48;

// Geist Pixel ships at weight 400 only. Never set a weight on it.
export const fonts = {
  pixel: "GeistPixel",
  light: "GeistLight",
  regular: "GeistRegular",
  medium: "GeistMedium",
  semibold: "GeistSemiBold",
};

export const fontFiles = {
  GeistLight: require("../assets/fonts/Geist-Light.ttf"),
  GeistRegular: require("../assets/fonts/Geist-Regular.ttf"),
  GeistMedium: require("../assets/fonts/Geist-Medium.ttf"),
  GeistSemiBold: require("../assets/fonts/Geist-SemiBold.ttf"),
  GeistPixel: require("../assets/fonts/GeistPixel-Square.ttf"),
};

export const type = {
  brand: {
    fontFamily: fonts.pixel,
    fontSize: 20,
    letterSpacing: 1,
    color: colors.text,
    maxFontSizeMultiplier: 1.3,
  },
  heading: {
    fontFamily: fonts.pixel,
    fontSize: 16,
    letterSpacing: 1,
    color: colors.text,
    maxFontSizeMultiplier: 1.3,
  },
  button: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    letterSpacing: 1,
    maxFontSizeMultiplier: 1.2,
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
    maxFontSizeMultiplier: 1.3,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  muted: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  amount: {
    fontFamily: fonts.semibold,
    fontSize: 44,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  amountSmall: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
};
