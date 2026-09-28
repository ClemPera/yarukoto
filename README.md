# Yarukoto (やること)

A small local-first daily task tracker. No account, no server, no sync — everything lives in your browser's local storage.

"Yarukoto" is Japanese for "things to do."

## How it works

- **Daily** tasks are habits: they reappear every day and reset to unchecked at midnight. A history view shows the last 14 days per habit.
- **Today** tasks are one-off: if you don't finish one, it just stays on the list until you do — nothing is lost. Once checked, it stays visible with a strikethrough below the pending ones for the rest of the day (tap again to undo), then drops off the active list — still logged in History.
- **Local** only: no backend, no accounts. Data stays in your browser via `localStorage`.
- **Export / import**: back up your data to a JSON file, or restore from one.
- **Dark mode**: follows your OS/browser color-scheme preference automatically.

## Running it

No build step, no dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server`, then visit `http://localhost:8000`

## Stack

Plain HTML, CSS, and JavaScript. No framework, no bundler.

## License

MIT — see [LICENSE](LICENSE).
