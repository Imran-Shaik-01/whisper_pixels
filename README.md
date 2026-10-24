<div align="center">

# 🕶️ Whisper Pixels

### **A little secret. In plain sight.**

Encrypt a message or file. Hide it inside an image or ordinary text. Keep the whole process on your device.

[Open the Studio](./studio.html) · [Explore the Inspector Lab](./inspector.html) · [Report a bug](https://github.com/Imran-Shaik-01/whisper_pixels/issues)

![HTML](https://img.shields.io/badge/HTML-semantic-5b8def)
![JavaScript](https://img.shields.io/badge/JavaScript-modules-f0ce4e)
![Privacy](https://img.shields.io/badge/processing-local%20in%20your%20browser-67dfb1)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-none-9b82e8)

</div>

---

## Meet Whisper Pixels

Whisper Pixels is a small, client-side steganography studio. It encrypts a message (and optionally a file) before concealing the resulting data in RGB pixel bits or zero-width text characters. Hide a secret, verify the result, then share the carrier with the person who has the password.

The application has no account system or application backend. Your message, password, uploaded files, and generated carrier are processed in your browser; they are not sent to an AI service or Whisper Pixels server.

## What you can do

| Tool | What it does |
| --- | --- |
| **Image Studio** | Encrypt and hide a message or attachment in an image; download a verified PNG. |
| **Text Studio** | Hide encrypted bytes in zero-width Unicode markers and copy the complete stego text. |
| **Reveal** | Recover a message or attached file with the correct password; wrong passwords and missing payloads have distinct errors. |
| **Inspector Lab** | Compare image pixels, view difference heatmaps and bit planes, explore histograms, inspect invisible text, and visualize the encryption pipeline. |
| **Explain what happened** | Follow a seven-step beginner or technical walkthrough based on real operation measurements and samples. It runs locally and does not use cloud AI. |
| **Offline app shell** | Install the static app for offline use after its assets have been cached by your browser. |

## Try the samples

The landing page includes small, self-generated downloads for a ready-to-reveal PNG, a detailed cover PNG, a text attachment, a WAV attachment, and an AVI attachment. The ready-made image uses password `pixel-demo-2026` and hint `night-sky`. Audio and video are attachments only; they are not supported carrier formats.

## A quick tour

1. **Choose a carrier.** Use an image for lossless PNG output, or text for zero-width character encoding.
2. **Write and protect.** Add your message, optionally attach a file, and choose a strong password. Encryption happens before embedding.
3. **Verify and share.** The Studio reads its output back before offering it. Share the downloaded PNG without resizing or recompressing it.

The Inspector Lab is available from the Studio. After a successful hide or reveal, **Explain what happened** opens a private walkthrough using actual counts and a few sampled pixels or text markers. A short text preview may be included in a one-time `sessionStorage` handoff between pages; the Inspector removes it when it reads the report. Passwords, keys, and images are never included.

## Security and format

- **Encryption:** AES-256-GCM from the browser Web Crypto API. New payloads use PBKDF2-HMAC-SHA-256 with 600,000 iterations, a random 16-byte salt, and a random 12-byte nonce. Existing `WPX2` payloads remain readable with their original 310,000-iteration setting.
- **Image carrier:** New `WPX3` headers include the salt, nonce, ciphertext length, and optional visible hint. The full header is authenticated as AES-GCM additional data. Header bits are written first; encrypted payload bits are spread through RGB least-significant-bit slots using a key-derived seed. The result is exported as PNG and verified by decoding and authenticating it again.
- **Text carrier:** The encrypted payload is framed in zero-width characters. Text apps may strip or normalize these marks, so use the complete copied output without reformatting it.
- **Files:** An optional attachment can be included with the message. The app accepts files up to 20 MB, but the carrier must still have enough capacity for the complete encrypted payload.
- **Password:** It is not stored or recoverable. Use a strong, unique passphrase; AES-GCM rejects a wrong password, altered ciphertext, or modified hint.

This project is an educational privacy tool, not a substitute for a professional security review or safe key exchange. Steganography does not guarantee that a payload is undetectable. Expiry dates are a convenience checked by the client, not cryptographic enforcement.

## Important limits

- Always share the **exact PNG** produced by the Studio. JPEG conversion, resizing, filters, screenshots, and social or messaging services that recompress images can destroy hidden data.
- Text formatting and some apps can remove zero-width characters.
- Audio and video are supported as attachments only, not as carriers.
- The Inspector Lab analyzes image pairs up to 12 megapixels to limit browser memory use.
- Offline mode requires an initial visit from `localhost` or an HTTPS site so the service worker can cache the app shell.

## Run it locally

No package install, build step, or third-party runtime library is needed. Use a local web server because browser cryptography, workers, and service workers require a secure context:

```bash
git clone https://github.com/Imran-Shaik-01/whisper_pixels.git
cd whisper_pixels
python3 -m http.server 8000
```

Open <http://localhost:8000> in a modern browser.

Run the dependency-free tests with:

```bash
node --test tests/*.test.mjs
```

## Publish with GitHub Pages

After pushing the project to this repository, enable Pages in **Settings → Pages** and select the `main` branch with the repository root as the source. The expected site address is:

<https://imran-shaik-01.github.io/whisper_pixels/>

## Project map

```text
whisper_pixels/
├── index.html                 Landing page
├── studio.html                Hide and reveal workflow
├── inspector.html             Image, text, and encryption inspection
├── css/
│   ├── landing.css
│   ├── studio.css
│   ├── inspector.css
│   └── theme-accessibility.css
├── js/
│   ├── crypto.js               Web Crypto helpers
│   ├── zerowidth.js            Invisible text encoding
│   ├── image-worker.js         Image embedding and extraction
│   ├── landing.js
│   ├── studio.js
│   ├── inspector.js
│   └── explainer.js
├── tests/
├── samples/
│   ├── cover.png
│   ├── hidden-message.png
│   ├── note.txt
│   ├── pixels.avi
│   └── tone.wav
├── manifest.webmanifest
├── icon.svg
└── sw.js                       Offline application shell
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for checks and manual verification steps. The app is intentionally dependency-free and keeps content processing in the browser.

---

<div align="center">

Made with care by [Imran Shaik](https://github.com/Imran-Shaik-01)

</div>
