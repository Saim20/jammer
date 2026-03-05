/**
 * Seed Firestore with the 5 starter IELTS vocabulary words.
 *
 * Prerequisites
 * ─────────────
 * 1. npm install -D firebase-admin
 * 2. Download your service-account JSON from:
 *    Firebase Console → Project Settings → Service accounts → Generate new private key
 * 3. Run:
 *    GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/seed-firestore.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Init ──────────────────────────────────────────────────────────────────────
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('❌  Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(resolve(credPath), 'utf8'))),
  });
}

const db = getFirestore();

// ── Word data ─────────────────────────────────────────────────────────────────
const words = [
  {
    word: 'Ubiquitous',
    correctDefinition: 'Present, appearing, or found everywhere.',
    distractors: [
      'A rare and highly valued artifact.',
      'Speaking in a roundabout or indirect manner.',
      'Showing an aggressive or warlike attitude.',
    ],
    difficulty: 7,
  },
  {
    word: 'Ephemeral',
    correctDefinition: 'Lasting for a very short time.',
    distractors: [
      'Having a glowing or luminous quality.',
      'A deep, philosophical thought process.',
      'Existing outside of physical reality.',
    ],
    difficulty: 8,
  },
  {
    word: 'Sycophant',
    correctDefinition:
      'A person who acts obsequiously toward someone important in order to gain advantage.',
    distractors: [
      'A medical professional specializing in psychology.',
      'Someone who disrupts established systems.',
      'A musical instrument resembling a small harp.',
    ],
    difficulty: 8,
  },
  {
    word: 'Pernicious',
    correctDefinition: 'Having a harmful effect, especially in a gradual or subtle way.',
    distractors: [
      'Being extremely precise or exact.',
      'A state of complete and utter confusion.',
      'Demonstrating a high level of intelligence.',
    ],
    difficulty: 9,
  },
  {
    word: 'Mellifluous',
    correctDefinition: 'Sweet or musical; pleasant to hear.',
    distractors: [
      'A thick, viscous liquid.',
      'Speaking with a harsh, grating tone.',
      'Easily bent or flexible.',
    ],
    difficulty: 9,
  },
];

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  const colRef = db.collection('words');

  // Check if already seeded
  const existing = await colRef.limit(1).get();
  if (!existing.empty) {
    console.log('ℹ️  words collection already has data. Skipping seed.');
    console.log('   Delete the collection in Firebase Console to re-seed.');
    return;
  }

  const batch = db.batch();
  for (const word of words) {
    batch.set(colRef.doc(), word);
  }
  await batch.commit();
  console.log(`✅  Seeded ${words.length} words into Firestore!`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
