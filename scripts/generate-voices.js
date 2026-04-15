#!/usr/bin/env node
/**
 * Animal Academy — Voice Pre-generation Script
 *
 * Generates all TTS voice clips used in the game and saves them as MP3s
 * to the voices/ directory. Already-existing files are skipped, so you
 * can safely re-run to generate only missing clips.
 *
 * Usage:
 *   node scripts/generate-voices.js
 *
 * Requires GROK_API_KEY to be set, either:
 *   - In the environment:  GROK_API_KEY=xai-... node scripts/generate-voices.js
 *   - Or in ../config.js:  const GROK_API_KEY = 'xai-...';
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── API key ───────────────────────────────────────────────────────────────────
let API_KEY = process.env.GROK_API_KEY;
if (!API_KEY) {
  try {
    const cfg = fs.readFileSync(path.join(__dirname, '../src/config.js'), 'utf8');
    API_KEY = cfg.match(/GROK_API_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  } catch {}
}
if (!API_KEY) {
  console.error('ERROR: No API key found. Set GROK_API_KEY env var or create config.js.');
  process.exit(1);
}

// ── Output directory ──────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, '../src/voices');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Voice personas (must match TTS_VOICE in index.html) ──────────────────────
const VOICE = { question: 'eve', cheer: 'leo', comfort: 'ara', hype: 'rex' };

// ── Text cleaning (mirrors _ttsClean in index.html) ──────────────────────────
function clean(text) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27BF}]/gu, '') // strip emoji
    .replace(/!/g, '.')                                          // ! → . (no "factorial")
    .trim();
}

// ── Game data (mirrors index.html exactly) ────────────────────────────────────
const ANIMALS = {
  duck:     'Duck',
  elephant: 'Elephant',
  monkey:   'Monkey',
  lion:     'Lion',
  cat:      'Cat',
  dog:      'Dog',
  frog:     'Frog',
  penguin:  'Penguin',
  rabbit:   'Rabbit',
  bear:     'Bear',
  pig:      'Pig',
};

const DESTINATIONS = [
  { id: 'pool',     winText: 'SPLASH! You made it to the pool!' },
  { id: 'pizza',    winText: 'YUMMY! Pizza party!'              },
  { id: 'rocket',   winText: 'BLAST OFF! To the stars!'         },
  { id: 'castle',   winText: 'You found the magic castle!'      },
  { id: 'icecream', winText: 'ICE CREAM for everyone!'          },
  { id: 'rainbow',  winText: 'Wow! A beautiful RAINBOW!'        },
  { id: 'treasure', winText: 'You found the TREASURE!'          },
];

const COLORS  = ['Red','Blue','Green','Yellow','Orange','Purple'];
const SHAPES  = ['Circle','Square','Triangle','Star','Heart','Diamond'];
const NUMBERS = ['1','2','3','4','5','6','7','8','9'];

const CHEER_LINES = [
  'Amazing. You got it.',
  'Yes. That\'s right.',
  'Fantastic.',
  'Brilliant. Well done.',
  'Woohoo. Correct.',
  'Super. Keep going.',
  'Great job. You\'re so smart.',
  'Nailed it.',
];

const COMFORT_LINES = [
  'Oops. That\'s okay, try again.',
  'Not quite. Give it another go.',
  'Almost. Keep trying.',
  'Hmm, let\'s try again.',
  'Don\'t give up.',
];

const COMFORT_DOUBLE = 'Oh no, two in a row. Let\'s move back and try again.';

// Idle templates — each takes the answer name and returns a full sentence.
// (The game strips emoji and replaces ! with . before sending to TTS, which is
// why we write . instead of ! here directly.)
const IDLE_T1 = [
  n => `Hey buddy. Are you still there. Where is the ${n}.`,
  n => `Hmm, I'm still waiting. Which one is the ${n}. Have a look.`,
  n => `Take your time. Can you spot the ${n} somewhere up there.`,
  n => `Hey. Come on. We're looking for the ${n}. Can you see it.`,
  n => `Psst. Look carefully. Which one do you think is the ${n}.`,
];

const IDLE_T2 = [
  n => `Don't give up. I know you can find the ${n}. It's right there.`,
  n => `You can do it. Look really carefully now... where is the ${n}.`,
  n => `Ooh, this one is tricky. But I believe in you. Find the ${n}.`,
  n => `Hey, let's look together. The ${n}... can you point to it.`,
];

// ── Build clip list ───────────────────────────────────────────────────────────
// Each entry: { file: 'relative/path.mp3', voice: 'eve', text: 'clean text' }
const clips = [];

function add(file, voice, text) {
  clips.push({ file, voice, text: clean(text) });
}

// Welcome intro
add('welcome.mp3', VOICE.hype,
  'Welcome to Animal Academy. Pick your hero and let\'s go on an adventure together.');

// Question prompts
// Colors — "Hey! Can you find the color RED!" → clean → "Hey. Can you find the color RED."
for (const c of COLORS) {
  add(`q_${c.toLowerCase()}.mp3`, VOICE.question,
    `Hey. Can you find the color ${c.toUpperCase()}.`);
}
// Shapes — "Find the Circle!" → "Can you spot the Circle!" → clean
for (const s of SHAPES) {
  add(`q_${s.toLowerCase()}.mp3`, VOICE.question,
    `Can you spot the ${s}.`);
}
// Numbers — "Find the number 5!" → "Can you spot the number 5!" → clean
for (const n of NUMBERS) {
  add(`q_${n}.mp3`, VOICE.question,
    `Can you spot the number ${n}.`);
}

// Cheer lines (correct answer)
CHEER_LINES.forEach((t, i) => add(`cheer_${i}.mp3`, VOICE.cheer, t));

// Comfort lines (wrong answer)
COMFORT_LINES.forEach((t, i) => add(`comfort_${i}.mp3`, VOICE.comfort, t));
add('comfort_double.mp3', VOICE.comfort, COMFORT_DOUBLE);

// Per-animal win texts (reward-pick announcement)
for (const [id, name] of Object.entries(ANIMALS)) {
  add(`win_${id}.mp3`, VOICE.hype,
    `WOW. You did it. Amazing job. Now pick what ${name} should do to celebrate.`);
}

// Destination win texts (shown on the win screen)
for (const dest of DESTINATIONS) {
  add(`dest_${dest.id}.mp3`, VOICE.cheer, dest.winText);
}

// Animal hype lines (3 options per animal, picked randomly in-game)
for (const [id, name] of Object.entries(ANIMALS)) {
  const lines = [
    `${name}. Great choice. Let's help ${name} go on an adventure.`,
    `${name}. Wonderful. We're going on an adventure together.`,
    `${name}. Awesome. Let's go. Answer right and ${name} takes a step closer.`,
  ];
  lines.forEach((t, i) => add(`hype_${id}_${i}.mp3`, VOICE.hype, t));
}

// Idle prompts (per answer item × per template)
// All unique answer names across colors, shapes, numbers
const ALL_ITEMS = [
  ...COLORS.map(c  => ({ id: c.toLowerCase(),  name: c      })),
  ...SHAPES.map(s  => ({ id: s.toLowerCase(),  name: s      })),
  ...NUMBERS.map(n => ({ id: n,                name: n      })),
];
for (const item of ALL_ITEMS) {
  IDLE_T1.forEach((fn, i) => add(`idle_t1_${item.id}_${i}.mp3`, VOICE.question, fn(item.name)));
  IDLE_T2.forEach((fn, i) => add(`idle_t2_${item.id}_${i}.mp3`, VOICE.question, fn(item.name)));
}

// ── TTS API call ──────────────────────────────────────────────────────────────
function fetchTTS(text, voiceId) {
  const body = JSON.stringify({
    text,
    voice_id: voiceId,
    language: 'en',
    output_format: { codec: 'mp3', sample_rate: 24000 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.x.ai',
        path:     '/v1/tts',
        method:   'POST',
        headers:  {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        if (res.statusCode !== 200) {
          let err = '';
          res.on('data', d => err += d);
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err.slice(0, 120)}`)));
          return;
        }
        const chunks = [];
        res.on('data',  c => chunks.push(c));
        res.on('end',   ()  => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const total   = clips.length;
  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  console.log(`Animal Academy — Voice Generator`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Clips:  ${total} total\n`);

  for (const clip of clips) {
    const outPath = path.join(OUT_DIR, clip.file);

    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    try {
      const mp3 = await fetchTTS(clip.text, clip.voice);
      fs.writeFileSync(outPath, mp3);
      generated++;
      const done = generated + skipped + failed;
      process.stdout.write(`\r  [${done}/${total}] ${clip.file.padEnd(40)}`);
    } catch (e) {
      failed++;
      const done = generated + skipped + failed;
      process.stdout.write(`\n  [${done}/${total}] FAILED: ${clip.file} — ${e.message}\n`);
      // Brief pause before next request to avoid hammering on errors
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n\nDone!`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped (already existed): ${skipped}`);
  if (failed) console.log(`  Failed: ${failed} — re-run to retry`);
}

main().catch(e => { console.error(e); process.exit(1); });
