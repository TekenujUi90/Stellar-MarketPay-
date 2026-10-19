import { expect, type Page } from "@playwright/test";

// A valid Stellar address, used only by in-browser fixtures. No real signing or
// network account is needed; the normal challenge/verify UI path still runs.
export const ACCESSIBILITY_ACCOUNT =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const DISPUTE_JOB = "a11y-disputed-job";

/** Install before navigation. Each test gets isolated mutable API state. */
export async function installAccessibilitySession(page: Page, dark: boolean) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", url: "http://127.0.0.1:3100" },
  ]);
  await page.addInitScript(({ account, theme }) => {
    localStorage.setItem("smp_theme", theme);
    localStorage.setItem("marketpay_onboarding_completed", JSON.stringify({ hasSeenWelcome: true }));
    localStorage.setItem("marketpay_onboarding_wizard", JSON.stringify({ completed: true, dismissed: true }));
    (window as Window & { freighter?: unknown }).freighter = {
      isConnected: async () => ({ isConnected: true }),
      isAllowed: async () => ({ isAllowed: true }),
      getPublicKey: async () => ({ publicKey: account }),
      signTransaction: async () => ({ signedTransaction: "MOCK_SIGNED_XDR" }),
    };
  }, { account: ACCESSIBILITY_ACCOUNT, theme: dark ? "dark" : "light" });

  let settings = { enabled: false, slippageBps: 100 };
  let read = false;
  const notifications = () => ({
    notifications: [{
      id: "a11y-notification", title: "Evidence received", body: "Your dispute evidence is ready for review.",
      read, jobId: DISPUTE_JOB, createdAt: "2026-01-01T12:00:00.000Z",
      linkPath: `/disputes/${DISPUTE_JOB}`,
    }],
    unreadCount: read ? 0 : 1, nextCursor: null, hasMore: false,
  });

  // One ordered dispatcher avoids a broad fallback shadowing specific routes.
  // CORS preflights are answered because axios uses a separate API origin.
  await page.route("http://localhost:4000/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, x-csrf-token, x-request-id",
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    let body: unknown;
    if (path === "/api/auth/csrf-token") body = { csrfToken: "a11y-csrf" };
    else if (path === "/api/auth") body = method === "GET"
      ? { transaction: "MOCK_UNSIGNED_XDR" }
      : { success: true, token: "a11y-session", csrfToken: "a11y-csrf" };
    else if (path === "/api/auto-convert/settings") {
      if (method === "PATCH") settings = { ...settings, ...request.postDataJSON() };
      body = { success: true, data: settings };
    } else if (path === "/api/auto-convert/history") {
      body = { success: true, data: { conversions: [], pagination: { totalPages: 1 } } };
    } else if (path === "/api/notifications/read-all") {
      read = true;
      body = { success: true, data: { updatedCount: 1 } };
    } else if (path === "/api/notifications") body = { success: true, data: notifications() };
    else if (path === `/api/disputes/${DISPUTE_JOB}`) {
      body = { success: true, data: {
        job: { id: DISPUTE_JOB, title: "Accessible dispute fixture", status: "disputed",
          client_address: ACCESSIBILITY_ACCOUNT,
          freelancer_address: "GCFXWALLETTESTADDRESS1234567890EXAMPLEABCDEF", created_at: "2026-01-01T12:00:00.000Z" },
        evidence: [],
      } };
    } else if (path === `/api/disputes/${DISPUTE_JOB}/events`) {
      body = { success: true, data: { jobId: DISPUTE_JOB, events: [] } };
    } else if (path === `/api/disputes/${DISPUTE_JOB}/onchain-cids`) {
      body = { success: true, data: { cids: [] } };
    } else if (path === `/api/profiles/${ACCESSIBILITY_ACCOUNT}`) {
      body = { success: true, data: { publicKey: ACCESSIBILITY_ACCOUNT, displayName: "Accessibility User", role: "both", skills: [] } };
    } else if ([`/api/jobs/client/${ACCESSIBILITY_ACCOUNT}`, `/api/applications/freelancer/${ACCESSIBILITY_ACCOUNT}`,
      "/api/invitations", "/api/talent-pools", "/api/auto-convert/pending", "/api/proposal-templates"].includes(path)) {
      body = { success: true, data: [] };
    } else {
      // Unknown calls must not silently receive a successful, incorrect shape.
      await route.fulfill({ status: 404, headers, json: { error: `Unmocked accessibility API: ${path}` } });
      return;
    }
    await route.fulfill({ headers, json: body });
  });
  await page.route("https://api.coingecko.com/**", (route) => route.fulfill({
    headers: { "Access-Control-Allow-Origin": "*" }, json: { stellar: { usd: 0.12 } },
  }));
  await page.route("https://horizon-testnet.stellar.org/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, json:
      path.endsWith(`/accounts/${ACCESSIBILITY_ACCOUNT}`)
        ? { account_id: ACCESSIBILITY_ACCOUNT, balances: [{ asset_type: "native", balance: "100.0000000" }] }
        : { _embedded: { records: [] }, _links: {} },
    });
  });
}

export async function expectAccessibilityTheme(page: Page, dark: boolean) {
  if (dark) await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
}
