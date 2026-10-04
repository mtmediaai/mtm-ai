# MTM Brand Asset Repository

Blueprint for `github.com/mtmediaai/mtm-assets`. A public, version locked, zero cost CDN for every
image the IIIP deliverable and the wider MTM surface depend on.

## Why a dedicated repo

1. **Zero COGS delivery.** GitHub Pages and the jsDelivr edge serve the files free, globally, with
   long lived cache headers. No S3 bill, no image host subscription.
2. **Version locking.** Pin `@main` for rolling updates or pin a tag such as `@v1.4.0` when a client
   deliverable must never visually change after it ships.
3. **Machine legibility.** Filenames, alt text, and a manifest give crawlers and answer engines a
   clean, structured read on every asset.

## Resolution patterns

```
Raw     https://raw.githubusercontent.com/mtmediaai/mtm-assets/main/<path>
Edge    https://cdn.jsdelivr.net/gh/mtmediaai/mtm-assets@main/<path>
Pinned  https://cdn.jsdelivr.net/gh/mtmediaai/mtm-assets@v1.0.0/<path>
```

Always use the jsDelivr edge inside deliverables. Raw GitHub is rate limited and is not a CDN.

## Directory structure

```
mtm-assets/
├── README.md
├── manifest.json                 machine readable index of every asset
├── brand-icons/
│   ├── mtm-monogram-gold-onyx.webp
│   ├── mtm-wordmark-gold-onyx.webp
│   ├── social-linkedin-gold.svg
│   ├── social-substack-gold.svg
│   ├── social-youtube-gold.svg
│   ├── social-x-gold.svg
│   ├── social-instagram-gold.svg
│   ├── social-facebook-gold.svg
│   ├── social-threads-gold.svg
│   ├── social-tiktok-gold.svg
│   └── social-pinterest-gold.svg
├── placeholders/                 the five evergreen Modern Agentic Search panels
│   ├── modern-agentic-search-answer-divide.webp
│   ├── modern-agentic-search-buyer-habits.webp
│   ├── modern-agentic-search-record-clarity.webp
│   ├── modern-agentic-search-corridor-integrity.webp
│   └── modern-agentic-search-roadmap.webp
├── infographics/                 per client 16:9 visibility snapshots
│   └── <client-slug>-ai-visibility-snapshot.webp
├── audio/                        per client briefing recordings
│   └── <client-slug>-audio-briefing.mp3
└── docs/
    └── <client-slug>-data-pack.pdf
```

## Naming law

Lowercase, hyphen separated, no spaces, no underscores, no dates in the filename unless the asset is
genuinely time bound. The name itself is metadata, so it must read as a description.

```
GOOD   modern-agentic-search-answer-divide.webp
GOOD   sovereign-group-ai-visibility-snapshot.webp
BAD    Screenshot 2026-09-22 at 4.15.03 PM.png
BAD    infographic_FINAL_v3.PNG
```

Client slug rule: lowercase the company name, replace every run of non alphanumeric characters with
a single hyphen, trim leading and trailing hyphens. `The Sovereign Group` becomes `sovereign-group`.

## Optimization standard

| Asset type | Format | Target width | Quality | Notes |
| --- | --- | --- | --- | --- |
| Visibility snapshot | WebP | 1920 px, strict 16:9 | 82 | Under 400 KB |
| Evergreen panel | WebP | 1200 px | 78 | Under 180 KB |
| Brand monogram | WebP | 512 px square | 90 | Transparent background |
| Social icon | SVG | vector | n/a | `currentColor` fill so CSS drives the gold |
| Data pack | PDF | n/a | n/a | Linearized for fast first page render |

Conversion, if you are batching locally:

```bash
# single file, 16:9 snapshot
cwebp -q 82 -resize 1920 1080 input.png -o sovereign-group-ai-visibility-snapshot.webp

# batch a folder
for f in *.png; do cwebp -q 80 "$f" -o "${f%.png}.webp"; done
```

Always declare intrinsic dimensions on the consuming `<img>` tag so the layout never shifts while
the asset loads.

## manifest.json shape

One entry per asset. This is what makes the library legible to both the build agents and to crawlers.

```json
{
  "version": "1.0.0",
  "updated": "2026-09-22",
  "assets": [
    {
      "id": "modern-agentic-search-answer-divide",
      "path": "placeholders/modern-agentic-search-answer-divide.webp",
      "cdn": "https://cdn.jsdelivr.net/gh/mtmediaai/mtm-assets@main/placeholders/modern-agentic-search-answer-divide.webp",
      "category": "placeholder",
      "collection": "modern-agentic-search",
      "slot": 1,
      "width": 1200,
      "height": 800,
      "bytes": 164238,
      "format": "webp",
      "alt": "Comparison chart showing how rarely conversational search tools name an established local firm when asked for a recommendation.",
      "caption": "The direct answer opportunity.",
      "tags": ["agentic-search", "evergreen", "social-proof", "bento-panel"],
      "license": "MT Media AI proprietary",
      "addedOn": "2026-09-22"
    }
  ]
}
```

Required fields on every entry: `id`, `path`, `cdn`, `category`, `width`, `height`, `format`, `alt`,
`tags`, `addedOn`. The `alt` field is not optional. It is the single most important machine legibility
signal an image carries.

## Wiring assets into the deliverable

The five evergreen panels resolve through `visualSnapshot.items[].imageUrl`. The personalized
snapshot resolves through `personalizedSnapshot.imageUrl`. The audio briefing resolves through
`audioBriefing.audioUrl`. The offline fallback resolves through `ignitionHub.offlinePackUrl`.

For a same day delivery you can skip the repo entirely and drag files straight into the ingestion
console with `Ctrl + Shift + U`. That binds them as in memory object URLs for the live session. For
anything you ship and expect to persist, commit the file to the repo and paste the CDN URL into the
config instead.

## Research capture date

The research automation must set `personalizedSnapshot.capturedAt` when the findings are captured,
before delivery. Supply an ISO 8601 timestamp with `Z` or an explicit offset, such as
`2026-09-22T08:00:00.000Z`. The dates in the sample payload and preview are examples only.

The date is never fixed in the template. Set `personalizedSnapshot.capturedAt` to the ISO timestamp of
the capture, or to `"auto"`. It resolves in this order:

1. A `?captured=` value on the delivery link, for example `?captured=2026-09-22T14:03:00-05:00`.
2. `personalizedSnapshot.capturedAt` in the payload, when it is a valid ISO date or timestamp.
3. Otherwise the first time the package opens on a device. That moment is stamped once and kept, so
   the date does not drift when the page is reloaded.

`personalizedSnapshot.timeZone` (for example `America/New_York`) sets the zone the date is shown in.
When it is omitted, the viewer's own time zone is used. An ISO date-only value (`2026-09-22`) keeps its
calendar day unchanged. All displayed capture dates use `MM/DD/YYYY`.

The snapshot introduction, the image caption, and the audio personalization tokens all read the same
capture record, so they always agree. No research platform is named in the client-facing copy. This
frontend does not run the automated research itself, so for exact timing have the capture automation
write `capturedAt` or append `?captured=` to the delivery link.

## Personalization tokens

Audio copy (`personalNote`, `transcript`, `transcriptHeading`, `transcriptCopy`, `llmPrompt`, chapter
titles) and any `data-bind` text can carry tokens, so one template reads as written for each prospect.

```
{{company}}  {{firstName}}  {{addressee}}  {{executiveName}}  {{title}}
{{territory}}  {{field}}  {{capturedDate}}  {{ignitionHub.coreFour.delta_dg.score}}
```

`{{addressee}}` is the prospect's `firstName` when supplied, and otherwise the company team, so a
greeting never reads as a blank. Any payload path works as a token. Unknown tokens render empty.

## Audio briefing

Drop the audio file on the deck, or click to browse. The transcript (`.txt`, `.md`, or `.pdf`) can come
in the same drop and becomes the downloadable transcript. Or set `audioBriefing.audioUrl` and
`audioBriefing.transcript` (a string or an array of paragraphs) or `audioBriefing.transcriptUrl` in the
payload. The deck resumes the listener's position, and exposes lock screen and headset controls.

## Ignition Hub notebook

Each prospect gets their own Gemini Notebook (formerly NotebookLM). Build the notebook, then in the
notebook's **Share** panel set access to **Anyone with a link**, copy the link, and paste it into
`ignitionHub.geminiNotebookUrl` or bind it from the ingestion console.

```
https://notebook.google.com/notebook/6881deb7-8a5d-42b2-ac4f-16a186d161ae
```

Both `notebook.google.com` and the older `notebooklm.google.com` host are accepted.

What a viewer can do with that link, per Google's documentation:

- Read every source and note you shared.
- Ask questions in chat, answered only from those sources, with clickable citations.
- Open artifacts you already generated: briefing doc, FAQ, study guide, audio overview, mind map.
- Generate their own summaries and overviews from your sources.

What they cannot do: add, remove, or edit sources. The research stays exactly as delivered.

Two constraints worth knowing before you send:

1. **A viewer must be signed in to a Google account to open a shared notebook.** The section copy
   states this plainly rather than promising open access. Individually shared *artifacts* can be
   viewed without signing in, but the notebook itself cannot.
2. **Public link sharing is a personal-account feature.** On Workspace and Education accounts,
   sharing is restricted to the same domain, so build client notebooks from a personal account.

For anyone without a Google account or behind a corporate block, set `ignitionHub.offlinePackUrl` to
a hosted PDF. The fallback line turns into a direct download. With no pack set, it falls back to an
email request to `contact.emailUrl`.

## Suggested commit cadence

```
assets: add sovereign-group visibility snapshot, 16:9 webp, 312kb
assets: replace answer-divide panel with 2026 Q3 figures
assets: add gold social icon set, svg, currentColor
chore: regenerate manifest.json
```

Tag a release whenever a client deliverable ships, so that deliverable can pin to an immutable
version and never change underneath the client.
