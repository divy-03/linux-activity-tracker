# 🧠 Linux Activity Tracker

**Local-first system monitoring with safe RAM management and n8n automation**

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Bun](https://img.shields.io/badge/Bun-Fast-000000?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![n8n](https://img.shields.io/badge/n8n-Automation-EA4B71?style=flat&logo=n8n&logoColor=white)](https://n8n.io/)

A lightweight daemon that:

- Logs **every shell command** you run
- Monitors **RAM usage** continuously  
- **Safely kills** user processes under memory pressure
- Exposes **HTTP API** for dashboards & n8n workflows
- Runs in **Docker** with persistent SQLite storage

## 🎯 Features

| Feature | Status |
|---------|--------|
| Shell command logging (zsh/bash) | ✅ |
| Continuous RAM monitoring (`/proc/meminfo`) | ✅ |
| High-RAM detection + cooldown logic | ✅ |
| Safe process identification (user-owned only) | ✅ |
| SIGTERM→SIGKILL process killing | ✅ |
| SQLite persistence (commands, stats, events) | ✅ |
| REST API for all data | ✅ |
| n8n webhook integration | ✅ |
| Docker Compose (tracker + n8n + postgres) | ✅ |
| Web dashboard (`/ui`) | ✅ |
| systemd user service | ✅ |

## 🛡️ Safety Rules (Critical)

This tool **NEVER**:

- Kills system processes (systemd, dbus, NetworkManager, etc.)
- Touches root-owned processes
- Kills shell processes or current process
- Uses SIGKILL without trying SIGTERM first (5s grace period)

**Only kills**:

- Processes owned by **current user**
- Above configurable memory threshold (100MB default)
- Not in protected list (40+ system processes by default)
- One process per high-RAM event

## 🚀 Quick Start (Docker)

```bash
# Clone & start everything
git clone <your-repo>
cd linux-activity-tracker
docker compose up -d

# Tracker API: http://localhost:3000/health
# Tracker UI: http://localhost:3000/ui
# n8n: http://localhost:5678
```

## 📦 Manual Install (Bun)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone project
git clone <your-repo>
cd linux-activity-tracker

# Install & run
bun install
bun dev
```

**Install shell hooks** (logs every command):

```bash
cd shell-hooks
chmod +x *.sh
./install.sh  # Adds to ~/.zshrc or ~/.bashrc
source ~/.zshrc  # Reload shell
```

## 🔧 API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | System status + stats |
| `GET /ram/current` | Live RAM usage |
| `GET /ram/status` | Monitor + detector status |
| `GET /processes/killable` | Safe-to-kill processes |
| `GET /commands` | Recent shell commands |
| `POST /api/command` | Log command (shell hook) |
| `GET /kill/dry-run` | Preview what would be killed |
| `GET /reports/daily-commands` | 24h command summary |
| `GET /killed/history` | Killed processes log |

**Full API docs**: Open `http://localhost:3000/` after starting.

## 🧩 n8n Workflows (Pre-built)

1. **RAM Spike Alerts**: Webhook receives `ram_spike` events → Slack/Email.
2. **Daily Command Summary**: Cron → `/reports/daily-commands` → Email.
3. **Weekly System Report**: Weekly cron → `/reports/weekly-system` → Email.
4. **DB Backup**: Daily cron → S3/Google Drive.

**Tracker auto-calls n8n webhook** at `http://n8n:5678/webhook/ram-spike` on high RAM.

## ⚙️ Configuration

Edit `config.json` or use environment variables:

```json
{
  "ram": {
    "threshold": 90,           // % before action
    "enableAutoKill": false,   // Safety toggle
    "cooldown": 120000         // 2min between kills
  },
  "processes": {
    "minMemoryMB": 100,        // Ignore tiny processes
    "protected": ["systemd", "zsh", "NetworkManager"]
  }
}
```

**Env overrides** (Docker-friendly):

```bash
RAM_THRESHOLD=92
RAM_ENABLE_AUTOKILL=true
PROTECTED_PROCESSES="firefox,chrome,code"
```

## 🏃‍♂️ Production Deployment

### Option 1: Docker (Recommended)

```bash
docker compose up -d  # tracker + n8n + postgres
```

### Option 2: systemd user service

```bash
cp service/linux-activity-tracker.service ~/.config/systemd/user/
systemctl --user enable --now linux-activity-tracker.service
```

## 📊 Architecture

```
Shell (zsh/bash) ──(preexec hook)──> curl ──> Tracker API
                                                    │
                            ┌───────────────────────┼─── SQLite
                            │                       │
                    ┌───────▼───────┐       ┌───────▼───────┐
                    │   RAM Monitor │──────▶│  system_stats │
                    │ `/proc/meminfo`│       │   commands    │
                    └───────┬───────┘       └───────┬───────┘
                            │                       │
                    ┌───────▼───────┐       ┌───────▼───────┐
                    │ RAM Detector  │──────▶│    events     │
                    │  + Cooldown   │       │killed_procs.. │
                    └───────┬───────┘       └───────────────┘
                            │
                    ┌───────▼───────┐
                    │Process Scanner│
                    │     ps -u     │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │Process Killer │───(SIGTERM)───> Linux
                    │SIGTERM→SIGKILL│
                    └───────────────┘
```

**n8n** ↔ **Tracker** via HTTP (`http://tracker:3000`, `http://n8n:5678`).

## 🧪 Testing

```bash
# Test individual components
bun run test:db        # Database CRUD
bun run test:ram       # /proc/meminfo parsing
bun run test:detector  # Threshold logic
bun run test:processes # Process scanning
bun run test:killer    # Dry-run killing
```

## 📈 Example Data

**Recent Commands** (`GET /commands`):

```json
[
  {"cmd": "git status", "cwd": "/home/user/project", "created_at": 1735040000},
  {"cmd": "docker compose up", "cwd": "/home/user/tracker", "created_at": 1735039000}
]
```

**RAM Status** (`GET /ram/current`):

```json
{
  "percent": 87.3,
  "used_mb": 14250,
  "total_mb": 16384,
  "timestamp": 1735041000
}
```

## 🤝 Contributing

1. Fork & clone
2. `bun install`
3. `bun dev` for development
4. Add tests in `test-*.ts`
5. Submit PR

## 📄 License

MIT

---

**⭐ Star if useful!**  
Built with ❤️ for developers who want control over their local system.

