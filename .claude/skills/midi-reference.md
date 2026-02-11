# Skill: MIDI Reference for Pure Data

## Purpose
Quick reference for MIDI conventions used in Pd patch generation and control.

## Note Numbers
- C-1 = 0, C0 = 12, C1 = 24, C2 = 36, C3 = 48
- **Middle C (C4) = 60**
- C5 = 72, C6 = 84, C7 = 96, C8 = 108, G9 = 127
- Formula: MIDI note = (octave + 1) * 12 + semitone
- Semitones: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11

## Frequency Conversion
- `freq = 440 * 2^((note - 69) / 12)`
- In Pd: `[mtof]` and `[ftom]` objects

## Pd MIDI Objects
| Object | Direction | Description |
|--------|-----------|-------------|
| notein | IN | Receive note + velocity + channel |
| noteout | OUT | Send note + velocity + channel |
| ctlin | IN | Receive CC number + value + channel |
| ctlout | OUT | Send CC number + value + channel |
| bendin | IN | Receive pitch bend + channel |
| bendout | OUT | Send pitch bend + channel |
| pgmin | IN | Receive program change + channel |
| pgmout | OUT | Send program change + channel |
| midiin | IN | Raw MIDI bytes |
| midiout | OUT | Raw MIDI bytes |
| sysexin | IN | SysEx messages |
| midirealtimein | IN | Clock, start, stop, continue |

## Common CC Numbers
- 1: Modulation wheel
- 7: Volume
- 10: Pan
- 11: Expression
- 64: Sustain pedal
- 71: Resonance (filter)
- 74: Cutoff frequency
- 91: Reverb
- 93: Chorus
- 120: All sound off
- 123: All notes off

## Moog Mother-32 Specifics (via MIDI)
- Mono synth, responds on configurable MIDI channel
- Note priority: last note
- Velocity mapped to VCA or filter (configurable)
- CC assignments configurable via front panel
- Sequencer: 32 steps, can be MIDI synced
- Clock: responds to MIDI clock (24 ppqn)
- MIDI channel set via: SHIFT + KB (hold) + select channel

## Pd Patterns for MIDI Processing
### Note filter by channel
```
[notein]
|    |    |
[route 1]  <- channel 1 only
|    |
[note] [velocity]
```

### Velocity-scaled noteout
```
[pack 0 0 1]
|
[noteout]
```

### MIDI clock (24 ppqn)
```
[midirealtimein]
|
[select 248]  <- 0xF8 = clock tick
|
[bang]
```
