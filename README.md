# Recorder

Record audio in the browser → transcribe it with Deepgram → read the transcript and an
auto-generated summary in tabs → open a chatbox and ask questions about it.

**Everything lives in Firestore, and there is no Firebase Auth.** The browser never
talks to Firestore directly: all reads and writes go through this app's API routes
using the Admin SDK, which bypasses security rules entirely. So no sign-in method to
configure, no Cloud Storage bucket, no rules to deploy — and the database stays fully
locked down to outside clients.

```
browser mic (MediaRecorder)
      ↓  POST /api/recordings   (raw audio in the body)
server splits into <=768 KB chunks (Firestore caps a document at 1 MiB)
Firestore  recordings/<id>/audioChunks/{0,1,2,…}   native bytes
      ↓  POST /api/transcribe   (server reassembles, POSTs the bytes)
Deepgram nova-3  (diarize + utterances + smart_format)
      ↓
Firestore  recordings/<id>.transcript
      ├─ POST /api/summarize  → .summary        (fires once, automatically)
      └─ POST /api/chat       → .../messages    (streamed, on demand)
                                 both via OpenRouter
```

## The interface

Strictly black and white — white background, black text, no colour anywhere. State is
shown by inverting fill, by weight, and by rules, never by hue. Built mobile-first, with
a fixed bottom tab bar:

- **Record** — a large microphone button centred on the screen. Tap it to start; a
  pulsing ring, a live timer and a **Submit** button appear. Submit stops the capture,
  saves it, kicks off transcription and takes you to the recording. Below it,
  **Upload a recording** takes an existing audio file through exactly the same
  pipeline — tap to pick on a phone, or drag and drop on desktop.
- **Recordings** — every recording, newest first, with a status chip (filled black once
  ready). Tap one to open it.

A recording's page has **Transcript** and **Summary** tabs plus a **Chat with this
transcript** button that opens a chatbox — full-screen on a phone, docked bottom-right on
desktop, `Esc` to close. Tapping a timestamp in the transcript seeks the audio.

A recording containing no speech says so plainly rather than showing an empty panel, and
hides the summary and chat, which would have nothing to work with.

## Setup

### 1. Install

```bash
npm install
```

### 2. Firebase project

In the [Firebase console](https://console.firebase.google.com):

1. **Firestore Database →** create a database. Production mode is correct — the
   [rules](firestore.rules) deny all client access on purpose.
2. **Project settings → Service accounts → Generate new private key.** From that JSON
   take `project_id`, `client_email` and `private_key`.

That's all. No Authentication, no Storage, and the free **Spark** plan is enough.

### 3. Environment

```bash
cp .env.local.example .env.local
```

The one thing that trips people up: `FIREBASE_PRIVATE_KEY` must be wrapped in double
quotes with the `\n` sequences left **escaped**, exactly as they appear in the
service-account JSON.

Keys needed: [Deepgram](https://console.deepgram.com) and
[OpenRouter](https://openrouter.ai/keys). Every value is server-side — there are no
`NEXT_PUBLIC_*` variables, so no credentials reach the browser.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Microphone capture needs a secure context — `localhost`
counts, but a bare LAN IP does not.

Optionally push the rules (they only tighten the default):

```bash
npx firebase deploy --only firestore:rules
```

## How it works

**Uploading** — [`Uploader.tsx`](src/components/Uploader.tsx) accepts MP3, M4A, AAC,
WAV, FLAC, OGG and WebM. It rejects the wrong type, empty files and anything over the
size cap *before* uploading, so a 41 MB file never leaves the browser. Files whose type
the OS reports as empty (common on Safari and some Android pickers) are matched on
extension instead of being refused. Duration isn't carried by an uploaded file, so
`probeDuration` reads it from the browser's own metadata decode; the title comes from the
filename with its extension stripped. [`POST /api/recordings`](src/app/api/recordings/route.ts)
also rejects a non-audio content type itself, since the client check is bypassable and
the failure would otherwise surface as a confusing Deepgram error.

Uploads use `XMLHttpRequest` rather than `fetch` — `fetch` cannot report upload progress,
and a 40 MB file with no progress bar looks frozen. The recorder shares the same path, so
it gets a real progress bar too.

**Recording** — [`Recorder.tsx`](src/components/Recorder.tsx) uses `MediaRecorder` with
echo cancellation and noise suppression, picking the first container the browser
supports (Opus-in-WebM on Chrome/Firefox, MP4 on Safari). An `AnalyserNode` reads the
input level and scales the button slightly as you speak, so it's obvious the mic is live.
Submit stops capture and POSTs the blob once; the server does the rest.

**Audio in Firestore** — [`POST /api/recordings`](src/app/api/recordings/route.ts)
splits the blob into 768 KB chunk documents, written as native Firestore bytes (not
base64, which would inflate everything by 33%), one document per commit since
Firestore caps a commit at ~10 MiB. `chunkCount` is written to the parent document only
*after* every chunk lands, so a failed upload can never be mistaken for complete audio.

**Playback** — [`GET /api/recordings/[id]/audio`](src/app/api/recordings/[id]/audio/route.ts)
reassembles the chunks and serves them to a plain `<audio src>`. It honours `Range`
requests, which browsers require before they'll allow seeking — without that, clicking
a transcript timestamp would do nothing.

**Transcription** — [`POST /api/transcribe`](src/app/api/transcribe/route.ts)
reassembles the audio via [`readAudio`](src/lib/firebase/admin.ts) — ordering by the
numeric `index` field, and erroring rather than silently producing truncated audio if a
chunk is missing — then POSTs the bytes to Deepgram. Failures land in `status: "error"`
with the message, and the UI offers a retry.

Note the asymmetry worth knowing about: writing a bytes field takes a `Buffer`, and the
Admin SDK reads it back as a `Buffer` (a `Uint8Array` subclass), *not* as a `Bytes`
wrapper with `.toUint8Array()`.

**Summary** — [`POST /api/summarize`](src/app/api/summarize/route.ts) asks OpenRouter for
Markdown with fixed sections (Overview, Key points, Decisions, Action items, Open
questions). The detail page fires this once automatically as soon as a transcript
exists, and a cached summary short-circuits the route so revisiting doesn't re-bill the
model. **Regenerate** passes `force: true`.

**Chat** — [`POST /api/chat`](src/app/api/chat/route.ts) builds a system prompt
containing the transcript rendered as `[mm:ss] Speaker N: …`, replays the last 20 turns,
and streams from OpenRouter. The SSE frames are unwrapped server-side into plain text so
the browser just reads the response body. The question is persisted before streaming
starts and the answer when it finishes, so a dropped connection can't lose the thread.

One subtlety in [`streamChat`](src/lib/openrouter.ts): OpenRouter opens every stream with
several `: OPENROUTER PROCESSING` keep-alive frames that carry no text delta. A
`pull()`-driven `ReadableStream` stalls forever on those, so the pump runs in `start()`
instead. Client disconnect stops the pump rather than burning tokens nobody will read.

**Live updates** — with no Firestore listeners in the browser,
[`usePoll`](src/lib/use-poll.ts) re-fetches every 2 s while a recording is uploading or
transcribing, and stops once it settles.

**Rendering** — [`Markdown.tsx`](src/components/Markdown.tsx) is a deliberately small
renderer for headings, lists, bold, inline code and `[mm:ss]` timestamps, shared by the
summary and the chat answers. It never emits raw HTML, so model output can't inject any.

## Data model

```
recordings/{recordingId}
  title, status, createdAt, durationMs, sizeBytes, mimeType, chunkCount, error,
  transcript: { text, utterances[], speakerCount, language, model, transcribedAt }
  summary:    { text, model, generatedAt }

recordings/{recordingId}/audioChunks/{index}
  index, data (bytes, <=768 KB)

recordings/{recordingId}/messages/{messageId}
  role, content, createdAt, model
```

`status` moves `uploading → uploaded → transcribing → transcribed`, or `error` with a
message.

## API

| Route | Purpose |
|---|---|
| `GET /api/recordings` | List, newest first |
| `POST /api/recordings` | Create; body is raw audio, metadata in query params |
| `GET /api/recordings/[id]` | One recording (polled while processing) |
| `PATCH /api/recordings/[id]` | Rename |
| `DELETE /api/recordings/[id]` | Delete it, its chunks and its chat |
| `GET /api/recordings/[id]/audio` | Reassembled audio, supports `Range` |
| `GET /api/recordings/[id]/messages` | Chat history |
| `POST /api/transcribe` | Deepgram |
| `POST /api/summarize` | OpenRouter, cached unless `force` |
| `POST /api/chat` | OpenRouter, streamed plain text |
| `GET /api/models` | OpenRouter catalogue for the model picker |

## Notes and limits

- **No auth means no access control.** Anyone who can reach the server can read and
  write every recording. That's fine for something running on your own machine; put it
  behind a login before deploying it anywhere shared.
- **Firestore is not a blob store.** Audio is capped at 40 MB per recording
  (`MAX_AUDIO_BYTES` in [`audio.ts`](src/lib/audio.ts)), roughly 2–3 hours of Opus mic
  audio. Spark allows 1 GiB of Firestore storage in total, so budget perhaps 30–60 hours
  of audio across all recordings before you need to delete some or move audio to Cloud
  Storage on Blaze. Firestore also costs more per GB than Storage, and playback reads
  every chunk document.
- **No raw Deepgram JSON is kept.** Per-word timings would need their own chunked
  documents; only the diarized utterances the UI uses are stored. Re-running
  transcription re-derives everything from the audio.
- **Long recordings.** `maxDuration = 300` on the routes, and the whole audio buffer
  passes through the Node process on both upload and transcription. On a serverless host
  with a lower ceiling, a long file would need a background job instead of an API route.
- **Transcript context.** Transcripts over ~400k characters get their middle elided
  before being sent to the model. Past that, chunked retrieval would be the fix.
- **Cost.** Deepgram bills per audio minute, OpenRouter per token, and every chat
  message resends the whole transcript. The summary is generated once and cached.
