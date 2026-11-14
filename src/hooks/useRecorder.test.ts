import { describe, expect, it } from 'vitest';
import { computeAudioLevel } from './useRecorder';

/** Build a balanced square-wave buffer with exact RMS = amplitude. */
function makeSignal(amplitude: number, dcOffset = 0, length = 1024): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = dcOffset + (i % 2 === 0 ? amplitude : -amplitude);
  }
  return samples;
}

describe('computeAudioLevel', () => {
  it('returns 0 for empty buffers and silence', () => {
    expect(computeAudioLevel([])).toBe(0);
    expect(computeAudioLevel(new Float32Array(1024))).toBe(0);
  });

  it('ignores constant DC offset on a silent mic', () => {
    expect(computeAudioLevel(makeSignal(0, 0.05))).toBe(0);
    expect(computeAudioLevel(makeSignal(0, -0.12))).toBe(0);
  });

  it('keeps quiet noise below the floor at 0', () => {
    // -56 dBFS (~0.0016 RMS) is below the -50 dBFS noise floor.
    expect(computeAudioLevel(makeSignal(0.0016))).toBe(0);
  });

  it('gives clear movement for soft and conversational speech', () => {
    const soft = computeAudioLevel(makeSignal(0.01)); // -40 dBFS
    const normal = computeAudioLevel(makeSignal(0.04)); // -28 dBFS
    const loud = computeAudioLevel(makeSignal(0.12)); // -18.4 dBFS

    expect(soft).toBeGreaterThan(0.25);
    expect(normal).toBeGreaterThan(0.55);
    expect(loud).toBeGreaterThan(0.8);
    expect(soft).toBeLessThan(normal);
    expect(normal).toBeLessThan(loud);
  });

  it('clamps loud transients like coughs at 1', () => {
    expect(computeAudioLevel(makeSignal(0.3))).toBe(1);
    expect(computeAudioLevel(makeSignal(1.0))).toBe(1);
  });

  it('matches across float and 8-bit byte sample encodings', () => {
    const amplitude = 0.05;
    const floats = makeSignal(amplitude);
    const bytes = Uint8Array.from(floats, (v) => Math.round(128 + v * 128));

    expect(computeAudioLevel(bytes, 128, 128)).toBeCloseTo(computeAudioLevel(floats), 1);
  });
});
