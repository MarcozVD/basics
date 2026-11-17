---
type: "practice"
title: "Bound asynchronous work"
applies_to: ["tokio","axum","actix-web","rocket","poem","warp","sqlx","sea-orm","tracing","wiremock-rs"]
---

# Bound asynchronous work

Keep blocking filesystem, synchronous database and CPU-heavy work off async request workers. Use a suitable blocking boundary and bound concurrency. Set deadlines for external requests, cap database pools and handle cancellation. Coordinate shutdown with spawned tasks. [[tokio]] is a runtime; choose the HTTP framework separately.

[Official reference](https://tokio.rs/tokio/tutorial).
