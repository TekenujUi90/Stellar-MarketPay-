import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DISPUTE_JOB, expectAccessibilityTheme, installAccessibilitySession } from "./helpers/accessibilitySession";

const PAGES = [
  { path: "/", name: "Home" },
  { path: "/jobs", name: "Jobs" },
  { path: "/freelancers", name: "Freelancers" },
];

for (const { path, name } of PAGES) {
  test.describe(`Accessibility: ${name}`, () => {
    test(`no critical or serious violations on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();

      const critical = results.violations.filter(
        (v) => v.impact === "critical",
      );
      const serious = results.violations.filter((v) => v.impact === "serious");

      expect(critical.length + serious.length).toBe(0);
    });

    test(`zero color contrast violations on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const contrastViolations = results.violations.filter(
        (v) => v.id === "color-contrast" || v.id === "color-contrast-enhanced",
      );

      expect(contrastViolations.length).toBe(0);
    });
  });
}

// Both configured Chromium projects execute these tests. Set and assert the
// app's persisted preference explicitly: emulating OS dark mode alone does not
// override a previously stored application theme.
test.describe("Authenticated accessibility", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await installAccessibilitySession(page, testInfo.project.name === "chromium-dark");
  });

  async function audit(page: Page) {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    // No waivers: include nodes and rule descriptions in the assertion output.
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  }

  test("dashboard: connected wallet and application tab", async ({ page }, testInfo) => {
    await page.goto("/dashboard");
    await expectAccessibilityTheme(page, testInfo.project.name === "chromium-dark");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    const applications = page.getByRole("button", { name: "Applications (0)", exact: true });
    await expect(applications).toBeVisible();
    await expect(page.getByText("You haven't posted any jobs yet", { exact: true })).toBeVisible();
    await audit(page);
    await applications.click();
    await expect(page.getByText("You haven't applied to any jobs yet", { exact: true })).toBeVisible();
    await audit(page);
  });

  test("settings: authenticated auto-conversion controls", async ({ page }, testInfo) => {
    await page.goto("/settings");
    await expectAccessibilityTheme(page, testInfo.project.name === "chromium-dark");
    const toggle = page.getByRole("switch", { name: "Toggle auto-convert earnings to USDC" });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await audit(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "1.0% (Standard)", exact: true })).toBeVisible();
    await audit(page);
  });

  test("dispute: party upload controls and queued evidence", async ({ page }, testInfo) => {
    await page.goto(`/disputes/${DISPUTE_JOB}`);
    await expectAccessibilityTheme(page, testInfo.project.name === "chromium-dark");
    await expect(page.getByRole("heading", { name: "Dispute", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload evidence files — click or drag and drop" })).toBeVisible();
    await expect(page.getByText("No CIDs have been anchored on-chain", { exact: false })).toBeVisible();
    await audit(page);
    await page.getByLabel("Choose evidence files").setInputFiles({
      name: "accessibility-evidence.txt", mimeType: "text/plain",
      buffer: Buffer.from("Delivery evidence for the accessibility fixture."),
    });
    await expect(page.getByRole("list", { name: "Files queued for upload" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove accessibility-evidence.txt" })).toBeVisible();
    await audit(page);
  });

  test("notifications: populated inbox and mark-all-read state", async ({ page }, testInfo) => {
    await page.goto("/notifications");
    await expectAccessibilityTheme(page, testInfo.project.name === "chromium-dark");
    await expect(page.getByRole("button", { name: /Evidence received/ })).toBeVisible();
    await expect(page.getByText("1 unread notification", { exact: true })).toBeVisible();
    await audit(page);
    await page.getByRole("button", { name: "Mark all read", exact: true }).click();
    await expect(page.getByText("0 unread notifications", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all read", exact: true })).toBeDisabled();
    await audit(page);
  });
});
