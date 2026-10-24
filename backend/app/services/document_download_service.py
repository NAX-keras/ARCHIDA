"""Read-only format checks for authenticated original-file downloads.

No image conversion/decoding, OCR, or additional runtime dependencies. JPEG
checks marker structure (not every decoded pixel); PNG also checks CRC/zlib.
"""
from pathlib import Path
import re
import struct
import unicodedata
import zlib

from pypdf import PdfReader


class UnsupportedDocument(ValueError):
    pass


def _require(condition):
    if not condition:
        raise UnsupportedDocument("Invalid or unsupported document")


def _read(stream, count):
    value = stream.read(count)
    _require(len(value) == count)
    return value


def _scan_jpeg_entropy(stream):
    """Find a real marker, ignoring byte stuffing/restart markers in scan data."""
    while True:
        start = stream.tell()
        block = stream.read(65536)
        _require(bool(block))
        offset = 0
        while True:
            index = block.find(b"\xff", offset)
            if index < 0:
                break
            if index + 1 == len(block):
                # Include the marker byte in the next read, unless this is EOF.
                _require(len(block) > 1)
                stream.seek(start + index)
                break
            following = block[index + 1]
            if following == 0 or 0xD0 <= following <= 0xD7:
                offset = index + 2
            elif following == 0xFF:
                offset = index + 1
            else:
                stream.seek(start + index)
                return


def _jpeg(stream):
    _require(_read(stream, 2) == b"\xff\xd8")
    frame = scan = False
    while True:
        _require(_read(stream, 1) == b"\xff")
        marker = _read(stream, 1)[0]
        while marker == 0xFF:
            marker = _read(stream, 1)[0]
        if marker == 0xD9:
            _require(frame and scan and not stream.read(1))
            return
        _require(marker not in (0, 0xD8, 1) and not 0xD0 <= marker <= 0xD7)
        length = struct.unpack(">H", _read(stream, 2))[0]
        _require(length >= 2)
        data = _read(stream, length - 2)
        # MPF can occur beyond the first 64 KiB. Inspect every APP2 segment.
        _require(not (marker == 0xE2 and data.startswith(b"MPF\x00")))
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            _require(len(data) >= 6)
            _require(data[0] in (8, 12, 16) and int.from_bytes(data[1:3], "big") > 0
                     and int.from_bytes(data[3:5], "big") > 0
                     and data[5] > 0 and len(data) == 6 + 3 * data[5])
            frame = True
        if marker == 0xDA:
            _require(frame and len(data) >= 6 and data[0] > 0 and len(data) == 4 + 2 * data[0])
            scan = True
            _scan_jpeg_entropy(stream)


def _png(stream):
    _require(_read(stream, 8) == b"\x89PNG\r\n\x1a\n")
    header = idat = ended_idat = False
    expected = produced = 0
    decoder = zlib.decompressobj()
    while True:
        length, kind = struct.unpack(">I4s", _read(stream, 8))
        _require(length <= 0x7FFFFFFF and all(65 <= x <= 90 or 97 <= x <= 122 for x in kind))
        _require(header or kind == b"IHDR")
        checksum = zlib.crc32(kind)
        ihdr = b""
        if kind == b"IHDR":
            _require(not header and length == 13)
        elif kind == b"IDAT":
            _require(not ended_idat)
            idat = True
        elif idat:
            ended_idat = True
        # Unknown critical chunks are unsupported; APNG is outside this scope.
        _require(not (kind[0] < 97 and kind not in (b"IHDR", b"PLTE", b"IDAT", b"IEND")))
        _require(kind not in (b"acTL", b"fcTL", b"fdAT"))
        remaining = length
        while remaining:
            block = _read(stream, min(remaining, 65536)); remaining -= len(block)
            checksum = zlib.crc32(block, checksum)
            if kind == b"IHDR":
                ihdr += block
            if kind == b"IDAT":
                pending = block
                while pending:
                    output = decoder.decompress(pending, 65536)
                    produced += len(output)
                    _require(produced <= expected and not decoder.unused_data)
                    pending = decoder.unconsumed_tail
        _require(struct.unpack(">I", _read(stream, 4))[0] == checksum & 0xFFFFFFFF)
        if kind == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", ihdr)
            depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
            _require(width > 0 and height > 0 and color in depths and depth in depths[color]
                     and compression == filtering == 0 and interlace in (0, 1))
            channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
            passes = [(0, 0, 1, 1)] if not interlace else [
                (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
                (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
            for x, y, dx, dy in passes:
                w, h = max(0, (width - x + dx - 1) // dx), max(0, (height - y + dy - 1) // dy)
                if w and h:
                    expected += h * (1 + (w * channels * depth + 7) // 8)
            # Bound validation CPU for malformed/decompression-bomb images.
            _require(expected <= 256 * 1024 * 1024)
            header = True
        if kind == b"IEND":
            _require(length == 0 and idat and decoder.eof and produced == expected and not stream.read(1))
            return


def inspect_download_format(path: Path) -> str:
    """Require both an allowed suffix and matching validated file content."""
    try:
        with path.open("rb") as stream:
            if path.suffix.lower() == ".pdf":
                _require(bool(re.match(rb"%PDF-[12]\.\d", _read(stream, 8))))
                stream.seek(0)
                reader = PdfReader(stream, strict=False)
                # Do not require decryption merely to download an original PDF.
                _require("/Root" in reader.trailer)
                return "application/pdf"
            if path.suffix.lower() in (".jpg", ".jpeg"):
                _jpeg(stream)
                return "image/jpeg"
            if path.suffix.lower() == ".png":
                _png(stream)
                return "image/png"
            raise UnsupportedDocument("Unsupported suffix")
    except OSError:
        raise
    except Exception as error:
        raise UnsupportedDocument("Invalid or unsupported document") from error


def safe_download_name(name: str | None, path: Path, media_type: str) -> str:
    name = unicodedata.normalize("NFC", str(name or path.name)).replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>:"|?*]', "_", name).strip(" .")
    suffix = Path(name).suffix
    allowed = {"application/pdf": (".pdf",), "image/jpeg": (".jpg", ".jpeg"), "image/png": (".png",)}[media_type]
    extension = suffix if suffix.lower() in allowed else allowed[0]
    stem = (name[:-len(suffix)] if suffix else name).strip(" .")[:160] or "dokumen"
    if re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", stem, re.I):
        stem = "_" + stem
    return stem + extension
