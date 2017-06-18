/*
TODO:
  - replace ffi shared lib version of Tcc with native version (needed for OSX)
  - use EventEmitter for compile steps
  - use ref.coerceType where appropriate
  - enhance InlineGenerator with struct and array functionality
 */

var ffi = require('ffi');
var ref = require('ref');

var void_p = ref.refType(ref.types.void);
var TCCState_p = void_p;

function Tcc(tcclib, tccpath) {
  if (!(this instanceof Tcc))
    return new Tcc(tcclib, tccpath);
  this.lib = ffi.Library(tcclib || './linux/lib/libtcc.so', {
    // missing: tcc_enable_debug, tcc_set_error_func, tcc_set_warning, tcc_add_sysinclude_path, tcc_output_file
    'tcc_new':              [TCCState_p,  []],
    'tcc_delete':           ['void',      [TCCState_p]],                       // TODO: explicit destructor
    'tcc_set_lib_path':     ['void',      [TCCState_p, 'string']],
    'tcc_set_output_type':  ['int',       [TCCState_p, 'int']],
    'tcc_set_options':      ['void',      [TCCState_p, 'string']],
    'tcc_define_symbol':    ['void',      [TCCState_p, 'string', 'string']],
    'tcc_undefine_symbol':  ['void',      [TCCState_p, 'string']],
    'tcc_add_include_path': ['int',       [TCCState_p, 'string']],
    'tcc_add_library':      ['int',       [TCCState_p, 'string']],
    'tcc_add_library_path': ['int',       [TCCState_p, 'string']],
    'tcc_add_file':         ['int',       [TCCState_p, 'string']],    // TODO: check unicode compat
    'tcc_compile_string':   ['int',       [TCCState_p, 'string']],
    'tcc_relocate':         ['int',       [TCCState_p, 'int']],
    'tcc_add_symbol':       ['int',       [TCCState_p, 'string', 'string']],
    'tcc_get_symbol':       [void_p,      [TCCState_p, 'string']],
    'tcc_run':              ['int',       [TCCState_p, 'int', void_p]]
  });
  this.ctx = this.lib.tcc_new();
  this.lib.tcc_set_lib_path(this.ctx, tccpath || './linux/lib/tcc');
  this.lib.tcc_set_output_type(this.ctx, 0);  // memory build only
  this._obj_refs = {};
}
Tcc.prototype.set_option = function(option) {
  this.lib.tcc_set_option(this.ctx, option);
}
Tcc.prototype.define = function(symbol, value) {
  this.lib.tcc_define_symbol(this.ctx, symbol, value);
}
Tcc.prototype.undefine = function(symbol) {
  this.lib.tcc_undefine_symbol(this.ctx, symbol);
}
Tcc.prototype.add_include_path = function(path) {
  if (this.lib.tcc_add_include_path(this.ctx, path) == -1)
    throw new Error('error add_include_path: ' + path);
}
Tcc.prototype.add_library = function(library) {
  if (this.lib.tcc_add_library(this.ctx, library) == -1)
    throw new Error('error add_library: ' + library);
}
Tcc.prototype.add_link_path = function(path) {
  if (this.lib.tcc_add_library_path(this.ctx, path) == -1)
    throw new Error('error add_link_path: ' + path);
}
Tcc.prototype.add_file = function(path) {
  if (this.lib.tcc_add_file(this.ctx, path) == -1)
    throw new Error('error add_file: ' + path);
}
Tcc.prototype.compile = function(code) {
  if (this.lib.tcc_compile_string(this.ctx, code) == -1)
    throw new Error('error compile');
}
Tcc.prototype.relocate = function() {
  if (this.lib.tcc_relocate(this.ctx, 1) == -1)
    throw new Error('compile relocate');
}
Tcc.prototype.run = function(argc, argv) {
  // TODO: handle string array
  return this.lib.tcc_run(this.ctx, argc, argv);
}
Tcc.prototype.add_symbol = function(symbol, value) {  // TODO: hold ref for value
  if (this.lib.tcc_add_symbol(this.ctx, symbol, value) == -1)
    throw new Error('error add_symbol: ' + symbol);
}
Tcc.prototype.get_symbol = function(symbol) {
  return this.lib.tcc_get_symbol(this.ctx, symbol);
}
Tcc.prototype.resolve_symbol = function(symbol, type) {
  // TODO: support array and struct
  if (typeof type === "function")
    return type(this.get_symbol(symbol));
  type = ref.coerceType(type);
  var res = this.get_symbol(symbol).reinterpret(type.size);
  res.type = type;
  return res;
}
Tcc.prototype.set_symbol = function(symbol, value) {  // TODO: hold ref for value
  var buf = this.get_symbol(symbol).reinterpret(value.type.size);
  buf.type = value.type;
  ref.set(buf, 0, value.deref());
}
Tcc.prototype.set_function = function(symbol, cb) {   // TODO: hold ref for value
  ref.set(this.resolve_symbol(symbol, 'void *'), 0, cb);
}


/**
 * C function type.
 * wrapper for lazy evaluation of ffi.ForeignFunction
 */
function CFuncType(restype, args) {
  return function(pointer) {
    return ffi.ForeignFunction(pointer, restype, args);
  }
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
  var that = this;
  this.headerparts = [];
  this.parts = [];
  this.symbols = null;
  this.callables = [];
}

/**
 * Get C code of added declarations.
 */
InlineGenerator.prototype.code = function() {
  var top = this.headerparts.join('\n');
  var forward = this.parts.map(function(el){return el.forward;}).join('\n');
  var code = this.parts.map(function(el){return el.code;}).join('\n');
  return [
    '/* top */', top, '',
    '/* forward */', forward, '',
    '/* code */', code, ''
  ].join('\n');
}

/**
 * Add a declaration to the generator.
 */
InlineGenerator.prototype.add_declaration = function(decl) {
  if (typeof decl === 'function')
    decl = decl.declaration;
  if (!(decl instanceof Declaration))
    throw new Error('cannot add declaration');
  this.parts.push(decl);
}

/**
 * Add a topdeclaration to the generator.
 */
InlineGenerator.prototype.add_topdeclaration = function(decl) {
  this.headerparts.push(decl.code);
}

/**
 * Bind a tcc state to this generator.
 * Resolves any pending symbols from declarations.
 * NOTE: the tcc state must be compiled and relocated.  // TODO: test for relocate
 */
InlineGenerator.prototype.bind_state = function(state) {
  if (this.symbols)
    return this.symbols;
  var all_symbols = {};
  for (var i=0; i<this.parts.length; ++i) {
    if (this.parts[i].symbols.length)
      for (var j=0; j<this.parts[i].symbols.length; ++j) {
        var sym = this.parts[i].symbols[j];
        if (sym[0] instanceof FuncSymbol) {
          ref.set(state.resolve_symbol(sym[1], 'void *'), 0, sym[0].cb);
        } else {
          var resolved = state.resolve_symbol(sym[1], sym[0]);
          this.parts[i].symbols_resolved[sym[1]] = resolved;
          all_symbols[sym[1]] = resolved;
        }
      }
  }
  this.symbols = all_symbols;
  return all_symbols;
}

/**
 * FuncSymbol - thin wrapper of ffi.Callback 
 * needed to distingish type in `InlineGenerator.bind_state` for reverse symbol resolution of JS functions
 */
function FuncSymbol(restype, args, f) {
  if (!(this instanceof FuncSymbol))
    return new FuncSymbol(restype, args, f);
  this.cb = ffi.Callback(restype, args, f);
}

/**
 * Convenvient function to import a function symbol from JS to C code.
 */
function c_callable(restype, name, args, f) {
  return new Declaration(
    '',
    restype + ' ' + '(*' + name + ')(' + args.join(', ') + ') = 0;',
    [[new FuncSymbol(restype, args, f), name]]
  );
}

/**
 * Convenient function to create a C function in C useable from JS
 */
var c_function = function(restype, name, args, code) {
  var header = restype + ' ' + name + '(' + args.map(function(el){return el.join(' ')}).join(', ') + ')';
  var declaration = new Declaration(
    header + '\n{' + code + '}\n',
    header + ';',
    [[CFuncType(restype, args.map(function(el){return el[0];})), name]]
  );
  var func = function() {
    if (func.declaration.symbols_resolved[name])
      return func.declaration.symbols_resolved[name].apply(this, arguments);
    throw new Error('c_function "'+name+'" must be compiled and bound before usage');
  };
  func.declaration = declaration;
  return func;
}

module.exports.Tcc = Tcc;
module.exports.CFuncType = CFuncType;
module.exports.InlineGenerator = InlineGenerator;
module.exports.Declaration = Declaration;
module.exports.c_function = c_function;
module.exports.c_callable = c_callable;
