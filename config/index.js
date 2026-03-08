const { defineConfig } = require("@tarojs/cli");
const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");

// Always load .env (base defaults)
const baseEnv = path.resolve(__dirname, "../.env");
if (fs.existsSync(baseEnv)) dotenv.config({ path: baseEnv });

// Load .env.development if it exists (overrides base for local dev)
// Works regardless of NODE_ENV so weapp builds also pick up local addresses
const devEnv = path.resolve(__dirname, "../.env.development");
if (fs.existsSync(devEnv)) dotenv.config({ path: devEnv, override: true });

// Polyfill browser globals for Node.js environment during Taro H5 build
const g = globalThis;
if (typeof g.window === "undefined") g.window = g;
if (typeof g.document === "undefined") {
  g.document = {
    scripts: [], currentScript: null,
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    createElementNS: () => ({ style: {}, setAttribute: () => {} }),
    createTextNode: () => ({}),
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, getElementsByTagName: () => [],
    head: { appendChild: () => {}, removeChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {}, style: {} },
    addEventListener: () => {}, removeEventListener: () => {},
    documentElement: { style: {}, classList: { add: () => {}, remove: () => {}, contains: () => false } }
  };
}
if (typeof g.navigator === "undefined") g.navigator = { userAgent: "node", language: "zh-CN", platform: "node" };
if (typeof g.location === "undefined") g.location = { href: "/", pathname: "/", search: "", hash: "", origin: "http://localhost" };
if (typeof g.requestAnimationFrame === "undefined") g.requestAnimationFrame = (cb) => setTimeout(cb, 16);
if (typeof g.cancelAnimationFrame === "undefined") g.cancelAnimationFrame = clearTimeout;
if (typeof g.performance === "undefined") g.performance = { now: () => Date.now() };
if (typeof g.screen === "undefined") g.screen = { width: 375, height: 812 };
if (typeof g.history === "undefined") g.history = { pushState: () => {}, replaceState: () => {}, go: () => {} };
if (typeof g.matchMedia === "undefined") g.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
if (typeof g.CustomEvent === "undefined") g.CustomEvent = class CustomEvent { constructor(type, detail) { this.type = type; this.detail = detail; } };
if (typeof g.Event === "undefined") g.Event = class Event { constructor(type) { this.type = type; } };

module.exports = defineConfig({
  projectName: "gamevallies",
  date: "2026-3-5",
  designWidth: 500,
  deviceRatio: {
    640: 2.34 / 2,
    500: 1,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: "src",
  outputRoot: `dist/${process.env.TARO_ENV}`,
  plugins: ["@tarojs/plugin-framework-react"],
  framework: "react",
  compiler: "webpack5",
  cache: {
    enable: false,
  },
  mini: {
    webpackChain(chain) {
      const webpack = require("webpack");
      chain.plugin("process-env-define").use(webpack.DefinePlugin, [{
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
        "process.env.TARO_ENV": JSON.stringify("weapp"),
        "process.env.TARO_APP_AUTH_SERVICE_URL": JSON.stringify(process.env.TARO_APP_AUTH_SERVICE_URL || ""),
        "process.env.TARO_APP_GAME_SERVICE_URL": JSON.stringify(process.env.TARO_APP_GAME_SERVICE_URL || ""),
        "process.env.TARO_APP_SOCIAL_SERVICE_URL": JSON.stringify(process.env.TARO_APP_SOCIAL_SERVICE_URL || ""),
        "process.env.TARO_APP_FEED_SERVICE_URL": JSON.stringify(process.env.TARO_APP_FEED_SERVICE_URL || ""),
        "process.env.TARO_APP_AI_SERVICE_URL": JSON.stringify(process.env.TARO_APP_AI_SERVICE_URL || ""),
        "process.env.TARO_APP_WS_URL": JSON.stringify(process.env.TARO_APP_WS_URL || ""),
        "process.env.TARO_APP_GAME_CONTENT_URL": JSON.stringify(process.env.TARO_APP_GAME_CONTENT_URL || ""),
        "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || ""),
        "process.env.SEGMENT_WRITE_KEY": JSON.stringify(process.env.SEGMENT_WRITE_KEY || ""),
      }]);
    },
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: {
        enable: false,
        config: { namingPattern: "module_", generateScopedName: "[name]__[local]___[hash:base64:5]" },
      },
    },
    imageUrlLoaderOption: { limit: 15000 },
  },
  h5: {
    publicPath: "/",
    staticDirectory: "static",
    webpackChain(chain) {
      // Explicitly define all process.env.* vars used in src/config/env.js
      // so webpack replaces them at build time (process is not available in browser)
      const webpack = require("webpack");
      chain.plugin("process-env-define").use(webpack.DefinePlugin, [{
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
        "process.env.TARO_ENV": JSON.stringify(process.env.TARO_ENV || "h5"),
        "process.env.TARO_APP_AUTH_SERVICE_URL": JSON.stringify(process.env.TARO_APP_AUTH_SERVICE_URL || ""),
        "process.env.TARO_APP_GAME_SERVICE_URL": JSON.stringify(process.env.TARO_APP_GAME_SERVICE_URL || ""),
        "process.env.TARO_APP_SOCIAL_SERVICE_URL": JSON.stringify(process.env.TARO_APP_SOCIAL_SERVICE_URL || ""),
        "process.env.TARO_APP_FEED_SERVICE_URL": JSON.stringify(process.env.TARO_APP_FEED_SERVICE_URL || ""),
        "process.env.TARO_APP_AI_SERVICE_URL": JSON.stringify(process.env.TARO_APP_AI_SERVICE_URL || ""),
        "process.env.TARO_APP_WS_URL": JSON.stringify(process.env.TARO_APP_WS_URL || ""),
        "process.env.TARO_APP_GAME_CONTENT_URL": JSON.stringify(process.env.TARO_APP_GAME_CONTENT_URL || ""),
        "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || ""),
        "process.env.SEGMENT_WRITE_KEY": JSON.stringify(process.env.SEGMENT_WRITE_KEY || ""),
      }]);
      chain.set("ignoreWarnings", [
        { message: /legacy JS API/ },
        { message: /Sass @import rules are deprecated/ },
        { message: /webpackExports/ },
      ]);
    },
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: {
        enable: false,
        config: { namingPattern: "module_", generateScopedName: "[name]__[local]___[hash:base64:5]" },
      },
    },
  },
  watch: {
    ignore: ["node_modules", "dist"],
  },
  alias: {
    "@": "src",
    "@tarojs/hooks": path.resolve(__dirname, "../src/utils/taroHooks"),
  },
});
