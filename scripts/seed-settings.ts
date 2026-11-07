/**
 * Creates the settings documents with their defaults, only where missing:
 *   settings/kitchen = { prepDurationSec: 300 }
 *   settings/sauces  = { list: ["Tomate", "Piquante"] }
 * Never overwrites a value an admin has saved. Safe to run again.
 *
 *   npm run seed:settings
 */
import { adminDb, projectId } from "./admin-sdk";
import { DEFAULT_PREP_SEC } from "../lib/kitchen-settings";

const DEFAULTS: Record<string, Record<string, unknown>> = {
  "settings/kitchen": { prepDurationSec: DEFAULT_PREP_SEC },
  "settings/sauces": { list: ["Tomate", "Piquante"] },
};

async function main() {
  for (const [path, data] of Object.entries(DEFAULTS)) {
    const created = await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.doc(path);
      if ((await tx.get(ref)).exists) return false;
      tx.set(ref, data);
      return true;
    });
    const now = (await adminDb.doc(path).get()).data();
    console.log(`${path}: ${created ? "created" : "already set, kept"} ${JSON.stringify(now)}`);
  }
  console.log(`Project ${projectId}.`);
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
