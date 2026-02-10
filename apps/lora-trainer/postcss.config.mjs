export default {
  plugins: {
    "@csstools/postcss-global-data": {
      files: ["./src/themes/dmbk/media.css"],
    },
    "postcss-custom-media": {},
    cssnano: { preset: ["default", { calc: false }] },
  },
};
