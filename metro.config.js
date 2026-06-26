const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const existing = config.resolver.blockList;
const extraPattern = /.*[\\/]\.local[\\/].*/;

config.resolver.blockList = Array.isArray(existing)
  ? [...existing, extraPattern]
  : existing
  ? [existing, extraPattern]
  : [extraPattern];

module.exports = config;
