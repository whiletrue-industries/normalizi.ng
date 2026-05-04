import json
import logging
import os

import requests
from flask import Request, Response
from sqlalchemy.sql import text

from .db import get_engine
from .net import HEADERS

logging.getLogger().setLevel(logging.INFO)


OUR_EMAIL = "me@normalizi.ng"
REPLY_TO_EMAIL = "mushon@shual.com"
REPLY_TO_NAME = "Mushon Zer-Aviv"
MAILGUN_ENDPOINT = "https://api.eu.mailgun.net/v3/normalizi.ng/messages"

mark_updated = text(
    "UPDATE faces SET last_shown_1=NULL, last_shown_2=NULL, allowed=:allowed WHERE id=:id AND magic=:magic"
)


def send_email_handler(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response("", headers=HEADERS)
    if request.method != "POST":
        return Response(json.dumps({"success": False}), headers=HEADERS)

    content = request.json or {}
    to_email = content.get("email")
    link = content.get("link")
    send = to_email is not None
    allowed = 2 if send else 1
    own_id = content.get("own_id")
    if own_id is not None:
        own_id = int(own_id)
    magic = content.get("magic")

    success = True
    error = None
    if send:
        subject = "Normalizi.ng / Your face"
        message = f"""
        <p>Thanks for <a href='https://normalizi.ng'>normalizi.ng</a></p>

        <p>Through this private link you can always view, share, retake, or delete your data:</p>

        <a href='{link}'>{link}</a>

        <p>Thanks,</p>

        <p>Mushon Zer-Aviv<br/>
        <a href='https://normalizi.ng'>normalizi.ng</a></p>
        """
        try:
            response = requests.post(
                MAILGUN_ENDPOINT,
                auth=("api", os.environ["MAILGUN_API_KEY"]),
                data={"from": OUR_EMAIL, "to": to_email, "subject": subject, "html": message},
                timeout=20,
            )
            if response.status_code != 200:
                success = False
                error = response.text
        except requests.RequestException as ex:
            success = False
            error = str(ex)
            logging.exception("Mailgun request failed")

    with get_engine().connect() as connection:
        logging.info("Marking %s with %s as updated", own_id, magic)
        connection.execute(mark_updated, {"id": own_id, "magic": magic, "allowed": allowed})
        connection.commit()

    return Response(json.dumps({"success": success, "error": error}), headers=HEADERS)
