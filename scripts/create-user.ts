/**
 * Create (or update) a staff account and give it a role.
 *
 *   npm run user:create -- --email patron@example.com --role admin
 *   npm run user:create -- --email caisse1@example.com --role cashier --password "S3cret-long"
 *   npm run user:create -- --email cuisine@example.com --role kitchen
 *
 * Without --password a random one is generated and printed once.
 * Running it again for an existing email only changes the role
 * (and the password, if --password is given).
 *
 * This is how the FIRST admin is created: the security rules only let an
 * admin assign roles, so the first one has to come from the Admin SDK.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, projectId } from "./admin-sdk";

const ROLES = ["admin", "cashier", "kitchen"] as const;
type Role = (typeof ROLES)[number];

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    role: { type: "string" },
    name: { type: "string" },
  },
});

const email = values.email?.trim().toLowerCase();
const role = values.role as Role | undefined;

if (!email || !role || !ROLES.includes(role)) {
  console.error(
    "Usage: npm run user:create -- --email <email> --role <admin|cashier|kitchen> [--password <pw>] [--name <display name>]",
  );
  process.exit(1);
}
if (values.password !== undefined && values.password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function main(email: string, role: Role) {
  let generated: string | undefined;
  let uid: string;

  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
    if (values.password) await adminAuth.updateUser(uid, { password: values.password });
    console.log(`Existing account ${email} (${uid}).`);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    generated = values.password ? undefined : randomBytes(12).toString("base64url");
    const created = await adminAuth.createUser({
      email,
      password: values.password ?? generated,
      displayName: values.name,
    });
    uid = created.uid;
    console.log(`Created account ${email} (${uid}).`);
  }

  await adminDb.doc(`users/${uid}`).set(
    {
      role,
      email,
      ...(values.name ? { displayName: values.name } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`Role "${role}" saved in users/${uid} on project ${projectId}.`);
  if (generated) {
    console.log(`Generated password (shown once, write it down): ${generated}`);
  }
}

main(email, role).catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  if (String(error).includes("CONFIGURATION_NOT_FOUND") || String(error).includes("auth/configuration-not-found")) {
    console.error("Enable Email/Password sign-in: Firebase console > Authentication > Sign-in method.");
  }
  process.exit(1);
});
