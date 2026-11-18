/** Canonical module paths cannot be inferred safely from their last component. */
export const goPackages: Record<string, string> = {
  "github.com/gin-gonic/gin": "gin",
  "github.com/labstack/echo": "echo",
  "github.com/go-chi/chi": "chi",
  "github.com/gofiber/fiber": "fiber",
  "github.com/jackc/pgx": "pgx",
  "gorm.io/gorm": "gorm",
  "github.com/jinzhu/gorm": "gorm",
  "entgo.io/ent": "ent",
  "github.com/stretchr/testify": "testify",
  "github.com/golang/mock": "gomock",
  "go.uber.org/mock": "gomock",
  "go.uber.org/zap": "zap",
  "github.com/rs/zerolog": "zerolog",
  "github.com/lib/pq": "postgresql",
  "gorm.io/driver/postgres": "postgresql",
  "gorm.io/driver/sqlite": "sqlite",
  "github.com/mattn/go-sqlite3": "sqlite",
  "modernc.org/sqlite": "sqlite",
};

export const cargoPackages: Record<string, string> = { wiremock: "wiremock-rs", postgres: "postgresql", "tokio-postgres": "postgresql" };
export const pubPackages: Record<string, string> = {
  integration_test: "flutter-integration-test",
  flutter_riverpod: "riverpod",
  flutter_bloc: "bloc",
  hive_ce_flutter: "hive-ce",
  sqflite: "sqlite",
  sqlite3: "sqlite",
};
