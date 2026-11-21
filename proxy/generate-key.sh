#!/usr/bin/env bash
set -e
openssl req -trustout -x509 -newkey rsa:4096 -sha256 -nodes -keyout key.pem -out cert.pem -days 365
# After running this command, you'll be asked to fill out some infos.
# you can type "." to leave the field blank, or use what I used (optional):
# Country Name: DE
# State: Bayern
# Locality: IN
# Orga: THI
# orga-unit: CASE-M
# Common name: taramisu
# email: . 