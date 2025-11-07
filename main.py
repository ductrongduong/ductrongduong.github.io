#!/usr/bin/env python3
import re
import sys
from pathlib import Path

SRT_BLOCK_RE = re.compile(
    r"(?m)^\s*(\d+)\s*\n"                 # number
    r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*" # start
    r"(\d{2}:\d{2}:\d{2},\d{3})\s*\n"     # end
    r"([\s\S]*?)(?=\n{2,}|\Z)"            # text (until blank line or end)
)

def normalize_text(s: str) -> str:
    # Collapse all whitespace (including newlines) to single spaces
    return re.sub(r"\s+", " ", s).strip()

def parse_srt(text):
    cues = []
    for m in SRT_BLOCK_RE.finditer(text):
        num = int(m.group(1))
        start = m.group(2)
        end = m.group(3)
        body = normalize_text(m.group(4))
        cues.append({"num": num, "start": start, "end": end, "text": body})
    return cues

def ends_with_period(s: str) -> bool:
    # Sentence considered complete if it ends with ., ?, or !
    return bool(re.search(r"[.?!:,”]\s*$", s))

def merge_text(acc_text: str, add_text: str):
    # Always merge with a single space; avoid double spaces
    if not acc_text:
        return add_text
    if not add_text:
        return acc_text
    # If acc ends with punctuation or space, or add starts with space, just join
    if acc_text.endswith(" ") or add_text.startswith(" "):
        return (acc_text + add_text).strip()
    return f"{acc_text} {add_text}"

def merge_cues(cues):
    merged = []
    i = 0
    while i < len(cues):
        group_first = cues[i]
        acc_num = group_first["num"]
        acc_start = group_first["start"]
        acc_end = group_first["end"]
        acc_text = group_first["text"]

        while (not ends_with_period(acc_text)) and (i + 1 < len(cues)):
            i += 1
            nxt = cues[i]
            acc_text = merge_text(acc_text, nxt["text"])
            acc_end = nxt["end"]

        merged.append({"num": acc_num, "start": acc_start, "end": acc_end, "text": acc_text})
        i += 1

    return merged

def render_srt(cues):
    parts = []
    for c in cues:
        parts.append(f"{c['num']}\n{c['start']} --> {c['end']}\n{c['text']}\n")
    return "\n".join(parts).rstrip() + "\n"

def merge_srt_file(input_path: str, output_path: str = None):
    p = Path(input_path)
    raw = p.read_text(encoding="utf-8", errors="replace")
    cues = parse_srt(raw)
    merged = merge_cues(cues)
    out = render_srt(merged)
    if output_path:
        Path(output_path).write_text(out, encoding="utf-8")
    else:
        sys.stdout.write(out)

if __name__ == "__main__":
    input_path = "captions.srt"
    output_path = input_path.replace(".srt", ".merged.srt")
    merge_srt_file(input_path, output_path)
