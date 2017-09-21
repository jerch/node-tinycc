/*
TODO:
  - use EventEmitter for compile steps
  - use ref.coerceType where appropriate
  - enhance InlineGenerator with struct and array functionality
 */
'use strict';

const ffi = require('ffi');
const ref = require('ref');
const path = require('path');

const Tcc = require('./build/Release/tcc').TCC;
Tcc.prototype.resolveSymbol = function(symbol, type) {
  // TODO: support array and struct
  if (typeof type === "function") {
    return type(this.getSymbol(symbol));
  }
  type = ref.coerceType(type);
  let res = this.getSymbol(symbol).reinterpret(type.size);
  res.type = type;
  return res;
};
Tcc.prototype.setSymbol = function(symbol, value) {
  let buf = this.getSymbol(symbol).reinterpret(value.type.size);
  buf.type = value.type;
  ref.set(buf, 0, value.deref());
};
Tcc.prototype.set_function = function(symbol, cb) {
  ref.set(this.resolveSymbol(symbol, 'void *'), 0, cb);
};

/**
 * Function to create a compiler state which defaults to bundled tcc.
 */
function DefaultTcc() {
    let state = new Tcc();
    state.setLibPath(path.join(__dirname, 'posix', 'lib', 'tcc'));
    state.addIncludePath(path.join(__dirname, 'posix', 'lib', 'tcc', 'include'));
    return state;
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
  this.headerparts = [];
  this.parts = [];
  this.symbols = null;
}

/**
 * Get C code of added declarations.
 */
InlineGenerator.prototype.code = function() {
  let top = this.headerparts.join('\n');
  let forward = this.parts.map(function(el){return el.forward;}).join('\n');
  let code = this.parts.map(function(el){return el.code;}).join('\n');
  return [
    '/* top */', top, '',
    '/* forward */', forward, '',
    '/* code */', code, ''
  ].join('\n');
};

/**
 * Add a declaration to the generator.
 */
InlineGenerator.prototype.add_declaration = function(decl) {
  if (typeof decl === 'function')
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
 * Bind a tcc state to this generator.
 * Resolves any pending symbols from declarations.
 * NOTE: the tcc state must be compiled and relocated.  // TODO: test for relocate
 */
InlineGenerator.prototype.bind_state = function(state) {
  if (this.symbols)
    return this.symbols;
  let all_symbols = {};
  for (let i=0; i<this.parts.length; ++i) {
    if (this.parts[i].symbols.length)
      for (let j=0; j<this.parts[i].symbols.length; ++j) {
        let sym = this.parts[i].symbols[j];
        if (sym[0] instanceof FuncSymbol) {
          ref.set(state.resolveSymbol(sym[1], 'void *'), 0, sym[0].cb);
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
 * FuncSymbol - thin wrapper of ffi.Callback 
 * needed to distingish type in `InlineGenerator.bind_state` for reverse symbol resolution
 * of JS functions
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
const c_function = function(restype, name, args, code) {
  let header = restype + ' ' + name + '(' + args.map(function(el){return el.join(' ')}).join(', ') + ')';
  let declaration = new Declaration(
    header + '\n{' + code + '}\n',
    header + ';',
    [[CFuncType(restype, args.map(function(el){return el[0];})), name]]
  );
  let func = function() {
    if (func.declaration.symbols_resolved[name])
      return func.declaration.symbols_resolved[name].apply(this, arguments);
    throw new Error('c_function "'+name+'" must be compiled and bound before usage');
  };
  func.declaration = declaration;
  return func;
};

module.exports.Tcc = Tcc;
module.exports.DefaultTcc = DefaultTcc;
module.exports.CFuncType = CFuncType;
module.exports.InlineGenerator = InlineGenerator;
module.exports.Declaration = Declaration;
module.exports.c_function = c_function;
module.exports.c_callable = c_callable;
