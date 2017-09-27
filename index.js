'use strict';

const ffi = require('ffi');
const ref = require('ref');
const path = require('path');

// optional wchar_t support
let wchar_t = null;
try {
  wchar_t = require('ref-wchar');
  const Iconv = require('iconv').Iconv;
  const wchar_set = new Iconv('UTF-8', 'WCHAR_T').convert;
  const wchar_get = new Iconv('WCHAR_T', 'UTF-8').convert;

  // monkey patch broken wchar_t.toString
  wchar_t.toString = (buffer) => {
    if (!buffer)
      return '[wchar_t]';
    return wchar_get(buffer).toString('utf8');
  };

  // add wchar types to type system
  ref.types.wchar_t = wchar_t;
  ref.types.WCString = wchar_t.string;
  ref.types.wstring = wchar_t.string;

  /**
   * Helper function for easy wide string creation.
   */
  module.exports.WCString = function(s) {
    let buf = wchar_set(s + '\0');
    buf.type = wchar_t.string;
    return buf;
  };

  /**
   * Helper to escape wide character string literals in source code.
   * Example: `wchar_t *w = L"${escape_wchar('öäü')}";`
   */
  module.exports.escape_wchar = function(s) {
    /* istanbul ignore next */
    let AR = (wchar_t.size === 2) ? Uint16Array : Uint32Array;
    return [...new AR(new Uint8Array(wchar_set(s)).buffer)].map(
      (el) => '\\x' + el.toString(16)
    ).join('');
  };
} catch (e) {}

let Tcc = null;

/* istanbul ignore if */
if (process.platform === 'win32') {
  const void_p = ref.refType(ref.types.void);
  const TCCState_p = void_p;
  Tcc = function(tcclib) {
    if (!(this instanceof Tcc))
      return new Tcc(tcclib);
    this.lib = ffi.Library(tcclib, {
      // missing: tcc_enable_debug, tcc_set_error_func, tcc_set_warning, tcc_add_sysinclude_path, tcc_output_file
      'tcc_new': [TCCState_p, []],
      'tcc_delete': ['void', [TCCState_p]],                       // TODO: explicit destructor
      'tcc_set_lib_path': ['void', [TCCState_p, 'string']],
      'tcc_set_output_type': ['int', [TCCState_p, 'int']],
      'tcc_set_options': ['void', [TCCState_p, 'string']],
      'tcc_define_symbol': ['void', [TCCState_p, 'string', 'string']],
      'tcc_undefine_symbol': ['void', [TCCState_p, 'string']],
      'tcc_add_include_path': ['int', [TCCState_p, 'string']],
      'tcc_add_library': ['int', [TCCState_p, 'string']],
      'tcc_add_library_path': ['int', [TCCState_p, 'string']],
      'tcc_add_file': ['int', [TCCState_p, 'string']],    // TODO: check unicode compat
      'tcc_compile_string': ['int', [TCCState_p, 'string']],
      'tcc_relocate': ['int', [TCCState_p, 'int']],
      'tcc_add_symbol': ['int', [TCCState_p, 'string', 'string']],
      'tcc_get_symbol': [void_p, [TCCState_p, 'string']],
      'tcc_run': ['int', [TCCState_p, 'int', void_p]]
    });
    this.ctx = this.lib.tcc_new();
    this.lib.tcc_set_output_type(this.ctx, 1);
  };
  Tcc.prototype.setOptions = function (option) {
    this.lib.tcc_set_option(this.ctx, option);
  };
  Tcc.prototype.setLibPath = function (path) {
    this.lib.tcc_set_lib_path(this.ctx, path);
  };
  Tcc.prototype.defineSymbol = function (symbol, value) {
    this.lib.tcc_define_symbol(this.ctx, symbol, value);
  };
  Tcc.prototype.undefineSymbol = function (symbol) {
    this.lib.tcc_undefine_symbol(this.ctx, symbol);
  };
  Tcc.prototype.addIncludePath = function (path) {
    if (this.lib.tcc_add_include_path(this.ctx, path) === -1)
      throw new Error('error add_include_path: ' + path);
  };
  Tcc.prototype.addLibrary = function (library) {
    if (this.lib.tcc_add_library(this.ctx, library) === -1)
      throw new Error('error add_library: ' + library);
  };
  Tcc.prototype.addLibraryPath = function (path) {
    if (this.lib.tcc_add_library_path(this.ctx, path) === -1)
      throw new Error('error add_link_path: ' + path);
  };
  Tcc.prototype.addFile = function (path) {
    if (this.lib.tcc_add_file(this.ctx, path) === -1)
      throw new Error('error add_file: ' + path);
  };
  Tcc.prototype.compile = function (code) {
    if (this.lib.tcc_compile_string(this.ctx, code) === -1)
      throw new Error('error compile');
  };
  Tcc.prototype.relocate = function () {
    if (this.lib.tcc_relocate(this.ctx, 1) === -1)
      throw new Error('compile relocate');
  };
  Tcc.prototype.run = function (argc, argv) {
    // TODO: handle string array
    return this.lib.tcc_run(this.ctx, argc, argv);
  };
  Tcc.prototype.addSymbol = function (symbol, value) {  // TODO: hold ref for value
    if (this.lib.tcc_add_symbol(this.ctx, symbol, value) === -1)
      throw new Error('error add_symbol: ' + symbol);
  };
  Tcc.prototype.getSymbol = function (symbol) {
    return this.lib.tcc_get_symbol(this.ctx, symbol);
  };
} else {
    Tcc = require('./build/Release/tcc').TCC;
}

/**
 * Resolve value of a C symbol name to the given type.
 */
Tcc.prototype.resolveSymbol = function(symbol, type) {
  if (typeof type === "function" && !type.name) {
    return type(this.getSymbol(symbol));
  }
  type = ref.coerceType(type);
  let res = this.getSymbol(symbol).reinterpret(type.size);
  res.type = type;
  if (type.name === 'StructType' || type.name === 'ArrayType')
    res = new type(res);
  return res;
};

/**
 * Set a C symbol to value.
 */
Tcc.prototype.setSymbol = function(symbol, value) {
  let buf = this.getSymbol(symbol).reinterpret(value.type.size);
  buf.type = value.type;
  ref.set(buf, 0, value.deref());
};

/**
 * Get a C function as ForeignFunction.
 */
Tcc.prototype.getFunction = function(symbol, restype, args) {
  return ffi.ForeignFunction(this.getSymbol(symbol), restype, args);
};

/**
 * Set a C function pointer symbol to ffi.Callback.
 */
Tcc.prototype.setFunction = function(symbol, cb) {
  ref.set(this.resolveSymbol(symbol, 'void *'), 0, cb);
};

/**
 * Function to create a compile state with bundled tcc.
 */
function DefaultTcc() {
  let state = null;
  /* istanbul ignore if */
  if (process.platform === 'win32') {
    let arch = (process.arch === 'x64') ? 'win64' : 'win32';
    state = new Tcc(path.join(__dirname, arch, 'libtcc.dll'));
    state.setLibPath(path.join(__dirname, arch));
    state.addIncludePath(path.join(__dirname, arch, 'include'));
  } else {
    state = new Tcc();
    state.setLibPath(path.join(__dirname, 'posix', 'lib', 'tcc'));
    state.addIncludePath(path.join(__dirname, 'posix', 'lib', 'tcc', 'include'));
    state.addIncludePath(path.join(__dirname, 'posix', 'include'));
  }
  return state;
}

/**
 * A wrapper for lazy evaluation of ffi.ForeignFunction.
 */
function CFuncType(restype, args) {
  return (pointer) => ffi.ForeignFunction(pointer, restype, args);
}

/**
 * Wrapper of ffi.Callback to distingish a function type in `bind_state`.
 */
function FuncSymbol(restype, args, f) {
    this.cb = ffi.Callback(restype, args, f);
}

/**
 * Create a C code object to be used with InlineGenerator.
 */
function Declaration(code, forward, symbols) {
  if (!(this instanceof(Declaration)))
    return new Declaration(code, forward, symbols);
  this.code = code || '';
  this.forward = forward || '';
  this.symbols = symbols || [];
  this.symbols_resolved = {};
}

/**
 * Code generator for inline C in Javascript. Handles back and forth symbol resolution.
 */
function InlineGenerator() {
  if (!(this instanceof InlineGenerator))
    return new InlineGenerator();
  this.headerparts = [];
  this.parts = [];
  this.symbols = null;
}

/**
 * Define basic types from ref module.
 * Note: The `Object` type is typed as void pointer.
 */
InlineGenerator.prototype.loadBasicTypes = function() {
  this.add_topdeclaration(
      new Declaration('#include <stddef.h>\n#include <stdint.h>\n#include <stdbool.h>'));
  this.add_topdeclaration(
      new Declaration(`typedef int8_t int8;
typedef int16_t int16;
typedef int32_t int32;
typedef int64_t int64;
typedef uint8_t uint8;
typedef uint16_t uint16;
typedef uint32_t uint32;
typedef uint64_t uint64;
typedef void* Object;
typedef char* CString;
typedef unsigned char byte;
typedef unsigned char uchar;
typedef unsigned short ushort;
typedef unsigned int uint;
typedef unsigned long ulong;
typedef long long longlong;
typedef unsigned long long ulonglong;`));
  /* istanbul ignore else */
  if (wchar_t)
    this.add_topdeclaration(new Declaration('typedef wchar_t* WCString;'));
};

/**
 * Get C code of added declarations.
 */
InlineGenerator.prototype.code = function() {
  let top = this.headerparts.join('\n');
  let forward = this.parts.map((el) => el.forward).join('\n');
  let code = this.parts.map(
    (el) => (typeof el.code === 'function') ? el.code() : el.code
  ).join('\n');
  return [
    '/* top */', top, '',
    '/* forward */', forward, '',
    '/* code */', code, ''
  ].join('\n');
};

/**
 * Get C code with line numbers.
 */
InlineGenerator.prototype.codeWithLineNumbers = function() {
  let lines = this.code().split('\n');
  let depth = Math.ceil(Math.log10(lines.length));
  let prepend = Array(depth).join(' ');
  return lines.map((line, idx) => `${(prepend+(idx+1)).slice(-depth)}: ${line}`).join('\n');
};

/**
 * Add a declaration to the generator.
 */
InlineGenerator.prototype.add_declaration = function(decl) {
  if (decl.declaration)
    decl = decl.declaration;
  if (!(decl instanceof Declaration))
    throw new Error('cannot add declaration');
  this.parts.push(decl);
};

/**
 * Add a topdeclaration to the generator.
 */
InlineGenerator.prototype.add_topdeclaration = function(decl) {
  this.headerparts.push(decl.code);
};

/**
 * Resolves symbols between C and JS.
 */
InlineGenerator.prototype.bind_state = function(state) {
  // TODO: test for relocate
  if (this.symbols)
    return this.symbols;
  let all_symbols = {};
  for (let i=0; i<this.parts.length; ++i) {
    if (this.parts[i].symbols.length)
      for (let j=0; j<this.parts[i].symbols.length; ++j) {
        let sym = this.parts[i].symbols[j];
        if (sym[0] instanceof FuncSymbol) {
          ref.set(state.resolveSymbol(sym[1], 'void*'), 0, sym[0].cb);
        } else {
          let resolved = state.resolveSymbol(sym[1], sym[0]);
          this.parts[i].symbols_resolved[sym[1]] = resolved;
          all_symbols[sym[1]] = resolved;
        }
      }
  }
  this.symbols = all_symbols;
  return all_symbols;
};

/**
 * Helper function to create c declarations.
 */
// build postfix token list
function _postfix(res, type) {
  type = ref.coerceType(type);
  let typename = type.name;
  while (typename.endsWith('*')) {
    res.push('*');
    typename = typename.slice(0, -1);
  }
  if (typename === 'StructType') {
    if (!type.prototype._name)
      throw new Error('unkown C name for type '+ typename);
    res.push(`struct ${type.prototype._name}`);
  } else if (typename === 'ArrayType') {
    res.push(`[${(type.fixedLength || '')}]`);
    _postfix(res, type.type);
  } else
    res.push(typename);
  return res;
}
// create c declarations for parameters and struct members
function _var_decl(varname, type) {
  let pf = _postfix([varname], type);
  let s = pf.shift();
  while (pf.length > 1) {
    let token = pf.shift();
    if (token.startsWith('['))
      s += token;
    else
      s = token + s;
    s = `(${s})`;
  }
  return `${pf.shift()} ${s}`;
}
// construct function declarations
function _func_decl(restype, name, args, pointer) {
  let vars = '';
  if (args.length)
    vars = (args[0] instanceof Array)
        ? args.map(([type, varname]) => _var_decl(varname, type)).join(', ')
        : args.map((type) => _var_decl('', type)).join(', ');
  return `${_restype(restype)} ` + ((pointer) ? `(*${name})` : name) + `(${vars})`;
}
// resolve C names for restype
function _restype(type) {
  type = ref.coerceType(type);
  let typename = type.name;
  if (typename.startsWith('StructType')) {
    if (!type.prototype._name)
      throw new Error('unkown C name for type '+ type);
    typename = `struct ${typename.replace('StructType', type.prototype._name)}`;
  } else if (typename.startsWith('ArrayType')) {
    throw new Error('ArrayType not allowed as restype');
  }
  return typename;
}

/**
 * Convenvient function to import a function symbol from JS to C code.
 */
function c_callable(restype, name, args, f) {
  return new Declaration(
    '',
    _func_decl(restype, name, args, true) + ' = 0;',
    [[new FuncSymbol(restype, args, f), name]]
  );
}

/**
 * Convenient function to create a C function useable from JS.
 */
function c_function(restype, name, args, code) {
  let header = _func_decl(restype, name, args);
  let declaration = new Declaration(
    `${header}\n{\n${code||''}\n}\n`,
    header + ';',
    [[CFuncType(restype, args.map(([type, _]) => type)), name]]
  );
  let func = function() {
    if (func.declaration.symbols_resolved[name])
      return func.declaration.symbols_resolved[name].apply(this, arguments);
    throw new Error(`c_function "${name}" must be compiled and bound before usage`);
  };
  func.declaration = declaration;
  return func;
}

/**
 * Convenient function to declare a struct usable in C and JS.
 */
function c_struct(name, structType) {
  let _ = new structType;
  structType.prototype._name = name;
  structType.declaration = new Declaration(
    () => {
      // get all field names in sorted order
      let fields = Object.getOwnPropertyNames(structType.fields);
      fields.sort((a, b) => {
        return structType.fields[a].offset - structType.fields[b].offset;
      });
      let members = fields.map(
        // FIXME: need to declare member alignment?
        (el) => `  ${_var_decl(el, structType.fields[el].type)};`
      ).join('\n');
      return `struct __attribute__((aligned(${structType.alignment}))) ${name} {\n${members}\n};`;
    },
    `struct ${name};`,
    []
  );
  return structType;
}

module.exports.Tcc = Tcc;
module.exports.DefaultTcc = DefaultTcc;
module.exports.CFuncType = CFuncType;
module.exports.Callback = ffi.Callback;
module.exports.InlineGenerator = InlineGenerator;
module.exports.Declaration = Declaration;
module.exports.c_function = c_function;
module.exports.c_callable = c_callable;
module.exports.c_struct = c_struct;
module.exports._var_decl = _var_decl;
module.exports._func_decl = _func_decl;
