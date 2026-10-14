import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart, sizeInCart } from '../lib/cart';
import { formatPrice, sortSizes } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product, Promotion, SizeChart } from '../lib/types';
import { whatsappLink } from '../lib/whatsapp';
import Logo from './Logo';
import { openOffers } from './Offers';
import { SOCIALS } from './Socials';

// "Wills bot": a guided shopping assistant that runs entirely in the browser.
// It only reads the live catalogue and can add items to the cart; like the rest
// of the shop it never changes stock.

interface Message {
  id: number;
  who: 'bot' | 'user';
  body: ReactNode;
}

interface Option {
  label: string;
  run: () => void;
}

interface Finder {
  category?: string;
  size?: string;
  maxPrice?: number;
  minPrice?: number;
}

const ANY = 'Anything';

const STOP_WORDS = new Set(
  'the and you for with have any are can show want need some what which this that your from please looking much how does'.split(' '),
);

function inStock(p: Product): boolean {
  return p.status === 'available' && p.product_sizes.some((s) => s.stock > 0);
}

/** Delivery promise shown across the shop. */
const DELIVERY_DAYS = '3 to 4 working days';

/** A size the customer typed: "XL", "size m", "in L" or "free size". Single letters only count in capitals or after "size". */
function sizeIn(original: string): string | undefined {
  if (/free\s*size/i.test(original)) return 'Free size';
  const after = original.match(/\bsize\s+(xxxl|3xl|2xl|xxl|xl|xs|s|m|l)\b/i);
  if (after) return after[1].toUpperCase();
  const longer = original.match(/\b(xxxl|3xl|2xl|xxl|xl|xs)\b/i);
  if (longer) return longer[1].toUpperCase();
  const single = original.match(/\b(S|M|L)\b/);
  return single?.[1];
}

const sameSize = (a: string, b: string) => {
  const norm = (x: string) => x.toUpperCase().replace(/\s+/g, '').replace(/^XXXL$/, '3XL').replace(/^XXL$/, '2XL');
  return norm(a) === norm(b);
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export default function WillsBot() {
  const { products, settings, promotions } = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());

  const available = useMemo(() => products.filter(inStock), [products]);
  const c = settings.currency;
  const wa = (msg: string) => whatsappLink(settings.whatsapp_number, msg);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, options]);

  function push(who: Message['who'], body: ReactNode) {
    setMessages((m) => [...m, { id: nextId.current++, who, body }]);
  }

  /** Queues a bot message with a short "typing" pause so replies feel conversational. */
  function say(body: ReactNode, delay = 600) {
    queue.current = queue.current.then(
      () =>
        new Promise<void>((resolve) => {
          setTyping(true);
          setTimeout(() => {
            setTyping(false);
            push('bot', body);
            resolve();
          }, delay);
        }),
    );
    return queue.current;
  }

  function offer(opts: Option[]) {
    setOptions([]);
    queue.current = queue.current.then(() => setOptions(opts));
  }

  function choose(label: string, run: () => void) {
    setOptions([]);
    push('user', label);
    run();
  }

  // ---------------------------------------------------------------- menu

  function menuOptions(): Option[] {
    return [
      { label: 'Find an outfit', run: startFinder },
      ...(promotions.length ? [{ label: 'Offers', run: offers }] : []),
      { label: 'How do I order?', run: howToOrder },
      { label: 'Delivery', run: delivery },
      { label: 'Payment options', run: payment },
      { label: 'Size guide', run: sizeHelp },
      { label: 'Follow us', run: socials },
      { label: 'Talk to a person', run: human },
    ];
  }

  function anythingElse() {
    say('Anything else I can help with?', 500);
    offer(menuOptions());
  }

  function greet() {
    say(
      <>
        Hi, I'm <strong>Wills bot</strong>. I can find something to wear, check if a size or colour is in stock, show
        size charts and explain ordering. Delivery is <strong>free island wide</strong>.
      </>,
      400,
    );
    say('What would you like to do?', 500);
    offer(menuOptions());
  }

  // -------------------------------------------------------------- finder

  function startFinder() {
    if (!available.length) {
      say("Everything is sold out right now. New stock is on the way, so ask us on WhatsApp what's coming next.");
      say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! What new stock is coming soon?`)} label="Ask on WhatsApp" />, 300);
      return anythingElse();
    }
    const cats = Array.from(new Set(available.map((p) => p.category).filter(Boolean))).sort();
    if (cats.length < 2) return askSize({});
    say('What are you shopping for?');
    offer([...cats, ANY].map((cat) => ({ label: cat, run: () => askSize({ category: cat === ANY ? undefined : cat }) })));
  }

  function matching(f: Finder): Product[] {
    return available.filter(
      (p) =>
        (!f.category || p.category === f.category) &&
        (!f.size || p.product_sizes.some((s) => s.size === f.size && s.stock > 0)) &&
        (f.maxPrice === undefined || p.price < f.maxPrice) &&
        (f.minPrice === undefined || p.price >= f.minPrice),
    );
  }

  function askSize(f: Finder) {
    const sizes = new Map<string, number>();
    for (const p of matching(f)) {
      for (const s of p.product_sizes) if (s.stock > 0 && !sizes.has(s.size)) sizes.set(s.size, s.sort_order);
    }
    const list = [...sizes.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
    if (list.length < 2) return askBudget(f);
    say('Which size do you wear?');
    offer([...list, 'Any size'].map((s) => ({ label: s, run: () => askBudget({ ...f, size: s === 'Any size' ? undefined : s }) })));
  }

  function askBudget(f: Finder) {
    const prices = matching(f).map((p) => p.price);
    const mid = median(prices);
    if (prices.length < 3 || Math.min(...prices) === Math.max(...prices)) return showResults(f);
    say("What's your budget?");
    offer([
      { label: `Under ${formatPrice(mid, c)}`, run: () => showResults({ ...f, maxPrice: mid }) },
      { label: `${formatPrice(mid, c)} and up`, run: () => showResults({ ...f, minPrice: mid }) },
      { label: 'Any budget', run: () => showResults(f) },
    ]);
  }

  function showResults(f: Finder) {
    const found = matching(f).slice(0, 4);
    if (!found.length) {
      say("I couldn't find anything in stock for that combination. Try a different size or budget?");
      offer([{ label: 'Start again', run: startFinder }, ...menuOptions().slice(1)]);
      return;
    }
    say(found.length === 1 ? 'Here is what I found:' : `Here are ${found.length} picks for you:`, 700);
    for (const p of found) say(<ProductTile product={p} size={f.size} onView={() => setOpen(false)} />, 250);
    anythingElse();
  }

  // ------------------------------------------------------------- answers

  function howToOrder() {
    say(
      <ol className="bot-list">
        <li>Open a product, pick your colour, size and quantity, then press <strong>Add to cart</strong> (or <strong>Buy it now</strong>).</li>
        <li>In the cart, enter your name, phone and delivery address.</li>
        <li>Choose <strong>Cash on Delivery</strong> or <strong>Bank transfer</strong>.</li>
        <li>Press <strong>Order on WhatsApp</strong>. Your full order is sent to us and we confirm it there.</li>
      </ol>,
      800,
    );
    say(`No online payment is needed, and nothing is reserved until we confirm on WhatsApp. Delivery is free island wide and takes ${DELIVERY_DAYS}.`, 500);
    anythingElse();
  }

  function payment() {
    say(
      <>
        You can pay by <strong>Cash on Delivery</strong>, or by <strong>bank transfer</strong> and then send the
        receipt to us on WhatsApp.
      </>,
    );
    if (settings.bank_details) {
      say(
        <>
          Bank details:
          <div className="bot-bank">{settings.bank_details}</div>
        </>,
        500,
      );
    }
    anythingElse();
  }

  function delivery() {
    say(
      <>
        Delivery is <strong>free, island wide</strong>. Your order reaches you in <strong>{DELIVERY_DAYS}</strong> after we
        confirm it on WhatsApp.
      </>,
    );
    if (settings.delivery_note) say(settings.delivery_note, 400);
    anythingElse();
  }

  const charted = () => products.filter((p) => p.status !== 'unavailable' && p.size_chart && (p.size_chart.rows.length || p.size_chart.image));

  function sizeHelp() {
    const list = charted();
    say('On every product page, tap Size & fit guide to see its measurements. Sizes that are crossed out are sold out.');
    if (list.length) {
      say('Which product would you like the size chart for?', 500);
      offer([
        ...list.slice(0, 6).map((p) => ({ label: p.name, run: () => showChart(p) })),
        { label: 'Ask on WhatsApp', run: sizeOnWhatsApp },
      ]);
      return;
    }
    sizeOnWhatsApp();
  }

  function sizeOnWhatsApp() {
    say('Not sure which size fits? Tell us your usual size or measurements on WhatsApp and we will help you choose.', 500);
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! Can you help me with sizing?`)} label="Ask about sizing" />, 300);
    anythingElse();
  }

  function showChart(p: Product) {
    const chart = p.size_chart!;
    say(<ChartCard name={p.name} chart={chart} />, 700);
    if (chart.note) say(chart.note, 400);
    say(<ProductTile product={p} onView={() => setOpen(false)} />, 250);
    anythingElse();
  }

  function offers() {
    if (!promotions.length) {
      say('There are no offers running right now. Follow us on Instagram to hear about the next one.');
      return socials();
    }
    say(promotions.length === 1 ? 'There is one offer on right now:' : `There are ${promotions.length} offers on right now:`);
    for (const promo of promotions.slice(0, 4)) say(<OfferTile promo={promo} products={products} currency={c} />, 300);
    say(
      <button
        type="button"
        className="btn btn-sm btn-gold"
        onClick={() => {
          setOpen(false);
          openOffers();
        }}
      >
        See all offers
      </button>,
      200,
    );
    anythingElse();
  }

  function socials() {
    say('Follow us for new drops and offers:');
    say(
      <div className="row" style={{ gap: 6 }}>
        {SOCIALS.map((so) => (
          <a key={so.name} className="btn btn-sm btn-outline" href={so.href} target="_blank" rel="noreferrer">
            {so.name}
          </a>
        ))}
      </div>,
      300,
    );
    anythingElse();
  }

  function invoice() {
    say('Yes. Once your order is confirmed and sent, we share an invoice with you on WhatsApp, with your items, colour, size and total.');
    anythingElse();
  }

  function track() {
    say(`Orders arrive in ${DELIVERY_DAYS}. For an update on yours, message us on WhatsApp with your name or invoice number.`);
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! Could you tell me the status of my order?`)} label="Ask about my order" />, 300);
    anythingElse();
  }

  function exchanges() {
    say('For an exchange or any problem with your order, message us on WhatsApp and our team will sort it out.');
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! I have a question about an exchange.`)} label="Message us" />, 300);
    anythingElse();
  }

  function colours() {
    const names = new Map<string, number>();
    for (const p of available) for (const col of p.colors) if (colorHasStock(p, col.name)) names.set(col.name, (names.get(col.name) ?? 0) + 1);
    if (!names.size) {
      say('Our pieces in stock right now come in one colour each. Open a product to see it.');
      return anythingElse();
    }
    say(
      <>
        Colours in stock right now: <strong>{[...names.keys()].join(', ')}</strong>. Ask me for one, for example{' '}
        <em>"black tee in L"</em>.
      </>,
    );
    anythingElse();
  }

  function prices() {
    if (!available.length) return startFinder();
    const sorted = [...available].sort((a, b) => a.price - b.price);
    const lo = sorted[0].price;
    const hi = sorted[sorted.length - 1].price;
    say(lo === hi ? `Everything in stock is ${formatPrice(lo, c)}, with free delivery.` : `Prices run from ${formatPrice(lo, c)} to ${formatPrice(hi, c)}, with free delivery. Here are the best value picks:`);
    for (const p of sorted.slice(0, 3)) say(<ProductTile product={p} onView={() => setOpen(false)} />, 250);
    anythingElse();
  }

  function newest() {
    if (!available.length) return startFinder();
    const fresh = [...available].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
    say('Our newest pieces:');
    for (const p of fresh) say(<ProductTile product={p} onView={() => setOpen(false)} />, 250);
    anythingElse();
  }

  // ------------------------------------------------- stock by colour and size

  function colorHasStock(p: Product, colour: string): boolean {
    const perColor = p.product_sizes.some((v) => v.color);
    return p.product_sizes.some((v) => v.stock > 0 && (!perColor || v.color.toLowerCase() === colour.toLowerCase()));
  }

  /** "Do you have the black tee in L?" Answers from live stock per colour and size. */
  function stockCheck(original: string, lower: string): boolean {
    const allColours = [...new Set(products.flatMap((p) => p.colors.map((col) => col.name)))].sort((a, b) => b.length - a.length);
    const colour = allColours.find((n) => new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
    const size = sizeIn(original);
    if (!colour && !size) return false;

    // Narrow by product words (name / type) if any were given.
    const rest = lower.replace(colour?.toLowerCase() ?? '\u0000', ' ');
    const named = search(rest);
    const pool = (named.length ? named : products).filter((p) => p.status === 'available');

    const hits = pool.filter((p) => {
      if (colour && !p.colors.some((col) => col.name.toLowerCase() === colour.toLowerCase())) return false;
      const perColor = p.product_sizes.some((v) => v.color);
      return p.product_sizes.some(
        (v) => v.stock > 0 && (!size || sameSize(v.size, size)) && (!colour || !perColor || v.color.toLowerCase() === colour.toLowerCase()),
      );
    });
    const want = [colour, size && `size ${size}`].filter(Boolean).join(', ');
    if (!hits.length) {
      say(`Sorry, nothing is in stock in ${want} right now.`);
      // Suggest the nearest thing: the same colour in other sizes, or the same size in other colours.
      const alt = new Set<string>();
      for (const p of pool) {
        const perColor = p.product_sizes.some((v) => v.color);
        for (const v of p.product_sizes) {
          if (v.stock < 1) continue;
          if (colour && size && (!perColor || v.color.toLowerCase() === colour.toLowerCase()) && p.colors.some((col) => col.name.toLowerCase() === colour.toLowerCase())) alt.add(`${colour} in ${v.size}`);
          else if (size && sameSize(v.size, size) && v.color) alt.add(`${v.color} in ${v.size}`);
        }
      }
      if (alt.size) say(`In stock instead: ${[...alt].slice(0, 5).join(', ')}.`, 400);
      say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! Will you restock ${want}?`)} label="Ask about a restock" />, 300);
      anythingElse();
      return true;
    }
    say(hits.length === 1 ? `Yes, this is in stock in ${want}:` : `Yes, these are in stock in ${want}:`, 600);
    for (const p of hits.slice(0, 4)) say(<ProductTile product={p} size={size} colour={colour} onView={() => setOpen(false)} />, 250);
    anythingElse();
    return true;
  }

  function human() {
    say('Sure, our team will reply on WhatsApp.');
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! I was chatting with Wills bot and have a question.`)} label="Chat on WhatsApp" />, 300);
    anythingElse();
  }

  // ----------------------------------------------------------- free text

  const INTENTS: [RegExp, () => void][] = [
    [/\b(hi|hello|hey|salam|ayubowan)\b/, () => (say('Hello! How can I help you today?'), offer(menuOptions()))],
    [/\b(offers?|deals?|discounts?|promo\w*|combos?|sale)\b/, offers],
    [/\b(insta\w*|facebook|fb|social|follow|tiktok)\b/, socials],
    [/\b(invoice|receipt|bill)\b/, invoice],
    [/\b(track\w*|where is my|status of my|order status)\b/, track],
    [/\b(return\w*|exchange\w*|refund\w*|wrong size|damaged)\b/, exchanges],
    [/\b(how long|when will|arrive|days|deliver\w*|shipping|ship|courier|free delivery)\b/, delivery],
    [/\b(pay|payment|cash|cod|bank|transfer|card)\b/, payment],
    [/\b(size chart|size guide|sizing|measure\w*|fit|chest|waist)\b/, sizeHelp],
    [/\b(colou?rs?|shades?)\b/, colours],
    [/\b(cheap\w*|price\w*|cost|how much|budget|expensive)\b/, prices],
    [/\b(new|latest|arrivals?|drop)\b/, newest],
    [/\b(order|buy|checkout|purchase)\b/, howToOrder],
    [/\b(human|person|agent|contact|whatsapp|call|talk)\b/, human],
    [/\b(find|recommend|suggest|outfit|looking for)\b/, startFinder],
  ];

  function search(q: string): Product[] {
    const words = q
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    if (!words.length) return [];
    return products
      .filter((p) => p.status !== 'unavailable')
      .map((p) => {
        const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
        return { p, hits: words.filter((w) => hay.includes(w.replace(/s$/, ''))).length };
      })
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits || Number(inStock(b.p)) - Number(inStock(a.p)))
      .slice(0, 4)
      .map((r) => r.p);
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText('');
    setOptions([]);
    push('user', q);
    const lower = q.toLowerCase();
    // "Black tee in L?" is answered from live stock first.
    if (stockCheck(q, lower)) return;
    // Questions (payment, delivery…) win; otherwise look for matching products first.
    const intent = INTENTS.find(([re]) => re.test(lower));
    if (intent && ![startFinder, colours, prices, newest].includes(intent[1])) return intent[1]();
    const found = search(lower);
    if (found.length) {
      say(found.length === 1 ? 'I found this:' : 'I found these:', 600);
      for (const p of found) say(<ProductTile product={p} onView={() => setOpen(false)} />, 250);
      return anythingElse();
    }
    if (intent) return intent[1]();
    say("Sorry, I didn't catch that. Pick one of these, or ask our team on WhatsApp.");
    offer(menuOptions());
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && messages.length === 0) greet();
  }

  return (
    <>
      {!open && (
        <button type="button" className="bot-launcher" onClick={toggle} aria-label="Open Wills bot">
          <span className="bot-launch-icon">
            <Logo />
          </span>
          <span>Wills bot</span>
        </button>
      )}
      {open && (
        <section className="bot-panel" role="dialog" aria-label="Wills bot">
          <header className="bot-head">
            <span className="bot-avatar">
              <Logo />
            </span>
            <div>
              <strong>Wills bot</strong>
              <small>
                <span className="bot-online" />
                Your shopping assistant
              </small>
            </div>
            <button type="button" className="bot-close" onClick={toggle} aria-label="Close chat">
              ✕
            </button>
          </header>
          <div className="bot-log" ref={logRef} aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={`bot-msg ${m.who}`}>
                {m.body}
              </div>
            ))}
            {typing && (
              <div className="bot-msg bot">
                <span className="bot-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            {options.length > 0 && (
              <div className="bot-options">
                {options.map((o) => (
                  <button key={o.label} type="button" className="chip" onClick={() => choose(o.label, o.run)}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form className="bot-input" onSubmit={onSend}>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. black tee in L, delivery, offers…"
              aria-label="Message Wills bot"
            />
            <button type="submit" className="btn btn-sm" disabled={!text.trim()}>
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function WaButton({ show, href, label }: { show: boolean; href: string; label: string }) {
  if (!show) return null;
  return (
    <a className="btn btn-sm" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

/** A product suggestion inside the chat. Reads live stock and cart so it never offers more than is in stock. */
function ProductTile({ product: initial, size, colour, onView }: { product: Product; size?: string; colour?: string; onView: () => void }) {
  const { products, settings } = useStore();
  const cart = useCart();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const product = products.find((p) => p.id === initial.id) ?? initial;
  const open = sortSizes(product.product_sizes).filter((s) => s.stock > 0 && product.status === 'available');
  const perColor = product.product_sizes.some((s) => s.color);
  // Products with colours need a colour too; without one the choice happens on the product page.
  const colourName = colour && product.colors.find((col) => col.name.toLowerCase() === colour.toLowerCase())?.name;
  const pick =
    size && (!product.colors.length || colourName)
      ? open.find((s) => sameSize(s.size, size) && (!perColor || !colourName || s.color === colourName))
      : undefined;
  const coloursInStock = product.colors.filter((col) => open.some((s) => !perColor || s.color === col.name)).map((col) => col.name);
  const inCart = pick ? sizeInCart(cart.items, pick.id) : 0;

  function view() {
    onView();
    navigate(`/product/${product.id}`);
  }

  function add() {
    if (!pick || inCart >= pick.stock) return;
    cart.add({ productId: product.id, sizeId: pick.id, size: pick.size, color: colourName, quantity: 1 });
    setNote(`Added ${[colourName, `size ${pick.size}`].filter(Boolean).join(', ')} to your cart.`);
  }

  return (
    <div className="bot-tile">
      <button type="button" className="bot-thumb" onClick={view} aria-label={`View ${product.name}`}>
        {product.images[0] ? <img src={product.images[0]} alt="" /> : <span />}
      </button>
      <div className="bot-tile-body">
        <strong>{product.name}</strong>
        <span className="bot-price">{formatPrice(product.price, settings.currency)}</span>
        <span className="small muted">{open.length ? `Sizes: ${[...new Set(open.map((s) => s.size))].join(', ')}` : 'Sold out'}</span>
        {coloursInStock.length > 0 && <span className="small muted">Colours: {coloursInStock.join(', ')}</span>}
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {pick && (
            <button type="button" className="btn btn-sm" onClick={add} disabled={inCart >= pick.stock}>
              Add {colourName ? `${colourName} ` : ''}{pick.size}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline" onClick={view}>
            {product.colors.length && open.length && !pick ? 'Choose colour' : 'View'}
          </button>
        </div>
        {note && <span className="small bot-note">{note}</span>}
      </div>
    </div>
  );
}

/** A product's size chart, small enough for the chat. */
function ChartCard({ name, chart }: { name: string; chart: SizeChart }) {
  return (
    <div className="bot-chart">
      <strong>{name}</strong>
      {chart.rows.length > 0 && (
        <div className="size-guide-table">
          <table>
            <thead>
              <tr>
                <th>Size</th>
                {chart.columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r) => (
                <tr key={r.size}>
                  <th>{r.size}</th>
                  {chart.columns.map((col, i) => (
                    <td key={col}>{r.values[i] || '–'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chart.rows.length > 0 && <span className="small muted">In {chart.unit === 'cm' ? 'centimetres' : 'inches'}.</span>}
      {chart.image && <img src={chart.image} alt={`${name} size chart`} style={{ width: '100%' }} />}
    </div>
  );
}

/** One live offer in the chat, with what it includes and the saving. */
function OfferTile({ promo, products, currency }: { promo: Promotion; products: Product[]; currency: string }) {
  const items = promo.product_ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const lines = [...new Set(items)].map((p) => {
    const n = items.filter((x) => x === p).length;
    return n > 1 ? `${n} × ${p.name}` : p.name;
  });
  const usual = promo.compare_price ?? (items.length ? items.reduce((sum, p) => sum + p.price, 0) : null);
  return (
    <div className="bot-offer">
      <span className="small caps" style={{ color: 'var(--gold-deep)' }}>
        {promo.kind === 'special' ? 'Special offer' : 'Combo offer'}
      </span>
      <strong>{promo.title}</strong>
      {lines.length > 0 && <span className="small">{lines.join(' + ')}</span>}
      <span>
        <strong className="bot-price">{formatPrice(promo.price, currency)}</strong>
        {usual && usual > promo.price && (
          <s className="small muted" style={{ marginLeft: 6 }}>
            {formatPrice(usual, currency)}
          </s>
        )}
      </span>
    </div>
  );
}
