// Metro in an npm-workspaces monorepo.
//
// Without this, bundling fails the moment an app imports @jclinic-mobile/api-client: Metro's
// default watch root is the app directory, so it cannot see ../../packages, and it resolves
// modules only from the app's own node_modules — while npm hoists nearly everything to the repo
// root. Both halves have to be told about the workspace explicitly.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so edits in packages/* trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve from the app first, then the hoisted root. Order matters: an app-local version of a
//    package must win over the hoisted one.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Hierarchical lookup stays ON — deliberately, and this is npm-specific.
//    The Expo monorepo docs suggest disableHierarchicalLookup for pnpm/yarn, where every dependency
//    is reachable from a single flat store. npm does not work that way: it NESTS on version
//    conflict, and it nests expo-modules-core under node_modules/expo/node_modules. Disabling the
//    walk makes that copy invisible and the bundle dies with "Unable to resolve module
//    expo-modules-core from expo/src/Expo.ts" — which is exactly what happened here before this
//    comment existed.
//
//    The duplicate-React risk that setting guards against is handled by nodeModulesPaths above
//    listing the app first, so an app-local copy always wins over anything found further up.

module.exports = config;
