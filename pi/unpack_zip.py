import os
import zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_DIR = os.path.join(SCRIPT_DIR, 'incoming_zips')
UNPACKED_DIR = os.path.join(ZIP_DIR, 'unpacked')

def unzip_latest_zip(zip_dir, extract_to):
    zip_files = sorted(
        [f for f in os.listdir(zip_dir) if f.endswith('.zip')],
        key=lambda x: os.path.getmtime(os.path.join(zip_dir, x)),
        reverse=True
    )
    if not zip_files:
        print("No zip files found.")
        return None

    latest_zip = zip_files[0]
    zip_path = os.path.join(zip_dir, latest_zip)

    if os.path.exists(extract_to):
        for f in os.listdir(extract_to):
            os.remove(os.path.join(extract_to, f))
    else:
        os.makedirs(extract_to)

    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)

    print(f"Unpacked: {latest_zip}")
    return extract_to

if __name__ == '__main__':
    unzip_latest_zip(ZIP_DIR, UNPACKED_DIR)
