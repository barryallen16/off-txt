# off-txt

Send pictures, QR codes, and live location over SMS. Works offline - no data plan needed on either end.

## What it does

- **Payments**: Scan a UPI QR code, enter an amount, and send the request via SMS. The recipient opens it in their UPI app.
  Amounts are written into the link as a clean UPI intent (`pa`, `pn`, `am`, `cu`, plus `tr`/`tn` when present).
  A signed link that already carries an amount is kept byte-for-byte so its signature stays valid.
  Links that need an amount added follow the [NPCI UPI linking specification](https://www.labnol.org/files/linking.pdf) and are unsigned, so the payer's UPI app may ask them to verify the source.
- **Images**: Pick a photo, compress it to grayscale posterized JPEG (~2 KB), and send as a series of SMS parts. The other side reassembles it.
- **QR codes**: Scan or paste any QR code text. Send the text over SMS; the recipient rebuilds the same QR code (metro tickets, boarding passes, etc.).
- **Location**: Share your live location for a set interval. Updates arrive as SMS on the other side.

All transfers use a custom chunked protocol with CRC32 checksums and automatic reassembly. A native Android module handles silent `SEND_SMS` and inbox reading so multipart messages arrive whole.

## Quick start

```bash
# Install dependencies
bun install

# Start development server
bun start

# Run on Android (requires native build for SMS module)
bun android

# Run tests
bun test

# Type check
bun run typecheck
```

## Requirements

- Android device with SMS permission (for sending/receiving)
- Expo SDK 54 / React Native 0.81
- Bun 1.4+

The native SMS module lives in `modules/off-txt-sms` and is linked via Expo autolinking. It requires a development build — Expo Go won't work.

## Architecture

```
app/                 # Expo Router screens
  share/             # Image, QR, location sending
  transfers/         # Received items inbox
  pay/               # UPI payment flow
components/          # Shared UI (buttons, icons, recipient picker)
lib/                 # Pure logic, no React dependencies
  base64.js          # URL-safe base64
  transfer.js        # Chunked SMS protocol (encode/decode/CRC32)
  geo.js             # Location encoding
  image.js           # Grayscale posterized JPEG compression
  ingest.js          # Reassemble incoming parts
  syncInbox.js       # Background inbox sync
  sms.js             # Native module wrapper
  db.js              # SQLite (payments + transfers)
modules/off-txt-sms/ # Native Android module (Kotlin)
```

## Key implementation details

- **SMS protocol**: Each part is `ot1.<id>.<kind>.<seq>.<total>.<crc>.<chunk>` — all base36, fits in one GSM-7 segment (153 chars). Parts reassemble on the receiver.
- **Image compression**: Grayscale + posterization + resize to target ~2 KB before splitting.
- **Background listener**: Headless JS task intercepts SMS notifications, stores parts, and triggers reassembly when the app opens.
- **Fonts**: Geist family (loaded via expo-font at runtime).

## Testing

```bash
bun test          # transfer + UPI tests
bun run typecheck # TypeScript strict mode
```

## License

MIT