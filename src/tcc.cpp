#include "nan.h"
#include "node.h"
#include "libtcc.h"

using namespace v8;

void bfree(char *data, void *hint) {
    // never free stuff from relocated TCCState code
}

class TCC : public Nan::ObjectWrap {
public:
    static Local<FunctionTemplate> init() {
        Local<FunctionTemplate> tpl = Nan::New<FunctionTemplate>(New);
        tpl->SetClassName(Nan::New("TCC").ToLocalChecked());
        tpl->InstanceTemplate()->SetInternalFieldCount(1);

        // register JS prototype methods
        Nan::SetPrototypeMethod(tpl, "setLibPath", SetLibPath);
        Nan::SetPrototypeMethod(tpl, "setOptions", SetOptions);
        Nan::SetPrototypeMethod(tpl, "defineSymbol", DefineSymbol);
        Nan::SetPrototypeMethod(tpl, "undefineSymbol", UndefineSymbol);
        Nan::SetPrototypeMethod(tpl, "addIncludePath", AddIncludePath);
        Nan::SetPrototypeMethod(tpl, "addLibrary", AddLibrary);
        Nan::SetPrototypeMethod(tpl, "addLibraryPath", AddLibraryPath);
        Nan::SetPrototypeMethod(tpl, "addFile", AddFile);
        Nan::SetPrototypeMethod(tpl, "compileString", CompileString);
        Nan::SetPrototypeMethod(tpl, "compile", CompileString);
        Nan::SetPrototypeMethod(tpl, "relocate", Relocate);
        Nan::SetPrototypeMethod(tpl, "addSymbol", AddSymbol);
        Nan::SetPrototypeMethod(tpl, "getSymbol", GetSymbol);
        Nan::SetPrototypeMethod(tpl, "run", Run);

        tmpl().Reset(tpl);
        return tpl;
    }
    static Local<FunctionTemplate> ctorTemplate() { return Nan::New(tmpl()); }
    static bool IsInstance(Local<Value> v) { return ctorTemplate()->HasInstance(v); }

private:
    TCC() {
        state = tcc_new();
        tcc_set_output_type(state, 0);
    }
    ~TCC() {
        tcc_delete(state);
    }
    static Nan::Persistent<FunctionTemplate>& tmpl() {
        static Nan::Persistent<FunctionTemplate> my_template;
        return my_template;
    }

    // JS methods
    static NAN_METHOD(New) {
        if (info.IsConstructCall()) {
            TCC *obj = new TCC();
            obj->Wrap(info.This());
            info.GetReturnValue().Set(info.This());
        } else {
            int argc = info.Length();
            Local<v8::Value> *argv = new Local<v8::Value>[argc];
            for (int i=0; i<argc; ++i)
                argv[i] = info[i];
            Local<Function> ctor = Nan::GetFunction(Nan::New(tmpl())).ToLocalChecked();
            info.GetReturnValue().Set(Nan::NewInstance(ctor, argc, argv).ToLocalChecked());
            delete [] argv;
        }
    }
    static NAN_METHOD(SetLibPath) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        tcc_set_lib_path(obj->state, *String::Utf8Value(info[0]->ToString()));
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(SetOptions) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        tcc_set_options(obj->state, *String::Utf8Value(info[0]->ToString()));
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(DefineSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        tcc_define_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString()),
            *String::Utf8Value(info[1]->ToString())
        );
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(UndefineSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        tcc_undefine_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(AddIncludePath) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_add_include_path(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddLibrary) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_add_library(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddLibraryPath) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_add_library_path(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddFile) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_add_file(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(CompileString) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_compile_string(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(Relocate) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_relocate(
            obj->state,
            TCC_RELOCATE_AUTO
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_add_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString()),
            *String::Utf8Value(info[1]->ToString())
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(GetSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        void *res = tcc_get_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        if (!res) {
            return Nan::ThrowError("symbol error");
        }
        info.GetReturnValue().Set(
            Nan::NewBuffer((char*) res, sizeof(void *), bfree, NULL).ToLocalChecked());
    }
    static NAN_METHOD(Run) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        int res = tcc_run(
            obj->state,
            info[0]->IntegerValue(),
            NULL
        );
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }

    TCCState *state = NULL;
};

NAN_MODULE_INIT(init) {
    Nan::Set(
        target,
        Nan::New<String>("TCC").ToLocalChecked(),
        Nan::GetFunction(TCC::init()).ToLocalChecked()
    );
}
NODE_MODULE(tcc, init)
