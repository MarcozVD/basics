import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import DemoVideo from "./DemoVideo.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  // The demo sits between the hero and the feature cards on the home page.
  Layout: () => h(DefaultTheme.Layout, null, { "home-hero-after": () => h(DemoVideo) }),
};
