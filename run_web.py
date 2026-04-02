import time

from app.web_server import OverlayWebServer


def main() -> None:
    server = OverlayWebServer().start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
