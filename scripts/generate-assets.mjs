/** Original vector art, authored for Survival Arena. Deterministic and fully reproducible. */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/assets', { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
async function save(name, w, h, body) {
  const source = svg(w, h, body);
  await writeFile(`src/assets/${name}.svg`, source);
  await sharp(Buffer.from(source), { density: name === 'arena' ? 172.8 : 72 })
    .png(name.startsWith('arena') ? { palette: true, colours: 128, dither: 0.3 } : {})
    .toFile(`public/assets/${name}.png`);
}
let seed = 9204;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const defs = `<defs>
<radialGradient id="floor"><stop stop-color="#66865b"/><stop offset=".5" stop-color="#52724d"/><stop offset="1" stop-color="#3a573c"/></radialGradient>
<linearGradient id="stone" x2=".3" y2="1"><stop stop-color="#879777"/><stop offset=".5" stop-color="#6a855e"/><stop offset="1" stop-color="#435e46"/></linearGradient>
<linearGradient id="trunk"><stop stop-color="#0a1915"/><stop offset=".5" stop-color="#233b2c"/><stop offset="1" stop-color="#0e2119"/></linearGradient>
<radialGradient id="moss"><stop stop-color="#698450"/><stop offset="1" stop-color="#293f27"/></radialGradient>
<radialGradient id="light"><stop stop-color="#9ee8a7" stop-opacity=".2"/><stop offset="1" stop-color="#2c8d66" stop-opacity="0"/></radialGradient>
<radialGradient id="vignette"><stop offset=".35" stop-color="#081610" stop-opacity="0"/><stop offset="1" stop-color="#020b09" stop-opacity=".25"/></radialGradient>
</defs>`;
let arena =
  defs +
  `<path fill="#466b43" d="M0 0h450v800H0z"/><ellipse cx="225" cy="410" rx="280" ry="450" fill="url(#floor)"/>`;
// Weathered cobbles, each independently shaded and chipped.
for (let row = -1; row < 22; row++)
  for (let col = -1; col < 11; col++) {
    const x = col * 51 + (row % 2) * 24,
      y = row * 40,
      j = rnd() * 4;
    arena += `<path d="M${x + 4} ${y + 2}l42 -1 5 5 -2 29 -7 4 -37 -2 -4 -6z" fill="url(#stone)" opacity="${0.25 + rnd() * 0.35}" stroke="#11281f" stroke-width="2"/><path d="M${x + 6} ${y + 4}l37 -1" stroke="#718270" opacity=".2"/><path d="M${x + 17 + j} ${y + 3}l-4 9 6 6 -4 11" fill="none" stroke="#12281e" opacity="${rnd() * 0.5}"/>`;
  }
const daisStart = arena.length;
// A raised, engraved circular dais in perspective.
arena += `<ellipse cx="225" cy="423" rx="164" ry="115" fill="#091d17" opacity=".65"/><ellipse cx="225" cy="409" rx="157" ry="108" fill="#5d7d50" stroke="#101e18" stroke-width="6"/><ellipse cx="225" cy="402" rx="153" ry="103" fill="url(#stone)" stroke="#a8b482" stroke-width="2"/><ellipse cx="225" cy="402" rx="137" ry="91" fill="none" stroke="#172c21" stroke-width="10"/><ellipse cx="225" cy="402" rx="131" ry="87" fill="none" stroke="#7fa479" stroke-width="1" opacity=".5"/><ellipse cx="225" cy="402" rx="100" ry="67" fill="#658956" stroke="#23362a" stroke-width="3"/>`;
for (let i = 0; i < 24; i++) {
  const a = (i * Math.PI) / 12,
    x = 225 + Math.cos(a) * 143,
    y = 402 + Math.sin(a) * 96;
  arena += `<path d="M-3 -5v10m0 -6 6 -3 -2 7m-4 -1h6" transform="translate(${x} ${y}) rotate(${i * 15})" stroke="#a6c293" opacity=".42" fill="none" stroke-width="1.5"/>`;
}
arena += `<path d="M225 319l59 124 -141 -63 144 0 -121 62z" fill="none" stroke="#789c70" stroke-width="1" opacity=".32"/><path d="M132 382l16 7 -8 15 20 6m120 43 -11 -12 9 -10m-40 -114 -5 15 8 9" fill="none" stroke="#14281e" stroke-width="2"/>`;
const dais = arena.slice(daisStart);
// Ferns, groundcover, fallen leaves and glimmering mushrooms.
for (let i = 0; i < 310; i++) {
  const x = rnd() * 450,
    y = rnd() * 800;
  if (x > 65 && x < 385 && y > 140 && y < 680 && rnd() > 0.09) continue;
  const r = 2 + rnd() * 8;
  arena += `<ellipse cx="${x}" cy="${y}" rx="${r * 2}" ry="${r}" fill="url(#moss)" opacity="${0.3 + rnd() * 0.5}"/><path d="M${x} ${y}q-8 -13 -9 -19q8 3 9 19q3 -17 9 -19q-1 12 -9 19" fill="${['#3e6240', '#4b7043', '#6b7d46'][i % 3]}" opacity=".7"/>`;
}
for (let i = 0; i < 45; i++) {
  const x = rnd() < 0.5 ? rnd() * 49 : 400 + rnd() * 50,
    y = 80 + rnd() * 640;
  arena += `<path d="M${x} ${y}v-7" stroke="#7e9c78" stroke-width="2"/><path d="M${x - 5} ${y - 6}q4 -10 10 0z" fill="${i % 3 ? '#5d977b' : '#92c3b6'}"/>`;
}
// Ancient perimeter masonry and overgrown roots.
for (const x of [12, 411])
  for (const y of [154, 259, 523, 630]) {
    arena += `<path d="M${x - 7} ${y}l27 -5 8 10 -3 48 -28 1z" fill="#13251f" stroke="#091912" stroke-width="3"/><path d="M${x - 3} ${y + 3}l19 -3 7 9 -2 37 -24 1z" fill="url(#stone)" stroke="#647159" stroke-opacity=".4"/><path d="M${x + 2} ${y + 10}l10 5 -2 20" fill="none" stroke="#799073" opacity=".4"/>`;
  }
for (const side of [0, 1]) {
  const tr = side ? 'translate(450 0) scale(-1 1)' : '';
  arena += `<g transform="${tr}"><path d="M-38 -20Q85 72 40 204Q20 253 -15 294L-35 240Q30 186 9 120Q-15 100 -38 97Z" fill="url(#trunk)" stroke="#081811" stroke-width="6"/><path d="M4 72Q54 134 21 224M17 124Q82 143 95 188M16 182Q65 211 61 250" fill="none" stroke="#263c2b" stroke-width="10"/><path d="M-15 535Q45 580 24 671Q-1 735 86 812L-34 823Z" fill="url(#trunk)" stroke="#081811" stroke-width="5"/><path d="M16 635Q53 656 69 683M12 683Q59 715 100 726M5 601Q65 565 60 534" fill="none" stroke="#253a2a" stroke-width="9"/></g>`;
}
// Layered leaf canopy: organic pointed leaves rather than flat boundary rectangles.
for (let i = 0; i < 145; i++) {
  const x = rnd() * 450,
    y = rnd() < 0.5 ? rnd() * 125 - 40 : 710 + rnd() * 140;
  const s = 12 + rnd() * 32;
  arena += `<path d="M0 0Q${-s} ${-s} 0 ${-s * 2}Q${s} ${-s} 0 0Z" transform="translate(${x} ${y}) rotate(${rnd() * 360})" fill="${['#0b2119', '#173124', '#1d3828', '#254430'][i % 4]}" stroke="#092017" stroke-width="1"/><path d="M${x} ${y}l${s * 0.2} ${-s}" stroke="#41613a" opacity=".2"/>`;
}
arena += `<ellipse cx="225" cy="385" rx="220" ry="300" fill="url(#light)"/><path fill="url(#vignette)" d="M0 0h450v800H0z"/>`;
await save('arena', 450, 800, arena);

// Six-frame, hand-shaped character sheets. Shadows, silhouettes, armor, facial features and animated limbs.
const monster = (kind, f) => {
  const step = Math.sin((f / 6) * Math.PI * 2),
    bob = Math.abs(step) * 2;
  const shadow = `<ellipse cx="48" cy="79" rx="${kind === 'boss' ? 37 : 19}" ry="7" fill="#04120e" opacity=".65"/>`;
  let body = '';
  if (kind === 'imp')
    body = `<path d="M31 50Q4 28 7 60L28 65M65 50Q91 26 89 60L67 65" fill="#77554d" stroke="#342d2a" stroke-width="2"/><path d="M29 43Q18 33 19 25L35 32M64 43Q77 32 76 23L59 33" fill="#c7b283" stroke="#544b37" stroke-width="2"/><path d="M33 63l${-4 + step * 3} 13 10 1 8 -14m11 -1 5 14 11 -1 -7 -16" fill="#514e32" stroke="#252e22" stroke-width="2"/><path d="M27 48Q18 57 19 ${67 + step * 3}l8 -3 11 -10m30 -6q10 7 9 ${18 - step * 3}l-8 -3 -12 -11" fill="#8a8861" stroke="#303e2a" stroke-width="2"/><path d="M32 41Q48 33 65 43L68 65Q48 77 28 65Z" fill="#697c4b" stroke="#2c4029" stroke-width="2"/><path d="M31 48Q17 23 34 19L45 25 64 20Q80 36 65 51L48 57Z" fill="#a0a475" stroke="#3e5034" stroke-width="2"/><path d="M27 34l14 4 -4 9 -10 -5m28 -4 15 -5 -3 10 -11 3" fill="#223329"/><path d="M30 38l8 2m21 0 8 -3" stroke="#ffce75" stroke-width="3"/><path d="M43 48l5 -5 4 5m-17 2q14 8 26 -2" fill="none" stroke="#41472b" stroke-width="2"/><path d="M39 52l3 6 3 -4m9 -1 3 4 3 -7" fill="#e2d7a1"/><path d="M33 61l30 1 -2 8 -29 -1z" fill="#594a33"/><path d="M45 61h8v7h-8z" fill="#ac9561"/>`;
  if (kind === 'skeleton')
    body = `<path d="M38 59l${-4 + step * 4} 14 -7 4m28 -18 ${6 - step * 4} 14 8 3" fill="none" stroke="#bfc4a8" stroke-width="6"/><path d="M32 52l-9 11 -5 -5m43 -8 10 9 4 -9" fill="none" stroke="#c9c8a4" stroke-width="5"/><path d="M37 40Q48 34 59 40L63 62 48 68 32 62Z" fill="#535b4c" stroke="#1b3025" stroke-width="3"/><path d="M38 43l20 2m-22 4 23 1m-23 4 23 1M48 40v24" stroke="#bbbda1" stroke-width="3"/><path d="M31 22Q47 9 64 23L64 39 55 46 39 45 31 37Z" fill="#e1ddbc" stroke="#53604b" stroke-width="2"/><path d="M30 23Q46 10 65 23L64 29 31 28Z" fill="#89917b"/><path d="M31 24l-1 -11 18 5 17 -6 -1 12" fill="#626d5d" stroke="#39493b" stroke-width="2"/><path d="M36 30l10 1 -2 8 -9 -2m17 -6 10 -1 1 7 -10 2" fill="#26372f"/><path d="M37 33h6m12 0h6" stroke="#9fe6ce" stroke-width="2"/><path d="M47 37l-3 5 7 -1M40 42v5m5 -4v5m6 -5v5m5 -6v5" stroke="#5a6652" stroke-width="2"/><path d="M13 50l13 3 2 18 -9 6 -10 -9Z" fill="#526554" stroke="#a4ad80" stroke-width="2"/><path d="M18 56v13m-5 -7 11 1" stroke="#b2bc88" stroke-width="2"/><path d="M75 49l2 -27 5 -8 3 9 -6 27" fill="#becab2" stroke="#5e7a67" stroke-width="1.5"/>`;
  if (kind === 'wraith')
    body = `<path d="M34 41Q14 47 13 ${66 + step * 2}L28 60 20 74 38 63M62 41Q81 46 83 ${66 - step * 2}L67 60 76 75 57 63" fill="#68747d" stroke="#303e47" stroke-width="2"/><path d="M36 39Q46 31 60 40L67 66 77 81 57 74 49 85 39 75 22 81 31 64Z" fill="#596e69" stroke="#2b4741" stroke-width="2"/><path d="M37 45l-1 24 -7 9m30 -33 2 23 9 10" stroke="#81988c" fill="none" stroke-width="2"/><path d="M27 41Q25 14 48 10Q73 16 70 42L60 51 34 49Z" fill="#536d66" stroke="#2a4b41" stroke-width="2"/><path d="M34 34Q46 18 61 34L60 46Q47 53 35 44Z" fill="#0d2925"/><path d="M37 36l8 2m8 0 7 -2" stroke="#acffe6" stroke-width="3"/><path d="M47 42l-1 5 5 -1" fill="#629e86"/><path d="M48 12l-3 17m-14 12 11 7m23 -8 -10 7" stroke="#9bafa1" fill="none" opacity=".5"/>`;
  if (kind === 'boss')
    body = `<path d="M26 60L15 83 33 86 44 63m12 -1 8 23 18 -3 -12 -26" fill="#364b43" stroke="#102b25" stroke-width="3"/><path d="M21 39L6 47 3 64 15 70 31 53m43 -15 15 11 4 18 -11 5 -19 -19" fill="#536157" stroke="#18372a" stroke-width="3"/><path d="M20 42L31 29 66 29 78 42 66 68 49 77 30 66Z" fill="#465e4f" stroke="#132f22" stroke-width="3"/><path d="M31 37l17 8 17 -8 -9 23 -7 6 -9 -8Z" fill="#253f33" stroke="#a1a67a" stroke-width="2"/><path d="M48 44l-6 9 7 8 7 -9Z" fill="#a4f1c5"/><path d="M33 16L21 8 16 -4m9 16 -12 -1 -4 -9m53 14 12 -9 6 -13m-9 15 13 -2 6 -10" fill="none" stroke="#aeb28b" stroke-width="5"/><path d="M30 17l8 -11 20 0 10 14 -5 21 -15 8 -17 -10Z" fill="#5d7460" stroke="#193d2b" stroke-width="2"/><path d="M32 19l13 7 -9 9 -7 -7m23 -3 13 -7 2 10 -11 7" fill="#112e26"/><path d="M33 25l10 3m12 0 10 -5" stroke="#c5ffd8" stroke-width="3"/><path d="M47 30l-4 8 8 -1m-12 1 8 5 10 -6" fill="none" stroke="#bcc9a0" stroke-width="2"/><path d="M35 10l-3 -12 10 6 7 -10 7 10 10 -7 -4 13" fill="#b5a873" stroke="#5e6343" stroke-width="2"/><path d="M17 48l-6 13 8 -2m61 -10 6 14 -8 -2M32 62l7 -11m23 12 -6 -12" fill="none" stroke="#93aa79" stroke-width="3"/>`;
  const palette =
    kind === 'imp'
      ? {
          '#a0a475': '#f58e63',
          '#697c4b': '#aa5745',
          '#8a8861': '#f0a16f',
          '#77554d': '#ae5148',
          '#3e5034': '#753832',
        }
      : kind === 'wraith'
        ? {
            '#596e69': '#8d64c7',
            '#536d66': '#a17bd9',
            '#68747d': '#7250a4',
            '#0d2925': '#2d2045',
            '#81988c': '#c6a9f0',
          }
        : kind === 'boss'
          ? {
              '#465e4f': '#62517f',
              '#536157': '#76608b',
              '#5d7460': '#9b7eb1',
              '#b5a873': '#f1cf68',
            }
          : { '#e1ddbc': '#fff0c2', '#626d5d': '#8a91ad', '#89917b': '#b5b9cb' };
  for (const [from, to] of Object.entries(palette)) body = body.replaceAll(from, to);
  return shadow + `<g transform="translate(0 ${-bob})">${body}</g>`;
};
for (const kind of ['imp', 'skeleton', 'wraith', 'boss']) {
  let sheet = '';
  for (let f = 0; f < 6; f++)
    sheet += `<g transform="translate(${f * 96} 0)">${monster(kind, f)}</g>`;
  await save(kind, 576, 96, sheet);
}
await save(
  'crystal',
  120,
  150,
  `<defs><linearGradient id="base" x2="0" y2="1"><stop stop-color="#789584"/><stop offset="1" stop-color="#253d33"/></linearGradient><linearGradient id="gem" x2="1" y2="1"><stop stop-color="#d0ffe7"/><stop offset=".4" stop-color="#52dcb3"/><stop offset="1" stop-color="#187966"/></linearGradient></defs><ellipse cx="60" cy="131" rx="48" ry="12" fill="#071c15" opacity=".8"/><path d="M17 116l43 -20 43 20 -2 13 -41 17 -42 -17Z" fill="#304d3e" stroke="#182f26" stroke-width="2"/><path d="M17 115l43 -20 43 20 -43 20Z" fill="url(#base)" stroke="#9ab397" stroke-width="1.5"/><path d="M27 111l33 -15 33 15 -33 14Z" fill="#1c4133" stroke="#8ba98b"/><path d="M46 106l-10 -48 24 -43 27 43 -13 49 -14 13Z" fill="url(#gem)" stroke="#8cf6cc" stroke-width="2"/><path d="M60 15L52 59 60 120 74 59Z" fill="#abffdc" opacity=".6"/><path d="M36 58l16 1 8 61 -14 -14Zm38 1 13 -1 -13 49 -14 13Z" fill="#207e6a" opacity=".6"/><path d="M60 15L52 59 36 58m16 1 22 0 13 -1M60 120l14 -61L60 15" fill="none" stroke="#d3ffe5" opacity=".55"/><path d="M27 106l-4 -22 8 5 3 18m52 0 3 -18 8 -5 -4 22" fill="#718b6d" stroke="#2b513b"/><path d="M38 121l7 3m12 5 6 0m12 -5 6 -3" stroke="#8ed9ae" stroke-width="2"/>`,
);
await save(
  'guardian',
  80,
  96,
  `<ellipse cx="40" cy="85" rx="23" ry="7" fill="#071b15" opacity=".6"/><path d="M26 69l-5 15 13 0 7 -12m9 -4 5 16 13 -1 -9 -15" fill="#1a2e25"/><path d="M25 44Q10 58 13 80L36 75 44 85 64 76Q61 57 56 43Z" fill="#315cbd" stroke="#173d2a" stroke-width="2"/><path d="M27 50l-4 24 13 -6m18 -19 6 24 -12 -5" fill="#6aa7f0"/><path d="M24 44Q22 13 40 8Q61 15 59 45L48 54 31 52Z" fill="#4f8fe1" stroke="#1c462f" stroke-width="2"/><path d="M29 37Q40 22 52 37L51 49 33 49Z" fill="#152d25"/><path d="M33 39l5 2m6 0 5 -2" stroke="#c7ffe0" stroke-width="2"/><path d="M41 9l-5 23m-10 12 13 9 19 -9M30 62l21 0" fill="none" stroke="#f0d77e" stroke-width="2"/><path d="M66 82V29" stroke="#8e7146" stroke-width="5"/><path d="M65 40l-8 -12 9 -15 10 15 -8 12Z" fill="#b4ffcd" stroke="#73c9a0" stroke-width="2"/><path d="M57 56l10 3 1 -10" fill="none" stroke="#91ad7d" stroke-width="5"/>`,
);
await save(
  'spark',
  32,
  32,
  `<defs><radialGradient id="g"><stop stop-color="#fff"/><stop offset=".2" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><path fill="url(#g)" d="M0 0h32v32H0z"/>`,
);
await save(
  'torch',
  40,
  90,
  `<ellipse cx="20" cy="79" rx="16" ry="6" fill="#07160f" opacity=".7"/><path d="M9 70l11 -6 12 6 -1 9 -11 7 -11 -7Z" fill="#405144" stroke="#162c20"/><path d="M15 69l2 -32h7l2 32 -6 4Z" fill="#74806a" stroke="#263c2a" stroke-width="2"/><path d="M8 36l4 -14 8 -4 10 6 3 12 -13 9Z" fill="#39463a" stroke="#87906b" stroke-width="2"/><path d="M13 28l-3 -13 7 4 4 -16 8 19 -1 8Z" fill="#f0ab63"/><path d="M17 29l1 -12 7 7 -3 8Z" fill="#ffe4a0"/>`,
);
console.log('Generated original arena, animated monster sheets, crystal, guardian and effects.');

await save(
  'bolt',
  24,
  64,
  `<path d="M12 1Q24 30 18 46Q24 63 12 63Q0 63 6 46Q0 30 12 1Z" fill="#63f3f1"/><path d="M12 18Q18 49 12 59Q6 49 12 18Z" fill="#fffde2"/>`,
);
await save(
  'fireball',
  48,
  80,
  `<path d="M24 0Q45 28 38 42Q57 68 30 79Q5 84 4 59Q3 39 14 27L15 49Q29 31 24 0Z" fill="#ff662d"/><path d="M27 25Q44 58 32 71Q15 86 12 61L23 45 22 61Q33 52 27 25Z" fill="#ffca57"/><path d="M26 48Q37 70 25 73Q14 71 26 48Z" fill="#fff8c4"/>`,
);
await save(
  'impact',
  64,
  64,
  `<path d="M32 0L38 22 58 8 44 28 64 32 43 39 58 57 37 45 32 64 26 44 7 58 20 38 0 32 21 26 7 7 27 20Z" fill="#fff3c6"/><path d="M32 15L38 27 49 32 37 38 32 50 26 38 15 32 26 27Z" fill="#ffffff"/>`,
);
let floor = `<path fill="#55754c" d="M0 0h256v256H0z"/>`;
for (let y = -1; y < 7; y++)
  for (let x = -1; x < 6; x++) {
    const px = x * 55 + (y % 2) * 26,
      py = y * 43;
    floor += `<path d="M${px + 3} ${py + 2}l48 0 2 35 -45 4 -5 -6Z" fill="${['#64815b', '#6b865d', '#5d7c55'][(x + y + 20) % 3]}" stroke="#3d633d" stroke-width="2"/><path d="M${px + 7} ${py + 5}h37" stroke="#a0b382" opacity=".25"/>`;
  }
await save('floor', 256, 256, floor);

let wide =
  defs +
  `<path fill="#55754c" d="M0 0h1440v800H0z"/><defs><pattern id="tiles" width="256" height="256" patternUnits="userSpaceOnUse">${floor}</pattern></defs><path fill="url(#tiles)" d="M0 0h1440v800H0z"/><ellipse cx="720" cy="402" rx="650" ry="450" fill="url(#light)"/><g transform="translate(495 0)">${dais}</g>`;
for (let i = 0; i < 480; i++) {
  const x = rnd() * 1440,
    y = rnd() * 800;
  if (x > 65 && x < 1375 && y > 95 && y < 710 && rnd() > 0.03) continue;
  const size = 5 + rnd() * 13;
  wide += `<ellipse cx="${x}" cy="${y}" rx="${size * 1.8}" ry="${size}" fill="url(#moss)"/><path d="M${x} ${y}q-7 -18 -12 -22q10 1 12 22q6 -18 13 -20q-1 12 -13 20" fill="#7d9e54" opacity=".65"/>`;
}
for (let i = 0; i < 280; i++) {
  const edge = i % 4,
    x =
      edge === 0
        ? rnd() * 1440
        : edge === 1
          ? rnd() * 1440
          : edge === 2
            ? rnd() * 45
            : 1395 + rnd() * 45,
    y = edge === 0 ? rnd() * 40 : edge === 1 ? 760 + rnd() * 40 : rnd() * 800,
    size = 15 + rnd() * 25;
  wide += `<path d="M0 0Q${-size} ${-size} 0 ${-size * 2}Q${size} ${-size} 0 0Z" transform="translate(${x} ${y}) rotate(${rnd() * 360})" fill="${['#25472b', '#365c35', '#456f3c'][i % 3]}" stroke="#193c26" stroke-width="1"/>`;
}
wide += `<ellipse cx="720" cy="400" rx="830" ry="540" fill="url(#vignette)"/>`;
await save('arena-wide', 1440, 800, wide);
