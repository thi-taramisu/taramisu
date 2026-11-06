package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/thi-taramisu/taramisu/backend/internal/config"
)

func TestS3Integration(t *testing.T) {
	for _, key := range []string{"TEST_S3_ENDPOINT", "TEST_S3_ACCESS_KEY", "TEST_S3_SECRET_KEY"} {
		if os.Getenv(key) == "" {
			if os.Getenv("CI") != "" {
				t.Fatalf("%s is required in CI", key)
			}
			t.Skip("set TEST_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY to test against isolated S3 storage")
		}
	}
	ctx := context.Background()
	cfg := config.S3Config{Endpoint: os.Getenv("TEST_S3_ENDPOINT"), Region: "us-east-1", Bucket: "test-" + strings.ToLower(rand.Text()), AccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("TEST_S3_SECRET_KEY"), UsePathStyle: true}
	store := New(cfg)
	if _, err := store.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &cfg.Bucket}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		out, err := store.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: &cfg.Bucket})
		if err != nil {
			t.Error(err)
			return
		}
		if len(out.Contents) != 0 {
			t.Errorf("test left %d objects behind", len(out.Contents))
		}
		for _, object := range out.Contents {
			if err := store.Delete(ctx, *object.Key); err != nil {
				t.Error(err)
			}
		}
		if _, err := store.client.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: &cfg.Bucket}); err != nil {
			t.Error(err)
		}
	})
	for _, test := range []struct {
		name string
		size int
	}{{"empty", 0}, {"binary", 1024}, {"10MiB", 10 << 20}} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			key := rand.Text()
			data := make([]byte, test.size)
			if _, err := rand.Read(data); err != nil {
				t.Fatal(err)
			}
			if err := store.Put(ctx, key, "application/octet-stream", int64(len(data)), bytes.NewReader(data)); err != nil {
				t.Fatal(err)
			}
			head, err := store.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &cfg.Bucket, Key: &key})
			if err != nil {
				t.Fatal(err)
			}
			if aws.ToInt64(head.ContentLength) != int64(len(data)) || aws.ToString(head.ContentType) != "application/octet-stream" {
				t.Fatal("object metadata was not preserved")
			}
			body, err := store.Get(ctx, key)
			if err != nil {
				t.Fatal(err)
			}
			hash := sha256.New()
			size, copyErr := io.Copy(hash, body)
			closeErr := body.Close()
			if copyErr != nil || closeErr != nil {
				t.Fatalf("download: %v; close: %v", copyErr, closeErr)
			}
			want := sha256.Sum256(data)
			if size != int64(len(data)) || !bytes.Equal(hash.Sum(nil), want[:]) {
				t.Fatal("downloaded bytes differ from uploaded bytes")
			}
			for range 2 {
				if err := store.Delete(ctx, key); err != nil {
					t.Fatalf("idempotent deletion: %v", err)
				}
			}
			body, err = store.Get(ctx, key)
			if err == nil {
				_ = body.Close()
				t.Fatal("deleted object still exists")
			}
			var missing *types.NoSuchKey
			if !errors.As(err, &missing) {
				t.Fatalf("missing object error was lost: %v", err)
			}
		})
	}
	t.Run("cancelled operations", func(t *testing.T) {
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		key := rand.Text()
		if err := store.Put(cancelled, key, "text/plain", 1, strings.NewReader("x")); !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled PUT: %v", err)
		}
		body, err := store.Get(cancelled, key)
		if body != nil {
			if e := body.Close(); e != nil {
				t.Error(e)
			}
		}
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled GET: %v", err)
		}
		if err := store.Delete(cancelled, key); !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled DELETE: %v", err)
		}
	})
	t.Run("rejected credentials", func(t *testing.T) {
		invalid := cfg
		invalid.AccessKey = "invalid-test-key"
		if err := New(invalid).Put(ctx, rand.Text(), "text/plain", 1, strings.NewReader("x")); err == nil {
			t.Fatal("invalid credentials accepted")
		}
	})
}
