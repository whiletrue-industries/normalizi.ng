import base64
import json
import logging
import os
import uuid
from io import BytesIO

from flask import Request, Response
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import GoogleV3
from PIL import Image
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS, upload_fileobj_s3

logger = logging.getLogger(__name__)

fetch_item = text("SELECT magic FROM faces WHERE id = :id")
insert_new = text(
    """
    INSERT INTO faces (image, descriptor, landmarks, gender_age, geolocation, place_name, last_shown_1, last_shown_2, magic)
               VALUES (:image, :descriptor, :landmarks, :gender_age, :geolocation, :place_name, now(), now(), :magic)
    RETURNING id
    """
)
update_existing = text(
    """
    UPDATE faces SET image=:image, descriptor=:descriptor, landmarks=:landmarks, gender_age=:gender_age,
                     geolocation=:geolocation, place_name=:place_name, allowed=3
                 WHERE id=:id AND magic=:magic
    """
)
PREFIX = "data:image/png;base64,"


def _reverse_geocode(geolocation) -> str:
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        try:
            return f"{float(geolocation[0]):.2f}, {float(geolocation[1]):.2f}"
        except (TypeError, ValueError, IndexError):
            return ""
    try:
        geocoder = GoogleV3(api_key=api_key)
        location = geocoder.reverse(tuple(geolocation), exactly_one=True)
        if location and location.address:
            return location.address
    except (GeocoderServiceError, GeocoderTimedOut, ValueError):
        logger.warning("Reverse geocoding failed", exc_info=True)
    try:
        return f"{float(geolocation[0]):.2f}, {float(geolocation[1]):.2f}"
    except (TypeError, ValueError, IndexError):
        return ""


def new_selfie_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "POST":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    content = request.json or {}
    image_data = content.get("image", "")
    if not image_data.startswith(PREFIX):
        return Response(json.dumps({"success": False}), headers=HEADERS)

    raw = base64.b64decode(image_data[len(PREFIX):].strip().encode("ascii"))
    filename_base = uuid.uuid4().hex
    magic = content.get("magic") or uuid.uuid4().hex

    face = Image.open(BytesIO(raw))
    full_image = BytesIO()
    face.save(full_image, format="png", optimize=True)
    full_image.seek(0)
    if not upload_fileobj_s3(full_image, f"photos/{filename_base}_full.png", "image/png"):
        return Response(json.dumps({"success": False, "error": "upload failed"}), headers=HEADERS)

    face_crop = face.crop((1200, 0, 1500, 300))
    face_image = BytesIO()
    face_crop.save(face_image, format="png", optimize=True)
    face_image.seek(0)
    if not upload_fileobj_s3(face_image, f"photos/{filename_base}_face.png", "image/png"):
        return Response(json.dumps({"success": False, "error": "upload failed"}), headers=HEADERS)

    descriptor = json.dumps(content.get("descriptor"))
    landmarks = json.dumps(content.get("landmarks"))
    gender_age = json.dumps(content.get("gender_age"))

    geolocation = content.get("geolocation")
    place_name = _reverse_geocode(geolocation) if geolocation else ""
    geolocation_json = json.dumps(geolocation)

    id_ = content.get("id")

    with get_engine().connect() as connection:
        new_id = None
        if id_ and magic:
            rows = connection.execute(fetch_item, {"id": id_})
            for row in rows:
                if row._mapping["magic"] == magic:
                    connection.execute(
                        update_existing,
                        {
                            "image": filename_base,
                            "descriptor": descriptor,
                            "landmarks": landmarks,
                            "gender_age": gender_age,
                            "geolocation": geolocation_json,
                            "place_name": place_name,
                            "magic": magic,
                            "id": id_,
                        },
                    )
                    new_id = id_
                    break
        if new_id is None:
            result = connection.execute(
                insert_new,
                {
                    "image": filename_base,
                    "descriptor": descriptor,
                    "landmarks": landmarks,
                    "gender_age": gender_age,
                    "geolocation": geolocation_json,
                    "place_name": place_name,
                    "magic": magic,
                },
            )
            new_id = result.fetchone()[0]
        connection.commit()

    return Response(
        json.dumps({"success": True, "id": new_id, "image": filename_base, "magic": magic}),
        headers=HEADERS,
    )
