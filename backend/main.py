"""Cloud Functions entrypoint: re-exports handler functions for deployment."""
from lib.calc_tsne import calc_tsne_handler
from lib.delete_item import delete_item_handler
from lib.game_results import game_results_handler
from lib.get_game import get_game_handler
from lib.get_image import get_image_handler
from lib.latest import get_latest_handler
from lib.new_selfie import new_selfie_handler
from lib.send_email import send_email_handler

__all__ = [
    "calc_tsne_handler",
    "delete_item_handler",
    "game_results_handler",
    "get_game_handler",
    "get_image_handler",
    "get_latest_handler",
    "new_selfie_handler",
    "send_email_handler",
]
