# Contributing

Whisper Pixels is a static browser app with no package install or build step. Keep changes dependency-free where practical and preserve the client-side-only processing model.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. A local server is required for Web Crypto, Web Workers, and service workers.

## Before submitting a change

- Run `node --check` for each JavaScript file in `js/`, including `js/landing.js`.
- Run `node --test tests/*.test.mjs`.
- In a browser, test image hide → PNG download → reveal with the correct password and a wrong password.
- Test text hide → copy → reveal, plus an attached file round trip.
- After image and text hide/reveal operations, open **Explain what happened** and check real counts/samples, both narration levels, reveal replay, reduced motion, and one-time local report cleanup.
- Confirm an ordinary image reports no hidden payload, and a too-small image reports its capacity problem.
- Check keyboard operation, mobile layout, light/dark themes, and reduced-motion settings.
- Never add telemetry, upload paths, passwords, or user files to logs or remote services.
