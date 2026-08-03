import pytest
from fastapi import HTTPException

from app.services.display_name_service import validate_display_name


def test_display_name_is_normalized() -> None:
    assert validate_display_name('  Neon   Pilot  ') == ('Neon Pilot', 'neon pilot')


@pytest.mark.parametrize('name', ['ab', 'admin', 'bad@email'])
def test_invalid_display_names_are_rejected(name: str) -> None:
    with pytest.raises(HTTPException):
        validate_display_name(name)
