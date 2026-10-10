// Syntax highlighting for grain's own languages, registered with highlight.js core.
//   Rye   -- the bounded systems language (Zig syntax underneath)
//   Rishi -- the shell: let / say / assert ... else / run [...]
//   Glow  -- Hoon-like runes over bounded semantics, '::' comments
//   Kyri, Brix, Brush -- line-oriented `key value` notation, '#' or '::' comments

import hljs from 'highlight.js/lib/core'
import type { HLJSApi, Language } from 'highlight.js'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import c from 'highlight.js/lib/languages/c'
import swift from 'highlight.js/lib/languages/swift'
import nix from 'highlight.js/lib/languages/nix'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import awk from 'highlight.js/lib/languages/awk'

const STAMP = { className: 'number', begin: /\b20\d{6}(?:[.\-_]\d{6})?\b/, relevance: 0 }

function rye(h: HLJSApi): Language {
  return {
    name: 'Rye',
    aliases: ['zig'],
    keywords: {
      keyword: 'const var fn pub return if else while for switch struct enum union error try catch defer errdefer comptime test unreachable orelse and or break continue inline export extern usingnamespace noreturn packed align threadlocal nosuspend suspend resume await async',
      type: 'u8 u16 u32 u64 u128 i8 i16 i32 i64 i128 usize isize f16 f32 f64 bool void anyerror anytype anyopaque type comptime_int comptime_float c_int',
      literal: 'true false null undefined',
    },
    contains: [
      { className: 'doctag', begin: /\/\/[!/]/, end: /$/, contains: [STAMP] },
      h.C_LINE_COMMENT_MODE,
      { className: 'built_in', begin: /@[A-Za-z_]\w*/ },
      h.QUOTE_STRING_MODE,
      { className: 'string', begin: /\\\\/, end: /$/ },
      STAMP,
      { className: 'number', begin: /\b(0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(\.\d+)?)\b/, relevance: 0 },
      { className: 'title.function', begin: /\b[a-z_]\w*(?=\s*\()/, relevance: 0 },
    ],
  }
}

function rishi(h: HLJSApi): Language {
  return {
    name: 'Rishi',
    aliases: ['rish'],
    keywords: {
      keyword: 'let say assert else run if then for in while fn return exit-ok exit import use match end',
      literal: 'true false',
    },
    contains: [
      h.HASH_COMMENT_MODE,
      { className: 'meta', begin: /\bGREEN\b/ },
      { className: 'deletion', begin: /\bRED\b/ },
      {
        className: 'string', begin: /"/, end: /"/,
        contains: [h.BACKSLASH_ESCAPE, { className: 'subst', begin: /\$\{/, end: /\}/ }, { className: 'meta', begin: /\bGREEN\b/ }],
      },
      STAMP,
      h.C_NUMBER_MODE,
      { className: 'punctuation', begin: /[[\]]/ },
    ],
  }
}

function glow(h: HLJSApi): Language {
  return {
    name: 'Glow',
    contains: [
      { className: 'comment', begin: /::/, end: /$/, contains: [STAMP] },
      { className: 'keyword', begin: /(?:\|[=_%.:^\-~*$@?]|\?[:.|&-]|\^[-+.~]|\+[$+|*]|\$[:%=_^]|%[-+.^~*=]|=[,.:~^|]|~[|$%_<>.]|;[;:~<>+]|==|--)/ },
      { className: 'type', begin: /@[a-z]*\b/ },
      { className: 'symbol', begin: /%[a-z][\w-]*/ },
      h.QUOTE_STRING_MODE,
      { className: 'string', begin: /'/, end: /'/ },
      STAMP,
      h.C_NUMBER_MODE,
    ],
  }
}

function kyri(h: HLJSApi): Language {
  return {
    name: 'Kyri',
    aliases: ['brix', 'brush', 'manifest'],
    contains: [
      h.HASH_COMMENT_MODE,
      { className: 'comment', begin: /^\s*::/, end: /$/ },
      { className: 'attr', begin: /^\s*[A-Za-z_][\w.-]*/, relevance: 0 },
      STAMP,
      { className: 'number', begin: /\b0x[0-9A-Fa-f]+\b/ },
      { className: 'string', begin: /"/, end: /"/ },
      { className: 'link', begin: /\b[\w.-]+\/[\w./-]+/ , relevance: 0 },
    ],
  }
}

let ready = false
export function setupLanguages(): typeof hljs {
  if (ready) return hljs
  ready = true
  const langs: Record<string, (h: HLJSApi) => Language> = {
    bash, python, json, javascript, typescript, c, swift, nix, yaml, xml, markdown, awk,
    rye, rishi, glow, kyri,
  }
  for (const [name, fn] of Object.entries(langs)) hljs.registerLanguage(name, fn)
  return hljs
}

const EXT: Record<string, string> = {
  rye: 'rye', zig: 'rye', rish: 'rishi', glow: 'glow', kyri: 'kyri', brix: 'kyri', brush: 'kyri',
  manifest: 'kyri', sh: 'bash', bash: 'bash', py: 'python', json: 'json', js: 'javascript',
  mjs: 'javascript', ts: 'typescript', c: 'c', h: 'c', swift: 'swift', nix: 'nix', yml: 'yaml',
  yaml: 'yaml', html: 'xml', svg: 'xml', xml: 'xml', mdc: 'markdown', awk: 'awk', input: 'kyri',
}

export function languageFor(path: string): string | undefined {
  const base = path.split('/').pop() ?? ''
  if (base === '.brix') return 'kyri'
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : ''
  return EXT[ext]
}
