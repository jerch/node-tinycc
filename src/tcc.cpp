#include "nan.h"
#include "node.h"
#include "libtcc.h"

using namespace v8;

void bfree(char *data, void *hint) {
    // never free stuff from relocated TCCState code
}

struct Work {
    Nan::Persistent<v8::Function> cb;
    uv_work_t work;
    TCCState *state;
    uv_rwlock_t *lock;
    int result;
    const char *data;
};
void compile(uv_work_t* req);
void after_compile(uv_work_t* req, int status);


void compile(uv_work_t* req) {
    Work *w = static_cast<Work *>(req->data);
    uv_rwlock_wrlock(w->lock);
    w->result = tcc_compile_string(w->state, w->data);
    uv_rwlock_wrunlock(w->lock);
}

void after_compile(uv_work_s* req, int status) {
    Nan::HandleScope scope;
    Work *w = static_cast<Work *>(req->data);
    v8::Local<v8::Value> argv[] = {
        Nan::New<v8::Integer>(w->result),
        Nan::New<v8::Integer>(status),
    };
    v8::Local<v8::Function> cb = Nan::New<v8::Function>(w->cb);
    w->cb.Reset();
    delete [] w->data;
    delete w;
    Nan::Callback(cb).Call(Nan::GetCurrentContext()->Global(), 2, argv);
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
        Nan::SetPrototypeMethod(tpl, "compileAsync", CompileStringAsync);
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
        tcc_set_output_type(state, 1);

        /*
         * NOTE on OSX: dylib loading is not supported yet
         * any code with foreign libs will fail
         * we cant even load the clib (got loaded anyways, so symbols will work)
         */
        #if defined(__APPLE__)
        tcc_set_options(state, "-nostdlib");
        #endif

        uv_rwlock_init(&lock);
    }

    /*
     * destructor disabled for now:
     * We cant delete the compile state since we dont know
     * whether all JS objects pointing to this memory got cleaned up yet.
     * This will leak memory over time when compiling over and over!
     * Solution - avoid recompiling, instead compile once and reuse symbols.
     */
    ~TCC() {
    //    tcc_delete(state);
        uv_rwlock_destroy(&lock);
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
        uv_rwlock_wrlock(&obj->lock);
        tcc_set_lib_path(obj->state, *String::Utf8Value(info[0]->ToString()));
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(SetOptions) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        tcc_set_options(obj->state, *String::Utf8Value(info[0]->ToString()));
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(DefineSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        tcc_define_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString()),
            *String::Utf8Value(info[1]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(UndefineSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        tcc_undefine_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(AddIncludePath) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_add_include_path(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddLibrary) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_add_library(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddLibraryPath) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_add_library_path(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddFile) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_add_file(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(CompileString) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_compile_string(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(CompileStringAsync) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());

        // copy string over for consumption in thread
        int length = info[0]->ToString()->Utf8Length();
        char *p = new char[length+1];
        p[length] = '\0';
        memcpy(p, (char *) *String::Utf8Value(info[0]->ToString()), length);

        // create work item and run work threaded
        struct Work *w = new Work();
        w->cb.Reset(v8::Local<v8::Function>::Cast(info[1]));
        w->work.data = w;
        w->state = obj->state;
        w->lock = &obj->lock;
        w->data = p;
        uv_queue_work(uv_default_loop(), &w->work, compile, after_compile);
        info.GetReturnValue().SetUndefined();
    }
    static NAN_METHOD(Relocate) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_relocate(
            obj->state,
            TCC_RELOCATE_AUTO
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(AddSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_add_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString()),
            *String::Utf8Value(info[1]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }
    static NAN_METHOD(GetSymbol) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        void *res = tcc_get_symbol(
            obj->state,
            *String::Utf8Value(info[0]->ToString())
        );
        uv_rwlock_wrunlock(&obj->lock);
        if (!res) {
            return Nan::ThrowError("symbol error");
        }
        info.GetReturnValue().Set(
            Nan::NewBuffer((char*) res, sizeof(void *), bfree, NULL).ToLocalChecked());
    }
    static NAN_METHOD(Run) {
        TCC *obj = Nan::ObjectWrap::Unwrap<TCC>(info.Holder());
        uv_rwlock_wrlock(&obj->lock);
        int res = tcc_run(
            obj->state,
            info[0]->IntegerValue(),
            NULL
        );
        uv_rwlock_wrunlock(&obj->lock);
        info.GetReturnValue().Set(Nan::New<Number>(res));
    }

    TCCState *state = NULL;
    uv_rwlock_t lock;
};

NAN_MODULE_INIT(init) {
    Nan::Set(
        target,
        Nan::New<String>("TCC").ToLocalChecked(),
        Nan::GetFunction(TCC::init()).ToLocalChecked()
    );
}
NODE_MODULE(tcc, init)
