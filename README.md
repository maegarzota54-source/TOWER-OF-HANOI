# Tower-of-Hanoi

TOWER OF HANOI!

🌐 **Live Demo:** [Play here] (https://tower-of-hanoi-2.onrender.com)

Built with SWI-Prolog (backend) and vanilla JavaScript (frontend), deployed on Render.

## Features
- Auto-solve mode: the moves come from a recursive Prolog predicate (`hanoi/4`)
- Play mode: click or drag disks, with the rules enforced
- 1–8 disks, speed control, move counter, hints, and a tutorial

## Run locally
```
cd backend
swipl server.pl
```
Then open http://localhost:8000

## API
`GET /solve?disks=N` (N from 1 to 8) returns the moves as JSON.
