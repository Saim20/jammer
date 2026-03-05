/**
 * populate-firestore.mjs
 * ─────────────────────
 * Adds 60 IELTS vocabulary words to the `words` collection (skipping any
 * whose `word` field already exists) and writes the `config/game` document.
 *
 * Run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json \
 *     node scripts/populate-firestore.mjs
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
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(credPath), 'utf8'))) });
}

const db = getFirestore();

// ── Game config ───────────────────────────────────────────────────────────────
const GAME_CONFIG = {
  wordCount: 15,       // words per round
  timerSeconds: 12,    // seconds per word
  difficultyMin: 1,    // include all difficulties by default
  difficultyMax: 10,
};

// ── Word bank ─────────────────────────────────────────────────────────────────
// difficulty 1–3 = easy, 4–6 = medium, 7–8 = hard, 9–10 = expert
const WORDS = [
  // ── Difficulty 3 ─────────────────────────────────────────────────────────
  {
    word: 'Benevolent',
    correctDefinition: 'Well meaning and kindly; generous in helping others.',
    distractors: [
      'Showing a desire to harm others.',
      'Feeling extreme happiness or joy.',
      'Difficult to understand or explain.',
    ],
    difficulty: 3,
  },
  {
    word: 'Candid',
    correctDefinition: 'Truthful and straightforward; frank in speech or expression.',
    distractors: [
      'Overly decorated or showy in appearance.',
      'Slow to understand or respond.',
      'Relating to a formal official ceremony.',
    ],
    difficulty: 3,
  },
  {
    word: 'Diligent',
    correctDefinition: 'Showing steady and earnest care and effort in work.',
    distractors: [
      'Acting in a reckless or impulsive way.',
      'Having an unpleasant or offensive smell.',
      'Reluctant to give or spend resources.',
    ],
    difficulty: 3,
  },
  {
    word: 'Eloquent',
    correctDefinition: 'Fluent and persuasive in speaking or writing.',
    distractors: [
      'Awkward and clumsy in movement.',
      'Relating to the natural environment.',
      'Showing a lack of experience or knowledge.',
    ],
    difficulty: 3,
  },

  // ── Difficulty 4 ─────────────────────────────────────────────────────────
  {
    word: 'Ambiguous',
    correctDefinition: 'Open to more than one interpretation; not clear in meaning.',
    distractors: [
      'Showing great enthusiasm and energy.',
      'Relating to both land and water environments.',
      'Extremely accurate and precise in detail.',
    ],
    difficulty: 4,
  },
  {
    word: 'Coherent',
    correctDefinition: 'Logical and consistent; forming a unified whole.',
    distractors: [
      'Having a strong and unpleasant odor.',
      'Relating to sound and its properties.',
      'Showing excessive pride in one\'s appearance.',
    ],
    difficulty: 4,
  },
  {
    word: 'Pragmatic',
    correctDefinition: 'Dealing with things sensibly and realistically based on practical considerations.',
    distractors: [
      'Relating to ancient Greek philosophical ideals.',
      'Excessively focused on rules and procedures.',
      'Characterized by a dreamy, idealistic outlook.',
    ],
    difficulty: 4,
  },
  {
    word: 'Scrutinize',
    correctDefinition: 'To examine or inspect something closely and thoroughly.',
    distractors: [
      'To arrange objects in a specific sequence.',
      'To move carefully to avoid detection.',
      'To provide financial support for a project.',
    ],
    difficulty: 4,
  },
  {
    word: 'Tenacious',
    correctDefinition: 'Holding firmly to something; not easily giving up.',
    distractors: [
      'Prone to sudden changes in mood.',
      'Relating to a muscular or physical quality.',
      'Delicate and easily damaged or broken.',
    ],
    difficulty: 4,
  },
  {
    word: 'Verbose',
    correctDefinition: 'Using more words than necessary; wordy.',
    distractors: [
      'Speaking in a very quiet, hushed tone.',
      'Relating to the use of visual images.',
      'Extremely fast or rapid in movement.',
    ],
    difficulty: 4,
  },

  // ── Difficulty 5 ─────────────────────────────────────────────────────────
  {
    word: 'Acrimonious',
    correctDefinition: 'Angry and bitter, especially in speech or manner.',
    distractors: [
      'Having a sharp, pleasant citrus flavor.',
      'Relating to chemical reactions in the body.',
      'Showing calm and composed behavior.',
    ],
    difficulty: 5,
  },
  {
    word: 'Alleviate',
    correctDefinition: 'To make suffering, deficiency, or a problem less severe.',
    distractors: [
      'To raise something to a higher elevation.',
      'To establish a formal legal agreement.',
      'To increase the intensity of a conflict.',
    ],
    difficulty: 5,
  },
  {
    word: 'Ambivalent',
    correctDefinition: 'Having mixed or contradictory feelings about something.',
    distractors: [
      'Capable of using both hands equally well.',
      'Relating to both sides of a debate.',
      'Displaying strong, definite opinions on issues.',
    ],
    difficulty: 5,
  },
  {
    word: 'Auspicious',
    correctDefinition: 'Giving a favorable sign or omen; promising success.',
    distractors: [
      'Relating to the study of birds.',
      'Showing excessive religious devotion.',
      'Causing fear or anxiety about the future.',
    ],
    difficulty: 5,
  },
  {
    word: 'Convoluted',
    correctDefinition: 'Extremely complex and difficult to follow or understand.',
    distractors: [
      'Twisted into a spiral or coiled shape.',
      'Moving together in the same direction.',
      'Relating to a formal legal document.',
    ],
    difficulty: 5,
  },
  {
    word: 'Exacerbate',
    correctDefinition: 'To make a problem, bad situation, or negative feeling worse.',
    distractors: [
      'To remove something completely from a surface.',
      'To cause someone to feel very happy.',
      'To make a detailed examination of something.',
    ],
    difficulty: 5,
  },
  {
    word: 'Ostracize',
    correctDefinition: 'To exclude someone from a society or group.',
    distractors: [
      'To decorate something in an elaborate style.',
      'To arrange items in a specific order.',
      'To publicly praise someone for an achievement.',
    ],
    difficulty: 5,
  },
  {
    word: 'Proliferate',
    correctDefinition: 'To increase rapidly in number; to multiply.',
    distractors: [
      'To prevent something from happening.',
      'To express strong disagreement.',
      'To reduce something to its simplest form.',
    ],
    difficulty: 5,
  },

  // ── Difficulty 6 ─────────────────────────────────────────────────────────
  {
    word: 'Anachronism',
    correctDefinition: 'A thing belonging to a period other than the one in which it exists.',
    distractors: [
      'A system of government with no ruler.',
      'A recurring pattern found in literature.',
      'A medical condition affecting memory.',
    ],
    difficulty: 6,
  },
  {
    word: 'Capricious',
    correctDefinition: 'Given to sudden changes of mood or behavior; unpredictable.',
    distractors: [
      'Relating to Capricorn in astrology.',
      'Showing an excessive interest in food.',
      'Moving in a slow, deliberate manner.',
    ],
    difficulty: 6,
  },
  {
    word: 'Circumspect',
    correctDefinition: 'Cautious and unwilling to take risks; wary.',
    distractors: [
      'Relating to a circular or rounded shape.',
      'Showing great skill in avoiding detection.',
      'Acting quickly without careful consideration.',
    ],
    difficulty: 6,
  },
  {
    word: 'Deleterious',
    correctDefinition: 'Causing harm or damage; harmful.',
    distractors: [
      'Relating to the process of deletion.',
      'Extremely pleasant and enjoyable.',
      'Producing a positive and lasting effect.',
    ],
    difficulty: 6,
  },
  {
    word: 'Equivocal',
    correctDefinition: 'Ambiguous and open to more than one interpretation, often intentionally.',
    distractors: [
      'Treating all people or things equally.',
      'Relating to a fair and just outcome.',
      'Having a perfectly balanced structure.',
    ],
    difficulty: 6,
  },
  {
    word: 'Ignominious',
    correctDefinition: 'Deserving or causing public disgrace or shame.',
    distractors: [
      'Having a complete lack of knowledge.',
      'Showing great religious reverence.',
      'Relating to fire or flames.',
    ],
    difficulty: 6,
  },
  {
    word: 'Inveterate',
    correctDefinition: 'Having a particular habit, activity, or interest that is firmly established.',
    distractors: [
      'Relating to animals without a backbone.',
      'Showing a strong opposition to war.',
      'Recently introduced or newly created.',
    ],
    difficulty: 6,
  },
  {
    word: 'Loquacious',
    correctDefinition: 'Tending to talk a great deal; talkative.',
    distractors: [
      'Relating to a logical form of argument.',
      'Having an extremely loud, booming voice.',
      'Preferring silence and solitary activities.',
    ],
    difficulty: 6,
  },
  {
    word: 'Mendacious',
    correctDefinition: 'Not telling the truth; lying.',
    distractors: [
      'Relating to the mind or intellect.',
      'Showing a willingness to help others.',
      'Excessively focused on small details.',
    ],
    difficulty: 6,
  },

  // ── Difficulty 7 ─────────────────────────────────────────────────────────
  {
    word: 'Aberrant',
    correctDefinition: 'Departing from an accepted standard; abnormal.',
    distractors: [
      'Relating to the behavior of light.',
      'Showing extreme devotion to a cause.',
      'Characterized by sudden bursts of activity.',
    ],
    difficulty: 7,
  },
  {
    word: 'Anathema',
    correctDefinition: 'Something or someone strongly detested or loathed.',
    distractors: [
      'A formal declaration of religious truth.',
      'A branch of medical study.',
      'A deeply held philosophical principle.',
    ],
    difficulty: 7,
  },
  {
    word: 'Diffident',
    correctDefinition: 'Modest or shy due to a lack of self-confidence.',
    distractors: [
      'Holding a completely different viewpoint.',
      'Showing aggressive and domineering behavior.',
      'Relating to spreading across a surface.',
    ],
    difficulty: 7,
  },
  {
    word: 'Enervate',
    correctDefinition: 'To cause someone to feel drained of energy or vitality.',
    distractors: [
      'To strengthen the nervous system.',
      'To fill someone with intense enthusiasm.',
      'To make a medical procedure less painful.',
    ],
    difficulty: 7,
  },
  {
    word: 'Equanimity',
    correctDefinition: 'Mental calmness and composure, especially in difficult situations.',
    distractors: [
      'The quality of being perfectly equal.',
      'A state of physical balance and coordination.',
      'Intense emotional distress or anxiety.',
    ],
    difficulty: 7,
  },
  {
    word: 'Iconoclast',
    correctDefinition: 'A person who attacks or rejects cherished beliefs and institutions.',
    distractors: [
      'An artist who creates religious images.',
      'A strict follower of traditional customs.',
      'A collector of rare and valuable artworks.',
    ],
    difficulty: 7,
  },
  {
    word: 'Insidious',
    correctDefinition: 'Proceeding in a subtle way but with harmful effects.',
    distractors: [
      'Located on the inner side of something.',
      'Extremely bright and dazzling to the eye.',
      'Showing a strong desire for knowledge.',
    ],
    difficulty: 7,
  },
  {
    word: 'Laconic',
    correctDefinition: 'Using very few words; brief and concise in speech or expression.',
    distractors: [
      'Relating to a shiny, coated surface.',
      'Showing great sadness or regret.',
      'Extremely talkative and expressive.',
    ],
    difficulty: 7,
  },
  {
    word: 'Perfidious',
    correctDefinition: 'Deceitful and untrustworthy; guilty of betrayal.',
    distractors: [
      'Having a very pleasant and appealing fragrance.',
      'Relating to a deeply personal feeling.',
      'Showing extreme loyalty and devotion.',
    ],
    difficulty: 7,
  },
  {
    word: 'Recalcitrant',
    correctDefinition: 'Stubbornly defiant of authority or control.',
    distractors: [
      'Showing willingness to cooperate fully.',
      'Relating to a mathematical calculation.',
      'Able to recover quickly from difficulties.',
    ],
    difficulty: 7,
  },
  {
    word: 'Supercilious',
    correctDefinition: 'Behaving as if one is superior to others; disdainful.',
    distractors: [
      'Relating to the surface of something.',
      'Having a very high degree of skill.',
      'Showing genuine interest in other people.',
    ],
    difficulty: 7,
  },

  // ── Difficulty 8 ─────────────────────────────────────────────────────────
  {
    word: 'Abstruse',
    correctDefinition: 'Difficult to understand; obscure.',
    distractors: [
      'Completely irrelevant to the topic.',
      'Physically removed from a situation.',
      'Refreshingly simple and clear.',
    ],
    difficulty: 8,
  },
  {
    word: 'Acumen',
    correctDefinition: 'The ability to make good judgments and quick decisions; shrewdness.',
    distractors: [
      'A sharp or pointed implement.',
      'A state of intense physical pain.',
      'The process of accumulating wealth.',
    ],
    difficulty: 8,
  },
  {
    word: 'Assiduous',
    correctDefinition: 'Showing great care, attention, and effort in work; diligent.',
    distractors: [
      'Relating to a formal educational process.',
      'Acting without sufficient preparation.',
      'Having an unpleasant or sour taste.',
    ],
    difficulty: 8,
  },
  {
    word: 'Bellicose',
    correctDefinition: 'Demonstrating aggression and willingness to fight.',
    distractors: [
      'Having a very pleasant and attractive quality.',
      'Relating to bells and musical instruments.',
      'Showing great generosity towards others.',
    ],
    difficulty: 8,
  },
  {
    word: 'Garrulous',
    correctDefinition: 'Excessively talkative, especially on trivial matters.',
    distractors: [
      'Relating to the stomach and digestion.',
      'Having a rough or unpleasant texture.',
      'Keeping to oneself; antisocial.',
    ],
    difficulty: 8,
  },
  {
    word: 'Meretricious',
    correctDefinition: 'Apparently attractive but having no real value; showy.',
    distractors: [
      'Deserving great praise and recognition.',
      'Relating to legal merit in a case.',
      'Showing genuine virtue and integrity.',
    ],
    difficulty: 8,
  },
  {
    word: 'Obsequious',
    correctDefinition: 'Excessively eager to please or serve; fawning.',
    distractors: [
      'Relating to funeral or burial rites.',
      'Blocking or hindering progress.',
      'Openly challenging authority and norms.',
    ],
    difficulty: 8,
  },
  {
    word: 'Perspicacious',
    correctDefinition: 'Having a ready insight into things; shrewd and perceptive.',
    distractors: [
      'Having a tendency to sweat excessively.',
      'Showing a clear and transparent quality.',
      'Lacking the ability to observe details.',
    ],
    difficulty: 8,
  },
  {
    word: 'Pusillanimous',
    correctDefinition: 'Showing a lack of courage or determination; timid.',
    distractors: [
      'Showing extreme physical strength.',
      'Relating to philosophical idealism.',
      'Acting with reckless, fearless abandon.',
    ],
    difficulty: 8,
  },
  {
    word: 'Tendentious',
    correctDefinition: 'Promoting a particular cause or point of view; biased.',
    distractors: [
      'Relating to a physical tendon or muscle.',
      'Showing a gentle or caring quality.',
      'Presenting a balanced, impartial viewpoint.',
    ],
    difficulty: 8,
  },

  // ── Difficulty 9 ─────────────────────────────────────────────────────────
  {
    word: 'Aplomb',
    correctDefinition: 'Self-confidence and composure, especially in difficult situations.',
    distractors: [
      'A type of fruit resembling a plum.',
      'A severe lack of confidence.',
      'The process of falling straight downward.',
    ],
    difficulty: 9,
  },
  {
    word: 'Crepuscular',
    correctDefinition: 'Relating to or resembling twilight; active at dawn or dusk.',
    distractors: [
      'Relating to a crispy or crunchy texture.',
      'Having a very old or ancient quality.',
      'Producing a loud, harsh sound.',
    ],
    difficulty: 9,
  },
  {
    word: 'Egregious',
    correctDefinition: 'Outstandingly bad; shockingly wrong.',
    distractors: [
      'Standing out as an exceptional achievement.',
      'Relating to a large social group.',
      'Showing great care and thoroughness.',
    ],
    difficulty: 9,
  },
  {
    word: 'Execrable',
    correctDefinition: 'Extremely bad or unpleasant; detestable.',
    distractors: [
      'Able to be carried out or executed.',
      'Relating to a formal legal execution.',
      'Worthy of high praise and admiration.',
    ],
    difficulty: 9,
  },
  {
    word: 'Lugubrious',
    correctDefinition: 'Looking or sounding sad and dismal; mournful.',
    distractors: [
      'Warm and humid, as in tropical climates.',
      'Relating to liquid or fluid properties.',
      'Excessively cheerful and positive.',
    ],
    difficulty: 9,
  },
  {
    word: 'Machiavellian',
    correctDefinition: 'Using clever or cunning strategies, especially in a deceptive way.',
    distractors: [
      'Relating to Italian Renaissance architecture.',
      'Showing a principled and transparent approach.',
      'Demonstrating great mechanical skill.',
    ],
    difficulty: 9,
  },
  {
    word: 'Sanguine',
    correctDefinition: 'Optimistic and positive, especially in a difficult situation.',
    distractors: [
      'Relating to blood or the circulatory system.',
      'Showing extreme pessimism about the future.',
      'Having a deep red or crimson color.',
    ],
    difficulty: 9,
  },
  {
    word: 'Tendentious',
    correctDefinition: 'Promoting a particular point of view; biased.',
    distractors: [
      'Relating to physical tendons.',
      'Showing extreme impartiality.',
      'Having a gentle or soft quality.',
    ],
    difficulty: 9,
  },

  // ── Difficulty 10 ────────────────────────────────────────────────────────
  {
    word: 'Concatenation',
    correctDefinition: 'A series of interconnected things or events; a chain.',
    distractors: [
      'The process of combining two substances.',
      'A method of musical composition.',
      'The study of ancestral lineages.',
    ],
    difficulty: 10,
  },
  {
    word: 'Defenestrate',
    correctDefinition: 'To throw someone or something out of a window.',
    distractors: [
      'To remove all forests from a region.',
      'To strip someone of their official rank.',
      'To block all windows in a building.',
    ],
    difficulty: 10,
  },
  {
    word: 'Eleemosynary',
    correctDefinition: 'Relating to or dependent on charity; charitable.',
    distractors: [
      'Relating to elementary school education.',
      'Having a very basic or simple nature.',
      'Relating to chemical elements.',
    ],
    difficulty: 10,
  },
  {
    word: 'Loquacity',
    correctDefinition: 'The quality of talking a great deal; talkativeness.',
    distractors: [
      'A logical system of argumentation.',
      'The quality of being excessively quiet.',
      'A method of persuasive rhetoric.',
    ],
    difficulty: 10,
  },
  {
    word: 'Nugatory',
    correctDefinition: 'Of no value or importance; futile.',
    distractors: [
      'Relating to gold or precious metals.',
      'Having great strategic significance.',
      'Containing a small, dense core.',
    ],
    difficulty: 10,
  },
  {
    word: 'Perspicuity',
    correctDefinition: 'The quality of being clearly expressed and easily understood.',
    distractors: [
      'The tendency to sweat profusely.',
      'Extreme sharpness of perception.',
      'Deliberate vagueness in communication.',
    ],
    difficulty: 10,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const colRef = db.collection('words');

  // Build a set of existing words to avoid duplicates
  console.log('📖  Fetching existing words…');
  const existing = await colRef.get();
  const existingWords = new Set(existing.docs.map((d) => d.data().word?.toLowerCase()));
  console.log(`   Found ${existingWords.size} existing word(s).`);

  // Filter to only new words
  const toAdd = WORDS.filter((w) => !existingWords.has(w.word.toLowerCase()));
  console.log(`   Adding ${toAdd.length} new word(s) (${WORDS.length - toAdd.length} skipped as duplicates).`);

  if (toAdd.length > 0) {
    // Firestore batch limit is 500; chunk if needed
    const CHUNK = 400;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
      const batch = db.batch();
      for (const word of toAdd.slice(i, i + CHUNK)) {
        batch.set(colRef.doc(), word);
      }
      await batch.commit();
    }
    console.log(`✅  Added ${toAdd.length} words.`);
  }

  // Write game config (always overwrite so values are current)
  console.log('\n⚙️   Writing config/game…');
  await db.collection('config').doc('game').set(GAME_CONFIG);
  console.log(`✅  config/game set:`, GAME_CONFIG);

  console.log('\n🎮  All done — you can run the game now!');
}

run().catch((err) => {
  console.error('❌  Failed:', err);
  process.exit(1);
});
