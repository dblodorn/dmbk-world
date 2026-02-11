export default {
  plugins: {
    "@csstools/postcss-global-data": {
      files: ["../../packages/reshaped/src/themes/lora-trainer/media.css"],
    },
    "postcss-custom-media": {},
    cssnano: { preset: ["default", { calc: false }] },
  },
};
