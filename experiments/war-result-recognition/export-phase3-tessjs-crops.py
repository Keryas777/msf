"""Generate transient local opponent-trophy crops for the Tesseract.js check."""
import argparse, importlib.util
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance

spec=importlib.util.spec_from_file_location('visual_digit_experiment',Path(__file__).with_name('visual-digit-experiment.py'))
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
spec2=importlib.util.spec_from_file_location('localized_tesseract_sweep',Path(__file__).with_name('localized-tesseract-sweep.py'))
mod2=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(mod2)
make_variants,crop_box=mod2.make_variants,mod2.crop_box

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--images-dir',type=Path,required=True);ap.add_argument('--out-dir',type=Path,required=True);ap.add_argument('--max-width',type=int,default=0);a=ap.parse_args();a.out_dir.mkdir(parents=True,exist_ok=True)
    import json
    truth=json.loads((Path(__file__).with_name('ground-truth.json')).read_text())
    for item in truth['captures']:
        p=a.images_dir/item['file'];im=Image.open(p).convert('RGB');w,h=im.size;anchors=mod.row_anchors(mod.ocr_words(p),w,h)
        if not anchors: raise SystemExit(f"missing OCR anchor: {item['id']}")
        box=crop_box(anchors,w,h,'opponentTrophies')
        if a.max_width and w>a.max_width:
            scale=a.max_width/w
            im=im.resize((a.max_width,round(h*scale)),Image.Resampling.LANCZOS)
            box=tuple(round(value*scale) for value in box)
        variant=make_variants(im,box,'opponentTrophies')['gray-contrast-3x']
        variant.save(a.out_dir/f"{item['id']}.png")
    print(f"exported {len(truth['captures'])} transient local crops to {a.out_dir}")
if __name__=='__main__':main()
