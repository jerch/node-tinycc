'use strict';

const ffi = require('ffi');
const ref = require('ref');
const path = require('path');
const StructType = require('ref-struct');
const Tcc = require('./build/Release/tcc').TCC;

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
  if (type.name === 'StructType')
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
 * Set a C function pointer symbol to ffi.Callback.
 */
Tcc.prototype.setFunction = function(symbol, cb) {
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
 * A wrapper for lazy evaluation of ffi.ForeignFunction.
 */
function CFuncType(restype, args) {
  return (pointer) => ffi.ForeignFunction(pointer, restype, args);
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
 * Wrapper of ffi.Callback to distingish a function type in `bind_state`.
 */
function FuncSymbol(restype, args, f) {
  this.cb = ffi.Callback(restype, args, f);
}

/**
 * Convenvient function to import a function symbol from JS to C code.
 */
function c_callable(restype, name, args, f) {
  return new Declaration(
    '',
    `${restype} (*${name})(${args.join(', ')}) = 0;`,
    [[new FuncSymbol(restype, args, f), name]]
  );
}

// helper to resolve C name from StructType
function _type2c(type) {
  type = ref.coerceType(type);
  let typename = type.name;
  if (typename.startsWith('StructType')) {
    if (!type.prototype._name)
      throw new Error(`unkown C name for type ${type}`);
    typename = `struct ${typename.replace('StructType', type.prototype._name)}`;
  }
  return typename;
}

/**
 * Convenient function to create a C function useable from JS.
 */
function c_function(restype, name, args, code) {
  let header = `${_type2c(restype)} ${name}`;
  header += `(${args.map(([type, varname]) => `${_type2c(type)} ${varname}`).join(', ')})`;
  let declaration = new Declaration(
    header + `\n{\n${code}\n}\n`,
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
      let result = fields.map(
        // FIXME: declare member alignment
        (el) => `  ${_type2c(structType.fields[el].type)} ${el};`
      ).join('\n');
      return `struct __attribute__((aligned(${structType.alignment}))) ${name} {\n${result}\n};`;
    },
    `struct ${name};`,
    []
  );
  return structType;
}

module.exports.Tcc = Tcc;
module.exports.DefaultTcc = DefaultTcc;
module.exports.CFuncType = CFuncType;
module.exports.InlineGenerator = InlineGenerator;
module.exports.Declaration = Declaration;
module.exports.c_function = c_function;
module.exports.c_callable = c_callable;
module.exports.c_struct = c_struct;