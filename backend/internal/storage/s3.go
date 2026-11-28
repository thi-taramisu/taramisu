package storage

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/thi-taramisu/taramisu/backend/internal/config"
)

type S3 struct {
	client *s3.Client
	bucket string
}

func New(cfg config.S3Config) *S3 {
	return &S3{client: s3.New(s3.Options{
		BaseEndpoint: aws.String(cfg.Endpoint), Region: cfg.Region, UsePathStyle: cfg.UsePathStyle,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		HTTPClient:  &http.Client{Timeout: 2 * time.Minute},
	}), bucket: cfg.Bucket}
}

func (s *S3) Put(ctx context.Context, key, contentType string, size int64, body io.ReadSeeker) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: &s.bucket, Key: &key, ContentType: &contentType, ContentLength: &size, Body: body})
	return err
}
func (s *S3) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: &s.bucket, Key: &key})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}
func (s *S3) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &s.bucket, Key: &key})
	return err
}
