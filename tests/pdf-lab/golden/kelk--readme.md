# fastqueue

A small, dependency-free job queue for Node.js with retries, priorities and rate limits.

## Features

- Priorities from 1 (highest) to 10 (lowest)
- Exponential back-off with jitter
- Per-queue rate limits, for example 100 jobs per minute
- Pluggable storage: memory, Redis or SQLite
- Typed events for `completed`, `failed` and `stalled` jobs

## Installation

Install the package from npm:

```bash
npm install fastqueue
```

Node.js 18 or later is required. The package ships its own type definitions.

## Quick start

Create a queue, add a worker, then push jobs:

```js
import { Queue } from "fastqueue";

const queue = new Queue("emails", { concurrency: 4 });

queue.process(async (job) => {
  await sendEmail(job.data.to, job.data.subject);
});

await queue.add({ to: "ana@example.com", subject: "Welcome" }, { priority: 2 });
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `concurrency` | number | `1` | Jobs processed at the same time |
| `retries` | number | `3` | Attempts before a job fails |
| `backoff` | string | `exponential` | `fixed` or `exponential` |
| `rateLimit` | object | none | `{ max, duration }` in milliseconds |
| `storage` | string | `memory` | `memory`, `redis` or `sqlite` |

## Roadmap

- [x] Priorities and retries
- [x] Redis storage
- [ ] Scheduled (delayed) jobs
- [ ] Web dashboard

## Contributing

1. Fork the repository and create a branch.
2. Run the tests with `npm test`.
   - Unit tests run in under ten seconds.
   - Integration tests need a local Redis server.
3. Open a pull request that describes the change.

Please read the code of conduct before you open an issue.

## License

Released under the MIT License. See the LICENSE file for details.
