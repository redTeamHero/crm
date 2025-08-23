// public/specialModes.js
export const MODES = {
  default: { key: "default", label: "Normal" },
  identity: { key: "identity", label: "Identity Theft", chip: "ID Theft" },
  breach:   { key: "breach",   label: "Data Breach",    chip: "Breach"  },
  assault:  { key: "assault",  label: "Sexual Assault", chip: "Assault" },
};

let _active = "default";
export function getMode() { return _active; }
export function setMode(k) { _active = MODES[k] ? k : "default"; }
export function isSpecial(k){ return k !== "default"; }
export function allSpecialKeys(){ return ["identity","breach","assault"]; }
