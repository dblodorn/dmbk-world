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
        small: { px: 0 },
        medium: { px: 0 },
        large: { px: 0 },
      },
    },
  },
};

module.exports = config;
