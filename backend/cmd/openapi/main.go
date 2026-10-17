package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

func main() {
	spec := httpapi.OpenAPI()
	data, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal openapi: %v\n", err)
		os.Exit(1)
	}
	data = append(data, '\n')
	if _, err := os.Stdout.Write(data); err != nil {
		fmt.Fprintf(os.Stderr, "write openapi: %v\n", err)
		os.Exit(1)
	}
}
