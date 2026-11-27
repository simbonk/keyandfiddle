# Key & Fiddle 🎹🎻

A music-learning web app for kids, built for iPad first (works on phones and desktop too). Everything runs in the browser: the microphone listens to the real instrument and the camera acts as a magic mirror for violin posture. Audio and video never leave the device.

## Tabs

### 🎹 Piano
- **Tune to my piano**: a wizard asks you to press keys one by one and remembers the exact pitch *your* piano makes, so an old, out-of-tune piano still works. Quick mode (5 keys, the rest interpolated) or every key. You can re-run it any time.
- **Play songs**: a 3D note highway (Guitar Hero style) that lines up with a 2-octave on-screen keyboard. Modes are *Wait for me* (notes stop until you play the right key), *Play along* (keeps tempo) and *Listen* (demo). It gives feedback on loud and soft notes (brighter blocks mean louder) and on holding long notes, and shows a "coming up" list. You can also tap the on-screen keys.
- **Record**: play a melody and it is transcribed into notes you can replay, rename, save, or turn into a highway song ("Learn it").

### 🎻 Violin
- **Tune**: a per-string tuner (G D A E) with a needle, a reference tone and peg or fine-tuner advice.
- **Magic mirror**: the selfie camera with MediaPipe hand and pose tracking. It estimates where the violin and bow are, overlays a violin with string lanes, finger targets and a ghost "ideal" bow, and runs posture checks (shoulders, chin, scroll height, elbow, wrist, bow angle and contact point). *Pin my violin* lets you tap the chinrest and scroll to anchor the overlay to your body.
- **Play tunes**: a two-track highway. The left track shows string and finger and the right track shows bow direction and which part of the bow to use. The mirror shows the same targets on your violin, and pitch detection confirms each note, including whether it was in tune.
- **Touch violin**: no violin needed (great for the car). Hold the iPad sideways like a violin: the neck and bow zone run along the top edge at real violin size (pick 4/4 down to 1/8 for smaller hands; G string nearest the edge so fingers curl over it like over a violin's G side; can be moved to the bottom edge), and the left hand presses the strings (finger tapes 1-4), the other hand bows up and down across the strings in a bow column at the far end (pull away from the edge for a down bow, push back for an up bow; faster is louder; the column's four lanes fan out like a bow arm's angles and lean the bow onto G, D, A or E, and touching a string name on the scroll picks an open string). The sound is a physical model of a bowed string (a digital waveguide with stick-slip bow friction and a violin body filter, after STK's *Bowed*) running in an AudioWorklet, so bow changes, string crossings and ringing open strings sound like the real thing. Free play, or the violin songs with notes rising from below straight onto the finger spot and the stretch of bow to use: *Play* waits for each note, *Listen* plays it with a ghost hand. Options: fingers snap to notes (or slide freely), easy bow (the fingered string plays wherever you bow), vibrato, note names.

### 🎸 Guitar
- **Touch guitar, played in a mirror**: sit facing a mirror and hold the iPad sideways against your chest like a guitar, screen toward the mirror. The play screen is drawn back to front, so in the mirror the words read normally and the guitar lines up with your real hands. The neck is a real-size strip along the bottom edge (frets 1-5 at real fret spacing, never more than a fifth of the screen tall; Full, 3/4, 1/2 and 1/4 sizes), and the music falls down onto it from above. Like a real guitar, pressing a fret is silent: you press, then pick or strum on the guitar body at the other end (arrows show which way to strum). *Easy picking* lets a tap anywhere on the body pick the fingered string. *Mirror* can be turned off to play looking at the screen. With Rotation Lock on, the neck always stays clear of the swipe-up bar: locked upright (port on top) the guitar is drawn turned a quarter with the headstock at the bar's end; locked sideways it is drawn upside down so the neck runs along the edge opposite the bar (*Turn around* swaps it). A glowing string with a flicking pick means pluck; a band across several strings with a sweeping pick means strum.
- **Forgiving chords**: on glass the neck is a bit narrower and shorter than a real one, so chord shapes are in reach on an iPad or iPhone. A finger one string or one fret off still counts, each chord finger needs its own touch, and with three or more fingers one may miss. When the shape counts, the strum sounds the right chord.
- **My guitar**: the same songs and chords on a real guitar. The microphone listens: pitch detection for single notes, and the balance of notes in the sound (a chroma profile) for chords.
- **Songs**: the violin's tunes moved to the guitar's first position, plus guitar starters (Open String Rock, Spider Walk, Row Row Row Your Boat, Frère Jacques, London Bridge, Old MacDonald, Jingle Bells, Happy Birthday), and songs with chords (Mary Had a Little Lamb, Twinkle, Ode to Joy, Jingle Bells, Oh! Susanna, Yankee Doodle): pick the tune and strum the bar's chord on the long notes, marked 🎸 Chords on their cards. The start and end cards are never mirrored, so you read them looking at the iPad. *Wait* waits for each note, *Listen* plays it.
- **Chords**: a chord chart (Em, E, Am, A, D, Dm, C, G, E7, A7, D7, G7, easy F), one-chord practice, chord changes and strum-along songs. Each strum shows its direction (a new chord strums down, the same chord again strums up).
- **Sounds**: acoustic, classical (nylon), electric, rock (distortion) and banjo, all Karplus-Strong plucked strings through their own body or amp, or your own recorded sound.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (use --host to try it on an iPad on the same Wi-Fi; camera/mic need HTTPS there)
npm test           # unit tests (pitch detection, fingering, calibration, songs)
npm run build
```

Add `?arDemo` to the URL to preview the AR overlays with a synthetic player, so no camera or violin is needed.

## Deploying (Vercel)

Import the repo in Vercel. `vercel.json` sets the Vite build.

## Stack

Vite, React and TypeScript. The Web Audio API handles pitch detection (McLeod pitch method) and a small synth. Canvas 2D draws the highways and the touch violin, and an AudioWorklet runs the bowed-string violin model.

## Keyboard sounds

The **Keyboard** tab picks the keyboard sound (also selectable from the menu on a piano song screen): a sampled grand piano, electric piano, organ, space synth, 8-bit robot and music box (all but the grand are synthesised in Web Audio). Kids can also record their own sound (a cough, clap or sung note). It is trimmed, saved in IndexedDB on the device, and pitch-shifted across the keys; a clearly sung note keeps its real pitch so the keyboard stays in tune.

## Credits

Grand piano samples: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Trimmed to a few seconds, mono 64 kbps, in `public/samples/piano/`; they load only for the keys in use.
