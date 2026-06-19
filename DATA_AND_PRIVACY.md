# Data and Privacy

AI Habit Desktop records personal computer usage data only for the signed-in local user. Treat this repository as a personal assistant foundation, not as monitoring software for other people.

## Default Behavior

Sensitive modules are off by default:

| Module | Default | Data |
| --- | --- | --- |
| Clipboard memory | Off | Clipboard text, URL, path, code classification, timestamp |
| App usage | Off | Foreground process name and active duration |
| Window and project tracking | Off | Window title, IDE project guess, category, timestamp |

The app stores data in `~/.ai-habit-db`:

- `~/.ai-habit-db/settings.json`
- `~/.ai-habit-db/data/habits.db`
- `~/.ai-habit-db/export_*.json`

## Local API Boundary

The Python backend binds to `127.0.0.1`. Electron generates an API token at startup and passes it to the backend through `AI_HABIT_API_TOKEN`. API routes other than `/api/health` require the `X-AI-Habit-Token` header.

This reduces accidental exposure to arbitrary webpages that try to read localhost services.

## Sensitive Content Filtering

Clipboard filtering is enabled by default. The backend skips clipboard entries that look like:

- private keys
- passwords or secrets assigned in text
- common API token formats

Filtering is heuristic and should be treated as a safety layer, not a guarantee. Users should still avoid copying secrets while clipboard memory is enabled.

## User Controls

The settings panel supports:

- enabling or disabling each data module
- clearing clipboard history
- exporting a JSON snapshot
- changing retention days
- enabling or disabling sensitive clipboard filtering

## Boundaries for Future Work

Do not add hidden collection, remote upload, keylogging, screenshot capture, microphone capture, camera capture, or privilege bypass. If a new module needs more data, add:

- an explicit module switch
- visible UI state
- retention controls
- export/delete support
- a short data inventory in this file

## Removing Local Data

Close the app, then delete `~/.ai-habit-db` to remove local settings, SQLite records, and exports.
