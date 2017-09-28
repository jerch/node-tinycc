/**
 * node-tinycc - Tiny C Compiler binding for nodejs.
 *
 *  TODO:
 *  - test all platforms
 *  - async compile on Windows
 *  - more async stuff
 *  - simplified interface
 */

/**
 * Tiny C Compiler binding for nodejs.
 *
 * With this module it is possible to declare inline C code in nodejs
 * and run it on the fly. This is possible due to the fascinating
 * Tiny C Compiler originally made by Fabrice Bellard.
 * @note The module is still alpha, interfaces are still likely to change a lot.
 * @requires node-gyp
 * @requires ffi
 * @requires ref
 * @module node-tinycc
 * @exports node-tinycc
 * @typicalname tcc
 * @example
 * ```js
 * const tcc = require('node-tinycc');
 *
 * // create a code generator
 * let gen = tcc.CodeGenerator();
 * // create a compile state
 * let state = tcc.DefaultTcc();
 *
 * // declare a C function
 * let c_func = tcc.c_function(
 *   'int',                          // return type
 *   'add',                          // function name in C
 *   [['int', 'a'], ['int', 'b']],   // parameters as [type, name]
 *   'return a + b + js_func(a, b);' // actual code
 * );
 * gen.addDeclaration(c_func);
 *
 * // add a JS function declaration to C
 * let js_func = tcc.c_callable(
 *   'int',                          // return type
 *   'js_func',                      // function name in C
 *   ['int', 'int'],                 // parameter types
 *   (a, b) => {return a * b;}       // function
 * );
 * gen.addDeclaration(js_func);
 *
 * // compile code and relocate
 * state.compile(gen.code());
 * state.relocate();
 *
 * // resolve symbols between C and JS
 * gen.bindState(state);
 *
 * // now the C stuff is usable
 * console.log(c_func(23, 42));        // --> prints 1031
 * ```
 */


'use strict';

const ffi = require('ffi');
const ref = require('ref');
const path = require('path');

// optional wchar_t support
let wchar_t = null;
try {
  wchar_t = require('ref-wchar');
  const Iconv = require('iconv').Iconv;
  let encoding = ((process.platform === 'win32') ? 'UTF-16' : 'UTF-32') + ref.endianness;
  const wchar_set = new Iconv('UTF-8', encoding).convert;
  const wchar_get = new Iconv(encoding, 'UTF-8').convert;

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
   * @param {string} s
   * @return {WCString}
   * @note The function is only exported, if the module `ref-wchar` is installed.
   */
  module.exports.WCString = function(s) {
    let buf = wchar_set(s + '\0');
    buf.type = wchar_t.string;
    return buf;
  };

  /**
   * Helper function to escape wide character string literals.
   * This is useful when writing C source code strings directly in Javascript.
   * The function escapes the UTF-8 input to the appropriate wchar_t type.
   * @example
   * ```js
   * > tcc.escapeWchar('öäü')
   * '\\xf6\\xe4\\xfc'
   * > `wchar_t *w = L"${tcc.escapeWchar('öäü')}";`
   * 'wchar_t *w = L"\\xf6\\xe4\\xfc";'
   * ```
   * @param {string} s
   * @return {string}
   * @note The function is only exported, if the module `ref-wchar` is installed.
   */
  module.exports.escapeWchar = function(s) {
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

  /**
   * @classdesc The Tcc class provides low level access to the libtcc-API
   * of the Tiny C Compiler (TCC).
   *
   * On Windows this class is constructed in Javascript
   * with `ffi` from a precompiled libtcc.dll delivered with the module.
   * On POSIX systems the class is a C++ class build in a native extension
   * from the repository source.
   *
   * @note It is important to note that you must not mix different TCC states.
   * Because TCC uses global states internally, any new state will leave
   * the old one corrupted. The compiled result is not affected by this,
   * therefore it is important to finish a state up to the compilation
   * before using a new one. This is a major drawback of the TCC API.
   * Because of the global internal states it is also not possible to cleanup
   * a state properly (a Tcc() invocation will leak memory).
   * While this works:
   * ```js
   * let state1 = Tcc();
   * ...
   * state1.compile('...') && state1.relocate();  // finished with state1
   *
   * let state2 = Tcc();  // state1 got corrupted but we are with it anyways
   * ...
   * state2.compile('...') && state2.relocate();  // finished with state2
   *
   * // use symbols from state1 & state2
   * ```
   * this will break:
   * ```js
   * let state1 = Tcc();
   * let state2 = Tcc();  // state1 got corrupted, state2 is working as expected
   * ```
   * @param tcclib
   * @return {Tcc}
   * @constructor module:node-tinycc.Tcc
   * @typicalname state
   */
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
  /**
   * Set command line options of TCC. Run `tcc -hh` to see known options.
   * @param {string} option
   * @method module:node-tinycc.Tcc#setOptions
   */
  Tcc.prototype.setOptions = function (option) {
    this.lib.tcc_set_options(this.ctx, option);
  };
  /**
   * Set TCC library path. For `DefaultTcc` this is set to the bundled TCC.
   * @param {string} path
   * @method module:node-tinycc.Tcc#setLibPath
   */
  Tcc.prototype.setLibPath = function (path) {
    this.lib.tcc_set_lib_path(this.ctx, path);
  };
  /**
   * Define a preprocessor symbol.
   * @param {string} symbol
   * @param {string=} value
   * @method module:node-tinycc.Tcc#defineSymbol
   */
  Tcc.prototype.defineSymbol = function (symbol, value) {
    this.lib.tcc_define_symbol(this.ctx, symbol, value);
  };
  /**
   * Undefine a preprocessor symbol.
   * @param {string} symbol
   * @method module:node-tinycc.Tcc#undefineSymbol
   */
  Tcc.prototype.undefineSymbol = function (symbol) {
    this.lib.tcc_undefine_symbol(this.ctx, symbol);
  };
  /**
   * Add include path.
   * @param {string} path
   * @method module:node-tinycc.Tcc#addIncludePath
   */
  Tcc.prototype.addIncludePath = function (path) {
    if (this.lib.tcc_add_include_path(this.ctx, path) === -1)
      throw new Error('error add_include_path: ' + path);
  };
  /**
   * Add a library (same name as -l...).
   * @param {string} library
   * @method module:node-tinycc.Tcc#addLibrary
   */
  Tcc.prototype.addLibrary = function (library) {
    if (this.lib.tcc_add_library(this.ctx, library) === -1)
      throw new Error('error add_library: ' + library);
  };
  /**
   * Add a library path. Equivalent to -Lpath option.
   * @param {string} path
   * @method module:node-tinycc.Tcc#addLibraryPath
   */
  Tcc.prototype.addLibraryPath = function (path) {
    if (this.lib.tcc_add_library_path(this.ctx, path) === -1)
      throw new Error('error add_link_path: ' + path);
  };
  /**
   * Add a file to compilation.
   * @fixme missing filetype parameter
   * @param {string} path
   * @method module:node-tinycc.Tcc#addFile
   */
  Tcc.prototype.addFile = function (path) {
    if (this.lib.tcc_add_file(this.ctx, path) === -1)
      throw new Error('error add_file: ' + path);
  };
  /**
   * Compile source code.
   * @param {string} code
   * @method module:node-tinycc.Tcc#compile
   */
  Tcc.prototype.compile = function (code) {
    if (this.lib.tcc_compile_string(this.ctx, code) === -1)
      throw new Error('error compile');
  };
  /**
   * Relocate after compilation. This is needed before
   * resolving any symbols.
   * @method module:node-tinycc.Tcc#relocate
   */
  Tcc.prototype.relocate = function () {
    if (this.lib.tcc_relocate(this.ctx, 1) === -1)
      throw new Error('compile relocate');
  };
  Tcc.prototype.run = function (argc, argv) {
    // TODO: handle string array
    return this.lib.tcc_run(this.ctx, argc, argv);
  };
  /**
   * Add a symbol to the compiled program.
   * This is not reliable on all architectures (likely to segfault on ARM).
   * Use with caution.
   * @param {string} symbol
   * @param {ref.refType} value
   * @method module:node-tinycc.Tcc#addSymbol
   */
  Tcc.prototype.addSymbol = function (symbol, value) {  // TODO: hold ref for value
    if (this.lib.tcc_add_symbol(this.ctx, symbol, value) === -1)
      throw new Error('error add_symbol: ' + symbol);
  };
  /**
   * Get a symbol from the program. Returns void pointer or `null` of not found.
   * @param {string} symbol
   * @return {ref.refType|null}
   * @method module:node-tinycc.Tcc#getSymbol
   */
  Tcc.prototype.getSymbol = function (symbol) {
    return this.lib.tcc_get_symbol(this.ctx, symbol);
  };
} else {
    Tcc = require('./build/Release/tcc').TCC;
}

/**
 * Resolve a C symbol name as type for further
 * usage in Javascript.
 * @note This is done automatically for known symbols
 * in `CodeGenerator.bindState`.
 * @param {string} symbol - symbol name
 * @param {string|object} type - known type of `ref.types`
 * @return {*}
 * @method module:node-tinycc.Tcc#resolveSymbol
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
 * Low level function to set the value of a C symbol.
 * Since all toplevel symbols are exported as void pointers,
 * the value must be a pointer type.
 * The referenced type of value has to match the C type of the
 * symbol, otherwise arbitrary memory will be overwritten.
 * @param {string} symbol - symbol name
 * @param {ref.refType} value
 * @method module:node-tinycc.Tcc#setSymbol
 */
Tcc.prototype.setSymbol = function(symbol, value) {
  let buf = this.getSymbol(symbol).reinterpret(value.type.size);
  buf.type = value.type;
  ref.set(buf, 0, value.deref());
};

/**
 * Resolve a C symbol name as function type.
 *
 * @param {string} symbol - symbol name
 * @param {string|object} restype - known type of `ref.types`
 * @param {array} args - array of parameter types
 * @return {ffi.ForeignFunction}
 * @method module:node-tinycc.Tcc#getFunction
 */
Tcc.prototype.getFunction = function(symbol, restype, args) {
  return ffi.ForeignFunction(this.getSymbol(symbol), restype, args);
};

/**
 * Set a C function pointer symbol to a Javascript callback.
 * The callback must be a `ffi.Callback` matching the function
 * pointer type.
 * @param {string} symbol - symbol name
 * @param {ffi.Callback} cb - Javascript callback
 * @method module:node-tinycc.Tcc#setFunction
 */
Tcc.prototype.setFunction = function(symbol, cb) {
  ref.set(this.resolveSymbol(symbol, 'void *'), 0, cb);
};

/**
 * Helper function to create a compile state with the bundled tcc.
 * The function sets the tcclib and include path to the the platform
 * dependent tcc folders.
 * @return {module:node-tinycc.Tcc}
 * @function module:node-tinycc.DefaultTcc
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
 * Wrapper for lazy evaluation of a ffi.ForeignFunction or ffi.VariadicForeignFunction.
 * This is needed to postpone the creation of the ffi function
 * until we got the real C symbol pointer.
 * @param {string|object} restype - known type of `ref.types`
 * @param {Array} args - array of parameter types
 * @param {boolean=} variadic - indicate a variadic function
 * @return {function(ref.ref) : ffi.ForeignFunction}
 * @function module:node-tinycc.CFuncType
 */
function CFuncType(restype, args, variadic) {
    return (pointer) => (variadic)
        ? ffi.VariadicForeignFunction(pointer, restype, args)
        : ffi.ForeignFunction(pointer, restype, args);
}

/**
 * Internal wrapper for ffi.Callback to distingish a function type in
 * `CodeGenerator.bindState`. It also holds a reference of
 * the callback to avoid early garbage collection.
 * @param {string|object} restype - known type of `ref.types`
 * @param {Array} args - array of parameter types
 * @param {function} f - callback function
 * @constructor module:node-tinycc.FuncSymbol
 */
function FuncSymbol(restype, args, f) {
    this.cb = ffi.Callback(restype, args, f);
}

/**
 * Base object for all declarations to be used with CodeGenerator.
 * If the standard convenient functions do not suit your needs you can
 * create a customized declaration with this base object and still use
 * the code generator.
 * Add the returned declaration to a generator with `addDeclaration`.
 * After the symbols got mapped by `CodeGenerator.bindState` you can
 * access them via the attribute `.symbols_resolved`.
 * @example
 * ```js
 * let declaration = new tcc.Declaration(
 *     `  // code
 *     int x = 1;
 *     int func_a() { return func_b() + 1; }
 *     int func_b() { return 0; }
 *     `,
 *     `  // forward
 *     int func_a();
 *     int func_b();
 *     `,
 *     [  // symbols
 *         ['int', 'x'],
 *         [tcc.CFuncType('int', []), 'func_a'],
 *         [tcc.CFuncType('int', []), 'func_b']
 *     ]);
 * ```
 * @param {string|function} code -  C source as string or a function
 *                                  returning the source code string
 * @param {string=} forward - optional forward declaration
 * @param {Array=} symbols - optional array of [type, symbol name]
 *                           to be autoresolved by the generator
 * @return {Declaration}
 * @constructor module:node-tinycc.Declaration
 * @typicalname declaration
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
 * Code generator for inline C in Javascript.
 *
 * The code generator creates the final source code
 * by putting together single declarations. The structure
 * of the final source code is the following:
 *
 * - top section: The section gets not autofilled by the generator.
 *   Use it with `addTopDeclaration` for any early stuff
 *   like including header files and such.
 * - forward section: Used by the generator to do forward declarations.
 *   Any content in `Declaration.forward` will end up here.
 * - code section: Used by the generator to place the code definitions.
 *
 * To add content to the sections call `addDeclaration` or
 * `addTopDeclaration` for the top section.
 * The order of added content is preserved, this is esp. important
 * of you omit forward declarations.
 *
 * Example usage:
 * ```js
 * let gen = tcc.CodeGenerator();
 * gen.addTopDeclaration(
 *   tcc.Declaration('#include <stdio.h')
 * );
 * gen.addDeclaration(
 *   tcc.Declaration(
 *     'void func() { printf("Hello World!\\n"); }',
 *     'void func();',
 *     [[tcc.CFuncType('void', []), 'func']]
 *   )
 * );
 * ```
 * With `code()` you can grab the generated code,
 * `codeWithLineNumbers()` might help to debug the code
 * if tcc will not compile it.
 *
 * If you are done adding declarations it is time to compile everything:
 * ```js
 * let state = tcc.DefaultTcc();
 * state.compile(gen.code());
 * state.relocate();
 * ```
 * The final step before we can use the compiled code is to resolve
 * and bind all defined symbols of the declarations. This is done by calling
 * `bindState`:
 * ```js
 * let resolved_symbols = gen.bindState(state);
 * ```
 * Now we can use the `func` symbol:
 * ```js
 * resolved_symbols.func();
 * ```
 * @return {CodeGenerator}
 * @constructor module:node-tinycc.CodeGenerator
 * @typicalname gen
 */
function CodeGenerator() {
  if (!(this instanceof CodeGenerator))
    return new CodeGenerator();
  this.headerparts = [];
  this.parts = [];
  this.symbols = null;
}

/**
 * Add declarations for the common types of `ref.types`.
 * Some of the known types of the ref module differ from typical
 * C naming (e.g. `int8` instead of `int8_t`).
 * This function adds additional typedefs to solve naming issues.
 * It adds the following types:
 *
 * | Type      | Typedef of         |
 * |-----------|--------------------|
 * | int8      | int8_t             |
 * | int16     | int16_t            |
 * | int32     | int32_t            |
 * | int64     | int64_t            |
 * | uint8     | uint8_t            |
 * | uint16    | uint16_t           |
 * | uint32    | uint32_t           |
 * | uint64    | uint64_t           |
 * | Object    | void *             |
 * | CString   | char *             |
 * | byte      | unsigned char      |
 * | uchar     | unsigned char      |
 * | ushort    | unsigned short     |
 * | uint      | unsigned int       |
 * | ulong     | unsigned long      |
 * | longlong  | long long          |
 * | ulonglong | unsigned long long |
 *
 * Furthermore it includes `<stddef.h>`, `<stdint.h>` and `<stdbool.h>`.
 * If the module `ref-wchar` is installed, `WCString` is typedef'd as
 * `wchar_t` pointer.
 * @method module:node-tinycc.CodeGenerator#loadBasicTypes
 */
CodeGenerator.prototype.loadBasicTypes = function() {
  this.addTopDeclaration(
      new Declaration('#include <stddef.h>\n#include <stdint.h>\n#include <stdbool.h>'));
  this.addTopDeclaration(
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
    this.addTopDeclaration(new Declaration('typedef wchar_t* WCString;'));
};

/**
 * Get the generated code.
 * @return {string}
 * @method module:node-tinycc.CodeGenerator#code
 */
CodeGenerator.prototype.code = function() {
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
 * Get the generated code with leading line numbers.
 * This is useful for limited debugging.
 * @return {string}
 * @method module:node-tinycc.CodeGenerator#codeWithLineNumbers
 */
CodeGenerator.prototype.codeWithLineNumbers = function() {
  let lines = this.code().split('\n');
  let depth = Math.ceil(Math.log10(lines.length));
  let prepend = Array(depth).join(' ');
  return lines.map((line, idx) => `${(prepend+(idx+1)).slice(-depth)}: ${line}`).join('\n');
};

/**
 * Add a declaration to the generator.
 * @param {Declaration} decl - declaration to be added
 * @method module:node-tinycc.CodeGenerator#addDeclaration
 */
CodeGenerator.prototype.addDeclaration = function(decl) {
  if (decl.declaration)
    decl = decl.declaration;
  if (!(decl instanceof Declaration))
    throw new Error('cannot add declaration');
  this.parts.push(decl);
};

/**
 * Add a declaration to the top section. `forward` and `symbols`
 * will be ignored for declarations added to the top section.
 * @param {Declaration} decl - declaration to be added
 * @method module:node-tinycc.CodeGenerator#addTopDeclaration
 */
CodeGenerator.prototype.addTopDeclaration = function(decl) {
  this.headerparts.push(decl.code);
};

/**
 * Resolves symbols between C and JS.
 */
/**
 * Resolve symbols between C and Javascript. Call this after
 * compilation and relocation before using any C stuff.
 *
 * The function traverses all symbol names of the added
 * declarations and tries to attach the given type.
 *
 * Returns an object with all symbol names mapping to the
 * corresponding type.
 *
 * @param {Tcc} state - state to bind to symbols
 * @return {Object}
 * @method module:node-tinycc.CodeGenerator#bindState
 */
CodeGenerator.prototype.bindState = function(state) {
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
 * Helper to create type declaration postfix list.
 * @param res
 * @param type
 * @return {*}
 * @private
 */
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

/**
 * Helper to create definitions for parameters and struct members.
 * @param varname
 * @param type
 * @return {string}
 * @private
 */
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

/**
 * Helper to resolve C type names for return values.
 * @param type
 * @private
 */
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
 * Helper to create full C function declarations.
 * @param {string|Object} restype
 * @param {string} name
 * @param {Array} args
 * @param {boolean=} varargs
 * @param {boolean=} pointer
 * @return {string}
 * @private
 */
function _func_decl(restype, name, args, varargs, pointer) {
  let vars = '';
  if (args.length)
    vars = (args[0] instanceof Array)
        ? args.map(([type, varname]) => _var_decl(varname, type)).join(', ')
        : args.map((type) => _var_decl('', type)).join(', ');
  if (varargs)
    vars += ', ...';
  return `${_restype(restype)} ` + ((pointer) ? `(*${name})` : name) + `(${vars})`;
}

/**
 * Convenvient declaration function to import a function symbol from JS to C code.
 *
 * The function creates a function pointer declaration in C. After
 * calling `CodeGenerator.bindState` the function pointer can be used
 * in C. Example usage:
 * ```js
 * let callback = tcc.c_callable('int', 'jsfunc', ['int', 'int'], (a, b) => a+b);
 * // use somewhere in C code
 * let decl = tcc.Declaration('int test(int x) { return a * jsfunc(23, 42); }');
 * gen.addDeclaration(callback);
 * gen.addDeclaration(decl);
 * ...
 * ```
 * @param {string|Object} restype - known type of `ref.types`
 * @param {string} name - function pointer name
 * @param {Array} args - array of parameter types
 * @param {function} f - Javascript function
 * @return {Declaration}
 * @function module:node-tinycc.c_callable
 */
function c_callable(restype, name, args, f) {
  return new Declaration(
    '',
    _func_decl(restype, name, args, false, true) + ' = 0;',
    [[new FuncSymbol(restype, args, f), name]]
  );
}

/**
 * Convenient declaration function to create a C function that is usable from Javascript.
 *
 * The Javascript code:
 * ```js
 * tcc.c_function('int', 'add', [['int', 'a'], ['int', 'b']], 'return a+b;');
 * ```
 * will roughly translate to this C source code:
 * ```C
 * int add(int a, int b) { return a+b; }
 * ```
 * Note that the first 3 arguments of `c_function` almost read like the C function header.
 * Additionally the C function will have a forward declaration to use it from
 * any other C code within the same compile state.
 *
 * Returns a proxy function, that automatically resolves to the underlying
 * C function. The actual declaration object resides under `.declaration`.
 * Full usage example:
 * ```js
 * let add = tcc.c_function('int', 'add', [['int', 'a'], ['int', 'b']], 'return a+b;');
 * let gen = tcc.CodeGenerator();
 * gen.addDeclaration(add);
 * let state = tcc.DefaultTcc();
 * state.compile(gen.code());
 * state.relocate();
 * gen.bindState(state);
 * console.log(add(23, 42));  // use it
 * ```
 * @param {string|Object} restype - known type of `ref.types`
 * @param {string} name - function pointer name
 * @param {Array} args - array of [type, parameter name]
 * @param {string} code - C function body
 * @return {func} proxy function
 * @function module:node-tinycc.c_function
 */
function c_function(restype, name, args, code) {
  let last_arg = args.pop();
  let varargs = (
      last_arg && last_arg === '...'
      || (last_arg instanceof Array && last_arg.length === 1 && last_arg[0] === '...'));
  if (last_arg && !varargs)
      args.push(last_arg);
  let header = _func_decl(restype, name, args, varargs);
  let declaration = new Declaration(
    `${header}\n{\n${code||''}\n}\n`,
    header + ';',
    [[CFuncType(restype, args.map(([type, _]) => type), varargs), name]]
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
 * Convenient declaration function to declare a struct type usable in C and Javascript.
 *
 * This function extracts the field names and types of a StructType (module `ref-struct`)
 * to create a struct declaration (forward section) and definition for C (code section).
 * A field type is resolved recursively to catch complicated type mixtures that
 * can easily be build with  StructTypes, ArrayTypes and pointer types
 * (e.g. `struct XY *(*a[2])[10];`).
 * No typedef declaration is added for the struct, therefore always reference the
 * struct type by `struct name` in C. The struct type can be used at any point where
 * a `ref.types` type is needed, e.g. as function parameter or return type.
 * Usage example:
 * ```js
 * const StructType = require('ref-struct');
 * let gen = tcc.CodeGenerator();
 * let S = tcc.c_struct('S', StructType({a: 'int', b: 'char*'}));
 * addDeclaration(S);
 * ```
 * The struct of the example will roughly translate to this C code
 * (beside some more alignment directives):
 * ```C
 * struct S {
 *     int a;
 *     char (*b);
 * };
 * ```
 * `c_struct` finalizes a `StructType`, i.e. no more fields can be added afterwards.
 * To build a struct type with a pointer to itself (e.g. for linked lists),
 * build the StructType without that field beforehand and use the
 * `StructType.defineProperty` to declare the self pointer member. Decorate the struct
 * type afterwards with `c_struct`:
 * ```js
 * let S = StructType();
 * S.defineProperty('self', S);
 * c_struct('S', S);  // defineProperty not allowed after this
 * ```
 * @param {string} name - struct type name in C
 * @param {StructType} structType - structType to be declared in C
 * @return {StructType} structType decorated with declaration object
 * @function module:node-tinycc.c_struct
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
module.exports.CodeGenerator = CodeGenerator;
module.exports.Declaration = Declaration;
module.exports.c_function = c_function;
module.exports.c_callable = c_callable;
module.exports.c_struct = c_struct;
module.exports._var_decl = _var_decl;
module.exports._func_decl = _func_decl;
