import { expect, test } from "@playwright/test";

for (const width of [1440, 1024, 960, 768, 375]) {
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}: continuous navbar and full-width footer above sidebar`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await page.addInitScript((value) => localStorage.setItem("vitepress-theme-appearance", value), theme);
      const evidence = [];
      for (const route of [
        "guide/getting-started.html",
        "reference/cli.html",
        "features/recommend/",
        "features/inbox/",
        "features/graph/",
        "features/export-connect/",
        "",
      ]) {
        await page.goto(`/basics/${route}`);
        const expectedBackground = theme === "dark" ? "rgb(14, 14, 16)" : "rgb(238, 238, 240)";
        const checkNavbar = async () => {
          for (const selector of [
            ".VPNavBar",
            ".VPNavBar .container > .title",
            ".VPNavBar .VPNavBarTitle > .title",
            ".VPNavBar .container > .content",
            ".VPNavBar .content-body",
            ".VPNavBar .divider",
          ]) {
            await expect(page.locator(selector)).toHaveCSS("background-color", expectedBackground);
          }
          const edge = await page.locator(".VPNavBar").evaluate((nav) => {
            const rect = nav.getBoundingClientRect();
            const divider = nav.querySelector(".divider")!.getBoundingClientRect();
            const line = nav.querySelector(".divider-line")!;
            return {
              left: divider.left,
              right: divider.right,
              bottom: divider.bottom,
              navBottom: rect.bottom,
              lineHeight: line.getBoundingClientRect().height,
              border: getComputedStyle(nav).borderBottomWidth,
              titleBorder: getComputedStyle(nav.querySelector(".VPNavBarTitle > .title")!).borderBottomWidth,
            };
          });
          expect(Math.abs(edge.left)).toBeLessThan(0.5);
          expect(Math.abs(edge.right - width)).toBeLessThan(0.5);
          expect(Math.abs(edge.bottom - edge.navBottom)).toBeLessThan(0.5);
          expect(edge.lineHeight).toBe(1);
          expect(edge.border).toBe("0px");
          expect(edge.titleBorder).toBe("0px");
        };
        await checkNavbar();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await checkNavbar();
        const footer = await page.locator(".site-footer").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const inner = element.querySelector(".site-footer-inner")!.getBoundingClientRect();
          const style = getComputedStyle(element);
          const curtain = document.querySelector(".aside-curtain")?.getBoundingClientRect();
          const xs = [1, 120, innerWidth / 2, innerWidth - 1];
          if (curtain?.width) xs.push(curtain.left + curtain.width / 2);
          const ys = [rect.top + 4, Math.min(innerHeight - 4, rect.bottom - 4)];
          const hits = xs.flatMap((x) =>
            ys.map((y) => ({ x, y, footerOnTop: document.elementFromPoint(x, y)?.closest(".site-footer") === element })),
          );
          return {
            left: rect.left,
            right: rect.right,
            innerLeft: inner.left,
            innerRight: inner.right,
            paddingLeft: Number.parseFloat(style.paddingLeft),
            paddingRight: Number.parseFloat(style.paddingRight),
            position: style.position,
            zIndex: Number(style.zIndex),
            sidebarZIndex: Number(style.getPropertyValue("--vp-z-index-sidebar")),
            hits,
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        expect(footer.left).toBe(0);
        expect(Math.abs(footer.right - width)).toBeLessThan(0.5);
        expect(footer.position).toBe("relative");
        expect(footer.zIndex).toBeGreaterThan(footer.sidebarZIndex);
        expect(footer.innerLeft).toBeGreaterThanOrEqual(footer.paddingLeft - 0.5);
        expect(footer.innerRight).toBeLessThanOrEqual(width - footer.paddingRight + 0.5);
        expect(footer.hits.every((hit) => hit.footerOnTop)).toBe(true);
        expect(footer.overflow).toBe(0);
        evidence.push({ route: route || "home", width, theme, background: expectedBackground, ...footer });
      }
      await testInfo.attach("surface-evidence.json", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    });
  }
}
