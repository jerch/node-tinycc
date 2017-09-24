Run inline C code on the fly.

Tested on:

- Linux with nodejs 6.11 64bit, gcc 4.8
- OSX 10.10 with nodejs 6.10, llvm 3.5 (Cave! TCC is not fully
ported to OSX, support is experimental!)

### Features

- inline C functions in JS
- JS callbacks in C
- struct and array support

### Usage

```javascript
const tcc = require('node-tinycc');

// create a code generator
let gen = tcc.InlineGenerator();
// create a compile state
let state = tcc.DefaultTcc();

// declare a C function
let c_func = tcc.c_function(
    'int',                          // return type
    'add',                          // function name in C
    [['int', 'a'], ['int', 'b']],   // parameters as [type, name]
    'return a + b + js_func(a, b);' // actual code
);
gen.add_declaration(c_func);

// add a JS function declaration to C
let js_func = tcc.c_callable(
    'int',                          // return type
    'js_func',                      // function name in C
    ['int', 'int'],                 // parameter types
    (a, b) => {return a * b;}       // function
);
gen.add_declaration(js_func);

// compile code and relocate
state.compile(gen.code());
state.relocate();

// resolve symbols between C and JS
gen.bind_state(state);

// now the C stuff is usable
console.log(c_func(23, 42));        // --> prints 1031
```
See tests for more usage examples.

### TODO

- Windows support