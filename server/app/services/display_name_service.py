import re

from fastapi import HTTPException, status


DISPLAY_NAME_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 _-]{1,22}[A-Za-z0-9]$')
BLOCKED_NAMES = {'admin', 'administrator', 'moderator', 'runtwerkx', 'system'}


def validate_display_name(value: str) -> tuple[str, str]:
    display = ' '.join(value.strip().split())
    normalized = display.casefold()
    if not DISPLAY_NAME_PATTERN.fullmatch(display):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Display name must be 3-24 letters, numbers, spaces, _ or -.')
    if normalized in BLOCKED_NAMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'That display name is reserved.')
    return display, normalized
