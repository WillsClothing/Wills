import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart, sizeInCart } from '../lib/cart';
import { formatPrice, sortSizes } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product } from '../lib/types';
import { whatsappLink } from '../lib/whatsapp';
import Logo from './Logo';

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

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export default function WillsBot() {
  const { products, settings } = useStore();
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
      { label: 'How do I order?', run: howToOrder },
      { label: 'Payment options', run: payment },
      { label: 'Delivery', run: delivery },
      { label: 'Size help', run: sizeHelp },
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
        Hi, I'm <strong>Wills bot</strong>. I can help you find something to wear, check sizes and explain how
        ordering works.
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
        <li>Open a product, pick your size and quantity, then press <strong>Add to cart</strong>.</li>
        <li>In the cart, enter your name, phone and delivery address.</li>
        <li>Choose <strong>Cash on Delivery</strong> or <strong>Bank transfer</strong>.</li>
        <li>Press <strong>Order on WhatsApp</strong>. Your full order is sent to us and we confirm it there.</li>
      </ol>,
      800,
    );
    say('No online payment is needed, and nothing is reserved until we confirm on WhatsApp.', 500);
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
      settings.delivery_note ||
        'We deliver to your address after confirming your order on WhatsApp. We will tell you the delivery charge and timing there.',
    );
    anythingElse();
  }

  function sizeHelp() {
    say('Each product page shows the sizes in stock. Sizes that are crossed out are sold out.');
    say('Not sure which size fits? Tell us your usual size or measurements on WhatsApp and we will help you choose.', 500);
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! Can you help me with sizing?`)} label="Ask about sizing" />, 300);
    anythingElse();
  }

  function human() {
    say('Sure, our team will reply on WhatsApp.');
    say(<WaButton show={Boolean(settings.whatsapp_number)} href={wa(`Hi ${settings.store_name}! I was chatting with Wills bot and have a question.`)} label="Chat on WhatsApp" />, 300);
    anythingElse();
  }

  // ----------------------------------------------------------- free text

  const INTENTS: [RegExp, () => void][] = [
    [/\b(hi|hello|hey|salam|ayubowan)\b/, () => (say('Hello! How can I help you today?'), offer(menuOptions()))],
    [/\b(order|buy|checkout|purchase)\b/, howToOrder],
    [/\b(pay|payment|cash|cod|bank|transfer|card)\b/, payment],
    [/\b(deliver|delivery|shipping|ship|courier)\b/, delivery],
    [/\b(size|fit|measure|small|large)\b/, sizeHelp],
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
    // Questions (payment, delivery…) win; otherwise look for matching products first.
    const intent = INTENTS.find(([re]) => re.test(lower));
    if (intent && intent[1] !== startFinder) return intent[1]();
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
              placeholder="Ask about a product, size or delivery…"
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
function ProductTile({ product: initial, size, onView }: { product: Product; size?: string; onView: () => void }) {
  const { products, settings } = useStore();
  const cart = useCart();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const product = products.find((p) => p.id === initial.id) ?? initial;
  const open = sortSizes(product.product_sizes).filter((s) => s.stock > 0 && product.status === 'available');
  const pick = size ? open.find((s) => s.size === size) : undefined;
  const inCart = pick ? sizeInCart(cart.items, pick.id) : 0;

  function view() {
    onView();
    navigate(`/product/${product.id}`);
  }

  function add() {
    if (!pick || inCart >= pick.stock) return;
    cart.add({ productId: product.id, sizeId: pick.id, size: pick.size, quantity: 1 });
    setNote(`Added size ${pick.size} to your cart.`);
  }

  return (
    <div className="bot-tile">
      <button type="button" className="bot-thumb" onClick={view} aria-label={`View ${product.name}`}>
        {product.images[0] ? <img src={product.images[0]} alt="" /> : <span />}
      </button>
      <div className="bot-tile-body">
        <strong>{product.name}</strong>
        <span className="bot-price">{formatPrice(product.price, settings.currency)}</span>
        <span className="small muted">{open.length ? `In stock: ${open.map((s) => s.size).join(', ')}` : 'Sold out'}</span>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {pick && (
            <button type="button" className="btn btn-sm" onClick={add} disabled={inCart >= pick.stock}>
              Add size {pick.size}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline" onClick={view}>
            View
          </button>
        </div>
        {note && <span className="small bot-note">{note}</span>}
      </div>
    </div>
  );
}
