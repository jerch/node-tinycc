const Tcc = require('../index').Tcc;
const ffi = require('ffi');
const ref = require('ref');
const CFuncType = require('../index').CFuncType;
const InlineGenerator = require('../index').InlineGenerator;
const Declaration = require('../index').Declaration;
const c_function = require('../index').c_function;
const c_callable = require('../index').c_callable;
const assert = require('assert');

describe('basic tests', function() {
  let state;
  beforeEach(function(){
    state = Tcc();
    state.setLibPath('./posix/lib/tcc/');
    state.addIncludePath('./posix/lib/tcc/include/');
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
    let func = state.resolveSymbol('test', CFuncType('int', ['int']));
    assert.equal(func(1), 2);
  });
  it('resolve & run JS callback', function(){
    let code = '';
    code += '#include <stdio.h>\n';
    code += 'int (*callback)(int, int) = NULL;';
    code += 'int use_callback() {return (callback) ? callback(23, 42) : -1;}';
    state.compile(code);
    state.relocate();
    let func = state.resolveSymbol('use_callback', CFuncType('int', []));
    assert.equal(func(), -1);
    state.set_function(
        'callback',
        ffi.Callback('int', ['int', 'int'], function(a, b) { return a+b; }));
    assert.equal(func(), 65);
  });
});
describe('inline code generator', function(){
  let state;
  let gen;
  beforeEach(function(){
    state = Tcc();
    state.setLibPath('./posix/lib/tcc/');
    state.addIncludePath('./posix/include/');
    gen = InlineGenerator();
  });
  it('add declaration', function(){
    let decl1 = Declaration('int test1 = 123;', 'int test1;');
    let decl2 = Declaration('float test2 = 1.23;', 'float test2;');
    gen.add_declaration(decl1);
    gen.add_declaration(decl2);
    gen.add_topdeclaration(new Declaration('#include <stdio.h>'));
    let expected = '';
    expected += '/* top */\n#include <stdio.h>\n';
    expected += '\n/* forward */\nint test1;\nfloat test2;\n';
    expected += '\n/* code */\nint test1 = 123;\nfloat test2 = 1.23;\n';
    assert.equal(gen.code(), expected);
  });
  it('resolve symbol from declaration', function(){
    let decl = Declaration(
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
    let fibonacci = c_function('int', 'fibonacci', [['int', 'a']],
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
    let fromJS = c_callable('int', 'add', ['int', 'int'], add);
    gen.add_declaration(fromJS);
    let use = c_function('int', 'use', [['int', 'a'], ['int', 'b']], 'return add(a, b);');
    gen.add_declaration(use);
    state.compile(gen.code());
    state.relocate();
    gen.bind_state(state);
    assert.equal(use(23, 42), 65);
  });
});