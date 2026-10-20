import { describe, expect, it } from 'vitest';
import { parseAdvert } from '../src/protocol/advert';
import { fromHex, toHex } from '../src/protocol/bytes';
import { CMD } from '../src/protocol/constants';
import { decodeEq, encodeEq } from '../src/protocol/eq';
import { decodeFrame, encodeFrame, FrameAssembler } from '../src/protocol/frame';
import { cmds, decodeBattery, decodeTlv, decodeVersion } from '../src/protocol/messages';

describe('framing (vetores tirados do app original)', () => {
  it('codifica comandos', () => {
    expect(toHex(encodeFrame(cmds.noiseMode(1)))).toBe('ff030c0101');
    expect(toHex(encodeFrame(cmds.request(34)))).toBe('ff03fe0122');
    expect(toHex(encodeFrame(cmds.toggle(CMD.GAME_MODE, true)))).toBe('ff03090101');
    expect(toHex(encodeFrame(cmds.ancScene(3, 2, 0)))).toBe('ff051703030200');
    expect(toHex(encodeFrame(cmds.powerOff(300)))).toBe('ff0614042c010000');
  });

  it('bytes do modo de ruído do HT05, iguais aos da captura HCI do app oficial', () => {
    expect(toHex(encodeFrame(cmds.noiseMode(0x63)))).toBe('ff030c0163'); // ANC ligado
    expect(toHex(encodeFrame(cmds.noiseMode(0xa4)))).toBe('ff030c01a4'); // passthrough
    expect(toHex(encodeFrame(cmds.noiseMode(0x02)))).toBe('ff030c0102'); // ANC desligado
    for (const v of [0x41, 0x51, 0x61, 0x71]) expect(toHex(encodeFrame(cmds.noiseMode(v)))).toBe(`ff030c01${v.toString(16)}`);
    expect(toHex(encodeFrame(cmds.syncTime(new Date(2026, 9, 19, 22, 49, 36))))).toBe('ff093e071a0a1316312402'); // idêntico ao do app oficial
  });

  it('agrupa vários TLVs num quadro e decodifica de volta', () => {
    const f = encodeFrame(cmds.request(7), cmds.request(12));
    expect(toHex(f)).toBe('ff06fe0107fe010c');
    expect(decodeFrame(f).map((t) => [t.cmd, toHex(t.data)])).toEqual([[0xfe, '07'], [0xfe, '0c']]);
  });

  it('ignora cauda truncada sem perder o resto', () => {
    expect(decodeFrame(fromHex('ff080c0102080501')).map((t) => t.cmd)).toEqual([12]);
  });

  it('remonta quadro fatiado em notificações e descarta lixo velho', () => {
    const a = new FrameAssembler(500);
    const f = encodeFrame(cmds.noiseMode(2), cmds.noiseValue(5));
    expect(a.push(f.subarray(0, 3), 0)).toEqual([]);
    expect(a.push(f.subarray(3, 5), 10)).toEqual([]);
    expect(a.push(f.subarray(5), 20).map(toHex)).toEqual([toHex(f)]);
    a.push(f.subarray(0, 4), 100);
    expect(a.push(f, 5000).map(toHex)).toEqual([toHex(f)]); // fragmento expirou
  });
});

describe('mensagens', () => {
  it('bateria: bit7 = carregando', () => {
    expect(decodeBattery(fromHex('64e300'))).toEqual({
      left: { level: 100, charging: false },
      right: { level: 99, charging: true },
      case: { level: 0, charging: false },
    });
  });
  it('versão', () => {
    expect(decodeVersion(fromHex('010203040506'))).toEqual({ left: '1.2.3', right: '4.5.6' });
  });
  it('eventos', () => {
    expect(decodeTlv({ cmd: 12, data: fromHex('03') })).toEqual({ kind: 'noiseMode', mode: 3 });
    expect(decodeTlv({ cmd: 9, data: fromHex('01') })).toEqual({ kind: 'toggle', cmd: 9, on: true });
    expect(decodeTlv({ cmd: 6, data: fromHex('02') })).toEqual({ kind: 'toggle', cmd: 6, on: false });
    expect(decodeTlv({ cmd: 20, data: fromHex('2c010000') })).toEqual({ kind: 'power', offAfterMin: 300, elapsedMin: 1 });
    expect(decodeTlv({ cmd: 24, data: new TextEncoder().encode('QCY T13\0lixo') })).toEqual({ kind: 'name', name: 'QCY T13' });
    expect(decodeTlv({ cmd: 43, data: fromHex('0101020109ff') })).toEqual({
      kind: 'buttons',
      map: { 1: 1, 2: 1, 9: 255 },
    });
  });
});

describe('EQ', () => {
  it('ida e volta, com limite de ±12.7 dB', () => {
    const p = { index: 3, masterGain: -1.5, bands: [
      { freq: 60, gain: 4.25, q: 0.7, type: 0 },
      { freq: 1000, gain: -20, q: 1.41, type: 2 },
    ] };
    const t = encodeEq(p);
    expect(t[0]).toBe(CMD.EQ_PARAMS2);
    expect(t[1]).toBe(2 * 7 + 3);
    const back = decodeEq(t.subarray(2), true)!;
    expect(back.index).toBe(3);
    expect(back.masterGain).toBe(-1.5);
    expect(back.bands[0]).toEqual(p.bands[0]);
    expect(back.bands[1]).toEqual({ freq: 1000, gain: -12.7, q: 1.41, type: 2 });
  });
});

describe('anúncio BLE', () => {
  const body = new Uint8Array(24);
  body.set([0x4a, 0x61, 0, 0x04, 0, 0xe4, 0x50, 0x00]); // modelo, cor 2, L 100 carregando, R 80
  body.set([0x22, 0x11, 0x33, 0x66, 0x55, 0x44], 11); // MAC clássico (ordem embaralhada do firmware)
  const raw = Uint8Array.from([0x1c, 0x52, ...body]);

  it('extrai bateria e MAC clássico', () => {
    const a = parseAdvert(raw)!;
    expect(a.modelId).toBe(0x4a61);
    expect(a.colorIndex).toBe(2);
    expect(a.left).toEqual({ level: 100, charging: true });
    expect(a.right).toEqual({ level: 80, charging: false });
    expect(a.case).toBeUndefined();
    expect(a.classicMac).toBe('11:22:33:44:55:66');
    expect(a.otherMac).toBe(a.classicMac);
  });
  it('rejeita company id alheio e payload curto', () => {
    expect(parseAdvert(Uint8Array.from([0x4c, 0x00, ...body]))).toBeNull();
    expect(parseAdvert(Uint8Array.from([0x1c, 0x52, 1, 2, 3]))).toBeNull();
  });
});

import { EQ_PRESETS, matchPreset, presetBytes } from '../src/protocol/presets';

describe('presets de EQ (capturados do app oficial no HT05)', () => {
  const captured: Record<string, string> = {
    Suave: '0505fbfcfc030204040000',
    Rock: '0405040201fdfc02010405',
    'Bass pesados': '0306050403000000000000',
    Popular: '02fa05fdfe0504fcfd0604',
    Predefinido: '0100000000000000000000',
    Clássico: '0605050102ff01fcfaf9f8', // sem captura HCI: índice inferido
  };
  it('geram exatamente os bytes da captura', () => {
    for (const p of EQ_PRESETS) expect(toHex(presetBytes(p))).toBe(captured[p.name]);
  });
  it('reconhece o preset ativo pelo que o fone devolve', () => {
    const rock = fromHex(captured.Rock!);
    expect(matchPreset({ type: rock[0]!, gains: [...rock.subarray(1)] })?.name).toBe('Rock');
    expect(matchPreset({ type: 4, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toBeUndefined();
  });
});
