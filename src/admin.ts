import { adminLayout } from './ui/admin-layout';
import { SessionBus, type Command } from './integrations/local/SessionBus';
import { MockProvider } from './integrations/mock/MockProvider';
import type { GiftKind, Skill } from './game/types';
import type { LiveEvent } from './integrations/events/types';
import './style.css';

document.getElementById('app')!.innerHTML = adminLayout();
const session = new URLSearchParams(location.search).get('session') || 'arena';
const bus = new SessionBus(session);
const mock = new MockProvider();
mock.subscribe((event) => bus.send({ type: 'command', command: { kind: 'event', event } }));
let lastSeen = 0,
  count = 0;
const send = (command: Command) => bus.send({ type: 'command', command });
const gameLink = document.getElementById('open-game') as HTMLAnchorElement;
gameLink.href = `/?session=${encodeURIComponent(session)}`;
const unsub = bus.on((message) => {
  if (message.type === 'snapshot') {
    lastSeen = Date.now();
    const s = message.state;
    document.getElementById('admin-wave')!.textContent = `Wave ${s.wave}`;
    document.getElementById('admin-health')!.textContent =
      `${Math.ceil((s.hp / s.maxHp) * 100)}% health`;
    document.getElementById('admin-kills')!.textContent = `${s.kills} kills · ${s.score} points`;
    document.body.dataset.gameStatus = s.status;
  }
  if (message.type === 'activity') {
    const e = message.event,
      li = document.createElement('li'),
      name = document.createElement('b');
    name.textContent = e.viewer.name;
    const action =
      e.type === 'GiftReceived'
        ? `sent ${e.gift}`
        : e.type === 'ChatMessage'
          ? e.message
          : e.type === 'LikeReceived'
            ? `${e.count} likes`
            : e.type === 'FollowReceived'
              ? 'followed'
              : 'joined';
    li.append(name, document.createTextNode(` · ${action}`));
    const feed = document.getElementById('activity-feed')!;
    feed.prepend(li);
    while (feed.children.length > 25) feed.lastElementChild?.remove();
    document.getElementById('event-count')!.textContent = String(++count);
  }
});
document
  .querySelectorAll<HTMLButtonElement>('[data-gift]')
  .forEach((b) =>
    b.addEventListener('click', () => send({ kind: 'gift', gift: b.dataset.gift as GiftKind })),
  );
document
  .querySelectorAll<HTMLButtonElement>('[data-skill]')
  .forEach((b) =>
    b.addEventListener('click', () => send({ kind: 'skill', skill: b.dataset.skill as Skill })),
  );
document
  .querySelectorAll<HTMLButtonElement>('[data-command]')
  .forEach((b) =>
    b.addEventListener('click', () =>
      send({ kind: b.dataset.command as 'pause' | 'resume' | 'restart' | 'mute' }),
    ),
  );
document.getElementById('crowd')!.addEventListener('click', () => send({ kind: 'crowd' }));
document
  .getElementById('auto-events')!
  .addEventListener('change', (event) =>
    send({ kind: 'auto', enabled: (event.target as HTMLInputElement).checked }),
  );
document.getElementById('send-event')!.addEventListener('click', () =>
  mock.send(
    (document.getElementById('event-type') as HTMLSelectElement).value as LiveEvent['type'],
    {
      message: (document.getElementById('chat-message') as HTMLInputElement).value || undefined,
      count: 20,
    },
  ),
);
const timer = setInterval(() => {
  const connected = Date.now() - lastSeen < 4000;
  const status = document.getElementById('connection')!;
  status.textContent = connected ? 'Game connected' : 'Waiting for game…';
  status.classList.toggle('connected', connected);
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = !connected));
}, 400);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(timer);
    unsub();
    mock.dispose();
    bus.dispose();
  });
