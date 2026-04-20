#!/usr/bin/env python3

import socket
import os
import zipfile
import io

PORT = 5000
BUFFER_SIZE = 4096

BASE_DIR = "/home/maxja/eink_receiver/scripts"
ZIP_DIR = os.path.join(BASE_DIR, "incoming_zips")
DECK_DIR = os.path.join(BASE_DIR, "decks")

def start_server():
    os.makedirs(ZIP_DIR, exist_ok=True)
    os.makedirs(DECK_DIR, exist_ok=True)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.bind(("", PORT))
        server_socket.listen(1)
        print(f"📡 Listening on port {PORT}...")

        while True:
            client_socket, client_address = server_socket.accept()
            print(f"🔌 Connection from {client_address}")
            with client_socket:
                # Read filename length (4 bytes)
                name_len_bytes = client_socket.recv(4)
                if len(name_len_bytes) < 4:
                    print("❌ Invalid header received.")
                    continue
                name_len = int.from_bytes(name_len_bytes, byteorder='big')

                # Read filename
                filename = client_socket.recv(name_len).decode('utf-8')
                deck_name = os.path.splitext(filename)[0]

                # Read file data
                data = bytearray()
                while True:
                    chunk = client_socket.recv(BUFFER_SIZE)
                    if not chunk:
                        break
                    data.extend(chunk)

                # Save zip
                zip_path = os.path.join(ZIP_DIR, filename)
                with open(zip_path, "wb") as f:
                    f.write(data)

                # Create clean deck folder inside "unpacked"
                deck_path = os.path.join(DECK_DIR, deck_name)
                if os.path.exists(deck_path):
                    print(f"⚠️ Overwriting existing deck: {deck_name}")
                    os.system(f"rm -rf '{deck_path}'")
                os.makedirs(deck_path)

                # Extract zip contents *into the new folder*
                try:
                    with zipfile.ZipFile(io.BytesIO(data)) as zf:
                        zf.extractall(deck_path)
                    print(f"✅ Unpacked deck to: {deck_path}")

                    print(f"✅ Saved: {zip_path}")
                    print(f"📂 Extracted to: {deck_path}")
                except Exception as e:
                    print(f"❌ Zip error: {e}")

if __name__ == "__main__":
    start_server()
