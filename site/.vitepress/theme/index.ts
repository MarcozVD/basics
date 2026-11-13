import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import FeaturePage from "./FeaturePage.vue";
import GuideReveal from "./GuideReveal.vue";
import LandingClose from "./landing/LandingClose.vue";
import LandingHero from "./landing/LandingHero.vue";
import ReadmeBody from "./landing/ReadmeBody.vue";
import SiteFooter from "./landing/SiteFooter.vue";
import { useSearchAccessibility } from "./useSearchAccessibility";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./custom.css";
import "./landing/motion.css";

export default {
  extends: DefaultTheme,
  Layout: {
    setup() {
      const { frontmatter, page } = useData();
      useSearchAccessibility();
      return () =>
        h(DefaultTheme.Layout, null, {
          "page-top": () =>
            frontmatter.value.landing
              ? [h(LandingHero), h(ReadmeBody), h(LandingClose)]
              : frontmatter.value.feature
                ? h(FeaturePage, { key: frontmatter.value.feature })
                : null,
          "layout-bottom": () => h(SiteFooter, { key: page.value.relativePath }),
          "doc-before": () => h(GuideReveal, { key: page.value.relativePath }),
        });
    },
  },
};
