import sys
import os
import logging
from PIL import Image

# Add the script directory to the path for local imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(SCRIPT_DIR)

# Import the Waveshare driver
import epd4in2_V2 as epd

logging.basicConfig(level=logging.DEBUG)

UNPACKED_DIR = os.path.join(SCRIPT_DIR, 'incoming_zips', 'unpacked')
BMP_EXTENSIONS = ('.bmp', '.BMP')

def find_first_bmp(directory):
    for fname in sorted(os.listdir(directory)):
        if fname.endswith(BMP_EXTENSIONS):
            return os.path.join(directory, fname)
    return None

def display_bmp(image_path):
    logging.info("Initializing EPD")
    epd_display = epd.EPD()
    epd_display.init()
    epd_display.Clear()

    logging.info(f"Opening image: {image_path}")
    img = Image.open(image_path).convert('1')

    logging.info("Displaying image")
    epd_display.display(epd_display.getbuffer(img))
    epd_display.sleep()

if __name__ == '__main__':
    bmp_path = find_first_bmp(UNPACKED_DIR)
    if bmp_path:
        display_bmp(bmp_path)
    else:
        logging.error("No BMP file found in unpacked folder.")
