import logging
import os
import json
from sqlalchemy.sql import text
from flask import Request, Response

from .db import engine
from .net import HEADERS

logging.getLogger().setLevel(logging.INFO)


UPDATE_KEYS = {
    1: os.environ.get('UPDATE_KEY_1') or os.environ.get('UPDATE_KEY'),
    2: os.environ.get('UPDATE_KEY_2')
}

query_new = '''
    SELECT id, image, votes, tournaments, 
        votes_0, tournaments_0, 
        votes_1, tournaments_1, 
        votes_2, tournaments_2, 
        votes_3, tournaments_3, 
        votes_4, tournaments_4,
        descriptor, landmarks, gender_age, place_name, created_timestamp,
        last_shown_1, last_shown_2
    FROM faces
    where last_shown_{idx} is null and allowed>0
    ORDER BY id asc
    LIMIT 1
'''
query_any = '''
    SELECT id, image, votes, tournaments, 
        votes_0, tournaments_0, 
        votes_1, tournaments_1, 
        votes_2, tournaments_2, 
        votes_3, tournaments_3, 
        votes_4, tournaments_4,
        descriptor, landmarks, gender_age, place_name, created_timestamp,
        last_shown_1, last_shown_2
    FROM faces
    where last_shown_{idx} is not null and allowed>0
    ORDER BY last_shown_{idx} asc
    LIMIT 1
'''
update = '''
    UPDATE FACES set last_shown_{idx}=now() where id=:id
'''


def get_latest_handler(request: Request):
    if request.method == 'OPTIONS':
        return Response('', headers=HEADERS)
    if request.method == 'GET':
        with engine.connect() as connection:
            idx = 1
            update_key = request.args.get('key')
            found_update_key = None
            for k, v in UPDATE_KEYS.items():
                if v == update_key:
                    idx = k
                    found_update_key = v
                    break
            rows = connection.execute(text(query_new.format(idx=idx)))
            result = None
            for row in rows:
                row = dict(row)
                result = row
                break
            if result is None:
                rows = connection.execute(text(query_any.format(idx=idx)))
                for row in rows:
                    row = dict(row)
                    result = row
                    break
            last_shown = None
            if result is not None:
                last_shown = [result.pop('last_shown_1'), result.pop('last_shown_2')]
            if result and found_update_key is not None:
                logging.info(f'UPDATING {idx} WITH KEY {found_update_key} (last_shown={last_shown})')
                connection.execute(text(update.format(idx=idx)), id=result['id'])
                connection.commit()
        if result is not None:
            result['created_timestamp'] = result['created_timestamp'].isoformat()
        response = dict(
            success=result is not None, record=result
        )
        response = Response(
            json.dumps(response),
            headers=HEADERS
        )
        response.cache_control.max_age = 10
        return response

    return Response(
        json.dumps(dict(success=False)),
        headers=HEADERS
    )
