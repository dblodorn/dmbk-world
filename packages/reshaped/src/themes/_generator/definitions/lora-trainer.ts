import generateColors from "themes/_generator/tokens/color/utilities/generateColors";

import reshapedDefinition from "./reshaped";

import type { PassedThemeDefinition } from "themes/_generator/tokens/types";

const theme: PassedThemeDefinition = {
  ...reshapedDefinition,
  color: generateColors({
    primary: { oklch: { l: 0, c: 0, h: 0 } },
    critical: { oklch: { l: 0.3, c: 0, h: 0 } },
    warning: { oklch: { l: 0.5, c: 0, h: 0 } },
    positive: { oklch: { l: 0.2, c: 0, h: 0 } },
    neutral: { oklch: { l: 0.92, c: 0, h: 0 } },
    brand: { oklch: { l: 0, c: 0, h: 0 } },
  }),
  fontFamily: {
    body: {
      family: "FFF Forward, Arial, Helvetica, sans-serif",
    },
    title: {
      family: "FFF Forward, Arial, Helvetica, sans-serif",
    },
  },
  radius: {
    small: { px: 0 },
    medium: { px: 0 },
    large: { px: 0 },
  },
};

export default theme;
