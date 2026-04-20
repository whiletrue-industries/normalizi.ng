"""Tests for lib.net (S3 upload + CORS headers)."""
from __future__ import annotations

from io import BytesIO

import boto3
import pytest
from moto import mock_aws

from lib import net


def test_headers_allow_all_origins():
    assert net.HEADERS["Access-Control-Allow-Origin"] == "*"
    assert net.HEADERS["Access-Control-Allow-Headers"] == "*"


@mock_aws
def test_upload_fileobj_s3_happy_path(monkeypatch):
    # Reset the cached client so it picks up moto's mock.
    net.get_client.cache_clear()
    monkeypatch.setattr(net, "_uploaded", 0, raising=False)

    # moto's mock_aws doesn't serve DO Spaces; point boto3 at AWS instead.
    monkeypatch.setattr(
        net,
        "get_client",
        net.get_client.__wrapped__.__get__(None, type(net))
        if False
        else lambda: boto3.client("s3", region_name="us-east-1"),
    )

    client = net.get_client()
    client.create_bucket(Bucket="test-bucket")

    data = BytesIO(b"hello world")
    assert net.upload_fileobj_s3(data, "path/file.txt", "text/plain") is True

    head = client.head_object(Bucket="test-bucket", Key="path/file.txt")
    assert head["ContentLength"] == len(b"hello world")
    assert head["ContentType"] == "text/plain"


@mock_aws
def test_upload_fileobj_s3_missing_bucket_raises(monkeypatch):
    net.get_client.cache_clear()
    monkeypatch.setattr(net, "get_client", lambda: boto3.client("s3", region_name="us-east-1"))

    # Bucket is never created — upload_fileobj will raise.
    with pytest.raises(Exception):  # noqa: B017 - boto3 raises ClientError subclass
        net.upload_fileobj_s3(BytesIO(b"data"), "path/file.txt", "text/plain")
