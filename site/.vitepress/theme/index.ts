import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import LandingHero from "./landing/LandingHero.vue";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: {
    setup() {
      const { frontmatter } = useData();
      return () => h(DefaultTheme.Layout, null, { "page-top": () => (frontmatter.value.landing ? h(LandingHero) : null) });
    },
  },
};
