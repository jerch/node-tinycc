const tcc = require('../index');
const ffi = require('ffi');
const ref = require('ref');
const StructType = require('ref-struct');
const ArrayType = require('ref-array');
const assert = require('assert');

describe('TCC tests', function() {
  describe('basic tests', function() {
    let state;
    beforeEach(function(){
      state = tcc.Tcc();
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
          ffi.Callback('int', ['int', 'int'], function(a, b) { return a+b; }));
      assert.equal(func(), 65);
    });
  });
  describe('inline code generator', function(){
    let state;
    let gen;
    beforeEach(function(){
      state = tcc.Tcc();
      gen = tcc.InlineGenerator();
    });
    it('add declaration', function(){
      let decl1 = tcc.Declaration('int test1 = 123;', 'int test1;');
      let decl2 = tcc.Declaration('float test2 = 1.23;', 'float test2;');
      gen.add_declaration(decl1);
      gen.add_declaration(decl2);
      gen.add_topdeclaration(tcc.Declaration('#include <stdio.h>'));
      let expected = '';
      expected += '/* top */\n#include <stdio.h>\n';
      expected += '\n/* forward */\nint test1;\nfloat test2;\n';
      expected += '\n/* code */\nint test1 = 123;\nfloat test2 = 1.23;\n';
      assert.equal(gen.code(), expected);
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
  describe('cdecl generation', function() {
      it('int a', function() {
        assert.equal(tcc._cdecl('a', 'int'), 'int a');
      });
      it('int *a', function() {
        assert.equal(tcc._cdecl('a', 'int*'), 'int (*a)');
      });
      it('int **a', function() {
        assert.equal(tcc._cdecl('a', 'int**'), 'int (*(*a))');
      });
      it('int a[]', function() {
        assert.equal(tcc._cdecl('a', ArrayType('int')), 'int (a[])');
      });
      it('int a[5]', function() {
        assert.equal(tcc._cdecl('a', ArrayType('int', 5)), 'int (a[5])');
      });
      it('int *a[]', function() {
        assert.equal(tcc._cdecl('a', ArrayType(ref.refType('int'))), 'int (*(a[]))');
      });
      it('int *a[5]', function() {
        assert.equal(tcc._cdecl('a', ArrayType(ref.refType('int'), 5)), 'int (*(a[5]))');
      });
      it('int (*a)[5]', function() {
        assert.equal(tcc._cdecl('a', ref.refType(ArrayType('int', 5))), 'int ((*a)[5])');
      });
      it('int a[][]', function() {
        assert.equal(tcc._cdecl('a', ArrayType(ArrayType('int'))), 'int ((a[])[])');
      });
      it('int a[2][5]', function() {
        assert.equal(tcc._cdecl('a', ArrayType(ArrayType('int', 5), 2)), 'int ((a[2])[5])');
      });
      it('int *a[2][5]', function() {
        assert.equal(tcc._cdecl('a', ArrayType(ArrayType(ref.refType('int'), 5), 2)),
          'int (*((a[2])[5]))');
      });
      it('struct T t', function() {
        assert.equal(tcc._cdecl('t', tcc.c_struct('T', StructType())), 'struct T t');
      });
      it('struct T *t', function() {
        assert.equal(tcc._cdecl('t', ref.refType(tcc.c_struct('T', StructType()))), 'struct T (*t)');
      });
      it('struct T t[]', function() {
        let A = ArrayType(tcc.c_struct('T', StructType({a: 'int'})));
        assert.equal(tcc._cdecl('t', A), 'struct T (t[])');
      });
      it('struct T t[5]', function() {
        let A = ArrayType(tcc.c_struct('T', StructType({a: 'int'})), 5);
        assert.equal(tcc._cdecl('t', A), 'struct T (t[5])');
      });
  });
  describe('struct tests', function() {
    let state;
    beforeEach(function(){
      state = tcc.Tcc();
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
    it('struct as parameter', function() {
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
    it('struct pointer as function parameter', function() {
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
    it('struct as function return value', function() {
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
    it('struct pointer as function return value', function() {
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
    it('alignment', function() {
      let gen = tcc.InlineGenerator();
      gen.add_topdeclaration(tcc.Declaration('#include <stdint.h>'));
      gen.add_topdeclaration(tcc.Declaration('#include <string.h>'));
      gen.add_topdeclaration(tcc.Declaration('typedef int8_t int8;'));
      gen.add_topdeclaration(tcc.Declaration('typedef int16_t int16;'));
      gen.add_topdeclaration(tcc.Declaration('typedef int32_t int32;'));
      gen.add_topdeclaration(tcc.Declaration('typedef int64_t int64;'));
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
      let state = tcc.Tcc();
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
      let state = tcc.Tcc();
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
    /* NOT WORKING - bug in ref-array?
    it('array pointer in struct', function() {
      let state = tcc.Tcc();
      let gen = tcc.InlineGenerator();
      let A = ArrayType('int');
      let S = tcc.c_struct('S', StructType({a: ref.refType(A)}));
    });
    */
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
      let state = tcc.Tcc();
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
