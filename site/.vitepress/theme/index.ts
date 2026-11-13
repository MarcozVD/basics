import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import LandingClose from "./landing/LandingClose.vue";
import LandingHero from "./landing/LandingHero.vue";
import ReadmeBody from "./landing/ReadmeBody.vue";
import SiteFooter from "./landing/SiteFooter.vue";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./custom.css";
import "./landing/motion.css";

export default {
  extends: DefaultTheme,
  Layout: {
    setup() {
      const { frontmatter } = useData();
      return () =>
        h(DefaultTheme.Layout, null, {
          "page-top": () => (frontmatter.value.landing ? [h(LandingHero), h(ReadmeBody), h(LandingClose)] : null),
          "layout-bottom": () => h(SiteFooter),
        });
    },
  },
};
