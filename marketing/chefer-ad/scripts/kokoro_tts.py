"""Kokoro (local, Apache-2.0) text-to-speech for the ad's voiceover.

Reads a JSON list of jobs on stdin and writes one WAV per job, so the model
loads once per batch:

    [{"text": "...", "voice": "am_michael", "out": "public/x.wav",
      "speed": 1.0, "lang": "en-us"}]

    .tts/venv/bin/python -I scripts/kokoro_tts.py < jobs.json
    .tts/venv/bin/python -I scripts/kokoro_tts.py --list-voices

Model files live in .tts/models (gitignored); see README.
"""

import json
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / ".tts" / "models"


def main() -> None:
    kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    if "--list-voices" in sys.argv:
        print("\n".join(sorted(kokoro.get_voices())))
        return

    for job in json.load(sys.stdin):
        lang = job.get("lang") or ("en-gb" if job["voice"].startswith("b") else "en-us")
        samples, rate = kokoro.create(job["text"], voice=job["voice"], speed=job.get("speed", 1.0), lang=lang)
        out = ROOT / job["out"]
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(out, samples, rate)
        print(f"{job['voice']:<12} {len(samples) / rate:5.2f}s  {job['out']}")


if __name__ == "__main__":
    main()
