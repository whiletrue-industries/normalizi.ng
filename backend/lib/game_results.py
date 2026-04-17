import json
from sqlalchemy.sql import text
from flask import Request, Response

from .db import engine
from .net import HEADERS

update_sql = text('UPDATE faces SET tournaments=tournaments+:t, votes=votes+:v WHERE id=:id AND allowed >= 0')
per_feature_updates_sql = [
    text(f'UPDATE faces SET tournaments_{i}=tournaments_{i}+:t, votes_{i}=votes_{i}+:v WHERE id=:id AND allowed >= 0')
    for i in range(5)
]


def game_results_handler(request: Request):
    if request.method == 'OPTIONS':
        return Response('', headers=HEADERS)
    if request.method == 'POST':
        content = request.json
        results = content['results']
        updates = dict()
        for item in results:
            winner, loser, feature = tuple(item)
            updates.setdefault(winner, dict(f=feature, t=0, v=0))['t'] += 1
            updates.setdefault(loser, dict(f=feature, t=0, v=0))['t'] += 1
            updates[winner]['v'] += 1
        with engine.connect() as connection:
            for id, update in updates.items():
                feature = update.pop('f')
                connection.execute(update_sql, t=update['t'], v=update['v'], id=id)
                connection.execute(per_feature_updates_sql[feature], t=update['t'], v=update['v'], id=id)
            connection.commit()
        response = dict(
            success=True, updated=len(updates)
        )
        return Response(
            json.dumps(response),
            headers=HEADERS
        )
    return Response(
        json.dumps(dict(success=False)),
        headers=HEADERS
    )
