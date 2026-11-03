import { expect, type Page, test } from "@playwright/test";

interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

interface StubOptions {
  /** What `check_update` answers; `null` means "already current". */
  update: UpdateInfo | null;
  /** Makes `install_update` reject with the Rust message. */
  failInstall?: boolean;
}

/**
 * The desktop app and a browser load the same bundle: Tauri's injected internals are the
 * only difference (see lib/desktop.ts and lib/updater.ts). This stub answers the three app
 * commands, records the progress listener Rust would emit to, and lets a test flip results.
 */
async function stubDesktop(page: Page, options: StubOptions) {
  await page.addInitScript((options: StubOptions) => {
    const state: { update: UpdateInfo | null; failInstall: boolean; saved: unknown } = {
      update: options.update,
      failInstall: options.failInstall ?? false,
      saved: null,
    };
    const callbacks = new Map<number, (event: { payload: unknown }) => void>();
    const listeners: { event: string; handler: number }[] = [];
    let nextCallback = 1;

    const internals = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback(callback: (event: { payload: unknown }) => void) {
        const id = nextCallback++;
        callbacks.set(id, callback);
        return id;
      },
      async invoke(command: string, args?: Record<string, unknown>) {
        switch (command) {
          case "desktop_version":
            return "1.4.2";
          case "get_desktop_settings":
            return {
              start_at_login: false,
              start_minimized: "never",
              close_behavior: "tray",
              check_updates_on_start: true,
            };
          case "set_desktop_settings": {
            const settings = (args as { settings: unknown } | undefined)?.settings ?? null;
            state.saved = settings;
            return settings;
          }
          case "check_update":
            return state.update;
          case "install_update":
            if (state.failInstall) {
              throw new Error("The update could not be installed. Try again, or download the new version from the releases page.");
            }
            // Windows exits into the installer, so a successful install never resolves.
            return new Promise(() => {});
          case "plugin:event|listen":
            listeners.push({ event: (args as { event: string }).event, handler: (args as { handler: number }).handler });
            return 0;
          default:
            return null;
        }
      },
    };

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = internals;
    (window as unknown as { __updateTest: unknown }).__updateTest = {
      emit(event: string, payload: unknown) {
        for (const listener of listeners) {
          if (listener.event === event) callbacks.get(listener.handler)?.({ payload });
        }
      },
      setUpdate(next: UpdateInfo | null) {
        state.update = next;
      },
      setFailInstall(next: boolean) {
        state.failInstall = next;
      },
      saved() {
        return state.saved;
      },
    };
  }, options);
}

const RELEASE: UpdateInfo = { version: "1.4.3", notes: "Fixes a sync bug.\nAlso a smaller installer.", date: "2026-11-01" };

function banner(page: Page) {
  return page.locator('section[role="status"]');
}

test("the app announces a new version, downloads it with progress and installs it", async ({ page }) => {
  await stubDesktop(page, { update: RELEASE });
  await page.goto("/");

  const notice = banner(page);
  await expect(notice).toBeVisible();
  await expect(notice.getByText("Basics 1.4.3 is available")).toBeVisible();
  await expect(notice.getByText("Released 2026-11-01")).toBeVisible();

  // The notes stay collapsed until asked for.
  await expect(notice.getByText("Also a smaller installer.")).toBeHidden();
  await notice.getByRole("button", { name: "What's new" }).click();
  await expect(notice.getByText("Also a smaller installer.")).toBeVisible();

  await notice.getByRole("button", { name: "Update and restart" }).click();
  await page.evaluate(() =>
    (window as unknown as { __updateTest: { emit: (event: string, payload: unknown) => void } }).__updateTest.emit(
      "basics:update-progress",
      { phase: "download", downloaded: 512, total: 1024 },
    ),
  );
  await expect(notice.getByText("Downloading… 50%")).toBeVisible();
  await expect(notice.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

  await page.evaluate(() =>
    (window as unknown as { __updateTest: { emit: (event: string, payload: unknown) => void } }).__updateTest.emit(
      "basics:update-progress",
      { phase: "install" },
    ),
  );
  await expect(notice.getByText("Installing… Basics will restart.")).toBeVisible();
});

test("a failed install explains itself and Try again retries", async ({ page }) => {
  await stubDesktop(page, { update: RELEASE, failInstall: true });
  await page.goto("/");

  const notice = banner(page);
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Update and restart" }).click();

  await expect(notice.getByRole("alert")).toContainText("The update could not be installed");
  await expect(notice.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as { __updateTest: { setFailInstall: (next: boolean) => void } }).__updateTest.setFailInstall(false),
  );
  await notice.getByRole("button", { name: "Try again" }).click();
  await expect(notice.getByText("Downloading the update…")).toBeVisible();
});

test("Later hides the banner for this session, even across a reload", async ({ page }) => {
  await stubDesktop(page, { update: RELEASE });
  await page.goto("/");

  const notice = banner(page);
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Later" }).click();
  await expect(notice).toBeHidden();

  // A reload re-runs the automatic check; the version stays dismissed until the app closes.
  await page.reload();
  await expect(page.getByText("Basics 1.4.3 is available")).toBeHidden();
});

test("Settings shows the installed version, one manual check and the on-start switch", async ({ page }) => {
  await stubDesktop(page, { update: null });
  await page.goto("/settings?section=updates");

  const section = page.locator("#settings-updates");
  await expect(section.getByText("1.4.2")).toBeVisible();
  await expect(section.getByText("Basics is up to date.")).toBeVisible();

  await section.getByRole("button", { name: "Check now" }).click();
  await expect(section.getByText("Basics is up to date.")).toBeVisible();

  // Turning the launch check off writes the whole settings object back through Rust.
  await section.getByRole("switch", { name: "Check for updates on start" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __updateTest: { saved: () => unknown } }).__updateTest.saved()))
    .toMatchObject({ check_updates_on_start: false, close_behavior: "tray" });
});
