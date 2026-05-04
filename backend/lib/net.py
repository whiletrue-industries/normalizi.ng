import logging
import os
from functools import cache
from io import BytesIO

import boto3

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
}

_uploaded = 0


@cache
def get_client():
    return boto3.client(
        "s3",
        endpoint_url="https://fra1.digitaloceanspaces.com",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name="fra1",
    )


def upload_fileobj_s3(buff: BytesIO, filename: str, content_type: str) -> bool:
    global _uploaded
    bucket = os.environ["BUCKET_NAME"]
    client = get_client()

    success = False
    for _ in range(3):
        buff.seek(0)
        client.upload_fileobj(
            buff,
            bucket,
            filename,
            ExtraArgs={"ACL": "public-read", "ContentType": content_type},
        )
        head = client.head_object(Bucket=bucket, Key=filename)
        success = bool(head["ContentLength"])
        if success:
            break

    if success:
        _uploaded += 1
        if _uploaded % 100 == 0 or _uploaded == 1:
            print(f"UPLOADED #{_uploaded}: {filename}")
    else:
        logging.error("FAILED TO UPLOAD %s to %s (%d bytes)", filename, bucket, buff.getbuffer().nbytes)
    return success
