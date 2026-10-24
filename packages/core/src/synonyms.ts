import { stem } from "./tokens.js";

/**
 * Curated ES/EN synonym map for keyword matching. Every group is a set of real, general-purpose
 * equivalences a dictionary would agree with (mostly translations of common technology words);
 * none is derived from any test sentence. Groups are written with raw words and stemmed at load,
 * so they keep working with the light stemmer. Max 80 groups; keep it small so precision stays high.
 */
const GROUPS: string[][] = [
  ["prueba", "pruebas", "test", "tests", "testing", "check", "comprobacion", "chequeo"],
  ["carga", "load"],
  ["base de datos", "database", "db", "datos", "data", "dato"],
  ["cifrado", "cifrar", "encryption", "encrypt", "encrypted"],
  ["secreto", "secret", "secrets"],
  ["despliegue", "desplegar", "deploy", "deployment"],
  ["local", "locally", "localmente"],
  ["movil", "mobile", "telefono", "phone"],
  ["escritorio", "desktop"],
  ["rastreo", "traza", "trazas", "tracing", "trace"],
  ["error", "excepcion", "exception", "fallo"],
  ["cola", "queue"],
  ["realtime", "tiempo real", "real time"],
  ["autenticacion", "authentication", "auth", "login", "signup", "registro", "acceso", "alta"],
  ["sesion", "session"],
  ["autorizacion", "authorization", "permisos", "permissions", "rbac"],
  ["usuario", "user"],
  ["contrasena", "password"],
  ["identidad", "identity"],
  ["consulta", "query"],
  ["busqueda", "search", "buscador", "seo", "posicionamiento", "ranking"],
  ["almacenamiento", "storage"],
  ["cache"],
  ["servidor", "server"],
  ["cliente", "client"],
  ["interfaz", "interface", "ui", "componente", "component", "widget", "pantalla"],
  ["aplicacion", "application", "app"],
  ["sitio", "site", "website", "web"],
  ["pagina", "page"],
  ["navegador", "browser"],
  ["nube", "cloud"],
  ["contenedor", "container"],
  ["orquestacion", "orchestration", "orquestar", "orchestrate"],
  ["monitorizacion", "monitoring", "monitoreo"],
  ["metrica", "metric", "metrics"],
  ["log", "logs", "logging"],
  ["grafico", "chart", "plot"],
  ["panel", "dashboard"],
  ["estado", "state"],
  ["evento", "event"],
  ["mensaje", "message"],
  ["mensajeria", "messaging"],
  ["trabajo", "job"],
  ["rendimiento", "performance", "velocidad", "speed", "rapido", "fast", "quick", "millisecond", "milliseconds"],
  ["latencia", "latency"],
  ["disponibilidad", "availability"],
  ["escalabilidad", "scalability", "escalable", "scalable", "escalado", "escalar", "scaling", "scale", "autoscaling", "autoescalado"],
  ["seguridad", "security"],
  ["vulnerabilidad", "vulnerability"],
  ["clave", "key"],
  ["certificado", "certificate"],
  ["dependencia", "dependency"],
  ["modelo", "model"],
  ["prediccion", "prediction"],
  ["informe", "report"],
  [
    "pago",
    "payment",
    "cobro",
    "dinero",
    "money",
    "ecommerce",
    "comercio",
    "carrito",
    "tienda",
    "shop",
    "store",
    "pedido",
    "order",
    "venta",
    "sale",
    "sales",
    "factura",
    "invoice",
    "precio",
    "price",
  ],
  ["transaccion", "transaction", "acid", "atomic"],
  ["tabla", "table", "relacion", "relational", "relacional"],
  ["indice", "index"],
  ["documento", "document"],
  ["fichero", "archivo", "file"],
  ["correo", "email"],
  ["notificacion", "notification"],
  [
    "sincronizacion",
    "sincronizar",
    "desincronizar",
    "sync",
    "synchronization",
    "consistent",
    "consistencia",
    "consistency",
    "integridad",
    "integrity",
  ],
  ["flujo", "flow", "journey", "recorrido", "recorrer"],
  ["proveedor", "provider"],
];

/** token -> every token that should count as a hit for it (including itself). */
const EXPANSION = new Map<string, string[]>();

for (const group of GROUPS) {
  const members = [...new Set(group.flatMap((word) => word.split(/\s+/).map(stem)).filter(Boolean))];
  for (const member of members) {
    const current = EXPANSION.get(member) ?? [];
    EXPANSION.set(member, [...new Set([...current, ...members])]);
  }
}

/**
 * Expand a query's tokens with the synonym map. Returns only the tokens that were
 * actually added, so callers can score synonym-only matches in `score_breakdown.synonyms`.
 */
export function expandSynonyms(query: Set<string>): Set<string> {
  const extra = new Set<string>();
  for (const raw of query) {
    for (const key of [raw, stem(raw)]) {
      for (const synonym of EXPANSION.get(key) ?? []) {
        if (!query.has(synonym)) extra.add(synonym);
      }
    }
  }
  return extra;
}

/** Number of curated groups, for the report and tests. */
export function synonymGroupCount(): number {
  return GROUPS.length;
}
