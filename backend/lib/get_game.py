import codecs
import json
from sqlalchemy.sql import text
from flask import Request, Response

from .db import engine
from .net import HEADERS

fetch_random = text('''
    WITH a as (
        SELECT id, image, votes, tournaments, descriptor, landmarks, gender_age, place_name, allowed
        FROM faces
        WHERE allowed > 0
        ORDER BY tournaments
        LIMIT 20)
    SELECT * FROM a ORDER BY RANDOM() limit 10
''')
# PREFIX = 'data:image/png;base64,'


def get_game_handler(request: Request):
    if request.method == 'OPTIONS':
        return Response('', headers=HEADERS)
    if request.method == 'GET':
        with engine.connect() as connection:
            rows = connection.execute(fetch_random)
            result = []
            for row in rows:
                row = dict(row)
                # row['created_timestamp'] = row['created_timestamp'].isoformat()
                result.append(row)
        response = dict(
            success=True, records=result
        )
        return Response(
            json.dumps(response),
            headers=HEADERS
        )
    return Response(
        json.dumps(dict(success=False)),
        headers=HEADERS
    )