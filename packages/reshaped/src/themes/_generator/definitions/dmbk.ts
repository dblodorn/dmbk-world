import generateColors from "themes/_generator/tokens/color/utilities/generateColors";

import reshapedDefinition from "./reshaped";

import type { PassedThemeDefinition } from "themes/_generator/tokens/types";

const theme: PassedThemeDefinition = {
  ...reshapedDefinition,
  color: generateColors({ primary: "#2563eb" }),
  fontFamily: {
    body: { family: "Arial, Helvetica, sans-serif" },
    title: { family: "Arial, Helvetica, sans-serif" },
  },
  radius: {
    small: { px: 0 },
    medium: { px: 0 },
    large: { px: 0 },
  },
};

export default theme;
