const { defineConfig } = require("@tarojs/cli");
const path = require("path");

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
  projectName: "playforge",
  date: "2026-3-5",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
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
