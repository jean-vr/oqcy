#!/usr/bin/env python3
"""Lista as escritas/notificações ATT de um btsnoop_hci.log (HCI snoop do Android).

Uso:
  python3 tools/btsnoop.py btsnoop_hci.log            # tudo
  python3 tools/btsnoop.py btsnoop_hci.log --char 000b  # só a característica 000B (EQ legado)
  python3 tools/btsnoop.py --selftest

Lê datalink 1001 (H1) e 1002 (H4), remonta L2CAP fragmentado e mapeia handle -> UUID pelas
respostas de descoberta (Read By Type). Se a descoberta não estiver na captura, a coluna UUID fica "?".
"""
import struct
import sys
from datetime import datetime

EPOCH_DELTA_US = 0x00DCDDB30F2F8000  # 0000-01-01 -> 1970-01-01, em µs
ATT_CID = 0x0004
OPS = {0x52: 'WRITE_CMD', 0x12: 'WRITE_REQ', 0x1B: 'NOTIFY', 0x1D: 'INDICATE'}


def records(data: bytes):
    """Gera (ts_us_unix, recebido, pacote_hci_sem_tipo, tipo) de cada registro."""
    if data[:8] != b'btsnoop\0':
        raise ValueError('não é um arquivo btsnoop')
    _, link = struct.unpack('>II', data[8:16])
    if link not in (1001, 1002):
        raise ValueError(f'datalink {link} não suportado')
    off = 16
    while off + 24 <= len(data):
        _, incl, flags, _, ts = struct.unpack('>IIIIq', data[off:off + 24])
        pkt = data[off + 24:off + 24 + incl]
        off += 24 + incl
        if link == 1002:
            kind, pkt = pkt[0], pkt[1:]
        else:  # H1: flags bit1 = comando/evento; senão é ACL
            kind = 0x04 if flags & 2 else 0x02
        yield ts - EPOCH_DELTA_US, bool(flags & 1), pkt, kind


def att_pdus(data: bytes):
    """Remonta L2CAP por (conexão, direção) e gera (ts, recebido, pdu_att)."""
    partial = {}
    for ts, rx, pkt, kind in records(data):
        if kind != 0x02 or len(pkt) < 4:
            continue
        hdr, length = struct.unpack('<HH', pkt[:4])
        conn, pb, payload = hdr & 0x0FFF, (hdr >> 12) & 3, pkt[4:4 + length]
        key = (conn, rx)
        if pb == 1:  # continuação
            if key not in partial:
                continue
            partial[key][1].extend(payload)
        else:
            partial[key] = [ts, bytearray(payload)]
        buf = partial[key][1]
        if len(buf) >= 4 and len(buf) >= 4 + struct.unpack('<H', buf[:2])[0]:
            l2len, cid = struct.unpack('<HH', buf[:4])
            start_ts = partial.pop(key)[0]
            if cid == ATT_CID:
                yield start_ts, rx, bytes(buf[4:4 + l2len])


def short_uuid(raw: bytes) -> str:
    # 16 bits direto; 128 bits: os 2 bytes da UUID base Bluetooth (posições 12-13, little-endian)
    return f'{struct.unpack("<H", raw[12:14] if len(raw) == 16 else raw)[0]:04x}'


def parse(data: bytes):
    """Lista de (ts, recebido, opcode, handle, uuid, valor)."""
    uuids, out = {}, []
    for ts, rx, pdu in att_pdus(data):
        op = pdu[0] if pdu else None
        if op == 0x09 and len(pdu) > 2:  # Read By Type Response: declarações de característica
            n = pdu[1]
            for i in range(2, len(pdu) - n + 1, n):
                e = pdu[i:i + n]
                if n in (7, 21):
                    uuids[struct.unpack('<H', e[3:5])[0]] = short_uuid(e[5:])
        elif op in OPS and len(pdu) >= 3:
            h = struct.unpack('<H', pdu[1:3])[0]
            out.append((ts, rx, op, h, pdu[3:]))
    return [(ts, rx, op, h, uuids.get(h, '?'), v) for ts, rx, op, h, v in out]


def main(argv):
    if argv[1:] == ['--selftest']:
        return selftest()
    if len(argv) < 2:
        print(__doc__)
        return 2
    want = argv[argv.index('--char') + 1].lower() if '--char' in argv else None
    with open(argv[1], 'rb') as f:
        rows = parse(f.read())
    for ts, rx, op, h, uuid, v in rows:
        if want and uuid != want:
            continue
        t = datetime.fromtimestamp(ts / 1e6).strftime('%H:%M:%S.%f')[:-3]
        print(f'{t} {"<-" if rx else "->"} {OPS[op]:<9} h=0x{h:04x} uuid={uuid} {v.hex(" ")}')
    return 0


def selftest():
    def rec(pkt: bytes, rx: bool) -> bytes:
        ts = EPOCH_DELTA_US + 1_700_000_000_000_000
        return struct.pack('>IIIIq', len(pkt), len(pkt), int(rx), 0, ts) + pkt

    def acl(conn: int, pb: int, payload: bytes) -> bytes:
        return b'\x02' + struct.pack('<HH', conn | (pb << 12), len(payload)) + payload

    def l2(pdu: bytes) -> bytes:
        return struct.pack('<HH', len(pdu), ATT_CID) + pdu

    base_tail = bytes.fromhex('fb349b5f80000080001000000b000000')  # 0000000b-0000-1000-8000-00805f9b34fb, LE
    disc = l2(b'\x09\x15' + struct.pack('<HBH', 0x0020, 0x1A, 0x0021) + base_tail)
    write = l2(b'\x52' + struct.pack('<H', 0x0021) + bytes([4, 5, 4, 2, 1, 0xFD, 0xFC, 2, 1, 4, 5]))
    other = l2(b'\x1b' + struct.pack('<H', 0x0030) + b'\xff\x03\x0c\x01\x02')
    log = b'btsnoop\0' + struct.pack('>II', 1, 1002)
    log += rec(acl(0x40, 2, disc), True)
    log += rec(acl(0x40, 2, write[:6]), False) + rec(acl(0x40, 1, write[6:]), False)  # fragmentado
    log += rec(acl(0x40, 2, other), True)
    rows = parse(log)
    assert [(r[2], r[3], r[4]) for r in rows] == [(0x52, 0x21, '000b'), (0x1B, 0x30, '?')], rows
    gains = [b - 256 if b > 127 else b for b in rows[0][5][1:]]
    assert rows[0][5][0] == 4 and gains == [5, 4, 2, 1, -3, -4, 2, 1, 4, 5], gains  # Rock
    print('selftest ok')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
