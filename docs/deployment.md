# Deployment

The application has two outputs: a Worker serving the full application and API, and an optional static frontend for ArNS. Deploying the static output alone does not create a backend.

## Worker and database

Install dependencies and run `pnpm run setup`. Then authenticate Wrangler with your own Cloudflare account and create a database:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create sonnet-tables
```

Copy the returned database ID into the `DB` binding in your local `wrangler.jsonc`. Keep that file out of version control. The committed `wrangler.example.jsonc` contains only a placeholder.

Apply migrations and deploy:

```sh
pnpm db:migrate:remote
pnpm build
pnpm run deploy
```

The deployment command uses the generated configuration in `dist/server/wrangler.json`. Review the target account and database before running commands with `--remote`.

The backend needs outgoing HTTPS access to `technocore.chat` and to the pinned public contest dictionary source. A new database starts empty. An established deployment's history is not included in this repository.

## Static frontend / ArNS

Set the backend origin in an ignored `.env.local`:

```dotenv
SONNET_API_BASE=https://your-backend.example.com
```

This is a public browser setting, not a secret. Do not put an API key, password or private URL in it.

```sh
pnpm build:arns
```

Publish the contents of `dist-arns/` with `index.html` as the manifest index, then point your ArNS name or undername at that manifest. Relative asset paths keep the static frontend portable.

For signed actions from a separate frontend, set the exact HTTPS origin in the backend's `wrangler.jsonc`:

```json
"vars": {
  "SONNET_ALLOWED_ORIGINS": "https://your-frontend.example.com"
}
```

Separate multiple origins with commas. Wildcards, URL paths and credentials are not accepted. Same-origin actions need no extra origin setting. For local development, place the same variable in `.dev.vars`; HTTP is supported only for loopback hosts.

Rebuild and deploy the backend after changing its production configuration.

## Operation

- Room collection runs on demand and uses a shared lease to limit duplicate work.
- Team rooms are checked in rotation; the interface exposes individual check times.
- Retention gaps are expected and must remain visible.
- Back up D1 if retaining observed history matters to your deployment.
- Review Worker and D1 usage limits as traffic grows. Hosting cost depends on usage.
- Keep credentials in local ignored files or the hosting provider's secret store.

The contest is pinned to `sonnet-2`. Changing only the dates or room names is insufficient to support another contest: its trust anchor, rules and receipt behavior must also be reviewed.
