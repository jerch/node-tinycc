## node-tinycc

This node module let you embed and run C code on the fly
with the help of the Tiny C Compiler.

**NOTE**: This is early alpha and only tested under Linux.
Struct and array types are not supported yet.

### Usage

```javascript
const TinyCC = require('node-tinycc');

// create a code generator
let gen = TinyCC.InlineGenerator();
// create a compiler state
let state = TinyCC.DefaultTcc();

// declare a C function
let c_func = TinyCC.c_function(
    'int',                          // return type
    'add',                          // function name in C
    [['int', 'a'], ['int', 'b']],   // parameters as [type, name]
    'return a + b + js_func(a, b);' // actual code
);
gen.add_declaration(c_func);

// add a JS function declaration to C
let js_func = TinyCC.c_callable(
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

- struct and array type support
- Windows and OSX port
- more tests