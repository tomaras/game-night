# How-to-play videos

Every game has a narrated video with **real gameplay**, shown in the game's help ("Watch how to play"). The videos are built by
these scripts, and live **once on the site** (`/media/videos/<game>.mp4`, plus `.vtt` captions and a `.jpg` poster), shared by
Stable and Nightly. They are streamed on demand, never cached by the service worker, and are not part of the app build.

## How a video is made

1. `narration-a/b/c.mjs` hold the hand-written voiceover: short, conversational paragraphs written to be spoken, one script per
   game. (`script.mjs` loads them, and falls back to the in-app rules text for any game without a script.) The sentences are
   also the captions.
2. `tts.py` speaks them with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0, voice `af_heart`), a local
   neural text-to-speech model. Nothing is sent to any online service.
3. `capture.mjs` records real gameplay in a phone-sized Chrome (full device resolution, from Chrome's screencast):
   - games with a computer opponent are played by the computer on both sides (`?autopilot=1`);
   - every other game runs as a real multi-player room where a generic "monkey" plays each seat through the normal UI
     (typing answers, drawing, tapping cards and buttons) while the host's screen is recorded.
4. `build.mjs` assembles title card → crossfade → gameplay, the voiceover underneath, loudness-normalised, as a small H.264/AAC
   mp4 (about 1–2 MB), and writes the captions and poster.

## Rebuilding

```bash
brew install ffmpeg
python3.13 -m venv .tts && .tts/bin/pip install kokoro-onnx soundfile
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
export KOKORO_PYTHON=$PWD/.tts/bin/python KOKORO_MODEL=$PWD/kokoro-v1.0.onnx KOKORO_VOICES=$PWD/voices-v1.0.bin PW_CHANNEL=chrome
node videos/build.mjs chess pool telephone --out .video-out      # any game ids; takes ~2–3 minutes per game
```

(`KOKORO_VOICE` and `KOKORO_SPEED` pick another voice, or a blend like `af_heart:60,af_bella:40`, and the pace.)

Publish them (once; later app releases never touch them) with the same tool the app uses:

```bash
GITHUB_REPOSITORY=<owner>/<repo> GH_TOKEN=… scripts/publish.sh media .video-out "how-to-play videos"
```

Change the wording of a game's video by editing its paragraph in `narration-*.mjs` and rebuilding that game. Re-record after a big visual change to a game.
