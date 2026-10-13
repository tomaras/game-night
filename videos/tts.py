#!/usr/bin/env python3
"""Neural text-to-speech with Kokoro (https://github.com/thewh1teagle/kokoro-onnx, Apache-2.0). Runs fully offline.
Reads a JSON job on stdin:
   {"model": "kokoro-v1.0.onnx", "voices": "voices-v1.0.bin", "voice": "af_heart", "speed": 0.98, "outdir": "/path",
    "items": [{"id": "000", "text": "..."}]}
Writes <outdir>/<id>.wav (24 kHz mono) for every item and prints {"id": seconds, ...} as JSON.
A voice may be a blend: "af_heart:60,af_bella:40"."""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

job = json.load(sys.stdin)
k = Kokoro(job["model"], job["voices"])


def pick(spec):
    if ":" not in spec:
        return spec
    parts = [p.split(":") for p in spec.split(",")]
    total = sum(float(w) for _, w in parts)
    mix = sum(k.get_voice_style(n) * (float(w) / total) for n, w in parts)
    return mix


voice = pick(job.get("voice", "af_heart"))
speed = float(job.get("speed", 1.0))
os.makedirs(job["outdir"], exist_ok=True)
SR = 24000
durs = {}
for it in job["items"]:
    text = it["text"]
    # long sentences are spoken in chunks at their natural pauses, with a short breath between them
    samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    assert sr == SR, sr
    # trim leading/trailing silence, then leave a natural-sounding gap
    a = np.asarray(samples, dtype=np.float32)
    nz = np.where(np.abs(a) > 0.004)[0]
    if len(nz):
        a = a[max(0, nz[0] - int(0.03 * SR)): nz[-1] + int(0.09 * SR)]
    path = os.path.join(job["outdir"], it["id"] + ".wav")
    sf.write(path, a, SR, subtype="PCM_16")
    durs[it["id"]] = len(a) / SR
print(json.dumps(durs))
