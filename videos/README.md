# How-to-play videos

Every game has a narrated video with **real gameplay**, shown in the game's help ("Watch how to play"). The videos are built by
these scripts, and live **once on the site** (`/media/videos/<game>.mp4`, plus `.vtt` captions and a `.jpg` poster), shared by
Stable and Nightly. They are streamed on demand, never cached by the service worker, and are not part of the app build.

## How a video is made

1. `script.mjs` turns the game's rules (the same text as the in-app help, plus a few hand-written feature notes) into spoken
   sentences. Those sentences are also the captions.
2. `tts.py` speaks them with [Piper](https://github.com/OHF-Voice/piper1-gpl), a local neural text-to-speech engine
   (voice: `en_US-lessac-high`). Nothing is sent to any online service.
3. `capture.mjs` records real gameplay in a phone-sized Chrome (full device resolution, from Chrome's screencast):
   - games with a computer opponent are played by the computer on both sides (`?autopilot=1`);
   - every other game runs as a real multi-player room where a generic "monkey" plays each seat through the normal UI
     (typing answers, drawing, tapping cards and buttons) while the host's screen is recorded.
4. `build.mjs` assembles title card → crossfade → gameplay, the voiceover underneath, loudness-normalised, as a small H.264/AAC
   mp4 (about 1–2 MB), and writes the captions and poster.

## Rebuilding

```bash
brew install ffmpeg
python3 -m venv .tts && .tts/bin/pip install piper-tts
.tts/bin/python -m piper.download_voices en_US-lessac-high        # downloads next to where you run it
export PIPER_PYTHON=$PWD/.tts/bin/python PIPER_VOICE=$PWD/en_US-lessac-high.onnx PW_CHANNEL=chrome
node videos/build.mjs chess pool telephone --out .video-out      # any game ids; takes ~2–3 minutes per game
```

Publish them (once; later app releases never touch them) with the same tool the app uses:

```bash
GITHUB_REPOSITORY=<owner>/<repo> GH_TOKEN=… scripts/publish.sh media .video-out "how-to-play videos"
```

Change the wording of a game's video by editing its help text in `js/games/index.js` (or `EXTRA` in `script.mjs` for feature
notes) and rebuilding that game. Re-record after a big visual change to a game.
