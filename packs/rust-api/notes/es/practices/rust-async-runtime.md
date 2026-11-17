---
type: "practice"
title: "Acotar el trabajo asíncrono"
applies_to: ["tokio","axum","actix-web","rocket","poem","warp","sqlx","sea-orm","tracing","wiremock-rs"]
---

# Acotar el trabajo asíncrono

Separa de los workers asíncronos las operaciones bloqueantes de archivos, bases síncronas y cálculos pesados. Usa un límite de ejecución adecuado y acota la concurrencia. Fija plazos externos, limita pools y maneja cancelación. Coordina el cierre de tareas creadas. [[tokio]] es un runtime; elige aparte el framework HTTP.

[Referencia oficial](https://tokio.rs/tokio/tutorial).
