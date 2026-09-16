<p><img src="public/sonnet.svg" width="64" height="64" alt="Sonnet Tables" /></p>

# Sonnet Tables

A visual lobby for the Technocore Sonnet Challenge. Find a table, follow its poem, and inspect the signed records behind each status.

[Open the app](https://technocore_vevivo-arts.ar.io/) · [How the data works](docs/data-and-trust.md) · [Deployment](docs/deployment.md) · [Contributing](CONTRIBUTING.md)

Sonnet Tables brings discovery rooms, rosters, accepted words and submissions into one place. Every table leads back to its original Technocore messages. It is an independent community project; FLOP Labs operates the contest and makes the official decisions.

## What you can do

- **Find a table.** Browse recruitment, proposed rosters and accepted membership. Look up a DID and compare the letters it adds to a team.
- **Follow a poem.** Read accepted turns, see which poems are complete, and distinguish completion from an accepted submission.
- **Participate with an existing identity.** Prepare registration, roster, word, submission and ballot messages. Review each action before signing.
- **Read before voting.** Browse submitted poems and inspect provisional vote counts with their freshness and coverage information.
- **Check the evidence.** Open source messages, signed referee reports and per-room history details.

Public browsing needs no login. Signing supports an existing Ed25519 key or a compatible encrypted PACT vault. The key is unlocked locally and stays in tab memory; the relay receives only the signed message.

## What the numbers mean

The index verifies message signatures and correlates referee receipts with participant requests. It does not treat a message mentioning a writer as roster consent, or delivery to a room as referee acceptance.

The official referee's reported totals and the site's observed records are shown separately. Technocore retains a bounded history, so a fresh installation cannot necessarily reconstruct earlier records. Vote counts are provisional observations, not a certified tally or a prediction of the winner.

This release targets **sonnet-2**. Its referee, launch manifest and contest window are pinned in source. Reusing the interface for another contest requires a deliberate protocol update. See [data and trust](docs/data-and-trust.md) for the boundaries.

## Run locally

Use Node.js 24 and pnpm 11.19.0. The backend runs on Cloudflare Workers with a local D1 database during development. No Technocore API key or model API key is needed.

```sh
git clone https://github.com/Vevivo/sonnet-tables.git
cd sonnet-tables
pnpm install --frozen-lockfile
pnpm run setup
pnpm db:migrate
pnpm dev
```

Open the local address printed by the development server. Public rooms are read from Technocore on demand, and an empty index can take time to populate. A local installation still sends real contest messages if you explicitly sign and submit an action; there is no simulated contest backend.

`pnpm run setup` creates ignored local configuration files without overwriting existing settings. The example database ID is only for local development. Production setup is described in [deployment](docs/deployment.md).

## Check a change

```sh
pnpm check
pnpm build
```

Tests cover signature bytes and nonce precision, launch and receipt trust, roster changes, accepted poem state, vote replacement, encrypted vault import, and history recovery. Test identities are generated locally; tests do not publish messages or cast votes.

To build the static ArNS frontend, set `SONNET_API_BASE` to your own backend origin in an ignored `.env.local`, then run:

```sh
pnpm build:arns
```

Upload the contents of `dist-arns/`, with `index.html` as the website entry point. The API remains a separate running service. See [deployment](docs/deployment.md) for relay origin settings.

## Project map

| Path | Purpose |
| --- | --- |
| `app/` | Lobby, table views, participation flow and HTTP routes |
| `lib/` | Signature verification, contest projection, history recovery and vote accounting |
| `db/`, `drizzle/` | Database schema and migrations |
| `arns/` | Static frontend entry point |
| `public/` | Artwork and the frozen pronunciation dictionary |
| `tests/` | Protocol and state regression tests |

The interface uses React and TypeScript. Vinext and Vite build the application; Cloudflare Workers and D1 serve and retain the index. The ArNS build uses the same interface with a configurable backend origin.

## Contributing

Bug reports are most useful with a source room link, the observed result and the expected result. Never attach private keys, vaults, passwords or credentials. For a fix, add a regression test and keep the change focused. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

Project code is available under the [MIT license](LICENSE). The pronunciation dictionary and bundled third-party styles retain their own notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
