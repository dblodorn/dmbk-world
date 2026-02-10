const { generateThemeColors } = require("reshaped/themes");

const config = {
  themes: {
    dmbk: {
      color: generateThemeColors({ primary: "#2563eb" }),
      fontFamily: {
        body: { family: "Arial, Helvetica, sans-serif" },
        title: { family: "Arial, Helvetica, sans-serif" },
      },
      radius: {
        small: { px: 4 },
        medium: { px: 8 },
        large: { px: 12 },
      },
    },
  },
};

module.exports = config;
