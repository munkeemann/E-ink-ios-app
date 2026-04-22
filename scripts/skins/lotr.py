# scripts/skins/lotr.py — SAM1-58 LOTR (Paladone) skin config
import os

SRC_DIR = os.path.expanduser('~/lotr-raw-backup')
DEST_SUBDIR = 'lotr'
SRC_TEMPLATE = 'Lord of the Rings (Paladone)_{seq} copy.jpg'

SEQ_TO_CARD = {
    '0001': None, '0002': None, '0003': None,
    '0004': 'ace_of_spades', '0005': '2_of_spades', '0006': '3_of_spades',
    '0007': '4_of_spades', '0008': '5_of_spades', '0009': '6_of_spades',
    '0010': '7_of_spades', '0011': '8_of_spades', '0012': '9_of_spades',
    '0013': '10_of_spades', '0014': 'jack_of_spades', '0015': 'queen_of_spades',
    '0016': 'king_of_spades',
    '0017': 'ace_of_diamonds', '0018': '2_of_diamonds', '0019': '3_of_diamonds',
    '0020': '4_of_diamonds', '0021': '5_of_diamonds', '0022': '6_of_diamonds',
    '0023': '7_of_diamonds', '0024': '8_of_diamonds', '0025': '9_of_diamonds',
    '0026': '10_of_diamonds', '0027': 'jack_of_diamonds', '0028': 'queen_of_diamonds',
    '0029': 'king_of_diamonds',
    '0030': 'king_of_clubs', '0031': 'queen_of_clubs', '0032': 'jack_of_clubs',
    '0033': '10_of_clubs', '0034': '9_of_clubs', '0035': '8_of_clubs',
    '0036': '7_of_clubs', '0037': '6_of_clubs', '0038': '5_of_clubs',
    '0039': '4_of_clubs', '0040': '3_of_clubs', '0041': '2_of_clubs',
    '0042': 'ace_of_clubs',
    '0043': 'king_of_hearts', '0044': 'queen_of_hearts', '0045': 'jack_of_hearts',
    '0046': '10_of_hearts', '0047': '9_of_hearts', '0048': '8_of_hearts',
    '0049': '7_of_hearts', '0050': '6_of_hearts', '0051': '5_of_hearts',
    '0052': '4_of_hearts', '0053': '3_of_hearts', '0054': '2_of_hearts',
    '0055': 'ace_of_hearts',
}
