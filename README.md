# foxit-slides

An AI-assisted slide/deck generation app built with Next.js. It turns prompts
and source documents into editable slide decks, with AI-generated imagery,
PDF/Office import & export, and a rich in-browser editor.

Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. For the full
dependency breakdown and licensing notes, see **[TECH_STACK.md](./TECH_STACK.md)**.

---

## Prerequisites

- **Node.js 20.x** (pinned in `engines`; newer versions work but emit warnings)
- **npm** (a `package-lock.json` is committed)
- API keys for the AI providers you intend to use (see [Environment setup](#environment-setup))

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see below)
cp .env.example .env.local
#   ...then edit .env.local and fill in your keys

# 3. Run the dev server
npm run dev
```

Open **[http://localhost:3002](http://localhost:3002)** in your browser.
(The dev server runs on port **3002**, not the Next.js default 3000.)

## Environment setup

This app needs API keys to function. All variables are documented in
**[`.env.example`](./.env.example)** — copy it to `.env.local` and fill in the
values.

| Variable | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude — primary AI (text/generation) |
| `OPENAI_API_KEY` | **Yes** | OpenAI — image generation, vision judging |
| `GEMINI_API_KEY` | **Yes** | Gemini — vision/design judge |
| `PEXELS_API_KEY` | For stock images | Pexels stock-image search |
| `PIXABAY_API_KEY` | For stock images | Pixabay stock-image search |
| `FOXIT_SDK_SN` / `FOXIT_SDK_KEY` | For PDF features | Foxit PDF SDK (commercial) |
| `FOXIT_CONVERSION_SDK_SN` / `_KEY` | For conversion | Foxit Conversion SDK (commercial) |
| `FOXIT_ESIGN_CLIENT_ID` / `_SECRET` | For eSign | Foxit eSign OAuth |

Optional provider/model and tuning variables are listed in `.env.example`.

> **Security:** `.env.local` is gitignored — never commit real keys. When
> handing this project to a new owner, rotate any shared keys.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server on port 3002 |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |

## Documentation

- **[TECH_STACK.md](./TECH_STACK.md)** — full stack & licensing reference
- **[docs/architecture/](./docs/architecture/)** — architecture notes, including
  the template/pipeline flow overview

## Deployment

This is a standard Next.js app and can be deployed to any Node 20 host (Vercel,
a container, etc.). Ensure all required environment variables are configured in
the target environment. Note that the Foxit SDKs are native modules — the host
must support the platform builds they ship.
