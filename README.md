# Agentic Ready — GH-600 Practice

An unofficial, offline-first practice exam for the **GitHub Certified: Agentic AI Developer (GH-600)** credential and the related Agentic Engineering Consultant learning path.

## What is included

- A 72-question local bank covering all six published GH-600 domains
- Full, quick, and focused-domain practice modes
- Least-recently-seen question queues that prioritize unseen material across modes
- Timed attempts with question navigation and flags
- Single-answer and multiple-answer scenarios
- Per-domain scoring, answer explanations, and source links
- Saved attempts, bookmarks, incorrect-answer review, and resume support
- A study sequence and capstone checklist derived from `FDE/RoleDescriptionLearningMap.md`
- No account, API, database, or backend

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components built on Radix primitives
- Lucide icons
- Browser `localStorage`

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

## Verify a production build

```bash
npm run lint
npm run build
npm run preview
```

## Content model

The original question bank is in [`src/data/questions.json`](src/data/questions.json). Additional questions are grouped by domain under [`src/data/questions/`](src/data/questions/) and assembled by [`src/data/questions.ts`](src/data/questions.ts). Each entry contains:

- a stable ID and GH-600 domain
- objective, difficulty, and question type
- answer options and one or more correct answer IDs
- an original explanation
- a link to the relevant official source

Domain display metadata and published weights are in [`src/data/domains.ts`](src/data/domains.ts).

## Saved data

Attempts and bookmarks are stored under the `agentic-ready-gh600-v1` localStorage key. The app retains the 30 most recent completed attempts. Clearing site data resets progress.

## Disclaimer

This is an original, unofficial study aid. It does not contain Microsoft exam questions and is not affiliated with or endorsed by Microsoft or GitHub.
