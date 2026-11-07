/**
 * Browser test of logging out and switching accounts without a refresh.
 *
 *   cashier -> logout -> kitchen -> logout -> admin -> logout -> cashier
 *
 * In one tab, never reloaded (a marker set on window must survive every step).
 * After each logout it checks the login form is usable, that no Firestore
 * "permission-denied" error reached the console, and that each station loads
 * for the new account. It also checks the two-tap « Déconnexion », and that a
 * cart in progress is announced before logout and still there afterwards.
 *
 * Needs the app running (npm run dev) and the live accounts, from environment
 * variables only (the same ones as npm run smoke-test):
 *   SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD, SMOKE_CASHIER_EMAIL,
 *   SMOKE_CASHIER_PASSWORD, SMOKE_KITCHEN_EMAIL, SMOKE_KITCHEN_PASSWORD
 * Optional: E2E_BASE_URL (default http://localhost:3000), CHROME_PATH,
 * E2E_HEADFUL=1 to watch it.
 *
 *   npm run test:e2e
 *
 * Leaves no data behind: the test cart is emptied at the end.
 */
import puppeteer from "puppeteer-core";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CHROME =
  process.env.CHROME_PATH ??
  {
    win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  }[process.platform] ??
  "/usr/bin/google-chrome";

const accounts = {};
for (const role of ["admin", "cashier", "kitchen"]) {
  const email = process.env[`SMOKE_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`SMOKE_${role.toUpperCase()}_PASSWORD`];
  if (!email || !password) {
    console.error(`Missing SMOKE_${role.toUpperCase()}_EMAIL / _PASSWORD in the environment.`);
    process.exit(2);
  }
  accounts[role] = { email, password };
}

const PERMISSION = /permission-denied|missing or insufficient permissions|PERMISSION_DENIED/i;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: process.env.E2E_HEADFUL !== "1" });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

// Every console message and page error, so each phase can look at its own.
const consoleLog = [];
page.on("console", (m) => consoleLog.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleLog.push({ type: "pageerror", text: e.message }));
const mark = () => consoleLog.length;
const since = (from) => consoleLog.slice(from);
const permissionErrors = (from) => since(from).filter((m) => PERMISSION.test(m.text));

const until = (fn, timeout, ...args) => page.waitForFunction(fn, { timeout, polling: 200 }, ...args);
const path = () => page.evaluate(() => location.pathname);

/** Clicks the visible button whose text matches. */
async function clickButton(pattern) {
  const handle = await page.evaluateHandle((source) => {
    const re = new RegExp(source, "i");
    return [...document.querySelectorAll("button")].find((b) => b.checkVisibility() && re.test(b.textContent));
  }, pattern.source);
  const button = handle.asElement();
  if (!button) throw new Error(`No visible button matching ${pattern}`);
  await button.click();
}

const logoutLabel = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.checkVisibility())
      .map((b) => b.textContent)
      .find((text) => /^(Déconnexion|Confirmer)/.test(text ?? "")),
  );

async function login(role) {
  await until(() => {
    const form = [...document.querySelectorAll("form")].find((f) => f.checkVisibility());
    const submit = form?.querySelector("button[type=submit]");
    return location.pathname === "/login" && submit && !submit.disabled;
  }, 20000);
  const form = await page.evaluateHandle(() => [...document.querySelectorAll("form")].find((f) => f.checkVisibility()));
  const email = await form.$("input[name=email]");
  const password = await form.$("input[name=password]");
  await email.click({ clickCount: 3 });
  await email.type(accounts[role].email);
  await password.click({ clickCount: 3 });
  await password.type(accounts[role].password);
  await (await form.$("button[type=submit]")).click();
}

/** Two taps: « Déconnexion », then « Confirmer ». */
async function logout() {
  await clickButton(/^Déconnexion$/);
  await until(() => [...document.querySelectorAll("button")].some((b) => b.checkVisibility() && b.textContent === "Confirmer"), 3000);
  await clickButton(/^Confirmer$/);
  await until(() => location.pathname === "/login", 15000);
}

/** After a logout: the form is usable at once and nothing was refused. */
async function afterLogout(label, from) {
  await wait(2500); // late listener errors would arrive by now
  const form = await page.evaluate(() => {
    const visible = [...document.querySelectorAll("form")].filter((f) => f.checkVisibility());
    const submit = visible[0]?.querySelector("button[type=submit]");
    return { forms: visible.length, submit: submit?.textContent, disabled: submit?.disabled };
  });
  check(`${label}: login form ready (« Se connecter », enabled)`, form.forms === 1 && form.submit === "Se connecter" && !form.disabled, JSON.stringify(form));
  const denied = permissionErrors(from);
  check(`${label}: no permission-denied after logout`, denied.length === 0, denied.map((m) => m.text.slice(0, 160)).join(" | "));
}

async function cashierLoaded() {
  await until(() => location.pathname === "/cashier", 20000);
  await until(() => document.querySelectorAll("ul[aria-label='Produits'] button").length > 0, 20000);
}

const noReload = `e2e-${Date.now()}`;
const stillSamePage = () => page.evaluate((token) => window.__e2eNoReload === token, noReload);

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.evaluate((token) => {
    window.__e2eNoReload = token;
  }, noReload);

  // ---- Cashier ----
  let from = mark();
  await login("cashier");
  await cashierLoaded();
  check("cashier: lands on /cashier with the menu", true);

  // One stray tap does nothing: « Confirmer » goes back to « Déconnexion » after 3 s.
  await clickButton(/^Déconnexion$/);
  check("one tap turns the button into « Confirmer »", (await logoutLabel()) === "Confirmer");
  await wait(3500);
  check("after 3 s without a second tap: back to « Déconnexion », still signed in", (await logoutLabel()) === "Déconnexion" && (await path()) === "/cashier");

  // A cart in progress is announced, and kept.
  await page.evaluate(() => document.querySelector("ul[aria-label='Produits'] button:not(:disabled)").click());
  await clickButton(/^Déconnexion$/);
  const warning = await page.evaluate(() => [...document.querySelectorAll("[role=alert]")].map((a) => a.textContent).find((x) => /Panier en cours/.test(x ?? "")));
  check("cart in progress: a warning comes with « Confirmer »", Boolean(warning), warning ?? "none");
  await clickButton(/^Confirmer$/);
  await until(() => location.pathname === "/login", 15000);
  check("cashier: logged out, on /login", true);
  check("cashier: no permission-denied while signed in", permissionErrors(from).length === 0);
  from = mark();
  await afterLogout("cashier", from);

  // ---- Kitchen, no refresh ----
  from = mark();
  await login("kitchen");
  await until(() => location.pathname === "/kitchen", 20000);
  await until(() => document.querySelector("section[aria-labelledby='zone-preparing']") !== null, 20000);
  // The one-time sound screen covers the board until tapped.
  if (await page.$("#sound-prompt-title")) await clickButton(/^Activer le son$/);
  await wait(3000);
  const board = await page.evaluate(() => ({
    zones: document.querySelectorAll("section[aria-labelledby^='zone-']").length,
    errorBanner: [...document.querySelectorAll("[data-tone=error]")].map((e) => e.textContent).join(" | "),
    cashierLeft: document.querySelector("ul[aria-label='Produits']") !== null,
  }));
  check("kitchen: board loads after the cashier logout, without a refresh", board.zones === 2 && !board.errorBanner, JSON.stringify(board));
  check("kitchen: nothing of the cashier screen is left in the page", !board.cashierLeft);
  const kitchenDenied = permissionErrors(from);
  check("kitchen: no permission-denied in the console", kitchenDenied.length === 0, kitchenDenied.map((m) => m.text.slice(0, 160)).join(" | "));
  check("kitchen: « Déconnexion » is at least 48px tall", (await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Déconnexion")?.getBoundingClientRect().height ?? 0)) >= 48);
  await logout();
  from = mark();
  await afterLogout("kitchen", from);

  // ---- Admin, then cashier again ----
  from = mark();
  await login("admin");
  await until(() => location.pathname === "/admin", 20000);
  await until(() => document.querySelectorAll("nav[aria-label='Administration'] a").length >= 4, 20000);
  await wait(2000);
  const adminDenied = permissionErrors(from);
  check("admin: lands on /admin with its tabs, no permission-denied", adminDenied.length === 0, adminDenied.map((m) => m.text.slice(0, 160)).join(" | "));
  await logout();
  from = mark();
  await afterLogout("admin", from);

  from = mark();
  await login("cashier");
  await cashierLoaded();
  await wait(1500);
  const cashierDenied = permissionErrors(from);
  check("cashier after admin: menu loads, no permission-denied", cashierDenied.length === 0, cashierDenied.map((m) => m.text.slice(0, 160)).join(" | "));
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("m3i9dat.cart.v1") ?? "[]").length);
  check("the cart left at logout is still on this till", cart === 1, `${cart} line(s)`);

  // Clean up: empty the test cart (« Vider », then « Oui »), then log out.
  await clickButton(/^Vider$/);
  await clickButton(/^Oui$/);
  await wait(300);
  check("test cart emptied", (await page.evaluate(() => localStorage.getItem("m3i9dat.cart.v1"))) === null);
  await logout();
  await afterLogout("cashier (end)", mark());

  check("the page was never reloaded", await stillSamePage());
  const pageErrors = consoleLog.filter((m) => m.type === "pageerror");
  check("no uncaught page errors", pageErrors.length === 0, pageErrors.map((m) => m.text.slice(0, 160)).join(" | "));
} catch (error) {
  failures++;
  console.log(`FAIL  stopped: ${error instanceof Error ? error.message : error}`);
  console.log(`      at ${await path().catch(() => "?")}`);
} finally {
  const errors = consoleLog.filter((m) => m.type === "error");
  if (errors.length) console.log(`console errors seen (${errors.length}):\n  ${errors.map((m) => m.text.slice(0, 200)).join("\n  ")}`);
  await browser.close();
}

console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
