// Stock Expo Metro config.
//
// This file used to carry watchFolders, nodeModulesPaths and a hierarchical-lookup override to make
// an npm-workspace monorepo resolve. Every one of those was a source of build failures — a hidden
// expo-modules-core, a duplicate async-storage, a react-native pinned against the SDK. A single app
// needs none of it, and the right amount of Metro configuration here is none.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
