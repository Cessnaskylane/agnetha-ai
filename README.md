# Agnetha

A small public site. Anyone may type in the bar and talk with Agnetha, a quiet presence in the mid-1970s. Nothing private. No accounts.

## Run locally

Copy .env.example to .env and add your xAI key on the XAI_API_KEY line.

    npm install
    npm run dev

Then open http://localhost:3000

Without a key the page still loads. She will only say she cannot talk just now.

## The key

Create an API key at https://console.x.ai and set XAI_API_KEY. The prompt and the key stay on the server. They are never sent to the browser.

## Deploy

Point agnetha.ai at whichever host you use (A record or CNAME in DNS). Set XAI_API_KEY in that host environment.

### Vercel

1. Import this folder as a project.
2. Add XAI_API_KEY.
3. Deploy. Output directory is public. The chat route is /api/chat.

    npx vercel --prod

### Cloudflare Pages

1. New Pages project from this repo.
2. Build command: leave empty. Output directory: public.
3. Add XAI_API_KEY under Settings, Environment variables (production and preview).
4. Deploy. The function at functions/api/chat.js becomes /api/chat.

    npx wrangler pages deploy public

If you use Wrangler from this folder, wrangler.toml already names the output directory public.
