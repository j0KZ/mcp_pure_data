# Skill: Common Pure Data Patch Patterns

## Purpose
Reusable Pd patch patterns for generating common structures programmatically.

## Pattern: Simple Sequencer
```
[metro <ms>]
|
[float] ---[+ 1]
|           |
[mod <steps>]
|
[select 0 1 2 3 ...]  <- one outlet per step
```

## Pattern: MIDI Note with Duration
```
[pack 0 0]         <- note, velocity
|        \
[noteout 1] [delay <ms>]
             |
             [pack 0 0]  <- same note, velocity 0
             |
             [noteout 1]
```

## Pattern: BPM to ms
```
[float <bpm>]
|
[/ 60]        <- beats per second
|
[* 1000]      <- ms per beat
|
[/ <subdivision>]  <- e.g. 4 for 16th notes
```
Formula: `ms = 60000 / (bpm * subdivision)`

## Pattern: Scale Quantizer
```
[mod 12]              <- get note class
|
[select 0 2 4 5 7 9 11]  <- C major intervals
|
[+ <octave_offset>]
```

## Pattern: Random Melody Generator
```
[metro 250]
|
[random 12]        <- random semitone
|
[+ 48]             <- base octave (C3)
|
[pack $1 100]      <- add velocity
|
[noteout 1]
```

## Pattern: Velocity Curves
```
[/ 127]           <- normalize to 0-1
|
[pow 0.5]         <- sqrt = expand low velocities
|                    [pow 2] = compress low velocities
[* 127]           <- back to MIDI range
```

## Pattern: LFO to CC
```
[osc~ <rate_hz>]      <- NOT audio osc, use [phasor~] for non-audio
|
[snapshot~ 50]         <- sample 50ms
|
[* 63.5]
[+ 63.5]              <- scale to 0-127
|
[ctlout <cc#> <ch>]
```

## Pattern: Channel Filter
```
[notein]
|       |      |
[float] [float] [float]
|       |       |
[pack 0 0 0]
|
[route <channel>]     <- actually use [select] on 3rd outlet of notein
```

Better channel filter:
```
[notein]
|  |  |
|  |  [select <ch>]
|  |  |
[stripnote]
|  |
[noteout <ch>]
```

## Pattern: Subpatch as Abstraction
File `voice.pd`:
```
#N canvas 0 50 450 300 12;
#X obj 50 50 inlet;     <- $1 = note
#X obj 50 100 mtof;
#X obj 50 150 osc~;
#X obj 50 200 *~ 0.1;
#X obj 50 250 outlet~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 2 0 3 0;
#X connect 3 0 4 0;
```
Usage in main patch: `[voice 60]`

## Layout Conventions (for generated patches)
- X spacing between objects: 100px
- Y spacing between rows: 40px
- Start position: x=50, y=50
- Connection cables: keep vertical when possible
- Group related objects visually
- Add comments (#X text x y content;) for documentation
