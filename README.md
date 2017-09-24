## node-tinycc

This node module let you embed and run C code on the fly
with the help of the Tiny C Compiler.

**NOTE**: Linux only for now.

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

- Windows and OSX port