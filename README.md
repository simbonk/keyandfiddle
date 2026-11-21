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
