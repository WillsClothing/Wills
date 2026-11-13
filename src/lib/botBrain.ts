// Free-text understanding for Wills bot. No AI and no server: it cleans up the
// message (slang, typos), splits it into separate questions, and scores each one
// against weighted keywords, so "hw much is delivry & can i pay cash" becomes
// two answers: delivery and payment.

export type IntentId =
  | 'greet'
  | 'thanks'
  | 'bye'
  | 'howAreYou'
  | 'compliment'
  | 'botSelf'
  | 'laugh'
  | 'yes'
  | 'no'
  | 'sizeRequired'
  | 'offers'
  | 'socials'
  | 'invoice'
  | 'track'
  | 'exchanges'
  | 'delivery'
  | 'payment'
  | 'sizeHelp'
  | 'colours'
  | 'prices'
  | 'newest'
  | 'order'
  | 'human'
  | 'finder'
  | 'shop';

/** Each keyword is a regex fragment matched on whole words; plurals match too. Higher weight = stronger signal. */
const INTENT_KEYWORDS: Record<IntentId, [string, number][]> = {
  greet: [['hi', 2], ['hii+', 2], ['hello', 2], ['hey', 2], ['helo', 2], ['yo', 1], ['salam', 2], ['assalamu alaikum', 3], ['ayubowan', 3], ['good (morning|afternoon|evening)', 3], ['greetings', 2]],
  thanks: [['thanks?', 4], ['thank you', 4], ['thx', 4], ['ty', 3], ['tnx', 4], ['appreciate', 3], ['sthuthi', 4], ['isthuthi', 4], ['stuti', 4], ['bohoma sthuthi', 5]],
  bye: [['bye', 4], ['goodbye', 4], ['good night', 3], ['see you', 3], ['see ya', 3], ['cya', 3], ['later', 1], ['gotta go', 3], ['ttyl', 3]],
  howAreYou: [['how are you', 5], ['how r you', 5], ['hows it going', 4], ['how is it going', 4], ['whats up', 3], ['sup', 2], ['how do you do', 4], ['kohomada', 4]],
  compliment: [['love (it|this|your|wills|you|the)', 4], ['awesome', 3], ['amazing', 3], ['great (site|website|shop|store|clothes|bot|job)', 4], ['nice (site|website|shop|store|clothes|bot)', 4], ['beautiful', 2], ['cool (site|bot|shop)', 3], ['you are (great|awesome|amazing|helpful|the best)', 5], ['good bot', 5], ['helpful', 2], ['(clothes|shirts?|t-shirts?|tees?|stuff|collection|designs?|products?|quality) (are|is|look\\w*) (so |really |very )?(nice|great|amazing|awesome|cool|beautiful|good|lovely)', 5]],
  botSelf: [['are you (a )?(bot|robot|real|human|ai|machine|person)', 6], ['is this (a )?(bot|robot|real person|human|ai)', 6], ['who (made|built|created) you', 6], ['your name', 4], ['who am i talking to', 6], ['what can you do', 6], ['how can you help', 5], ['help', 3]],
  laugh: [['lol', 3], ['haha\\w*', 3], ['hehe\\w*', 3], ['lmao', 3], ['rofl', 3]],
  yes: [['yes', 2], ['yeah', 2], ['yep', 2], ['ya', 1], ['sure', 2], ['ok', 2], ['okay', 2], ['alright', 2], ['cool', 2], ['great', 2], ['ow', 1], ['ow ow', 2]],
  no: [['no', 2], ['nope', 2], ['nah', 2], ['not now', 3], ['no thanks', 4], ['nothing', 2], ['im good', 3], ['thats all', 4], ['thats it', 3], ['nathi', 2], ['epa', 2]],
  sizeRequired: [['without (a |any )?size', 6], ['no size', 4], ['size (is )?(needed|required|mandatory|compulsory|a must)', 6], ['skip (the )?size', 5], ['need (to pick|to choose|a) size', 5]],
  offers: [['offers?', 4], ['deals?', 4], ['discounts?', 4], ['promo\\w*', 4], ['combos?', 4], ['sale', 3], ['bundle', 3], ['buy \\w+ get', 4], ['coupon', 4], ['voucher', 4], ['special', 2], ['off', 1]],
  socials: [['insta\\w*', 4], ['ig', 3], ['facebook', 4], ['fb', 4], ['social\\w*', 3], ['follow', 3], ['tiktok', 4], ['page', 1]],
  invoice: [['invoice', 5], ['receipt', 4], ['bill', 3]],
  track: [['track\\w*', 5], ['where is my', 5], ['status of my', 5], ['order status', 6], ['not (yet )?(received|arrived|came)', 5], ['still waiting', 4], ['when will (my|it|the parcel|the order)', 4], ['my (order|parcel)', 3], ['parcel', 2]],
  exchanges: [['return\\w*', 4], ['exchange\\w*', 5], ['refund\\w*', 5], ['wrong (size|item|colou?r)', 5], ['damaged', 5], ['defect\\w*', 5], ['too (small|big|tight|loose)', 4], ['doesnt fit', 4], ['change (the |my )?size', 4], ['swap', 3]],
  delivery: [['deliver\\w*', 4], ['shipping', 4], ['ship', 3], ['courier', 4], ['free delivery', 6], ['how long', 3], ['how many days', 4], ['arrive', 3], ['days', 1], ['dispatch\\w*', 3], ['delivery (cost|charge|fee)', 6], ['island ?wide', 4], ['outstation', 4], ['colombo', 3], ['kandy', 3], ['galle', 3], ['jaffna', 3], ['to my (home|house|place|city|town)', 4], ['when will i get', 4], ['by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)', 4]],
  payment: [['pay\\w*', 4], ['cash', 3], ['cod', 5], ['cash on delivery', 8], ['bank', 4], ['transfer', 3], ['card', 3], ['credit', 3], ['debit', 3], ['koko', 4], ['installment\\w*', 4], ['online payment', 6], ['account (number|details)', 5]],
  sizeHelp: [['size chart', 6], ['size guide', 6], ['sizing', 5], ['measure\\w*', 4], ['fit', 3], ['fits', 3], ['chest', 4], ['waist', 4], ['length', 3], ['which size', 5], ['what size', 5], ['my size', 3], ['size', 2], ['sizes', 2], ['true to size', 6], ['run (small|big|large)', 5], ['oversized?', 3], ['height', 3], ['weight', 3], ['kg', 2], ['cm', 2], ['inch\\w*', 2]],
  colours: [['colou?rs?', 4], ['shades?', 3], ['what colou?rs', 5]],
  prices: [['cheap\\w*', 3], ['price\\w*', 4], ['cost\\w*', 3], ['how much', 3], ['budget', 3], ['expensive', 2], ['rate', 2], ['rs', 2], ['lkr', 3], ['kiyada', 4], ['keeyada', 4], ['ganan', 3], ['under \\d+', 4], ['below \\d+', 4]],
  newest: [['new', 2], ['whats new', 5], ['anything new', 5], ['new (arrivals?|stock|items?|collection|drops?|designs?|styles?)', 5], ['latest', 4], ['arrivals?', 4], ['drop', 3], ['restock\\w*', 3], ['coming soon', 4], ['just in', 3], ['fresh', 2]],
  order: [['order', 3], ['buy', 3], ['checkout', 4], ['purchase', 3], ['place (an |my )?order', 6], ['how (do|can|to) (i )?(order|buy|purchase)', 7], ['add to cart', 4], ['cart', 2], ['ganna', 3]],
  human: [['human', 4], ['person', 3], ['agent', 4], ['contact', 4], ['whatsapp', 4], ['call', 3], ['talk', 3], ['phone', 3], ['number', 2], ['email', 3], ['owner', 3], ['manager', 3], ['complain\\w*', 4], ['speak', 3], ['wholesale', 6], ['bulk', 6]],
  finder: [['find', 3], ['help me (find|choose|pick|select)', 7], ['recommend\\w*', 4], ['suggest\\w*', 4], ['outfit', 4], ['looking for', 4], ['show me', 3], ['what do you (have|sell)', 5], ['what (items|products|clothes)', 4], ['catalog\\w*', 4], ['collection', 3], ['in stock', 3], ['available', 2], ['gift', 3], ['for (a |my )?(party|wedding|gym|work|office|date|trip)', 4], ['do you (have|sell|got)', 3], ['thiyenawada', 4], ['thiyanawada', 4]],
  shop: [['location', 4], ['located', 4], ['address', 4], ['physical (shop|store)', 6], ['visit (the |your )?(shop|store)', 6], ['open(ing)? hours', 6], ['are you open', 6], ['what time', 3], ['showroom', 5], ['outlet', 4]],
};

/** Intents that only answer a short message on its own ("ok", "no"), not one word inside a longer question. */
const SHORT_ONLY = new Set<IntentId>(['yes', 'no', 'laugh']);
/** Social intents that should not pull focus from a real question in the same message. */
export const SOCIAL = new Set<IntentId>(['greet', 'thanks', 'bye', 'howAreYou', 'compliment', 'laugh', 'yes', 'no']);

const COMPILED = (Object.entries(INTENT_KEYWORDS) as [IntentId, [string, number][]][]).map(([id, words]) => ({
  id,
  words: words.map(([w, weight]) => ({ re: new RegExp(`\\b(?:${w})(?:s|es)?\\b`), weight })),
}));

/** Chat shorthand and common misspellings, applied before anything else. */
const SLANG: [RegExp, string][] = [
  [/\bu\b/g, 'you'],
  [/\bur\b/g, 'your'],
  [/\br\b/g, 'are'],
  [/\bpl[sz]e?\b/g, 'please'],
  [/\bwat\b|\bwht\b/g, 'what'],
  [/\bhw\b/g, 'how'],
  [/\babt\b/g, 'about'],
  [/\bhv\b/g, 'have'],
  [/\bwanna\b/g, 'want to'],
  [/\bgimme\b/g, 'give me'],
  [/\bthx\b|\bty\b|\btnx\b|\btq\b/g, 'thanks'],
  [/\bcn\b/g, 'can'],
  [/\bwt\b/g, 'what'],
  [/\bdo u\b/g, 'do you'],
  [/\bn\b/g, 'and'],
  [/&/g, ' and '],
  [/\bt[- ]?shirts?\b|\btshirts?\b|\bt shirts?\b/g, 't-shirt'],
  [/\bcolour/g, 'color'],
  [/\bfavou?rite\b/g, 'favourite'],
  [/\bsri ?lanka\b/g, 'srilanka'],
  [/\bwhats ?app\b|\bwatsapp\b|\bwhtsapp\b|\bwa\b/g, 'whatsapp'],
  [/\bhow\s*much\b/g, 'how much'],
];

/** Everyday words that must never be "corrected" into a keyword (want → wait, have → save…). */
const KEEP = new Set(
  `a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing done down during each even ever every few for from get gets give go goes going gone got had has have having he her here hers him his how i if in into is it its just know like look looks make many may me might mine more most much must my need no nor not now of off on once one only or other our out over own same she should so some still such than that the their them then there these they thing think this those through to too under until up us very want wanted was way we well were what when where which while who whom why will with would yes yet you your yours im ive id dont doesnt cant wont isnt arent didnt thats whats hows theres lets also got guys item items thing things good nice bad sure okay right left time today now soon tomorrow week weeks month day night morning evening sell sells store shop stock wear wore worn look`.split(' '),
);

/** Words worth correcting typos towards: every keyword word plus brand words and the live catalogue. */
const BASE_VOCAB = new Set<string>([
  ...Object.values(INTENT_KEYWORDS)
    .flat()
    .flatMap(([w]) => w.replace(/\\w\*|\\d\+|\(\?:|[()?|*+\\]/g, ' ').split(/\s+/))
    .filter((w) => /^[a-z-]{4,}$/.test(w)),
  ...'slogan tagline motto premium luxury trending popular lifestyle fabric material cotton quality trust legit genuine reliable affordable expensive different unique wardrobe another easy simple difficult wait wills brand clothing clothes shirt shirts shorts hoodie hoodies trousers pants jeans polo tees oversized color colors'.split(' '),
]);

/** Optimal string alignment distance (Levenshtein plus swapped neighbours), capped for speed. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Rough sound-alike key: "sise" and "size" match, "site" does not. */
const sound = (w: string) => w.replace(/ph/g, 'f').replace(/z/g, 's').replace(/k/g, 'c').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');

/** Fixes one word if it is a likely typo of a known word ("delivry" → "delivery"). */
function correctWord(w: string, vocab: Set<string>): string {
  if (w.length < 4 || vocab.has(w) || KEEP.has(w) || /\d/.test(w)) return w;
  const max = w.length >= 7 ? 2 : 1;
  let bestD = max + 1;
  let best: string[] = [];
  for (const v of vocab) {
    if (v[0] !== w[0] && !(w.length >= 6 && v[1] === w[1])) continue; // typos rarely change the first letter
    const dist = editDistance(w, v, max);
    if (dist < bestD) {
      best = [v];
      bestD = dist;
    } else if (dist === bestD) best.push(v);
  }
  // "sise" is as close to "size" as to "sizes": count a word and its plural as one candidate.
  let distinct = best.filter((v) => !best.some((o) => o !== v && (v === `${o}s` || v === `${o}es`)));
  // Still tied ("sise": size or site?): prefer the one that sounds the same.
  if (distinct.length > 1) distinct = distinct.filter((v) => sound(v) === sound(w));
  return bestD <= max && distinct.length === 1 ? distinct[0] : w;
}

/** Lowercases, expands slang, strips punctuation (keeping hyphens) and corrects typos. */
export function normalize(text: string, extraVocab: Iterable<string> = []): string {
  let s = ` ${text.toLowerCase().replace(/[’‘`]/g, "'")} `;
  for (const [re, to] of SLANG) s = s.replace(re, to);
  s = s.replace(/'/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const vocab = new Set(BASE_VOCAB);
  for (const w of extraVocab) if (w.length >= 4) vocab.add(w.toLowerCase());
  return s
    .split(' ')
    .map((w) => correctWord(w, vocab))
    .join(' ');
}

/** "hw much is delivery and can i pay cash" → ["hw much is delivery", "can i pay cash"]. */
export function splitClauses(normalized: string): string[] {
  return normalized
    .split(/\s*(?:\b(?:and also|also|and|plus|btw|by the way|then|but)\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function scoreClause(clause: string): { id: IntentId; score: number }[] {
  const wordCount = clause.split(' ').length;
  return COMPILED.map(({ id, words }) => ({
    id,
    score: SHORT_ONLY.has(id) && wordCount > 3 ? 0 : words.reduce((sum, w) => sum + (w.re.test(clause) ? w.weight : 0), 0),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export interface Understanding {
  /** Cleaned-up text, for brand questions and product search. */
  text: string;
  /** Intents to answer, in the order asked, social ones first. */
  intents: IntentId[];
  /** Close-but-unsure intents, offered as "Did you mean…" buttons when nothing else matched. */
  maybe: IntentId[];
}

const THRESHOLD = 3;

export function understand(message: string, extraVocab: Iterable<string> = []): Understanding {
  const text = normalize(message, extraVocab);
  // Clauses split on question marks and full stops first (from the raw message), then on "and/also".
  const raw = message.split(/[?.!;\n,]+/).map((p) => normalize(p, extraVocab)).filter(Boolean);
  const clauses = raw.flatMap((p) => {
    const parts = splitClauses(p);
    // Keep "cash on delivery" or "black and white" together when splitting would leave a fragment with no intent.
    return parts.every((x) => scoreClause(x)[0]?.score >= THRESHOLD) ? parts : [p];
  });

  const intents: IntentId[] = [];
  const maybe: IntentId[] = [];
  for (const clause of clauses) {
    const ranked = scoreClause(clause);
    const top = ranked[0];
    if (!top) continue;
    if (top.score >= THRESHOLD || (SOCIAL.has(top.id) && top.score >= 2)) {
      if (!intents.includes(top.id)) intents.push(top.id);
      // A greeting stuck to a question ("hi, do you deliver?") is kept alongside it.
      const second = ranked[1];
      if (second && second.score >= (SOCIAL.has(second.id) ? 2 : THRESHOLD) && SOCIAL.has(top.id) !== SOCIAL.has(second.id) && !intents.includes(second.id)) intents.push(second.id);
    } else {
      for (const r of ranked.slice(0, 3)) if (!SOCIAL.has(r.id) && !maybe.includes(r.id)) maybe.push(r.id);
    }
  }
  // Answer the social part first ("thanks! and do you deliver?"), and drop a bare
  // yes/no/laugh when a real question came with it.
  const real = intents.filter((i) => !SOCIAL.has(i));
  const social = intents.filter((i) => SOCIAL.has(i) && !(real.length && ['yes', 'no', 'laugh'].includes(i)));
  return { text, intents: [...social, ...real], maybe };
}

/** "it", "this one", "that" refer to the product the bot showed last. */
export const refersBack = (text: string) => /\b(it|this|that|this one|that one|the same|same one|them|these|those)\b/.test(text);
