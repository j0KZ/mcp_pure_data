/**
 * Pure Data file format constants and object metadata.
 */

/** Line prefixes in .pd files. */
export const PD_LINE_CANVAS = "#N canvas";
export const PD_LINE_ELEMENT = "#X";
export const PD_LINE_ARRAY_DATA = "#A";

/** Element types that appear after #X and count as indexable nodes. */
export const PD_INDEXABLE_TYPES = new Set([
  "obj",
  "msg",
  "floatatom",
  "symbolatom",
  "text",
  "array",
]);

/** Element types that are structural, not indexable nodes. */
export const PD_STRUCTURAL_TYPES = new Set(["connect", "restore", "coords"]);

/**
 * Known Pd-vanilla objects grouped by category.
 * Used for validation and listing.
 */
export const PD_OBJECT_CATEGORIES: Record<string, string[]> = {
  math: [
    "+", "-", "*", "/", "%", "mod", "div",
    "pow", "sqrt", "exp", "log", "abs",
    "min", "max", "clip",
    "sin", "cos", "tan", "atan", "atan2",
    "wrap",
  ],
  midi: [
    "notein", "noteout",
    "ctlin", "ctlout",
    "bendin", "bendout",
    "pgmin", "pgmout",
    "touchin", "touchout",
    "polytouchin", "polytouchout",
    "midiin", "midiout",
    "sysexin",
    "midirealtimein",
    "midisystemin",
    "mtof", "ftom",
    "stripnote", "makenote",
  ],
  time: [
    "metro", "delay", "timer", "realtime", "pipe",
    "line", "line~", "vline~",
  ],
  audio: [
    "osc~", "phasor~", "noise~", "tabosc4~",
    "lop~", "hip~", "bp~", "vcf~", "bob~",
    "dac~", "adc~",
    "*~", "+~", "-~", "/~",
    "clip~", "wrap~", "abs~", "sqrt~",
    "env~", "threshold~", "snapshot~",
    "send~", "receive~", "throw~", "catch~",
    "delwrite~", "delread~", "delread4~",
    "tabwrite~", "tabread~", "tabread4~",
    "readsf~", "writesf~",
    "sig~", "samplerate~", "block~", "switch~",
    "inlet~", "outlet~",
    "fft~", "ifft~", "rfft~", "rifft~",
  ],
  control: [
    "bang", "b",
    "float", "f",
    "symbol",
    "int", "i",
    "send", "s",
    "receive", "r",
    "select", "sel",
    "route",
    "spigot", "moses",
    "until", "change",
    "swap", "value", "v",
    "trigger", "t",
    "pack", "unpack",
    "print",
    "loadbang",
    "inlet", "outlet",
    "netsend", "netreceive",
    "oscformat", "oscparse",
    "list",
  ],
  data: [
    "tabread", "tabwrite", "soundfiler",
    "table", "array",
    "text",
    "makefilename",
    "openpanel", "savepanel",
  ],
  gui: [
    "bng", "tgl", "nbx",
    "vsl", "hsl",
    "vradio", "hradio",
    "vu", "cnv",
  ],
  subpatch: [
    "pd",
  ],
};

/** Flat set of all known vanilla object names. */
export const PD_KNOWN_OBJECTS = new Set(
  Object.values(PD_OBJECT_CATEGORIES).flat()
);

/** Default layout settings for generated patches. */
export const LAYOUT = {
  startX: 50,
  startY: 50,
  spacingX: 100,
  spacingY: 40,
  canvasWidth: 800,
  canvasHeight: 600,
  fontSize: 12,
} as const;
