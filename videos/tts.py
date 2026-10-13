#!/usr/bin/env python3
"""Neural text-to-speech with Piper (https://github.com/OHF-Voice/piper1-gpl). Reads a JSON job on stdin:
   {"model": "/path/voice.onnx", "outdir": "/path", "items": [{"id": "chess-0", "text": "..."}], "length_scale": 1.05}
Writes <outdir>/<id>.wav for every item and prints {"id": seconds, ...} as JSON."""
import json
import os
import sys
import wave

from piper import PiperVoice, SynthesisConfig

job = json.load(sys.stdin)
voice = PiperVoice.load(job["model"])
cfg = SynthesisConfig(length_scale=job.get("length_scale", 1.05), noise_scale=0.55, noise_w_scale=0.7)
os.makedirs(job["outdir"], exist_ok=True)
durs = {}
for it in job["items"]:
    path = os.path.join(job["outdir"], it["id"] + ".wav")
    with wave.open(path, "wb") as w:
        voice.synthesize_wav(it["text"], w, syn_config=cfg)
    with wave.open(path, "rb") as r:
        durs[it["id"]] = r.getnframes() / r.getframerate()
print(json.dumps(durs))
