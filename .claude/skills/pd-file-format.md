# Skill: Pure Data .pd File Format

## Purpose
Parse, understand, and generate valid Pure Data patch files (.pd).

## .pd Syntax Rules

### Canvas (window) declaration
```
#N canvas <x> <y> <width> <height> <font-size>;
```
Example: `#N canvas 0 50 800 600 12;`

### Objects
```
#X obj <x> <y> <object-name> [arg1 arg2 ...];
```
Example: `#X obj 100 200 osc~ 440;`

### Messages
```
#X msg <x> <y> <content>;
```
Example: `#X msg 50 100 bang;`

### Number boxes
```
#X floatatom <x> <y> <width> <lower> <upper> <label-pos> <label> <receive> <send>;
```

### Connections
```
#X connect <source-index> <outlet> <dest-index> <inlet>;
```
- Indices are 0-based, in order of object appearance in file
- Outlet/inlet numbering: 0 = leftmost

### Subpatches
```
#N canvas <x> <y> <w> <h> <name> <visible>;
... objects inside ...
#X restore <x> <y> pd <name>;
```

### Arrays
```
#X array <name> <size> float 0;
#A 0 <val1> <val2> ...;
```

### GUI Objects
```
#X obj <x> <y> bng <size> <hold> <intrrpt> <init> <send> <receive> <label> ...;
#X obj <x> <y> tgl <size> <init> <send> <receive> <label> ...;
#X obj <x> <y> nbx <width> <height> <min> <max> ...;
#X obj <x> <y> vsl <width> <height> <min> <max> ...;
#X obj <x> <y> hsl <width> <height> <min> <max> ...;
```

## Parsing Strategy
1. Read file line by line (lines end with `;`)
2. Multi-line statements: concatenate until `;` found
3. Track object index counter (increments per `#X obj`, `#X msg`, `#X floatatom`, etc.)
4. Build adjacency list from `#X connect` lines
5. Handle nested canvases with stack-based depth tracking

## Validation Rules
- Every connection must reference valid object indices
- Outlet/inlet numbers must be within object's range
- Canvas declarations must be balanced (each `#N canvas` has matching `#X restore` except root)
- No duplicate connections allowed
- Coordinates must be non-negative integers

## Common Pitfalls
- Semicolons inside messages need escaping: `\;`
- Commas in messages separate multiple messages: `1 2 3, 4 5 6`
- Dollar signs ($1, $2) are patch-local variables
- Tilde (~) suffix = audio rate object (osc~, dac~, etc.)
- Object names are case-sensitive
