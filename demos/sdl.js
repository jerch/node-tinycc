/**
 * The demo illustrates the usage of a foreign library with TCC (requires SDL2).
 */

const C_CODE = `
#include <stdio.h>
#include <SDL2/SDL.h>

typedef void (*Callback)(int, int, int);
static Callback callback = NULL;
void set_callback(void (*cb)(int, int, int)) {
    callback = cb;
}

void run_sdl(int width, int height) {
    int i;
    SDL_Window* window = NULL;
    SDL_Surface* screenSurface = NULL;
    if(SDL_Init(SDL_INIT_VIDEO) < 0 ) {
        printf("SDL could not initialize! SDL_Error: %s\n", SDL_GetError());
        return;
    }
    window = SDL_CreateWindow("SDL Example",
                              SDL_WINDOWPOS_UNDEFINED,
                              SDL_WINDOWPOS_UNDEFINED,
                              width, height,
                              SDL_WINDOW_SHOWN);
    if(!window) {
        printf("Window could not be created! SDL_Error: %s\n", SDL_GetError());
        return;
    }
    screenSurface = SDL_GetWindowSurface(window);
    for (i=0; i<256; ++i) {
        SDL_FillRect(screenSurface, NULL,
                     SDL_MapRGB(screenSurface->format, i, i, i));
        SDL_UpdateWindowSurface(window);
        /* invoke javascript callback */
        if (callback)
            callback(i, i, i);
        SDL_Delay(5);
    }
    SDL_FreeSurface(screenSurface);
    SDL_DestroyWindow(window);
    SDL_Quit();
}
`;

const tcc = require('../index');

let state = tcc.DefaultTcc();

// link additional libraries
// depending on your system TCC might need further settings
// like additional linker paths to find the libraries
// here: take the SDL2 header and library from the
//       SDL2-win32 folder in Windows
if (process.platform === 'win32') {
    state.add_include_path('SDL2-win32\include');
    state.add_link_path('SDL2-win32');
    // load library by hand
    // this is needed for 2 reasons:
    // - TCC's add_library loads only the .def files in Windows
    //   and leaves the actual DLL loading to Windows
    // - SDL2.dll is not in the common search paths of Windows
    //   therefore the autoloading will fail
    sdl = CDLL('SDL2-win32\SDL2.dll');  // FIXME with ffi
}
state.addLibrary('SDL2');
state.compile(C_CODE);
state.relocate();

// resolve needed C symbols
let set_callback = state.getFunction('set_callback', 'void', ['void*']);
let run_sdl = state.getFunction('run_sdl', 'void', ['int', 'int']);

// register callback
set_callback(tcc.Callback('void', ['int', 'int', 'int'],
    (r, g, b) => { console.log(`color is rgb(${r}, ${g}, ${b})`); }));

// call the C function
run_sdl(640, 480);
