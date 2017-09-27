const tcc = require('../index');
const ref = require('ref');
const StructType = require('ref-struct');
const ArrayType = require('ref-array');
const wchar_t = require('ref-wchar');
const assert = require('assert');

describe('TCC tests', function() {
  describe('basic tests', function() {
    let state;
    beforeEach(function(){
      state = tcc.DefaultTcc();
      state.setOptions('-Wall');
    });
    it('compile & run', function(){
      state.compile('int main(int argc, char *argv[]) {return 123;}');
      assert.equal(state.run(0, null), 123);
    });
    it('resolve C symbol', function(){
      state.compile('int x = 123;');
      state.relocate();
      let x = state.resolveSymbol('x', 'int');
      assert.equal(x.deref(), 123);
    });
    it('set C symbol value', function(){
      state.compile('int x = 123;');
      state.relocate();
      state.setSymbol('x', ref.alloc('int', 999));
      let x = state.resolveSymbol('x', 'int');
      assert.equal(x.deref(), 999);
    });
    it('change C symbol value', function(){
      state.compile('int x = 123;');
      state.relocate();
      let x = state.resolveSymbol('x', 'int');
      ref.set(x, 0, 999);
      let x2 = state.resolveSymbol('x', 'int');
      assert.equal(x2.deref(), 999);
    });
    it('resolve & run C function', function(){
      state.compile('int test(int a){return a+1;}');
      state.relocate();
      let func = state.resolveSymbol('test', tcc.CFuncType('int', ['int']));
      assert.equal(func(1), 2);
    });
    it('resolve & run JS callback', function(){
      let code = '';
      code += '#include <stdio.h>\n';
      code += 'int (*callback)(int, int) = NULL;';
      code += 'int use_callback() {return (callback) ? callback(23, 42) : -1;}';
      state.compile(code);
      state.relocate();
      let func = state.resolveSymbol('use_callback', tcc.CFuncType('int', []));
      assert.equal(func(), -1);
      state.setFunction(
          'callback',
          tcc.Callback('int', ['int', 'int'], function(a, b) { return a+b; }));
      assert.equal(func(), 65);
    });
  });
  describe('inline code generator', function(){
    let state;
    let gen;
    beforeEach(function(){
      state = tcc.DefaultTcc();
      state.setOptions('-Wall');
      gen = tcc.InlineGenerator();
    });
    it('support basic types from ref module', function() {
      gen.loadBasicTypes();
      let code = '';
      code +='void foo(void) {};';
      code +='int8      a;';
      code +='uint8     b;';
      code +='int16     c;';
      code +='uint16    d;';
      code +='int32     e;';
      code +='uint32    f;';
      code +='int64     g;';
      code +='uint64    h;';
      code +='float     i;';
      code +='double    j;';
      code +='Object    k;';
      code +='CString   l;';
      code +='bool      m;';
      code +='byte      n;';
      code +='char      o;';
      code +='uchar     p;';
      code +='short     q;';
      code +='ushort    r;';
      code +='int       s;';
      code +='uint      t;';
      code +='long      u;';
      code +='ulong     v;';
      code +='longlong  w;';
      code +='ulonglong x;';
      code +='size_t    y;';
      gen.add_declaration(tcc.Declaration(code));
      assert.equal(state.compile(gen.code()), 0);
    });
    it('add declaration', function(){
      let decl1 = tcc.Declaration('int test1 = 123;', 'int test1;');
      let decl2 = tcc.Declaration('float test2 = 1.23;', 'float test2;');
      gen.add_declaration(decl1);
      gen.add_declaration(decl2);
      gen.add_topdeclaration(tcc.Declaration('#include <stdio.h>'));
      let expected = `/* top */
#include <stdio.h>

/* forward */
int test1;
float test2;

/* code */
int test1 = 123;
float test2 = 1.23;
`;
      assert.equal(gen.code(), expected);
      let withLineNumber = ` 1: /* top */
 2: #include <stdio.h>
 3: 
 4: /* forward */
 5: int test1;
 6: float test2;
 7: 
 8: /* code */
 9: int test1 = 123;
10: float test2 = 1.23;
11: `;
      assert.equal(gen.codeWithLineNumbers(), withLineNumber);
    });
    it('resolve symbol from declaration', function(){
      let decl = tcc.Declaration(
          'int test1 = 123;\ndouble test2 = 1.23;',
          '',
          [['int', 'test1'], ['double', 'test2']]);
      gen.add_declaration(decl);
      state.compile(gen.code());
      state.relocate();
      let symbols = gen.bind_state(state);
      assert.equal(symbols.test1.deref(), 123);
      assert.equal(symbols.test2.deref(), 1.23);
    });
    it('c_function generation & invocation', function() {
      let fibonacci = tcc.c_function('int', 'fibonacci', [['int', 'a']],
      `    
          int last, next_to_last, result = 0;
          if(a <= 2)
              return 1;
          last = next_to_last = 1;
          for(int i=2; i<a; ++i) {
              result = last + next_to_last;
              next_to_last = last;
              last = result;
          }
          return result;
      `
      );
      assert.throws(function(){fibonacci(10);}, Error);
      gen.add_declaration(fibonacci);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      assert.equal(fibonacci(10), 55);
    });
    it('JS function from C', function(){
      let add = function(a, b) { return a+b; };
      let fromJS = tcc.c_callable('int', 'add', ['int', 'int'], add);
      gen.add_declaration(fromJS);
      let use = tcc.c_function('int', 'use', [['int', 'a'], ['int', 'b']], 'return add(a, b);');
      gen.add_declaration(use);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      assert.equal(use(23, 42), 65);
    });
  });
  describe('c declarations', function() {
      it('int a', function() {
        assert.equal(tcc._var_decl('a', 'int'), 'int a');
      });
      it('int *a', function() {
        assert.equal(tcc._var_decl('a', 'int*'), 'int (*a)');
      });
      it('int **a', function() {
        assert.equal(tcc._var_decl('a', 'int**'), 'int (*(*a))');
      });
      it('int a[]', function() {
        assert.equal(tcc._var_decl('a', ArrayType('int')), 'int (a[])');
      });
      it('int a[5]', function() {
        assert.equal(tcc._var_decl('a', ArrayType('int', 5)), 'int (a[5])');
      });
      it('int *a[]', function() {
        assert.equal(tcc._var_decl('a', ArrayType(ref.refType('int'))), 'int (*(a[]))');
      });
      it('int *a[5]', function() {
        assert.equal(tcc._var_decl('a', ArrayType(ref.refType('int'), 5)), 'int (*(a[5]))');
      });
      it('int (*a)[5]', function() {
        assert.equal(tcc._var_decl('a', ref.refType(ArrayType('int', 5))), 'int ((*a)[5])');
      });
      it('int a[][]', function() {
        assert.equal(tcc._var_decl('a', ArrayType(ArrayType('int'))), 'int ((a[])[])');
      });
      it('int a[2][5]', function() {
        assert.equal(tcc._var_decl('a', ArrayType(ArrayType('int', 5), 2)), 'int ((a[2])[5])');
      });
      it('int *a[2][5]', function() {
        assert.equal(tcc._var_decl('a', ArrayType(ArrayType(ref.refType('int'), 5), 2)),
          'int (*((a[2])[5]))');
      });
      it('struct T t', function() {
        assert.equal(tcc._var_decl('t', tcc.c_struct('T', StructType())), 'struct T t');
      });
      it('struct T *t', function() {
        assert.equal(tcc._var_decl('t', ref.refType(tcc.c_struct('T', StructType()))), 'struct T (*t)');
      });
      it('struct T t[]', function() {
        let A = ArrayType(tcc.c_struct('T', StructType({a: 'int'})));
        assert.equal(tcc._var_decl('t', A), 'struct T (t[])');
      });
      it('struct T t[5]', function() {
        let A = ArrayType(tcc.c_struct('T', StructType({a: 'int'})), 5);
        assert.equal(tcc._var_decl('t', A), 'struct T (t[5])');
      });
      it('void a()', function() {
        assert.equal(tcc._func_decl('void', 'a', []), 'void a()');
      });
      it('int a(int x, int y)', function() {
        assert.equal(tcc._func_decl('int', 'a', [['int', 'x'], ['int', 'y']]), 'int a(int x, int y)');
      });
      it('int* a(char* x)', function() {
        assert.equal(tcc._func_decl('int*', 'a', [['char*', 'x']]), 'int* a(char (*x))');
      });
      it('int** a(char** x, char** y)', function() {
        assert.equal(tcc._func_decl('int**', 'a', [['char**', 'x'], ['char**', 'y']]),
            'int** a(char (*(*x)), char (*(*y)))');
      });
      it('struct T* a(struct T t)', function() {
        let T = tcc.c_struct('T', StructType());
        assert.equal(tcc._func_decl(ref.refType(T), 'a', [[T, 't']]),
            'struct T* a(struct T t)');
      });
      it('void a(struct T** t)', function() {
        let T = tcc.c_struct('T', StructType());
        assert.equal(tcc._func_decl('void', 'a', [[ref.refType(ref.refType(T)), 't']]),
            'void a(struct T (*(*t)))');
      });
      it('void (*a)()', function() {
        assert.equal(tcc._func_decl('void', 'a', [], true), 'void (*a)()');
      });
      it('int (*a)(int, int)', function() {
        assert.equal(tcc._func_decl('int', 'a', ['int', 'int'], true), 'int (*a)(int , int )');
      });
      it('int* (*a)(char*)', function() {
        assert.equal(tcc._func_decl('int*', 'a', ['char*'], true), 'int* (*a)(char (*))');
      });
      it('int** (*a)(char**, char**)', function() {
        assert.equal(tcc._func_decl('int**', 'a', ['char**', 'char**'], true),
            'int** (*a)(char (*(*)), char (*(*)))');
      });
      it('struct T* (*a)(struct T)', function() {
        let T = tcc.c_struct('T', StructType());
        assert.equal(tcc._func_decl(ref.refType(T), 'a', [T], true),
            'struct T* (*a)(struct T )');
      });
      it('void (*a)(struct T**)', function() {
        let T = tcc.c_struct('T', StructType());
        assert.equal(tcc._func_decl('void', 'a', [ref.refType(ref.refType(T))], true),
            'void (*a)(struct T (*(*)))');
      });
      it('struct T** (*test)(struct T *(*[5])[10])', function() {
        let T = tcc.c_struct('T', StructType({a: 'int'}));
        let A1 = ArrayType(ref.refType(T), 10);
        let A2 = ArrayType(ref.refType(A1), 5);
        assert.equal(tcc._func_decl(ref.refType(ref.refType(T)), 'test', [A2], true),
            'struct T** (*test)(struct T (*((*([5]))[10])))');
      });
  });
  describe('struct tests', function() {
    let state;
    beforeEach(function(){
      state = tcc.DefaultTcc();
      state.setOptions('-Wall');
    });
    it('declare simple struct', function() {
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      assert.equal(S.declaration.forward, 'struct S;');
      assert.equal(S.declaration.code(),
        'struct __attribute__((aligned('+ S.alignment +'))) S {\n  int a;\n};'
      );
    });
    it('declare struct with struct member', function() {
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      let T = tcc.c_struct('T', StructType({a: S}));
      assert.equal(T.declaration.code(),
        'struct __attribute__((aligned('+ S.alignment +'))) T {\n  struct S a;\n};'
      );
    });
    it('declare struct with self pointer', function() {
      let S = StructType({});
      S.defineProperty('self', ref.refType(S));
      assert.equal(tcc.c_struct('S', S).declaration.code(),
        'struct __attribute__((aligned('+ S.alignment +'))) S {\n  struct S (*self);\n};'
      );
    });
    it('resolve and set struct member', function() {
      state.compile('struct S { int a; };struct S s = {123};');
      state.relocate();
      let S = StructType({a: 'int'});
      let s = state.resolveSymbol('s', S);
      assert.equal(s.a, 123);
      s.a = 999;
      s = state.resolveSymbol('s', S);
      assert.equal(s.a, 999);
    });
    it('generate, resolve and set struct member', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      gen.add_declaration(tcc.Declaration('struct S s = {123};'));
      state.compile(gen.code());
      state.relocate();
      let s = state.resolveSymbol('s', S);
      assert.equal(s.a, 123);
      s.a = 999;
      s = state.resolveSymbol('s', S);
      assert.equal(s.a, 999);
    });
    it('struct as c_parameter', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let add = tcc.c_function('int', 'add', [[S, 'a'], [S, 'b']], 'return a.a + b.a;');
      gen.add_declaration(add);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      assert.equal(add(S({a: 23}), S({a: 42})), 65);
    });
    it('struct pointer as c_function parameter', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let add = tcc.c_function('int', 'add', [[ref.refType(S), 'a'], [S, 'b']], 'return a->a + b.a;');
      gen.add_declaration(add);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let s = S({a: 23});
      assert.equal(add(s.ref(), S({a: 42})), 65);
    });
    it('struct as c_function return value', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let add = tcc.c_function(S, 'add', [[S, 'a'], [S, 'b']], 'return (struct S) {a.a + b.a};');
      gen.add_declaration(add);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let result = add(S({a: 23}), S({a: 42}));
      assert.equal(result instanceof S, true);
      assert.equal(result.a, 65);
    });
    it('struct pointer as c_function return value', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let add = tcc.c_function(ref.refType(S), 'add', [[ref.refType(S), 'a'], [S, 'b']],
        'a->a += b.a;\nreturn a;');
      gen.add_declaration(add);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let s = S({a: 23});
      let result = add(s.ref(), S({a: 42}));
      assert.equal(result.deref() instanceof S, true);
      assert.equal(result.deref().a, 65);
    });
    it('struct as c_callable return value', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let obj = new S({a: 123});
      let js_func = function() { return obj; };
      let fromJS = tcc.c_callable(S, 'js_func', [], js_func);
      gen.add_declaration(fromJS);
      let use = tcc.c_function(S, 'use', [], 'return js_func();');
      gen.add_declaration(use);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let result = use();
      assert.equal(result instanceof S, true);
      assert.equal(result.a, 123);
    });
    it('struct pointer as c_callable return value', function() {
      let gen = tcc.InlineGenerator();
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let obj = new S({a: 123});
      let js_func = function() { return obj.ref(); };
      let fromJS = tcc.c_callable(ref.refType(S), 'js_func', [], js_func);
      gen.add_declaration(fromJS);
      let use = tcc.c_function(ref.refType(S), 'use', [],
      `
        // change value of a
        struct S *obj = js_func();
        obj->a = 999;
        return obj;
      `
      );
      gen.add_declaration(use);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let result = use();
      assert.equal(result.deref() instanceof S, true);
      assert.equal(result.deref().a, 999);
      assert.equal(result.address(), obj.ref().address());
    });
    it('alignment', function() {
      let gen = tcc.InlineGenerator();
      gen.loadBasicTypes();
      gen.add_topdeclaration(tcc.Declaration('#include <string.h>'));
      let A = ArrayType('char', 20);
      let S = tcc.c_struct('S', StructType({
        a: 'int8',
        b: 'int16',
        c: 'int32',
        d: 'int64',
        e: A
      }));
      let init_struct = tcc.c_function(S, 'init_struct', [],
      `
        char buf[20] = "1234567890123456789";
        struct S s;
        s.a = 1;
        s.b = 2;
        s.c = 3;
        s.d = 4;
        memcpy(&s.e, &buf, 20);
        return s;
      `
      );
      gen.add_declaration(S);
      gen.add_declaration(init_struct);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let result = init_struct();
      assert.equal(result.a, 1);
      assert.equal(result.b, 2);
      assert.equal(result.c, 3);
      assert.equal(result.d, 4);
      assert.equal(result.e.buffer.readCString(), '1234567890123456789');
    });
  });
  describe('array tests', function() {
    it('resolve and set array elements', function() {
      let state = tcc.DefaultTcc();
      state.setOptions('-Wall');
      state.compile('int test[5] = {0, 1, 2, 3, 4};');
      state.relocate();
      let A = ArrayType('int', 5);
      let a = state.resolveSymbol('test', A);
      assert.deepEqual(a.toArray(), [0, 1, 2, 3, 4]);
      a[0] = 10;
      a[1] = 11;
      a[2] = 12;
      a[3] = 13;
      a[4] = 14;
      a = state.resolveSymbol('test', A);
      assert.deepEqual(a.toArray(), [10, 11, 12, 13, 14]);
    });
    it('array in struct', function() {
      let state = tcc.DefaultTcc();
      state.setOptions('-Wall');
      let gen = tcc.InlineGenerator();
      let A = ArrayType('int', 3);
      let S = tcc.c_struct('S', StructType({a: A}));
      assert.equal(S.declaration.code(),
        'struct __attribute__((aligned(4))) S {\n  int (a[3]);\n};');
      gen.add_declaration(S);
      gen.add_declaration(tcc.Declaration('struct S s = {{1, 2, 3}};'));
      state.compile(gen.code());
      state.relocate();
      let s = state.resolveSymbol('s', S);
      assert.deepEqual(s.a.toArray(), [1, 2, 3]);
    });
    it('array pointer in struct', function() {
      let gen = tcc.InlineGenerator();
      let A = ArrayType('int', 3);
      let S = tcc.c_struct('S', StructType({a: ref.refType(A)}));
      gen.add_declaration(S);
      assert.equal(S.declaration.code(),
          'struct __attribute__((aligned(8))) S {\n  int ((*a)[3]);\n};');
    });
  });
  describe('wchar_t support (optional)', function() {
    let state;
    let gen;
    beforeEach(function(){
      state = tcc.DefaultTcc();
      state.setOptions('-Wall');
      gen = tcc.InlineGenerator();
    });
    it('wchar types in ref.types', function() {
      assert.equal(ref.types.wchar_t.name, 'wchar_t');
      assert.equal(ref.types.WCString.name, 'WCString');
      assert.equal(ref.coerceType('wstring'), ref.types.WCString);
    });
    it('WCString creation', function() {
      let ws = tcc.WCString('ümläüts with €');
      assert.equal(wchar_t.toString(ws), 'ümläüts with €\0');
    });
    it('get and set wchar_t symbol', function() {
      state.compile('#include <wchar.h>\nwchar_t w = L\'a\';');
      state.relocate();
      let w = state.resolveSymbol('w', 'wchar_t');
      assert.equal(w.deref(), 'a');
      state.setSymbol('w', ref.alloc('wchar_t', '€'));
      assert.equal(w.deref(), '€');
    });
    it('get wchar_t* symbol', function() {
      state.compile('#include <wchar.h>\nwchar_t w[] = L"wide chars!";');
      state.relocate();
      let w1 = state.resolveSymbol('w', 'WCString');
      assert.equal(wchar_t.toString(w1.reinterpretUntilZeros(wchar_t.size)), 'wide chars!');
      let w2 = state.resolveSymbol('w', 'wchar_t*');
      assert.equal(wchar_t.toString(w2.reinterpretUntilZeros(wchar_t.size)), 'wide chars!');
    });
    it('escape wchar literals in source', function() {
      state.compile('#include <wchar.h>\nwchar_t w[] = L"'+ tcc.escape_wchar('ümläüts€') + '";');
      state.relocate();
      let w1 = state.resolveSymbol('w', 'WCString');
      assert.equal(wchar_t.toString(w1.reinterpretUntilZeros(wchar_t.size)), 'ümläüts€');
      let w2 = state.resolveSymbol('w', 'wchar_t*');
      assert.equal(wchar_t.toString(w2.reinterpretUntilZeros(wchar_t.size)), 'ümläüts€');
    });
    it('wchar_t* as parameter', function() {
      gen.add_topdeclaration(tcc.Declaration('#include <wchar.h>'));
      let func = tcc.c_function('int', 'func', [['wchar_t*', 'ws']], 'return wcslen(ws);');
      gen.add_declaration(func);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      assert.equal(func(tcc.WCString('ümläüts€')), 8);
    });
    it('wchar_t* as return value', function() {
      gen.add_topdeclaration(tcc.Declaration('#include <wchar.h>'));
      let func = tcc.c_function('wchar_t*', 'func', [],
        `
        static wchar_t *ws = L"${tcc.escape_wchar('ümläüts€')}";
        return ws;
        `
      );
      gen.add_declaration(func);
      state.compile(gen.code());
      state.relocate();
      gen.bind_state(state);
      let result = func();
      assert.equal(wchar_t.toString(result.reinterpretUntilZeros(wchar_t.size)), 'ümläüts€');
    });
    it('wchar_t in struct', function() {
      let S = StructType({a: 'wchar_t', b: ArrayType('wchar_t', 5), c: ref.refType('wchar_t')});
      let Sc = tcc.c_struct('S', S);
        assert.equal(Sc.declaration.code(),
`struct __attribute__((aligned(8))) S {
  wchar_t a;
  wchar_t (b[5]);
  wchar_t (*c);
};`);
    });
    it('WCString & wstring', function() {
      // WCString gets typedef'd in loadBasicTypes
      gen.loadBasicTypes();
      gen.add_declaration(tcc.Declaration('WCString w = L"first";'));
      state.compile(gen.code());
      state.relocate();
      let w1 = state.resolveSymbol('w', 'wchar_t*');
      assert.equal(wchar_t.toString(w1.deref().reinterpretUntilZeros(wchar_t.size)), 'first');
      let w2 = state.resolveSymbol('w', 'wstring');
      assert.equal(w2.deref(), 'first');
      let w3 = state.resolveSymbol('w', 'WCString');
      assert.equal(w3.deref(), 'first');
    });
  });
  describe('satisfy coverage', function() {
    it('add illegal declaration', function() {
      let gen = tcc.InlineGenerator();
      assert.throws(() => { gen.add_declaration('illegal'); }, Error);
    });
    it('plain StructType should throw', function() {
      let T = StructType({a: 'int'});
      let S = tcc.c_struct('S', StructType({a: 'int', b: T}));
      assert.throws(() => { S.declaration.code(); }, Error);
    });
    it('multiple bind_state calls return same symbols map', function() {
      let gen = tcc.InlineGenerator();
      let state = tcc.DefaultTcc();
      state.setOptions('-Wall');
      let S = tcc.c_struct('S', StructType({a: 'int'}));
      gen.add_declaration(S);
      let add = tcc.c_function('int', 'add', [[S, 'a'], [S, 'b']], 'return a.a + b.a;');
      gen.add_declaration(add);
      state.compile(gen.code());
      state.relocate();
      let symbols1 = gen.bind_state(state);
      let symbols2 = gen.bind_state(state);
      assert.equal(symbols1, symbols2);
    });
    it('arrays are not allowed as return type', function() {
      assert.throws(() => { tcc.c_function(ArrayType('int'), 'foo', [], ''); }, Error);
    });
    it('plain structs are not allowed as return type', function() {
      assert.throws(() => { tcc.c_function(StructType(), 'foo', [], ''); }, Error);
    });
  });
});
