CREATE TABLE service_status (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    message text NOT NULL
);
