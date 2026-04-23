"""
Lineage of assets/images/card_back.jpg
--------------------------------------
Originally regenerated in dd1e8c3 from a (now-lost) 960x540 source via
ImageMagick/PIL: rotate 90° CW, then center-crop to 540x760. The original
command was not committed.

Hardware testing showed that rotation was the wrong direction (sleeves
rendered the image 90° CW off). The fix (current commit) rotated the
already-cropped 540x760 asset 180° in place — mathematically equivalent
to regenerating from the source with 90° CCW + the same center-crop,
because CCW 90° = CW 90° + 180° and the top/bottom crop is symmetric.

If the source is ever recovered and a full regen is needed:

    from PIL import Image
    src = Image.open('card_back_source_960x540.jpg')
    rotated = src.rotate(-90, expand=True)  # -90 = CCW 90°
    w, h = rotated.size                     # 540x960
    crop_h = 760
    top = (h - crop_h) // 2
    rotated.crop((0, top, w, top + crop_h)).save(
        'assets/images/card_back.jpg', 'JPEG', quality=95,
    )
"""
