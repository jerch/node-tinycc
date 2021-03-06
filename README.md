Run inline C code on the fly.

Tested on:

- Linux with nodejs 6.11 64 bit, (gcc 4.8 on x86, gcc 6.3 on ARM)
- Windows 10 with nodejs 6.11 32 and 64 bit
- OSX 10.10 with nodejs 6.10, llvm 3.5 (Cave! TCC is not fully
ported to OSX, support is experimental!)

### Features

- inline C functions in JS
- JS callbacks in C
- wchar_t, struct and array support
- async compilation support

### Documentation

See the [API documentation](doc/api.md).

### Usage

```javascript
const tcc = require('node-tinycc');

// create a code generator
let gen = tcc.CodeGenerator();
// create a compile state
let state = tcc.DefaultTcc();

// declare a C function
let c_func = tcc.c_function(
    'int',                          // return type
    'add',                          // function name in C
    [['int', 'a'], ['int', 'b']],   // parameters as [type, name]
    'return a + b + js_func(a, b);' // actual code
);
gen.addDeclaration(c_func);

// add a JS function declaration to C
let js_func = tcc.c_callable(
    'int',                          // return type
    'js_func',                      // function name in C
    ['int', 'int'],                 // parameter types
    (a, b) => {return a * b;}       // function
);
gen.addDeclaration(js_func);

// compile code and relocate
state.compile(gen.code());
state.relocate();

// resolve symbols between C and JS
gen.bindState(state);

// now the C stuff is usable
console.log(c_func(23, 42));        // --> prints 1031
```
See demos and tests for more usage examples.
