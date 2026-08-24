module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo already includes the React Native preset and the expo-router plugin.
  return { presets: ['babel-preset-expo'] };
};
