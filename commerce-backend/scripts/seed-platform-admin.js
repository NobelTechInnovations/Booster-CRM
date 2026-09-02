#!/usr/bin/env node
// One-off local script to create the first platform admin — there is no
// public signup for app/admin, by design (see platform-admin.routes.js).
// Every admin after the first is created by an already-logged-in admin via
// POST /api/platform-admin/admins.
//
// Usage:
//   node scripts/seed-platform-admin.js "Your Name" you@email.com "a real password"
//
// Run this locally against whatever MONGODB_URI your commerce-backend/.env
// points at. Never commit real credentials — this script only ever reads
// them from argv, at run time.

import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { createPlatformAdmin, findPlatformAdminByEmail } from "../src/repositories/platform-admin.repo.js";

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error("Usage: node scripts/seed-platform-admin.js \"Your Name\" you@email.com \"a real password\"");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  await connectDatabase();

  const existing = await findPlatformAdminByEmail(email);
  if (existing) {
    console.error(`An admin with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await createPlatformAdmin({ name, email, passwordHash });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`Created platform admin: ${result.admin.email} (${result.admin._id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
