# Nowoll Parallel Learning Track
> Learn the stack AS you build Nowoll — not before, not separately.
> Every concept is taught at the exact moment you need it for the store.

---

## The Core Idea

Most learning roadmaps say: learn everything first, then build.
This roadmap says: **build Nowoll → understand each piece as it appears.**

The PDF roadmap estimates 900–1,400 hours for a beginner from zero to junior-employable.
You will hit roughly that same number building Nowoll — but with a real, live product at the end.

---

## Your Learning Stack (same as Nowoll's build stack)

```
TypeScript          ← Language everything is written in
React               ← UI building blocks
Next.js             ← React framework (routing, SSR, images, SEO)
NestJS              ← Backend framework (API, auth, validation)
Prisma              ← Database layer (schema, migrations, queries)
PostgreSQL          ← Actual database
Tailwind CSS        ← Styling
Zustand             ← Frontend state (cart, wishlist)
Docker              ← Local environment, VPS deployment
Git + GitHub        ← Version control, collaboration
```

---

## Phase 1 — Foundation (Before writing any Nowoll code)
**Time: ~2 weeks | Learn while setting up the project**

### What to learn

**TypeScript basics** (3–4 days)
You'll encounter TypeScript immediately when reading and writing any Nowoll code. Learn enough to not be confused:
- What is a `type` and `interface` — and what's the difference?
- What is a generic (`Array<string>`, `Promise<User>`) — how to read them?
- What does `?` mean on a property (`name?: string`)?
- What is `as` casting and when is it used?

> **Where to practice:** https://www.typescriptlang.org/play — open this in a browser tab, paste short snippets from Nowoll code and experiment.

**React basics** (3–4 days)
You'll write React components immediately in the Next.js storefront.
- What is JSX? Why does it look like HTML but isn't?
- What is `useState` — why does changing a variable not update the UI without it?
- What is `props` — how does data flow from parent to child?
- What is a component — why do we split UI into components?

> **Where to practice:** https://react.dev/learn — do the "Quick Start" section only. Stop at "Thinking in React."

**Git workflow** (1 day)
You'll use Git every day with Claude Code.
- `git status` — what changed?
- `git add` + `git commit` — save a snapshot
- `git push` — send to GitHub
- `git checkout -b feature/name` — create a branch
- `git pull` — get latest changes

> **Where to practice:** Just use it on the Nowoll repo. Claude Code will guide you.

### Milestone: Understand the project structure
After Phase 1, open the Nowoll repo and be able to answer:
- Where does the storefront code live?
- Where does the API code live?
- Where is the database schema?
- What is `pnpm dev` actually doing?

---

## Phase 2 — Building the Product Catalog (Nowoll Phases 1–2)
**Time: ~3–4 weeks | Learn while building categories + products**

### What you'll build in Nowoll
Categories, products, product variants, image upload, the PLP and PDP pages.

### What to learn alongside it

**Next.js App Router** (learn as you build storefront pages)

The single most important mental model:
```
Server Component = runs on server, returns HTML → fast, SEO-friendly, can query DB
Client Component = runs in browser, can use useState/useEffect → interactive
```

Questions to be able to answer after this phase:
- Why does `page.tsx` not need `'use client'`?
- Why does the cart component need `'use client'`?
- What is ISR (`revalidate: 60`) and why do product pages use it?
- What does `generateStaticParams` do for product pages?
- What is `next/image` and why not just `<img>`?

> **Understand by doing:** When Claude Code adds a new page, ask it: "Why is this a Server Component and not a Client Component?"

**NestJS basics** (learn as you build the products API)

The mental model:
```
Module    = a feature container (e.g. ProductsModule)
Controller = receives HTTP requests, calls Service
Service    = business logic, calls Prisma
DTO        = the shape of data coming IN (validated with class-validator)
Guard      = checks if the request is allowed (auth check)
```

Questions to be able to answer after this phase:
- What does `@Injectable()` mean?
- Why does the Controller not talk to the database directly?
- What does `@Body()` do on a controller method?
- What is `class-validator` and why do we need it?

> **Understand by doing:** When Claude Code creates a new NestJS module, ask: "Walk me through what happens when a request hits POST /products — from the HTTP request to the database write."

**Prisma** (learn as you write the schema)

The mental model:
```
schema.prisma = defines your tables (called "models") and their relationships
prisma migrate dev = creates a migration file and applies it to the local DB
prisma generate = regenerates the TypeScript client from the schema
PrismaClient = the object you use in code to query the database
```

Questions to be able to answer:
- What is a foreign key and why does `order_items` have `order_id`?
- What does `@relation` mean in Prisma schema?
- What is a migration and why can't I just edit the database directly?
- What does `prisma.$transaction()` do and why is it used for order creation?

> **Resource:** https://www.prisma.io/docs/getting-started — read "What is Prisma?" and "Prisma schema" sections.

---

## Phase 3 — Commerce Core (Nowoll Phases 3–4)
**Time: ~4–5 weeks | Learn while building cart + checkout + payments**

### What you'll build in Nowoll
Cart, checkout, SSLCommerz payment, orders, customer accounts.

### What to learn alongside it

**Zustand** (learn as you build the cart)

Zustand is a state management library. Mental model:
```
Problem: cart items need to be accessible across 10 different components
Solution: a "store" that lives outside any component, any component can read/write it
```

Questions to be able to answer:
- What problem does Zustand solve that `useState` can't?
- Why does the cart persist in localStorage?
- What is the difference between `store.items` (the state) and `store.addItem` (an action)?

**HTTP and REST** (learn as you build the API + frontend fetch calls)

You'll call the NestJS API from Next.js. Understand:
- What is a HTTP request? What are GET/POST/PATCH/DELETE?
- What is a response status code? (200 = OK, 400 = bad request, 401 = not logged in, 500 = server crashed)
- What is JSON and why do APIs use it?
- What is an API endpoint? (`POST /api/v1/orders` = "create an order")

> **Understand by doing:** Open the browser Network tab when doing a checkout. Watch the actual HTTP request go out and the response come back.

**Authentication + cookies** (learn as you build login)

Mental model:
```
1. User logs in with email + password
2. Server verifies credentials
3. Server creates a JWT (a signed token with user ID + role inside)
4. JWT stored in an HttpOnly cookie (browser sends it automatically on every request)
5. Server reads the cookie on each request to know who is asking
```

Questions to be able to answer:
- Why is the JWT in a cookie and not localStorage?
- What is "HttpOnly" and why does it matter for security?
- What does "stateless authentication" mean?

**SSLCommerz payment flow** (learn as you integrate payments)

Read `docs/integrations/sslcommerz.md` together with Claude Code's implementation. Be able to draw this flow on paper:
```
Customer clicks Pay
→ Frontend calls API
→ API creates order in DB (status: PENDING)
→ API calls SSLCommerz
→ SSLCommerz returns a URL
→ Customer is redirected to SSLCommerz page
→ Customer pays
→ SSLCommerz POSTs to our /ipn endpoint
→ We validate with SSLCommerz Validation API
→ If valid → mark order PAID, send confirmation email
→ If invalid → cancel order, restore stock
```

---

## Phase 4 — Admin Panel + Workers (Nowoll Phase 5)
**Time: ~3 weeks | Learn while building admin + background jobs**

### What to learn alongside it

**Background jobs / queues** (learn as you build BullMQ workers)

Mental model:
```
Problem: sending an email after an order takes 500ms — the customer is waiting
Solution: return HTTP 200 immediately, add "send email" to a queue, process later

Queue = a list of jobs to do
Worker = a process that picks jobs from the queue and executes them
Redis = where the queue is stored (fast, in-memory)
BullMQ = the library that manages queues and workers for Node.js
```

Questions to be able to answer:
- Why does the order creation endpoint not send the email directly?
- What happens to a queued job if the server crashes before it runs?
- What is "retry with backoff" and why do workers need it?

**Docker basics** (learn as you set up the VPS)

Mental model:
```
Docker = a way to package an app + its dependencies into a portable box
Container = a running instance of that box
docker-compose = runs multiple containers together (api + postgres + redis)
```

Questions to be able to answer:
- What is the difference between an image and a container?
- Why does `docker-compose up` start Postgres and Redis along with the API?
- What is a volume (in docker-compose) and why is it needed for the database?

---

## Phase 5 — Deployment + CI/CD (Nowoll Phase 7)
**Time: ~1–2 weeks | Learn while going live**

### What to learn alongside it

**Nginx as a reverse proxy**
```
Internet → Nginx (port 80/443) → NestJS API (port 3001, internal only)
```
Why: so the NestJS port is never exposed to the internet directly. Nginx handles SSL termination.

**GitHub Actions CI/CD**
```
Push to main branch
→ GitHub runs your workflow
→ Install dependencies
→ Run lint + typecheck + tests
→ If all pass → deploy to Vercel (frontend) + VPS (backend)
```

**What is SSL/HTTPS?**
- Certbot gets a free certificate from Let's Encrypt
- Nginx uses this certificate to encrypt traffic between browser and server
- `https://` = encrypted, `http://` = plain text

---

## How to Learn Effectively While Building

### The "Ask Why" method
Every time Claude Code writes something you don't understand:
```
"Explain why this line of code works the way it does, in simple terms."
"What would break if we removed this?"
"What is the name of this pattern?"
```

### The "Draw It" method
After each major feature (checkout, auth, payments), draw the flow on paper:
- What data goes in?
- What happens in the database?
- What goes back to the user?

If you can draw it, you understand it.

### The "Break It Intentionally" method
After a feature works, try:
- Remove a validation rule — what happens?
- Comment out the stock decrement — what breaks?
- Try a payment with insufficient stock — does it handle it correctly?

Seeing what breaks is the fastest way to understand what each piece does.

---

## Learning Resources (use these as reference, not courses)

| Resource | What it's for |
|---|---|
| https://nextjs.org/docs | App Router, pages, server components — the official reference |
| https://docs.nestjs.com | NestJS concepts, modules, guards, pipes |
| https://www.prisma.io/docs | Prisma schema, queries, migrations |
| https://www.typescriptlang.org/play | TypeScript playground — test code snippets |
| https://react.dev/learn | React fundamentals — Quick Start section |
| https://developer.sslcommerz.com | SSLCommerz API — payment integration |
| https://docs.bullmq.io | BullMQ — queue/worker documentation |

**Do not** try to complete these as courses. Use them as documentation when you need to understand a specific thing Claude Code implemented.

---

## Milestone: What you can say after finishing Nowoll

- "I built and deployed a production e-commerce store with a custom NestJS REST API, Next.js storefront, Prisma database, and SSLCommerz payment integration."
- "I implemented background job processing with BullMQ for order confirmation emails and courier booking."
- "I containerized a Node.js application with Docker and deployed it to a VPS behind Nginx with SSL."
- "I set up a CI/CD pipeline with GitHub Actions that runs type-checking, linting, tests, and auto-deploys on every merge."

That is a portfolio that gets interviews.

---

*This document lives at `docs/learning/parallel-learning-track.md`*
*Update it as you complete each phase.*
