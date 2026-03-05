/**
 * seed-supabase.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Uploads vocabulary words to the Supabase `words` table and optionally
 * generates Google Gemini embeddings (gemini-embedding-001, 1536-dim) for
 * the match_words() vector-search RPC defined in supabase/schema.sql.
 *
 * Model: gemini-embedding-001 (Google AI Studio, latest June 2025)
 * Dims:  1536  — MTEB score 68.17 (best across all supported sizes)
 * Task:  RETRIEVAL_DOCUMENT (optimised for document indexing)
 *
 * Env vars (auto-loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_SECRET_KEY       — secret key (bypasses RLS)
 *                               Supabase Dashboard → Settings → API → Secret key
 *   GEMINI_API_KEY            — optional; enables embedding generation
 *                               Get one free at https://aistudio.google.com/apikey
 *
 * Usage
 * ──────
 *   # Upload words only (no embeddings)
 *   node scripts/seed-supabase.mjs
 *
 *   # Upload words + generate embeddings
 *   GEMINI_API_KEY=AIza... node scripts/seed-supabase.mjs
 *
 *   # Only fill NULL embeddings for words already in the DB (no inserts)
 *   node scripts/seed-supabase.mjs --embed-only
 *
 *   # Force re-generate all embeddings (even non-NULL ones)
 *   node scripts/seed-supabase.mjs --embed-only --force-embed
 *
 * Notes
 * ──────
 * • The secret key bypasses Row Level Security — keep it out of git.
 * • Duplicate words are silently skipped (unique constraint on `words.word`).
 * • Embedding text: "word: <word>. definition: <correct_definition>"
 * • 1536-dim vectors from Gemini are L2-normalised before storage so that
 *   cosine similarity via pgvector's <=> operator is accurate.
 * • Batches up to 100 texts per API request (Gemini's maximum).
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const envPath = new URL('../.env.local', import.meta.url);
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= val;
  }
} catch {
  // .env.local is optional — fall through to env vars set externally
}

// ── CLI flags ────────────────────────────────────────────────────────────────
const EMBED_ONLY  = process.argv.includes('--embed-only');   // skip word inserts
const FORCE_EMBED = process.argv.includes('--force-embed');  // overwrite existing embeddings

// ── Validate env ─────────────────────────────────────────────────────────────
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY     = process.env.SUPABASE_SECRET_KEY;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('❌  Missing required env vars:');
  if (!SUPABASE_URL) console.error('   NEXT_PUBLIC_SUPABASE_URL');
  if (!SECRET_KEY)   console.error('   SUPABASE_SECRET_KEY  (Dashboard → Settings → API → Secret key)');
  process.exit(1);
}

// ── Supabase client (service-role — bypasses RLS) ────────────────────────────
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Word bank ─────────────────────────────────────────────────────────────────
// Ported from populate-firestore.mjs and converted to snake_case for Supabase.
// difficulty 1–3 = easy, 4–6 = medium, 7–8 = hard, 9–10 = expert
const WORDS = [
  // ── Difficulty 3 ──────────────────────────────────────────────────────────
  {
    word: 'Benevolent',
    correct_definition: 'Well meaning and kindly; generous in helping others.',
    distractors: [
      'Showing a desire to harm others.',
      'Feeling extreme happiness or joy.',
      'Difficult to understand or explain.',
    ],
    difficulty: 3,
  },
  {
    word: 'Candid',
    correct_definition: 'Truthful and straightforward; frank in speech or expression.',
    distractors: [
      'Overly decorated or showy in appearance.',
      'Slow to understand or respond.',
      'Relating to a formal official ceremony.',
    ],
    difficulty: 3,
  },
  {
    word: 'Diligent',
    correct_definition: 'Showing steady and earnest care and effort in work.',
    distractors: [
      'Acting in a reckless or impulsive way.',
      'Having an unpleasant or offensive smell.',
      'Reluctant to give or spend resources.',
    ],
    difficulty: 3,
  },
  {
    word: 'Eloquent',
    correct_definition: 'Fluent and persuasive in speaking or writing.',
    distractors: [
      'Awkward and clumsy in movement.',
      'Relating to the natural environment.',
      'Showing a lack of experience or knowledge.',
    ],
    difficulty: 3,
  },

  // ── Difficulty 4 ──────────────────────────────────────────────────────────
  {
    word: 'Ambiguous',
    correct_definition: 'Open to more than one interpretation; not clear in meaning.',
    distractors: [
      'Showing great enthusiasm and energy.',
      'Relating to both land and water environments.',
      'Extremely accurate and precise in detail.',
    ],
    difficulty: 4,
  },
  {
    word: 'Coherent',
    correct_definition: 'Logical and consistent; forming a unified whole.',
    distractors: [
      'Having a strong and unpleasant odor.',
      'Relating to sound and its properties.',
      "Showing excessive pride in one's appearance.",
    ],
    difficulty: 4,
  },
  {
    word: 'Pragmatic',
    correct_definition: 'Dealing with things sensibly and realistically based on practical considerations.',
    distractors: [
      'Relating to ancient Greek philosophical ideals.',
      'Excessively focused on rules and procedures.',
      'Characterized by a dreamy, idealistic outlook.',
    ],
    difficulty: 4,
  },
  {
    word: 'Scrutinize',
    correct_definition: 'To examine or inspect something closely and thoroughly.',
    distractors: [
      'To arrange objects in a specific sequence.',
      'To move carefully to avoid detection.',
      'To provide financial support for a project.',
    ],
    difficulty: 4,
  },
  {
    word: 'Tenacious',
    correct_definition: 'Holding firmly to something; not easily giving up.',
    distractors: [
      'Prone to sudden changes in mood.',
      'Relating to a muscular or physical quality.',
      'Delicate and easily damaged or broken.',
    ],
    difficulty: 4,
  },
  {
    word: 'Verbose',
    correct_definition: 'Using more words than necessary; wordy.',
    distractors: [
      'Speaking in a very quiet, hushed tone.',
      'Relating to the use of visual images.',
      'Extremely fast or rapid in movement.',
    ],
    difficulty: 4,
  },

  // ── Difficulty 5 ──────────────────────────────────────────────────────────
  {
    word: 'Acrimonious',
    correct_definition: 'Angry and bitter, especially in speech or manner.',
    distractors: [
      'Having a sharp, pleasant citrus flavor.',
      'Relating to chemical reactions in the body.',
      'Showing calm and composed behavior.',
    ],
    difficulty: 5,
  },
  {
    word: 'Alleviate',
    correct_definition: 'To make suffering, deficiency, or a problem less severe.',
    distractors: [
      'To raise something to a higher elevation.',
      'To establish a formal legal agreement.',
      'To increase the intensity of a conflict.',
    ],
    difficulty: 5,
  },
  {
    word: 'Ambivalent',
    correct_definition: 'Having mixed or contradictory feelings about something.',
    distractors: [
      'Capable of using both hands equally well.',
      'Relating to both sides of a debate.',
      'Displaying strong, definite opinions on issues.',
    ],
    difficulty: 5,
  },
  {
    word: 'Auspicious',
    correct_definition: 'Giving a favorable sign or omen; promising success.',
    distractors: [
      'Relating to the study of birds.',
      'Showing excessive religious devotion.',
      'Causing fear or anxiety about the future.',
    ],
    difficulty: 5,
  },
  {
    word: 'Convoluted',
    correct_definition: 'Extremely complex and difficult to follow or understand.',
    distractors: [
      'Twisted into a spiral or coiled shape.',
      'Moving together in the same direction.',
      'Relating to a formal legal document.',
    ],
    difficulty: 5,
  },
  {
    word: 'Exacerbate',
    correct_definition: 'To make a problem, bad situation, or negative feeling worse.',
    distractors: [
      'To remove something completely from a surface.',
      'To cause someone to feel very happy.',
      'To make a detailed examination of something.',
    ],
    difficulty: 5,
  },
  {
    word: 'Ostracize',
    correct_definition: 'To exclude someone from a society or group.',
    distractors: [
      'To decorate something in an elaborate style.',
      'To arrange items in a specific order.',
      'To publicly praise someone for an achievement.',
    ],
    difficulty: 5,
  },
  {
    word: 'Proliferate',
    correct_definition: 'To increase rapidly in number; to multiply.',
    distractors: [
      'To prevent something from happening.',
      'To express strong disagreement.',
      'To reduce something to its simplest form.',
    ],
    difficulty: 5,
  },

  // ── Difficulty 6 ──────────────────────────────────────────────────────────
  {
    word: 'Anachronism',
    correct_definition: 'A thing belonging to a period other than the one in which it exists.',
    distractors: [
      'A system of government with no ruler.',
      'A recurring pattern found in literature.',
      'A medical condition affecting memory.',
    ],
    difficulty: 6,
  },
  {
    word: 'Capricious',
    correct_definition: 'Given to sudden changes of mood or behavior; unpredictable.',
    distractors: [
      'Relating to Capricorn in astrology.',
      'Showing an excessive interest in food.',
      'Moving in a slow, deliberate manner.',
    ],
    difficulty: 6,
  },
  {
    word: 'Circumspect',
    correct_definition: 'Cautious and unwilling to take risks; wary.',
    distractors: [
      'Relating to a circular or rounded shape.',
      'Showing great skill in avoiding detection.',
      'Acting quickly without careful consideration.',
    ],
    difficulty: 6,
  },
  {
    word: 'Deleterious',
    correct_definition: 'Causing harm or damage; harmful.',
    distractors: [
      'Relating to the process of deletion.',
      'Extremely pleasant and enjoyable.',
      'Producing a positive and lasting effect.',
    ],
    difficulty: 6,
  },
  {
    word: 'Ephemeral',
    correct_definition: 'Lasting for a very short time.',
    distractors: [
      'Having a glowing or luminous quality.',
      'A deep, philosophical thought process.',
      'Existing outside of physical reality.',
    ],
    difficulty: 6,
  },
  {
    word: 'Equivocal',
    correct_definition: 'Ambiguous and open to more than one interpretation, often intentionally.',
    distractors: [
      'Treating all people or things equally.',
      'Relating to a fair and just outcome.',
      'Having a perfectly balanced structure.',
    ],
    difficulty: 6,
  },
  {
    word: 'Ignominious',
    correct_definition: 'Deserving or causing public disgrace or shame.',
    distractors: [
      'Having a complete lack of knowledge.',
      'Showing great religious reverence.',
      'Relating to fire or flames.',
    ],
    difficulty: 6,
  },
  {
    word: 'Inveterate',
    correct_definition: 'Having a particular habit, activity, or interest that is firmly established.',
    distractors: [
      'Relating to animals without a backbone.',
      'Showing a strong opposition to war.',
      'Recently introduced or newly created.',
    ],
    difficulty: 6,
  },
  {
    word: 'Loquacious',
    correct_definition: 'Tending to talk a great deal; talkative.',
    distractors: [
      'Relating to a logical form of argument.',
      'Having an extremely loud, booming voice.',
      'Preferring silence and solitary activities.',
    ],
    difficulty: 6,
  },
  {
    word: 'Mendacious',
    correct_definition: 'Not telling the truth; lying.',
    distractors: [
      'Relating to the mind or intellect.',
      'Showing a willingness to help others.',
      'Excessively focused on small details.',
    ],
    difficulty: 6,
  },

  // ── Difficulty 7 ──────────────────────────────────────────────────────────
  {
    word: 'Aberrant',
    correct_definition: 'Departing from an accepted standard; abnormal.',
    distractors: [
      'Relating to the behavior of light.',
      'Showing extreme devotion to a cause.',
      'Characterized by sudden bursts of activity.',
    ],
    difficulty: 7,
  },
  {
    word: 'Anathema',
    correct_definition: 'Something or someone strongly detested or loathed.',
    distractors: [
      'A formal declaration of religious truth.',
      'A branch of medical study.',
      'A deeply held philosophical principle.',
    ],
    difficulty: 7,
  },
  {
    word: 'Diffident',
    correct_definition: 'Modest or shy due to a lack of self-confidence.',
    distractors: [
      'Holding a completely different viewpoint.',
      'Showing aggressive and domineering behavior.',
      'Relating to spreading across a surface.',
    ],
    difficulty: 7,
  },
  {
    word: 'Enervate',
    correct_definition: 'To cause someone to feel drained of energy or vitality.',
    distractors: [
      'To strengthen the nervous system.',
      'To fill someone with intense enthusiasm.',
      'To make a medical procedure less painful.',
    ],
    difficulty: 7,
  },
  {
    word: 'Equanimity',
    correct_definition: 'Mental calmness and composure, especially in difficult situations.',
    distractors: [
      'The quality of being perfectly equal.',
      'A state of physical balance and coordination.',
      'Intense emotional distress or anxiety.',
    ],
    difficulty: 7,
  },
  {
    word: 'Iconoclast',
    correct_definition: 'A person who attacks or rejects cherished beliefs and institutions.',
    distractors: [
      'An artist who creates religious images.',
      'A strict follower of traditional customs.',
      'A collector of rare and valuable artworks.',
    ],
    difficulty: 7,
  },
  {
    word: 'Insidious',
    correct_definition: 'Proceeding in a subtle way but with harmful effects.',
    distractors: [
      'Located on the inner side of something.',
      'Extremely bright and dazzling to the eye.',
      'Showing a strong desire for knowledge.',
    ],
    difficulty: 7,
  },
  {
    word: 'Laconic',
    correct_definition: 'Using very few words; brief and concise in speech or expression.',
    distractors: [
      'Relating to a shiny, coated surface.',
      'Showing great sadness or regret.',
      'Extremely talkative and expressive.',
    ],
    difficulty: 7,
  },
  {
    word: 'Perfidious',
    correct_definition: 'Deceitful and untrustworthy; guilty of betrayal.',
    distractors: [
      'Having a very pleasant and appealing fragrance.',
      'Relating to a deeply personal feeling.',
      'Showing extreme loyalty and devotion.',
    ],
    difficulty: 7,
  },
  {
    word: 'Recalcitrant',
    correct_definition: 'Stubbornly defiant of authority or control.',
    distractors: [
      'Showing willingness to cooperate fully.',
      'Relating to a mathematical calculation.',
      'Able to recover quickly from difficulties.',
    ],
    difficulty: 7,
  },
  {
    word: 'Supercilious',
    correct_definition: 'Behaving as if one is superior to others; disdainful.',
    distractors: [
      'Relating to the surface of something.',
      'Having a very high degree of skill.',
      'Showing genuine interest in other people.',
    ],
    difficulty: 7,
  },
  {
    word: 'Ubiquitous',
    correct_definition: 'Present, appearing, or found everywhere.',
    distractors: [
      'A rare and highly valued artifact.',
      'Speaking in a roundabout or indirect manner.',
      'Showing an aggressive or warlike attitude.',
    ],
    difficulty: 7,
  },

  // ── Difficulty 8 ──────────────────────────────────────────────────────────
  {
    word: 'Abstruse',
    correct_definition: 'Difficult to understand; obscure.',
    distractors: [
      'Completely irrelevant to the topic.',
      'Physically removed from a situation.',
      'Refreshingly simple and clear.',
    ],
    difficulty: 8,
  },
  {
    word: 'Acumen',
    correct_definition: 'The ability to make good judgments and quick decisions; shrewdness.',
    distractors: [
      'A sharp or pointed implement.',
      'A state of intense physical pain.',
      'The process of accumulating wealth.',
    ],
    difficulty: 8,
  },
  {
    word: 'Assiduous',
    correct_definition: 'Showing great care, attention, and effort in work; diligent.',
    distractors: [
      'Relating to a formal educational process.',
      'Acting without sufficient preparation.',
      'Having an unpleasant or sour taste.',
    ],
    difficulty: 8,
  },
  {
    word: 'Bellicose',
    correct_definition: 'Demonstrating aggression and willingness to fight.',
    distractors: [
      'Having a very pleasant and attractive quality.',
      'Relating to bells and musical instruments.',
      'Showing great generosity towards others.',
    ],
    difficulty: 8,
  },
  {
    word: 'Garrulous',
    correct_definition: 'Excessively talkative, especially on trivial matters.',
    distractors: [
      'Relating to the stomach and digestion.',
      'Having a rough or unpleasant texture.',
      'Keeping to oneself; antisocial.',
    ],
    difficulty: 8,
  },
  {
    word: 'Meretricious',
    correct_definition: 'Apparently attractive but having no real value; showy.',
    distractors: [
      'Deserving great praise and recognition.',
      'Relating to legal merit in a case.',
      'Showing genuine virtue and integrity.',
    ],
    difficulty: 8,
  },
  {
    word: 'Obsequious',
    correct_definition: 'Excessively eager to please or serve; fawning.',
    distractors: [
      'Relating to funeral or burial rites.',
      'Blocking or hindering progress.',
      'Openly challenging authority and norms.',
    ],
    difficulty: 8,
  },
  {
    word: 'Perspicacious',
    correct_definition: 'Having a ready insight into things; shrewd and perceptive.',
    distractors: [
      'Having a tendency to sweat excessively.',
      'Showing a clear and transparent quality.',
      'Lacking the ability to observe details.',
    ],
    difficulty: 8,
  },
  {
    word: 'Pusillanimous',
    correct_definition: 'Showing a lack of courage or determination; timid.',
    distractors: [
      'Showing extreme physical strength.',
      'Relating to philosophical idealism.',
      'Acting with reckless, fearless abandon.',
    ],
    difficulty: 8,
  },
  {
    word: 'Sycophant',
    correct_definition: 'A person who acts obsequiously toward someone important in order to gain advantage.',
    distractors: [
      'A medical professional specializing in psychology.',
      'Someone who disrupts established systems.',
      'A musical instrument resembling a small harp.',
    ],
    difficulty: 8,
  },
  {
    word: 'Tendentious',
    correct_definition: 'Promoting a particular cause or point of view; biased.',
    distractors: [
      'Relating to a physical tendon or muscle.',
      'Showing a gentle or caring quality.',
      'Presenting a balanced, impartial viewpoint.',
    ],
    difficulty: 8,
  },

  // ── Difficulty 9 ──────────────────────────────────────────────────────────
  {
    word: 'Aplomb',
    correct_definition: 'Self-confidence and composure, especially in difficult situations.',
    distractors: [
      'A type of fruit resembling a plum.',
      'A severe lack of confidence.',
      'The process of falling straight downward.',
    ],
    difficulty: 9,
  },
  {
    word: 'Crepuscular',
    correct_definition: 'Relating to or resembling twilight; active at dawn or dusk.',
    distractors: [
      'Relating to a crispy or crunchy texture.',
      'Having a very old or ancient quality.',
      'Producing a loud, harsh sound.',
    ],
    difficulty: 9,
  },
  {
    word: 'Egregious',
    correct_definition: 'Outstandingly bad; shockingly wrong.',
    distractors: [
      'Standing out as an exceptional achievement.',
      'Relating to a large social group.',
      'Showing great care and thoroughness.',
    ],
    difficulty: 9,
  },
  {
    word: 'Execrable',
    correct_definition: 'Extremely bad or unpleasant; detestable.',
    distractors: [
      'Able to be carried out or executed.',
      'Relating to a formal legal execution.',
      'Worthy of high praise and admiration.',
    ],
    difficulty: 9,
  },
  {
    word: 'Lugubrious',
    correct_definition: 'Looking or sounding sad and dismal; mournful.',
    distractors: [
      'Warm and humid, as in tropical climates.',
      'Relating to liquid or fluid properties.',
      'Excessively cheerful and positive.',
    ],
    difficulty: 9,
  },
  {
    word: 'Machiavellian',
    correct_definition: 'Using clever or cunning strategies, especially in a deceptive way.',
    distractors: [
      'Relating to Italian Renaissance architecture.',
      'Showing a principled and transparent approach.',
      'Demonstrating great mechanical skill.',
    ],
    difficulty: 9,
  },
  {
    word: 'Mellifluous',
    correct_definition: 'Sweet or musical; pleasant to hear.',
    distractors: [
      'A thick, viscous liquid.',
      'Speaking with a harsh, grating tone.',
      'Easily bent or flexible.',
    ],
    difficulty: 9,
  },
  {
    word: 'Pernicious',
    correct_definition: 'Having a harmful effect, especially in a gradual or subtle way.',
    distractors: [
      'Being extremely precise or exact.',
      'A state of complete and utter confusion.',
      'Demonstrating a high level of intelligence.',
    ],
    difficulty: 9,
  },
  {
    word: 'Sanguine',
    correct_definition: 'Optimistic and positive, especially in a difficult situation.',
    distractors: [
      'Relating to blood or the circulatory system.',
      'Showing extreme pessimism about the future.',
      'Having a deep red or crimson color.',
    ],
    difficulty: 9,
  },

  // ── Difficulty 10 ─────────────────────────────────────────────────────────
  {
    word: 'Concatenation',
    correct_definition: 'A series of interconnected things or events; a chain.',
    distractors: [
      'The process of combining two substances.',
      'A method of musical composition.',
      'The study of ancestral lineages.',
    ],
    difficulty: 10,
  },
  {
    word: 'Defenestrate',
    correct_definition: 'To throw someone or something out of a window.',
    distractors: [
      'To remove all forests from a region.',
      'To strip someone of their official rank.',
      'To block all windows in a building.',
    ],
    difficulty: 10,
  },
  {
    word: 'Eleemosynary',
    correct_definition: 'Relating to or dependent on charity; charitable.',
    distractors: [
      'Relating to elementary school education.',
      'Having a very basic or simple nature.',
      'Relating to chemical elements.',
    ],
    difficulty: 10,
  },
  {
    word: 'Loquacity',
    correct_definition: 'The quality of talking a great deal; talkativeness.',
    distractors: [
      'A logical system of argumentation.',
      'The quality of being excessively quiet.',
      'A method of persuasive rhetoric.',
    ],
    difficulty: 10,
  },
  {
    word: 'Nugatory',
    correct_definition: 'Of no value or importance; futile.',
    distractors: [
      'Relating to gold or precious metals.',
      'Having great strategic significance.',
      'Containing a small, dense core.',
    ],
    difficulty: 10,
  },
  {
    word: 'Perspicuity',
    correct_definition: 'The quality of being clearly expressed and easily understood.',
    distractors: [
      'The tendency to sweat profusely.',
      'Extreme sharpness of perception.',
      'Deliberate vagueness in communication.',
    ],
    difficulty: 10,
  },
];

// ── Google Gemini embedding helper ───────────────────────────────────────────
// Model: gemini-embedding-001 (latest, June 2025)
// Dims:  1536 — highest MTEB score (68.17) across all supported sizes
// Task:  RETRIEVAL_DOCUMENT — optimised for indexing searchable documents
const EMBEDDING_MODEL     = 'gemini-embedding-001';
const EMBEDDING_DIM       = 1536;
const EMBED_BATCH_SIZE    = 100; // Gemini's maximum per batchEmbedContents request
const GEMINI_BATCH_URL    =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;

/**
 * Build the text we embed for each word.
 * Combining word + definition gives the vector index richer semantic signal.
 */
function embeddingText(word) {
  return `word: ${word.word}. definition: ${word.correct_definition}`;
}

/**
 * L2-normalise a vector so cosine similarity via pgvector's <=> operator
 * is accurate. Gemini auto-normalises 3072-dim but not 1536-dim.
 * @param {number[]} vec
 * @returns {number[]}
 */
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

/**
 * Call Gemini batchEmbedContents for up to 100 texts.
 * Returns an array of normalised float[] in the same order as `texts`.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  const requests = texts.map((text) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIM,
  }));

  const res = await fetch(`${GEMINI_BATCH_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  // json.embeddings[].values — normalise each vector before storing
  return json.embeddings.map((e) => l2Normalize(e.values));
}

// ── Step 1 — Upsert words ────────────────────────────────────────────────────
async function upsertWords() {
  console.log(`\n📖  Upserting ${WORDS.length} words into Supabase…`);

  // Supabase upsert with ignoreDuplicates silently skips rows that violate
  // the unique constraint on words.word — no error thrown.
  const { data, error } = await supabase
    .from('words')
    .upsert(WORDS, { onConflict: 'word', ignoreDuplicates: true })
    .select('id, word');

  if (error) {
    console.error('❌  Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`✅  Inserted ${data.length} new word(s) (duplicates silently skipped).`);
  return data;
}

// ── Step 2 — Generate & store embeddings ────────────────────────────────────
async function generateEmbeddings() {
  if (!GEMINI_KEY) {
    console.log('\nℹ️   GEMINI_API_KEY not set — skipping embedding generation.');
    console.log('   Get a free key at https://aistudio.google.com/apikey');
    console.log('   Then set GEMINI_API_KEY in .env.local to enable vector search via match_words().');
    return;
  }

  // Fetch rows that need embeddings
  let query = supabase.from('words').select('id, word, correct_definition');
  if (!FORCE_EMBED) {
    query = query.is('embedding', null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('❌  Failed to fetch words for embedding:', error.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('\n✅  All words already have embeddings. Use --force-embed to regenerate.');
    return;
  }

  console.log(`\n🤖  Generating embeddings for ${rows.length} word(s) using ${EMBEDDING_MODEL}…`);

  let done = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const texts  = batch.map(embeddingText);

    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`❌  Gemini batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1} failed:`, err.message);
      process.exit(1);
    }

    // Update each row individually (Supabase JS v2 doesn't support bulk vector updates)
    for (let j = 0; j < batch.length; j++) {
      const { error: updateErr } = await supabase
        .from('words')
        .update({ embedding: JSON.stringify(embeddings[j]) })
        .eq('id', batch[j].id);

      if (updateErr) {
        console.error(`❌  Failed to store embedding for "${batch[j].word}":`, updateErr.message);
        process.exit(1);
      }
    }

    done += batch.length;
    const pct = Math.round((done / rows.length) * 100);
    process.stdout.write(`   ${done}/${rows.length} (${pct}%)\r`);
  }

  console.log(`\n✅  Stored embeddings for ${rows.length} word(s).`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to Supabase:', SUPABASE_URL);
  if (GEMINI_KEY) {
    console.log('🤖  Gemini key detected — embeddings will be generated (gemini-embedding-001, 1536-dim).');
  }
  if (EMBED_ONLY) {
    console.log('⚡  --embed-only: skipping word inserts.');
  }
  if (FORCE_EMBED) {
    console.log('⚠️   --force-embed: will overwrite existing embeddings.');
  }

  if (!EMBED_ONLY) {
    await upsertWords();
  }

  await generateEmbeddings();

  console.log('\n🎮  Done! Your Supabase words table is ready.');
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
