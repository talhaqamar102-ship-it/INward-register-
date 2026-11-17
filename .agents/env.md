# Workspace Environment Preflight

Captured by `ENV PREFLIGHT` command (`PS 5.1.26100.9818`):

| Binary / Runtime | Preflight Path / Status | Operational Note |
| :--- | :--- | :--- |
| `node` | `C:\Program Files\nodejs\node.exe` | Available |
| `npx` | `C:\Program Files\nodejs\npx.ps1` | Available (`PS 5.1` script) |
| `git` | `C:\Program Files\Git\cmd\git.exe` | Available |
| `python` | `C:\Users\Hammad Ind\AppData\Local\Microsoft\WindowsApps\python.exe` | **Windows Store alias stub** — exited `1` (`Python was not found`) when invoked in this session; do **not** call `python` |
| `py` | `MISSING` | Unavailable |
| `rg` | `MISSING` | Unavailable (`Select-String` works in `PS 5.1`) |
| `sqlite3` | `MISSING` | Unavailable (repo uses Node `better-sqlite3` via `tsx`/`node`) |
| Shell | `PS 5.1.26100.9818` | Avoid PS `7` syntax (`??`, ternary, pipable `foreach`) |
