import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundFXEngine, SFX_CUES } from './sound-fx-engine.js';

function createMockAudioContext() {
  const startedOscillators = [];
  const startedBuffers = [];

  class MockAudioContext {
    constructor() {
      this.currentTime = 1.0;
      this.sampleRate = 44100;
      this.state = 'running';
      this.destination = {};
    }
    resume() {
      this.state = 'running';
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        Q: { setValueAtTime() {} },
        frequency: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        start(t) {
          startedOscillators.push({ type: this.type, t });
        },
        stop() {},
      };
      return osc;
    }
    createBuffer(channels, length, sampleRate) {
      const buf = new Float32Array(length);
      return {
        sampleRate,
        getChannelData: () => buf,
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start(t) {
          startedBuffers.push({ t });
        },
        stop() {},
      };
    }
  }

  return { MockAudioContext, startedOscillators, startedBuffers };
}

test('all SFX cues play cleanly through Web Audio without errors', () => {
  const { MockAudioContext, startedOscillators, startedBuffers } = createMockAudioContext();
  let t = 1000;
  const fx = createSoundFXEngine({
    getAudioContextCtor: () => MockAudioContext,
    nowMs: () => {
      t += 500;
      return t;
    },
  });

  for (const cue of SFX_CUES) {
    assert.equal(fx.play(cue), true, `expected cue "${cue}" to play`);
  }
  assert.ok(startedOscillators.length >= SFX_CUES.length, 'oscillators should be triggered across cues');
  assert.ok(startedBuffers.length >= 4, 'filtered noise cues should trigger softly for swooshes/paperStab');
});

test('SFX engine respects mute toggle and per-cue anti-spam cooldown', () => {
  const { MockAudioContext, startedOscillators } = createMockAudioContext();
  let now = 1000;
  const fx = createSoundFXEngine({
    getAudioContextCtor: () => MockAudioContext,
    nowMs: () => now,
  });

  // Rapid repeated ticks within cooldown (45ms) are suppressed to prevent audio clutter
  assert.equal(fx.play('tick'), true);
  now += 15;
  assert.equal(fx.play('tick'), false);
  now += 60;
  assert.equal(fx.play('tick'), true);

  // Unknown cue safely returns false
  assert.equal(fx.play('nonexistentCue'), false);

  // Muting stops all playback immediately
  const beforeMuteCount = startedOscillators.length;
  fx.setEnabled(false);
  assert.equal(fx.isEnabled(), false);
  now += 500;
  assert.equal(fx.play('complete'), false);
  assert.equal(startedOscillators.length, beforeMuteCount);
});
