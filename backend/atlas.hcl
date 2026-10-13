env "local" {
  url = getenv("DATABASE_URL")
  dev = "postgres://taramisu:taramisu@dev-db:5432/taramisu?sslmode=disable"
  src = "file://db/schema.sql"
  migration {
    dir = "file://db/migrations"
  }
}
