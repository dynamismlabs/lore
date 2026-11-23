/**
 * Lore's MCP view, bundled into `lore-view.html.ts` by `pnpm mcp-views:build`.
 * In a chat it's a card of memories. Full screen it's a small Lore: this
 * week's vibes, recent memories and a search. It loads photos, voice notes and
 * clips from Lore's own address through short-lived signed links; everything
 * else goes through the host's tool calls.
 */
import { type Bridge, type HostContext, connect } from './bridge';
import type { HomeView, LoreView, MemoriesView, ViewMemory } from '../types';

type Child = Node | string | null | undefined | false;
type Props = Record<string, string | number | boolean | EventListener | null | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'className') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  // appendChild, not append: the Workers types in this project redefine Element#append.
  for (const child of children.flat()) {
    if (child) el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

const root = document.getElementById('root')!;
let bridge: Bridge | null = null;
let view: LoreView | null = null;
/** What to go back to after a search. */
let before: LoreView | null = null;
let notice: string | null = null;
let busy = false;
let lastMode: string | undefined;

// ─── Dates in the host's locale and time zone ─────────────────

function timeZone() {
  return bridge?.context.timeZone;
}

function dateLabel(iso: string, precision: ViewMemory['occurredPrecision'] = 'day') {
  const date = new Date(iso);
  if (precision !== 'day') {
    // Stored as the first day of the period at noon UTC: read it in UTC.
    try {
      return new Intl.DateTimeFormat(bridge?.context.locale, {
        year: 'numeric',
        ...(precision === 'month' ? { month: 'long' as const } : {}),
        timeZone: 'UTC',
      }).format(date);
    } catch {
      return iso.slice(0, precision === 'month' ? 7 : 4);
    }
  }
  const sameYear = dayKey(date).slice(0, 4) === dayKey(new Date()).slice(0, 4);
  try {
    return new Intl.DateTimeFormat(bridge?.context.locale, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
      timeZone: timeZone(),
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function dayKey(date: Date) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timeZone(),
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function weekdayLetter(date: Date) {
  try {
    return new Intl.DateTimeFormat(bridge?.context.locale, {
      weekday: 'narrow',
      timeZone: timeZone(),
    }).format(date);
  } catch {
    return '';
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// ─── Actions ──────────────────────────────────────────────────

function openInLore(url: string) {
  void bridge?.openLink(url).catch(() => {});
}

const searchField = h('input', {
  type: 'search',
  className: 'search',
  placeholder: 'Search memories',
  'aria-label': 'Search memories',
  enterkeyhint: 'search',
  autocomplete: 'off',
});
// A sandboxed frame may not let a form submit, so the field reads Enter itself.
searchField.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  void search(searchField.value.trim());
});

async function search(query: string) {
  if (!bridge || busy) return;
  if (!query) {
    if (before) show(before);
    before = null;
    return;
  }
  busy = true;
  notice = null;
  render();
  try {
    const result = await bridge.callTool('show_memories', { query });
    if (result.isError || !result.structuredContent) throw new Error('refused');
    if (!before && view?.view === 'home') before = view;
    show(result.structuredContent as unknown as LoreView);
  } catch {
    notice = 'Lore couldn’t search just now.';
  } finally {
    busy = false;
    render();
  }
}

// ─── Pieces ───────────────────────────────────────────────────

const dot = () => h('span', { className: 'dot', 'aria-hidden': 'true' }, '·');

function card(memory: ViewMemory) {
  const meta = h(
    'div',
    { className: 'meta' },
    h('span', {}, dateLabel(memory.occurredAt, memory.occurredPrecision)),
    dot(),
    h('span', {}, memory.isMine ? 'You' : memory.author),
    memory.collections.length > 0 && [dot(), h('span', {}, memory.collections.join(', '))],
  );
  const title = memory.title
    ? h(
        'button',
        { type: 'button', className: 'title', onClick: () => openInLore(memory.url) },
        memory.title,
      )
    : null;
  const excerpt = memory.excerpt
    ? h('p', { className: memory.title ? 'excerpt' : 'excerpt lead' }, memory.excerpt)
    : null;

  const shown = memory.photos.slice(0, 3);
  const photos = shown.length
    ? h(
        'div',
        { className: `photos n${shown.length}` },
        shown.map((src, i) =>
          h(
            'button',
            {
              type: 'button',
              className: 'photo',
              'aria-label': 'Open in Lore',
              onClick: () => openInLore(memory.url),
            },
            h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }),
            i === shown.length - 1 &&
              memory.photoCount > shown.length &&
              h('span', { className: 'more' }, `+${memory.photoCount - shown.length}`),
          ),
        ),
      )
    : null;
  const voice = memory.voice?.url
    ? h('audio', { className: 'voice', controls: true, preload: 'none', src: memory.voice.url })
    : null;
  const video = memory.video
    ? h('video', {
        className: 'clip',
        controls: true,
        playsinline: true,
        preload: 'metadata',
        src: `${memory.video}#t=0.1`,
      })
    : null;
  const noMedia = [
    !shown.length && memory.photoCount > 0 && plural(memory.photoCount, 'photo'),
    memory.voice && !memory.voice.url && 'a voice note',
  ].filter(Boolean);

  const foot = h(
    'div',
    { className: 'foot' },
    memory.people.map((name) => h('span', { className: 'chip' }, name)),
    noMedia.length > 0 && h('span', {}, noMedia.join(', ')),
    memory.hearts > 0 && h('span', {}, plural(memory.hearts, 'heart')),
    memory.comments > 0 && h('span', {}, plural(memory.comments, 'comment')),
    h(
      'button',
      { type: 'button', className: 'open', onClick: () => openInLore(memory.url) },
      'Open in Lore',
    ),
  );
  return h('article', { className: 'memory' }, meta, title, excerpt, photos, voice, video, foot);
}

function section(title: string, aside: string | null, ...body: Child[]) {
  return h(
    'section',
    {},
    h(
      'div',
      { className: 'section-head' },
      h('h2', {}, title),
      aside && h('span', { className: 'aside' }, aside),
    ),
    ...body,
  );
}

/** This week as seven circles, today last. A tap plays the week from that day. */
function vibes(data: HomeView) {
  const byDay = new Map<string, string>();
  for (const clip of data.vibes)
    if (clip.url) byDay.set(dayKey(new Date(clip.occurredAt)), clip.url);
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * 86_400_000));
  const week = days.map((day) => byDay.get(dayKey(day))).filter((url): url is string => !!url);
  if (!week.length) return null;

  const player = h('div', { className: 'player', hidden: true });
  const strip = h(
    'ol',
    { className: 'vibes' },
    days.map((day, i) => {
      const url = byDay.get(dayKey(day));
      const label = i === 6 ? 'Today' : weekdayLetter(day);
      return h(
        'li',
        {},
        url
          ? h(
              'button',
              {
                type: 'button',
                className: 'vibe',
                'aria-label': `Play from ${label}`,
                onClick: () => play(week.indexOf(url)),
              },
              h('video', {
                src: `${url}#t=0.1`,
                muted: true,
                playsinline: true,
                preload: 'metadata',
              }),
            )
          : h('span', { className: 'vibe empty' }),
        h('span', { className: i === 6 ? 'day today' : 'day' }, label),
      );
    }),
  );

  function play(start: number) {
    let index = start;
    const video = h('video', { autoplay: true, playsinline: true, controls: true });
    const next = () => {
      if (index >= week.length) return close();
      video.src = week[index++];
      void video.play().catch(() => {});
    };
    const close = () => {
      video.pause();
      player.hidden = true;
      player.replaceChildren();
      strip.hidden = false;
    };
    video.addEventListener('ended', next);
    player.replaceChildren(
      video,
      h('button', { type: 'button', className: 'close', onClick: close }, 'Close'),
    );
    player.hidden = false;
    strip.hidden = true;
    next();
  }

  return section('Vibes', 'this week', strip, player);
}

function memoriesList(memories: ViewMemory[], empty: string) {
  return memories.length
    ? h('div', { className: 'list' }, memories.map(card))
    : h('p', { className: 'empty' }, empty);
}

function home(data: HomeView): Node[] {
  return [
    vibes(data),
    section('Recent', null, memoriesList(data.memories, 'No memories yet.')),
  ].filter((node): node is HTMLElement => !!node);
}

function memories(data: MemoriesView): Node[] {
  const count = data.memories.length ? `${data.memories.length}${data.more ? '+' : ''}` : null;
  return [
    section(
      data.title,
      count,
      memoriesList(
        data.memories,
        data.query ? `No memories match “${data.query}”.` : 'No memories.',
      ),
      data.missing > 0 &&
        h(
          'p',
          { className: 'note' },
          `${plural(data.missing, 'memory', 'memories')} couldn’t be shown.`,
        ),
      data.more &&
        h(
          'button',
          { type: 'button', className: 'open', onClick: () => openInLore(data.loreUrl) },
          'More in Lore',
        ),
    ),
  ];
}

function appHead() {
  return h(
    'header',
    { className: 'app-head' },
    h('span', { className: 'wordmark' }, 'Lore'),
    searchField,
    before &&
      h(
        'button',
        {
          type: 'button',
          className: 'back',
          onClick: () => {
            searchField.value = '';
            void search('');
          },
        },
        'Back',
      ),
  );
}

// ─── Drawing ──────────────────────────────────────────────────

function render() {
  const focused = document.activeElement;
  const nodes: Node[] = [];
  if (bridge?.context.displayMode === 'fullscreen') nodes.push(appHead());
  if (notice) nodes.push(h('p', { className: 'notice', role: 'status' }, notice));
  if (busy) nodes.push(h('p', { className: 'loading', role: 'status' }, 'Searching…'));
  else if (view?.view === 'home') nodes.push(...home(view));
  else if (view?.view === 'memories') nodes.push(...memories(view));
  else if (!notice)
    nodes.push(h('p', { className: 'loading', role: 'status' }, 'Loading from Lore'));
  root.replaceChildren(...nodes);
  if (focused === searchField) searchField.focus();
}

function show(next: LoreView) {
  if (next?.view !== 'home' && next?.view !== 'memories') return;
  view = next;
  notice = null;
  render();
}

// ─── The host's look ──────────────────────────────────────────

function applyContext(context: HostContext) {
  const html = document.documentElement;
  if (context.theme) html.dataset.theme = context.theme;
  html.dataset.display = context.displayMode === 'fullscreen' ? 'fullscreen' : 'inline';
  for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
    if (name.startsWith('--') && value) html.style.setProperty(name, value);
  }
  if (context.styles?.css?.fonts && !document.getElementById('host-fonts')) {
    document.head.appendChild(h('style', { id: 'host-fonts' }, context.styles.css.fonts));
  }
  if (context.locale) html.lang = context.locale;
  // Redraw only when the layout changes, so a theme change never stops a playing voice note.
  if (context.displayMode !== lastMode) {
    lastMode = context.displayMode;
    render();
  }
}

// ─── Start ────────────────────────────────────────────────────

render();
connect({
  toolResult: (result) => {
    if (result.isError || !result.structuredContent) {
      notice = 'Lore couldn’t load this.';
      render();
      return;
    }
    before = null;
    show(result.structuredContent as unknown as LoreView);
  },
  hostContext: (context) => applyContext(context),
  cancelled: () => {
    if (!view) {
      notice = 'Cancelled.';
      render();
    }
  },
})
  .then((connected) => {
    bridge = connected;
    applyContext(connected.context);
    render();
    let last = 0;
    new ResizeObserver(() => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        connected.sizeChanged(height);
      }
    }).observe(document.documentElement);
  })
  .catch(() => {
    notice = 'This view needs an app that shows MCP views.';
    render();
  });
