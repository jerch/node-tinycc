var Tcc = require('../index').Tcc;
var ffi = require('ffi');
var ref = require('ref');
var CFuncType = require('../index').CFuncType;
var InlineGenerator = require('../index').InlineGenerator;
var Declaration = require('../index').Declaration;
var c_function = require('../index').c_function;
var c_callable = require('../index').c_callable;
var assert = require('assert');

describe('basic tests', function() {
  var state;
  beforeEach(function(){
    state = Tcc();
  });
  afterEach(function(){
    state.lib.tcc_delete(state.ctx);
  });
  it('compile & run', function(){
    state.compile('int main(int argc, char *argv[]) {return 123;}');
    assert.equal(state.run(0, null), 123);
  });
  it('resolve C symbol', function(){
    state.compile('int x = 123;');
    state.relocate();
    var x = state.resolve_symbol('x', 'int');
    assert.equal(x.deref(), 123);
  });
  it('set C symbol value', function(){
    state.compile('int x = 123;');
    state.relocate();
    state.set_symbol('x', ref.alloc('int', 999));
    var x = state.resolve_symbol('x', 'int');
    assert.equal(x.deref(), 999);
  });
  it('change C symbol value', function(){
    state.compile('int x = 123;');
    state.relocate();
    var x = state.resolve_symbol('x', 'int');
    ref.set(x, 0, 999);
    var x2 = state.resolve_symbol('x', 'int');
    assert.equal(x2.deref(), 999);
  });
  it('resolve & run C function', function(){
    state.compile('int test(int a){return a+1;}');
    state.relocate();
    var func = state.resolve_symbol('test', CFuncType('int', ['int']));
    assert.equal(func(1), 2);
  });
  it('resolve & run JS callback', function(){
    state.compile('#include <stdio.h>\nint (*callback)(int, int) = NULL;int use_callback() {return (callback) ? callback(23, 42) : -1;}');
    state.relocate();
    var func = state.resolve_symbol('use_callback', CFuncType('int', []));
    assert.equal(func(), -1);
    state.set_function('callback', ffi.Callback('int', ['int', 'int'], function(a, b) { return a+b; }));
    assert.equal(func(), 65);
  });
});
describe('inline code generator', function(){
  var state;
  var gen;
  beforeEach(function(){
    state = Tcc();
    gen = InlineGenerator();
  });
  afterEach(function(){
    state.lib.tcc_delete(state.ctx);
  });
  it('add declaration', function(){
    var decl1 = Declaration('int test1 = 123;', 'int test1;');
    var decl2 = Declaration('float test2 = 1.23;', 'float test2;');
    gen.add_declaration(decl1);
    gen.add_declaration(decl2);
    gen.add_topdeclaration(new Declaration('#include <stdio.h>'));
    var expected = '';
    expected += '/* top */\n#include <stdio.h>\n';
    expected += '\n/* forward */\nint test1;\nfloat test2;\n';
    expected += '\n/* code */\nint test1 = 123;\nfloat test2 = 1.23;\n';
    assert.equal(gen.code(), expected);
  });
  it('resolve symbol from declaration', function(){
    var decl = Declaration('int test1 = 123;\ndouble test2 = 1.23;', '', [['int', 'test1'], ['double', 'test2']]);
    gen.add_declaration(decl);
    state.compile(gen.code());
    state.relocate();
    var symbols = gen.bind_state(state);
    assert.equal(symbols.test1.deref(), 123);
    assert.equal(symbols.test2.deref(), 1.23);
  });
  it('c_function generation & invocation', function() {
    var fibonacci = c_function('int', 'fibonacci', [['int', 'a']],
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
    var add = function(a, b) { return a+b; };
    var fromJS = c_callable('int', 'add', ['int', 'int'], add);
    gen.add_declaration(fromJS);
    var use = c_function('int', 'use', [['int', 'a'], ['int', 'b']], 'return add(a, b);');
    gen.add_declaration(use);
    state.compile(gen.code());
    state.relocate();
    gen.bind_state(state);
    assert.equal(use(23, 42), 65);
  });
});