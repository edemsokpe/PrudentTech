from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent   # .../backend
SITE_DIR = BASE_DIR.parent                          # project root (the static website)
ADMIN_DIR = SITE_DIR / "admin"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/prudent_tech"
    secret_key: str = ""
    access_token_minutes: int = 720
    admin_username: str = ""
    admin_password: str = ""
    cors_origins: str = ""
    trust_proxy: bool = False
    enable_docs: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
