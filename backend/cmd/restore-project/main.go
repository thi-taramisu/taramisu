// Command restore-project makes a project that an Owner deleted available again. Operators run it
// within the grace period, before the API deletes the project for good
// (docs/internal/architecture/audit.md):
//
//	restore-project -project <project id> -actor <iam_user id>
//
// It reads DATABASE_URL and records project.restored in the audit history with the given actor,
// for example the Owner who asked for the restore.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// errUsage is returned for wrong arguments, after the reason and the usage were written to stderr.
var errUsage = errors.New("wrong arguments")

func main() {
	// The audit line of the restore is JSON, like the API's; a one-off command needs no Sentry.
	slog.SetDefault(slog.New(logging.NewHandler(os.Stderr, slog.LevelInfo)))
	err := run(context.Background(), os.Args[1:], os.Getenv("DATABASE_URL"), os.Stdout, os.Stderr)
	switch {
	case err == nil, errors.Is(err, flag.ErrHelp):
	case errors.Is(err, errUsage):
		os.Exit(2)
	default:
		fmt.Fprintln(os.Stderr, "restore-project:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, databaseURL string, stdout, stderr io.Writer) error {
	projectID, actorID, err := parseArgs(args, stderr)
	if err != nil {
		return err
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	return restore(ctx, db.NewStore(pool), projectID, actorID, stdout)
}

func parseArgs(args []string, stderr io.Writer) (projectID, actorID pgtype.UUID, err error) {
	flags := flag.NewFlagSet("restore-project", flag.ContinueOnError)
	flags.SetOutput(stderr)
	project := flags.String("project", "", "ID of the deleted project")
	actor := flags.String("actor", "", "iam_user.id recorded as the actor of project.restored")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return projectID, actorID, err
		}
		return projectID, actorID, errUsage // the flag package has already written the reason
	}
	var wrong string
	switch {
	case flags.NArg() > 0:
		wrong = fmt.Sprintf("unexpected argument %q", flags.Arg(0))
	case projectID.Scan(*project) != nil || !projectID.Valid:
		wrong = fmt.Sprintf("-project must be a project ID (UUID): %q", *project)
	case actorID.Scan(*actor) != nil || !actorID.Valid:
		wrong = fmt.Sprintf("-actor must be a user ID (UUID): %q", *actor)
	default:
		return projectID, actorID, nil
	}
	_, _ = fmt.Fprintln(stderr, wrong)
	flags.Usage()
	return projectID, actorID, errUsage
}

type projectRestorer interface {
	RestoreTaraProject(context.Context, db.Actor, pgtype.UUID) error
}

func restore(ctx context.Context, store projectRestorer, projectID, actorID pgtype.UUID, stdout io.Writer) error {
	err := store.RestoreTaraProject(ctx, db.Actor{UserID: actorID}, projectID)
	switch {
	case errors.Is(err, db.ErrProjectNotFound):
		return fmt.Errorf("project %s does not exist or is not marked as deleted", projectID)
	case errors.Is(err, db.ErrActorNotFound):
		return fmt.Errorf("no user with ID %s", actorID)
	case err != nil:
		return err
	}
	_, err = fmt.Fprintf(stdout, "restored project %s\n", projectID)
	return err
}
