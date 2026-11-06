/**
 * One-time import of the shop's menu from its public Glovo page.
 *
 *   npm run import:glovo -- --dry-run          # fetch + write seed/products.json only
 *   npm run import:glovo                       # + upload images to Storage, write Firestore
 *   npm run import:glovo -- --overwrite        # also replace products imported before
 *   npm run import:glovo -- --from-json seed/products.json   # import a hand-edited file instead
 *   npm run import:glovo -- --no-upload        # keep Glovo's image URLs (if Storage is not enabled)
 *
 * Nothing is invented: if the page yields no products, the script stops and
 * says so, and seed/products.json stays the template to fill by hand.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const STORE_URL = "https://glovoapp.com/fr/ma/meknes/stores/mayqdat-bambark-mks";
const SEED_FILE = "seed/products.json";
const DEFAULT_SAUCES = ["Tomate", "Piquante"];

export interface SeedProduct {
  name: string;
  price: number;
  category: string;
  /** Remote image to copy into Storage, or "" for none. */
  imageUrl: string;
  available: boolean;
  sauceOptions: string[];
  /** Glovo product id; keeps Firestore ids stable across re-runs. */
  sourceId?: string;
  /** Glovo's description (ingredients), for reference only: not imported. */
  description?: string;
  /** Glovo option groups the app does not model (drink, egg), for reference only. */
  glovoOptions?: string[];
}

interface SeedFile {
  source: string;
  fetchedAt: string;
  note: string;
  products: SeedProduct[];
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    overwrite: { type: "boolean", default: false },
    "no-upload": { type: "boolean", default: false },
    "from-json": { type: "string" },
    "from-html": { type: "string" },
    url: { type: "string", default: STORE_URL },
  },
});

// ---------------------------------------------------------------------------
// 1. Extract
// ---------------------------------------------------------------------------

/** The page is a Next.js app: its data travels in self.__next_f.push([1, "<chunk>"]) scripts. */
function flightPayload(html: string): string {
  let flight = "";
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) flight += JSON.parse(m[1]) as string;
  return flight;
}

/** Cuts the JSON object that follows `"key":` out of a larger text. */
function jsonAfter(text: string, key: string): unknown {
  const marker = `"${key}":`;
  const start = text.indexOf(marker);
  if (start < 0) return undefined;
  let i = start + marker.length;
  let depth = 0;
  let inString = false;
  const from = i;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(from, i + 1));
  }
  return undefined;
}

interface GlovoAttributeGroup {
  name: string;
  attributes: { name: string }[];
}
interface GlovoProduct {
  id: number | string;
  name: string;
  price?: number;
  priceInfo?: { amount?: number; currencyCode?: string };
  imageUrl?: string;
  description?: string;
  attributeGroups?: GlovoAttributeGroup[];
}
interface GlovoList {
  type: string;
  data?: { title?: string; slug?: string; elements?: { type: string; data: GlovoProduct }[] };
}

export function extractProducts(html: string): SeedProduct[] {
  const content = jsonAfter(flightPayload(html), "initialStoreContent") as
    | { data?: { body?: GlovoList[] } }
    | undefined;
  const lists = content?.data?.body ?? [];
  const seen = new Set<string>();
  const products: SeedProduct[] = [];

  for (const list of lists) {
    const slug = list.data?.slug ?? "";
    // "Top des ventes" repeats products from the real categories.
    if (list.type !== "LIST" || slug.startsWith("top-des-ventes")) continue;
    const category = (list.data?.title ?? "").trim();
    for (const element of list.data?.elements ?? []) {
      if (element.type !== "PRODUCT_ROW") continue;
      const p = element.data;
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);

      const price = p.priceInfo?.amount ?? p.price;
      if (typeof price !== "number" || !p.name) continue;
      if (p.priceInfo?.currencyCode && p.priceInfo.currencyCode !== "MAD") continue;

      const groups = p.attributeGroups ?? [];
      // Glovo asks "حار / بدون حار" (spicy / not spicy): those products take sauce.
      const takesSauce = groups.some((g) => g.attributes.some((a) => a.name.includes("حار")));
      const other = groups
        .filter((g) => !g.attributes.some((a) => a.name.includes("حار")))
        .map((g) => `${g.name}: ${g.attributes.map((a) => a.name).join(" / ")}`);

      products.push({
        name: p.name.trim(),
        price,
        category,
        imageUrl: p.imageUrl ?? "",
        available: true,
        sauceOptions: takesSauce ? DEFAULT_SAUCES : [],
        sourceId: id,
        ...(p.description ? { description: p.description } : {}),
        ...(other.length > 0 ? { glovoOptions: other } : {}),
      });
    }
  }
  return products;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Glovo answered HTTP ${res.status} for ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// 2. Load into Firebase
// ---------------------------------------------------------------------------

async function load(products: SeedProduct[]) {
  const { adminBucket, adminDb, projectId, storageBucket } = await import("./admin-sdk");
  const { FieldValue } = await import("firebase-admin/firestore");

  // Use the shop's sauce list if an admin already saved one.
  const saucesDoc = await adminDb.doc("settings/sauces").get();
  const shopSauces = (saucesDoc.get("list") as string[] | undefined) ?? DEFAULT_SAUCES;

  let created = 0;
  let replaced = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const [index, p] of products.entries()) {
    const id = p.sourceId ? `glovo-${p.sourceId}` : adminDb.collection("products").doc().id;
    const ref = adminDb.doc(`products/${id}`);
    const existing = await ref.get();
    if (existing.exists && !values.overwrite) {
      skipped++;
      continue;
    }

    let imageUrl = "";
    let imagePath: string | undefined;
    if (p.imageUrl) {
      if (values["no-upload"]) {
        imageUrl = p.imageUrl;
      } else {
        try {
          const img = await fetch(p.imageUrl);
          if (!img.ok) throw new Error(`image HTTP ${img.status}`);
          const contentType = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
          const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
          imagePath = `products/${id}/glovo.${ext}`;
          const token = randomUUID();
          await adminBucket()
            .file(imagePath)
            .save(Buffer.from(await img.arrayBuffer()), {
              contentType,
              metadata: { cacheControl: "public, max-age=31536000", metadata: { firebaseStorageDownloadTokens: token } },
            });
          imageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(imagePath)}?alt=media&token=${token}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${p.name}: ${message}`);
          if (/bucket does not exist|notFound|404/i.test(message)) {
            console.error(
              "\nFirebase Storage bucket not found. Enable Storage (Firebase console > Storage > Get started;\n" +
                "new projects need the Blaze plan for it), or re-run with --no-upload to keep Glovo's image URLs.",
            );
            process.exit(1);
          }
          imagePath = undefined;
        }
      }
    }

    // Same limits as validProduct in firestore.rules, so later admin edits pass.
    if (imageUrl.length > 2048) imageUrl = "";
    await ref.set({
      name: p.name.slice(0, 80),
      price: Math.min(10000, Math.max(0, p.price)),
      category: p.category.slice(0, 40),
      imageUrl,
      ...(imagePath ? { imagePath } : {}),
      available: p.available,
      sauceOptions: p.sauceOptions.filter((s) => shopSauces.includes(s)),
      order: (index + 1) * 10,
      createdAt: existing.exists ? existing.get("createdAt") : FieldValue.serverTimestamp(),
    });
    if (existing.exists) replaced++;
    else created++;
    console.log(`  ${existing.exists ? "replaced" : "created "} ${p.category} / ${p.name} (${p.price} MAD)`);
  }

  console.log(`\nProject ${projectId}: ${created} created, ${replaced} replaced, ${skipped} already there (use --overwrite to replace).`);
  if (failures.length > 0) {
    console.log(`Images not copied (product saved without photo):\n  ${failures.join("\n  ")}`);
  }
}

// ---------------------------------------------------------------------------

function writeSeed(products: SeedProduct[], source: string) {
  const file: SeedFile = {
    source,
    fetchedAt: new Date().toISOString(),
    note:
      "Menu snapshot. Edit freely (prices on Glovo can differ from in-shop prices), then run: npm run import:glovo -- --from-json seed/products.json. " +
      "'description' and 'glovoOptions' are kept for reference and are not imported.",
    products,
  };
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`Wrote ${SEED_FILE} (${products.length} products).`);
}

async function main() {
  let products: SeedProduct[];

  if (values["from-json"]) {
    const file = JSON.parse(readFileSync(values["from-json"], "utf8")) as SeedFile;
    products = (file.products ?? []).filter((p) => p.name && typeof p.price === "number" && p.category);
    console.log(`Read ${products.length} products from ${values["from-json"]}.`);
  } else {
    const source = values["from-html"] ?? values.url!;
    const html = values["from-html"] ? readFileSync(values["from-html"], "utf8") : await fetchPage(source);
    products = extractProducts(html);
    if (products.length === 0) {
      console.error(
        "No products found on the Glovo page (blocked, or its structure changed). Nothing was imported.\n" +
          `Fill ${SEED_FILE} by hand (see seed/products.template.json), then run with --from-json ${SEED_FILE}.`,
      );
      process.exit(1);
    }
    if (existsSync(SEED_FILE) && !values.overwrite && !values["dry-run"]) {
      console.log(`${SEED_FILE} already exists: kept as is (the fetched menu is used for this run).`);
    } else {
      writeSeed(products, source);
    }
  }

  const byCategory = new Map<string, number>();
  for (const p of products) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  console.log([...byCategory].map(([c, n]) => `  ${c}: ${n}`).join("\n"));

  if (values["dry-run"]) {
    console.log("Dry run: Firebase untouched.");
    return;
  }
  await load(products);
}

main().catch((error) => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
