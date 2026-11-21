CREATE TABLE project_title_image (
    id uuid PRIMARY KEY,
    content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE tara_project ADD COLUMN title_image_id uuid UNIQUE
    REFERENCES project_title_image(id) ON DELETE SET NULL;
