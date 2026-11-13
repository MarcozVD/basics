import { onBeforeUnmount, onMounted } from "vue";

/** Adapt VitePress 1.6's local-search markup without forking its search/navigation behavior. */
export function useSearchAccessibility() {
  let bodyObserver: MutationObserver | undefined;
  let searchObserver: MutationObserver | undefined;
  let current: HTMLElement | null = null;
  let lastFocus: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;
  let openedAt = "";
  let restoreFrame = 0;
  const rememberFocus = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".VPLocalSearchBox")) lastFocus = target;
  };
  const set = (element: Element, name: string, value: string) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const remove = (element: Element, ...names: string[]) => {
    for (const name of names) if (element.hasAttribute(name)) element.removeAttribute(name);
  };
  const repair = () => {
    if (!current?.isConnected) return;
    set(current, "role", "dialog");
    set(current, "aria-modal", "true");
    set(current, "aria-label", "Search documentation");
    remove(current, "aria-labelledby", "aria-owns", "aria-expanded", "aria-haspopup");
    const input = current.querySelector("#localsearch-input");
    if (input) {
      set(input, "role", "combobox");
      set(input, "aria-expanded", String(!!current.querySelector(".result")));
      set(input, "aria-haspopup", "listbox");
    }
    for (const item of current.querySelectorAll(".results > li")) {
      const link = item.querySelector<HTMLAnchorElement>("a.result");
      if (!link) continue;
      // The actual link is the option; its wrapper is not another interactive control.
      set(item, "role", "presentation");
      remove(item, "id", "aria-selected");
      set(link, "id", `localsearch-item-${link.dataset.index}`);
      set(link, "role", "option");
      set(link, "tabindex", "-1");
      set(link, "aria-selected", String(link.classList.contains("selected")));
      remove(link, "aria-label");
      for (const icon of link.querySelectorAll(".title-icon")) set(icon, "aria-hidden", "true");
    }
    for (const key of current.querySelectorAll(".search-keyboard-shortcuts kbd[aria-label]")) set(key, "role", "img");
  };
  onMounted(() => {
    document.addEventListener("focusin", rememberFocus, true);
    const button = document.querySelector(".DocSearch");
    const shortcut = button?.querySelector(".DocSearch-Button-Keys");
    if (button) set(button, "aria-keyshortcuts", "Control+k Meta+k");
    if (shortcut) set(shortcut, "aria-hidden", "true");
    bodyObserver = new MutationObserver(() => {
      const search = document.querySelector<HTMLElement>(".VPLocalSearchBox");
      if (search === current) return;
      searchObserver?.disconnect();
      current = search;
      if (!current) {
        const opener = returnFocus;
        const url = openedAt;
        restoreFrame = requestAnimationFrame(() => {
          // Restore cancelled searches, without stealing focus after result navigation or an outside click.
          if (location.href === url && opener?.isConnected && document.activeElement === document.body)
            opener.focus({ preventScroll: true });
        });
        return;
      }
      returnFocus = lastFocus;
      openedAt = location.href;
      repair();
      searchObserver = new MutationObserver(repair);
      searchObserver.observe(current, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "aria-selected", "aria-activedescendant", "aria-label", "role"],
      });
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  });
  onBeforeUnmount(() => {
    document.removeEventListener("focusin", rememberFocus, true);
    cancelAnimationFrame(restoreFrame);
    bodyObserver?.disconnect();
    searchObserver?.disconnect();
  });
}
