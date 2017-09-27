<a name="module_node-tinycc"></a>

## node-tinycc
Tiny C Compiler binding for nodejs.

With this module it is possible to declare inline C code in nodejs
and run it on the fly. This is possible due to the fascinating
Tiny C Compiler originally made by Fabrice Bellard.

**Requires**: <code>module:node-gyp</code>, <code>module:ffi</code>, <code>module:ref</code>  
**Note**: The module is still alpha, interfaces are still likely to change a lot.  
**Example**  
```js
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

* [node-tinycc](#module_node-tinycc)
    * [.Tcc](#module_node-tinycc.Tcc)
        * [new Tcc(tcclib)](#new_module_node-tinycc.Tcc_new)
        * [.setOptions(option)](#module_node-tinycc.Tcc+setOptions)
        * [.setLibPath(path)](#module_node-tinycc.Tcc+setLibPath)
        * [.defineSymbol(symbol, [value])](#module_node-tinycc.Tcc+defineSymbol)
        * [.undefineSymbol(symbol)](#module_node-tinycc.Tcc+undefineSymbol)
        * [.addIncludePath(path)](#module_node-tinycc.Tcc+addIncludePath)
        * [.addLibrary(library)](#module_node-tinycc.Tcc+addLibrary)
        * [.addLibraryPath(path)](#module_node-tinycc.Tcc+addLibraryPath)
        * [.addFile(path)](#module_node-tinycc.Tcc+addFile)
        * [.compile(code)](#module_node-tinycc.Tcc+compile)
        * [.relocate()](#module_node-tinycc.Tcc+relocate)
        * [.addSymbol(symbol, value)](#module_node-tinycc.Tcc+addSymbol)
        * [.getSymbol(symbol)](#module_node-tinycc.Tcc+getSymbol) ⇒ <code>ref.refType</code> \| <code>null</code>
        * [.resolveSymbol(symbol, type)](#module_node-tinycc.Tcc+resolveSymbol) ⇒ <code>\*</code>
        * [.setSymbol(symbol, value)](#module_node-tinycc.Tcc+setSymbol)
        * [.getFunction(symbol, restype, args)](#module_node-tinycc.Tcc+getFunction) ⇒ <code>ffi.ForeignFunction</code>
        * [.setFunction(symbol, cb)](#module_node-tinycc.Tcc+setFunction)
    * [.FuncSymbol](#module_node-tinycc.FuncSymbol)
        * [new FuncSymbol(restype, args, f)](#new_module_node-tinycc.FuncSymbol_new)
    * [.Declaration](#module_node-tinycc.Declaration)
        * [new Declaration(code, [forward], [symbols])](#new_module_node-tinycc.Declaration_new)
    * [.CodeGenerator](#module_node-tinycc.CodeGenerator)
        * [new CodeGenerator()](#new_module_node-tinycc.CodeGenerator_new)
        * [.loadBasicTypes()](#module_node-tinycc.CodeGenerator+loadBasicTypes)
        * [.code()](#module_node-tinycc.CodeGenerator+code) ⇒ <code>string</code>
        * [.codeWithLineNumbers()](#module_node-tinycc.CodeGenerator+codeWithLineNumbers) ⇒ <code>string</code>
        * [.addDeclaration(decl)](#module_node-tinycc.CodeGenerator+addDeclaration)
        * [.addTopDeclaration(decl)](#module_node-tinycc.CodeGenerator+addTopDeclaration)
        * [.bindState(state)](#module_node-tinycc.CodeGenerator+bindState) ⇒ <code>object</code>
    * [.WCString(s)](#module_node-tinycc.WCString) ⇒ <code>WCString</code>
    * [.escapeWchar(s)](#module_node-tinycc.escapeWchar) ⇒ <code>string</code>
    * [.DefaultTcc()](#module_node-tinycc.DefaultTcc) ⇒ [<code>Tcc</code>](#module_node-tinycc.Tcc)
    * [.CFuncType(restype, args)](#module_node-tinycc.CFuncType) ⇒ <code>function</code>
    * [.c_callable(restype, name, args, f)](#module_node-tinycc.c_callable) ⇒ <code>Declaration</code>
    * [.c_function(restype, name, args, code)](#module_node-tinycc.c_function) ⇒ <code>func</code>
    * [.c_struct(name, structType)](#module_node-tinycc.c_struct) ⇒ <code>StructType</code>

<a name="module_node-tinycc.Tcc"></a>

### tcc.Tcc
The Tcc class provides low level access to the libtcc-API
of the Tiny C Compiler (TCC).

**Kind**: static class of [<code>node-tinycc</code>](#module_node-tinycc)  
**Note**: On Windows this class is constructed in Javascript
with `ffi` from a precompiled libtcc.dll delivered with this module.
On POSIX systems the class is a C++ class build in a native extension.  

* [.Tcc](#module_node-tinycc.Tcc)
    * [new Tcc(tcclib)](#new_module_node-tinycc.Tcc_new)
    * [.setOptions(option)](#module_node-tinycc.Tcc+setOptions)
    * [.setLibPath(path)](#module_node-tinycc.Tcc+setLibPath)
    * [.defineSymbol(symbol, [value])](#module_node-tinycc.Tcc+defineSymbol)
    * [.undefineSymbol(symbol)](#module_node-tinycc.Tcc+undefineSymbol)
    * [.addIncludePath(path)](#module_node-tinycc.Tcc+addIncludePath)
    * [.addLibrary(library)](#module_node-tinycc.Tcc+addLibrary)
    * [.addLibraryPath(path)](#module_node-tinycc.Tcc+addLibraryPath)
    * [.addFile(path)](#module_node-tinycc.Tcc+addFile)
    * [.compile(code)](#module_node-tinycc.Tcc+compile)
    * [.relocate()](#module_node-tinycc.Tcc+relocate)
    * [.addSymbol(symbol, value)](#module_node-tinycc.Tcc+addSymbol)
    * [.getSymbol(symbol)](#module_node-tinycc.Tcc+getSymbol) ⇒ <code>ref.refType</code> \| <code>null</code>
    * [.resolveSymbol(symbol, type)](#module_node-tinycc.Tcc+resolveSymbol) ⇒ <code>\*</code>
    * [.setSymbol(symbol, value)](#module_node-tinycc.Tcc+setSymbol)
    * [.getFunction(symbol, restype, args)](#module_node-tinycc.Tcc+getFunction) ⇒ <code>ffi.ForeignFunction</code>
    * [.setFunction(symbol, cb)](#module_node-tinycc.Tcc+setFunction)

<a name="new_module_node-tinycc.Tcc_new"></a>

#### new Tcc(tcclib)

| Param |
| --- |
| tcclib | 

<a name="module_node-tinycc.Tcc+setOptions"></a>

#### state.setOptions(option)
Set command line options of TCC. Run `tcc -hh` to see known options.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| option | <code>string</code> | 

<a name="module_node-tinycc.Tcc+setLibPath"></a>

#### state.setLibPath(path)
Set TCC library path. For `DefaultTcc` this is set to the bundled TCC.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="module_node-tinycc.Tcc+defineSymbol"></a>

#### state.defineSymbol(symbol, [value])
Define a preprocessor symbol.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| symbol | <code>string</code> | 
| [value] | <code>string</code> | 

<a name="module_node-tinycc.Tcc+undefineSymbol"></a>

#### state.undefineSymbol(symbol)
Undefine a preprocessor symbol.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| symbol | <code>string</code> | 

<a name="module_node-tinycc.Tcc+addIncludePath"></a>

#### state.addIncludePath(path)
Add include path.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="module_node-tinycc.Tcc+addLibrary"></a>

#### state.addLibrary(library)
Add a library (same name as -l...).

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| library | <code>string</code> | 

<a name="module_node-tinycc.Tcc+addLibraryPath"></a>

#### state.addLibraryPath(path)
Add a library path. Equivalent to -Lpath option.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="module_node-tinycc.Tcc+addFile"></a>

#### state.addFile(path)
Add a file to compilation.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  
**Fixme**: missing filetype parameter  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 

<a name="module_node-tinycc.Tcc+compile"></a>

#### state.compile(code)
Compile source code.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| code | <code>string</code> | 

<a name="module_node-tinycc.Tcc+relocate"></a>

#### state.relocate()
Relocate after compilation. This is needed before
resolving any symbols.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  
<a name="module_node-tinycc.Tcc+addSymbol"></a>

#### state.addSymbol(symbol, value)
Add a symbol to the compiled program.
This is not reliable on all architectures (likely to segfault on ARM).
Use with caution.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| symbol | <code>string</code> | 
| value | <code>ref.refType</code> | 

<a name="module_node-tinycc.Tcc+getSymbol"></a>

#### state.getSymbol(symbol) ⇒ <code>ref.refType</code> \| <code>null</code>
Get a symbol from the program. Returns void pointer or `null` of not found.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type |
| --- | --- |
| symbol | <code>string</code> | 

<a name="module_node-tinycc.Tcc+resolveSymbol"></a>

#### state.resolveSymbol(symbol, type) ⇒ <code>\*</code>
Resolve a C symbol name as type for further
usage in Javascript.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  
**Note**: This is done automatically for known symbols
in `CodeGenerator.bindState`.  

| Param | Type | Description |
| --- | --- | --- |
| symbol | <code>string</code> | symbol name |
| type | <code>string</code> \| <code>object</code> | known type of `ref.types` |

<a name="module_node-tinycc.Tcc+setSymbol"></a>

#### state.setSymbol(symbol, value)
Low level function to set the value of a C symbol.
Since all toplevel symbols are exported as void pointers,
the value must be a pointer type.
The referenced type of value has to match the C type of the
symbol, otherwise arbitrary memory will be overwritten.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type | Description |
| --- | --- | --- |
| symbol | <code>string</code> | symbol name |
| value | <code>ref.refType</code> |  |

<a name="module_node-tinycc.Tcc+getFunction"></a>

#### state.getFunction(symbol, restype, args) ⇒ <code>ffi.ForeignFunction</code>
Resolve a C symbol name as function type.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type | Description |
| --- | --- | --- |
| symbol | <code>string</code> | symbol name |
| restype | <code>string</code> \| <code>object</code> | known type of `ref.types` |
| args | <code>array</code> | array of parameter types |

<a name="module_node-tinycc.Tcc+setFunction"></a>

#### state.setFunction(symbol, cb)
Set a C function pointer symbol to a Javascript callback.
The callback must be a `ffi.Callback` matching the function
pointer type.

**Kind**: instance method of [<code>Tcc</code>](#module_node-tinycc.Tcc)  

| Param | Type | Description |
| --- | --- | --- |
| symbol | <code>string</code> | symbol name |
| cb | <code>ffi.Callback</code> | Javascript callback |

<a name="module_node-tinycc.FuncSymbol"></a>

### tcc.FuncSymbol
**Kind**: static class of [<code>node-tinycc</code>](#module_node-tinycc)  
<a name="new_module_node-tinycc.FuncSymbol_new"></a>

#### new FuncSymbol(restype, args, f)
Internal wrapper for ffi.Callback to distingish a function type in
`CodeGenerator.bindState`. It also holds a reference of
the callback to avoid early garbage collection.


| Param | Type | Description |
| --- | --- | --- |
| restype | <code>string</code> \| <code>object</code> | known type of `ref.types` |
| args | <code>array</code> | array of parameter types |
| f | <code>function</code> | callback function |

<a name="module_node-tinycc.Declaration"></a>

### tcc.Declaration
**Kind**: static class of [<code>node-tinycc</code>](#module_node-tinycc)  
<a name="new_module_node-tinycc.Declaration_new"></a>

#### new Declaration(code, [forward], [symbols])
Base object for all declarations to be used with CodeGenerator.
If the standard convenient functions do not suit your needs you can
create a customized declaration with this base object and still use
the code generator.
Add the returned declaration to a generator with `addDeclaration`.
After the symbols got mapped by `CodeGenerator.bindState` you can
access them via the attribute `.symbols_resolved`.


| Param | Type | Description |
| --- | --- | --- |
| code | <code>string</code> \| <code>function</code> | C source as string or a function                                  returning the source code string |
| [forward] | <code>string</code> | optional forward declaration |
| [symbols] | <code>array</code> | optional array of [type, symbol name]                           to be autoresolved by the generator |

**Example**  
```js
let declaration = new tcc.Declaration(
    `  // code
    int x = 1;
    int func_a() { return func_b() + 1; }
    int func_b() { return 0; }
    `,
    `  // forward
    int func_a();
    int func_b();
    `,
    [  // symbols
        ['int', 'x'],
        [tcc.CFuncType('int', []), 'func_a'],
        [tcc.CFuncType('int', []), 'func_b']
    ]);
```
<a name="module_node-tinycc.CodeGenerator"></a>

### tcc.CodeGenerator
**Kind**: static class of [<code>node-tinycc</code>](#module_node-tinycc)  

* [.CodeGenerator](#module_node-tinycc.CodeGenerator)
    * [new CodeGenerator()](#new_module_node-tinycc.CodeGenerator_new)
    * [.loadBasicTypes()](#module_node-tinycc.CodeGenerator+loadBasicTypes)
    * [.code()](#module_node-tinycc.CodeGenerator+code) ⇒ <code>string</code>
    * [.codeWithLineNumbers()](#module_node-tinycc.CodeGenerator+codeWithLineNumbers) ⇒ <code>string</code>
    * [.addDeclaration(decl)](#module_node-tinycc.CodeGenerator+addDeclaration)
    * [.addTopDeclaration(decl)](#module_node-tinycc.CodeGenerator+addTopDeclaration)
    * [.bindState(state)](#module_node-tinycc.CodeGenerator+bindState) ⇒ <code>object</code>

<a name="new_module_node-tinycc.CodeGenerator_new"></a>

#### new CodeGenerator()
Code generator for inline C in Javascript.

The code generator creates the final source code
by putting together single declarations. The structure
of the final source code is the following:

- top section: The section gets not autofilled by the generator.
  Use it with `addTopDeclaration` for any early stuff
  like including header files and such.
- forward section: Used by the generator to do forward declarations.
  Any content in `Declaration.forward` will end up here.
- code section: Used by the generator to place the code definitions.

To add content to the sections call `addDeclaration` or
`addTopDeclaration` for the top section.
The order of added content is preserved, this is esp. important
of you omit forward declarations.

Example usage:
```js
let gen = tcc.CodeGenerator();
gen.addTopDeclaration(
  tcc.Declaration('#include <stdio.h')
);
gen.addDeclaration(
  tcc.Declaration(
    'void func() { printf("Hello World!\n"); }',
    'void func();',
    [[tcc.CFuncType('void', []), 'func']]
  )
);
```
With `code()` you can grab the generated code,
`codeWithLineNumbers()` might help to debug the code
if tcc will not compile it.

If you are done adding declarations it is time to compile everything:
```js
let state = tcc.DefaultTcc();
state.compile(gen.code());
state.relocate();
```
The final step before we can use the compiled code is to resolve
and bind all defined symbols of the declarations. This is done by calling
`bindState`:
```js
let resolved_symbols = gen.bindState(state);
```
Now we can use the `func` symbol:
```js
resolved_symbols.func();
```

<a name="module_node-tinycc.CodeGenerator+loadBasicTypes"></a>

#### gen.loadBasicTypes()
Add declarations for the common types of `ref.types`.
Some of the known types of the ref module differ from typical
C naming (e.g. `int8` instead of `int8_t`).
This function adds additional typedefs to solve naming issues.
It adds the following types:

| Type      | Typedef of         |
|-----------|--------------------|
| int8      | int8_t             |
| int16     | int16_t            |
| int32     | int32_t            |
| int64     | int64_t            |
| uint8     | uint8_t            |
| uint16    | uint16_t           |
| uint32    | uint32_t           |
| uint64    | uint64_t           |
| Object    | void *             |
| CString   | char *             |
| byte      | unsigned char      |
| uchar     | unsigned char      |
| ushort    | unsigned short     |
| uint      | unsigned int       |
| ulong     | unsigned long      |
| longlong  | long long          |
| ulonglong | unsigned long long |

Furthermore it includes `<stddef.h>`, `<stdint.h>` and `<stdbool.h>`.
If the module `ref-wchar` is installed, `WCString` is typedef'd as
`wchar_t` pointer.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  
<a name="module_node-tinycc.CodeGenerator+code"></a>

#### gen.code() ⇒ <code>string</code>
Get the generated code.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  
<a name="module_node-tinycc.CodeGenerator+codeWithLineNumbers"></a>

#### gen.codeWithLineNumbers() ⇒ <code>string</code>
Get the generated code with leading line numbers.
This is useful for limited debugging.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  
<a name="module_node-tinycc.CodeGenerator+addDeclaration"></a>

#### gen.addDeclaration(decl)
Add a declaration to the generator.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  

| Param | Type | Description |
| --- | --- | --- |
| decl | <code>Declaration</code> | declaration to be added |

<a name="module_node-tinycc.CodeGenerator+addTopDeclaration"></a>

#### gen.addTopDeclaration(decl)
Add a declaration to the top section. `forward` and `symbols`
will be ignored for declarations added to the top section.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  

| Param | Type | Description |
| --- | --- | --- |
| decl | <code>Declaration</code> | declaration to be added |

<a name="module_node-tinycc.CodeGenerator+bindState"></a>

#### gen.bindState(state) ⇒ <code>object</code>
Resolve symbols between C and Javascript. Call this after
compilation and relocation before using any C stuff.

The function traverses all symbol names of the added
declarations and tries to attach the given type.

Returns an object with all symbol names mapping to the
corresponding type.

**Kind**: instance method of [<code>CodeGenerator</code>](#module_node-tinycc.CodeGenerator)  

| Param | Type | Description |
| --- | --- | --- |
| state | <code>Tcc</code> | state to bind to symbols |

<a name="module_node-tinycc.WCString"></a>

### tcc.WCString(s) ⇒ <code>WCString</code>
Helper function for easy wide string creation.

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  
**Note**: The function is only exported, if the module `ref-wchar` is installed.  

| Param | Type |
| --- | --- |
| s | <code>string</code> | 

<a name="module_node-tinycc.escapeWchar"></a>

### tcc.escapeWchar(s) ⇒ <code>string</code>
Helper function to escape wide character string literals.
This is useful when writing C source code strings directly in Javascript.
The function escapes the UTF-8 input to the appropriate wchar_t type.

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  
**Note**: The function is only exported, if the module `ref-wchar` is installed.  

| Param | Type |
| --- | --- |
| s | <code>string</code> | 

**Example**  
```js
> tcc.escapeWchar('öäü')
'\\xf6\\xe4\\xfc'
> `wchar_t *w = L"${tcc.escapeWchar('öäü')}";`
'wchar_t *w = L"\\xf6\\xe4\\xfc";'
```
<a name="module_node-tinycc.DefaultTcc"></a>

### tcc.DefaultTcc() ⇒ [<code>Tcc</code>](#module_node-tinycc.Tcc)
Helper function to create a compile state with the bundled tcc.
The function sets the tcclib and include path to the the platform
dependent tcc folders.

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  
<a name="module_node-tinycc.CFuncType"></a>

### tcc.CFuncType(restype, args) ⇒ <code>function</code>
Wrapper for lazy evaluation of a ffi.ForeignFunction.
This is needed to postpone the creation of a ffi.ForeignFunction
until we got the real C symbol pointer.

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  

| Param | Type | Description |
| --- | --- | --- |
| restype | <code>string</code> \| <code>object</code> | known type of `ref.types` |
| args | <code>array</code> | array of parameter types |

<a name="module_node-tinycc.c_callable"></a>

### tcc.c_callable(restype, name, args, f) ⇒ <code>Declaration</code>
Convenvient declaration function to import a function symbol from JS to C code.

The function creates a function pointer declaration in C. After
calling `CodeGenerator.bindState` the function pointer can be used
in C. Example usage:
```js
let callback = tcc.c_callable('int', 'jsfunc', ['int', 'int'], (a, b) => a+b);
// use somewhere in C code
let decl = tcc.Declaration('int test(int x) { return a * jsfunc(23, 42); }');
gen.addDeclaration(callback);
gen.addDeclaration(decl);
...
```

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  

| Param | Type | Description |
| --- | --- | --- |
| restype | <code>string</code> \| <code>object</code> | known type of `ref.types` |
| name | <code>string</code> | function pointer name |
| args | <code>array</code> | array of parameter types |
| f | <code>function</code> | Javascript function |

<a name="module_node-tinycc.c_function"></a>

### tcc.c_function(restype, name, args, code) ⇒ <code>func</code>
Convenient declaration function to create a C function that is usable from Javascript.

The Javascript code:
```js
tcc.c_function('int', 'add', [['int', 'a'], ['int', 'b']], 'return a+b;');
```
will roughly translate to this C source code:
```C
int add(int a, int b) { return a+b; }
```
Note that the first 3 arguments of `c_function` almost read like the C function header.
Additionally the C function will have a forward declaration to use it from
any other C code within the same compile state.

Returns a proxy function, that automatically resolves to the underlying
C function. The actual declaration object resides under `.declaration`.
Full usage example:
```js
let add = tcc.c_function('int', 'add', [['int', 'a'], ['int', 'b']], 'return a+b;');
let gen = tcc.CodeGenerator();
gen.addDeclaration(add);
let state = tcc.DefaultTcc();
state.compile(gen.code());
state.relocate();
gen.bindState(state);
console.log(add(23, 42));  // use it
```

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  
**Returns**: <code>func</code> - proxy function  

| Param | Type | Description |
| --- | --- | --- |
| restype | <code>string</code> \| <code>object</code> | known type of `ref.types` |
| name | <code>string</code> | function pointer name |
| args | <code>array</code> | array of [type, parameter name] |
| code | <code>string</code> | C function body |

<a name="module_node-tinycc.c_struct"></a>

### tcc.c_struct(name, structType) ⇒ <code>StructType</code>
Convenient declaration function to declare a struct type usable in C and Javascript.

This function extracts the field names and types of a StructType (module `ref-struct`)
to create a struct declaration (forward section) and definition for C (code section).
A field type is resolved recursively to catch complicated type mixtures that
can easily be build with  StructTypes, ArrayTypes and pointer types
(e.g. `struct XY *(*a[2])[10];`).
No typedef declaration is added for the struct, therefore always reference the
struct type by `struct name` in C. The struct type can be used at any point where
a `ref.types` type is needed, e.g. as function parameter or return type.
Usage example:
```js
const StructType = require('ref-struct');
let gen = tcc.CodeGenerator();
let S = tcc.c_struct('S', StructType({a: 'int', b: 'char*'}));
addDeclaration(S);
```
The struct of the example will roughly translate to this C code
(beside some more alignment directives):
```C
struct S {
    int a;
    char (*b);
};
```
`c_struct` finalizes a `StructType`, i.e. no more fields can be added afterwards.
To build a struct type with a pointer to itself (e.g. for linked lists),
build the StructType without that field beforehand and use the
`StructType.defineProperty` to declare the self pointer member. Decorate the struct
type afterwards with `c_struct`:
```js
let S = StructType();
S.defineProperty('self', S);
c_struct('S', S);  // defineProperty not allowed after this
```

**Kind**: static method of [<code>node-tinycc</code>](#module_node-tinycc)  
**Returns**: <code>StructType</code> - structType decorated with declaration object  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | struct type name in C |
| structType | <code>StructType</code> | structType to be declared in C |

