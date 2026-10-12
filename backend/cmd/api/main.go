package main

import (
	"log"
	"net/http"
	"os"

	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

func main() {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, httpapi.New()))
}
