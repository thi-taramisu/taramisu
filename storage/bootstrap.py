import json
import os
from pathlib import Path
import re
import sys
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectionClosedError, EndpointConnectionError, ReadTimeoutError


def client(prefix="S3_ROOT"):
    return boto3.client(
        "s3", endpoint_url="http://storage:8333", region_name="us-east-1",
        aws_access_key_id=os.environ[prefix + "_ACCESS_KEY"],
        aws_secret_access_key=os.environ[prefix + "_SECRET_KEY"],
        config=Config(s3={"addressing_style": "path"}, connect_timeout=3, read_timeout=5,
                      retries={"max_attempts": 2}),
    )


def main():
    for key in ("S3_ROOT_ACCESS_KEY", "S3_ROOT_SECRET_KEY", "S3_ACCESS_KEY", "S3_SECRET_KEY"):
        if not os.environ.get(key):
            raise SystemExit(f"{key} is required; run make -C deploy init")
    bucket = os.environ["S3_BUCKET"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
        raise SystemExit("S3_BUCKET must be 3-63 lowercase letters, numbers or hyphens")
    if sys.argv[1] == "config":
        if os.environ["S3_ROOT_ACCESS_KEY"] == os.environ["S3_ACCESS_KEY"]:
            raise SystemExit("Root and backend access keys must differ")
        identities = []
        for name, prefix, actions in [
            ("root", "S3_ROOT", ["Admin", "Read", "Write", "List", "Tagging"]),
            ("backend", "S3", [f"{action}:{bucket}" for action in ("Read", "Write", "List", "Tagging")]),
        ]:
            identities.append({"name": name, "credentials": [{
                "accessKey": os.environ[prefix + "_ACCESS_KEY"],
                "secretKey": os.environ[prefix + "_SECRET_KEY"],
            }], "actions": actions})
        os.umask(0o077)
        target = Path("/config/s3.json")
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps({"identities": identities}))
        os.chown(temporary, 1000, 1000)  # SeaweedFS runs as UID 1000.
        temporary.replace(target)
        return
    s3 = client()
    for attempt in range(60):
        try:
            s3.create_bucket(Bucket=bucket)
            s3.head_bucket(Bucket=bucket)
            print("Application bucket ready")
            return
        except ClientError as error:
            code = error.response["Error"]["Code"]
            if code == "BucketAlreadyOwnedByYou":
                s3.head_bucket(Bucket=bucket)
                return
            if error.response["ResponseMetadata"]["HTTPStatusCode"] < 500:
                raise
        except (EndpointConnectionError, ConnectionClosedError, ReadTimeoutError):
            pass
        time.sleep(2)
    raise SystemExit("Storage did not become ready")


if __name__ == "__main__":
    main()
