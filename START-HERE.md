# START HERE — Nowoll Complete Setup Guide
**Read every word. Do every step in order. Do not skip.**

---

## Before you start — what you're setting up

By the end of this guide you will have:
- A professional development environment on Windows (WSL2 + Ubuntu)
- All tools installed: Node.js, pnpm, Docker, Git, GitHub CLI, Claude Code
- A GitHub repository for Nowoll
- The project structure ready for Claude Code to start building
- Claude Code briefed and ready to begin Phase 1

**Time needed:** 2–3 hours (mostly waiting for downloads and installs)

---

# PART A — ONE-TIME MACHINE SETUP

## Step 1 — Enable WSL2 (Windows Subsystem for Linux)

WSL2 gives you a real Linux environment inside Windows. This is required — the entire project runs inside Ubuntu, not Windows directly.

Open **PowerShell as Administrator** (right-click Start → "Windows PowerShell (Admin)"):

```powershell
wsl --install
```

When it finishes, **restart your computer**.

After restart, Ubuntu will open automatically and ask you to create a username and password. Use something simple like `rafi` and a password you'll remember. This is your Linux username — not connected to Windows or any online account.

Verify WSL is working:
```bash
wsl --version
```

---

## Step 2 — Install VS Code

Download from: **https://code.visualstudio.com/**

During installation, check these boxes:
- ✅ "Add to PATH"
- ✅ "Register Code as an editor for supported file types"
- ✅ "Add Open with Code action to Windows Explorer"

After installing, open VS Code and install the WSL extension:
- Press `Ctrl + Shift + X`
- Search: `WSL`
- Install: **Remote - WSL** by Microsoft

---

## Step 3 — Install development tools inside Ubuntu

Open your **Ubuntu** terminal (search "Ubuntu" in Windows Start menu).

Run each line separately, wait for each to finish:

```bash
# Update Ubuntu's package list
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget build-essential

# Configure Git with your details
git config --global user.name "Rafi"
git config --global user.email "your-email@example.com"

# Install Node.js version manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload your terminal config
source ~/.bashrc

# Install Node.js LTS (Long Term Support)
nvm install --lts
nvm use --lts

# Verify Node.js installed correctly
node --version    # should show v20.x.x
npm --version     # should show 10.x.x

# Enable pnpm (the package manager for this project)
corepack enable
pnpm --version    # should show 9.x.x
```

---

## Step 4 — Install Docker Desktop

Download from: **https://www.docker.com/products/docker-desktop/**

During installation:
- ✅ "Use WSL2 instead of Hyper-V" — make sure this is selected

After installing, open Docker Desktop:
- Go to: Settings → Resources → WSL Integration
- Enable the toggle for your Ubuntu distribution

Verify in Ubuntu terminal:
```bash
docker --version          # should show Docker version 25.x.x
docker compose version    # should show Docker Compose version 2.x.x
```

If Docker commands don't work, restart Ubuntu terminal and try again.

---

## Step 5 — Install GitHub CLI

In Ubuntu terminal:

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null

sudo apt update && sudo apt install gh -y

# Login to GitHub
gh auth login
```

When prompted:
- Choose: **GitHub.com**
- Choose: **HTTPS**
- Choose: **Login with a web browser**

Follow the browser instructions. Come back to the terminal when done.

---

## Step 6 — Install Turborepo globally

In Ubuntu terminal:
```bash
pnpm install -g turbo
turbo --version    # should show 2.x.x
```

---

## Step 7 — Install Claude Code

In Ubuntu terminal:
```bash
npm install -g @anthropic-ai/claude-code
claude --version

# Login to Anthropic
claude login
```

Follow the browser login. Come back to the terminal when done.

---

## Step 8 — Install VS Code Extensions

Open VS Code. Press `Ctrl + Shift + X` and install these (search each by name):

**Required — install all of these:**
| Extension name | Publisher |
|---|---|
| Remote - WSL | Microsoft |
| ESLint | Microsoft |
| Prettier - Code formatter | Prettier |
| Docker | Microsoft |
| GitHub Pull Requests and Issues | GitHub |
| Tailwind CSS IntelliSense | Tailwind Labs |
| Prisma | Prisma |
| Error Lens | Alexander Udalov |
| Playwright Test for VS Code | Microsoft |

**Do NOT install:** GitHub Copilot, Cursor, Cline, Roo Code, or any other AI extension. Claude Code is your only AI engineer — multiple AI tools create conflicts.

---

# PART B — CREATE ACCOUNTS (do this in parallel while tools are installing)

Create accounts at all of these. All have free tiers to start with:

| Service | What for | URL |
|---|---|---|
| **GitHub** | Code repository | https://github.com |
| **Supabase** | Database + Storage + Auth | https://supabase.com |
| **SSLCommerz** | Bangladesh payment gateway | https://developer.sslcommerz.com/registration/ |
| **Resend** | Transactional emails | https://resend.com |
| **Cloudflare** | DNS, speed (caching near Bangladesh), protection — free plan | https://cloudflare.com |
| **Sentry** | Error tracking | https://sentry.io |
| **Hostinger** | VPS for the whole site: shop, admin, API, workers | https://hostinger.com (VPS plan) |

**SSLCommerz note:** You get **sandbox credentials immediately** after registration — use those for development. Live credentials require a merchant application with business documents (trade license). Apply for live credentials when you're ready to launch.

---

# PART C — CREATE THE GITHUB REPOSITORY

## Step 9 — Create the repo on GitHub

Go to **https://github.com/new**:
- **Repository name:** `nowoll`
- **Description:** `Nowoll — always new | E-commerce clothing store (Bangladesh)`
- **Visibility:** Private ✅
- **Add a README file:** ✅
- **.gitignore template:** Node
- **License:** None

Click **Create repository**.

---

## Step 10 — Clone the repository to your machine

In Ubuntu terminal:
```bash
# Create a projects folder and clone the repo
cd ~
mkdir projects
cd projects
gh repo clone YOUR_GITHUB_USERNAME/nowoll
cd nowoll
```

Open it in VS Code:
```bash
code .
```

VS Code will open in WSL mode. You should see "WSL: Ubuntu" in the bottom-left corner of VS Code. **From now on, always open the project with `code .` from the Ubuntu terminal.**

---

# PART D — SET UP PROJECT FILES

## Step 11 — Copy starter files into the repository

Take everything from the `nowoll-final` folder you downloaded and copy it into your `~/projects/nowoll/` folder. After copying, the folder should look like:

```
nowoll/
├── CLAUDE.md
├── AGENTS.md
├── START-HERE.md
├── turbo.json
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
└── docs/
    ├── 00-master-spec.md
    ├── learning/
    │   └── parallel-learning-track.md
    └── integrations/
        ├── sslcommerz.md
        └── courier.md
```

---

## Step 12 — Set up your environment variables

In Ubuntu terminal (inside the `nowoll/` folder):
```bash
cp .env.example .env
```

Open `.env` in VS Code and fill in the values you have so far. At minimum:
- Your Supabase URL and anon key (from Supabase dashboard → Settings → API)
- SSLCommerz sandbox store_id and store_password
- A random JWT_SECRET (type any long random string — at least 64 characters)

Leave anything you don't have yet as the placeholder. Claude Code will tell you what's missing.

---

## Step 13 — Start the local database

In Ubuntu terminal (inside `nowoll/`):
```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port 5432 (your local database)
- **Redis** on port 6379 (queue system for background jobs)
- **Mailpit** on port 8025 (catches all emails during development — open http://localhost:8025 to see them)

Verify everything is running:
```bash
docker compose ps
```

All three services should show status `running`.

---

## Step 14 — First Git commit

Push your starter files to GitHub:
```bash
cd ~/projects/nowoll
git add .
git commit -m "chore: add project foundation files"
git push origin main
```

---

# PART E — START BUILDING WITH CLAUDE CODE

## Step 15 — Open Claude Code

In VS Code, open the integrated terminal (`Ctrl + \`` `). Make sure it shows **Ubuntu/WSL** — not PowerShell or CMD.

Navigate to your project:
```bash
cd ~/projects/nowoll
```

Start Claude Code:
```bash
claude
```

---

## Step 16 — Your first message to Claude Code

Copy and paste this **exactly** as your first message:

```
Read CLAUDE.md completely, then read docs/00-master-spec.md completely.
Do not modify any files yet.

After reading both files, tell me:
1. Confirm the brand name, tech stack, and the 8 mandatory rules in your own words
2. List what files currently exist in this repository
3. List what is missing that needs to be created for Phase 1
4. Write a step-by-step plan for completing Phase 1 of the build order

Wait for my approval before writing any code.
```

Read Claude Code's response. If it understood correctly, reply:
```
Approved. Begin Phase 1.
```

---

## Step 17 — The daily workflow

**Every time you open a new Claude Code session:**

```
Read CLAUDE.md and docs/00-master-spec.md.
Run git status and tell me what was completed last session.
Tell me what Phase we are in and what the next task is.
Do not write any code yet. Confirm the plan first.
```

**After Claude Code completes a feature:**
```
Review what you just built as a senior engineer.
Check for: security issues, missing error handling, edge cases, hardcoded values that should be in the database.
Fix any real issues you find.
Then run: pnpm typecheck && pnpm lint && pnpm test
Show me the results.
```

**After the results look good:**
```
Commit with a conventional commit message and push to GitHub.
```

---

## Step 18 — Parallel learning (do this as you build)

While Claude Code is building, open `docs/learning/parallel-learning-track.md`.

It tells you exactly what to understand at each phase of the build. Don't try to learn everything upfront — learn what the current phase needs.

When Claude Code writes code you don't understand, ask:
```
Explain this code in simple terms. Why is it written this way? What would break if we changed it?
```

---

# CHECKLIST — You're ready when all of these are true

**Machine setup:**
- [ ] WSL2 + Ubuntu installed and working
- [ ] VS Code installed with Remote - WSL extension
- [ ] Git configured with your name and email
- [ ] Node.js v20+ installed via nvm
- [ ] pnpm v9+ working
- [ ] Turborepo installed globally
- [ ] Docker Desktop installed and running
- [ ] GitHub CLI authenticated
- [ ] Claude Code installed and authenticated

**Accounts:**
- [ ] GitHub — repository `nowoll` created and cloned
- [ ] Supabase — project created, URL and anon key noted
- [ ] SSLCommerz — sandbox store_id and store_password received
- [ ] Resend — account created, API key noted
- [ ] Sentry — project created, DSN noted
- [ ] Cloudflare — account created, `nowoll.com` added (docs/integrations/cloudflare.md)
- [ ] Hostinger — VPS ordered: **KVM 2** (8 GB RAM), location **India**, Ubuntu 24.04

**Project:**
- [ ] Starter files copied into `~/projects/nowoll/`
- [ ] `.env` filled with available credentials
- [ ] `docker compose up -d` running (postgres + redis + mailpit all green)
- [ ] First commit pushed to GitHub
- [ ] Claude Code started and reading CLAUDE.md

---

# COMMON PROBLEMS

**"pnpm command not found"**
```bash
source ~/.bashrc
corepack enable
```

**"Docker command not found" in WSL**
Make sure Docker Desktop is open and WSL integration is enabled in Settings.

**"Permission denied" on any command**
Add `sudo` before the command.

**VS Code opened in Windows mode instead of WSL**
Close VS Code, go back to Ubuntu terminal, and type `code .` again.

**Claude Code doesn't remember the project**
Start every session with the daily workflow message above. Claude Code reads CLAUDE.md fresh each time.

---

*Nowoll — always new*
*If you get stuck on any step, copy the exact error message and ask Claude (this chat, not Claude Code) to help you fix it.*
